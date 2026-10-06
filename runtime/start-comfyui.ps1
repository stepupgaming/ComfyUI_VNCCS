# Starts the VNCCS Studio ComfyUI runtime for one app origin.
# Use -Origin http://localhost:3000 while running the app with `pnpm dev`.
param(
    [string]$Root = "F:\VNCCS",
    [string]$Origin = "http://tauri.localhost",
    [int]$Port = 8188
)
$ErrorActionPreference = "Stop"
$comfy = Join-Path $Root "ComfyUI"
Set-Location $comfy
& (Join-Path $comfy ".venv\Scripts\python.exe") main.py --listen 127.0.0.1 --port $Port --enable-cors-header $Origin --preview-method auto
