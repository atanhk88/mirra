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
| `REPLICATE_VIDEO_MODEL` | Image-to-video model (default `bytedance/seedance-1-lite`, ~$0.02/s ≈ $0.10 per 5 s clip) |

Without keys the app still demos: a CSS-filter stand-in replaces Gemini stylization and the stage
shows the static reference with a setup note. Keys only ever live server-side.

## The pipeline

```
 ┌────────────┐  POST /api/stylize   ┌─────────────┐  POST /api/animate    ┌─────────────────────┐
 │ Full-body  │ ───────────────────▶ │   Gemini    │ ────────────────────▶ │ Replicate img-to-vid │
 │   photo    │  (≤1024px, memory)   │  image API  │  { image, motion }    │ (Seedance, fixed cam)│
 └────────────┘                      └─────────────┘                       └─────────────────────┘
       │                                    │                                       │
       │                          stylized reference PNG                 poll ?task= every 5s
       │                                    │                                       │
       ▼                                    ▼                                       ▼
  never persisted                  shown as "reference"            mp4 clips → <video> stage
                                                                              │
                                                              downloaded once, stored in the
                                                              browser's IndexedDB library
```

1. **Stylize (Gemini).** `POST /api/stylize` turns the photo into a Pixar-style full-body
   character. Customization edits reuse the same route with a constrained "change ONLY: …"
   instruction and produce a fresh avatar.
2. **Animate (Replicate image-to-video).** `POST /api/animate` generates one ~5 s clip per
   motion: two idle loops (gentle breathing/blinking, plus a subtle glance variation — the stage
   rotates between them so the loop never feels canned), then every reaction auto-generates in
   the background. A reaction triggered early jumps the queue and plays the moment it's ready.
3. **React.** Reactions (celebrate, wave, clap, nod, laugh, dance, think, proud, shrug, slump)
   fire through a tiny pub/sub bus (`lib/reactions.js`); the stage plays the matching clip once,
   then returns to the idle rotation.
4. **Library.** Finished clips are downloaded once and persisted as Blobs in IndexedDB
   (`lib/library.js`) — replays are instant, Replicate URL expiry doesn't matter, and `/library`
   lists every avatar with open/delete.

## Architecture map

```
app/
  layout.jsx              Root layout + metadata
  page.jsx                App state, two-step flow, library resume
  library/page.jsx        Avatar library (IndexedDB) with open/delete
  globals.css             Design tokens (verbatim from DESIGN.md) + all styles
  api/stylize/route.js    Gemini stylize/edit (server-only key, image never persisted)
  api/animate/route.js    Image-to-video motion clips (per-motion prompts, fixed camera)
components/
  UploadPanel.jsx         Drag-and-drop, client-side ≤1024px downscale, pipeline status
  StageCard.jsx           Stage card hosting the animated avatar
  VideoAvatar.jsx         Idle rotation, background generation queue, IndexedDB persistence
  AchievementPanel.jsx    Add → celebrate; remove → slump; manual reaction tuning
  CustomizePanel.jsx      Grounded options; batched Gemini edit → fresh avatar
lib/
  reactions.js            Pub/sub reaction bus + reaction list
  replicate.js            Replicate REST helpers (version cache, file upload, 429 retry)
  library.js              IndexedDB avatar store (records: image + clip Blobs)
  customize.js            Grounded option palettes + edit-instruction builder
```

## Notes & limits

- **Cost:** ~$0.10 per clip (Seedance Lite, 480p, 5 s). A fully warmed-up avatar — two idles plus
  ten reactions — is ~$1.20, generated once and cached forever in the browser.
- **Rate limits:** Replicate accounts holding <$5 credit are throttled to ~1 clip creation per
  minute; the background queue generates sequentially so this is usually invisible. Topping up
  to $5+ removes the limit.
- **Privacy:** photos are downscaled in the browser, processed in memory on the server, never
  persisted server-side. Avatars and clips live only in the browser's IndexedDB.
- **Loop seam:** each idle clip is prompted to end in its starting pose; the rotation between two
  idle variants masks most of the remaining seam.
- **Grounded by design:** every prompt repeats "no fantasy elements, everyday clothing, same
  person".
