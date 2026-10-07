![Header](images/README.png)

---
<table>
<tr>
<td width="50%" align="center">
<strong>Join The Community</strong><br>
Share results, ask questions, and follow VNCCS updates.<br><br>
<a href="https://discord.com/invite/9Dacp4wvQw" target="_blank"><img src="images/VNCCS_Discord_Button.png" alt="Join our Discord"></a>
</td>
<td width="50%" align="center">
<strong>Support VNCCS</strong><br>
VNCCS is developed independently. Support helps keep the project moving.<br><br>
<a href="https://www.buymeacoffee.com/MIUProject" target="_blank"><img src="images/VNCCS_Donate_Button.png" alt="Support VNCCS"></a>
</td>
</tr>
</table>

---

VNCCS is NOT just another workflow for creating consistent characters, it is a complete pipeline for creating sprites for any purpose. It allows you to create unique characters with a consistent appearance across all images, organise them, manage emotions, clothing, poses, and conduct a full cycle of work with characters.

## Description

Many people want to use neural networks to create graphics, but making a unique character that looks the same in every image is much harder than generating a single picture. With VNCCS, it's as simple as pressing a button (just 4 times).

## VNCCS Studio

VNCCS runs in its own desktop app, **VNCCS Studio** (`app/`). The node pack still installs into ComfyUI, and the app drives that ComfyUI for you, so you never have to wire a graph.

The Control Center, Character Creator, Character Cloner, Clothes Designer, Emotion Studio, Character Generator, Sprite Manager and Migration Assistant widgets now live in the app as pages. Their nodes still exist and run, but they no longer have custom editors in the ComfyUI canvas. The smaller canvas helpers (the VNCCS Pose Generator editor, the VNCCS Pipe LoRA list, the Emotion Generator picker and Character Selector autofill) still ship in `web/`.

The `workflows/VNCCS_3.2_*.json` files are kept as a reference. VNCCS Studio builds the same graphs, with the same node ids, so cached stages are shared between them.

## Installation

VNCCS Studio is built for Windows with an NVIDIA GPU.

1. **Create the runtime.** `runtime\setup-comfyui.ps1` creates a dedicated ComfyUI at `F:\VNCCS\ComfyUI` (change it with `-Root`). It pins the ComfyUI version, sets up a Python 3.12 environment with CUDA 13 PyTorch, links this folder into `custom_nodes`, and installs VNCCS-Utils, Impact Pack, Impact Subpack, Easy-Sam3 and ComfyUI-GGUF. It is safe to run again.
2. **Point it at your models.** The runtime never downloads diffusion models, text encoders or VAEs. Edit `runtime/extra_model_paths.yaml` so it points at the copies you already have, then run the setup script again to copy it into the runtime.
3. **Build the app.** In `app/`, with Node 22 and pnpm 10, run `pnpm install`, then `pnpm tauri build` for the Windows installer or `pnpm tauri dev` for a development window. `app/README.md` lists every command.
4. **Start ComfyUI.** In the desktop app, open **Settings** and press **Start ComfyUI**. When you run the app in a browser with `pnpm dev`, start it yourself with `runtime\start-comfyui.ps1 -Origin http://localhost:1420`.

ComfyUI only trusts privileged VNCCS requests from the exact origin passed to `--enable-cors-header`, which the start script sets for you.

## Step 0: Migration

If you used VNCCS before, your characters are safe. But you need to do one extra step:
Open the **Migration** page, select your characters and click **Migrate Selected** (or **Migrate All**). It will transfer your characters to the new VNCCS format.

!!!MAKE SURE THAT THEY WORK CORRECTLY BEFORE DELETING OLD FOLDER!!!

## Control Center

Let's start from the very beginning. The first thing you need to do is figure out the **Control Center** page.

Inside it, you will find the models that turn your character into different poses and outfits. Choose the one that fits your computer.

