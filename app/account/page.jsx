"use client";

// Account: email + password sign in / sign up. Signing in unlocks the cloud
// library — avatars and clips sync to Vercel Blob/Postgres and follow you
// across devices. Signed out, everything stays in this browser's IndexedDB.

import { useEffect, useState } from "react";
import { fetchAccount, authAction } from "@/lib/cloud";

export default function AccountPage() {
  const [account, setAccount] = useState(null); // { configured, user } | null while loading
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAccount()
      .then(setAccount)
      .catch(() => setAccount({ configured: false, user: null }));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await authAction(mode, email, password);
      setAccount((a) => ({ ...a, user }));
      setPassword("");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await authAction("logout");
      setAccount((a) => ({ ...a, user: null }));
    } finally {
      setBusy(false);
    }
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
            <a className="nav-link" href="/library">
              Library
            </a>
            <a className="nav-link" href="/account" aria-current="page">
              Account
            </a>
          </nav>
        </div>
      </header>

      <main className="page">
        <section className="section" aria-label="Account">
          <div className="section-head">
            <h2 className="section-title">Your account.</h2>
            <p className="section-sub">
              Sign in to sync avatars and clips to your cloud library — they follow you across devices.
            </p>
          </div>

          <div className="account-card card">
            {account === null ? (
              <p className="card-sub" style={{ margin: 0 }}>
                Loading…
              </p>
            ) : !account.configured ? (
              <>
                <h3 className="card-title">Cloud sync isn&apos;t configured</h3>
                <p className="card-sub">
                  Accounts need <code>AUTH_SECRET</code>, <code>POSTGRES_URL</code> and{" "}
                  <code>BLOB_READ_WRITE_TOKEN</code> in the deployment env. Until then, avatars are stored only in
                  this browser&apos;s local library — everything else works as usual.
                </p>
              </>
            ) : account.user ? (
              <>
                <h3 className="card-title">Signed in</h3>
                <p className="card-sub">
                  {account.user.email} — new avatars and clips sync to your cloud library automatically.
                </p>
                <div className="panel-actions">
                  <button type="button" className="btn-small" onClick={signOut} disabled={busy}>
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="card-title">{mode === "login" ? "Sign in" : "Create an account"}</h3>
                <p className="card-sub">
                  {mode === "login"
                    ? "Welcome back — your cloud library is waiting."
                    : "Email and a password (8+ characters) is all it takes."}
                </p>
                <form className="account-form" onSubmit={submit}>
                  <input
                    className="text-input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    className="text-input"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="Password"
                    aria-label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  {error && <p className="error-text">{error}</p>}
                  <div className="panel-actions" style={{ marginTop: 0 }}>
                    <button type="submit" className="btn-primary" disabled={busy}>
                      {busy ? "One moment…" : mode === "login" ? "Sign in" : "Sign up"}
                    </button>
                    <button
                      type="button"
                      className="btn-small"
                      onClick={() => {
                        setMode(mode === "login" ? "signup" : "login");
                        setError(null);
                      }}
                    >
                      {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
                    </button>
                  </div>
                </form>
                <p className="card-sub" style={{ marginTop: "var(--spacing-16)" }}>
                  Signed out, avatars stay in this browser&apos;s local library only.
                </p>
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
