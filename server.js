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

    const response = await fetch(targetUrl, {
      headers: { ...BROWSER_HEADERS, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
    });

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

// Catch-all: serve React app for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
