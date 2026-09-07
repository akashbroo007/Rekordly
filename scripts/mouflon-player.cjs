/** Find and dump the MOUFLON decoder from the MMP player bundles. */
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(get(new URL(res.headers.location, url).toString()));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    }).on('error', reject);
  });
}

const fs = require('fs');

(async () => {
  // chunk names observed loading in the browser during room playback
  const chunks = [
    'chunk-e3b5f7495a197d67e70f.js',
    'chunk-b362166bbda6dfa693bb.js',
    'chunk-c2cf73fbb84876d33351.js',
    'chunk-6021b6f3f7886f5a7c90.js',
  ];
  console.log('chunks to scan:', chunks.length);
  for (const c of chunks) {
    const url = `https://mmp.doppiocdn.com/player/mmp/v2.11.1/${c}`;
    try {
      const body = await get(url);
      if (/MOUFLON|mouflon/i.test(body)) {
        console.log('FOUND in', c, 'size', body.length);
        // dump context around each occurrence
        let idx = -1;
        let n = 0;
        while ((idx = body.indexOf('MOUFLON', idx + 1)) !== -1 && n < 6) {
          n++;
          console.log(`--- occurrence ${n} ---`);
          console.log(body.slice(Math.max(0, idx - 400), idx + 400));
        }
        fs2write(c, body);
      }
    } catch (e) {
      console.log('err', c, e.message);
    }
  }
  function fs2write(name, body) {
    require('fs').writeFileSync(process.env.TEMP + '/' + name, body);
    console.log('saved', name);
  }
})();