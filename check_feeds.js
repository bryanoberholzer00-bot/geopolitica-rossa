fetch('https://www.youtube.com/@OttolinaTV').then(r => r.text()).then(t => {
  const m = t.match(/"channelId":"([^"]+)"/);
  console.log('ChannelID in JSON:', m ? m[1] : 'NOT FOUND');
  const m2 = t.match(/<title>([^<]+)/);
  console.log('Title:', m2 ? m2[1] : 'NOT FOUND');
  const m3 = t.match(/rel="alternate" type="application\/rss\+xml" title="RSS" href="([^"]+)"/);
  console.log('RSS Link:', m3 ? m3[1] : 'NOT FOUND');
});
