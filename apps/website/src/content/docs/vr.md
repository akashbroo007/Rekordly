# VR Playback & Recording

Rekordly can record **VR (3D) cam shows** and play them back with a built-in look-around player — no external viewer required. The VR feed records the stereoscopic fisheye stream exactly as the camera captures it, and the player re-projects it so you can grab the scene and look around with the mouse, just like the VR player on the cam site itself.

## Which sites support VR

VR support ships per-plugin — a plugin that declares multiple stream types gets a **Stream type** option in its record dialogs:

| Site | VR (3D) | 2D (flat HD) | Notes |
| --- | --- | --- | --- |
| Dreamcam | ✅ | ✅ | Stereoscopic fisheye feed via a local bridge |
| Stripchat | ✅ | ✅ | VR cams (`isVr` models) broadcast a separate `_vr` HLS feed |
| All other sites | — | ✅ | Standard flat recording only |

More VR-capable plugins can be added without touching the app — anything that declares `"streamTypes": ["2d", "vr"]` in its manifest automatically gets the full VR pipeline: stream-type picking, tagging, and the VR player.

## Recording VR

### Pick a stream type

On any VR-capable creator, open the **Record** dialog (or the creator's settings). You get a **Stream type** dropdown:

- **Auto (site default)** — defers to the plugin's own preference.
- **VR (3D)** — records the stereoscopic feed. Plays back with VR controls in the player.
- **2D (flat HD)** — records the regular flat stream at full HD quality.

The pick applies to that recording only. For Auto-Record, set the plugin-level default instead (see below).

> **Which models have VR?** On Stripchat, only models streaming with a VR camera expose the 3D feed — they are listed under the site's **VR cams** category. On Dreamcam, any model can switch on a 3D stream mid-show. In **Auto**, both plugins fall back to 2D whenever no VR feed is live, so Auto-Record never fails on a non-VR model.

### Plugin setup: Stripchat VR

Stripchat's VR feed rides the same HLS infrastructure and the same settings as its 2D stream — no extra setup beyond the usual **Base URL / Session cookies / User-Agent**. Add the plugin-level **Preferred stream type** setting:

- **Auto (prefer VR when the model is a VR cam)** — VR for VR-cam models, 2D for everyone else.
- **VR (3D) only** — records only the stereoscopic feed; errors out if the model has none.
- **2D only** — ignores VR feeds entirely.

Recordings from the VR feed are automatically tagged and play back with the look-around player. VR recordings also run through the same de-obfuscation proxy as regular Stripchat recordings, so no additional software is needed.

### Plugin setup: Dreamcam VR

Dreamcam's VR feed is not a normal HLS stream — it arrives as fragmented MP4 over a WebSocket, which standard tools can't consume. The plugin bridges it through a **local server** so the recorder sees an ordinary live stream. Setup is the same as regular Dreamcam recording, plus one setting:

1. **Site URL** — the Dreamcam (or white-label) site to use.
2. **Session cookies** — your logged-in session, required for stream access.
3. **User-Agent** — must match the browser the cookies came from.
4. **Preferred stream type** — the default when no explicit pick is made:
   - **Auto (prefer VR when live)** — VR when the model broadcasts 3D, otherwise 2D.
   - **VR (3D) only** — never fall back; recording skips if no VR feed exists.
   - **2D only** — ignore VR feeds entirely.

> **VR recordings are tagged.** A recording captured from the 3D feed is stored with `streamType: vr`, so the player knows to enable VR view automatically — even after restarts. Re-extracting a resumed VR recording keeps the VR tag.

## Playing back VR

Open any VR recording from the **Library** and the player switches into **VR view automatically** — you see the fisheye frame re-projected as a natural perspective view. You can toggle it any time:

- **Glasses button** in the control bar (lit up while active).
- **W** key.

The on/off preference is saved **per recording**, so a file you've set to flat stays flat until you change it back. Non-VR recordings can also force VR view on (handy if a file was recorded before the tagging existed).

## Player controls

When VR view is active, the usual player shortcuts hand their keys over to the camera:

| Control | Action |
| --- | --- |
| **Drag** | Grab the scene and pull it — look around in any direction |
| **Mouse wheel** | Zoom in / out (45°–150° field of view) |
| **← / →** | Pan left / right |
| **↑ / ↓** | Pan up / down |
| **W** | Toggle VR view on/off |
| **Reset button** | Return to the default centered view |

Drag and zoom have a touch of inertia, so the view glides instead of snapping. While VR view is active, the arrow keys pan the camera instead of seeking, and the wheel zooms instead of changing volume — plain playback controls (space, J/L, M, F…) keep working as usual.

### Control bar options

The glasses button grows extra controls while VR view is on:

- **Projection** — `Fisheye` (cam VR rigs, the default) or `360°` (equirectangular sources).
- **Stereo layout** — `Auto`, `Mono`, `Side-by-side`, or `Top-bottom`. **Auto** detects the layout from the frame shape and is correct for Dreamcam VR out of the box; override it if a source is misdetected.
- **Lens angle** — the fisheye lens's field of view (180° default, up to 220° for wide cam rigs). Raise it if the edges of the disc look stretched; lower it if the view feels over-zoomed.
- **+ / − and zoom %** — step the field of view, with a readout relative to the default.
- **Reset** — recenter the view and zoom.

### Stereo layouts, briefly

VR camera rigs capture one circular fisheye image **per eye**:

- **Side-by-side (SBS)** — both eyes stacked horizontally; the frame is ~2:1. Dreamcam VR uses this.
- **Top-bottom (TB)** — eyes stacked vertically; the frame is ~1:2.
- **Mono** — a single fisheye lens; the frame is square-ish.

The player renders one eye's lens and re-projects it, so what you see is the view a headset would show one eye — flat on a monitor, immersive in a headset.

## Using a headset instead

The recording file is a standard MP4/HLS capture — nothing proprietary. For a full headset experience, drop the file into a desktop VR player and set the projection manually:

> **Recommended:** HereSphere (Steam) — projection **Fisheye**, layout **SBS**, FOV **180** for Dreamcam VR captures.

## Troubleshooting

- **VR view looks stretched / warped** — the stereo layout is wrong. Leave it on **Auto** for Dreamcam VR; if the source is unusual, try each layout manually.
- **Edges of the picture are cut off or the center is tiny** — adjust the **lens angle**. Wide rigs need 200–220°; standard full-frame fisheye is 180°.
- **The picture is a flat wide video with two copies of the scene** — VR view is off. Press **W** or the glasses button.
- **Recording says "no recordable stream"** — the model isn't broadcasting in the chosen stream type. Switch to **Auto** or the other stream type, or wait until a VR feed is online.
- **WebGL unavailable** — the VR projection needs hardware-accelerated WebGL. Check GPU settings in the app; the raw fisheye frame plays regardless.
