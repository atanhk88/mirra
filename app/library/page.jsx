"use client";

// Avatar library: every animated avatar lives in the browser's IndexedDB.
// Cards preview the idle loop (when generated) and support open/delete.

import { useEffect, useState } from "react";
import { listAvatars, deleteAvatar, ACTIVE_AVATAR_KEY } from "@/lib/library";

function ClipPreview({ record }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const blob = record.clips?.idle;
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [record]);

  if (url) return <video src={url} autoPlay muted loop playsInline />;
  return <img src={record.image} alt="Stylized avatar" />;
}

export default function LibraryPage() {
  const [avatars, setAvatars] = useState(null);

  useEffect(() => {
    listAvatars()
      .then(setAvatars)
      .catch(() => setAvatars([]));
  }, []);

  function open(id) {
    localStorage.setItem(ACTIVE_AVATAR_KEY, id);
    window.location.href = "/";
  }

  async function remove(id) {
    if (!confirm("Delete this avatar and all its animation clips? This can’t be undone.")) return;
    await deleteAvatar(id);
    if (localStorage.getItem(ACTIVE_AVATAR_KEY) === id) localStorage.removeItem(ACTIVE_AVATAR_KEY);
    setAvatars((list) => list.filter((a) => a.id !== id));
  }

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <span className="nav-brand">Mirra</span>
          <nav className="nav-links" aria-label="Site">
            <a className="nav-link" href="/">
              Studio
            </a>
            <a className="nav-link" href="/library" aria-current="page">
              Library
            </a>
          </nav>
        </div>
      </header>

      <main className="page">
        <section className="section" aria-label="Avatar library">
          <div className="section-head">
            <h2 className="section-title">Your library.</h2>
            <p className="section-sub">
              Every animated avatar you create is saved here, in your browser — clips and all. Nothing is on a server.
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
                    </p>
                    <div className="panel-actions">
                      <button type="button" className="btn-primary" onClick={() => open(record.id)}>
                        Open
                      </button>
                      <button type="button" className="btn-small" onClick={() => remove(record.id)}>
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
    </>
  );
}
