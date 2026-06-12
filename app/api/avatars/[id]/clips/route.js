// Persist a finished clip: the client sends the (short-lived) Replicate output
// URL; the server downloads it and re-uploads to Vercel Blob so the clip
// outlives Replicate's URL expiry.
//   POST { motion, videoUrl } → { url }

import { put } from "@vercel/blob";
import { getSessionUserId } from "@/lib/auth";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MOTION_RE = /^[a-z0-9]{1,32}$/;

export async function POST(req, { params }) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { motion, videoUrl } = body || {};
  let parsed;
  try {
    parsed = new URL(videoUrl);
  } catch {
    parsed = null;
  }
  if (!MOTION_RE.test(motion || "") || parsed?.protocol !== "https:") {
    return Response.json({ error: "Expected a `motion` name and an https `videoUrl`." }, { status: 400 });
  }

  await ensureSchema();
  const { rows } = await sql`
    SELECT clips FROM avatars WHERE id = ${id} AND user_id = ${userId}`;
  if (!rows[0]) return Response.json({ error: "Not found." }, { status: 404 });
  const existing = rows[0].clips?.[motion];
  if (existing) return Response.json({ url: existing });

  const video = await fetch(videoUrl);
  if (!video.ok) {
    return Response.json({ error: `Couldn't download the clip (${video.status}).` }, { status: 502 });
  }
  const blob = await put(`avatars/${userId}/${id}/${motion}.mp4`, video.body, {
    access: "public",
    contentType: video.headers.get("content-type") || "video/mp4",
    addRandomSuffix: true,
  });

  await sql`
    UPDATE avatars SET clips = clips || ${JSON.stringify({ [motion]: blob.url })}::jsonb
    WHERE id = ${id} AND user_id = ${userId}`;
  return Response.json({ url: blob.url });
}
