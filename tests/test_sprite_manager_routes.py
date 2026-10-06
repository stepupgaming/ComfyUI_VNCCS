"""Sprite Manager routes stay inside the character folder and never delete images."""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

pytest.importorskip("torch")
pytest.importorskip("cv2")
from PIL import Image

import nodes.sprite_manager as sprite_manager

SAME_ORIGIN = {"Host": "localhost:8188", "Origin": "http://localhost:8188", "Sec-Fetch-Site": "same-origin"}


@pytest.fixture
def routes(monkeypatch, tmp_path):
    module = sprite_manager
    utils = sys.modules["utils"]
    root = tmp_path / "Characters"
    root.mkdir()
    monkeypatch.setattr(utils, "base_output_dir", lambda: str(root))
    monkeypatch.setattr(module, "base_output_dir", lambda: str(root))
    monkeypatch.setattr(module.web, "Response", lambda status=200, text="", body=None, content_type=None: SimpleNamespace(
        status=status, text=text, body=body, content_type=content_type), raising=False)
    monkeypatch.setattr(module.web, "json_response", lambda data, status=200, **kwargs: SimpleNamespace(
        data=data, status=status), raising=False)
    return module, root


def _get(handler, **query):
    return asyncio.run(handler(SimpleNamespace(headers={}, rel_url=SimpleNamespace(query=query))))


def _post(handler, data, headers=SAME_ORIGIN):
    async def body():
        return data
    return asyncio.run(handler(SimpleNamespace(method="POST", headers=headers, json=body)))


def _sprite(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (4, 4), (255, 0, 0, 255)).save(path)


def test_sheet_preview_serves_sprites_and_rejects_traversal(routes, tmp_path):
    module, root = routes
    _sprite(root / "Alice" / "Sprites" / "Casual" / "happy" / "sprite_happy_0001.png")
    _sprite(tmp_path / "secret" / "private.png")

    ok = _get(module.get_sheet_preview, character="Alice", costume="Casual", emotion="happy")
    assert ok.status == 200 and ok.content_type == "image/png" and ok.body.startswith(b"\x89PNG")

    for costume, emotion in (("../../../secret", "happy"), ("..", "happy"), ("Casual", "..\\..\\secret"), ("Casual", "")):
        rejected = _get(module.get_sheet_preview, character="Alice", costume=costume, emotion=emotion)
        assert rejected.status == 400 and rejected.body is None

    missing = _get(module.get_sheet_preview, character="Alice", costume="Casual", emotion="sad")
    assert missing.status == 404


def test_costumes_by_emotion_ignores_traversal(routes):
    module, root = routes
    _sprite(root / "Alice" / "Sprites" / "Casual" / "happy" / "a.png")
    _sprite(root / "Alice" / "Sprites" / "Formal" / "happy" / "b.png")

    assert _get(module.get_costumes_by_emotion, character="Alice", emotion="happy").data == ["Casual", "Formal"]
    assert _get(module.get_costumes_by_emotion, character="Alice", emotion="../happy").data == []


def test_delete_empty_folders_keeps_nested_images_and_other_characters(routes):
    module, root = routes
    alice = root / "Alice" / "Sprites"
    (alice / "Casual" / "happy").mkdir(parents=True)
    _sprite(alice / "Casual" / "sad" / "nested" / "keep.png")
    (root / "Bob" / "Sprites" / "Casual" / "happy").mkdir(parents=True)

    result = _post(module.delete_empty_folders, {
        "character": "Alice",
        "folders": [
            "Sprites\\Casual\\happy",
            "Sprites/Casual/sad",
            str(root / "Bob" / "Sprites" / "Casual" / "happy"),
            "../Bob/Sprites/Casual/happy",
        ],
    })

    assert result.status == 200
    assert result.data["deleted_count"] == 1
    assert not (alice / "Casual" / "happy").exists()
    assert (alice / "Casual" / "sad" / "nested" / "keep.png").is_file()
    assert (root / "Bob" / "Sprites" / "Casual" / "happy").is_dir()
    errors = result.data["errors"]
    assert "Folder not empty: Sprites" in errors[0] and errors[0].endswith("sad")
    assert errors[1].startswith("Folder outside VNCCS output:")
    assert errors[2].startswith("Failed to delete ../Bob")


def test_delete_empty_folders_removes_emptied_costume_but_not_sprites_root(routes):
    module, root = routes
    sprites = root / "Alice" / "Sprites"
    (sprites / "Lone" / "only").mkdir(parents=True)
    (sprites / "Spare" / "a" / "b").mkdir(parents=True)

    first = _post(module.delete_empty_folders, {"character": "Alice", "folders": ["Sprites/Lone/only"]})
    assert first.data["deleted_count"] == 1 and not (sprites / "Lone").exists()

    second = _post(module.delete_empty_folders, {"character": "Alice", "folders": ["Sprites/Spare"]})
    assert second.data["deleted_count"] == 1 and not (sprites / "Spare").exists()
    assert sprites.is_dir()


def test_delete_empty_folders_requires_same_origin_and_a_list(routes):
    module, root = routes
    (root / "Alice" / "Sprites" / "Casual" / "happy").mkdir(parents=True)

    cross = _post(module.delete_empty_folders, {"character": "Alice", "folders": ["Sprites/Casual/happy"]},
                  {**SAME_ORIGIN, "Sec-Fetch-Site": "cross-site"})
    assert cross.status == 403
    assert (root / "Alice" / "Sprites" / "Casual" / "happy").is_dir()

    assert _post(module.delete_empty_folders, {"character": "Alice", "folders": "Sprites"}).status == 400
    assert _post(module.delete_empty_folders, {"character": "../x", "folders": []}).status == 400
