// Marketing home (landing). Server component — the nav (with account state)
// lives in the layout; the CTAs route to the studio and account pages.

const FEATURES = [
  {
    title: "Looks like you",
    body: "Upload a full-body photo and Gemini redraws you as a grounded Pixar-style character — same hair, build and everyday clothing. Never fantasy.",
  },
  {
    title: "Alive on its own",
    body: "Your avatar breathes, blinks and glances around between real motion clips, so the stage never feels like a frozen picture.",
  },
  {
    title: "Reacts to your wins",
    body: "Log an achievement and it celebrates; remove one and it slumps. Ten reactions — wave, clap, dance, think and more — on demand.",
  },
  {
    title: "Yours, everywhere",
    body: "Create an account and your avatars and clips sync to the cloud, following you across devices. Signed out, everything stays in your browser.",
  },
];

export default function Home() {
  return (
    <>
      <main>
        <section className="hero">
          <p className="hero-eyebrow">Mirra</p>
          <h1 className="hero-headline">You, animated.</h1>
          <p className="hero-sub">
            Turn one full-body photo into a Disney/Pixar-style avatar that breathes, blinks and reacts to everything
            you log — a grounded, recognizable cartoon version of you.
          </p>
          <div className="hero-cta">
            <a className="btn-primary hero-cta-btn" href="/account">
              Create account
            </a>
            <a className="btn-small hero-cta-btn" href="/account">
              Log in
            </a>
            <a className="btn-ghost hero-cta-link" href="/studio">
              Try the studio →
            </a>
          </div>
          <p className="hero-note">No account needed to try it — sign up to sync your avatars across devices.</p>
        </section>

        <section className="page" aria-label="Features">
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <h3 className="card-title">{f.title}</h3>
                <p className="card-sub">{f.body}</p>
              </div>
            ))}
          </div>

          <div className="home-cta card">
            <div>
              <h2 className="card-title">Ready to meet your avatar?</h2>
              <p className="card-sub">
                Start with a photo — it&apos;s processed in memory on the server and never persisted.
              </p>
            </div>
            <div className="home-cta-actions">
              <a className="btn-primary" href="/studio">
                Open the studio
              </a>
              <a className="btn-small" href="/account">
                Create an account
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer" id="privacy">
        <div className="footer-inner">
          Photos are downscaled in your browser and processed in memory on the server — the original upload is never
          persisted. Signed out, avatars and clips live only in your browser. Signed in, they sync to your private
          cloud library.
        </div>
      </footer>
    </>
  );
}
