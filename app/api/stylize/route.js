// POST /api/stylize — Gemini image stylization.
// The photo is held in memory for the duration of the request and never
// persisted. GET reports whether the key is configured (for the UI status line).

export const runtime = "nodejs";
// Image generation can take 10–20s, plus retries on capacity errors.
export const maxDuration = 60;

const CREATE_PROMPT =
  "Remove the background, then change the person in the photo into a Disney/Pixar like cartoon character. " +
  "Full body, standing in a relaxed A-pose with arms slightly away from the body, facing the camera, " +
  "neutral friendly expression, even studio lighting, plain solid white background. " +
  "Keep the person's real hairstyle, hair color, skin tone, body build and everyday clothing. " +
  "No fantasy elements, no costumes, no props.";

function editPrompt(instruction) {
  return (
    "This is a Disney/Pixar style cartoon character reference. Keep it the same person, in the same relaxed " +
    "A-pose, facing the camera, with the same plain solid white background and even studio lighting. " +
    `Change ONLY: ${instruction}. ` +
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
  // usually transient, so retry with backoff before giving up.
  let res;
  for (let attempt = 0; ; attempt++) {
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
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );
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
    return Response.json({ error: "Gemini returned no image." }, { status: 502 });
  }

  const outMime = imagePart.inlineData.mimeType || "image/png";
  return Response.json({ imageDataUrl: `data:${outMime};base64,${imagePart.inlineData.data}` });
}
