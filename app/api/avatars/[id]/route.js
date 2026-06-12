// Single avatar:
//   GET    → { id, createdAt, imageUrl, clips }
//   DELETE → removes the row and every blob under it.

import { del } from "@vercel/blob";
import { getSessionUserId } from "@/lib/auth";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

async function ownedAvatar(userId, id) {
  const { rows } = await sql`
    SELECT id, image_url, clips, created_at FROM avatars
    WHERE id = ${id} AND user_id = ${userId}`;
  return rows[0] || null;
}

export async function GET(req, { params }) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  await ensureSchema();
  const row = await ownedAvatar(userId, id);
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({
    id: row.id,
    imageUrl: row.image_url,
    clips: row.clips || {},
    createdAt: new Date(row.created_at).getTime(),
  });
}

export async function DELETE(req, { params }) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  await ensureSchema();
  const row = await ownedAvatar(userId, id);
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  const urls = [row.image_url, ...Object.values(row.clips || {})].filter(Boolean);
  if (urls.length) await del(urls).catch(() => {});
  await sql`DELETE FROM avatars WHERE id = ${id} AND user_id = ${userId}`;
  return Response.json({ ok: true });
}
