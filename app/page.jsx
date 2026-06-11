"use client";

import { useEffect, useRef, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import GeneratePanel from "@/components/GeneratePanel";
import StageCard from "@/components/StageCard";
import AchievementPanel from "@/components/AchievementPanel";
import CustomizePanel from "@/components/CustomizePanel";
import RigPanel from "@/components/RigPanel";
import { DEFAULT_OPTIONS, buildEditInstruction } from "@/lib/customize";

const STEPS = [
  { id: 1, label: "Photo" },
  { id: 2, label: "Generate" },
  { id: 3, label: "Your avatar" },
];

const POLL_MS = 4000;

export default function Home() {
  const [step, setStep] = useState(1);
  const [pipeline, setPipeline] = useState({ gemini: false, worker: false, backend: null });
  const [workerOverride, setWorkerOverride] = useState("");

  const [photo, setPhoto] = useState(null);
  const [stylized, setStylized] = useState(null);
  const [stylizing, setStylizing] = useState(false);
  const [stylizedIsMock, setStylizedIsMock] = useState(false);
  const [stylizeError, setStylizeError] = useState(null);

  const [gen, setGen] = useState({ state: "idle" });
  const [modelUrl, setModelUrl] = useState(null);
  const [rigged, setRigged] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [applying, setApplying] = useState(false);

  const pollRef = useRef(null);
  const mockTimers = useRef([]);

  useEffect(() => {
    fetch("/api/stylize")
      .then((r) => r.json())
      .then((j) => setPipeline((p) => ({ ...p, gemini: !!j.configured })))
      .catch(() => {});
    fetch("/api/generate-3d")
      .then((r) => r.json())
      .then((j) => setPipeline((p) => ({ ...p, worker: !!j.configured, backend: j.backend || null })))
      .catch(() => {});
    return () => stopGeneration();
  }, []);

  function stopGeneration() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    mockTimers.current.forEach(clearTimeout);
    mockTimers.current = [];
  }

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
    setModelUrl(null);
    setRigged(null);
    stylize(dataUrl);
  }

  function startMockGeneration() {
    setGen({ state: "sending", detail: "Mock mode — simulating the worker." });
    mockTimers.current = [
      setTimeout(() => setGen({ state: "processing", detail: "Mock mode — simulating the worker." }), 1200),
      setTimeout(() => setGen({ state: "texturing", detail: "Mock mode — simulating the worker." }), 4200),
      setTimeout(() => {
        setGen({ state: "done", detail: "Mock mode — the procedural avatar stands in for a generated mesh." });
        setStep(3);
      }, 6800),
    ];
  }

  async function startGeneration(imageDataUrl = stylized) {
    if (!imageDataUrl) return;
    stopGeneration();
    setModelUrl(null);
    setRigged(null);

    const realWorker = pipeline.worker || workerOverride.trim();
    if (!realWorker) {
      startMockGeneration();
      return;
    }

    const headers = { "content-type": "application/json" };
    if (workerOverride.trim()) headers["x-worker-url"] = workerOverride.trim();

    try {
      setGen({ state: "sending" });
      const res = await fetch("/api/generate-3d", {
        method: "POST",
        headers,
        body: JSON.stringify({ image: imageDataUrl.split(",")[1] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Worker rejected the job (${res.status})`);
      const taskId = json.taskId;
      setGen({ state: "processing", detail: `Task ${taskId}` });

      pollRef.current = setInterval(async () => {
        try {
          const pollHeaders = workerOverride.trim() ? { "x-worker-url": workerOverride.trim() } : undefined;
          const poll = await fetch(`/api/generate-3d?task=${encodeURIComponent(taskId)}`, { headers: pollHeaders });
          const type = poll.headers.get("content-type") || "";
          if (type.includes("model/gltf-binary")) {
            const blob = await poll.blob();
            stopGeneration();
            setModelUrl(URL.createObjectURL(blob));
            setGen({ state: "done", detail: "Textured GLB streamed from the worker." });
            setStep(3);
            return;
          }
          const status = await poll.json();
          if (status.status === "completed" && status.modelUrl) {
            // Hosted backend: the GLB lives on the provider's CDN — download
            // it client-side to dodge serverless response-size limits.
            stopGeneration();
            setGen({ state: "texturing", detail: "Downloading model…" });
            const glb = await fetch(status.modelUrl);
            if (!glb.ok) throw new Error(`Model download failed (${glb.status}).`);
            const blob = await glb.blob();
            setModelUrl(URL.createObjectURL(blob));
            setGen({ state: "done", detail: "Textured GLB generated by the hosted backend." });
            setStep(3);
          } else if (status.status === "texturing") setGen({ state: "texturing", detail: `Task ${taskId}` });
          else if (status.status === "error") {
            stopGeneration();
            setGen({ state: "error", error: status.message || "Worker reported an error." });
          }
        } catch (err) {
          stopGeneration();
          setGen({ state: "error", error: String(err.message || err) });
        }
      }, POLL_MS);
    } catch (err) {
      setGen({ state: "error", error: String(err.message || err) });
    }
  }

  // Pipeline-mode customization: batch every option into one constrained
  // Gemini edit, then regenerate the mesh.
  async function applyCustomization() {
    if (!stylized) return;
    setApplying(true);
    try {
      const edited = await stylize(stylized, buildEditInstruction(options));
      setStep(2);
      await startGeneration(edited);
    } finally {
      setApplying(false);
    }
  }

  const pipelineMode = pipeline.gemini && (pipeline.worker || workerOverride.trim().length > 0);
  const avatarMode = rigged ? "rigged" : modelUrl ? "generated" : "mock";
  const stepDone = { 1: !!stylized, 2: gen.state === "done", 3: false };

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <span className="nav-brand">Mirra</span>
          <nav className="nav-links" aria-label="Site">
            <a className="nav-link" href="#studio">
              Studio
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
            <button type="button" className="btn-primary" onClick={() => setStep(photo ? 2 : 1)}>
              {photo ? "Generate" : "Start"}
            </button>
          </div>
        </div>
      </nav>

      <section className="hero">
        <p className="hero-eyebrow">Mirra</p>
        <h1 className="hero-headline">You, animated.</h1>
        <p className="hero-sub">
          Upload a full-body photo and meet your Pixar-style 3D self — it breathes, blinks, and celebrates your wins
          right in the page.
        </p>
        <div className="hero-cta">
          <button type="button" className="btn-primary" onClick={() => setStep(1)}>
            Upload a photo
          </button>
        </div>
        <p className="hero-note">Runs end-to-end in mock mode with zero API keys.</p>
      </section>

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
              workerOverride={workerOverride}
              setWorkerOverride={setWorkerOverride}
              onContinue={() => setStep(2)}
              onRetry={() => photo && stylize(photo)}
            />
          </section>
        )}

        {step === 2 && (
          <section className="section" aria-label="Step 2 — Generate">
            <div className="section-head">
              <h2 className="section-title">Sculpt it in 3D.</h2>
              <p className="section-sub">Hunyuan3D turns the stylized reference into a textured mesh.</p>
            </div>
            <GeneratePanel
              stylized={stylized}
              stylizedIsMock={stylizedIsMock}
              gen={gen}
              onStart={() => startGeneration()}
              mockMode={!pipeline.worker && !workerOverride.trim()}
            />
          </section>
        )}

        {step === 3 && (
          <section className="section" aria-label="Step 3 — Your avatar">
            <div className="section-head">
              <h2 className="section-title">Meet your avatar.</h2>
              <p className="section-sub">It idles on its own and reacts to everything you log.</p>
            </div>
            <div className="stage-grid">
              <StageCard mode={avatarMode} options={options} modelUrl={modelUrl} rigged={rigged} />
              <div className="panel-stack">
                <AchievementPanel />
                <CustomizePanel
                  options={options}
                  onChange={setOptions}
                  pipelineMode={pipelineMode}
                  onApply={applyCustomization}
                  applying={applying}
                />
                <RigPanel modelUrl={modelUrl} onRiggedUpload={setRigged} riggedName={rigged?.name} />
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer" id="privacy">
        <div className="footer-inner">
          Photos are processed in memory on the server and never persisted. Keys and worker URLs live server-side or as
          your own typed input — nothing is stored.
        </div>
      </footer>
    </>
  );
}
