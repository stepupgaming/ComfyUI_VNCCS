# Creates the dedicated VNCCS Studio ComfyUI runtime. Safe to re-run.
# Never downloads diffusion models, text encoders or VAEs.
param(
    [string]$Root = "F:\VNCCS",
    [string]$ComfyCommit = "e638023d"
)
$ErrorActionPreference = "Stop"
$env:UV_LINK_MODE = "copy"

$repo = Split-Path -Parent $PSScriptRoot
$comfy = Join-Path $Root "ComfyUI"
$python = Join-Path $comfy ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force $Root | Out-Null
if (-not (Test-Path $comfy)) {
    git clone --filter=blob:none https://github.com/comfyanonymous/ComfyUI.git $comfy
}
git -C $comfy checkout $ComfyCommit

if (-not (Test-Path $python)) {
    uv venv (Join-Path $comfy ".venv") --python 3.12
}
uv pip install --python $python torch==2.13.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130
uv pip install --python $python -r (Join-Path $comfy "requirements.txt")

$nodes = Join-Path $comfy "custom_nodes"
$link = Join-Path $nodes "ComfyUI_VNCCS"
if (-not (Test-Path $link)) {
    cmd /c mklink /J $link $repo | Out-Null
}
$dependencies = @(
    "AHEKOT/ComfyUI_VNCCS_Utils",
    "ltdrdata/ComfyUI-Impact-Pack",
    "ltdrdata/ComfyUI-Impact-Subpack",
    "yolain/ComfyUI-Easy-Sam3",
    "city96/ComfyUI-GGUF"
)
foreach ($dependency in $dependencies) {
    $target = Join-Path $nodes ($dependency.Split("/")[1])
    if (-not (Test-Path $target)) {
        git clone --depth 1 "https://github.com/$dependency.git" $target
    }
}

# torch stays pinned to the cu130 build above; llama-cpp-python needs the cu130 Qwen35ChatHandler fork.
$requirements = @(Join-Path $repo "requirements.txt") + ($dependencies | ForEach-Object { Join-Path $nodes "$($_.Split('/')[1])\requirements.txt" })
$combined = Join-Path $Root "combined-requirements.txt"
$requirements | Where-Object { Test-Path $_ } | ForEach-Object { Get-Content $_ } |
    Where-Object { $_ -and $_ -notmatch '^\s*#' -and $_ -notmatch '^llama-cpp-python' -and $_ -notmatch '^(torch|torchvision)\s*$' } |
    Sort-Object -Unique | Set-Content $combined
uv pip install --python $python -r $combined
uv pip install --python $python "https://github.com/JamePeng/llama-cpp-python/releases/download/v0.4.2-cu130-win-20261003/llama_cpp_python-0.4.2+cu130-cp312-cp312-win_amd64.whl"
# ComfyUI-Easy-Sam3 imports triton at load time.
uv pip install --python $python "triton-windows==3.8.0.post29"

Copy-Item (Join-Path $PSScriptRoot "extra_model_paths.yaml") (Join-Path $comfy "extra_model_paths.yaml") -Force
Write-Host "VNCCS Studio runtime ready at $comfy"
