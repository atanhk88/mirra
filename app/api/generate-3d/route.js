// 3D generation backend. Three interchangeable providers, in priority order:
//
//   1. Self-hosted Hunyuan3D api_server.py worker (HUNYUAN_SERVER_URL or a
//      per-request x-worker-url header — Colab tunnel URLs rotate).
//   2. Meshy hosted API (MESHY_API_KEY) — character-focused image-to-3D with
//      a free monthly credit tier.
//   3. Replicate-hosted Hunyuan3D (REPLICATE_API_TOKEN; model overridable via
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
const MESHY_API = "https://api.meshy.ai/openapi/v1/image-to-3d";
const MESHY_TASK_PREFIX = "meshy:";

// Hosts the download proxy is allowed to fetch finished models from.
const PROXY_HOSTS = [/(^|\.)replicate\.delivery$/, /(^|\.)meshy\.ai$/];

function resolveBackend(req) {
  const override = req?.headers.get("x-worker-url");
  if (override && override.trim()) {
    return { type: "worker", url: override.trim().replace(/\/$/, "") };
  }
  if (process.env.HUNYUAN_SERVER_URL) {
    return { type: "worker", url: process.env.HUNYUAN_SERVER_URL.trim().replace(/\/$/, "") };
  }
  if (process.env.MESHY_API_KEY) {
    return { type: "meshy", key: process.env.MESHY_API_KEY };
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

// model → latest version id, cached for the lifetime of the lambda. Creating
// predictions by version through /predictions keeps us to a single
// create-prediction call per generation — accounts with <$5 credit are
// throttled to a burst of 1 such call per minute.
const versionCache = new Map();

async function resolveReplicateVersion(model, token) {
  if (versionCache.has(model)) return versionCache.get(model);
  const res = await fetch(`${REPLICATE_API}/models/${model}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  const id = json.latest_version?.id || null;
  if (id) versionCache.set(model, id);
  return id;
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

  // Download proxy for finished models, used by the client only when the
  // provider's CDN refuses cross-origin fetches. Restricted to known hosts.
  const proxy = searchParams.get("proxy");
  if (proxy) {
    let host;
    try {
      host = new URL(proxy).hostname;
    } catch {
      return Response.json({ error: "Invalid proxy URL." }, { status: 400 });
    }
    if (!PROXY_HOSTS.some((re) => re.test(host))) {
      return Response.json({ error: "Host not allowed." }, { status: 400 });
    }
    let res;
    try {
      res = await fetch(proxy);
    } catch (err) {
      return Response.json({ error: `Download failed: ${err.message}` }, { status: 502 });
    }
    if (!res.ok) {
      return Response.json({ error: `Download failed (${res.status}).` }, { status: 502 });
    }
    return new Response(res.body, {
      headers: { "content-type": "model/gltf-binary", "cache-control": "no-store" },
    });
  }

  if (!task) {
    const backend = resolveBackend(req);
    return Response.json({ configured: !!backend, backend: backend?.type || null });
  }

  if (task.startsWith(MESHY_TASK_PREFIX)) {
    const key = process.env.MESHY_API_KEY;
    if (!key) {
      return Response.json({ error: "MESHY_API_KEY is not configured." }, { status: 503 });
    }
    const id = task.slice(MESHY_TASK_PREFIX.length);
    let res;
    try {
      res = await fetch(`${MESHY_API}/${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${key}` },
        cache: "no-store",
      });
    } catch (err) {
      return Response.json({ error: `Meshy unreachable: ${err.message}` }, { status: 502 });
    }
    if (!res.ok) {
      return Response.json({ error: `Meshy status check failed (${res.status}).` }, { status: 502 });
    }
    const json = await res.json();
    if (json.status === "SUCCEEDED") {
      const modelUrl = json.model_urls?.glb;
      if (!modelUrl) {
        return Response.json({ status: "error", message: "Meshy finished but returned no GLB URL." });
      }
      return Response.json({ status: "completed", modelUrl });
    }
    if (json.status === "FAILED" || json.status === "CANCELED") {
      return Response.json({ status: "error", message: json.task_error?.message || `Task ${json.status.toLowerCase()}.` });
    }
    return Response.json({ status: "processing", progress: json.progress ?? null });
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

  if (backend.type === "meshy") {
    const headers = { authorization: `Bearer ${backend.key}`, "content-type": "application/json" };
    const payload = {
      image_url: `data:image/png;base64,${body.image}`,
      ai_model: process.env.MESHY_AI_MODEL || "meshy-5",
      should_texture: true,
      enable_pbr: false,
      // A-pose meshes read much better under the puppet animation layer.
      pose_mode: "a-pose",
      target_formats: ["glb"],
      target_polycount: 30000,
    };
    let res;
    try {
      res = await fetch(MESHY_API, { method: "POST", headers, body: JSON.stringify(payload) });
      // Optional knobs vary by plan/model generation — retry bare-bones
      // rather than failing the run on a validation nitpick.
      if (res.status === 400 || res.status === 422) {
        res = await fetch(MESHY_API, {
          method: "POST",
          headers,
          body: JSON.stringify({ image_url: payload.image_url }),
        });
      }
    } catch (err) {
      return Response.json({ error: `Meshy unreachable: ${err.message}` }, { status: 502 });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.result) {
      const detail = json.message || JSON.stringify(json).slice(0, 300);
      return Response.json({ error: `Meshy rejected the job (${res.status}). ${detail}` }, { status: 502 });
    }
    return Response.json({ taskId: `${MESHY_TASK_PREFIX}${json.result}` });
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

    // REPLICATE_MODEL may pin a version ("owner/name:versionhash"); otherwise
    // resolve the latest one. One retry on 429 — low-credit accounts get a
    // burst allowance of a single create-prediction call per minute.
    const [model, pinnedVersion] = backend.model.split(":");
    let res;
    try {
      const version = pinnedVersion || (await resolveReplicateVersion(model, backend.token));
      if (!version) {
        return Response.json(
          { error: `Replicate model "${model}" not found or has no published version.` },
          { status: 502 }
        );
      }
      for (let attempt = 0; ; attempt++) {
        res = await fetch(`${REPLICATE_API}/predictions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ version, input }),
        });
        if (res.status !== 429 || attempt >= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 12000));
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
