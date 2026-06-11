"use client";

import { useEffect, useState } from "react";
import { REACTIONS, REACTION_LABELS, triggerReaction } from "@/lib/reactions";

const ALL_MOTIONS = [
  { motion: "idle", label: "Idle — breathing & blink", type: "idle" },
  { motion: "idle2", label: "Idle — glance variation", type: "idle" },
  ...REACTIONS.map((r) => ({ motion: r, label: REACTION_LABELS[r], type: "reaction" })),
];

function ProgressCircle({ startTime }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startTime;
      setPct(Math.min(90, Math.round((elapsed / 90000) * 90)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const r = 13;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <span className="progress-circle" aria-label={`Generating — ${pct}%`}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-divider)" strokeWidth="3" />
        <circle
          cx="16" cy="16" r={r} fill="none"
          stroke="var(--color-azure)" strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
          style={{ transition: "stroke-dashoffset 0.8s linear" }}
        />
      </svg>
      <span className="progress-circle-pct">{pct}%</span>
    </span>
  );
}

export default function ReactionsPanel({ clips = {}, generating = {}, onGenerate, animConfigured }) {
  return (
    <div className="card">
      <h3 className="card-title">Animations</h3>
      <p className="card-sub">
        Generate each animation on demand — idle loops bring your avatar to life, reactions fire from the achievements panel.
      </p>

      <ul className="reactions-list">
        {ALL_MOTIONS.map(({ motion, label, type }) => {
          const isDone = !!clips[motion];
          const isGenerating = !!generating[motion];

          return (
            <li key={motion} className={`reactions-item${isDone ? " is-done" : ""}`}>
              <span className="reactions-label">
                {isDone && (
                  <svg className="reactions-check" width="14" height="14" viewBox="0 0 14 14" aria-label="Generated">
                    <circle cx="7" cy="7" r="6.5" fill="var(--color-success-bg, #e6f4ea)" stroke="var(--color-success, #2d7a3a)" strokeWidth="1" />
                    <path d="M4 7l2 2 4-4" stroke="var(--color-success, #2d7a3a)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
                {label}
              </span>
              <span className="reactions-actions">
                {isGenerating ? (
                  <ProgressCircle startTime={generating[motion].startTime} />
                ) : isDone ? (
                  type === "reaction" ? (
                    <button
                      type="button"
                      className="btn-small"
                      onClick={() => triggerReaction(motion)}
                    >
                      Play
                    </button>
                  ) : (
                    <span className="reactions-status-badge">Active</span>
                  )
                ) : (
                  <button
                    type="button"
                    className="btn-small"
                    onClick={() => onGenerate(motion)}
                    disabled={!animConfigured}
                    title={!animConfigured ? "Add REPLICATE_API_TOKEN to enable animation" : undefined}
                  >
                    Generate
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {!animConfigured && (
        <p className="card-sub" style={{ marginTop: "var(--spacing-12)" }}>
          Add REPLICATE_API_TOKEN to your deployment to enable animation.
        </p>
      )}
    </div>
  );
}