- **Qwen Image 2.1** works from your character image to change poses and clothes. It can even give you a transparent background. Less green-screen trouble, yay!
- **Flux Klein9b** makes your sprites in just 4 steps. Want less waiting while trying poses and outfits? Give it a try!
- **MiniMax H3** is a video model, but here it helps you make character sprites! Try it for poses and clothes too, and see which result you like more.

Choose wisely, but in the end nobody is stopping you from trying them all and deciding later.

The Control Center downloads LoRAs and helper files by itself. It never downloads Qwen Image 2.1, MiniMax H3 or Flux base weights; those come from the folders in `extra_model_paths.yaml`.

## Step 1: Create

Next, go to the **Create** page.

The most important thing here is to create a new character and choose the model for generation.

**Illustrious** may be considered old, but it makes excellent characters and has a huge selection of LoRAs for every style and occasion. Do not worry about quality, it will not disappoint you!

**Anima** is a new and cool model. It can do almost everything, but it will need a bit more resources, and there are not as many LoRAs for it yet.

**Qwen Image 2.1** is here too! It can create your character with a transparent background, and the **Turbo** option cuts down the number of generation steps. More time to try different characters, hehe!

I recommend trying all three and deciding for yourself.

Right now you do not have any characters yet, so press **New** and give him or her a name! The name is very important!!! Be creative and unique!

Done? Good job! Now you have two paths:

1. Enter character descriptions or use the pencil buttons to choose curated presets for race, skin tone, body type, face, hair, eyes, and details. Choose sex, age, and generation type. The **NSFW** switch controls whether the base character will have clothes or not :3
2. Press **Character Wizzard**, describe the character you want, and after a little magic the system will set all the needed options by itself. Do not forget to check them!

Race presets include natural-language descriptions of their distinctive anatomy, added automatically to generation prompts in Illustrious, Anima, and Qwen Image 2.1. Select multiple species for hybrids, or enter custom traits; the prompt gives explicit character traits priority over preset defaults. Existing character fields and custom text remain supported. Breast-size presets retain their original tags. The Creator uses `character_template/character_presets_v2.json`; the legacy catalog remains available to the Cloner.

Click the **Style** card to open the style library. Built-in styles and their 1024×1024 WebP previews ship with the node in `character_template/character_styles.json` and `character_template/style_previews/`. Style prompts describe artistic rendering; background, pose and framing remain separate Creator settings.

Choose **Custom style** or **New style** to enter a name, short description, reference and style prompt. **Save style** adds it to **My styles**; **Generate preview** saves it and renders only that style using the current character tags and generation settings, a square portrait and seed 0. **Resolution scale** controls the render quality before the preview is resized to 1024×1024. Previews are composited onto a dark gradient and saved as opaque WebP at quality 90 directly inside the node, rather than ComfyUI's output directory. User styles live in `character_template/character_styles.user.json`, with `user_*.webp` previews alongside the built-in images; these user files are excluded from Git and packaged updates.

The **×** button in the upper-right corner of a user style card opens a deletion confirmation. Confirming removes its library entry and preview, if present. Built-in styles cannot be deleted. Deleting the selected style switches the Creator to its default style.

The **Generate preview** button lets you see what the character will look like without running the whole generation. So press it already, and if you like everything, move on. If you want to make changes, edit the descriptions and press it again!

### Pose Studio

Every step that makes sprites has **Pose Studio** built into its page. It comes from my second project, **VNCCS-Utils**, which the runtime setup installs for you.

Here, the most important thing is to choose the poses you need and how many of them there should be. You can control the model however you want and make absolutely any poses. Also, using the **Import** button, you can load any picture with a character and get a pose just like the one in the picture!

It is also very important that the body proportions of the model fit your character. Age and sex follow the Creator automatically, but nobody will stop you from setting them manually. Also choose height and body type, the result will be much better that way.

### Generator settings

You do not really need to worry about the generator settings, but if you want, you can choose the upscaler model or even turn it off.

In **BG Remove**, you can choose a chroma key preset. **Balanced** is a very good preset, but if it is not enough for you, or if it is too much and starts damaging the character, choose a lighter one.

