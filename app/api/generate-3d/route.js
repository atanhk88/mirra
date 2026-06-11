// 3D generation backend. Two interchangeable providers:
//
//   1. Self-hosted Hunyuan3D api_server.py worker (HUNYUAN_SERVER_URL or a
//      per-request x-worker-url header — Colab tunnel URLs rotate).
//   2. Replicate-hosted Hunyuan3D (REPLICATE_API_TOKEN; model overridable via
//      REPLICATE_MODEL, default ndreca/hunyuan3d-2 which produces a textured
//      mesh — the official tencent/hunyuan3d-2 returns an untextured gray
//      mesh).
//
// A worker override or env URL wins over Replicate, so a local GPU can always
// be plugged in without touching the deployment.
//
//   POST { image: <base64> }  → { taskId }
//   GET  ?task=<id>           → JSON status while pending; when finished either
//                               streams the GLB (worker) or returns
//                               { status: "completed", modelUrl } (Replicate —
//                               the client downloads straight from
//                               replicate.delivery, avoiding serverless
//                               response-size limits).
//   GET  (no params)          → { configured, backend } for the UI status line

export const runtime = "nodejs";
export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const REPLICATE_TASK_PREFIX = "replicate:";

function resolveBackend(req) {
  const override = req?.headers.get("x-worker-url");
  if (override && override.trim()) {
    return { type: "worker", url: override.trim().replace(/\/$/, "") };
  }
  if (process.env.HUNYUAN_SERVER_URL) {
    return { type: "worker", url: process.env.HUNYUAN_SERVER_URL.trim().replace(/\/$/, "") };
  }
  if (process.env.REPLICATE_API_TOKEN) {
    return {
      type: "replicate",
      token: process.env.REPLICATE_API_TOKEN,
      model: process.env.REPLICATE_MODEL || "ndreca/hunyuan3d-2",
    };
  }
  return null;
}

// Replicate model outputs vary by deployment: a bare URL string, an array,
// or an object keyed mesh / textured_mesh / model / glb. Prefer textured.
function pickMeshUrl(output) {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((v) => typeof v === "string") || null;
  if (typeof output === "object") {
    for (const key of ["textured_mesh", "mesh", "model", "glb"]) {
      if (typeof output[key] === "string") return output[key];
    }
    return Object.values(output).find((v) => typeof v === "string") || null;
  }
  return null;
}

