# Cloud Uploads

Finished recordings do not have to stay local. Rekordly includes built-in upload providers so you can push captures to the cloud from the app.

## Providers

| Provider      | Notes                              |
| ------------- | ---------------------------------- |
| Gofile        | Optional account token             |
| Catbox        | Optional user hash                 |
| MixDrop       | Email + API key                    |
| Google Drive  | OAuth client + refresh token       |

## Setting up a provider

1. Open **Settings → Uploads** (or the **Uploads** page).
2. Pick a provider and enter its credentials:

   - **Gofile** — works anonymously, but an account token gives you file management on gofile.io.
   - **Catbox** — a user hash ties uploads to your catbox.moe account.
   - **MixDrop** — create an API key on the MixDrop site and pair it with your account email.
   - **Google Drive** — requires your own OAuth client and refresh token; Rekordly uploads into your Drive with them.

3. Select a finished recording in your library and hit **Upload**.

## Notes

- Uploads run in the background; you can keep recording while files upload.
- Rekordly is local-first — **nothing is uploaded anywhere unless you explicitly configure a provider and trigger an upload**.
- Credential storage and transfer stay between the app and the provider you choose.
