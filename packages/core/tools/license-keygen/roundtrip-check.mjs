// Round-trip test: sign like the keygen → verify like LicenseService → reject tampering.
import { readFileSync } from 'node:fs';
import * as ed25519 from '@noble/ed25519';
import { createHash } from 'node:crypto';
import { base64url } from '@scure/base';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

ed25519.hashes.sha512 = (...messages) => {
  const hash = createHash('sha512');
  for (const message of messages) hash.update(message);
  return hash.digest();
};

const here = dirname(fileURLToPath(import.meta.url));
const privateKeyHex = readFileSync(join(here, 'private-key.hex'), 'utf8').trim();
const privateKey = Buffer.from(privateKeyHex, 'hex');

function issue(payload) {
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const signature = ed25519.sign(message, privateKey);
  return `${base64url.encode(message)}.${base64url.encode(signature)}`;
}

const publicKey = Buffer.from(
  'a5644b4bf766cbe8c93a2f029b25f2e2ed80999816cb45cfecfea81fb943111a',
  'hex',
);

function verify(token) {
  const separator = token.indexOf('.');
  const message = base64url.decode(token.slice(0, separator));
  const signature = base64url.decode(token.slice(separator + 1));
  return ed25519.verify(signature, message, publicKey)
    ? JSON.parse(Buffer.from(message).toString())
    : null;
}

const key = issue({
  tier: 'trial',
  email: 'test@rekordly.in',
  iat: new Date().toISOString(),
  exp: new Date(Date.now() + 7 * 86_400_000).toISOString(),
});
console.log('valid key verifies:', JSON.stringify(verify(key)));

const tampered = `${base64url.encode(new TextEncoder().encode(JSON.stringify({ tier: 'pro', email: 'evil@x.com', iat: new Date().toISOString() })))}.${key.slice(key.indexOf('.') + 1)}`;
console.log('tampered (tier escalated) rejected:', verify(tampered) === null);

const proKey = issue({ tier: 'pro', email: 'buyer@rekordly.in', iat: new Date().toISOString() });
console.log('lifetime pro verifies:', JSON.stringify(verify(proKey)));
