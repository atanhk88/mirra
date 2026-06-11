// POST /api/stylize — Gemini image stylization.
// The photo is held in memory for the duration of the request and never
// persisted. GET reports whether the key is configured (for the UI status line).

export const runtime = "nodejs";
// Image generation can take 10–20s, plus retries on capacity errors.
export const maxDuration = 60;

const SCENE =
  "Scene composition: a plain muted sage-green studio backdrop filling the whole image. Standing upright on the " +
  "floor behind the character is a large minimalist white rectangular border frame — thin, sharp, clean edges, " +
  "like an empty picture frame — taller than the character. The character stands centered in front of the frame. " +
  "The character casts a soft natural shadow on the floor, and the frame casts a subtle soft shadow onto the " +
  "backdrop. Soft, even studio lighting. Generous empty margin around the frame on all sides; the full body and " +
  "the entire frame are visible with nothing touching the image edges. Nothing else in frame.";

const CREATE_PROMPT =
  "Transform the person in this photo into a 3D animated feature-film character, in the style of a modern " +
  "Pixar / Disney CGI movie. The output must look like a polished 3D render: soft rounded forms, smooth " +
  "subsurface-scattered skin, large expressive eyes, gently stylized friendly proportions, subtle warm smile. " +
  "It must NOT look like a flat 2D illustration — no line art, no cel shading, no anime, no drawing. " +
  "Keep the person's real hairstyle, hair color, skin tone, body build and everyday clothing so they stay " +
  "clearly recognizable. Full body visible from head to toe, standing in a relaxed A-pose with arms slightly " +
  "away from the body, facing the camera. " +
  SCENE +
  " No fantasy elements, no costumes, no props, no text.";

function editPrompt(instruction) {
  return (
    "This is a 3D animated feature-film character render in a modern Pixar / Disney CGI style. Keep it the " +
    "same person, the same polished 3D render style (never flat 2D illustration or line art), in the same " +
    "relaxed A-pose, facing the camera, with the exact same scene: " +
    SCENE +
    ` Change ONLY: ${instruction}. ` +
    "Keep everything grounded and everyday — no fantasy elements, no costumes, no props, same person."
  );
}

export async function GET() {
  return Response.json({ configured: !!process.env.GEMINI_API_KEY });
}

export async function POST(req) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ error: "GEMINI_API_KEY is not configured — running in mock mode." }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { imageDataUrl, editInstruction } = body || {};
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(imageDataUrl || "");
  if (!match) {
    return Response.json({ error: "imageDataUrl must be a base64 image data URL." }, { status: 400 });
  }
  const [, mimeType, data] = match;

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.5-flash";
  const prompt = editInstruction ? editPrompt(editInstruction) : CREATE_PROMPT;

  // Gemini sheds load with 503 UNAVAILABLE during demand spikes; these are
  // usually transient, so retry with backoff before giving up. Square output
  // (closest supported ratio to the 460×520 stage viewport) — dropped on a
  // 400 in case the configured model doesn't accept imageConfig.
  let res;
  let useAspect = true;
  for (let attempt = 0; ; attempt++) {
    const generationConfig = { responseModalities: ["IMAGE", "TEXT"] };
    if (useAspect) generationConfig.imageConfig = { aspectRatio: "1:1" };
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ inlineData: { mimeType, data } }, { text: prompt }],
            },
          ],
          generationConfig,
        }),
      }
    );
    if (res.status === 400 && useAspect) {
      useAspect = false;
      continue;
    }
    if (res.status !== 503 && res.status !== 429) break;
    if (attempt >= 3) break;
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: `Gemini request failed (${res.status}). ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    // Surface whatever Gemini said instead of an image — usually either a
    // text-only model answering in prose, or a refusal explaining itself.
    const text = parts
      .map((p) => p.text)
      .filter(Boolean)
      .join(" ")
      .slice(0, 400);
    const finishReason = json.candidates?.[0]?.finishReason;
    const blockReason = json.promptFeedback?.blockReason;
    const detail =
      text ||
      (blockReason && `Prompt blocked: ${blockReason}.`) ||
      (finishReason && `Finish reason: ${finishReason}.`) ||
      "Empty response — the configured GEMINI_IMAGE_MODEL may not support image output.";
    return Response.json({ error: `Gemini returned no image. ${detail}` }, { status: 502 });
  }

  const outMime = imagePart.inlineData.mimeType || "image/png";
  return Response.json({ imageDataUrl: `data:${outMime};base64,${imagePart.inlineData.data}` });
}
