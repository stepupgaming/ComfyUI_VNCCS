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
# Upstream fixes newer than the pinned commit; drop each once the pin includes it.
# qwen-image21-cache-scope.patch: comfyanonymous/ComfyUI#16667 (int8/int4 QI2 cache vs the model compiler).
foreach ($patch in Get-ChildItem (Join-Path $PSScriptRoot "patches") -Filter *.patch) {
    git -C $comfy apply --reverse --check $patch.FullName 2>$null
    if ($LASTEXITCODE -ne 0) {
        git -C $comfy apply $patch.FullName
        if ($LASTEXITCODE -ne 0) { throw "Could not apply $($patch.Name)" }
    }
}

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
# Pinned to the commits VNCCS Studio was tested against: the app calls Pose
# Studio and helper routes from these packs, so their HEAD can break it.
$dependencies = [ordered]@{
    "AHEKOT/ComfyUI_VNCCS_Utils"     = "eedaed79a7c42d2570d832cc5d2e0a2da5ab022d"
    "ltdrdata/ComfyUI-Impact-Pack"    = "429d0159ad429e64d2b3916e6e7be9c22d025c3c"
    "ltdrdata/ComfyUI-Impact-Subpack" = "50c7b71a6a224734cc9b21963c6d1926816a97f1"
    "yolain/ComfyUI-Easy-Sam3"        = "88fe578a1a5e03d95281197303d5d3a73fd5a089"
    "city96/ComfyUI-GGUF"             = "6ea2651e7df66d7585f6ffee804b20e92fb38b8a"
}
foreach ($dependency in $dependencies.GetEnumerator()) {
    $target = Join-Path $nodes ($dependency.Key.Split("/")[1])
    if (-not (Test-Path $target)) {
        git clone --filter=blob:none "https://github.com/$($dependency.Key).git" $target
    }
    if ((git -C $target rev-parse HEAD) -ne $dependency.Value) {
        git -C $target fetch --depth 1 origin $dependency.Value
        git -C $target checkout --detach $dependency.Value
        if ($LASTEXITCODE -ne 0) { throw "Could not pin $($dependency.Key) to $($dependency.Value)" }
    }
}

# torch stays pinned to the cu130 build above; llama-cpp-python needs the cu130 Qwen35ChatHandler fork.
$requirements = @(Join-Path $repo "requirements.txt") + ($dependencies.Keys | ForEach-Object { Join-Path $nodes "$($_.Split('/')[1])\requirements.txt" })
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
