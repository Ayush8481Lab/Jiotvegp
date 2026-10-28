'use strict';

/* ============================================================================
 *  Akashvani Radio API  —  Vercel Serverless Function
 *  Route:  GET /api/Radio
 *  File :  api/Radio.js
 *  Node :  18+ (uses global fetch)
 *
 *  Flow:
 *    1. Check in-memory cache (24 h TTL, survives warm invocations)
 *    2. Fetch the live Akashvani player page
 *    3. Parse:  state headers  ->  region groups
 *               <li data-channel> cards -> channels
 *               inline `var channels = {...}` -> HLS stream URLs
 *    4. Build JSON  (id = FR<viewsheet number>)
 *    5. Cache 24 h (in-memory + CDN s-maxage)
 * ========================================================================== */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (in-memory)
const CACHE_TTL_SECONDS = 24 * 60 * 60;   // 24 hours (CDN)

const SITE_BASE = 'https://akashvani.gov.in';
const EPG_BASE = 'https://cuesheets.prasarbharati.org';

/* Source page — the only URL needed for the live player. */
const SOURCE_URLS = process.env.RADIO_SOURCE_URL
  ? [process.env.RADIO_SOURCE_URL]
  : ['https://akashvani.gov.in/radio/live.php'];

/* Module-level cache (persists while the lambda stays warm) */
let memoryCache = { data: null, expiresAt: 0 };

/* ---------------------------------------------------------------------------
 *  Handler
 * ------------------------------------------------------------------------- */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  const now = Date.now();
  let payload;
  let cacheStatus = 'MISS';

  /* ---------- 1. cache hit ---------- */
  if (memoryCache.data && memoryCache.expiresAt > now) {
    payload = memoryCache.data;
    cacheStatus = 'HIT';
  } else {
    /* ---------- 2. refresh ---------- */
    try {
      const html = await fetchSourceHtml();
      const data = buildPayload(html);

      if (!data.totalChannels) throw new Error('Parsed 0 channels');

      memoryCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      payload = data;
      cacheStatus = 'MISS';
    } catch (err) {
      /* keep serving the last good snapshot if the upstream breaks */
      if (memoryCache.data) {
        payload = memoryCache.data;
        cacheStatus = 'STALE';
      } else {
        res.setHeader('Cache-Control', 'no-store');
        res.status(502).json({
          success: false,
          error: 'Upstream fetch/parse failed',
          message: err.message,
        });
        return;
      }
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=3600`
  );
  res.setHeader('X-Cache', cacheStatus);
  res.setHeader('X-Generated-At', payload.generatedAt);

  res.status(200).send(JSON.stringify(payload));
};

/* ---------------------------------------------------------------------------
 *  Network
 * ------------------------------------------------------------------------- */
async function fetchSourceHtml() {
  const errors = [];

  for (const url of SOURCE_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
      });

      clearTimeout(timer);

      if (!resp.ok) {
        errors.push(`${url} -> HTTP ${resp.status}`);
        continue;
      }

      const html = await resp.text();
      if (!/selectchannel/.test(html)) {
        errors.push(`${url} -> channel markup not found`);
        continue;
      }
      return html;
    } catch (e) {
      errors.push(`${url} -> ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
  }

  throw new Error('All sources failed: ' + errors.join(' | '));
}

/* ---------------------------------------------------------------------------
 *  Payload builder  (unchanged – works with the HTML you supplied)
 * ------------------------------------------------------------------------- */
function buildPayload(rawHtml) {
  const html = decodeEntities(rawHtml);
  const streams = parseStreamMap(html);

  const regions = [];
  const regionIndex = new Map();
  const usedIds = new Set();

  let current = null;
  let total = 0;

  /* Matches either a state heading <p class="state-name">…</p>
     or a channel card  <li … data-channel="N"> … </li>  — in document order */
  const TOKEN_RE =
    /<p[^>]*class="[^"]*state-name[^"]*"[^>]*>([\s\S]*?)<\/p>|<li[^>]*data-channel="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;

  let m;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    /* -------- state header -------- */
    if (m[1] !== undefined) {
      const regionName = cleanText(m[1])
        .replace(/^[\s—–\-=•]+|[\s—–\-=•]+$/g, '')
        .trim();

      if (!regionName) continue;

      const slug = slugify(regionName);
      if (!regionIndex.has(slug)) {
        const region = { region: regionName, slug, totalChannels: 0, channels: [] };
        regionIndex.set(slug, region);
        regions.push(region);
      }
      current = regionIndex.get(slug);
      continue;
    }

    /* -------- channel card -------- */
    const channelId = m[2];
    const cardHtml = m[3];

    if (!current) {
      const slug = 'unknown';
      if (!regionIndex.has(slug)) {
        const region = { region: 'UNKNOWN', slug, totalChannels: 0, channels: [] };
        regionIndex.set(slug, region);
        regions.push(region);
      }
      current = regionIndex.get(slug);
    }

    const channel = buildChannel(cardHtml, channelId, streams, usedIds, current.region);
    if (!channel) continue;

    current.channels.push(channel);
    current.totalChannels++;
    total++;
  }

  const national = regionIndex.get('national');

  return {
    success: true,
    source: 'AyushLab',
    generatedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    totalRegions: regions.length,
    totalChannels: total,
    national: national ? national.channels : [],
    regions,
  };
}

