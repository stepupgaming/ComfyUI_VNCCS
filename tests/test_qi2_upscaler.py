"""QI2 upscaler: exact-size reference, sampling variants, alignment and pinned downloads."""

import sys
import types

import pytest

torch = pytest.importorskip("torch")

from nodes import character_generator as cg
from nodes.qi2_viggle import VIGGLE_TURBO_NODES

TURBO_ENTRY = {
    "name": "Qwen Image 2.1 Viggle Turbo", "kind": "QI2", "type": "TurboLora",
    "local_path": "models/loras/QI2/Viggle/turbo.safetensors",
}


class Generator(cg.VNCCS_CharacterGenerator):
    def _extract_pipe(self, _pipe):
        return {
            "model": "model", "clip": "clip", "vae": "pipe vae", "seed": 7,
            "model_kind": "qi2", "qi2_cache": {"device": "gpu", "dtype": "int8"},
        }


def _pipe(entries=(TURBO_ENTRY,)):
    # The upscaler may use turbo even when the pose stage leaves it off.
    return types.SimpleNamespace(lora_entries=list(entries), lora_states=[])


def _source(height=48, width=32):
    generator = torch.Generator().manual_seed(3)
    image = torch.rand(1, height, width, 4, generator=generator)
    image[..., 3] = 0.6
    return image


