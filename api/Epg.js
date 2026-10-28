// api/epg.js
// Vercel serverless function that outputs XMLTV EPG for TiviMate.
// Sources:
//   - intvschedule.com  (RSC flight payload -> initialScheduleData.schedule)
//   - tvwish.com        (JSON API for The Q)

export const config = {
  maxDuration: 60, // seconds (Node runtime)
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;       // India Standard Time = UTC+5:30
const TVWISH_DAYS_AHEAD = 4;                      // fetch today + 4 days for The Q
const MAX_PROGRAM_DURATION_MS = 6 * 60 * 60 * 1000; // safety cap (6h)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* -------------------------------------------------------------------------- */
/* Channel registry                                                           */
/* -------------------------------------------------------------------------- */

const CHANNELS = [
  {
    id: 'DDF001',
    name: 'Goldmines',
    type: 'intv',
    url: 'https://intvschedule.com/channel/goldmines/index.txt',
  },
  {
    id: 'DDF002',
    name: 'Goldmines Movies',
    type: 'intv',
    url: 'https://intvschedule.com/channel/goldmines-movies/index.txt',
  },
  {
    id: 'DDF003',
    name: 'Goldmines Bollywood',
    type: 'intv',
    url: 'https://intvschedule.com/channel/goldmines-bollywood/index.txt',
  },
  {
    id: 'DDF020',
    name: 'The Q',
    type: 'tvwish',
    channelId: 723,
  },
  {
    id: '9487064',
    name: 'Fakt Marathi',
    type: 'intv',
    url: 'https://intvschedule.com/channel/fakt-marathi/index.txt',
  },
];

/* -------------------------------------------------------------------------- */
/* XML helpers                                                                */
/* -------------------------------------------------------------------------- */

function xmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtXmlDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds()) +
    ' +0000'
  );
}

/* -------------------------------------------------------------------------- */
/* RSC flight payload extraction                                              */
/* -------------------------------------------------------------------------- */

/**
 * Finds  "key":{ ... }  in a text blob, brace-matches the object, and
 * returns the parsed JSON. Handles quoted strings, escapes, and nesting.
 */
