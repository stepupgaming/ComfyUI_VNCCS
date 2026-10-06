/** Hover help for the Creator fields, from the widget's `FIELD_HELP`. */
export const CREATOR_HELP: Record<string, string> = {
  background_color:
    "Sets the chroma key background color for generated character sheets. Use the color that is easiest to remove in your downstream workflow.",
  sex: "Character gender profile used for prompt defaults and pose/body synchronization.",
  nsfw: "Allows adult-oriented prompt details and generation behavior for this character.",
  age: "Controls the character age used for prompt building and pose/body synchronization.",
  framing:
    "Chooses whether the generated character uses cowboy-shot or full-body framing.",
  style:
    "Selects a visual style template that is added to the character prompt.",
  custom_style:
    "Custom visual style description added to the character prompt.",
  race: "Species presets with automatic visual descriptions in the prompt. Combine species for hybrids or add custom traits; explicit traits override preset defaults.",
  skin_color:
    "Natural and fantasy skin tones. Use the preset picker or enter a custom description.",
  body: "Body type and silhouette details, including chest/body build tags.",
  face: "Face-specific details such as freckles, scars, makeup, or other defining features.",
  hair: "Hair color, color pattern, length, texture, style, and face-framing details.",
  eyes: "Iris colors, eye shapes, pupils, and other eye features.",
  additional_details:
    "Extra persistent character traits that should appear across outfits and emotions.",
  aesthetics:
    "Visual style notes for the character, such as mood, fashion direction, or rendering flavor.",
  generation_mode:
    "Chooses the generation backend profile. Illustrious uses checkpoint-style generation; Anima uses the Qwen/Anima stack.",
  target_size:
    "Sets the generated portrait area from 1.0 to 4.0 megapixels while preserving its aspect ratio.",
  ckpt_name: "Checkpoint used for Illustrious generation.",
  diffusion_model_name: "Diffusion model used for Anima generation.",
  clip_name: "CLIP/text encoder used by the Anima pipeline.",
  vae_name: "VAE used to decode generated images.",
  steps:
    "Number of sampling steps. Higher values can add detail but take longer.",
  sampler: "Sampling algorithm used to denoise the image.",
  cfg: "Prompt guidance strength. Higher values follow the prompt harder; too high can make images brittle.",
  scheduler: "Noise schedule used together with the sampler.",
  seed: "Numeric seed for reproducible generation. Reuse it to get similar results.",
  seed_mode:
    "Toggles fixed seed versus a fresh random seed for each generation.",
  dmd_lora_name: "Turbo/DMD LoRA used by the active generation profile.",
  dmd_lora_strength:
    "Enables or disables the selected Turbo/DMD LoRA strength.",
  age_lora_name:
    "Optional age helper LoRA applied to reinforce the selected age.",
  lora_stack:
    "Additional LoRAs mixed into generation for style or character refinements.",
};

export const OVERHAUL_HELP =
  "Character Overhaul helps Qwen Image 2.1 follow detailed character prompts more closely, including anatomy, colors, and small identifying features. It can also influence the visual style. Start with the recommended strength of 0.5. If requested details are missing or inaccurate, try 0.75 or 1. If the result drifts too far from your chosen style, lower the strength to 0.25 or 0. A value of 0 disables this LoRA. Compare results using the same prompt and seed to judge the balance between detail accuracy and style fidelity.";
