"use strict";

/* ---------- Settings ---------- */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const settings = {
  engine: store.get("engine", "https://duckduckgo.com/?q=%s"),
  cloak: store.get("cloak", ""),
};

/* ---------- Proxy setup ---------- */
const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});
scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";

let readyPromise;
function ensureReady() {
  return (readyPromise ??= (async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error(
        location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)
          ? "Service workers need HTTPS. Open this site over https:// (or localhost)."
          : "Your browser doesn't support service workers."
      );
    }
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
      await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
    }
  })().catch((e) => { readyPromise = null; throw e; }));
}
ensureReady().catch(showError);

/* ---------- Input -> URL ---------- */
function toUrl(input) {
  input = input.trim();
  try { const u = new URL(input); if (/^https?:$/.test(u.protocol)) return u.href; } catch {}
  try {
    const u = new URL("https://" + input);
    if (u.hostname.includes(".") && !/\s/.test(input)) return u.href;
  } catch {}
  return settings.engine.replace("%s", encodeURIComponent(input));
}

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const tabsEl = $("tabs"), viewport = $("viewport"), homePage = $("home-page");
const omnibox = $("omnibox"), homeInput = $("home-input"), errorEl = $("error");

function showError(err) {
  console.error(err);
  errorEl.textContent = "Couldn't start the proxy: " + (err?.message || err);
}

/* ---------- Tabs ---------- */
let tabs = [];
let active = null;
let nextId = 1;

function createTab(url) {
  const tab = { id: nextId++, frame: null, url: "", title: "New Tab", el: document.createElement("div") };
  tab.el.className = "tab";
  tab.el.innerHTML = '<span class="title"></span><button class="close" title="Close tab">&times;</button>';
  tab.el.addEventListener("mousedown", (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab); } });
  tab.el.addEventListener("click", (e) => {
    if (e.target.classList.contains("close")) closeTab(tab);
    else activate(tab);
  });
  tabsEl.appendChild(tab.el);
  tabs.push(tab);
  renderTab(tab);
  activate(tab);
  if (url) navigate(tab, url);
  return tab;
}

function renderTab(tab) {
  tab.el.querySelector(".title").textContent = tab.title;
  tab.el.title = tab.title + (tab.url ? "\n" + tab.url : "");
  if (tab === active) {
    if (document.activeElement !== omnibox) omnibox.value = tab.url;
    document.title = settings.cloak || (tab.url ? tab.title + " · Warp" : "Warp");
    $("back").disabled = $("forward").disabled = $("reload").disabled = !tab.frame;
  }
}

function activate(tab) {
  active = tab;
  for (const t of tabs) {
    t.el.classList.toggle("active", t === tab);
    t.frame?.frame.classList.toggle("active", t === tab && !!t.url);
  }
  homePage.classList.toggle("active", !tab.url);
  renderTab(tab);
  tab.el.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (!tab.url) homeInput.focus();
}

function closeTab(tab) {
  const i = tabs.indexOf(tab);
  tabs.splice(i, 1);
  tab.el.remove();
  tab.frame?.frame.remove();
  if (!tabs.length) return createTab();
  if (tab === active) activate(tabs[Math.min(i, tabs.length - 1)]);
}

async function navigate(tab, input) {
  const url = toUrl(input);
  errorEl.textContent = "";
  try { await ensureReady(); } catch (e) { return showError(e); }

  if (!tab.frame) {
    const frame = scramjet.createFrame();
    frame.frame.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write; autoplay; encrypted-media; picture-in-picture");
    frame.frame.setAttribute("allowfullscreen", "");
    viewport.appendChild(frame.frame);
    tab.frame = frame;

    frame.addEventListener("urlchange", (e) => {
      tab.url = String(e.url);
      tab.title = hostOf(tab.url);
      renderTab(tab);
    });
    frame.frame.addEventListener("load", () => {
      try {
        const doc = frame.frame.contentDocument;
        if (doc?.title) tab.title = doc.title;
        try { tab.url = frame.url.href; } catch {}
        renderTab(tab);
        // Watch for later title changes (SPAs).
        const titleEl = doc?.querySelector("title");
        if (titleEl) new MutationObserver(() => { tab.title = doc.title || tab.title; renderTab(tab); })
          .observe(titleEl, { childList: true, characterData: true, subtree: true });
      } catch {}
    });
  }

  tab.url = url;
  tab.title = hostOf(url);
  tab.frame.go(url);
  if (tab === active) activate(tab);
  else renderTab(tab);
}

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

function goHome(tab) {
  tab.frame?.frame.remove();
  tab.frame = null;
  tab.url = "";
  tab.title = "New Tab";
  activate(tab);
}

/* ---------- Controls ---------- */
$("omnibox-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!omnibox.value.trim()) return;
  navigate(active, omnibox.value);
  omnibox.blur();
});
$("home-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!homeInput.value.trim()) return;
  navigate(active, homeInput.value);
  homeInput.value = "";
});
omnibox.addEventListener("focus", () => omnibox.select());
omnibox.addEventListener("blur", () => { omnibox.value = active?.url || ""; });
$("new-tab").addEventListener("click", () => createTab());
$("back").addEventListener("click", () => active.frame?.back());
$("forward").addEventListener("click", () => active.frame?.forward());
$("reload").addEventListener("click", () => active.frame?.reload());
$("home").addEventListener("click", () => goHome(active));

// Open the current page in an about:blank window so it doesn't show up in history.
$("popout").addEventListener("click", () => {
  const src = active.frame ? active.frame.frame.src : location.href;
  const w = window.open("about:blank", "_blank");
  if (!w) return;
  w.document.title = settings.cloak || "New Tab";
  const f = w.document.createElement("iframe");
  f.src = src;
  f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0";
  w.document.body.style.margin = "0";
  w.document.body.appendChild(f);
});

document.addEventListener("keydown", (e) => {
  if (!e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "t") { e.preventDefault(); createTab(); }
  else if (k === "w") { e.preventDefault(); closeTab(active); }
  else if (k === "l") { e.preventDefault(); omnibox.focus(); }
});

/* ---------- Settings dialog ---------- */
const dialog = $("settings"), engineSel = $("engine"), cloakInput = $("cloak-title");
$("settings-btn").addEventListener("click", () => {
  engineSel.value = settings.engine;
  cloakInput.value = settings.cloak;
  dialog.showModal();
});
dialog.addEventListener("close", () => {
  settings.engine = engineSel.value;
  settings.cloak = cloakInput.value.trim();
  store.set("engine", settings.engine);
  store.set("cloak", settings.cloak);
  renderTab(active);
});

/* ---------- Shortcuts ---------- */
const shortcuts = [
  ["YouTube", "https://www.youtube.com", "#ff0033"],
  ["Wikipedia", "https://en.wikipedia.org", "#636466"],
  ["Reddit", "https://www.reddit.com", "#ff4500"],
  ["GitHub", "https://github.com", "#24292f"],
  ["Discord", "https://discord.com/app", "#5865f2"],
  ["Spotify", "https://open.spotify.com", "#1db954"],
];
for (const [name, url, color] of shortcuts) {
  const b = document.createElement("button");
  b.className = "shortcut";
  b.innerHTML = `<span class="badge" style="background:${color}">${name[0]}</span><span>${name}</span>`;
  b.addEventListener("click", () => navigate(active, url));
  $("shortcuts").appendChild(b);
}

createTab();
