// Avatar library: IndexedDB persistence for animated 2D avatars.
// Replicate's output URLs expire, so finished clips are downloaded once and
// stored locally as Blobs — replays are instant and nothing leaves the
// browser. Record shape:
//   { id, createdAt, image: <stylized dataURL>, clips: { [motion]: Blob } }

const DB_NAME = "mirra-library";
const STORE = "avatars";

export const ACTIVE_AVATAR_KEY = "mirra-active-avatar";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAvatar(record) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
}

export async function getAvatar(id) {
  const db = await openDb();
  const result = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
  return result || null;
}

export async function listAvatars() {
  const db = await openDb();
  const all = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  return (all || []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteAvatar(id) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
}

export async function saveClip(id, motion, blob) {
  const record = await getAvatar(id);
  if (!record) return;
  record.clips = { ...(record.clips || {}), [motion]: blob };
  await saveAvatar(record);
}
