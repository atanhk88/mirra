"use client";

import { useRef, useState } from "react";

// Client-side downscale to ≤1024px before anything leaves the browser.
function downscale(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function UploadPanel({
  photo,
  onPhoto,
  stylized,
  stylizing,
  stylizedIsMock,
  stylizeError,
  pipeline,
  workerOverride,
  setWorkerOverride,
  onContinue,
  onRetry,
}) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    onPhoto(await downscale(file));
  }

  const workerOn = pipeline.worker || workerOverride.trim().length > 0;

  return (
    <div className="upload-grid">
      <div className="card">
        <h3 className="card-title">Your photo</h3>
        <p className="card-sub">
          A full-body shot, facing the camera, works best. Processed in memory on the server — the original upload is
          never stored.
        </p>
        <div
          className={`dropzone${drag ? " is-drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          {photo ? (
            <img src={photo} alt="Uploaded full-body" style={{ maxHeight: 220, borderRadius: 10 }} />
          ) : (
            <p className="dropzone-hint">Drag a full-body photo here, or browse. It is downscaled in your browser before upload.</p>
          )}
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
            {photo ? "Choose a different photo" : "Browse photos"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            aria-label="Upload a full-body photo"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Stylized reference</h3>
        <p className="card-sub">
          Gemini redraws you as a grounded Pixar-style character in a relaxed A-pose — the pose image-to-3D rigs best
          from.
        </p>
        <div className="preview-frame">
          {stylizing ? (
            <span className="placeholder">Stylizing…</span>
          ) : stylized ? (
            <img
              src={stylized}
              alt="Stylized cartoon reference"
              className={stylizedIsMock ? "mock-stylized" : undefined}
            />
          ) : (
            <span className="placeholder">Your cartoon reference appears here after you add a photo.</span>
          )}
        </div>
        {stylizedIsMock && stylized && (
          <p className="card-sub" style={{ marginTop: "var(--spacing-12)" }}>
            {pipeline.gemini
              ? "Gemini couldn’t stylize this time — showing a CSS-filter stand-in instead. Retry below."
              : "Mock mode — Gemini isn’t configured, so this is a CSS-filter stand-in of your photo."}
          </p>
        )}
        {stylizeError && <p className="error-text">{stylizeError}</p>}
        {stylized && !stylizing && (
          <div className="panel-actions">
            <button type="button" className="btn-primary" onClick={onContinue}>
              Continue to Generate
            </button>
            {pipeline.gemini && stylizedIsMock && (
              <button type="button" className="btn-small" onClick={onRetry}>
                Retry stylize
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card status-card">
        <h3 className="card-title">Pipeline status</h3>
        <div className="status-line">
          <span className="status-chip">
            Gemini{" "}
            <span className={pipeline.gemini ? "status-on" : "status-off"}>{pipeline.gemini ? "✓ configured" : "— mock mode"}</span>
          </span>
          <span className="status-chip">
            Hunyuan3D worker{" "}
            <span className={workerOn ? "status-on" : "status-off"}>{workerOn ? "✓ reachable" : "— mock mode"}</span>
          </span>
        </div>
        <div className="field-row">
          <label className="field-label" htmlFor="worker-url">
            Worker URL override
          </label>
          <input
            id="worker-url"
            className="text-input"
            value={workerOverride}
            onChange={(e) => setWorkerOverride(e.target.value)}
            placeholder="https://your-tunnel.trycloudflare.com"
          />
        </div>
        <p className="card-sub" style={{ marginTop: "var(--spacing-12)" }}>
          Colab tunnel URLs change each session — paste the current one here. See <code>docs/HUNYUAN_SETUP.md</code>.
          Without keys, everything still demos end-to-end in mock mode.
        </p>
      </div>
    </div>
  );
}
