import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const web = new URL("../web/", import.meta.url);
const sheets = readdirSync(web, { recursive: true })
    .filter(name => /\.(?:js|mjs)$/.test(name))
    .map(name => {
        const source = readFileSync(new URL(name, web), "utf8");
        const css = Array.from(source.matchAll(/(?:const\s+\w*(?:STYLE|CSS)\w*|\w+\.textContent)\s*=\s*`([\s\S]*?)`/g), match => match[1])
            .filter(text => /(?:display|position|font-size|background)\s*:/.test(text)).join("\n");
        const selectors = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g), match => match[1].trim());
        return { name, source, css, selectors };
    }).filter(sheet => sheet.css);

test("every canvas helper owns its CSS classes and animation names", () => {
    const owners = new Map();
    for (const sheet of sheets) {
        const names = new Set(sheet.selectors.flatMap(selector =>
            Array.from(selector.matchAll(/\.(vnccs-[\w-]+)/g), match => match[1])));
        for (const match of sheet.css.matchAll(/@keyframes\s+([\w-]+)/g)) names.add(`@keyframes ${match[1]}`);
        for (const name of names) {
            assert.ok(!owners.has(name), `${name} is shared by ${owners.get(name)} and ${sheet.name}`);
            owners.set(name, sheet.name);
        }
    }
});

test("canvas helper palettes cannot overwrite the page", () => {
    for (const sheet of sheets) assert.ok(!/:root\b/.test(sheet.css), `${sheet.name}: global palette`);
});

test("Pose Editor's dialog and sidebar panels retain distinct styles", () => {
    const pose = sheets.find(sheet => sheet.name === "pose_editor.js");
    assert.equal(pose.selectors.filter(selector => selector === ".vnccs-pose-editor-panel").length, 1);
    assert.ok(pose.source.includes('panel.className = "vnccs-pose-editor-panel"'));
    assert.ok(pose.source.includes('panel.className = "vnccs-pose-editor-sidebar-panel"'));
    assert.ok(/\.vnccs-pose-editor-panel\s*\{[^}]*width: min\(1120px, 96vw\)/.test(pose.css));
});

test("Pose Editor hover rules exclude the active 3D button", () => {
    const pose = sheets.find(sheet => sheet.name === "pose_editor.js");
    const hover = pose.selectors.flatMap(selector => selector.split(","))
        .filter(selector => /\.vnccs-pose-editor-3d-btn(?=[:.\s]|$)/.test(selector) && selector.includes(":hover"));
    assert.ok(hover.length, "Missing hover rules for vnccs-pose-editor-3d-btn");
    for (const selector of hover) assert.ok(selector.includes(":not(.active)"), `selected active can match ${selector.trim()}`);
});
