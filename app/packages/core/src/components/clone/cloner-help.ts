/** The Cloner widget's field help (`FIELD_HELP`), shown as tooltips. */
export const CLONER_HELP = {
  background_color:
    "Sets the background for generated clone sheets. Alpha requires Qwen Image 2.1 in Control Center.",
  sex: "Character gender profile used for prompt defaults and pose/body synchronization.",
  nsfw: "Allows adult-oriented prompt details and clone generation behavior.",
  age: "Controls the cloned character age used for prompt building and pose/body synchronization.",
  race: "Species or race tags detected or edited for the cloned character.",
  skin_color: "Skin tone tags for the cloned character prompt.",
  hair: "Hair color, length, and style tags for the cloned character.",
  eyes: "Eye color and eye-shape tags for generation.",
  face: "Face details such as makeup, marks, freckles, or other identifying traits.",
  body: "Body type and silhouette tags used when regenerating the clone.",
  additional_details:
    "Extra persistent details that should stay with the cloned character.",
  aesthetics: "Style and mood notes inferred from or added to the clone.",
} as const;
