"use client";

import { useRef } from "react";

export default function RigPanel({ modelUrl, onRiggedUpload, riggedName }) {
  const fileRef = useRef();

  function handleFile(file) {
    if (!file) return;
    const ext = file.name.toLowerCase().endsWith(".fbx") ? "fbx" : "glb";
    const url = URL.createObjectURL(file);
    onRiggedUpload({ url, ext, name: file.name });
  }

  return (
    <div className="card">
      <h3 className="card-title">Add a real skeleton</h3>
      <p className="card-sub">
        Auto-rig your avatar for free at Mixamo. Body skeletons only — emotion reads through posture, not facial
        expressions.
      </p>

      <ol className="rig-steps">
        <li>
          Download your generated avatar below, then upload it at{" "}
          <a href="https://www.mixamo.com" target="_blank" rel="noreferrer">
            mixamo.com
          </a>{" "}
          and run the auto-rigger.
        </li>
        <li>Pick clips whose names match the reactions — e.g. Waving, Excited, Thinking, Strut, Sad Idle.</li>
        <li>Export as FBX (or convert to GLB) and upload it back here. Matching clips take over the reactions.</li>
      </ol>

      <div className="panel-actions">
        {modelUrl ? (
          <a className="btn-small" href={modelUrl} download="mirra-avatar.glb">
            Download GLB
          </a>
        ) : (
          <span className="field-label">Generate a 3D model first to download a GLB (mock avatar has no file).</span>
        )}
        <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
          Upload rigged FBX / GLB
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".fbx,.glb"
          className="visually-hidden"
          aria-label="Upload rigged model"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {riggedName && (
        <p className="card-sub" style={{ marginTop: "var(--spacing-12)" }}>
          Loaded <strong>{riggedName}</strong> — named clips now drive matching reactions.
        </p>
      )}
    </div>
  );
}