/* ---------------------------------------------------------------------------
 *  Single channel  (unchanged)
 * ------------------------------------------------------------------------- */
function buildChannel(cardHtml, channelId, streams, usedIds, regionName) {
  const name =
    extractName(cardHtml) || (streams[channelId] && streams[channelId].name) || null;

  if (!name) return null;

  const logo = extractAttr(cardHtml, 'img', 'src');

  const epgHref = extractHref(cardHtml, 'epg-button');
  const hlHref = extractHref(cardHtml, 'highlight-button');

  const epgNum = firstNumber(epgHref, /viewsheet\/(\d+)/);
  const hlNum = firstNumber(hlHref, /highlights\/(\d+)/);

  /* ID  ->  FR<viewsheet number>  (falls back to CH<internal id>) */
  let id = epgNum ? `FR${epgNum}` : `CH${channelId}`;
  if (usedIds.has(id)) {
    let n = 2;
    while (usedIds.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  usedIds.add(id);

  const stream = streams[channelId] || null;

  return {
    id,
    name,
    region: regionName,
    language: extractLanguage(cardHtml),
    logo: logo ? absolutise(logo.trim()) : null,
    streamUrl: stream ? stream.streamUrl : null,
    
  };
}

/* ---------------------------------------------------------------------------
 *  Stream URL map  (unchanged)
 * ------------------------------------------------------------------------- */
function parseStreamMap(html) {
  const map = Object.create(null);

  const start = html.indexOf('var channels');
  if (start === -1) return map;

  const end = html.indexOf('</script>', start);
  let block = html.slice(start, end === -1 ? start + 400000 : end);

  /* drop full-line `//` comments (commented-out live_url fallbacks) */
  block = block.replace(/^[ \t]*\/\/.*$/gm, '');

  const ENTRY_RE = /['"]?(\d+)['"]?\s*:\s*\{([^{}]*)\}/g;
  let m;
  while ((m = ENTRY_RE.exec(block)) !== null) {
    const id = m[1];
    const body = m[2];

    const live = body.match(/live_url\s*:\s*['"]([^'"]+)['"]/);
    if (!live) continue;

    const nm = body.match(/name\s*:\s*['"]([^'"]+)['"]/);

    map[id] = {
      streamUrl: live[1].trim(),
      name: nm ? nm[1].trim() : null,
    };
  }

  return map;
}

/* ---------------------------------------------------------------------------
 *  Small extractors  (unchanged)
 * ------------------------------------------------------------------------- */
function extractName(cardHtml) {
  const m = cardHtml.match(/<div[^>]*class="channel-name"[^>]*>([\s\S]*?)<\/div>/i);
  if (m) return cleanText(m[1]);

  const p = cardHtml.match(/class="channel-name"[^>]*>([\s\S]*?)<\/p>/i);
  return p ? cleanText(p[1]) : null;
}

function extractLanguage(cardHtml) {
  const m = cardHtml.match(/class="channel-language"[^>]*>([\s\S]*?)<\/p>/i);
  return m ? cleanText(m[1]) || null : null;
}

function extractAttr(cardHtml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`, 'i');
  const m = cardHtml.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function extractHref(cardHtml, className) {
  let m = cardHtml.match(new RegExp(`class="${className}"[^>]*href="([^"]*)"`, 'i'));
  if (m) return m[1];

  m = cardHtml.match(new RegExp(`href="([^"]*)"[^>]*class="${className}"`, 'i'));
  return m ? m[1] : null;
}

function firstNumber(value, re) {
  if (!value) return null;
  const m = String(value).match(re);
  return m ? m[1] : null;
}

/* ---------------------------------------------------------------------------
 *  Utilities  (unchanged)
 * ------------------------------------------------------------------------- */
function cleanText(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function absolutise(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return 'https:' + url;
  return `${SITE_BASE}/${url.replace(/^\/+/, '')}`;
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
