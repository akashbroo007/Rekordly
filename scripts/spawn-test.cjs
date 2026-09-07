/** Spawn ffmpeg exactly like record-real-test against the held proxy URL. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const url = fs.readFileSync(process.env.TEMP + '/proxy-url.txt', 'utf8').trim();
console.log('url:', url);
try {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'warning', '-stats',
    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    '-headers', 'Referer: https://stripchat.ooo/\r\nOrigin: https://stripchat.ooo\r\n',
    '-reconnect', '1', '-reconnect_delay_max', '2', '-rw_timeout', '10000000',
    '-i', url,
    '-t', '5', '-c', 'copy', '-movflags', '+faststart', 'recordings/spawn-test.mp4',
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  console.log('OK');
} catch (e) {
  console.log('ERR:', String(e.stderr ?? e.message).slice(-500));
}