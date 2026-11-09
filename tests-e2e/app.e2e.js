// Runs against the built app through tauri-driver (see .github/workflows/ci.yml); not part of npm test.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { HOTKEY_ACTIONS } from "../src/components/hotkeys/bindings.ts";
import { newSession } from "./webdriver.js";

const APPLICATION = process.env.BOOST_APP ?? "desktop/target/release/boost-focus-timer.exe";
const STEP_SETTLE_MS = 500;
const CSP_SETTLE_MS = 1500;
const LOAD_TIMEOUT_MS = 20000;
const NAMED_KEYS = { Enter: "Enter", Left: "ArrowLeft", Right: "ArrowRight", "/": "Slash" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function keyCode(key) {
  if (key in NAMED_KEYS) return NAMED_KEYS[key];
  return /^\d$/.test(key) ? `Digit${key}` : `Key${key}`;
}

function pressFor(combo) {
  const parts = combo.split("+");
  const key = combo.endsWith("/") ? "/" : parts.at(-1);
  return { mod: parts.includes("Ctrl"), alt: parts.includes("Alt"), shift: parts.includes("Shift"), code: keyCode(key) };
}

const pressName = ({ mod, alt, shift, code }) => [code, mod, alt, shift].join();

let app;

before(async () => {
  app = await newSession(APPLICATION);
  await app.waitFor("return Boolean(window.__TAURI__ && document.querySelector('[aria-label=\"Menu\"]'))", LOAD_TIMEOUT_MS);
  await sleep(STEP_SETTLE_MS);
});

after(async () => {
  await app?.end();
});

test("the window shows the compact layout", async () => {
  assert.equal(await app.execute("return document.documentElement.dataset.view"), "popup");
});

test("every default in-app shortcut reaches the page", async () => {
  await app.execute(`
    window.__seen = [];
    window.__record = (event) => {
      if (/^(Control|Alt|Shift|Meta)/.test(event.code)) return;
      window.__seen.push([event.code, event.ctrlKey, event.altKey, event.shiftKey].join());
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    addEventListener("keydown", window.__record, { capture: true });
  `);
  const presses = HOTKEY_ACTIONS.filter((action) => action.defaultCombo && action.id !== "app.fullPage").map((action) => pressFor(action.defaultCombo));
  for (const press of presses) await app.press(press);
  const seen = new Set(await app.execute("removeEventListener('keydown', window.__record, { capture: true }); return window.__seen"));
  assert.deepEqual(presses.map(pressName).filter((name) => !seen.has(name)), []);
});

test("the shortcut list hides Open full page", async () => {
  await app.press({ mod: true, code: "Slash" });
  await app.waitFor("return document.body.innerText.includes('Reset All to Default')");
  assert.equal(await app.execute("return document.body.innerText.includes('Open full page')"), false);
  await app.press({ mod: true, code: "Slash" });
  await app.waitFor("return !document.body.innerText.includes('Reset All to Default')");
});

test("F5 does not reload the app", async () => {
  await app.execute("window.__stillHere = true");
  await app.press({ code: "F5" });
  await sleep(STEP_SETTLE_MS);
  assert.equal(await app.execute("return window.__stillHere === true"), true);
});

test("the browser context menu is kept only where text can be edited", async () => {
  const outcome = await app.execute(`
    const rightClick = (element) => !element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const input = document.body.appendChild(document.createElement("input"));
    const result = { page: rightClick(document.body), field: rightClick(input) };
    input.remove();
    return result;
  `);
  assert.deepEqual(outcome, { page: true, field: false });
});

test("the shell accepts and cancels a scheduled end", async () => {
  const outcome = `
    const done = arguments[arguments.length - 1];
    const invoke = window.__TAURI__.core.invoke;
    invoke("schedule_end", { at: Date.now() + 3600000, title: "t", body: "b", notify: true })
      .then(() => invoke("cancel_end", {}))
      .then(() => done("ok"), (error) => done(String(error)));
  `;
  assert.equal(await app.executeAsync(outcome), "ok");
});

test("the content policy allows Boost's embeds and uploaded media", async () => {
  await app.execute(`
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__violations.push(event.blockedURI));
    const add = (tag, src) => document.body.appendChild(Object.assign(document.createElement(tag), { src, hidden: true }));
    add("iframe", "https://www.youtube.com/embed/aaaaaaaaaaa");
    add("iframe", "https://open.spotify.com/embed/track/a");
    add("img", "https://img.youtube.com/vi/aaaaaaaaaaa/hqdefault.jpg");
    add("video", URL.createObjectURL(new Blob(["x"], { type: "video/mp4" })));
  `);
  await sleep(CSP_SETTLE_MS);
  assert.deepEqual(await app.execute("return window.__violations"), []);
});
