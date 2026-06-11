// Minimal Replicate REST helpers shared by API routes.

const REPLICATE_API = "https://api.replicate.com/v1";

// model → latest version id, cached for the lifetime of the lambda. Creating
// predictions by version through /predictions keeps us to a single
// create-prediction call per generation — accounts with <$5 credit are
// throttled to a burst of 1 such call per minute.
const versionCache = new Map();

export async function resolveVersion(model, token) {
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

// modelSpec may pin a version ("owner/name:versionhash"); otherwise the
// latest version is resolved. One retry on 429 — low-credit accounts get a
// burst allowance of a single create-prediction call per minute.
export async function createPrediction(token, modelSpec, input) {
  const [model, pinnedVersion] = modelSpec.split(":");
  const version = pinnedVersion || (await resolveVersion(model, token));
  if (!version) {
    throw new Error(
      `Replicate model "${model}" could not be resolved — model name, published version, or REPLICATE_API_TOKEN may be wrong.`
    );
  }
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ version, input }),
    });
    if (res.status !== 429 || attempt >= 1) break;
    await new Promise((resolve) => setTimeout(resolve, 12000));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) {
    const detail = json.detail || json.title || JSON.stringify(json).slice(0, 300);
    throw new Error(`Replicate rejected the job (${res.status}). ${detail}`);
  }
  return json;
}

export async function getPrediction(token, id) {
  const res = await fetch(`${REPLICATE_API}/predictions/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Replicate status check failed (${res.status}).`);
  }
  return res.json();
}

// Prediction outputs vary by model: a bare URL string, an array, or an
// object of named files.
export function pickFileUrl(output) {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((v) => typeof v === "string") || null;
  if (typeof output === "object") {
    return Object.values(output).find((v) => typeof v === "string") || null;
  }
  return null;
}
