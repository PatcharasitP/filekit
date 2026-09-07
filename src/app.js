// ── เปลือกแอป: วาดหน้าแรก + เราเตอร์ + prefetch ตามเจตนาผู้ใช้ ─────────────
// ไฟล์นี้คือ JavaScript ก้อนเดียวที่หน้าแรกโหลด (ไม่กี่ KB) โค้ดของเครื่องมือ
// และไลบรารีหนัก ๆ จะถูกดึงก็ต่อเมื่อผู้ใช้แสดงเจตนาจะใช้จริงเท่านั้น

import { TOOLS, GROUPS, byId } from "./registry.js";
import { warmLibs, loadLibs } from "./loader.js";
import { searchTools, highlightRange } from "./search.js";
import { el, $ } from "./dom.js";
import { toolIcon, uiIcon } from "./icons.js";

const toolBox = $("#tool"), grids = $("#tools");
const search = $("#q"), searchBox = $("#searchbox"), hits = $("#hits"), cats = $("#cats");
const accentOf = (gid) => `var(${(GROUPS.find((g) => g.id === gid) || {}).accent || "--brand"})`;

/* ── ความจำเล็ก ๆ ในเครื่อง (ธีม / มุมมอง / เพิ่งใช้) ── */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const RECENT_KEY = "fk-recent", RECENT_MAX = 6;
const recentIds = () => (store.get(RECENT_KEY, "") || "").split(",").filter((id) => byId(id));
function pushRecent(id) {
  const list = [id, ...recentIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  store.set(RECENT_KEY, list.join(","));
}

/* ── การ์ดเครื่องมือ ── */
function cardOf(t, q = "") {
  const r = q ? highlightRange(t.title, q) : null;
  const title = r
    ? el("h3", {}, [t.title.slice(0, r[0]), el("mark", {}, t.title.slice(r[0], r[1])), t.title.slice(r[1])])
    : el("h3", {}, t.title);
  return el("button", {
    class: "card", type: "button", "data-id": t.id, style: `--ac:${accentOf(t.group)}`,
    onclick: () => go(t.id),
    onmouseenter: () => prefetch(t), onfocus: () => prefetch(t), ontouchstart: () => prefetch(t),
  }, [
    el("span", { class: "ico", "aria-hidden": "true" }, [toolIcon(t) || t.icon]),
    el("div", { class: "tx" }, [title, el("p", {}, t.desc)]),
  ]);
}

/* ── วาดหน้าแรก ── */
let activeCat = "";                     // "" = ทุกหมวด
function renderHome(q = "") {
  const found = searchTools(TOOLS, q);
  const ids = new Set(found.map((r) => r.t.id));
  grids.innerHTML = "";

  // เรียงตามคะแนนเมื่อค้นหา (ไม่แบ่งหมวด) — คนกำลังค้นอยากเห็นตัวที่ตรงที่สุดก่อน
  if (q.trim()) {
    hits.textContent = found.length ? `พบ ${found.length} เครื่องมือ` : "";
    if (!found.length) return showEmpty(q);
    grids.appendChild(el("section", { class: "group" }, [
      el("div", { class: "grid" }, found.map((r) => cardOf(r.t, q))),
    ]));
    return;
  }

  hits.textContent = "";
  if (!activeCat) renderRecent();
  for (const g of GROUPS) {
    if (activeCat && activeCat !== g.id) continue;
    const items = TOOLS.filter((t) => t.group === g.id && ids.has(t.id));
    if (!items.length) continue;
    grids.appendChild(el("section", { class: "group", id: "g-" + g.id, style: `--ac:${accentOf(g.id)}` }, [
      el("div", { class: "group-h" }, [
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("h2", {}, g.label),
        el("span", {}, `${items.length} เครื่องมือ`),
      ]),
      el("div", { class: "grid" }, items.map((t) => cardOf(t))),
    ]));
  }
}

function renderRecent() {
  const ids = recentIds();
  if (ids.length < 2) return;           // มีตัวเดียวยังไม่เป็นประโยชน์ ไม่ต้องรก
  grids.appendChild(el("section", { class: "group", style: "--ac:var(--brand-text)" }, [
    el("div", { class: "group-h" }, [
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("h2", {}, "เพิ่งใช้ล่าสุด"),
      el("button", {
        class: "ob-link", type: "button",
        onclick: () => { store.set(RECENT_KEY, ""); renderHome(search.value); },
      }, "ล้างรายการ"),
    ]),
    el("div", { class: "grid" }, ids.map((id) => cardOf(byId(id)))),
  ]));
}

function showEmpty(q) {
  grids.appendChild(el("div", { class: "empty" }, [
    el("b", {}, `ไม่พบเครื่องมือที่ตรงกับ “${q}”`),
    el("div", {}, "ลองพิมพ์สั้นลง หรือใช้คำอื่น เช่น “PDF” · “Word” · “รูป” · “ไทย”"),
    el("button", { class: "btn-soft", type: "button", onclick: clearSearch }, "ล้างคำค้นหา แล้วดูทั้งหมด"),
  ]));
}

/* ── แถบหมวด ── */
function renderCats() {
  cats.innerHTML = "";
  const mk = (id, label, count, accent) =>
    el("button", {
      class: "cat", type: "button", "aria-pressed": String(activeCat === id),
      style: `--ac:${accent}`,
      onclick: () => { activeCat = activeCat === id ? "" : id; renderCats(); renderHome(search.value); },
    }, [label, el("b", {}, String(count))]);
  cats.appendChild(mk("", "ทั้งหมด", TOOLS.length, "var(--brand-text)"));  // --brand สว่างเกินไปสำหรับใช้เป็นตัวอักษรบนพื้นสว่าง
  for (const g of GROUPS) {
    const n = TOOLS.filter((t) => t.group === g.id).length;
    if (n) cats.appendChild(mk(g.id, g.short || g.label, n, accentOf(g.id)));
  }
}

/* ── prefetch: เริ่มดึงโค้ดเครื่องมือ + ไลบรารี ตอนผู้ใช้ "เล็ง" การ์ด ────────
   ผู้ใช้ใช้เวลาจากชี้เมาส์ถึงคลิกราว 100-300 ms ซึ่งพอให้เริ่มโหลดไปก่อนได้ */
const prefetched = new Set();
function prefetch(t) {
  if (!t || prefetched.has(t.id)) return;
  prefetched.add(t.id);
  import(`./tools/${t.id}.js`).catch(() => prefetched.delete(t.id));
  warmLibs(t.libs);
}

/* ── เราเตอร์ ── */
const mounted = new Map();              // เก็บ DOM ของเครื่องมือที่เคยเปิด กลับมาแล้วสถานะยังอยู่
const swap = (fn) =>
  document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches
    ? document.startViewTransition(fn) : fn();

async function go(id, push = true) {
  const tool = byId(id);
  if (!tool) return goHome();
  if (push && location.hash !== "#/" + id) location.hash = "#/" + id;
  pushRecent(id);

  swap(() => {
    document.body.classList.add("tool");
    document.title = `${tool.title} — FileKit`;
    toolBox.innerHTML = "";
    const cached = mounted.get(id);
    if (cached) { toolBox.appendChild(cached); return; }
    toolBox.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }), el("div", {}, "กำลังเตรียมเครื่องมือ…"),
    ]));
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (mounted.has(id)) return;

  try {
    // โหลดโค้ดเครื่องมือกับไลบรารีขนานกัน ไม่ต่อคิวกัน
    const [mod] = await Promise.all([import(`./tools/${id}.js`), loadLibs(...tool.libs)]);
    const node = mod.mount(tool);
    mounted.set(id, node);
    toolBox.innerHTML = "";
    toolBox.appendChild(node);
  } catch (err) {
    console.error(err);
    toolBox.innerHTML = "";
    toolBox.appendChild(el("div", { class: "panel" }, [
      el("div", { class: "status show err" }, "เปิดเครื่องมือไม่สำเร็จ: " + err.message),
      el("button", { class: "btn", type: "button", onclick: () => { mounted.delete(id); go(id, false); } }, "ลองใหม่"),
    ]));
  }
}

