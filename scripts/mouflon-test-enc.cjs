/** Test whether the CDN accepts the raw (obfuscated) MOUFLON segment URLs. */
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.env.TEMP + '/mouflon-data.json', 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const headers = { 'User-Agent': UA, Referer: 'https://stripchat.ooo/', Origin: 'https://stripchat.ooo' };

(async () => {
  const p = data.playlists[0];
  const lines = p.body.split('\n');
  const encUrls = lines.filter((l) => l.startsWith('#EXT-X-MOUFLON:URI:')).map((l) => l.slice('#EXT-X-MOUFLON:URI:'.length));
  console.log('obfuscated urls:', encUrls.length);
  for (const u of encUrls.slice(0, 3)) {
    try {
      const res = await fetch(u, { headers });
      console.log(res.status, res.headers.get('content-type'), res.headers.get('content-length'), u.slice(0, 120));
    } catch (e) {
      console.log('ERR', e.message);
    }
  }
})();