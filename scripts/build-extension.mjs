#!/usr/bin/env node
// Builds the app as a Manifest V3 browser extension (Chrome, Edge, Brave, Opera):
// a static Next export, reshaped to fit extension rules, plus a manifest and a zip.
//
// Usage: npm run build:extension   ->   dist/extension/ and dist/boost-focus-timer-extension-<version>.zip
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT_DIR = join(ROOT, "out");
const DIST_DIR = join(ROOT, "dist");
const EXTENSION_DIR = join(DIST_DIR, "extension");
// Chrome refuses to load extensions containing files or folders whose names start with "_".
const ASSET_DIR = "next";
const INLINE_DIR = `${ASSET_DIR}/inline`;
const TEXT_FILE = /\.(html|js|css|txt|json|webmanifest)$/;

const { name, version, description } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function exportStaticSite() {
  rmSync(EXPORT_DIR, { recursive: true, force: true });
  execFileSync("npx", ["next", "build"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, BUILD_TARGET: "extension" } });
  rmSync(EXTENSION_DIR, { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });
  cpSync(EXPORT_DIR, EXTENSION_DIR, { recursive: true });
}

function renameReservedPaths() {
  renameSync(join(EXTENSION_DIR, "_next"), join(EXTENSION_DIR, ASSET_DIR));
  for (const file of walk(EXTENSION_DIR).filter((path) => TEXT_FILE.test(path))) {
    const text = readFileSync(file, "utf8");
    if (text.includes("/_next/")) writeFileSync(file, text.replaceAll("/_next/", `/${ASSET_DIR}/`));
  }
  // Leftover "_"-prefixed routes (e.g. the not-found page) are unused inside the extension.
  for (const entry of readdirSync(EXTENSION_DIR, { recursive: true })) {
    const isReserved = String(entry).split("/").some((part) => part.startsWith("_"));
    if (isReserved) rmSync(join(EXTENSION_DIR, String(entry)), { recursive: true, force: true });
  }
}

/** MV3 pages may only run scripts from the extension itself, so inline scripts become files. */
function externalizeInlineScripts() {
  mkdirSync(join(EXTENSION_DIR, INLINE_DIR), { recursive: true });
  const inlineScript = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  for (const page of walk(EXTENSION_DIR).filter((path) => path.endsWith(".html"))) {
    const html = readFileSync(page, "utf8").replace(inlineScript, (_match, attributes, code) => {
      if (!code.trim()) return "";
      const fileName = `${createHash("sha256").update(code).digest("hex").slice(0, 16)}.js`;
      writeFileSync(join(EXTENSION_DIR, INLINE_DIR, fileName), code);
      return `<script${attributes} src="/${INLINE_DIR}/${fileName}"></script>`;
    });
    writeFileSync(page, html);
  }
}

/** The popup window is the same page, marked so the app switches to its compact 400x600 layout. */
function writePopupPage() {
  const html = readFileSync(join(EXTENSION_DIR, "index.html"), "utf8");
  if (!html.includes("<html")) throw new Error("index.html has no <html> tag");
  writeFileSync(join(EXTENSION_DIR, "popup.html"), html.replace(/<html(\s|>)/, '<html data-view="popup"$1'));
}

function writeManifest() {
  const icons = Object.fromEntries([16, 32, 48, 128].map((size) => [String(size), `icons/icon-${size}.png`]));
  const manifest = {
    manifest_version: 3,
    name: "Boost Focus Timer",
    short_name: "Boost",
    version,
    description,
    icons,
    // notifications + alarms: the background worker announces a session's end even with the popup closed;
    // storage: it keeps that notification's text in chrome.storage.session until the alarm fires.
    permissions: ["notifications", "alarms", "storage"],
    // No default_popup: the background worker opens popup.html in its own window, which gets a
    // taskbar entry with the extension icon and survives losing focus.
    action: { default_title: "Boost Focus Timer", default_icon: icons },
    background: { service_worker: "background.js" },
    // Unassigned by default; users pick a key at chrome://extensions/shortcuts.
    commands: { _execute_action: { description: "Open Boost Focus Timer" } },
  };
  writeFileSync(join(EXTENSION_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  cpSync(join(ROOT, "extension", "background.js"), join(EXTENSION_DIR, "background.js"));
}

function zipExtension() {
  const zipPath = join(DIST_DIR, `${name}-extension-${version}.zip`);
  rmSync(zipPath, { force: true });
  try {
    execFileSync("zip", ["-qr", zipPath, "."], { cwd: EXTENSION_DIR });
    return zipPath;
  } catch (error) {
    console.error("Skipped the zip (is the `zip` command installed?):", error instanceof Error ? error.message : error);
    return null;
  }
}

exportStaticSite();
renameReservedPaths();
externalizeInlineScripts();
writePopupPage();
writeManifest();
const zipPath = zipExtension();
if (!existsSync(join(EXTENSION_DIR, "index.html"))) throw new Error("Static export produced no index.html");
console.log(`\nExtension ready: ${relative(ROOT, EXTENSION_DIR)}${zipPath ? ` and ${relative(ROOT, zipPath)}` : ""}`);
console.log("Load it via chrome://extensions -> Developer mode -> Load unpacked.");
