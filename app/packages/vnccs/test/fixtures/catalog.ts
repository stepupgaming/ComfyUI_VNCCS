import type {
  CatalogEntry,
  ControlCenterCatalog,
} from "../../src/control-center";

/** The live `MIUProject/VNCCS_v3.0` catalog as served by VNCCS 3.2.3, trimmed to the fields the app reads. */

function entry(
  name: string,
  type: string,
  kind: string,
  hf_repo: string,
  hf_path: string,
  local_path: string,
  status: CatalogEntry["status"] = "missing"
): CatalogEntry {
  return { name, type, kind, hf_repo, hf_path, local_path, status };
}

const VNCCS_REPO = "MIUProject/VNCCS_v3.0";

export const QI2_UNET = "Qwen Image 2.1 INT8 ConvRot";
export const VIGGLE_TURBO = "Qwen Image 2.1 Viggle Turbo";

export function liveCatalog(): ControlCenterCatalog {
  return {
    name: "VNCCS Core Models",
    source: "huggingface",
    available_types: ["unet", "checkpoint"],
    models: [
      entry(
        "Flux Klein 9B FP8",
        "unet",
        "Klein9b",
        "MIUProject/FLUX.2-klein-9b-fp8",
        "flux-2-klein-9b-fp8.safetensors",
        "models/diffusion_models/flux-2-klein-9b-fp8.safetensors"
      ),
      entry(
        "MiniMax H3 Ref2VA Pruned FP8 Scaled",
        "unet",
        "minimaxh3",
        "Comfy-Org/MiniMax-H3",
        "diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors",
        "models/diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors"
      ),
      entry(
        "MiniMax H3 Ref2VA Pruned INT8 ConvRot",
        "unet",
        "minimaxh3",
        "Comfy-Org/MiniMax-H3",
        "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        "models/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        "installed"
      ),
      entry(
        QI2_UNET,
        "unet",
        "QI2",
        "Comfy-Org/Qwen-Image-2.1",
        "diffusion_models/qwen_image_2.1_int8_convrot.safetensors",
        "models/diffusion_models/qwen_image_2.1_int8_convrot.safetensors",
        "installed"
      ),
      entry(
        "Anima Base v1.0",
        "unet",
        "Anima",
        "circlestone-labs/Anima",
        "split_files/diffusion_models/anima-base-v1.0.safetensors",
        "models/diffusion_models/anima-base-v1.0.safetensors"
      ),
      entry(
        "ILFlatMix",
        "checkpoint",
        "Illustrious",
        VNCCS_REPO,
        "models/checkpoints/Illustrious/ILFlatMix.safetensors",
        "models/checkpoints/Illustrious/ILFlatMix.safetensors"
      ),
    ],
    clip: [
      entry(
        "Flux Klein Qwen 3 8B Text Encoder",
        "TextEncoder",
        "Klein9b",
        "Comfy-Org/vae-text-encorder-for-flux-klein-9b",
        "split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors",
        "models/text_encoders/qwen_3_8b_fp8mixed.safetensors"
      ),
      entry(
        "MiniMax H3 Qwen3-VL 32B NVFP4 Text Encoder",
        "TextEncoder",
        "minimaxh3",
        "Comfy-Org/MiniMax-H3",
        "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "installed"
      ),
      entry(
        "QI2 Qwen3-VL 8B Text Encoder",
        "TextEncoder",
        "QI2",
        "Comfy-Org/Qwen-Image-2.1",
        "text_encoders/qwen3vl_8b_int8_convrot.safetensors",
        "models/text_encoders/qwen3vl_8b_int8_convrot.safetensors",
        "installed"
      ),
      entry(
        "Anima Qwen 3 0.6B Text Encoder",
        "TextEncoder",
        "Anima",
        "circlestone-labs/Anima",
        "split_files/text_encoders/qwen_3_06b_base.safetensors",
        "models/text_encoders/qwen_3_06b_base.safetensors"
      ),
    ],
    vae: [
      entry(
        "Flux 2 VAE",
        "VAE",
        "Klein9b",
        "Comfy-Org/vae-text-encorder-for-flux-klein-9b",
        "split_files/vae/flux2-vae.safetensors",
        "models/vae/flux2-vae.safetensors"
      ),
      entry(
        "MiniMax H3 Video VAE",
        "VAE",
        "minimaxh3",
        "Comfy-Org/MiniMax-H3",
        "vae/minimax_h3_video_vae_fp16.safetensors",
        "models/vae/minimax_h3_video_vae_fp16.safetensors",
        "installed"
      ),
      entry(
        "MiniMax H3 Audio VAE",
        "AudioVAE",
        "minimaxh3",
        "Comfy-Org/MiniMax-H3",
        "vae/minimax_h3_audio_vae_fp32.safetensors",
        "models/vae/minimax_h3_audio_vae_fp32.safetensors",
        "installed"
      ),
      entry(
        "QI2 VAE",
        "VAE",
        "QI2",
        "Comfy-Org/Qwen-Image-2.1",
        "vae/qwen_image_2.1_vae_bf16.safetensors",
        "models/vae/qwen_image_2.1_vae_bf16.safetensors",
        "installed"
      ),
      entry(
        "Anima VAE",
        "VAE",
        "Anima",
        "circlestone-labs/Anima",
        "split_files/vae/qwen_image_vae.safetensors",
        "models/vae/qwen_image_vae.safetensors"
      ),
    ],
    lora: [
      entry(
        "VNCCS Pose Studio Klein9b",
        "Helper",
        "Klein9b",
        VNCCS_REPO,
        "models/loras/Klein9b/VNCCS_PoseStudioKlein9b_V2.5.safetensors",
        "models/loras/Klein9b/VNCCS_PoseStudioKlein9b_V2.5.safetensors"
      ),
      entry(
        "MiniMax H3 Pose Studio",
        "Helper",
        "minimaxh3",
        VNCCS_REPO,
        "models/loras/MiniMaxH3/VNCCS/VNCCS_PoseStudioH3_V1.safetensors",
        "models/loras/MiniMaxH3/VNCCS/VNCCS_PoseStudioH3_V1.safetensors"
      ),
      entry(
        "TaoMate-H3 3-Step LoRA",
        "TurboLora",
        "minimaxh3",
        "Robert1212star/TaoMate-H3-3Step-ComfyUI",
        "taomate_h3_3step_comfy.safetensors",
        "models/loras/MiniMax/taomate_h3_3step_comfy.safetensors"
      ),
      entry(
        "VNCCS Pose Studio QI2",
        "Helper",
        "QI2",
        VNCCS_REPO,
        "models/loras/QI2.1/VNCCS/VNCCS_QI2_PoseStudioV1.1.safetensors",
        "models/loras/QI2.1/VNCCS/VNCCS_QI2_PoseStudioV1.1.safetensors"
      ),
      entry(
        "VNCCS Clothes Core QI2",
        "Helper",
        "QI2",
        VNCCS_REPO,
        "models/loras/QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors",
        "models/loras/QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors"
      ),
      entry(
        VIGGLE_TURBO,
        "TurboLora",
        "QI2",
        "Viggle/Qwen-Image-2.1-viggle-turbo",
        "Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors",
        "models/loras/QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors"
      ),
      entry(
        "Anima Turbo LoRA",
        "TurboLora",
        "Anima",
        VNCCS_REPO,
        "models/loras/Anima/anima-turbo-lora-v0.1.safetensors",
        "models/loras/Anima/anima-turbo-lora-v0.1.safetensors"
      ),
    ],
    controlnet: [],
    other: [],
  };
}
