// api/epg.js
// Vercel serverless function that outputs XMLTV EPG for TiviMate.
// - intvschedule.com  -> RSC flight payload parsed directly
// - tvwish.com        -> routed through hello-amh.pages.dev proxy (CF bypass)

export const config = {
  maxDuration: 60,
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const TVWISH_DAYS_AHEAD = 4;
const MAX_PROGRAM_DURATION_MS = 6 * 60 * 60 * 1000;

const TVWISH_PROXY_BASE = 'https://tv.wapgotube.workers.dev/proxy/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ */
/* Channel registry                                                   */
/* ------------------------------------------------------------------ */
const CHANNELS = [
  { id: 'DDF001',  name: 'Goldmines',           type: 'intv',   url: 'https://intvschedule.com/channel/goldmines/index.txt' },
  { id: 'DDF002',  name: 'Goldmines Movies',    type: 'intv',   url: 'https://intvschedule.com/channel/goldmines-movies/index.txt' },
  { id: 'DDF003',  name: 'Goldmines Bollywood', type: 'intv',   url: 'https://intvschedule.com/channel/goldmines-bollywood/index.txt' },
  { id: 'DDF020',  name: 'The Q',               type: 'tvwish', channelId: 723 },
  { id: '9487064', name: 'Fakt Marathi',        type: 'intv',   url: 'https://intvschedule.com/channel/fakt-marathi/index.txt' },
];

/* ------------------------------------------------------------------ */
/* XML helpers                                                        */
/* ------------------------------------------------------------------ */
function xmlEscape(v) {
  return v == null
    ? ''
    : String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function fmtXmlDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    ' +0000'
  );
}

/* ------------------------------------------------------------------ */
/* Fetch helper                                                       */
/* ------------------------------------------------------------------ */
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* intvschedule.com (unchanged, working)                              */
/* ------------------------------------------------------------------ */
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
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
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
          } catch {
            return null;
          }
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
  const res = await fetchWithTimeout(channel.url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://intvschedule.com/',
      Accept: 'text/plain,text/html,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${channel.url}`);

  const schedule = extractIntvSchedule(await res.text());
  if (!schedule) throw new Error(`No schedule for ${channel.name}`);

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
        start,
        end,
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

/* ------------------------------------------------------------------ */
/* tvwish via proxy                                                   */
/* ------------------------------------------------------------------ */
async function fetchTvwishDay(channelId, date, debug = false) {
  const dt = date.toISOString();
  const target = `https://www.tvwish.com/Api/ChannelScheduleApi/${channelId}/DayJson?dt=${dt}`;
  const proxyUrl = TVWISH_PROXY_BASE + encodeURIComponent(target);

  const res = await fetchWithTimeout(
    proxyUrl,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
    25000
  );

  if (!res.ok) {
    if (debug)
      console.error(`[tvwish ${channelId}] proxy HTTP ${res.status} for ${dt}`);
    if (res.status === 404) return [];
    throw new Error(`Proxy HTTP ${res.status} for ${dt}`);
  }

  const text = await res.text();

  // 1) Direct JSON
  try {
    const data = JSON.parse(text);
    return Array.isArray(data.programs) ? data.programs : [];
  } catch (_) {}

  // 2) Extract JSON object from wrapped/markdown response
  const m = text.match(/\{[\s\S]*"programs"[\s\S]*\}/);
  if (m) {
    try {
      const data = JSON.parse(m[0]);
      if (Array.isArray(data.programs)) return data.programs;
    } catch (_) {}
  }

  if (debug) {
    console.error(
      `[tvwish ${channelId}] unexpected body for ${dt}:`,
      text.slice(0, 300)
    );
  }
  throw new Error(`Invalid JSON body from proxy for ${dt}`);
}

async function fetchTvwishChannel(channel, debug = false) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i <= TVWISH_DAYS_AHEAD; i++) {
    days.push(new Date(today.getTime() + i * 86400000));
  }

  const results = await Promise.allSettled(
    days.map((d) => fetchTvwishDay(channel.channelId, d, debug))
  );

  const raw = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length) {
      raw.push(...r.value);
    } else if (r.status === 'rejected' && debug) {
      console.error(`[tvwish ${channel.channelId}] day failed:`, r.reason?.message);
    }
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
      start,
      end,
      desc: p.sp || p.ed || '',
      category: p.genres?.[0]?.name || '',
      language: '',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Handler                                                            */
/* ------------------------------------------------------------------ */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  const u = new URL(req.url, 'http://x');
  const debug = u.searchParams.get('debug');

  /* ---- Debug: check tvwish proxy health ------------------------- */
  if (debug === 'tvwish') {
    const ch = CHANNELS.find((c) => c.type === 'tvwish');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dt = today.toISOString();
    const target = `https://www.tvwish.com/Api/ChannelScheduleApi/${ch.channelId}/DayJson?dt=${dt}`;
    const proxyUrl = TVWISH_PROXY_BASE + encodeURIComponent(target);

    let proxyStatus = 0;
    let preview = '';
    let bodyLen = 0;
    let parsedCount = 0;
    let error = null;

    try {
      const r = await fetchWithTimeout(
        proxyUrl,
        {
          headers: {
            'User-Agent': UA,
            Accept: 'application/json, text/plain, */*',
          },
        },
        25000
      );
      proxyStatus = r.status;
      const body = await r.text();
      bodyLen = body.length;
      preview = body.slice(0, 500);
      try {
        const j = JSON.parse(body);
        if (Array.isArray(j.programs)) parsedCount = j.programs.length;
      } catch (_) {}
    } catch (e) {
      error = e.message;
    }

    let fullPrograms = 0;
    let fullError = null;
    try {
      const full = await fetchTvwishChannel(ch, true);
      fullPrograms = full.length;
    } catch (e) {
      fullError = e.message;
    }

    return res.status(200).json({
      channel: ch.name,
      channelId: ch.channelId,
      proxyUrl,
      proxyStatus,
      bodyLen,
      preview,
      parsedCount,
      fullPrograms,
      error,
      fullError,
    });
  }

  /* ---- Normal XMLTV output -------------------------------------- */
  try {
    const results = await Promise.allSettled(
      CHANNELS.map(async (channel) => {
        let programmes = [];
        try {
          if (channel.type === 'intv') programmes = await fetchIntvChannel(channel);
          if (channel.type === 'tvwish') programmes = await fetchTvwishChannel(channel, !!debug);
        } catch (e) {
          console.error(`[${channel.name}] ${e.message}`);
        }
        return { channel, programmes };
      })
    );
    const data = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
    xml += '<tv generator-info-name="INTV Schedule EPG" generator-info-url="https://intvschedule.com/">\n';

    for (const { channel } of data) {
      xml += `  <channel id="${xmlEscape(channel.id)}">\n`;
      xml += `    <display-name>${xmlEscape(channel.name)}</display-name>\n`;
      xml += `  </channel>\n`;
    }

    for (const { channel, programmes } of data) {
      for (const p of programmes) {
        xml +=
          `  <programme start="${fmtXmlDate(p.start)}" stop="${fmtXmlDate(p.end)}" ` +
          `channel="${xmlEscape(channel.id)}">\n`;
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
