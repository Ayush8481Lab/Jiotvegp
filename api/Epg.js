// api/epg.js  —  Node.js runtime (NOT Edge)
// Uses curl-cffi-node to impersonate Chrome TLS/JA3 for tvwish (Cloudflare bypass)

import { Session } from 'curl-cffi-node';

export const config = { maxDuration: 30 };

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const TVWISH_DAYS_AHEAD = 4;
const MAX_PROGRAM_DURATION_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CHANNELS = [
  { id: 'DDF001',  name: 'Goldmines',           type: 'intv',   url: 'https://intvschedule.com/channel/goldmines/index.txt' },
  { id: 'DDF002',  name: 'Goldmines Movies',    type: 'intv',   url: 'https://intvschedule.com/channel/goldmines-movies/index.txt' },
  { id: 'DDF003',  name: 'Goldmines Bollywood', type: 'intv',   url: 'https://intvschedule.com/channel/goldmines-bollywood/index.txt' },
  { id: 'DDF020',  name: 'The Q',               type: 'tvwish', channelId: 723 },
  { id: '9487064', name: 'Fakt Marathi',        type: 'intv',   url: 'https://intvschedule.com/channel/fakt-marathi/index.txt' },
];

/* ---------------- helpers ---------------- */
function xmlEscape(v) {
  return v == null ? '' : String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fmtXmlDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
         p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + ' +0000';
}

/* ---------------- intvschedule RSC parser ---------------- */
function extractJsonAfterKey(text, key) {
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*\\{');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
        }
      }
    }
  }
  return null;
}

function extractScheduleArray(text) {
  const idx = text.indexOf('"schedule"');
  if (idx === -1) return null;
  const bracket = text.indexOf('[', idx);
  if (bracket === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = bracket; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          try {
            const arr = JSON.parse(text.slice(bracket, i + 1));
            if (Array.isArray(arr) && arr[0]?.keyDate) return arr;
          } catch { return null; }
        }
      }
    }
  }
  return null;
}

function extractIntvSchedule(text) {
  const d = extractJsonAfterKey(text, '"initialScheduleData"');
  if (d?.schedule) return d.schedule;
  return extractScheduleArray(text);
}

function istToUtc(dateStr, hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - IST_OFFSET_MS);
}

