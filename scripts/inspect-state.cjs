const fs = require('fs');
const BACKSLASH = 92;
const html = fs.readFileSync(process.env.TEMP + '/sc-room.html', 'utf8');
const markerIdx = html.lastIndexOf('__PRELOADED_STATE__');
const s = html.indexOf('{', markerIdx);
let d = 0, ins = false, esc = false, end = -1;
for (let j = s; j < html.length; j++) {
  const c = html[j];
  if (ins) {
    if (esc) esc = false;
    else if (c.charCodeAt(0) === BACKSLASH) esc = true;
    else if (c === '"') ins = false;
    continue;
  }
  if (c === '"') ins = true;
  else if (c === '{') d++;
  else if (c === '}') { d--; if (d === 0) { end = j; break; } }
}
const st = JSON.parse(html.slice(s, end + 1));
const vc = st.viewCam ?? {};
console.log('viewCam keys:', Object.keys(vc).slice(0, 20));
const m = vc.model ?? (vc.user && vc.user.user);
console.log('model?', m ? { id: m.id, username: m.username, status: m.status, isLive: m.isLive } : null);
const cam = vc.cam;
console.log('cam?', cam ? { isCamAvailable: cam.isCamAvailable, streamName: cam.streamName, streamStatus: cam.streamStatus } : null);