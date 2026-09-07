/** Verify fragmented MP4 stays playable after a hard kill mid-recording. */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const url = fs.readFileSync(process.env.TEMP + '/proxy-url.txt', 'utf8').trim();
const out = 'recordings/frag-kill-test.mp4';
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-reconnect', '1', '-rw_timeout', '10000000',
  '-i', url,
  '-c', 'copy',
  '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
  out,
], { stdio: ['pipe', 'ignore', 'inherit'] });
setTimeout(() => {
  console.log('hard-killing ffmpeg at 6s...');
  ff.kill(); // TerminateProcess on Windows — no graceful finalize
}, 6000);
ff.on('close', () => {
  setTimeout(() => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name', '-of', 'default=nw=1', out], (e, stdout) => {
      if (e) { console.log('FFPROBE FAILED:', e.message); process.exit(1); }
      console.log('playable after hard kill:\n' + stdout);
      console.log('size:', fs.statSync(out).size);
    });
  }, 500);
});