// Lazy-loads @imgly/background-removal (WASM, ~25 MB, cached by the browser
// after first use). Returns a blob URL of the transparent PNG.
export async function removeBg(dataUrl) {
  const { removeBackground } = await import("@imgly/background-removal");
  const blob = await removeBackground(dataUrl, {
    // Pull WASM assets from the CDN matching the installed package version.
    publicPath: "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/",
  });
  return URL.createObjectURL(blob);
}
