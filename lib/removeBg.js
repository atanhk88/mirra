// Lazy-loads @imgly/background-removal on first call (WASM + models, cached
// by the browser after first use). The library resolves its model assets from
// its own CDN (staticimgly.com) by default — no publicPath override needed.
// Returns a blob URL of the transparent PNG.
export async function removeBg(dataUrl) {
  const { removeBackground } = await import("@imgly/background-removal");
  const blob = await removeBackground(dataUrl);
  return URL.createObjectURL(blob);
}
