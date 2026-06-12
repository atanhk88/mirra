// Lean self-contained auth: scrypt password hashing + HMAC-signed session
// cookies, all from node:crypto — no auth dependency. Sessions are stateless
// (userId + expiry, signed with AUTH_SECRET), so there's no session table.

import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "mirra_session";
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured.");
  return s;
}

export function authConfigured() {
  return !!(process.env.AUTH_SECRET && process.env.POSTGRES_URL && process.env.BLOB_READ_WRITE_TOKEN);
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || "").split(":");
  if (!salt || !hex) return false;
  const key = await scryptAsync(password, salt);
  const expected = Buffer.from(hex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86400_000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!uid || Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}

// Current user id from the request cookie, or null.
export async function getSessionUserId() {
  if (!authConfigured()) return null;
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE)?.value);
}

export async function setSessionCookie(userId) {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
