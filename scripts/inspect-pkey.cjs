const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const url = process.argv[2];
const headers = { 'User-Agent': UA, Referer: 'https://stripchat.ooo/', Origin: 'https://stripchat.ooo' };
(async () => {
  const res = await fetch(url, { headers });
  const body = await res.text();
  console.log('playlist:', res.status);
  console.log(body.split('\n').slice(0, 10).join('\n'));
  const seg = body.split('\n').find((l) => l && !l.startsWith('#'));
  if (seg) {
    const segUrl = new URL(seg.trim(), url).toString();
    console.log('segment url:', segUrl);
    const r2 = await fetch(segUrl, { headers });
    console.log('segment fetch:', r2.status, r2.headers.get('content-type'), r2.headers.get('content-length'));
  }
})();