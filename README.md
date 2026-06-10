# Mirra — You, animated.

Upload a full-body photo and get a Disney/Pixar-style 3D avatar that lives in the UI: it idles
(breathes, sways, blinks) and reacts to what you do — log an achievement and it celebrates with
confetti, remove one and it slumps. Always a grounded, recognizable cartoon version of *you* —
never fantasy.

## Run it

```bash
npm install
npm run dev
```

That's it. **Zero env vars are required** — without keys the app runs the entire flow in mock
mode: a CSS-filter stand-in replaces Gemini stylization, the 3D generation is simulated, and a
procedural Pixar-proportioned mock avatar performs the full idle + reaction system on stage.

Deployable to Vercel as-is (`next build`).

### Env vars (Phase 2 — the real pipeline)

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key for photo → cartoon stylization |
| `GEMINI_IMAGE_MODEL` | Gemini image model id (default `gemini-3.5-flash`) |
| `HUNYUAN_SERVER_URL` | Base URL of your self-hosted Hunyuan3D worker (see [docs/HUNYUAN_SETUP.md](docs/HUNYUAN_SETUP.md)) |

The worker URL can also be pasted per-session into the "Worker URL override" field in step 1
(Colab tunnel URLs change each session). Keys only ever live server-side; the override is sent as
an `x-worker-url` header and never stored.

## The pipeline

```
 ┌────────────┐   POST /api/stylize    ┌─────────────┐   POST /api/generate-3d   ┌──────────────────┐
 │ Full-body  │ ─────────────────────▶ │   Gemini    │ ────────────────────────▶ │  Hunyuan3D worker │
 │   photo    │   (≤1024px, in-memory) │  image API  │   { image, texture:true } │  (your GPU/Colab) │
 └────────────┘                        └─────────────┘                           └──────────────────┘
       │                                     │                                          │
       │                              stylized A-pose PNG                    poll /status/{uid} every 4s
       │                                     │                                          │
       ▼                                     ▼                                          ▼
   never persisted                  shown as "reference"               textured GLB → three.js stage
                                                                                        │
                                                                       optional: Mixamo auto-rig (FBX)
                                                                                        │
                                                                                        ▼
                                                                       named clips drive the reactions
```

1. **Stylize (Gemini).** `POST /api/stylize` turns the photo into a Pixar-style full-body
   character in a relaxed A-pose on a white background — the pose image-to-3D rigs best from.
   Customization edits reuse the same route with a constrained "change ONLY: …" instruction.
2. **Generate 3D (Hunyuan3D, self-hosted & free).** `POST /api/generate-3d` proxies the image to
   your `api_server.py` worker; `GET ?task=` polls and finally streams the textured GLB.
3. **Animate & react (three.js + GSAP).** Two strictly separated layers: a procedural idle layer
   (`useFrame`: breath, bob, sway, head drift, blinks) and a GSAP reaction layer (celebrate, wave,
   think, proud, slump) fired through a tiny pub/sub bus (`lib/reactions.js`). Unrigged Hunyuan
   meshes react with whole-body puppet motion (squash-and-stretch hops, tilts, leans); models with
   animation clips get keyword-matched crossfades.
4. **Rig upgrade (Mixamo, free).** Download the GLB, auto-rig at mixamo.com, pick clips, upload
   the FBX/GLB back — named clips take over matching reactions.

## Architecture map

```
app/
  layout.jsx                 Root layout + metadata
  page.jsx                   App state, stepper flow, generation polling
  globals.css                Design tokens (verbatim from DESIGN.md) + all styles
  api/stylize/route.js       Gemini stylize/edit (server-only key, image never persisted)
  api/generate-3d/route.js   Stateless Hunyuan3D proxy (env URL or x-worker-url header)
components/
  UploadPanel.jsx            Drag-and-drop, client-side ≤1024px downscale, pipeline status
  GeneratePanel.jsx          Progress card (sculpting → texturing), mock simulation notice
  StageCard.jsx              Stage card, backdrop gradient swatches, dynamic(ssr:false) canvas
  AchievementPanel.jsx       Add → celebrate + confetti; remove → slump; manual reaction tuning
  CustomizePanel.jsx         Grounded options; instant in mock mode, batched edit in pipeline mode
  RigPanel.jsx               Mixamo download/upload flow
  stage/
    Stage.jsx                Alpha canvas, three-point lighting, contact shadow, orbit controls
    MockAvatar.jsx           Procedural Pixar-proportioned stand-in (full idle + reactions)
    ModelAvatar.jsx          Normalization, clip matching via AnimationMixer, puppet fallback
    GeneratedModel.jsx       Hunyuan GLB loader
    RiggedModel.jsx          Mixamo FBX/GLB loader
    Confetti.jsx             Instanced confetti burst on celebrate
    useIdleMotion.js         The procedural idle layer
lib/
  reactions.js               Pub/sub reaction bus
  puppet.js                  GSAP reaction timelines (settle-to-base, kill-on-interrupt)
  customize.js               Grounded option palettes + edit-instruction builder
docs/
  HUNYUAN_SETUP.md           Local + Colab worker setup
```

## Notes & limits

- **three.js never runs on the server** — the stage loads via `next/dynamic({ ssr: false })`.
- **Privacy:** photos are downscaled in the browser, processed in memory on the server, and never
  persisted. The UI says so too.
- **GLB size on Vercel:** streaming a 20–40 MB GLB through a serverless function can exceed
  response body limits. The proxy works locally / self-hosted; in production, have the worker (or
  the route) upload the GLB to blob storage (e.g. Vercel Blob, S3) and hand the client a URL.
- **No facial blendshapes:** Mixamo auto-rigging gives body skeletons only — emotion reads through
  posture and body language.
- **Grounded by design:** every prompt repeats "no fantasy elements, everyday clothing, same
  person".
