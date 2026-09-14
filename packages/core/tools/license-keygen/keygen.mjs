/**
 * Rekordly license keygen CLI.
 *
 * Usage:
 *   node tools/license-keygen/keygen.mjs generate --tier pro --email user@example.com
 *   node tools/license-keygen/keygen.mjs trial --email user@example.com [--days 7]
 *   node tools/license-keygen/keygen.mjs keypair              # first-time setup
 *
 * The PRIVATE key must never be committed. It is read from (first match):
 *   1. REKORDLY_LICENSE_PRIVATE_KEY environment variable (hex)
 *   2. tools/license-keygen/private-key.hex  (gitignored)
 *
 * Run `keypair` once to generate and store it; the matching public key is
 * printed — paste it into packages/core/src/services/license-service.ts
 * (LICENSE_PUBLIC_KEY) before building the app.
 */

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { base64url } from '@scure/base';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

ed25519.hashes.sha512 = (...messages) => {
  const hash = createHash('sha512');
  for (const message of messages) hash.update(message);
  return hash.digest();
};

const here = dirname(fileURLToPath(import.meta.url));
const privateKeyPath = join(here, 'private-key.hex');

function loadPrivateKeyHex() {
  const env = process.env.REKORDLY_LICENSE_PRIVATE_KEY;
  if (env && env.length > 0) return env.trim();
  if (existsSync(privateKeyPath)) {
    return readFileSync(privateKeyPath, 'utf8').trim();
  }
  console.error(
    'No private key found. Set REKORDLY_LICENSE_PRIVATE_KEY or run:\n' +
      '  node tools/license-keygen/keygen.mjs keypair',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function requireEmail(args) {
  const email = args.email;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Provide a valid --email <address>');
    process.exit(1);
  }
  return email;
}

function issue({ tier, email, days }) {
  const privHex = loadPrivateKeyHex();
  const privateKey = hexToBytes(privHex);
  const payload = {
    tier,
    email,
    iat: new Date().toISOString(),
  };
  if (days !== undefined) {
    payload.exp = new Date(Date.now() + days * 86_400_000).toISOString();
  }
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const signature = ed25519.sign(message, privateKey);
  const key = `${base64url.encode(message)}.${base64url.encode(signature)}`;
  console.log(key);
}

function hexToBytes(hex) {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('invalid private key hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'keypair') {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  const privHex = Buffer.from(privateKey).toString('hex');
  const pubHex = Buffer.from(publicKey).toString('hex');
  writeFileSync(privateKeyPath, privHex + '\n', 'utf8');
  console.log('Private key written to:', privateKeyPath);
  console.log('(gitignored — keep a backup outside this machine)');
  console.log('');
  console.log('Public key — paste into license-service.ts LICENSE_PUBLIC_KEY:');
  console.log(pubHex);
} else if (command === 'generate') {
  const args = parseArgs(rest);
  const email = requireEmail(args);
  const tier = args.tier === 'trial' ? 'trial' : 'pro';
  const days = args.days !== undefined ? Number(args.days) : undefined;
  issue({ tier, email, days });
} else if (command === 'trial') {
  const args = parseArgs(rest);
  const email = requireEmail(args);
  const days = args.days !== undefined ? Number(args.days) : 7;
  issue({ tier: 'trial', email, days });
} else {
  console.error('Unknown command. Use: keypair | generate | trial');
  process.exit(1);
}