function goHome(push = true) {
  swap(() => {
    document.body.classList.remove("tool");
    document.title = "FileKit — เครื่องมือจัดการไฟล์ในเบราว์เซอร์";
    toolBox.innerHTML = "";
    renderHome(search.value);            // อัปเดตแถว "เพิ่งใช้" ให้ทันที
  });
  if (push && location.hash) location.hash = "";
}

function route() {
  const id = location.hash.replace(/^#\/?/, "");
  if (id && byId(id)) go(id, false); else goHome(false);
}

/* ── ค้นหา ── */
function clearSearch() {
  search.value = "";
  searchBox.classList.remove("has");
  renderHome("");
  search.focus();
}
let searchTimer;
search.addEventListener("input", () => {
  searchBox.classList.toggle("has", !!search.value);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { activeCat = ""; renderCats(); renderHome(search.value); }, 90);
});
$("#qclear").addEventListener("click", clearSearch);
search.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && search.value) { e.preventDefault(); clearSearch(); }
  if (e.key === "ArrowDown" || e.key === "Enter") {
    const first = grids.querySelector("button.card");
    if (first) { e.preventDefault(); e.key === "Enter" ? first.click() : first.focus(); }
  }
});

/* ── เดินในกริดด้วยลูกศร (นับจำนวนคอลัมน์จากตำแหน่งจริงบนจอ) ── */
grids.addEventListener("keydown", (e) => {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  const list = [...grids.querySelectorAll("button.card")];
  const i = list.indexOf(document.activeElement);
  if (i < 0) return;
  // จำนวนคอลัมน์ = จำนวนการ์ดที่อยู่แถวเดียวกับตัวที่โฟกัสอยู่ (กริดเป็น auto-fill จึงต้องวัดจากของจริง)
  const top = list[i].getBoundingClientRect().top;
  const cols = Math.max(1, list.filter((n) => Math.abs(n.getBoundingClientRect().top - top) < 4).length);
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  const next = list[i + step];
  if (next) { e.preventDefault(); next.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); search.focus(); }
});

