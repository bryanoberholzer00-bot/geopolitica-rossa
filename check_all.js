import { FEEDS, fetchFeed } from './src/FeedService.js';

async function checkAllFeeds() {
  console.log('--- Controllo incrociato dei Feed RSS ---');
  for (const feed of FEEDS) {
    try {
      const url = `http://127.0.0.1:3001/api/rss?url=${encodeURIComponent(feed.url)}&t=${Date.now()}`;
      const res = await fetch(url);
      const text = await res.text();
      
      let title = 'Nessun Titolo';
      let pubDate = 'Nessuna Data';
      
      const itemMatch = text.match(/<item>([\s\S]*?)<\/item>/i) || text.match(/<entry>([\s\S]*?)<\/entry>/i);
      
      if (itemMatch && itemMatch[1]) {
        const itemHtml = itemMatch[1];
        const tMatch = itemHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const dMatch = itemHtml.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i);
        
        if (tMatch) title = tMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        if (dMatch) pubDate = new Date(dMatch[1].trim()).toLocaleString('it-IT');
      }
      
      console.log(`\n📰 ${feed.name}`);
      console.log(`Titolo: ${title}`);
      console.log(`Data Pubblicazione: ${pubDate}`);
    } catch (e) {
      console.log(`Errore con ${feed.name}: ${e.message}`);
    }
  }
}

checkAllFeeds();
