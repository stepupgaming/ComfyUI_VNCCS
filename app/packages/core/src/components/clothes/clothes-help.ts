/** The Clothes Designer widget's field help (`FIELD_HELP`), shown as tooltips. */
export const CLOTHES_HELP = {
  character:
    "Character whose current body/sprite will be used as the base for clothing generation.",
  costume: "Costume slot to edit or regenerate.",
  top: "Upper-body clothing description, such as shirt, jacket, dress top, sleeves, and colors.",
  bottom:
    "Lower-body clothing description, such as skirt, pants, shorts, belts, and colors.",
  shoes: "Footwear description used in the clothing prompt.",
  head: "Headwear and hair accessories, such as hats, ribbons, crowns, or headphones.",
  face: "Face accessories, such as glasses, mask, piercings, or makeup tied to the outfit.",
  background_color:
    "Sets a solid chroma key background or native transparency for Qwen Image 2.1.",
  lora_name:
    "VNCCS Clothes Core LoRA used to keep outfit generation compatible with this workflow.",
  seed: "Numeric seed for reproducible clothing previews.",
  seed_mode: "Toggles fixed seed versus a fresh random seed for each preview.",
  target_size:
    "Sets the generated image area from 1.0 to 4.0 megapixels while preserving aspect ratio. Auto uses 1.5 MP for H3 and 1.0 MP for other models.",
} as const;

export const CLONE_DESCRIPTION =
  "Upload an image to clone clothes from. The AI will attempt to transfer the outfit to your character.";

export const WIZARD_DESCRIPTION =
  "Describe the outfit in a broad way. The model will expand it into detailed clothing parts.";
