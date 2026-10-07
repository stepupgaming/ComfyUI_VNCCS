import json
from pathlib import Path
from types import SimpleNamespace

import pytest

pytest.importorskip("torch", exc_type=ImportError)

from nodes import emotion_generator_v2 as emotion
from nodes import vnccs_control_center as cc


ROOT = Path(__file__).resolve().parents[1]


class Asset:
    def __init__(self, weights=None):
        self.weights = weights if weights is not None else object()

    def clone(self):
        return Asset(self.weights)


def test_emotion_qi2_reuses_the_control_center_weights(monkeypatch, tmp_path):
    monkeypatch.setattr(cc, "_MODEL_ASSET_CACHE", {})
    files = {}
    for folder, name in (("diffusion_models", "qwen.safetensors"), ("text_encoders", "qwen3vl.safetensors"),
                         ("vae", "qwen_vae.safetensors")):
        path = tmp_path / name
        path.write_bytes(b"weights")
        files[(folder, name)] = str(path)
    monkeypatch.setattr(emotion, "get_full_path_agnostic",
                        lambda _paths, folder, name, require_exists=False: files.get((folder, name)))
    calls = []
    monkeypatch.setattr(cc.comfy.sd, "CLIPType", SimpleNamespace(STABLE_DIFFUSION="sd", QWEN_IMAGE="qwen_image"),
                        raising=False)
    monkeypatch.setattr(cc.comfy.sd, "load_diffusion_model", lambda *a, **k: calls.append("model") or Asset(),
                        raising=False)
    monkeypatch.setattr(cc.comfy.sd, "load_clip", lambda **k: calls.append("clip") or Asset(), raising=False)
    monkeypatch.setattr(cc.comfy.utils, "load_torch_file", lambda path, **k: ({}, {}), raising=False)
    monkeypatch.setattr(cc.comfy.sd, "VAE", lambda **k: calls.append("vae") or Asset(), raising=False)

    center_model = cc._load_unet(files[("diffusion_models", "qwen.safetensors")], {"weight_dtype": "default"})
    center_clip = cc._load_clip_files([files[("text_encoders", "qwen3vl.safetensors")]], "qwen_image")
    center_vae = cc._load_vae_file(files[("vae", "qwen_vae.safetensors")])
    settings = {
        "diffusion_model_name": "qwen.safetensors",
        "clip_name": "qwen3vl.safetensors",
        "vae_name": "qwen_vae.safetensors",
        "clip_type": "qwen_image",
    }
    first = emotion.load_qi2_emotion_assets(settings)
    second = emotion.load_qi2_emotion_assets(settings)

    assert calls == ["model", "clip", "vae"]
    for model, clip, vae in (first, second):
        assert model is not center_model and model.weights is center_model.weights
        assert clip is not center_clip and clip.weights is center_clip.weights
        assert vae is center_vae


def test_emotion_qi2_reports_missing_weights(monkeypatch):
    monkeypatch.setattr(emotion, "get_full_path_agnostic", lambda *a, **k: None)
    with pytest.raises(ValueError, match="diffusion_models file not found: 'missing.safetensors'"):
        emotion.load_qi2_emotion_assets({"diffusion_model_name": "missing.safetensors"})


def test_emotion_studio_builds_qi2_pipe_with_cache_and_viggle_state(monkeypatch):
    monkeypatch.setattr(emotion, "load_qi2_emotion_assets", lambda settings: ("model", "clip", "vae"))
    settings = {
        "generation_mode": "qi2",
        "mode_settings": {
            "qi2": {
                "diffusion_model_name": "qwen.safetensors",
                "clip_name": "qwen3vl.safetensors",
                "vae_name": "qwen_vae.safetensors",
                "turbo_enabled": True,
                "qi2_cache": {"device": "cpu", "dtype": "int4"},
            }
        },
    }

    pipe, _seed = emotion.build_emotion_pipe("QI2", json.dumps(settings))

    assert pipe.model_kind == "qi2"
    assert pipe.model_entry["kind"] == "QI2"
    assert pipe.qi2_cache == {"device": "cpu", "dtype": "int4"}
    assert pipe.sample_steps == 6
    assert pipe.cfg == 1.0
    assert pipe.lora_entries[0]["name"] == "Qwen Image 2.1 Viggle Turbo"
    assert pipe.lora_states == [{
        "name": "Qwen Image 2.1 Viggle Turbo",
        "auto_apply": True,
        "strength": 1.0,
    }]


def test_qi2_emotion_card_uses_natural_prompt_and_description_tags():
    source = (ROOT / "nodes" / "emotion_generator_v2.py").read_text(encoding="utf-8")
    assert 'if mode == "qi2":' in source
    assert """emotion_text = build_anima_emotion_prompt(
                        natural_prompt,
                        emotion_description,
                        emotion_key,
                    )""" in source


def test_emotion_prompt_combines_natural_prompt_with_description_tags():
    prompt = emotion.build_anima_emotion_prompt(
        "The character gives a warm, relaxed smile.",
        "soft smile, relaxed eyes, raised cheeks",
        "happy",
    )

    assert prompt == (
        "The character gives a warm, relaxed smile.\n\n"
        "Emotion Tags: soft smile, relaxed eyes, raised cheeks"
    )