/* ── ธีม / มุมมอง ── */
const THEMES = ["auto", "light", "dark"];
const THEME_ICON = { auto: "🌗", light: "☀️", dark: "🌙" };
const THEME_NAME = { auto: "ตามระบบ", light: "โหมดสว่าง", dark: "โหมดมืด" };
const themeBtn = $("#theme");
function applyTheme(v) {
  if (v === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
  store.set("fk-theme", v);
  themeBtn.textContent = THEME_ICON[v];
  themeBtn.title = themeBtn.ariaLabel = `ธีม: ${THEME_NAME[v]} (กดเพื่อเปลี่ยน)`;
}
applyTheme(store.get("fk-theme", "auto"));
themeBtn.addEventListener("click", () =>
  applyTheme(THEMES[(THEMES.indexOf(store.get("fk-theme", "auto")) + 1) % THEMES.length]));

const densBtn = $("#density");
function applyDensity(v) {
  if (v === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
  store.set("fk-density", v);
  densBtn.setAttribute("aria-pressed", String(v === "compact"));
  densBtn.replaceChildren(uiIcon(v === "compact" ? "rows" : "list", "btn-ico"));
  densBtn.title = densBtn.ariaLabel = v === "compact" ? "มุมมองแบบแน่น (กดเพื่อกลับแบบปกติ)" : "มุมมองแบบปกติ (กดเพื่อดูแบบแน่น)";
}
applyDensity(store.get("fk-density", "cozy"));
densBtn.addEventListener("click", () =>
  applyDensity(store.get("fk-density", "cozy") === "compact" ? "cozy" : "compact"));

/* ── ผูกเหตุการณ์ที่เหลือ ── */
$("#back").addEventListener("click", () => goHome());
$("#brand").addEventListener("click", () => goHome());
window.addEventListener("hashchange", route);
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !typing) {
    e.preventDefault();
    if (document.body.classList.contains("tool")) goHome();
    search.focus(); search.select();
  }
  if (e.key === "Escape" && document.body.classList.contains("tool") && !typing) goHome();
});

// ป้ายปุ่มลัดต้องตรงกับเครื่องที่ใช้จริง — Mac ใช้ ⌘ ไม่ใช่ Ctrl
{
  const k = document.getElementById("kbdkey");
  if (k && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) k.textContent = "⌘";
  const n = document.getElementById("fact-n");
  if (n) n.textContent = String(TOOLS.length);
}

renderCats();
renderHome();
route();

// สไตล์ส่วนที่เหลือ (หน้าเครื่องมือ) โหลดแบบไม่บล็อกการวาดหน้าแรก
document.head.appendChild(el("link", { rel: "stylesheet", href: "assets/css/tool.css" }));

// แถบ "เตรียมใช้งานออฟไลน์" — ดึงเข้ามาตอนเบราว์เซอร์ว่าง ไม่แย่งเวลาวาดหน้าแรก
{
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));

  idle(() => {
    import("./offline.js")
      .then((m) => document.querySelector("footer")?.before(m.offlineBar()))
      .catch(() => {});
  });
}

// Service worker: ทำให้เปิดซ้ำเร็วและใช้งานออฟไลน์ได้
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
