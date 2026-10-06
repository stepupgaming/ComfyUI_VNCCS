// Stands in for `sharp` and `ws` in the webview bundle. comfy-ts imports them
// lazily and falls back to native WebSocket and raw image bytes when the
// import fails, so this module must fail to load rather than export nothing.
throw new Error("This module is only available in Node.js");