async function fetchIntvChannel(channel) {
  const res = await fetch(channel.url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://intvschedule.com/',
      Accept: 'text/plain,text/html,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const schedule = extractIntvSchedule(await res.text());
  if (!schedule) throw new Error('No schedule');
  const out = [];
  for (const day of schedule) {
    if (!day?.keyDate || !Array.isArray(day.programs)) continue;
    for (const p of day.programs) {
      const start = istToUtc(day.keyDate, p.s || '00:00');
      let end = istToUtc(day.keyDate, p.e || p.s || '00:00');
      if (end <= start) end = new Date(end.getTime() + 24 * 3600e3);
      if (end - start > MAX_PROGRAM_DURATION_MS)
        end = new Date(start.getTime() + MAX_PROGRAM_DURATION_MS);
      out.push({
        title: p.n || p.spn || 'Unknown',
        start, end,
        desc: p.desc || p.sp || '',
        category: p.d || '',
        language: p.lang || '',
      });
    }
  }
  const seen = new Set();
  return out
    .filter((p) => {
      const k = p.title + '|' + p.start.getTime();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

/* ---------------- tvwish via curl-cffi-node ---------------- */
// One Chrome-impersonating session reused for all tvwish requests.
const tvwishSession = new Session({
  impersonate: 'chrome116',   // full Chrome TLS/JA3/HTTP2 fingerprint
  timeout: 20,
  followRedirects: true,
});

async function fetchTvwishDay(channelId, date, debug = false) {
  const dt = date.toISOString();
  const url = `https://www.tvwish.com/Api/ChannelScheduleApi/${channelId}/DayJson?dt=${dt}`;

  try {
    const response = await tvwishSession.get(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `https://www.tvwish.com/Channel/${channelId}`,
        Origin: 'https://www.tvwish.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      },
    });

    if (response.status === 404) return [];
    if (response.status !== 200) {
      if (debug) console.error(`[tvwish] ${dt} HTTP ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = response.json();
    if (Array.isArray(data.programs)) {
      if (debug) console.error(`[tvwish] ${dt} OK: ${data.programs.length}`);
      return data.programs;
    }

    // Fallback if the body is wrapped somehow
    const text = response.text();
    const m = text.match(/\{[\s\S]*"programs"[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed.programs)) return parsed.programs;
    }

    if (debug) console.error(`[tvwish] ${dt} bad body:`, text.slice(0, 200));
    throw new Error('invalid body');
  } catch (err) {
    if (debug) console.error(`[tvwish] ${dt} failed: ${err.message}`);
    throw err;
  }
}

async function fetchTvwishChannel(channel, debug = false) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const raw = [];
  for (let i = 0; i <= TVWISH_DAYS_AHEAD; i++) {
    const date = new Date(today.getTime() + i * 86400000);
    try {
      const progs = await fetchTvwishDay(channel.channelId, date, debug);
      if (progs.length) raw.push(...progs);
    } catch (e) {
      if (debug) console.error(`[tvwish] day ${i} skipped: ${e.message}`);
    }
    // small pause between days to be polite
    if (i < TVWISH_DAYS_AHEAD) await new Promise(r => setTimeout(r, 300));
  }

  raw.sort((a, b) => new Date(a.sdtu) - new Date(b.sdtu));

  const seen = new Set();
  const uniq = [];
  for (const p of raw) {
    const k = `${p.pi || p.pn || ''}|${p.sdtu}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }

  const out = [];
  for (let i = 0; i < uniq.length; i++) {
    const p = uniq[i];
    const start = new Date(p.sdtu);
    let end = i + 1 < uniq.length
      ? new Date(uniq[i + 1].sdtu)
      : new Date(start.getTime() + 30 * 60 * 1000);
    if (end <= start) end = new Date(start.getTime() + 30 * 60 * 1000);
    if (end - start > MAX_PROGRAM_DURATION_MS)
      end = new Date(start.getTime() + MAX_PROGRAM_DURATION_MS);
    out.push({
      title: p.pn || p.spn || 'Unknown',
      start, end,
      desc: p.sp || p.ed || '',
      category: p.genres?.[0]?.name || '',
      language: '',
    });
  }
  return out;
}

/* ---------------- Vercel handler ---------------- */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  const url = new URL(req.url, 'http://x');
  const debug = url.searchParams.get('debug');

  if (debug === 'tvwish') {
    const ch = CHANNELS.find((c) => c.type === 'tvwish');
    let full = [];
    let error = null;
    try {
      full = await fetchTvwishChannel(ch, true);
    } catch (e) {
      error = e.message;
    }
    return res.status(200).json({
      channel: ch.name,
      channelId: ch.channelId,
      totalPrograms: full.length,
      firstThree: full.slice(0, 3),
      error,
    });
  }

  try {
    const results = await Promise.allSettled(
      CHANNELS.map(async (channel) => {
        let programmes = [];
        try {
          if (channel.type === 'intv')   programmes = await fetchIntvChannel(channel);
          if (channel.type === 'tvwish') programmes = await fetchTvwishChannel(channel, !!debug);
        } catch (e) {
          console.error(`[${channel.name}] ${e.message}`);
        }
        return { channel, programmes };
      })
    );
    const data = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
    xml += '<tv generator-info-name="INTV Schedule EPG" generator-info-url="https://intvschedule.com/">\n';

    for (const { channel } of data) {
      xml += `  <channel id="${xmlEscape(channel.id)}">\n`;
      xml += `    <display-name>${xmlEscape(channel.name)}</display-name>\n`;
      xml += `  </channel>\n`;
    }

    for (const { channel, programmes } of data) {
      for (const p of programmes) {
        xml += `  <programme start="${fmtXmlDate(p.start)}" stop="${fmtXmlDate(p.end)}" channel="${xmlEscape(channel.id)}">\n`;
        xml += `    <title lang="en">${xmlEscape(p.title)}</title>\n`;
        if (p.desc)     xml += `    <desc lang="en">${xmlEscape(p.desc)}</desc>\n`;
        if (p.category) xml += `    <category lang="en">${xmlEscape(p.category)}</category>\n`;
        if (p.language) xml += `    <language>${xmlEscape(p.language)}</language>\n`;
        xml += `  </programme>\n`;
      }
    }
    xml += '</tv>\n';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
    return res.status(200).send(xml);
  } catch (err) {
    console.error('EPG fatal:', err);
    return res.status(500).send(`Internal Server Error: ${err.message}`);
  }
                                     }