**SAM3 Details Recovery** makes background removal slower, but it lets you worry less about eye color and clothing elements that are the same color as the background. We will talk about clothes a little later.

Ready? Then press **Generate sheets**! Now just wait, and the magic will do everything for you!

## Step 1.1: Clone

The **Clone** page is basically a complete copy of Create, but it is made for cloning existing character images.

Did you generate the character with another model? Download it from the internet? Take a screenshot from your favorite anime? Draw it yourself, with your own hands? Good job!

Try to make sure the picture is good quality and that the character is full body, otherwise the model will invent everything that is not visible in the picture!

Now load it as the source image, write tags or press **Analyze Tags**, set up everything you need in **Pose Studio**, and do not forget to choose whether you need separate undressed sprites with the **NSFW** button. They are not mandatory, but dressing these characters later will be MUCH easier!

Also try to choose a background color that appears the least in the character. Look at the eyes and hair. If they are green, choose blue. Or the other way around.

Now press **Generate sheets** and look at the result!

## Step 2: Clothes

Now we move to the tastiest part! On the **Clothes** page, you will make clothes for the character. As many sets as you think you need.

Choose a character and press **New**. Give the outfit set a name and get ready to create!

You have two options again:

1. Describe all clothing elements in the needed fields. You do not have to follow them exactly, but the **head** and **face** sections will help you later not to lose details during emotion generation, so do not slack off! If the character has glasses, write them in **face**. A hat goes in **head**. Easy!
2. Press **Clothes Wizzard** and simply describe the clothes you want!

You also have an option to clone any clothes from any picture! Open the **Clone clothes** tab and upload an image of clothes, or a character wearing clothes.

The **Generate preview** button will help you see what your character will look like before starting the big and heavy generation of all poses.

And that is all! Again, do not forget about **Pose Studio**, and press **Generate sheets**!

When you finish the first set, you can press **New** again and create as many outfits as you want!

## Step 3: Emotions

Here we will create emotions for the character! Up to this moment, all sprites had a calm facial expression. This will be our base.

On the **Emotions** page, choose the character you are going to make emotions for. In **Selected costumes**, choose all costumes you want to work with.

Now, in the huge list, click the emotions you need and add them to the selected ones. Also, if by some miracle you did not find what you need, you can add a **Custom** emotion and describe what you want yourself.

After that, you again need to decide which model will do the generation.

**Illustrious** is stable, but the variety of emotions depends very strongly on the exact character, style, and model. Not all emotions may come out equally well.

**Anima** makes very cool emotions, but it is still too young, so it can be unstable. It can change character details too much, so try it yourself and decide what you like better.

**Qwen Image 2.1** can make emotions too! It works on the face and puts it back into your sprite, keeping the rest of the image in place. Describe the expression you want and give it a try!

If you chose **Illustrious** or **Anima**, the most important setting is **Face Detailer Denoise**. It will suggest optimal values by itself, but remember one basic idea: the higher the denoise, the more the original image changes.

More denoise means a brighter emotion, but the character may stop looking like themselves.

Less denoise means a more accurate character, but the emotion may be weaker.

There is no ready-made recipe here. It all depends on the character and the selected model, so be creative and a tiny bit more patient.

For the first try, do not select all costumes and emotions at once. It will take a long time, and if the result does not satisfy you, it will be sad. Better find the optimal settings first, and then go all in!

Press **Generate emotions**, and may luck be with you!

## Sprites

The **Sprites** page shows every character, costume and emotion you have made, and lets you clean up empty folders.

At this point, the current VNCCS features end, but not for long! Planned features include animations, 3D environments and CG image creation inside them, character voice generation, and music track generation for your game or project.

You will find all your sprites in the runtime's `ComfyUI\output\VNCCS\Characters\` folder.

Be careful with them, and do not delete them by accident while cleaning your disk!
![Header](images/v3/footer.png)
