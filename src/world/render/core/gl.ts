// Which GL the world runs on. A software rasteriser — SwiftShader in headless
// Chromium and on CI, llvmpipe, a browser without a GPU — draws on the CPU:
// whatever a module paints on the "GPU" at init costs seconds there, so such
// work takes a cheaper path, and the capture log flags the frame times as
// not comparable (capture/api.ts).

/**
 * The name of the GL renderer. Chromium masks RENDERER as "WebKit WebGL" and
 * answers through the debug extension; Firefox and Safari answer RENDERER
 * itself and warn about the extension, so it is asked only when needed.
 */
export function glRendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const plain: unknown = gl.getParameter(gl.RENDERER);
  if (typeof plain === "string" && plain !== "WebKit WebGL") return plain;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const name: unknown = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : plain;
  return typeof name === "string" ? name : "unknown";
}

/** Whether a GL renderer name belongs to a software rasteriser. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|software|mesa offscreen/i.test(name);
}
