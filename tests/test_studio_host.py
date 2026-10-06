"""Tests for the page that hosts Pose Studio inside VNCCS Studio."""

import os

from nodes.studio_host import HOST_DIR, POSE_HOST_ROUTE, frame_ancestors, render_pose_host


def _template():
    with open(os.path.join(HOST_DIR, "pose_host.html"), "r", encoding="utf-8") as handle:
        return handle.read()


def test_frame_ancestors_allow_only_the_trusted_app_origin():
    assert frame_ancestors("http://tauri.localhost") == "frame-ancestors 'self' http://tauri.localhost"


def test_frame_ancestors_without_trusted_origin_allow_only_comfyui():
    assert frame_ancestors(None) == "frame-ancestors 'self'"


def test_render_injects_the_app_origin():
    page = render_pose_host(_template(), "http://localhost:1420")
    assert '<meta name="vnccs-studio-origin" content="http://localhost:1420">' in page
    assert "{{studio_origin}}" not in page


def test_render_escapes_the_origin():
    page = render_pose_host('<meta content="{{studio_origin}}">', 'http://x"><script>')
    assert page == '<meta content="http://x&quot;&gt;&lt;script&gt;">'


def test_render_without_origin_leaves_it_empty():
    assert 'content=""' in render_pose_host(_template(), None)


def test_page_loads_the_script_route():
    assert f'src="{POSE_HOST_ROUTE}.mjs"' in _template()
    assert os.path.isfile(os.path.join(HOST_DIR, "pose_host.mjs"))
