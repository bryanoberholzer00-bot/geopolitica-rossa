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

// YouTube channel videos via Piped API (bypasses YouTube IP blocking)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.yt',
];

app.get('/api/youtube-channel', async (req, res) => {
  const channelId = req.query.id;
  if (!channelId) return res.status(400).send('Missing id');

  for (const instance of PIPED_INSTANCES) {
    try {
      const r = await fetch(`${instance}/channel/${channelId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const videos = (data.relatedStreams || data.videos || []).slice(0, 15).map(v => ({
        url: v.url,
        title: v.title,
        thumbnail: v.thumbnail,
        shortDescription: v.shortDescription || '',
        uploadedDate: v.uploadedDate || null,
      }));
      return res.json(videos);
    } catch (e) {
      console.warn(`Piped instance ${instance} failed:`, e.message);
    }
  }
  res.status(503).json([]);
});

app.get('/api/scrape-image', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');
  
  try {
    const response = await fetch(targetUrl, {
      headers: BROWSER_HEADERS
    });
    
    if (!response.ok) return res.status(404).send('');
    
    const html = await response.text();
    let match = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i);
    
    if (!match) {
        match = html.match(/<img[^>]+src="([^"]+(?:jpg|png|jpeg|webp))"[^>]*>/i);
    }
    
    if (match && match[1]) {
      res.send(match[1]);
    } else {
      res.send('');
    }
  } catch (error) {
    res.status(500).send('');
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