async function replicateUploadImage(token, base64) {
  const buf = Buffer.from(base64, "base64");
  // Data URLs are only accepted for small payloads; upload via the files API
  // and fall back to a data URL if that fails.
  try {
    const form = new FormData();
    form.append("content", new Blob([buf], { type: "image/png" }), "reference.png");
    const res = await fetch(`${REPLICATE_API}/files`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.urls?.get) return json.urls.get;
    }
  } catch {
    // fall through to data URL
  }
  return `data:image/png;base64,${base64}`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");

  if (!task) {
    const backend = resolveBackend(req);
    return Response.json({ configured: !!backend, backend: backend?.type || null });
  }

  if (task.startsWith(REPLICATE_TASK_PREFIX)) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return Response.json({ error: "REPLICATE_API_TOKEN is not configured." }, { status: 503 });
    }
    const id = task.slice(REPLICATE_TASK_PREFIX.length);
    let res;
    try {
      res = await fetch(`${REPLICATE_API}/predictions/${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch (err) {
      return Response.json({ error: `Replicate unreachable: ${err.message}` }, { status: 502 });
    }
    if (!res.ok) {
      return Response.json({ error: `Replicate status check failed (${res.status}).` }, { status: 502 });
    }
    const json = await res.json();
    if (json.status === "succeeded") {
      const modelUrl = pickMeshUrl(json.output);
      if (!modelUrl) {
        return Response.json({ status: "error", message: "Replicate finished but returned no mesh URL." });
      }
      return Response.json({ status: "completed", modelUrl });
    }
    if (json.status === "failed" || json.status === "canceled") {
      return Response.json({ status: "error", message: String(json.error || `Prediction ${json.status}.`) });
    }
    return Response.json({ status: "processing" });
  }

  // Self-hosted worker task
  const backend = resolveBackend(req);
  if (!backend || backend.type !== "worker") {
    return Response.json({ error: "No Hunyuan3D worker configured." }, { status: 503 });
  }

  let res;
  try {
    res = await fetch(`${backend.url}/status/${encodeURIComponent(task)}`, { cache: "no-store" });
  } catch (err) {
    return Response.json({ error: `Worker unreachable: ${err.message}` }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: `Worker status check failed (${res.status}).` }, { status: 502 });
  }

  const json = await res.json();

  if (json.status === "completed" && json.model_base64) {
    const buf = Buffer.from(json.model_base64, "base64");
    return new Response(buf, {
      headers: {
        "content-type": "model/gltf-binary",
        "content-length": String(buf.length),
        "cache-control": "no-store",
      },
    });
  }

  return Response.json({ status: json.status || "processing", message: json.message });
}

export async function POST(req) {
  const backend = resolveBackend(req);
  if (!backend) {
    return Response.json(
      { error: "No 3D backend configured — set REPLICATE_API_TOKEN or HUNYUAN_SERVER_URL, or paste a worker URL." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.image) {
    return Response.json({ error: "Missing base64 `image`." }, { status: 400 });
  }

  if (backend.type === "replicate") {
    const imageUrl = await replicateUploadImage(backend.token, body.image);
    const headers = { authorization: `Bearer ${backend.token}`, "content-type": "application/json" };
    const input = { image: imageUrl };
    // Quality knobs for the Hunyuan family (guarded so a custom
    // REPLICATE_MODEL with a different schema isn't sent unknown fields).
    // octree_resolution 512 is the big one — the 256 default loses face detail.
    if (backend.model.includes("hunyuan")) {
      input.steps = 50;
      input.octree_resolution = 512;
      input.remove_background = true;
    }

    // REPLICATE_MODEL may pin a version ("owner/name:versionhash"). Without a
    // pin, try the model-scoped endpoint first (works for official models),
    // then fall back to resolving the latest version — community models like
    // the default ndreca/hunyuan3d-2 are only runnable via /predictions with
    // an explicit version.
    let [model, version] = backend.model.split(":");
    let res;
    try {
      if (!version) {
        res = await fetch(`${REPLICATE_API}/models/${model}/predictions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ input }),
        });
        if (res.status === 404 || res.status === 405) {
          const modelRes = await fetch(`${REPLICATE_API}/models/${model}`, {
            headers: { authorization: `Bearer ${backend.token}` },
            cache: "no-store",
          });
          const modelJson = await modelRes.json().catch(() => ({}));
          version = modelJson.latest_version?.id;
          if (!version) {
            return Response.json(
              { error: `Replicate model "${model}" not found or has no published version.` },
              { status: 502 }
            );
          }
          res = null;
        }
      }
      if (!res) {
        res = await fetch(`${REPLICATE_API}/predictions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ version, input }),
        });
      }
    } catch (err) {
      return Response.json({ error: `Replicate unreachable: ${err.message}` }, { status: 502 });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      const detail = json.detail || json.title || JSON.stringify(json).slice(0, 300);
      return Response.json({ error: `Replicate rejected the job (${res.status}). ${detail}` }, { status: 502 });
    }
    return Response.json({ taskId: `${REPLICATE_TASK_PREFIX}${json.id}` });
  }

  let res;
  try {
    res = await fetch(`${backend.url}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: body.image, texture: true }),
    });
  } catch (err) {
    return Response.json({ error: `Worker unreachable: ${err.message}` }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({ error: `Worker rejected the job (${res.status}). ${detail.slice(0, 300)}` }, { status: 502 });
  }

  const json = await res.json();
  if (!json.uid) {
    return Response.json({ error: "Worker returned no task uid." }, { status: 502 });
  }

  return Response.json({ taskId: json.uid });
}
