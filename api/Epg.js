// api/epg.js
// Vercel serverless function that outputs XMLTV EPG for TiviMate.
// Sources:
//   - intvschedule.com   (RSC flight payload -> initialScheduleData.schedule)
//   - freelivetv.org     (server-rendered HTML embed for The Q)

export const config = {
  maxDuration: 60, // seconds (Node runtime)
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;        // IST = UTC+5:30
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
    type: 'freelivetv',
    url: 'https://www.freelivetv.org/?ms_epg_embed=1&channel=theq-in',
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
/* Generic HTML helpers                                                       */
/* -------------------------------------------------------------------------- */

function stripTags(s) {
  return s.replace(/<[^>]*>/g, ' ');
}

function decodeHtmlEntities(s) {
  const map = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    mdash: '—',
    ndash: '–',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+);/gi, (_, name) => map[name.toLowerCase()] ?? `&${name};`);
}

/* -------------------------------------------------------------------------- */
/* RSC flight payload extraction (intvschedule)                               */
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

/** Convert { year, month (0-indexed), day } + h:m (IST) to a UTC Date. */
function istPartsToUtc({ year, month, day }, h, m) {
  return new Date(Date.UTC(year, month, day, h, m) - IST_OFFSET_MS);
}

/** Parse "hh:mm am - hh:mm pm" → { startH, startM, endH, endM } (24h). */
function parseTimeRange(text) {
  const m = text.match(
    /(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s*[-–]\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])/
  );
  if (!m) return null;
  const to24 = (h, ap) => {
    h = parseInt(h, 10);
    const isPm = /pm/i.test(ap);
    if (isPm) return h === 12 ? 12 : h + 12;
    return h === 12 ? 0 : h;
  };
  return {
    startH: to24(m[1], m[3]),
    startM: parseInt(m[2], 10),
    endH: to24(m[4], m[6]),
    endM: parseInt(m[5], 10),
  };
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
/* freelivetv.org                                                             */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

async function fetchFreelivetvChannel(channel) {
  const res = await fetchWithTimeout(
    channel.url,
    {
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.freelivetv.org/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
    20000
  );

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${channel.url}`);

  const html = await res.text();

  // 1. Try to read the date from the page title: "(28th October 2026)"
  let baseDate = null;
  const dm = html.match(/\((\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})\)/);
  if (dm) {
    const monthIdx = MONTH_NAMES.indexOf(dm[2].toLowerCase());
    if (monthIdx !== -1) {
      baseDate = { year: +dm[3], month: monthIdx, day: +dm[1] };
    }
  }
  if (!baseDate) {
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    baseDate = {
      year: nowIst.getUTCFullYear(),
      month: nowIst.getUTCMonth(),
      day: nowIst.getUTCDate(),
    };
  }

  // 2. Extract each <tr> that has a .time and .info cell
  const rowRe =
    /<tr[^>]*>\s*<td[^>]*class="[^"]*\btime\b[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*\binfo\b[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  const programmes = [];
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const timeText = decodeHtmlEntities(stripTags(m[1])).trim();
    const title = decodeHtmlEntities(stripTags(m[2]))
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) continue;

    const parsed = parseTimeRange(timeText);
    if (!parsed) continue;

    const start = istPartsToUtc(baseDate, parsed.startH, parsed.startM);
    let end = istPartsToUtc(baseDate, parsed.endH, parsed.endM);

    // Handle cross-midnight (e.g. 11:30 pm → 12:00 am)
    if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
    if (end - start > MAX_PROGRAM_DURATION_MS) {
      end = new Date(start.getTime() + MAX_PROGRAM_DURATION_MS);
    }

    programmes.push({
      title,
      start,
      end,
      desc: '',
      category: '',
      language: '',
    });
  }

  // 3. Dedupe + sort
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
          } else if (channel.type === 'freelivetv') {
            programmes = await fetchFreelivetvChannel(channel);
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
