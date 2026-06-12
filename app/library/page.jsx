"use client";

// Avatar library. Local IndexedDB records are merged with the signed-in
// user's cloud library (Vercel Blob + Postgres): local blobs win for previews
// (instant), cloud-only avatars stream from their Blob URLs. Deleting removes
// the avatar from both.

import { useEffect, useState } from "react";
import { listAvatars, deleteAvatar, ACTIVE_AVATAR_KEY } from "@/lib/library";
import { fetchAccount, listCloudAvatars, deleteCloudAvatar } from "@/lib/cloud";

function ClipPreview({ record }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const idle = record.clips?.idle;
    if (!idle) return;
    if (typeof idle === "string") {
      setUrl(idle);
      return;
    }
    const u = URL.createObjectURL(idle);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [record]);

  if (url) return <video src={url} autoPlay muted loop playsInline />;
  return <img src={record.image} alt="Stylized avatar" />;
}

export default function LibraryPage() {
  const [avatars, setAvatars] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const locals = await listAvatars().catch(() => []);
      const byId = new Map(locals.map((r) => [r.id, { ...r, cloud: false }]));

      const account = await fetchAccount().catch(() => null);
      if (account?.user) {
        setUser(account.user);
        const remote = await listCloudAvatars().catch(() => []);
        for (const r of remote) {
          const local = byId.get(r.id);
          if (local) {
            local.cloud = true;
          } else {
            byId.set(r.id, {
              id: r.id,
              createdAt: r.createdAt,
              image: r.imageUrl,
              clips: r.clips || {},
              cloud: true,
            });
          }
        }
      }
      setAvatars([...byId.values()].sort((a, b) => b.createdAt - a.createdAt));
    })();
  }, []);

  function open(id) {
    localStorage.setItem(ACTIVE_AVATAR_KEY, id);
    window.location.href = "/studio";
  }

  async function remove(record) {
    const where = record.cloud ? "from this browser and your cloud library" : "from this browser";
    if (!confirm(`Delete this avatar and all its animation clips ${where}? This can’t be undone.`)) return;
    await deleteAvatar(record.id).catch(() => {});
    if (record.cloud) await deleteCloudAvatar(record.id).catch(() => {});
    if (localStorage.getItem(ACTIVE_AVATAR_KEY) === record.id) localStorage.removeItem(ACTIVE_AVATAR_KEY);
    setAvatars((list) => list.filter((a) => a.id !== record.id));
  }

  return (
    <main className="page">
        <section className="section" aria-label="Avatar library">
          <div className="section-head">
            <h2 className="section-title">Your library.</h2>
            <p className="section-sub">
              {user
                ? `Signed in as ${user.email} — avatars sync to your cloud library and follow you across devices.`
                : "Avatars are stored in this browser. Sign in on the Account page to sync them to the cloud."}
            </p>
          </div>

          {avatars === null ? (
            <p className="placeholder">Loading…</p>
          ) : avatars.length === 0 ? (
            <div className="card">
              <p className="card-sub" style={{ margin: 0 }}>
                No avatars yet.{" "}
                <a href="/" className="nav-link" style={{ display: "inline" }}>
                  Create one in the Studio →
                </a>
              </p>
            </div>
          ) : (
            <div className="library-grid">
              {avatars.map((record) => {
                const clipCount = Object.keys(record.clips || {}).length;
                return (
                  <div key={record.id} className="card library-card">
                    <div className="library-preview">
                      <ClipPreview record={record} />
                    </div>
                    <p className="card-sub library-meta">
                      {new Date(record.createdAt).toLocaleString()} · {clipCount} clip{clipCount === 1 ? "" : "s"}
                      {record.cloud ? " · ☁ synced" : " · this browser"}
                    </p>
                    <div className="panel-actions">
                      <button type="button" className="btn-primary" onClick={() => open(record.id)}>
                        Open
                      </button>
                      <button type="button" className="btn-small" onClick={() => remove(record)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
    </main>
  );
}