function extractJsonAfterKey(text, key) {
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*\\{');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length - 1; // index of '{'

  let depth = 0;
  let inStr = false;
  let esc = false;

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

/** Fallback: find a standalone `"schedule":[...]` array of day objects. */
function extractScheduleArray(text) {
  const idx = text.indexOf('"schedule"');
  if (idx === -1) return null;

  const bracket = text.indexOf('[', idx);
  if (bracket === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

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
            if (Array.isArray(arr) && arr[0] && arr[0].keyDate) return arr;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** Returns the `schedule` array from an intvschedule flight payload. */
function extractIntvSchedule(text) {
  const data = extractJsonAfterKey(text, '"initialScheduleData"');
  if (data && Array.isArray(data.schedule)) return data.schedule;
  return extractScheduleArray(text);
}

/* -------------------------------------------------------------------------- */
/* Time conversion                                                            */
/* -------------------------------------------------------------------------- */

/** Convert an IST "YYYY-MM-DD" + "HH:MM" pair to a UTC Date. */
function istToUtc(dateStr, hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - IST_OFFSET_MS);
}

/* -------------------------------------------------------------------------- */
/* Fetch helper                                                               */
/* -------------------------------------------------------------------------- */

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* intvschedule.com                                                           */
/* -------------------------------------------------------------------------- */

async function fetchIntvChannel(channel) {
  const res = await fetchWithTimeout(channel.url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://intvschedule.com/',
      Accept:
        'text/plain,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${channel.url}`);

  const text = await res.text();
  const schedule = extractIntvSchedule(text);
  if (!schedule) {
    throw new Error(`No schedule data found for ${channel.name}`);
  }

  const programmes = [];

  for (const day of schedule) {
    if (!day || !day.keyDate || !Array.isArray(day.programs)) continue;

    for (const p of day.programs) {
      const title = p.n || p.spn || 'Unknown';
      const sHHMM = p.s || '00:00';
      const eHHMM = p.e || sHHMM;

      const start = istToUtc(day.keyDate, sHHMM);
      let end = istToUtc(day.keyDate, eHHMM);

      // Program crosses midnight (e.g. 23:05 → 01:39)
      if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);

      // Safety cap
      if (end - start > MAX_PROGRAM_DURATION_MS) {
        end = new Date(start.getTime() + MAX_PROGRAM_DURATION_MS);
      }

      programmes.push({
        title,
        start,
        end,
        desc: p.desc || p.sp || '',
        category: p.d || '',
        language: p.lang || '',
      });
    }
  }

  // Dedupe (title + start) and sort
  const seen = new Set();
  return programmes
    .filter((p) => {
      const k = `${p.title}|${p.start.getTime()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

/* -------------------------------------------------------------------------- */
/* tvwish.com                                                                 */
/* -------------------------------------------------------------------------- */

async function fetchTvwishDay(channelId, date) {
  // date is a Date at 00:00:00.000 UTC → e.g. "2026-10-28T00:00:00.000Z"
  const dt = date.toISOString();
  const url =
    `https://www.tvwish.com/Api/ChannelScheduleApi/${channelId}/DayJson` +
    `?dt=${encodeURIComponent(dt)}`;

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.tvwish.com/',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
    15000
  );

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const data = await res.json();
  return Array.isArray(data.programs) ? data.programs : [];
}

async function fetchTvwishChannel(channel) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i <= TVWISH_DAYS_AHEAD; i++) {
    days.push(new Date(today.getTime() + i * 86400000));
  }

  const results = await Promise.allSettled(
    days.map((d) => fetchTvwishDay(channel.channelId, d))
  );

  const raw = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      raw.push(...r.value);
    }
  }

  // Sort by start datetime
  raw.sort((a, b) => new Date(a.sdtu) - new Date(b.sdtu));

  // Dedupe by program-id + start
  const seen = new Set();
  const unique = [];
  for (const p of raw) {
    const key = `${p.pi || p.pn || ''}|${p.sdtu}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  const programmes = [];
  for (let i = 0; i < unique.length; i++) {
    const p = unique[i];
    const start = new Date(p.sdtu);

    let end;
    if (i + 1 < unique.length) {
      end = new Date(unique[i + 1].sdtu);
    } else {
      end = new Date(start.getTime() + 30 * 60 * 1000); // +30 min fallback
    }

    if (end <= start) end = new Date(start.getTime() + 30 * 60 * 1000);
    if (end - start > MAX_PROGRAM_DURATION_MS) {
      end = new Date(start.getTime() + MAX_PROGRAM_DURATION_MS);
    }

    const genre =
      p.genres && p.genres[0] && p.genres[0].name ? p.genres[0].name : '';

    programmes.push({
      title: p.pn || p.spn || 'Unknown',
      start,
      end,
      desc: p.sp || p.ed || '',
      category: genre,
      language: '',
    });
  }

  return programmes;
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const results = await Promise.allSettled(
      CHANNELS.map(async (channel) => {
        let programmes = [];
        try {
          if (channel.type === 'intv') {
            programmes = await fetchIntvChannel(channel);
          } else if (channel.type === 'tvwish') {
            programmes = await fetchTvwishChannel(channel);
          }
        } catch (err) {
          console.error(`[${channel.name}] ${err.message}`);
        }
        return { channel, programmes };
      })
    );

    const data = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    /* ---------------- Build XMLTV ---------------- */

    let xml = '';
    xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
    xml +=
      '<tv generator-info-name="INTV Schedule EPG" ' +
      'generator-info-url="https://intvschedule.com/">\n';

    // <channel> elements
    for (const { channel } of data) {
      xml += `  <channel id="${xmlEscape(channel.id)}">\n`;
      xml += `    <display-name>${xmlEscape(channel.name)}</display-name>\n`;
      xml += `  </channel>\n`;
    }

    // <programme> elements
    for (const { channel, programmes } of data) {
      for (const p of programmes) {
        xml +=
          `  <programme start="${fmtXmlDate(p.start)}" ` +
          `stop="${fmtXmlDate(p.end)}" ` +
          `channel="${xmlEscape(channel.id)}">\n`;
        xml += `    <title lang="en">${xmlEscape(p.title)}</title>\n`;
        if (p.desc) {
          xml += `    <desc lang="en">${xmlEscape(p.desc)}</desc>\n`;
        }
        if (p.category) {
          xml += `    <category lang="en">${xmlEscape(p.category)}</category>\n`;
        }
        if (p.language) {
          xml += `    <language>${xmlEscape(p.language)}</language>\n`;
        }
        xml += `  </programme>\n`;
      }
    }

    xml += '</tv>\n';

    /* ---------------- Respond ---------------- */

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=1800, stale-while-revalidate=600'
    );
    res.status(200).send(xml);
  } catch (err) {
    console.error('EPG fatal error:', err);
    res.status(500).send(`Internal Server Error: ${err.message}`);
  }
}