def _record(monkeypatch, decode=None):
    calls = []
    resized = {}

    def fake_node(name, **kwargs):
        calls.append((name, kwargs))
        if name == "ImageScale":
            generator = torch.Generator().manual_seed(5)
            image = torch.rand(1, kwargs["height"], kwargs["width"], kwargs["image"].shape[-1], generator=generator)
            if image.shape[-1] == 4:
                image[..., 3] = 0.6
            resized["image"] = image
            return (image,)
        if name == "TextEncodeQwenImage21":
            height, width = kwargs["images"]["image_1"].shape[1:3]
            return ("positive", "negative", {"samples": torch.zeros(1, 64, height // 16, width // 16)})
        if name == "VAEEncode":
            height, width = kwargs["pixels"].shape[1:3]
            resized["encoded"] = {"samples": torch.ones(1, 64, height // 16, width // 16)}
            return (resized["encoded"],)
        if name == "VAEDecode":
            image = resized["image"] if decode is None else decode(resized["image"])
            # The QI2 VAE always decodes RGBA.
            return (torch.cat([image[..., :3], torch.full_like(image[..., :1], 0.9)], dim=-1),)
        outputs = {
            "LoraLoaderModelOnly": ("consistency model",),
            "QwenImage21Cache": ("cached model",),
            "VAELoader": ("texture vae",),
            "RandomNoise": ("noise",),
            "BasicGuider": ("guider",),
            "KSamplerSelect": ("euler",),
            "SamplerCustomAdvanced": ("turbo samples",),
            "KSampler": ("base samples",),
        }
        return outputs[name]

    monkeypatch.setattr(cg, "_call_comfy_node", fake_node)
    monkeypatch.setattr(cg, "_find_model_on_disk", lambda path: (path, True))
    monkeypatch.setattr(cg, "_ensure_qi2_upscaler_file", lambda key: cg.QI2_UPSCALER_FILES[key]["name"])
    monkeypatch.setattr(cg, "apply_viggle_turbo_lora", lambda model, name, strength: calls.append(
        ("apply_viggle_turbo_lora", {"model": model, "lora_name": name, "strength": strength})
    ) or "turbo model")
    return calls, resized


def _settings(**overrides):
    return {**cg.DEFAULT_WIDGET_DATA["upscaler"], "mode": "qi2", **overrides}


def test_qi2_upscaler_repaint_samples_on_the_encoder_latent_of_an_exact_size_reference(monkeypatch):
    calls, resized = _record(monkeypatch)
    source = _source()

    result = Generator()._run_qi2_upscaler(source, _pipe(), _settings(qi2_target_size=1024), 11, "upscale it")

    names = [name for name, _ in calls]
    assert names == [
        "LoraLoaderModelOnly", "apply_viggle_turbo_lora", "QwenImage21Cache", "VAELoader",
        "ImageScale", "TextEncodeQwenImage21", "RandomNoise", "BasicGuider", "KSamplerSelect",
        "SamplerCustomAdvanced", "VAEDecode",
    ]
    kwargs = dict(calls)
    assert kwargs["LoraLoaderModelOnly"]["lora_name"] == "QI2/Consistency/qwen-image-2.1-consistency.safetensors"
    assert kwargs["apply_viggle_turbo_lora"] == {
        "model": "consistency model", "lora_name": "QI2/Viggle/turbo.safetensors", "strength": 1.0,
    }
    assert kwargs["VAELoader"]["vae_name"] == "texture_fix_vae_for_qwen_image_2.1_bf16.safetensors"
    # 1 MP at the source's 2:3 aspect, both sides on the 32 px grid.
    assert (kwargs["ImageScale"]["width"], kwargs["ImageScale"]["height"]) == (832, 1248)
    assert kwargs["ImageScale"]["upscale_method"] == "lanczos"
    encoder = kwargs["TextEncodeQwenImage21"]
    assert encoder["resolution"] == 0
    assert encoder["images"]["image_1"] is resized["image"]
    assert encoder["vae"] == "pipe vae"
    assert encoder["prompt"] == "upscale it"
    sample = kwargs["SamplerCustomAdvanced"]
    assert sample["latent_image"]["samples"].shape == (1, 64, 78, 52)
    assert len(sample["sigmas"]) == len(VIGGLE_TURBO_NODES) + 1
    assert kwargs["RandomNoise"]["noise_seed"] == 11
    assert kwargs["VAEDecode"]["vae"] == "texture vae"
    assert result.shape == (1, 1248, 832, 4)
    assert torch.equal(result[..., 3], resized["image"][..., 3])
    assert torch.equal(result[..., :3], resized["image"][..., :3])


def test_qi2_upscaler_turbo_detail_pass_starts_at_the_first_raw_node_within_strength(monkeypatch):
    calls, resized = _record(monkeypatch)

    Generator()._run_qi2_upscaler(
        _source(), _pipe(), _settings(qi2_target_size=1024, qi2_pass="detail", qi2_detail_denoise=0.5), 1, "p",
    )

    kwargs = dict(calls)
    assert kwargs["VAEEncode"] == {"pixels": resized["image"], "vae": "pipe vae"}
    sample = kwargs["SamplerCustomAdvanced"]
    assert sample["latent_image"] is resized["encoded"]
    full = cg.viggle_turbo_sigmas({"samples": torch.zeros(1, 64, 78, 52)})
    assert torch.equal(sample["sigmas"], full[VIGGLE_TURBO_NODES.index(0.5):])


def test_qi2_upscaler_base_sampling_uses_ksampler_denoise_and_the_pipe_vae(monkeypatch):
    calls, resized = _record(monkeypatch)

    Generator()._run_qi2_upscaler(
        _source(), _pipe(), _settings(
            qi2_target_size=1024, qi2_sampling="base", qi2_steps=25, qi2_pass="detail",
            qi2_detail_denoise=0.4, qi2_consistency=False, qi2_vae="pipe", qi2_alpha="model",
        ), 3, "p",
    )

    names = [name for name, _ in calls]
    assert "LoraLoaderModelOnly" not in names
    assert "apply_viggle_turbo_lora" not in names
    assert "VAELoader" not in names
    kwargs = dict(calls)
    assert kwargs["QwenImage21Cache"]["model"] == "model"
    sample = kwargs["KSampler"]
    assert sample["latent_image"] is resized["encoded"]
    assert (sample["seed"], sample["steps"], sample["cfg"], sample["denoise"]) == (3, 25, 1.0, 0.4)
    assert (sample["sampler_name"], sample["scheduler"]) == ("euler", "simple")
    assert kwargs["VAEDecode"]["vae"] == "pipe vae"


def test_qi2_upscaler_model_alpha_and_rgb_inputs_keep_their_channel_layout(monkeypatch):
    _record(monkeypatch)
    generator = Generator()

    model_alpha = generator._run_qi2_upscaler(
        _source(), _pipe(), _settings(qi2_target_size=1024, qi2_alpha="model"), 1, "p",
    )
    rgb = generator._run_qi2_upscaler(_source()[..., :3], _pipe(), _settings(qi2_target_size=1024), 1, "p")

    assert torch.allclose(model_alpha[..., 3], torch.full(model_alpha.shape[:3], 0.9))
    assert rgb.shape[-1] == 3


def test_phase_shift_measures_and_translation_undoes_whole_pixel_drift():
    generator = torch.Generator().manual_seed(9)
    image = torch.rand(1, 96, 80, 4, generator=generator)
    moved = cg._translate_image(image, 5, -3)

    assert cg._qi2_phase_shift(image, moved) == (5, -3)
    restored = cg._translate_image(moved, -5, 3)
    assert torch.equal(restored[:, 3:-3, 5:-5], image[:, 3:-3, 5:-5])


def test_qi2_upscaler_correct_mode_moves_drifted_output_back(monkeypatch):
    _calls, resized = _record(monkeypatch, decode=lambda image: cg._translate_image(image, -4, 6))

    result = Generator()._run_qi2_upscaler(
        _source(), _pipe(), _settings(qi2_target_size=1024, qi2_align="correct"), 1, "p",
    )

    assert torch.equal(result[:, 6:-6, 4:-4, :3], resized["image"][:, 6:-6, 4:-4, :3])


def test_qi2_upscaler_requires_a_qi2_pipe_and_the_viggle_lora_for_turbo(monkeypatch):
    _record(monkeypatch)

    class KleinGenerator(cg.VNCCS_CharacterGenerator):
        def _extract_pipe(self, _pipe):
            return {"model_kind": "klein9b"}

    with pytest.raises(RuntimeError, match="needs a Qwen Image 2.1 pipe"):
        KleinGenerator()._run_qi2_upscaler(_source(), _pipe(), _settings(), 1, "p")
    with pytest.raises(RuntimeError, match="Viggle Turbo LoRA"):
        Generator()._run_qi2_upscaler(_source(), _pipe(entries=()), _settings(), 1, "p")


def test_qi2_turbo_lookup_can_ignore_auto_apply_but_only_accepts_viggle(monkeypatch):
    monkeypatch.setattr(cg, "_find_model_on_disk", lambda path: (path, True))
    other = {**TURBO_ENTRY, "name": "Other Turbo", "local_path": "models/loras/other.safetensors"}
    pipe = _pipe(entries=(other, TURBO_ENTRY))
    generator = cg.VNCCS_CharacterGenerator()

    assert generator._qi2_turbo_lora(pipe) == ""
    assert generator._qi2_turbo_lora(pipe, enabled_only=False) == "QI2/Viggle/turbo.safetensors"


def test_run_upscaler_qi2_mode_skips_seedvr_and_keeps_native_alpha(monkeypatch):
    generator = cg.VNCCS_CharacterGenerator()
    captured = {}
    monkeypatch.setattr(generator, "_run_upscaler_models", lambda *args, **kwargs: pytest.fail("SeedVR must not load"))

    def fake_qi2(image, pipe, settings, seed, prompt, **kwargs):
        captured.update(image=image, pipe=pipe, seed=seed, prompt=prompt, stage=kwargs["stage"])
        return image

    monkeypatch.setattr(generator, "_run_qi2_upscaler", fake_qi2)
    source = _source()
    pipe = object()

    result = generator._run_upscaler(
        source, "Green", _settings(qi2_prompt="Sharpen"), 4, stage="original_upscaler",
        bg_remove_settings={"preset": "Native"}, pipe=pipe,
    )

    assert result.shape[-1] == 4
    assert captured["image"].shape[-1] == 4
    assert captured["pipe"] is pipe
    assert captured["seed"] == 4
    assert captured["stage"] == "original_upscaler"
    assert captured["prompt"] == f"Sharpen, {cg.NATIVE_BACKGROUND_PROMPT}"

    generator._run_upscaler(source[..., :3], "Green", _settings(qi2_prompt=""), 4, pipe=pipe)
    assert captured["prompt"] == f"{cg.QI2_UPSCALE_PROMPT}, Change background to solid Green color"

    generator._run_source_upscaler(source, _settings(), 4, pipe=pipe)
    assert captured["prompt"] == cg.QI2_UPSCALE_PROMPT
    assert captured["stage"] == "source_upscaler"


def test_ensure_qi2_upscaler_file_downloads_the_pinned_revision_into_the_first_model_folder(monkeypatch, tmp_path):
    downloads = []
    present = {}

    def fake_download(**kwargs):
        downloads.append(kwargs)
        path = tmp_path / "staging" / kwargs["filename"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"weights")
        return str(path)

    monkeypatch.setitem(sys.modules, "huggingface_hub", types.SimpleNamespace(hf_hub_download=fake_download))
    monkeypatch.setattr(cg, "folder_paths", types.SimpleNamespace(
        get_full_path=lambda folder, name: present.get((folder, name)),
        get_folder_paths=lambda folder: [str(tmp_path / folder), str(tmp_path / "other")],
    ))

    assert cg._ensure_qi2_upscaler_file("consistency_lora") == "QI2/Consistency/qwen-image-2.1-consistency.safetensors"
    spec = cg.QI2_UPSCALER_FILES["consistency_lora"]
    assert downloads == [{
        "repo_id": spec["repo_id"], "filename": spec["filename"], "revision": spec["revision"],
        "local_dir": str(tmp_path / "loras" / "QI2" / "Consistency"), "token": False,
    }]
    assert (tmp_path / "loras" / "QI2" / "Consistency" / "qwen-image-2.1-consistency.safetensors").read_bytes() == b"weights"

    present[("vae", cg.QI2_UPSCALER_FILES["texture_fix_vae"]["name"])] = "already here"
    assert cg._ensure_qi2_upscaler_file("texture_fix_vae") == "texture_fix_vae_for_qwen_image_2.1_bf16.safetensors"
    assert len(downloads) == 1
    for spec in cg.QI2_UPSCALER_FILES.values():
        assert len(spec["revision"]) == 40
