import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());

// Serve Vite built frontend in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Browser-like headers to bypass Cloudflare and hotlink protection
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

app.get('/api/rss', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const isYouTube = targetUrl.includes('youtube.com');

    // YouTube needs specific headers including a valid cookie and referer
    const youtubeHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Cookie': 'CONSENT=YES+; GPS=1; VISITOR_INFO1_LIVE=; YSC=; PREF=tz=Europe.Rome',
    };

    const headers = isYouTube
      ? youtubeHeaders
      : { ...BROWSER_HEADERS, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' };

    let response = await fetch(targetUrl, { headers });

    // Retry once for YouTube with slightly different headers if first attempt fails
    if (!response.ok && isYouTube) {
      await new Promise(r => setTimeout(r, 1000));
      response = await fetch(targetUrl, {
        headers: { ...youtubeHeaders, 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }
      });
    }

    if (!response.ok) {
      return res.status(response.status).send(`Target responded with ${response.status}`);
    }

    const text = await response.text();
    res.set('Content-Type', response.headers.get('content-type') || 'application/xml');
    res.send(text);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send(error.message);
  }
});

// YouTube channel videos via HTML scraping (no API key needed, no IP blocking)
app.get('/api/youtube-channel', async (req, res) => {
  const channelId = req.query.id;
  if (!channelId) return res.status(400).send('Missing id');

  try {
    const ytUrl = `https://www.youtube.com/channel/${channelId}/videos`;
    const r = await fetch(ytUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        // SOCS cookie bypasses YouTube's consent page for server-side requests
        'Cookie': 'SOCS=CAESEwgDEgk2Mzk4MjE5OTYaAmVuIAEaBgiA_LysBg; CONSENT=YES+cb; GPS=1',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!r.ok) {
      console.error(`YouTube fetch failed: ${r.status}`);
      return res.status(r.status).json([]);
    }

    const html = await r.text();
    const hasInitialData = html.includes('ytInitialData');
    console.log(`YouTube HTML length: ${html.length}, hasInitialData: ${hasInitialData}`);
    console.log(`First 500 chars: ${html.substring(0, 500)}`);

    const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s)
      || html.match(/ytInitialData\s*=\s*({.+?});\s*(?:\/\/|<)/s);

    if (!match) {
      console.error('ytInitialData not found in YouTube response');
      return res.status(502).json([]);
    }

    const data = JSON.parse(match[1]);
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const videosTab = tabs.find(t => t?.tabRenderer?.title === 'Videos' || t?.tabRenderer?.selected);
    const items = videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

    const videos = items
      .filter(i => i?.richItemRenderer?.content?.videoRenderer)
      .slice(0, 15)
      .map(i => {
        const v = i.richItemRenderer.content.videoRenderer;
        const videoId = v.videoId;
        const thumb = v.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const title = v.title?.runs?.[0]?.text || '';
        const desc = v.descriptionSnippet?.runs?.[0]?.text || '';
        const date = v.publishedTimeText?.simpleText || null;
        return { url: `/watch?v=${videoId}`, title, thumbnail: thumb, shortDescription: desc, uploadedDate: date };
      });

    console.log(`Found ${videos.length} videos for channel ${channelId}`);
    res.json(videos);
  } catch (e) {
    console.error('YouTube scrape error:', e.message);
    res.status(503).json([]);
  }
});

// Image proxy: fetches images server-side with spoofed Referer to bypass hotlink protection
app.get('/api/img', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Missing url');
  try {
    const origin = new URL(imageUrl).origin;
    const r = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': origin + '/',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(r.status).send('');
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    const buf = await r.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).send('');
  }
});

app.get('/api/scrape-image', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ image: null });

  // Paths that clearly indicate logos/banners — not article images
  const LOGO_PATTERNS = /\/(testate|logos?|banner|header|footer|icon|placeholder|avatar|brand|sprite)\//i;
  const isLogoUrl = (url) => url && LOGO_PATTERNS.test(url);

  try {
    const response = await fetch(targetUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.json({ image: null });

    const html = await response.text();
    let imageUrl = null;

    // 1. Try og:image (both attribute orders)
    const ogMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i)
                 || html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:image"/i);
    if (ogMatch?.[1] && !isLogoUrl(ogMatch[1])) {
      imageUrl = ogMatch[1];
      // If Jetpack redirect, decode JWT to get real image URL
      if (imageUrl.includes('jetpack.com')) {
        try {
          const queryMatch = imageUrl.match(/[?&]query=([A-Za-z0-9+/=._-]+)/);
          if (queryMatch) {
            const jwtPart = queryMatch[1].split('.')[0];
            const decoded = JSON.parse(Buffer.from(jwtPart, 'base64url').toString('utf-8'));
            if (decoded.img && !isLogoUrl(decoded.img)) imageUrl = decoded.img;
            else imageUrl = null;
          }
        } catch { imageUrl = null; }
      }
    }

    // 2. WordPress featured image (reliable fallback for WP sites)
    if (!imageUrl) {
      const wpMatch = html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i)
                   || html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i);
      if (wpMatch?.[1] && !isLogoUrl(wpMatch[1])) imageUrl = wpMatch[1];
    }

    // 3. Fallback: first large img that isn't a logo path
    if (!imageUrl) {
      const imgRegex = /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
      let m;
      while ((m = imgRegex.exec(html)) !== null) {
        if (!isLogoUrl(m[1])) { imageUrl = m[1]; break; }
      }
    }

    res.json({ image: imageUrl || null });
  } catch (e) {
    res.json({ image: null });
  }
});

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

app.get('/api/read', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  try {
    const response = await fetch(targetUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': new URL(targetUrl).origin + '/' }
    });

    if (!response.ok) return res.status(response.status).send('Errore nel caricamento della pagina');

    const html = await response.text();
    const doc = new JSDOM(html, { url: targetUrl });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (article) {
      res.json(article);
    } else {
      res.status(500).send('Impossibile estrarre il testo');
    }
  } catch (e) {
    res.status(500).send('Errore di rete');
  }
});

// Catch-all: serve React app for any unknown route (Express 5 syntax)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
