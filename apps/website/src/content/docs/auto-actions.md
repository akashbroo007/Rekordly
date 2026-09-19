# Post-Recording Automation

Auto Actions is Rekordly's post-recording pipeline: instead of manually compressing, moving, and uploading every finished capture, you configure the steps once and the app runs them on **every finished recording** automatically.

## The pipeline

Steps always run in a fixed, safe order — and every step is optional:

```
tag → compress → move → upload → delete-after-upload
```

- The pipeline runs in the **background**, never inside the recording finish path — recording the next stream is never delayed.
- A failure in one step never blocks the next, and the Library entry always survives.
- Runs are queued with bounded concurrency, so 30 recordings finishing at once don't burst 30 encoder runs.

## Configuring it

Open **Settings → Auto Actions**:

| Step | Setting | Behavior |
| --- | --- | --- |
| Master switch | **Enabled** | Nothing runs when off. |
| Tag | **Tag new recordings** | Adds the tag to every new recording (empty = skip). |
| Compress | **Compress + min size (MB)** | Re-encodes files larger than the threshold to save space (0 = skip). |
| Move | **Move to folder** | Relocates the finished file into this folder (empty = skip). |
| Upload | **Upload provider** | Uploads every finished recording to the selected cloud provider (empty = skip). |
| Delete | **Delete after upload** | Removes the local file once its upload completes — requires an upload target. |

The upload step uses the providers configured under **Cloud Uploads** (Gofile, Catbox, MixDrop, Google Drive).

## Manual runs

Need to apply the pipeline to an older recording? Use the **Run automation** action on any Library entry — the same steps run for that one recording on demand.

## Typical setups

- **Archive-and-forget:** tag → compress → upload to Google Drive → delete after upload. Your library stays searchable, your disk stays empty.
- **Organized captures:** tag → move into a per-project folder. No cloud involved.
- **Space saver:** compress anything larger than 500 MB. That's it.

> **Local-first guarantee:** nothing is uploaded or deleted unless you explicitly enable those steps. With automation off, finished recordings are simply left in place.
