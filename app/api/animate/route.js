// 2D animation backend: turns the stylized reference into short motion clips
// via a Replicate-hosted image-to-video model (REPLICATE_VIDEO_MODEL, default
// bytedance/seedance-1-lite — ~$0.02/s, fixed-camera support, first frame
// stays identical to the input so the character's identity is locked).
//
//   POST { image: <base64>, motion: "idle" | reaction }  → { taskId }
//   GET  ?task=<id>  → { status } | { status: "completed", videoUrl }
//   GET  (no params) → { configured } for the UI

import { createPrediction, getPrediction, pickFileUrl } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 60;

const STYLE =
  "Completely static locked-off camera, no camera movement, no zoom, no pan, plain studio background. " +
  "The entire body is fully visible from head to toe inside the frame — full body wide shot, " +
  "feet on the ground, nothing cropped, the character stays the same size and in the same spot. " +
  "Smooth high-quality 3D-animated movie character animation.";

// Idle clips loop forever via a client-side crossfade, but a first/last frame
// match keeps even the dissolve invisible.
const LOOP = " The first and last frames are identical so the clip loops perfectly seamlessly with no jump or flash.";

const MOTION_PROMPTS = {
  idle:
    "The character stands in place, breathing gently and visibly — chest and shoulders rise and fall softly. " +
    "They blink naturally every few seconds. Their feet stay planted and their posture barely changes; " +
    "any weight shift is barely perceptible. Calm, friendly, relaxed expression. " +
    "The motion is minimal and continuous. " +
    STYLE + LOOP,
  idle2:
    "The character stands in place, breathing gently — chest and shoulders rise and fall softly, blinking naturally. " +
    "Once, they glance briefly to one side with mild curiosity and give a soft small smile, then look forward again. " +
    "Feet stay planted, posture barely changes. " +
    STYLE + LOOP,
  celebrate:
    "The character bursts into celebration — throws both arms up, jumps joyfully with a huge smile, " +
    "then settles back down into a relaxed standing pose. " + STYLE,
  wave:
    "The character raises one hand and waves hello warmly, smiling, looking at the viewer, " +
    "then lowers the hand back to a relaxed standing pose. " + STYLE,
  clap:
    "The character claps their hands enthusiastically with a delighted smile, applauding, " +
    "then lowers their hands back to a relaxed standing pose. " + STYLE,
  nod:
    "The character nods approvingly with a warm smile, agreeing confidently, " +
    "then returns to a relaxed standing pose. " + STYLE,
  laugh:
    "The character laughs heartily — head tips back slightly, shoulders shake with laughter, eyes crinkle, " +
    "then they settle back into a relaxed standing pose with a lingering smile. " + STYLE,
  dance:
    "The character does a small, fun dance groove in place — bouncing to a beat, arms moving playfully, " +
    "then settles back into a relaxed standing pose. " + STYLE,
  think:
    "The character looks up thoughtfully, brings one hand to their chin, pondering with a curious expression, " +
    "then returns to a relaxed standing pose. " + STYLE,
  proud:
    "The character stands tall, puts both hands on their hips, lifts their chin with a proud confident smile, " +
    "then relaxes back to a natural standing pose. " + STYLE,
  shrug:
    "The character shrugs — shoulders rise, palms turn up and out, with a puzzled but good-natured expression, " +
    "then drops their arms back to a relaxed standing pose. " + STYLE,
  slump:
    "The character sighs — shoulders slump, head drops, arms hang heavily, looking dejected, " +
    "then slowly straightens back up to a neutral standing pose. " + STYLE,
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");
  const token = process.env.REPLICATE_API_TOKEN;

  if (!task) {
    return Response.json({ configured: !!token });
  }
  if (!token) {
    return Response.json({ error: "REPLICATE_API_TOKEN is not configured." }, { status: 503 });
  }

  let json;
  try {
    json = await getPrediction(token, task);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 502 });
  }
  if (json.status === "succeeded") {
    const videoUrl = pickFileUrl(json.output);
    if (!videoUrl) {
      return Response.json({ status: "error", message: "Animation finished but returned no video URL." });
    }
    return Response.json({ status: "completed", videoUrl });
  }
  if (json.status === "failed" || json.status === "canceled") {
    return Response.json({ status: "error", message: String(json.error || `Prediction ${json.status}.`) });
  }
  return Response.json({ status: "processing" });
}

export async function POST(req) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: "2D animation needs REPLICATE_API_TOKEN — add it in your deployment env." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const prompt = MOTION_PROMPTS[body?.motion];
  if (!body?.image || !prompt) {
    return Response.json({ error: "Expected base64 `image` and a known `motion`." }, { status: 400 });
  }

  const model = process.env.REPLICATE_VIDEO_MODEL || "bytedance/seedance-1-lite";
  // Data URI, not the files API: its download URLs have no file extension,
  // which breaks the model's format detection. The client compresses the
  // image below Replicate's data-URI size limit.
  const mime = body.mime === "image/jpeg" ? "image/jpeg" : "image/png";
  const input = { image: `data:${mime};base64,${body.image}`, prompt };
  // Seedance-specific knobs; other models get the universal image+prompt pair.
  // Duration/resolution are env-overridable so a longer-clip model can be
  // swapped in without code changes (Seedance Lite itself caps at 10s).
  if (model.includes("seedance")) {
    input.duration = Number(process.env.REPLICATE_VIDEO_DURATION) || 10;
    input.resolution = process.env.REPLICATE_VIDEO_RESOLUTION || "720p";
    input.camera_fixed = true;
  }

  try {
    const json = await createPrediction(token, model, input);
    return Response.json({ taskId: json.id });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 502 });
  }
}
