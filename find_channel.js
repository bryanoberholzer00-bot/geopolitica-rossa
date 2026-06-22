fetch('https://www.youtube.com/@pubble7900')
  .then(r=>r.text())
  .then(t=>{
    const matches = t.match(/UC[a-zA-Z0-9_-]{22}/g);
    if (matches && matches.length > 0) {
      console.log('Channel IDs found:', [...new Set(matches)]);
    } else {
      console.log('Not found');
    }
  })
  .catch(console.error);
