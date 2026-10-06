// Runs the VNCCS-Utils Pose Studio extension outside the ComfyUI graph editor.
// The extension reaches litegraph only through window.comfyAPI (behind the
// /scripts/app.js and /scripts/api.js shims), so this page provides the parts
// it touches: one Pose Studio node carrying the prompt's node id, a
// CharacterCreatorV2 stand-in for the age/sex sync, and server events from
// /ws. The execution-time capture sync then runs through the extension as is.

const HOST_SOURCE = "vnccs-pose-host";
const STUDIO_SOURCE = "vnccs-studio";
const POSE_STUDIO_SCRIPT = "/vnccs_pose_studio.js";
const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SOCKET_RETRY_MIN_MS = 1000;
const SOCKET_RETRY_MAX_MS = 10000;

const nodeId = new URLSearchParams(location.search).get("node") ?? "";
const studioOrigin = document.querySelector('meta[name="vnccs-studio-origin"]')?.content ?? "";
const statusElement = document.getElementById("pose-studio-status");

const serverEvents = new EventTarget();
const extensions = [];
const graphNodes = [];
let poseNode = null;
let creatorNode = null;
let socket = null;
let socketRetryMs = SOCKET_RETRY_MIN_MS;
let started = false;
let character = null;

const app = {
    graph: {
        _nodes: graphNodes,
        links: {},
        getNodeById: (id) => graphNodes.find((node) => String(node.id) === String(id)) ?? null,
        setDirtyCanvas() {},
    },
    registerExtension(extension) {
        extensions.push(extension);
    },
};

const api = {
    addEventListener: (type, listener) => serverEvents.addEventListener(type, listener),
    removeEventListener: (type, listener) => serverEvents.removeEventListener(type, listener),
    fetchApi: (route, options) => fetch(`/api${route}`, options),
};

window.comfyAPI = { app: { app }, api: { api } };

function post(message) {
    window.parent.postMessage({ source: HOST_SOURCE, nodeId, ...message }, studioOrigin);
}

function showStatus(text) {
    statusElement.textContent = text;
    statusElement.hidden = !text;
}

function reportStatus() {
    post({ type: "status", ready: Boolean(poseNode) && socket?.readyState === WebSocket.OPEN });
}

function fail(error) {
    const message = String(error?.message || error);
    showStatus(message);
    if (studioOrigin && window.parent !== window) post({ type: "error", message });
}

function openSocket() {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${scheme}://${location.host}/ws`);
    socket.addEventListener("open", () => {
        socketRetryMs = SOCKET_RETRY_MIN_MS;
        reportStatus();
    });
    socket.addEventListener("message", (event) => {
        // Binary frames are sampler previews; Pose Studio only listens to JSON events.
        if (typeof event.data !== "string") return;
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (typeof message?.type === "string") {
            serverEvents.dispatchEvent(new CustomEvent(message.type, { detail: message.data }));
        }
    });
    socket.addEventListener("close", () => {
        reportStatus();
        setTimeout(openSocket, socketRetryMs);
        socketRetryMs = Math.min(socketRetryMs * 2, SOCKET_RETRY_MAX_MS);
    });
}

function characterWidgetData() {
    if (!character) return "";
    return JSON.stringify({ character_info: { age: character.age, sex: character.sex } });
}

class PoseStudioNode {
    constructor(id, poseData) {
        this.id = id;
        this.type = "VNCCS_PoseStudio";
        this.size = [window.innerWidth, window.innerHeight];
        this.inputs = [];
        this.outputs = [
            { name: "images", type: "IMAGE", links: [] },
            { name: "lighting_prompt", type: "STRING", links: [] },
        ];
        this.widgets = [{
            name: "pose_data",
            type: "STRING",
            value: poseData,
            callback: (value) => post({ type: "state", poseData: value }),
        }];
    }

    addWidget(type, name, value, callback) {
        const widget = { type, name, value, callback };
        this.widgets.push(widget);
        return widget;
    }

    addDOMWidget(name, type, element, options) {
        document.getElementById("pose-studio").appendChild(element);
        const widget = { name, type, element, options };
        this.widgets.push(widget);
        return widget;
    }

    addInput(name, type) {
        this.inputs.push({ name, type, link: null });
    }

    setSize(size) {
        this.size = size;
    }
}

function fitToWindow() {
    if (!poseNode) return;
    poseNode.setSize([window.innerWidth, window.innerHeight]);
    poseNode.onResize?.(poseNode.size);
}

async function start(poseData) {
    started = true;
    openSocket();
    const scripts = await (await fetch("/extensions")).json();
    const script = scripts.find((url) => url.endsWith(POSE_STUDIO_SCRIPT));
    if (!script) {
        throw new Error("Pose Studio was not found. Install ComfyUI_VNCCS_Utils in this ComfyUI.");
    }
    await import(script);
    for (const extension of extensions) await extension.setup?.(app);
    for (const extension of extensions) {
        await extension.beforeRegisterNodeDef?.(PoseStudioNode, { name: "VNCCS_PoseStudio" }, app);
    }

    creatorNode = {
        id: `${nodeId}-creator`,
        type: "CharacterCreatorV2",
        widgets: [{ name: "widget_data", value: characterWidgetData() }],
    };
    // "{}" is the node's own default for a workflow that never saved a pose.
    poseNode = new PoseStudioNode(nodeId, typeof poseData === "string" && poseData ? poseData : "{}");
    graphNodes.push(creatorNode, poseNode);
    poseNode.onNodeCreated();
    for (const extension of extensions) {
        extension.nodeCreated?.(creatorNode, app);
        extension.nodeCreated?.(poseNode, app);
    }
    fitToWindow();
    showStatus("");
    reportStatus();
}

window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== studioOrigin) return;
    const message = event.data;
    if (message?.source !== STUDIO_SOURCE) return;
    if (message.type === "init" && !started) {
        character = message.character ?? null;
        start(message.poseData).catch(fail);
    } else if (message.type === "character") {
        character = message.character ?? null;
        // The extension hooks this value and pushes age/sex into the studio.
        if (creatorNode) creatorNode.widgets[0].value = characterWidgetData();
    }
});
window.addEventListener("resize", fitToWindow);

if (window.parent === window) {
    showStatus("Open Pose Studio from VNCCS Studio.");
} else if (!studioOrigin) {
    showStatus("Start ComfyUI with --enable-cors-header set to the VNCCS Studio origin.");
} else if (!NODE_ID_PATTERN.test(nodeId)) {
    fail(new Error("The Pose Studio host needs a ?node= id."));
} else {
    post({ type: "hello" });
}
