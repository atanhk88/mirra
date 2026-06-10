"use client";

import { SKIN_TONES, HAIR_COLORS, HAIRSTYLES, OUTFIT_COLORS } from "@/lib/customize";

function ChipRow({ label, items, value, onPick }) {
  return (
    <div className="option-group">
      <span className="option-label">{label}</span>
      <div className="chip-row" role="group" aria-label={label}>
        {items.map((item, i) => (
          <button
            key={item.value}
            type="button"
            className="color-chip"
            style={{ background: item.value }}
            aria-pressed={value === i}
            aria-label={item.name}
            title={item.name}
            onClick={() => onPick(i)}
          />
        ))}
      </div>
    </div>
  );
}

export default function CustomizePanel({ options, onChange, pipelineMode, onApply, applying }) {
  const set = (patch) => onChange({ ...options, ...patch });

  return (
    <div className="card">
      <h3 className="card-title">Customize</h3>
      <p className="card-sub">
        Grounded, everyday tweaks only — same person, no fantasy.
        {pipelineMode
          ? " Changes batch into one regeneration."
          : " In mock mode changes apply instantly."}
      </p>

      <ChipRow label="Skin tone" items={SKIN_TONES} value={options.skin} onPick={(i) => set({ skin: i })} />
      <ChipRow label="Hair color" items={HAIR_COLORS} value={options.hair} onPick={(i) => set({ hair: i })} />

      <div className="option-group">
        <span className="option-label">Hairstyle</span>
        <div className="segment-bar" role="group" aria-label="Hairstyle">
          {HAIRSTYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              className="segment"
              aria-pressed={options.hairstyle === style.value}
              onClick={() => set({ hairstyle: style.value })}
            >
              {style.name}
            </button>
          ))}
        </div>
      </div>

      <ChipRow label="Outfit color" items={OUTFIT_COLORS} value={options.outfit} onPick={(i) => set({ outfit: i })} />

      <div className="toggle-row">
        <span className="option-label">Glasses</span>
        <button
          type="button"
          className="toggle"
          aria-pressed={options.glasses}
          aria-label="Toggle glasses"
          onClick={() => set({ glasses: !options.glasses })}
        />
      </div>

      <div className="option-group">
        <label className="option-label" htmlFor="tweaks">
          Other tweaks
        </label>
        <div className="field-row" style={{ marginTop: "var(--spacing-8)" }}>
          <input
            id="tweaks"
            className="text-input"
            value={options.tweaks}
            onChange={(e) => set({ tweaks: e.target.value })}
            placeholder="e.g. add a denim jacket"
          />
        </div>
      </div>

      {pipelineMode && (
        <>
          <div className="panel-actions">
            <button type="button" className="btn-primary" onClick={onApply} disabled={applying}>
              {applying ? "Regenerating…" : "Apply & regenerate"}
            </button>
          </div>
          <p className="apply-note">
            Each regeneration re-runs Gemini + Hunyuan3D and takes roughly 30–120 seconds of GPU time.
          </p>
        </>
      )}
    </div>
  );
}
