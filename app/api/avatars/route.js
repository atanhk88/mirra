// Cloud avatar library (signed-in users).
//   GET  → { avatars: [{ id, createdAt, imageUrl, clips }] }
//   POST { id, imageDataUrl } → uploads the stylized reference to Vercel Blob,
//          inserts the metadata row → { id, imageUrl }
// Blob URLs are public-but-unguessable; ownership checks guard the metadata.

import { put } from "@vercel/blob";
import { getSessionUserId } from "@/lib/auth";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  await ensureSchema();
  const { rows } = await sql`
    SELECT id, image_url, clips, created_at FROM avatars
    WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return Response.json({
    avatars: rows.map((r) => ({
      id: r.id,
      imageUrl: r.image_url,
      clips: r.clips || {},
      createdAt: new Date(r.created_at).getTime(),
    })),
  });
}

export async function POST(req) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id, imageDataUrl } = body || {};
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(imageDataUrl || "");
  if (!id || !match) {
    return Response.json({ error: "Expected `id` and a base64 `imageDataUrl`." }, { status: 400 });
  }
  const [, mimeType, data] = match;
  const ext = mimeType === "image/jpeg" ? "jpg" : "png";

  await ensureSchema();
  const blob = await put(`avatars/${userId}/${id}/reference.${ext}`, Buffer.from(data, "base64"), {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: true,
  });
  await sql`
    INSERT INTO avatars (id, user_id, image_url) VALUES (${id}, ${userId}, ${blob.url})
    ON CONFLICT (id) DO NOTHING`;
  return Response.json({ id, imageUrl: blob.url });
}
