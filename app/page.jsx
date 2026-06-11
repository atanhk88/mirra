"use client";

import { useEffect, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import StageCard from "@/components/StageCard";
import AchievementPanel from "@/components/AchievementPanel";
import CustomizePanel from "@/components/CustomizePanel";
import { DEFAULT_OPTIONS, buildEditInstruction } from "@/lib/customize";
import { saveAvatar, getAvatar, ACTIVE_AVATAR_KEY } from "@/lib/library";

const STEPS = [
  { id: 1, label: "Photo" },
  { id: 2, label: "Your avatar" },
];

export default function Home() {
  const [step, setStep] = useState(1);
  const [pipeline, setPipeline] = useState({ gemini: false, video: false });

  const [photo, setPhoto] = useState(null);
  const [stylized, setStylized] = useState(null);
  const [stylizing, setStylizing] = useState(false);
  const [stylizedIsMock, setStylizedIsMock] = useState(false);
  const [stylizeError, setStylizeError] = useState(null);

  const [avatarId, setAvatarId] = useState(null);
  const [initialClips, setInitialClips] = useState({});
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetch("/api/stylize")
      .then((r) => r.json())
      .then((j) => setPipeline((p) => ({ ...p, gemini: !!j.configured })))
      .catch(() => {});
    fetch("/api/animate")
      .then((r) => r.json())
      .then((j) => setPipeline((p) => ({ ...p, video: !!j.configured })))
      .catch(() => {});

    // Resume the avatar last opened from the library.
    const activeId = localStorage.getItem(ACTIVE_AVATAR_KEY);
    if (activeId) {
      getAvatar(activeId)
        .then((record) => {
          if (!record) return;
          const clips = {};
          for (const [motion, blob] of Object.entries(record.clips || {})) {
            clips[motion] = URL.createObjectURL(blob);
          }
          setStylized(record.image);
          setAvatarId(record.id);
          setInitialClips(clips);
          setStep(2);
        })
        .catch(() => {});
    }
  }, []);

  async function stylize(imageDataUrl, editInstruction) {
    setStylizing(true);
    setStylizeError(null);
    try {
      const res = await fetch("/api/stylize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageDataUrl, editInstruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Stylize failed (${res.status})`);
      setStylized(json.imageDataUrl);
      setStylizedIsMock(false);
      return json.imageDataUrl;
    } catch (err) {
      // Graceful degradation: CSS-filter stand-in keeps the demo flowing.
      setStylized(imageDataUrl);
      setStylizedIsMock(true);
      if (pipeline.gemini) setStylizeError(String(err.message || err));
      return imageDataUrl;
    } finally {
      setStylizing(false);
    }
  }

  function handlePhoto(dataUrl) {
    setPhoto(dataUrl);
    setAvatarId(null);
    setInitialClips({});
    localStorage.removeItem(ACTIVE_AVATAR_KEY);
    stylize(dataUrl);
  }

  // Creates a library record for the current stylized reference and enters
  // the stage — VideoAvatar generates clips and persists them to the record.
  async function animate(imageDataUrl = stylized) {
    if (!imageDataUrl) return;
    const id = crypto.randomUUID();
    try {
      await saveAvatar({ id, createdAt: Date.now(), image: imageDataUrl, clips: {} });
      localStorage.setItem(ACTIVE_AVATAR_KEY, id);
    } catch {
      // IndexedDB unavailable (private browsing etc.) — animate without persistence.
    }
    setInitialClips({});
    setAvatarId(id);
    setStep(2);
  }

  // Customization: one constrained Gemini edit, then a fresh avatar record —
  // the edited character needs its own clips.
  async function applyCustomization() {
    if (!stylized) return;
    setApplying(true);
    try {
      const edited = await stylize(stylized, buildEditInstruction(options));
      await animate(edited);
    } finally {
      setApplying(false);
    }
  }

  const stepDone = { 1: !!stylized, 2: false };

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <span className="nav-brand">Mirra</span>
          <nav className="nav-links" aria-label="Site">
            <a className="nav-link" href="#studio">
              Studio
            </a>
            <a className="nav-link" href="/library">
              Library
            </a>
            <a className="nav-link" href="#privacy">
              Privacy
            </a>
          </nav>
          <span className="nav-badge">New</span>
        </div>
      </header>

      <nav className="stepper" aria-label="Avatar steps">
        <div className="stepper-inner">
          <span className="stepper-title">Mirra</span>
          <div className="stepper-right">
            <div className="stepper-steps">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`stepper-step${stepDone[s.id] ? " is-done" : ""}`}
                  aria-current={step === s.id ? "step" : undefined}
                  onClick={() => setStep(s.id)}
                >
                  <span className="stepper-num">{s.id}</span>
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary" onClick={() => setStep(1)}>
              {photo ? "New photo" : "Start"}
            </button>
          </div>
        </div>
      </nav>

      <main className="page" id="studio">
        {step === 1 && (
          <section className="section" aria-label="Step 1 — Photo">
            <div className="section-head">
              <h2 className="section-title">Start with a photo.</h2>
              <p className="section-sub">Full body, facing the camera. Mirra keeps you recognizably you — never fantasy.</p>
            </div>
            <UploadPanel
              photo={photo}
              onPhoto={handlePhoto}
              stylized={stylized}
              stylizing={stylizing}
              stylizedIsMock={stylizedIsMock}
              stylizeError={stylizeError}
              pipeline={pipeline}
              onAnimate={() => animate()}
              onRetry={() => photo && stylize(photo)}
            />
          </section>
        )}

        {step === 2 && (
          <section className="section" aria-label="Step 2 — Your avatar">
            <div className="section-head">
              <h2 className="section-title">Meet your avatar.</h2>
              <p className="section-sub">It breathes and blinks on its own, and reacts to everything you log.</p>
            </div>
            <div className="stage-grid">
              <StageCard
                stylized={stylized}
                avatarId={avatarId}
                initialClips={initialClips}
                animConfigured={pipeline.video}
              />
              <div className="panel-stack">
                <AchievementPanel />
                <CustomizePanel
                  options={options}
                  onChange={setOptions}
                  pipelineMode={pipeline.gemini}
                  onApply={applyCustomization}
                  applying={applying}
                />
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer" id="privacy">
        <div className="footer-inner">
          Photos are processed in memory on the server and never persisted. Finished avatars and their animation clips
          are stored only in your browser&apos;s local library.
        </div>
      </footer>
    </>
  );
}
