// Proxy for a self-hosted Hunyuan3D api_server.py worker.
//
//   POST { image: <base64> }      → { taskId }
//   GET  ?task=<id>               → JSON status while pending,
//                                   the finished GLB (model/gltf-binary) when done
//   GET  (no params)              → { configured } for the UI status line
//
// Worker URL comes from HUNYUAN_SERVER_URL, overridable per request via an
// x-worker-url header (Colab tunnel URLs change every session). The proxy is
// stateless — the worker owns all task state, so this runs fine serverless.
//
// Note: streaming a 20–40 MB GLB through a Vercel serverless function can hit
// response-size limits; production should push the GLB to blob storage instead
// (see README).

export const runtime = "nodejs";

function workerUrl(req) {
  const override = req.headers.get("x-worker-url");
  const url = (override || process.env.HUNYUAN_SERVER_URL || "").trim().replace(/\/$/, "");
  return url || null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");

  if (!task) {
    return Response.json({ configured: !!process.env.HUNYUAN_SERVER_URL });
  }

  const worker = workerUrl(req);
  if (!worker) {
    return Response.json({ error: "No Hunyuan3D worker configured." }, { status: 503 });
  }

  let res;
  try {
    res = await fetch(`${worker}/status/${encodeURIComponent(task)}`, { cache: "no-store" });
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
  const worker = workerUrl(req);
  if (!worker) {
    return Response.json({ error: "No Hunyuan3D worker configured — set HUNYUAN_SERVER_URL or paste a worker URL." }, { status: 503 });
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

  let res;
  try {
    res = await fetch(`${worker}/send`, {
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
