# Mirra — You, animated.

Upload a full-body photo and get a Disney/Pixar-style animated avatar that lives in the UI: it
breathes, blinks, and glances around on its own, and reacts to what you do — log an achievement
and it celebrates, remove one and it slumps. Always a grounded, recognizable cartoon version of
*you* — never fantasy.

## Run it

```bash
npm install
npm run dev
```

Deployable to Vercel as-is (`next build`).

### Env vars

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key for photo → cartoon stylization |
| `GEMINI_IMAGE_MODEL` | Gemini image model id (default `gemini-3.5-flash`; must support image output) |
| `REPLICATE_API_TOKEN` | Replicate token — generates the animation clips |
| `REPLICATE_VIDEO_MODEL` | Image-to-video model (default `bytedance/seedance-1-lite`, ~$0.02/s) |
| `REPLICATE_VIDEO_DURATION` | Clip length in seconds (default `10`; Seedance Lite supports 5 or 10) |
| `REPLICATE_VIDEO_RESOLUTION` | Clip resolution (default `720p`; Seedance also supports `480p`) |
| `POSTGRES_URL` | Vercel Postgres — user accounts + avatar metadata (enables cloud sync) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — durable storage for stylized images and clips |
| `AUTH_SECRET` | Random string signing session cookies (e.g. `openssl rand -hex 32`) |

Without keys the app still demos: a CSS-filter stand-in replaces Gemini stylization and the stage
shows the static reference with a setup note. Keys only ever live server-side. The three
account/storage vars are optional as a group — without them the app runs in local-only mode
(browser IndexedDB, no sign-in).

## The flow

1. **Photo.** Upload a full-body shot (downscaled to ≤1024px in the browser);
   `POST /api/stylize` turns it into a Pixar-style full-body character via Gemini.
2. **Customize.** A dedicated step that edits the *static* reference — skin tone, hair, outfit,
   free-text tweaks — through the same route with a constrained "change ONLY: …" instruction.
   No video is generated until the look is locked in.
3. **Animate.** Nothing generates automatically: the Animations panel lists every motion (two
   idle loops + ten reactions) with a Generate button, a progress circle while in flight, and a
   ✓ once cached. Reactions (celebrate, wave, clap, nod, laugh, dance, think, proud, shrug,
   slump) fire through a tiny pub/sub bus (`lib/reactions.js`); the stage plays the matching
   clip once, then returns to the idle rotation.

## Storage

Two tiers, transparent to the rest of the app:

- **Local (always on).** Finished clips are downloaded once and persisted as Blobs in IndexedDB
  (`lib/library.js`) — replays are instant and Replicate URL expiry doesn't matter.
- **Cloud (signed in).** With `POSTGRES_URL` + `BLOB_READ_WRITE_TOKEN` + `AUTH_SECRET` set,
  users can create an account (`/account`, email + password). New avatars and clips then also
  sync server-side: metadata in Postgres, bytes in Vercel Blob (the server re-uploads each
  Replicate output URL while it's still live). `/library` merges both tiers — local blobs win
  for previews, cloud-only avatars stream from Blob URLs, so a library follows you across
  devices. IndexedDB acts as a per-device cache on top.

Auth is deliberately lean: scrypt password hashes and HMAC-signed HttpOnly session cookies via
`node:crypto` — no auth dependency, no session table.

## Architecture map

```
app/
  layout.jsx                    Root layout + metadata
  page.jsx                      App state, three-step flow, clip generation, cloud sync
  library/page.jsx              Avatar library — merged local (IndexedDB) + cloud view
  account/page.jsx              Sign in / sign up / sign out
  globals.css                   Design tokens (verbatim from DESIGN.md) + all styles
  api/stylize/route.js          Gemini stylize/edit (server-only key, image never persisted)
  api/animate/route.js          Image-to-video motion clips (per-motion prompts, fixed camera)
  api/auth/route.js             Account endpoints (signup/login/logout, session cookie)
  api/avatars/route.js          Cloud library: list, create (reference image → Blob)
  api/avatars/[id]/route.js     Cloud library: get one, delete (row + blobs)
  api/avatars/[id]/clips/route.js  Replicate output URL → Vercel Blob re-upload
components/
  UploadPanel.jsx               Drag-and-drop, client-side ≤1024px downscale, pipeline status
  StageCard.jsx                 Stage card hosting the animated avatar
  VideoAvatar.jsx               Pure playback: idle crossfade rotation + reaction overlay
  ReactionsPanel.jsx            Per-motion Generate buttons, progress circles, done states
  AchievementPanel.jsx          Add → celebrate; remove → slump
  CustomizePanel.jsx            Grounded options; batched Gemini edit → fresh reference
lib/
  reactions.js                  Pub/sub reaction bus + reaction list
  replicate.js                  Replicate REST helpers (version cache, file upload, 429 retry)
  library.js                    IndexedDB avatar store (records: image + clip Blobs)
  cloud.js                      Client for the cloud library API
  auth.js                       scrypt hashing + HMAC session cookies (node:crypto only)
  db.js                         Vercel Postgres schema (users, avatars) + sql client
  customize.js                  Grounded option palettes + edit-instruction builder
```

## Notes & limits

- **Cost:** ~$0.10 per clip (Seedance Lite, 480p, 5 s). A fully warmed-up avatar — two idles plus
  ten reactions — is ~$1.20, generated once and cached forever.
- **Rate limits:** Replicate accounts holding <$5 credit are throttled to ~1 clip creation per
  minute. Topping up to $5+ removes the limit.
- **Privacy:** photos are downscaled in the browser, processed in memory on the server, and the
  original upload is never persisted. Signed out, avatars and clips live only in the browser's
  IndexedDB. Signed in, the stylized reference and clips are stored in Vercel Blob under
  public-but-unguessable URLs (Blob has no private ACL); metadata access is enforced per user.
- **Loop seam:** each idle clip is prompted to end in its starting pose; the rotation between two
  idle variants masks most of the remaining seam.
- **Grounded by design:** every prompt repeats "no fantasy elements, everyday clothing, same
  person".
