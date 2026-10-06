"""Page that runs the VNCCS-Utils Pose Studio widget for VNCCS Studio.

Pose Studio renders its captures in the browser and the node waits for them
while it executes, so the desktop app frames this same-origin page instead of
the ComfyUI graph editor.
"""

import html
import os

from aiohttp import web

from ..utils import cors_trusted_origin

HOST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "studio_host")
POSE_HOST_ROUTE = "/vnccs/studio/pose_host"


def frame_ancestors(origin):
    """Only ComfyUI itself and the app origin it was started for may frame the host."""
    return f"frame-ancestors 'self' {origin}" if origin else "frame-ancestors 'self'"


def render_pose_host(template, origin):
    return template.replace("{{studio_origin}}", html.escape(origin or "", quote=True))


def _read_host_file(name):
    with open(os.path.join(HOST_DIR, name), "r", encoding="utf-8") as handle:
        return handle.read()


def register_studio_host_routes(routes):
    @routes.get(POSE_HOST_ROUTE)
    async def vnccs_studio_pose_host(request):
        origin = cors_trusted_origin()
        return web.Response(
            text=render_pose_host(_read_host_file("pose_host.html"), origin),
            content_type="text/html",
            headers={"Content-Security-Policy": frame_ancestors(origin)},
        )

    @routes.get(f"{POSE_HOST_ROUTE}.mjs")
    async def vnccs_studio_pose_host_script(request):
        # Served explicitly: Windows can map .mjs to a MIME type browsers refuse for modules.
        return web.Response(text=_read_host_file("pose_host.mjs"), content_type="text/javascript")
