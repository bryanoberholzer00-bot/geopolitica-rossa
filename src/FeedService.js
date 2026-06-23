// FeedService v2 - fixed content extraction
import { parse } from 'date-fns';

// In production (Railway), API is on the same server. In dev, use localhost proxy.
const API_BASE = import.meta.env.PROD ? '' : 'http://127.0.0.1:3001';

export const FEEDS = [
  { id: 'contropiano', name: 'Contropiano', url: 'https://contropiano.org/feed', type: 'giornale' },
  { id: 'cittafutura', name: 'La Città Futura', url: 'https://www.lacittafutura.it/editoriali?format=feed&type=rss', type: 'analisi' },
  { id: 'ottolinatv', name: 'OttolinaTV', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCoxLVRisaG8rdel1D1eseng', type: 'video' },
  { id: 'pubble', name: 'Pubble', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC60blwVmCGnR_M6S1po6dYA', type: 'video' },
  { id: 'sinistrainrete', name: 'Sinistra in Rete', url: 'https://www.sinistrainrete.info/?format=feed&type=rss', type: 'analisi' },
  { id: 'marx21', name: 'Marx21', url: 'https://www.marx21.it/feed/', type: 'analisi' },
  { id: 'pagine-esteri', name: 'Pagine Esteri', url: 'https://pagineesteri.it/feed/', type: 'giornale' },
  { id: 'antidiplomatico', name: "L'AntiDiplomatico", url: 'https://www.lantidiplomatico.it/rss.php', type: 'giornale' },
  { id: 'pcchl', name: 'Partito Comunista (CH)', url: 'https://www.partitocomunista.ch/feed', type: 'partito' },
  { id: 'popti', name: 'POPti', url: 'https://popti.ch/feed/', type: 'partito' },
  { id: 'cubasi', name: 'Cuba Sì (CH)', url: 'https://www.cuba-si.ch/it/feed/', type: 'partito' },
];

// Helper to decode HTML entities in text
const decodeHTML = (html) => {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
};

// Helper to extract an image from description or content
const extractImage = (node) => {
  // Check media:content (WordPress standard)
  const mediaContent = node.getElementsByTagNameNS('*', 'content');
  for (let i = 0; i < mediaContent.length; i++) {
    const url = mediaContent[i].getAttribute('url');
    const medium = mediaContent[i].getAttribute('medium');
    if (url && (!medium || medium === 'image')) return url;
  }

  // Check media:thumbnail
  const mediaThumbnail = node.getElementsByTagNameNS('*', 'thumbnail');
  if (mediaThumbnail.length > 0 && mediaThumbnail[0].getAttribute('url')) {
    return mediaThumbnail[0].getAttribute('url');
  }

  // Check enclosure
  const enclosure = node.querySelector('enclosure');
  if (enclosure && enclosure.getAttribute('url') && enclosure.getAttribute('type')?.startsWith('image')) {
    return enclosure.getAttribute('url');
  }

  // Fallback: first img tag in content:encoded or description
  let content = '';
  let encoded = node.getElementsByTagNameNS('*', 'encoded');
  if (encoded.length === 0) encoded = node.getElementsByTagName('content:encoded');
  if (encoded.length > 0) content = encoded[0].textContent;
  else {
    const desc = node.querySelector('description');
    if (desc) content = desc.textContent;
  }

  if (content) {
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return imgMatch[1];
  }

  return null;
};

// Extract text snippet
const extractSnippet = (node) => {
  const desc = node.querySelector('description');
  if (!desc) return '';
  const text = decodeHTML(desc.textContent).replace(/<[^>]*>?/gm, '').trim();
  return text.length > 150 ? text.substring(0, 150) + '...' : text;
};

export const fetchFeed = async (feed) => {
  try {
    // For YouTube channels, use rss2json.com which proxies YouTube feeds
    // from its own servers (not blocked), supports CORS, no API key needed
    if (feed.url.includes('youtube.com')) {
      const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
      const response = await fetch(rss2jsonUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`rss2json error: ${response.status}`);
      const data = await response.json();
      if (data.status !== 'ok') throw new Error(`rss2json status: ${data.status}`);
      return data.items.map(item => ({
        id: item.guid,
        title: item.title,
        link: item.link,
        pubDate: new Date(item.pubDate),
        snippet: item.description || '',
        image: item.thumbnail || item.enclosure?.thumbnail || '',
        sourceName: feed.name,
        sourceId: feed.id,
        fullContent: null,
        categories: item.categories || [],
      }));
    }

    const proxyUrl = `${API_BASE}/api/rss?url=${encodeURIComponent(feed.url)}&t=${Date.now()}`;
    const response = await fetch(proxyUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    
    const items = Array.from(xmlDoc.querySelectorAll('item, entry'));
    
    const parsedItems = await Promise.all(items.map(async (item) => {
      const isAtom = item.tagName.toLowerCase() === 'entry';
      
      const titleNode = item.querySelector('title');
      const linkNode = isAtom ? item.querySelector('link') : item.querySelector('link');
      const dateNode = item.querySelector('pubDate, published, updated');
      
      const title = titleNode ? titleNode.textContent : 'No title';
      const link = isAtom ? linkNode.getAttribute('href') : (linkNode ? linkNode.textContent : '#');
      const pubDate = dateNode ? new Date(dateNode.textContent) : new Date();
      
      let image = extractImage(item);
      
      // Fallback: se l'RSS non contiene immagini, raschia la pagina HTML
      if (!image && link && link !== '#') {
         try {
            const scrapeUrl = `${API_BASE}/api/scrape-image?url=${encodeURIComponent(link)}`;
            const scrapeRes = await fetch(scrapeUrl);
            if (scrapeRes.ok) {
               const data = await scrapeRes.json();
               if (data?.image) image = data.image;
            }
         } catch(e) {
            console.log('Scrape fallito per', link);
         }
      }

      let snippet = extractSnippet(item);
      
      if (isAtom && !snippet) {
         const group = item.getElementsByTagNameNS('*', 'group');
         if(group.length > 0) {
            const desc = group[0].getElementsByTagNameNS('*', 'description');
            if(desc.length > 0) {
                const text = desc[0].textContent.replace(/<[^>]*>?/gm, '').trim();
                snippet = text.length > 150 ? text.substring(0, 150) + '...' : text;
            }
         }
      }

      // Extract categories
      const categoryNodes = Array.from(item.querySelectorAll('category'));
      const categories = categoryNodes
        .map(c => c.textContent.replace(/<!\[CDATA\[|\]\]>/g, '').trim())
        .filter(c => c.length > 0 && c.toLowerCase() !== feed.name.toLowerCase())
        .slice(0, 3); // Take top 3 max

      // Extract full content from content:encoded if available
      let fullContent = '';
      let encodedContent = item.getElementsByTagNameNS('*', 'encoded');
      if (encodedContent.length === 0) encodedContent = item.getElementsByTagName('content:encoded');
      if (encodedContent.length > 0) fullContent = encodedContent[0].textContent;

      return {
        id: link,
        title,
        link,
        pubDate,
        sourceId: feed.id,
        sourceName: feed.name,
        image,
        snippet,
        categories,
        fullContent
      };
    }));
    
    return parsedItems;
  } catch (error) {
    console.error(`Error processing feed ${feed.name}:`, error);
    return [];
  }
};
