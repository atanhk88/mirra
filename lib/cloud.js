"use client";

// Thin client for the cloud library (Vercel Blob + Postgres behind
// /api/avatars). All calls assume a signed-in session; callers fall back to
// the local IndexedDB library when `user` is null.

async function request(url, options) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
  return json;
}

export function fetchAccount() {
  return request("/api/auth");
}

export function authAction(action, email, password) {
  return request("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, email, password }),
  });
}

export function listCloudAvatars() {
  return request("/api/avatars").then((j) => j.avatars);
}

export function getCloudAvatar(id) {
  return request(`/api/avatars/${encodeURIComponent(id)}`);
}

export function createCloudAvatar(id, imageDataUrl) {
  return request("/api/avatars", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, imageDataUrl }),
  });
}

export function deleteCloudAvatar(id) {
  return request(`/api/avatars/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Hands the Replicate output URL to the server, which re-uploads it to Blob.
export function saveCloudClip(id, motion, videoUrl) {
  return request(`/api/avatars/${encodeURIComponent(id)}/clips`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motion, videoUrl }),
  }).then((j) => j.url);
}
