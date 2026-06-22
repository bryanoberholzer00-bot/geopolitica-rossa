const fs = require('fs');
fetch('http://127.0.0.1:3001/api/rss?url=https%3A%2F%2Fwww.marx21.it%2Ffeed%2F')
  .then(r=>r.text())
  .then(t=>{
    const dom = new (require('jsdom').JSDOM)(t, { contentType: "text/xml" });
    const items = dom.window.document.querySelectorAll('item');
    items.forEach((item, idx) => {
      let content = '';
      const encoded = item.getElementsByTagNameNS('*', 'encoded');
      if (encoded.length > 0) content = encoded[0].textContent;
      
      const imgMatch = content.match(/<img[^>]+src="?([^"\s>]+)"?/i);
      console.log(`Item ${idx} image:`, imgMatch ? imgMatch[1] : 'none');
    });
  });
