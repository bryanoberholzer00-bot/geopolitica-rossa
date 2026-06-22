const rssUrl = 'http://127.0.0.1:3001/api/rss?url=https%3A%2F%2Fwww.cuba-si.ch%2Fit%2Ffeed%2F';
const siteUrl = 'https://www.cuba-si.ch/it/tema/attualita/';

Promise.all([
  fetch(rssUrl).then(r => r.text()),
  fetch(siteUrl).then(r => r.text())
]).then(([rss, html]) => {
  // Extract RSS titles
  const rssTitles = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m;
  while ((m = re.exec(rss)) !== null) rssTitles.push(m[1].trim());

  // Extract dates from RSS
  const rssDates = [];
  const re2 = /<pubDate>([^<]+)<\/pubDate>/g;
  while ((m = re2.exec(rss)) !== null) rssDates.push(new Date(m[1].trim()).toLocaleDateString('it-IT'));

  // Extract titles from website (look for article links text)
  const htmlTitles = [];
  const re3 = /class="entry-title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g;
  while ((m = re3.exec(html)) !== null) htmlTitles.push(m[1].trim());

  console.log('=== RSS FEED (ultimi 5 articoli) ===');
  rssTitles.slice(1, 6).forEach((t, i) => console.log(`${i + 1}. [${rssDates[i] || '?'}] ${t}`));

  console.log('\n=== SITO WEB - /attualita/ (ultimi 5) ===');
  if (htmlTitles.length === 0) {
    // Fallback: extract any links with article-like paths
    const re4 = /<a[^>]+href="https:\/\/www\.cuba-si\.ch\/it\/[a-z0-9-]+\/"[^>]*>([^<]{10,})<\/a>/g;
    while ((m = re4.exec(html)) !== null) htmlTitles.push(m[1].trim());
  }
  htmlTitles.slice(0, 5).forEach((t, i) => console.log(`${i + 1}. ${t}`));
});
