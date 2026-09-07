/**
 * Derive the Mouflon segment-URI decoding from captured pairs.
 */
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.env.TEMP + '/mouflon-data.json', 'utf8'));
const KEY = 'NTK9aqcLmNFMWrpQ';

// collect (encToken, decToken) pairs
const pairs = [];
for (const p of data.playlists) {
  const lines = p.body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#EXT-X-MOUFLON:URI:(.+)$/);
    if (!m) continue;
    const encUrl = m[1];
    // find following real URI line
    const realLine = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
    if (!realLine || !realLine.includes('media.mp4')) continue;
    const encTok = encUrl.split('_').slice(-2)[0];
    const tsEnc = encUrl.split('_').pop();
    // find browser request with same seq+ts
    const dec = data.segments.find((s) => s.endsWith(tsEnc));
    if (!dec) continue;
    const decTok = dec.split('_').slice(-2)[0];
    pairs.push({ seq: encTok ? null : null, encTok, decTok, encUrl, decUrl: dec });
  }
}
console.log('pairs found:', pairs.length);
for (const p of pairs.slice(0, 5)) {
  console.log('ENC:', p.encTok, '(' + p.encTok.length + ')');
  console.log('DEC:', p.decTok, '(' + p.decTok.length + ')');
}

const crypto = require('crypto');
const uniq = [...new Map(pairs.map((p) => [p.encTok, p])).values()];
console.log('unique pairs:', uniq.length);

const keystreams = {
  key: Buffer.from(KEY),
  keyRev: Buffer.from([...KEY].reverse().join('')),
  keyB64: Buffer.from(KEY, 'base64'),
  md5: crypto.createHash('md5').update(KEY).digest(),
  sha256: crypto.createHash('sha256').update(KEY).digest(),
};
const ops = {
  xor: (a, b) => a ^ b,
  add: (a, b) => (a + b) % 256,
  sub: (a, b) => (a - b + 256) % 256,
};

for (const [ksName, ks] of Object.entries(keystreams)) {
  for (const [opName, op] of Object.entries(ops)) {
    for (let off = 0; off < ks.length; off++) {
      let ok = true;
      for (const { encTok, decTok } of uniq) {
        const buf = Buffer.from(encTok, 'base64');
        if (buf.length !== decTok.length) { ok = false; break; }
        for (let i = 0; i < buf.length; i++) {
          const out = String.fromCharCode(op(buf[i], ks[(i + off) % ks.length]));
          if (out !== decTok[i]) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (ok) console.log('MATCH:', ksName, opName, 'offset', off);
    }
  }
}
// RC4 hypothesis
function rc4(key, data) {
  const s = [...Array(256).keys()];
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0; j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) % 256];
  }
  return out;
}
{
  const keyBuf = Buffer.from(KEY);
  let ok = true;
  for (const { encTok, decTok } of uniq) {
    const buf = Buffer.from(encTok, 'base64');
    if (rc4(keyBuf, buf).toString('latin1') !== decTok) { ok = false; break; }
  }
  console.log('RC4(key):', ok ? 'MATCH' : 'no');
}
// also try treating DEC as the ciphertext (decode direction reversed)
{
  const keyBuf = Buffer.from(KEY);
  let ok = true;
  for (const { encTok, decTok } of uniq) {
    const buf = Buffer.from(encTok, 'base64');
    if (rc4(keyBuf, Buffer.from(decTok, 'latin1')).toString('latin1') !== encTok.slice(0, 16)) { ok = false; break; }
  }
  console.log('RC4-reverse:', ok ? 'MATCH' : 'no');
}
// AES hypotheses (key is exactly 16 bytes)
{
  const keyBuf = Buffer.from(KEY, 'latin1');
  const modes = [
    ['aes-128-ecb', null],
    ['aes-128-cbc', Buffer.alloc(16)],
    ['aes-128-cbc', Buffer.from(KEY)],
  ];
  for (const [alg, iv] of modes) {
    let ok = true;
    for (const { encTok, decTok } of uniq) {
      const buf = Buffer.from(encTok, 'base64');
      try {
        const d = crypto.createDecipheriv(alg, keyBuf, iv);
        d.setAutoPadding(false);
        const out = Buffer.concat([d.update(buf), d.final()]).toString('latin1').slice(0, decTok.length);
        if (out !== decTok) { ok = false; break; }
      } catch { ok = false; break; }
    }
    console.log(alg, iv ? '(iv=key)' : '', ok ? 'MATCH' : 'no');
  }
}
// structural inspection
for (const { encTok, decTok } of uniq.slice(0, 3)) {
  const buf = Buffer.from(encTok, 'base64');
  console.log('ENC b64 :', encTok);
  console.log('BUF hex :', buf.toString('hex'));
  console.log('BUF dec :', [...buf].join(','));
  console.log('DEC     :', decTok);
  console.log('DEC chr :', [...decTok].map((c) => c.charCodeAt(0)).join(','));
  const A62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  console.log('DEC i62 :', [...decTok].map((c) => A62.indexOf(c)).join(','));
  console.log('---');
}
console.log('done');
