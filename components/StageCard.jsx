"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import VideoAvatar from "./VideoAvatar";

// three.js must never run on the server.
const Stage = dynamic(() => import("./stage/Stage"), {
  ssr: false,
  loading: () => <div className="stage-loading">Warming up the stage…</div>,
});

const BACKDROPS = [
  { id: "fog", name: "Fog", chip: "var(--color-silver-finish)" },
  { id: "citrus", name: "Citrus", chip: "var(--color-citrus-finish)" },
  { id: "indigo", name: "Indigo", chip: "var(--color-indigo-finish)" },
  { id: "blush", name: "Blush", chip: "var(--color-blush-finish)" },
];

export default function StageCard({ mode, options, modelUrl, puppetUrl, rigged, stylized }) {
  const [backdrop, setBackdrop] = useState("fog");

  const modeLabel =
    mode === "rigged"
      ? "Rigged model — Mixamo clips drive matching reactions"
      : mode === "generated"
        ? "Generated model — whole-body puppet reactions"
        : mode === "video"
          ? "2D animated — AI motion clips from your reference"
          : "Mock avatar — procedural demo character";

  return (
    <div className="stage-card">
      <h3 className="card-title">Your avatar</h3>
      <p className="card-sub">
        {mode === "video" ? "It breathes and blinks on its own — reactions fire from the panels on the right." : "Drag to orbit. Reactions fire from the panels on the right."}
      </p>
      <div className="stage-backdrop" data-backdrop={backdrop}>
        {mode === "video" && stylized ? (
          <VideoAvatar image={stylized} />
        ) : (
          <>
            <Stage mode={mode} options={options} modelUrl={modelUrl} puppetUrl={puppetUrl} rigged={rigged} />
            <div className="swatch-bar" role="group" aria-label="Stage backdrop">
              {BACKDROPS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="swatch"
                  style={{ background: b.chip }}
                  aria-pressed={backdrop === b.id}
                  aria-label={`${b.name} backdrop`}
                  title={b.name}
                  onClick={() => setBackdrop(b.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="stage-meta">
        <span className="stage-mode">{modeLabel}</span>
      </div>
    </div>
  );
}
