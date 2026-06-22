import { FEEDS, fetchFeed } from './src/FeedService.js';
async function test() {
  const ytFeed = FEEDS.find(f => f.id === 'ottolinatv');
  const items = await fetchFeed(ytFeed);
  console.log('Got', items.length, 'items from OttolinaTV');
  if (items.length > 0) {
    console.log('First link:', items[0].link);
    console.log('Includes youtube.com?', items[0].link.includes('youtube.com'));
  }
}
test();
