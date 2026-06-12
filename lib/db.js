// Vercel Postgres: users + avatar metadata. Clip/image bytes live in Vercel
// Blob; rows only hold their URLs (clips as a motion → URL jsonb map, the
// same shape the client uses locally).

import { sql } from "@vercel/postgres";

let schemaReady;

export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS avatars (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          clips JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
    })();
    schemaReady.catch(() => {
      schemaReady = undefined; // retry on next call
    });
  }
  return schemaReady;
}

export { sql };
