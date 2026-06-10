"use client";

export default function GeneratePanel({ stylized, stylizedIsMock, gen, onStart, mockMode }) {
  const running = gen.state === "sending" || gen.state === "processing" || gen.state === "texturing";

  const progress =
    gen.state === "sending"
      ? 12
      : gen.state === "processing"
        ? 45
        : gen.state === "texturing"
          ? 78
          : gen.state === "done"
            ? 100
            : 0;

  return (
    <div className="generate-grid">
      <div className="card">
        <h3 className="card-title">Reference</h3>
        <p className="card-sub">This stylized image is what Hunyuan3D sculpts and textures.</p>
        <div className="preview-frame">
          {stylized ? (
            <img src={stylized} alt="Stylized reference" className={stylizedIsMock ? "mock-stylized" : undefined} />
          ) : (
            <span className="placeholder">Add a photo in step 1 first.</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Generate 3D avatar</h3>
        <p className="card-sub">
          {mockMode
            ? "No worker configured — this simulates the pipeline and hands you the mock avatar."
            : "Sculpting and texturing run on your Hunyuan3D worker. Expect 30–120 seconds of GPU time."}
        </p>

        <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-stage">
          {gen.state === "idle" && "Ready when you are."}
          {gen.state === "sending" && "Uploading reference…"}
          {gen.state === "processing" && "Sculpting mesh…"}
          {gen.state === "texturing" && "Painting textures…"}
          {gen.state === "done" && "Done — your avatar is on stage."}
          {gen.state === "error" && "Generation failed."}
        </p>
        {gen.detail && <p className="progress-detail">{gen.detail}</p>}
        {gen.state === "error" && <p className="error-text">{gen.error}</p>}

        <div className="panel-actions">
          <button type="button" className="btn-primary" onClick={onStart} disabled={!stylized || running}>
            {running ? "Generating…" : gen.state === "done" ? "Regenerate" : "Generate 3D avatar"}
          </button>
        </div>
      </div>
    </div>
  );
}
