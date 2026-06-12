// Account endpoints.
//   GET  → { configured, user: { email } | null }
//   POST { action: "signup" | "login" | "logout", email?, password? }
// Sessions are HMAC-signed HttpOnly cookies — see lib/auth.js.

import {
  authConfigured,
  getSessionUserId,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const configured = authConfigured();
  if (!configured) return Response.json({ configured, user: null });
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ configured, user: null });
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT email FROM users WHERE id = ${userId}`;
    return Response.json({ configured, user: rows[0] ? { email: rows[0].email } : null });
  } catch {
    return Response.json({ configured, user: null });
  }
}

export async function POST(req) {
  if (!authConfigured()) {
    return Response.json(
      { error: "Accounts need AUTH_SECRET, POSTGRES_URL and BLOB_READ_WRITE_TOKEN configured." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body?.action;

  if (action === "logout") {
    await clearSessionCookie();
    return Response.json({ ok: true });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  await ensureSchema();

  if (action === "signup") {
    const passwordHash = await hashPassword(password);
    try {
      const { rows } = await sql`
        INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash})
        RETURNING id, email`;
      await setSessionCookie(rows[0].id);
      return Response.json({ user: { email: rows[0].email } });
    } catch (err) {
      if (String(err?.message).includes("duplicate key")) {
        return Response.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      throw err;
    }
  }

  if (action === "login") {
    const { rows } = await sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return Response.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    await setSessionCookie(user.id);
    return Response.json({ user: { email: user.email } });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
