"use client";

import { useEffect, useRef, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import StageCard from "@/components/StageCard";
import AchievementPanel from "@/components/AchievementPanel";
import CustomizePanel from "@/components/CustomizePanel";
import ReactionsPanel from "@/components/ReactionsPanel";
import { DEFAULT_OPTIONS, buildEditInstruction } from "@/lib/customize";
import { saveAvatar, saveClip, getAvatar, ACTIVE_AVATAR_KEY } from "@/lib/library";
import { fetchAccount, createCloudAvatar, getCloudAvatar, saveCloudClip } from "@/lib/cloud";

const STEPS = [
  { id: 1, label: "Photo" },
  { id: 2, label: "Customize" },
  { id: 3, label: "Animate" },
];

function prepareImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Cloud references are remote Blob URLs — CORS keeps the canvas readable.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, 768 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.7, 0.55, 0.4]) {
        const out = canvas.toDataURL("image/jpeg", q);
        if (out.length * 0.75 < 240 * 1024 || q === 0.4) {
          resolve(out);
          return;
        }
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function Studio() {
  const [step, setStep] = useState(1);
  const [pipeline, setPipeline] = useState({ gemini: false, video: false });
  const userRef = useRef(null);

  const [photo, setPhoto] = useState(null);
  const [stylized, setStylized] = useState(null);
  const [stylizing, setStylizing] = useState(false);
  const [stylizedIsMock, setStylizedIsMock] = useState(false);
  const [stylizeError, setStylizeError] = useState(null);

  const [avatarId, setAvatarId] = useState(null);
  const [clips, setClips] = useState({});
  const [generating, setGenerating] = useState({});
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [applying, setApplying] = useState(false);

  // Mutable refs so async generation closures always see current state.
  const clipsRef = useRef({});
  const generatingRef = useRef({});
  const avatarIdRef = useRef(null);
  const stylizedRef = useRef(null);
  const preparedRef = useRef(null); // cached Promise<prepared image>

  useEffect(() => {
    fetch("/api/stylize")
      .then((r) => r.json())
      .then((j) => setPipeline((p) => ({ ...p, gemini: !!j.configured })))
      .catch(() => {});
    fetch("/api/animate")
      .then((r) => r.json())
      .then((j) => setPipeline((p) => ({ ...p, video: !!j.configured })))
      .catch(() => {});

    const accountReady = fetchAccount()
      .then((j) => {
        userRef.current = j.user;
        return j.user;
      })
      .catch(() => null);

    // Resume the last-opened avatar: local IndexedDB cache first, then the
    // cloud library (avatars created on another device play from Blob URLs).
    const activeId = localStorage.getItem(ACTIVE_AVATAR_KEY);
    if (activeId) {
      const restore = (image, loaded) => {
        clipsRef.current = loaded;
        setClips(loaded);
        stylizedRef.current = image;
        setStylized(image);
        avatarIdRef.current = activeId;
        setAvatarId(activeId);
        setStep(3);
      };
      getAvatar(activeId)
        .then(async (record) => {
          if (record) {
            const loaded = {};
            for (const [motion, blob] of Object.entries(record.clips || {})) {
              loaded[motion] = URL.createObjectURL(blob);
            }
            restore(record.image, loaded);
            return;
          }
          if (!(await accountReady)) return;
          const remote = await getCloudAvatar(activeId);
          restore(remote.imageUrl, { ...remote.clips });
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
      stylizedRef.current = json.imageDataUrl;
      setStylized(json.imageDataUrl);
      setStylizedIsMock(false);
      preparedRef.current = null;
      return json.imageDataUrl;
    } catch (err) {
      stylizedRef.current = imageDataUrl;
      setStylized(imageDataUrl);
      setStylizedIsMock(true);
      if (pipeline.gemini) setStylizeError(String(err.message || err));
      preparedRef.current = null;
      return imageDataUrl;
    } finally {
      setStylizing(false);
    }
  }

  function handlePhoto(dataUrl) {
    setPhoto(dataUrl);
    setAvatarId(null);
    avatarIdRef.current = null;
    clipsRef.current = {};
    setClips({});
    generatingRef.current = {};
    setGenerating({});
    preparedRef.current = null;
    localStorage.removeItem(ACTIVE_AVATAR_KEY);
    stylize(dataUrl);
  }

  // Called when user clicks "Continue to animation" in step 2. Creates a
  // library record for this reference and advances to step 3.
  async function enterAnimationStep() {
    const img = stylizedRef.current;
    if (!img) return;
    // If we already have an avatar record for this reference, just advance.
    if (avatarIdRef.current) {
      setStep(3);
      return;
    }
    const id = crypto.randomUUID();
    try {
      await saveAvatar({ id, createdAt: Date.now(), image: img, clips: {} });
      localStorage.setItem(ACTIVE_AVATAR_KEY, id);
    } catch {
      // IndexedDB unavailable — animate without persistence.
    }
    if (userRef.current && img.startsWith("data:")) {
      // Signed in: mirror the record to the cloud library (non-blocking).
      createCloudAvatar(id, img).catch(() => {});
    }
    clipsRef.current = {};
    setClips({});
    generatingRef.current = {};
    setGenerating({});
    avatarIdRef.current = id;
    setAvatarId(id);
    setStep(3);
  }

  // Applies the current customize options as a Gemini edit of the reference.
  // Resets the avatar record so the edited reference gets fresh clips.
  async function applyCustomization() {
    if (!stylizedRef.current) return;
    setApplying(true);
    try {
      await stylize(stylizedRef.current, buildEditInstruction(options));
      // Invalidate avatar record — the edited reference needs its own clips.
      avatarIdRef.current = null;
      setAvatarId(null);
      clipsRef.current = {};
      setClips({});
      generatingRef.current = {};
      setGenerating({});
      preparedRef.current = null;
      localStorage.removeItem(ACTIVE_AVATAR_KEY);
    } finally {
      setApplying(false);
    }
  }

  async function generateClip(motion) {
    if (clipsRef.current[motion] || generatingRef.current[motion]) return;

    const startTime = Date.now();
    generatingRef.current = { ...generatingRef.current, [motion]: { startTime } };
    setGenerating({ ...generatingRef.current });

    try {
      const img = stylizedRef.current;
      if (!img) throw new Error("No stylized reference.");
      if (!preparedRef.current) preparedRef.current = prepareImage(img);
      const prepared = await preparedRef.current;

      const res = await fetch("/api/animate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: prepared.split(",")[1], mime: "image/jpeg", motion }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Animation failed (${res.status}).`);

      while (true) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await fetch(`/api/animate?task=${encodeURIComponent(json.taskId)}`);
        const status = await poll.json();
        if (status.status === "completed" && status.videoUrl) {
          const id = avatarIdRef.current;
          if (id && userRef.current) {
            // Replicate's output URL expires — the server re-uploads it to
            // Vercel Blob now, while it's still live (non-blocking).
            saveCloudClip(id, motion, status.videoUrl).catch(() => {});
          }
          let url = status.videoUrl;
          try {
            const blob = await (await fetch(status.videoUrl)).blob();
            url = URL.createObjectURL(blob);
            if (id) saveClip(id, motion, blob).catch(() => {});
          } catch {
            // CDN refused — play remote URL directly.
          }
          clipsRef.current = { ...clipsRef.current, [motion]: url };
          setClips({ ...clipsRef.current });
          return;
        }
        if (status.status === "error") throw new Error(status.message || "Animation failed.");
      }
    } catch {
      // Failed — user can retry by clicking Generate again.
    } finally {
      const next = { ...generatingRef.current };
      delete next[motion];
      generatingRef.current = next;
      setGenerating({ ...next });
    }
  }

  const stepDone = { 1: !!stylized, 2: !!stylized, 3: false };

  return (
    <main className="page" id="studio">
      <div className="studio-steps">
        <div className="studio-steps-list" role="tablist" aria-label="Avatar steps">
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
        <button type="button" className="btn-small" onClick={() => setStep(1)}>
          {photo ? "New photo" : "Start over"}
        </button>
      </div>

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
            onNext={() => setStep(2)}
            onRetry={() => photo && stylize(photo)}
          />
        </section>
      )}

      {step === 2 && (
        <section className="section" aria-label="Step 2 — Customize">
          <div className="section-head">
            <h2 className="section-title">Customize your avatar.</h2>
            <p className="section-sub">Fine-tune the look before animating — grounded, everyday tweaks only.</p>
          </div>
          <div className="customize-grid">
            <div className="card">
              <h3 className="card-title">Reference</h3>
              <p className="card-sub">This is the image your animations will be generated from.</p>
              <div className="preview-frame preview-frame--large">
                {stylizing ? (
                  <span className="placeholder">Regenerating…</span>
                ) : stylized ? (
                  <img
                    src={stylized}
                    alt="Stylized avatar reference"
                    className={stylizedIsMock ? "mock-stylized" : undefined}
                  />
                ) : (
                  <span className="placeholder">Upload a photo first.</span>
                )}
              </div>
              {stylizeError && <p className="error-text">{stylizeError}</p>}
              <div className="panel-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={enterAnimationStep}
                  disabled={!stylized || stylizing}
                >
                  Continue to animation →
                </button>
              </div>
            </div>
            <CustomizePanel
              options={options}
              onChange={setOptions}
              pipelineMode={pipeline.gemini}
              onApply={applyCustomization}
              applying={applying}
            />
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="section" aria-label="Step 3 — Animate">
          <div className="section-head">
            <h2 className="section-title">Meet your avatar.</h2>
            <p className="section-sub">Generate animations on demand — everything is cached to your local library.</p>
          </div>
          <div className="stage-grid">
            <StageCard stylized={stylized} clips={clips} animConfigured={pipeline.video} />
            <div className="panel-stack">
              <AchievementPanel />
              <ReactionsPanel
                clips={clips}
                generating={generating}
                onGenerate={generateClip}
                animConfigured={pipeline.video}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
