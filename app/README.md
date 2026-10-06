# VNCCS Studio

A desktop app (Next.js static export inside Tauri 2) that drives a dedicated
ComfyUI with VNCCS installed. It talks to ComfyUI over HTTP and WebSocket
through [comfy-ts](https://github.com/rvion/comfy-ts) and the `/vnccs/*` routes.

## Layout

```
apps/native/        Next.js app (static export) + src-tauri (Rust shell, runtime launcher)
packages/core/      Pages, layout, stores, hooks
packages/ui/        shadcn/ui primitives and global styles
packages/vnccs/     ComfyUI client: REST transport, prompt graph builders, comfy-ts runner
```

## Runtime

The app expects a dedicated ComfyUI created by `runtime/setup-comfyui.ps1`
(default `F:\VNCCS\ComfyUI`). ComfyUI must be started with
`--enable-cors-header <app origin>`; VNCCS trusts privileged requests from that
exact origin only.

| Mode | App origin |
| --- | --- |
| `pnpm dev` / `pnpm tauri dev` | `http://localhost:1420` |
| Installed desktop app | `http://tauri.localhost` |

The desktop app can start and stop ComfyUI itself (Settings). In a browser,
start it by hand:

```powershell
runtime\start-comfyui.ps1 -Origin http://localhost:1420
```

## Model downloads

The Control Center page downloads catalog LoRAs and helper files into the
runtime's `models/` folder. It never downloads Qwen Image 2.1, MiniMax H3 or
Flux base weights (diffusion models, text encoders, VAEs), nor Klein9b LoRAs:
`packages/vnccs/src/download-guard.ts` refuses them before any request is sent.
Point the runtime at existing copies with `extra_model_paths.yaml` instead.

## Commands

Run from `app/` with pnpm 10:

```bash
pnpm install
pnpm dev            # browser at http://localhost:1420
pnpm tauri dev      # desktop window
pnpm check          # Biome (Ultracite)
pnpm typecheck
pnpm test           # Vitest (packages/vnccs)
pnpm build          # static export
pnpm tauri build    # Windows installer
```

Every build output (Next export, Turbo cache, Cargo target) lives under
`node_modules/`. The repository's pinned security scanner skips `node_modules`
and scans every other `.js`/`.json` file, so a build output anywhere else fails
the Python test suite.
