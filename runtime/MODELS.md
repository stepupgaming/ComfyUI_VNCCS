# VNCCS Studio model map

Every weight file VNCCS Studio loads on the reference machine, what loads it, where
it comes from, and which folder serves it.

ComfyUI looks in `F:\VNCCS\ComfyUI\models` first (the Control Center downloads
there), then in the `extra_model_paths.yaml` entries in file order. Keep the files
every run loads on the SSD (`F:`) and leave archives on the HDD (`G:`): loading the
H3 diffusion model from `G:` made one H3 sheet take about 8 minutes.

Folders below are relative to `F:\VNCCS\ComfyUI\models` unless they start with a drive.

The Control Center downloads each catalog file at the Hugging Face commit pinned in
`_CATALOG_REVISIONS` (`nodes/vnccs_control_center.py`), as long as the catalog lists the
pinned version. Every installed file here matches its pin. When the catalog raises a
file's version, the Control Center downloads the latest copy instead; add a new pin for it.

## QI2 (Qwen Image 2.1): Creator, Clone, Clothes, Emotions, Sprites

| Role | File | Source | Served from |
| --- | --- | --- | --- |
| Diffusion model | `qwen_image_2.1_int8_convrot.safetensors` | `Comfy-Org/Qwen-Image-2.1` | `F:\Models\qwen-image-2.1\diffusion_models` |
| Text encoder | `qwen3vl_8b_int8_convrot.safetensors` | `Comfy-Org/Qwen-Image-2.1` | `F:\Models\qwen-image-2.1\text_encoders` |
| VAE | `qwen_image_2.1_vae_bf16.safetensors` | `Comfy-Org/Qwen-Image-2.1` | `F:\Models\qwen-image-2.1\vae` |
| Turbo LoRA | `QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors` | `Viggle/Qwen-Image-2.1-viggle-turbo` | `loras` |
| Creator overhaul | `QI2.1/VNCCS/VNCCS_QI2_AnimeOverhaulV1.2.safetensors` | `MIUProject/VNCCS_v3.0` | `loras` |
| Clothes Core | `QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors` | `MIUProject/VNCCS_v3.0` | `loras` |
| Pose Studio | `QI2.1/VNCCS/VNCCS_QI2_PoseStudioV1.1.safetensors` | `MIUProject/VNCCS_v3.0` | `loras` |
| Upscaler decode VAE | `texture_fix_vae_for_qwen_image_2.1_bf16.safetensors` | `madebyollin/texture-fix-vae-for-qwen-image-2.1` at `702909b4` | `F:\Models\qwen-image-2.1\vae` |
| Upscaler Consistency LoRA | `QI2/Consistency/qwen-image-2.1-consistency.safetensors` | `ausboss/Qwen-Image-2.1-Consistency-LoRA` at `8f05b0fa` | `loras` |

The QI2 upscaler downloads its two files at the pinned revisions on first use if they are
missing. Both use the non-commercial Qwen Research license.

## MiniMax H3: sheets when a character uses the H3 family

| Role | File | Source | Served from |
| --- | --- | --- | --- |
| Diffusion model (Ref2VA) | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `Comfy-Org/MiniMax-H3` | `F:\Models\MiniMax-H3-Comfy\diffusion_models` |
| Text encoder | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `Comfy-Org/MiniMax-H3` | `C:\Projects\minimax-h3\checkpoints\text_encoders` |
| Video VAE | `minimax_h3_video_vae_fp16.safetensors` | `Comfy-Org/MiniMax-H3` | `C:\Projects\minimax-h3\checkpoints\vae` |
| Audio VAE | `minimax_h3_audio_vae_fp32.safetensors` | `Comfy-Org/MiniMax-H3` | `C:\Projects\minimax-h3\checkpoints\vae` |
| Turbo LoRA | `MiniMax/taomate_h3_3step_comfy.safetensors` | `Robert1212star/TaoMate-H3-3Step-ComfyUI` | `loras` |
| Clothes Core | `MiniMaxH3/VNCCS/VNCCS_ClothesCoreMiniMaxH3V1.safetensors` | `MIUProject/VNCCS_v3.0` | `loras` |
| Pose Studio | `MiniMaxH3/VNCCS/VNCCS_PoseStudioH3_V1.safetensors` | `MIUProject/VNCCS_v3.0` | `loras` |

`C:\Projects\minimax-h3\checkpoints\diffusion_models` holds FL2VA weights, which Studio
cannot use, so `extra_model_paths.yaml` maps only that folder's text encoders, VAEs and
LoRAs.

## Wizards and helpers

| Role | File | Loaded by | Source | Served from |
| --- | --- | --- | --- | --- |
| Wizard and Clone analysis VLM | `llm/Qwen3.5-4B/Qwen3.5-4B-Q8_0.gguf`, `mmproj-F16.gguf` | VNCCS (`nodes/vnccs_utils.py`) | `unsloth/Qwen3.5-4B-GGUF` at `e966ccab` | `llm` |
| Sprite alpha recovery | `sam3/sam3-fp16.safetensors` | VNCCS through Easy-Sam3 | `yolain/sam3-safetensors` at `eb174af9` | `sam3` |
| Face detailer detector | `ultralytics/bbox/face_yolov8m.pt` | VNCCS through Impact Subpack | `Bingsu/adetailer` (main) | `ultralytics` |
| Face detailer SAM | `sams/sam_vit_b_01ec64.pth` | VNCCS through Impact Pack | `dl.fbaipublicfiles.com/segment_anything` | `sams` |
| Pose Studio 3D body | `sam3dbody/model.ckpt`, `sam3dbody/assets/mhr_model.pt` | VNCCS Utils | `jetjodh/sam-3d-body-dinov3` (unpinned) | `sam3dbody` |
| Pose Studio subject mask | `birefnet/BiRefNet_lite/model.safetensors` | VNCCS Utils | `ZhengPeng7/BiRefNet_lite` (unpinned) | `birefnet` |

## HDD archive (not loaded by default)

`G:\Models\qwen-image-2.1\text_encoders` keeps the Qwen3.5 9B prompt enhancers and
`G:\Models\MiniMax-H3-Comfy` keeps the bf16 and unpruned H3 variants. They stay mapped
in `extra_model_paths.yaml` after the SSD entries so a workflow that asks for them still
finds them.

The Control Center catalog also lists Anima, Illustrious and Flux Klein models. None are
installed here; download them from the Control Center if a character needs them.
