// A small W3C WebDriver client for tauri-driver, so the end-to-end tests need no npm packages.

const DRIVER_URL = process.env.TAURI_DRIVER_URL ?? "http://127.0.0.1:4444";
const POLL_MS = 100;

const MODIFIER_KEYS = { mod: "", alt: "", shift: "" };
const SPECIAL_KEYS = {
  Enter: "\uE006", Backspace: "", Delete: "", Tab: "", Escape: "", Space: " ",
  ArrowUp: "", ArrowDown: "", ArrowLeft: "", ArrowRight: "",
  Slash: "/", Comma: ",", Period: ".", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=",
  Semicolon: ";", Quote: "'", Backslash: "\\", Backquote: "`",
};

async function request(method, path, body) {
  const response = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`WebDriver ${method} ${path}: ${payload.value?.message ?? response.status}`);
  return payload.value;
}

// The WebDriver key value for a KeyboardEvent.code such as "KeyN", "Digit1" or "F5".
export function keyValue(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const functionKey = /^F(\d{1,2})$/.exec(code);
  if (functionKey) return String.fromCharCode(0xe031 + Number(functionKey[1]) - 1);
  if (code in SPECIAL_KEYS) return SPECIAL_KEYS[code];
  throw new Error(`no WebDriver key for ${code}`);
}

export async function newSession(application) {
  const value = await request("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application } } },
  });
  const id = value.sessionId;
  const session = (method, path, body) => request(method, `/session/${id}${path}`, body);
  const execute = (script, args = []) => session("POST", "/execute/sync", { script, args });
  const perform = async (actions) => {
    await session("POST", "/actions", { actions: [{ type: "key", id: "keyboard", actions }] });
    await session("DELETE", "/actions");
  };
  return {
    execute,
    executeAsync: (script, args = []) => session("POST", "/execute/async", { script, args }),
    // Presses one combination: { mod, alt, shift, code }, Ctrl standing for mod.
    press: (combo) => {
      const modifiers = ["mod", "alt", "shift"].filter((name) => combo[name]).map((name) => MODIFIER_KEYS[name]);
      const key = keyValue(combo.code);
      return perform([
        ...modifiers.map((value) => ({ type: "keyDown", value })),
        { type: "keyDown", value: key },
        { type: "keyUp", value: key },
        ...modifiers.reverse().map((value) => ({ type: "keyUp", value })),
      ]);
    },
    type: (text) => perform([...text].flatMap((value) => [{ type: "keyDown", value }, { type: "keyUp", value }])),
    waitFor: async (script, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const result = await execute(script);
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      throw new Error(`timed out waiting for: ${script}`);
    },
    end: () => session("DELETE", ""),
  };
}
