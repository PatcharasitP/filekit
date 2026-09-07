// ── เปลือกแอป: วาดหน้าแรก + เราเตอร์ + prefetch ตามเจตนาผู้ใช้ ─────────────
// ไฟล์นี้คือ JavaScript ก้อนเดียวที่หน้าแรกโหลด (ไม่กี่ KB) โค้ดของเครื่องมือ
// และไลบรารีหนัก ๆ จะถูกดึงก็ต่อเมื่อผู้ใช้แสดงเจตนาจะใช้จริงเท่านั้น

import { TOOLS, GROUPS, byId } from "./registry.js";
import { warmLibs, loadLibs } from "./loader.js";
import { el, $ } from "./dom.js";

const home = $("#home");
const toolBox = $("#tool");
const grids = $("#tools");
const search = $("#q");

// ── หน้าแรก ────────────────────────────────────────────────────────────────
const cardOf = (t) =>
  el("button", {
    class: "card", type: "button", "data-id": t.id,
    onclick: () => go(t.id),
    onmouseenter: () => prefetch(t),
    onfocus: () => prefetch(t),
    ontouchstart: () => prefetch(t),
  }, [
    el("span", { class: "ico" }, t.icon),
    el("h3", {}, t.title),
    el("p", {}, t.desc),
  ]);

function renderHome(filter = "") {
  const q = filter.trim().toLowerCase();
  const match = (t) =>
    !q || (t.title + " " + t.desc + " " + t.keys + " " + t.id).toLowerCase().includes(q);

  grids.innerHTML = "";
  let shown = 0;
  for (const g of GROUPS) {
    const items = TOOLS.filter((t) => t.group === g.id && match(t));
    if (!items.length) continue;
    shown += items.length;
    grids.appendChild(
      el("section", { class: "group" }, [
        el("h2", {}, g.label),
        el("div", { class: "grid" }, items.map(cardOf)),
      ])
    );
  }
  if (!shown) grids.appendChild(el("div", { class: "empty" }, `ไม่พบเครื่องมือที่ตรงกับ “${filter}”`));
}

// ── prefetch: เริ่มดึงโค้ดเครื่องมือ + ไลบรารี ตอนผู้ใช้ "เล็ง" การ์ด ────────
// ผู้ใช้ใช้เวลาจากชี้เมาส์ถึงคลิกราว 100-300 ms ซึ่งพอให้เริ่มโหลดไปก่อนได้
const prefetched = new Set();
function prefetch(t) {
  if (prefetched.has(t.id)) return;
  prefetched.add(t.id);
  import(`./tools/${t.id}.js`).catch(() => prefetched.delete(t.id));
  warmLibs(t.libs);
}

// ── เราเตอร์ ───────────────────────────────────────────────────────────────
const mounted = new Map(); // เก็บ DOM ของเครื่องมือที่เคยเปิด กลับมาแล้วสถานะยังอยู่

async function go(id, push = true) {
  const tool = byId(id);
  if (!tool) return goHome();
  if (push && location.hash !== "#/" + id) location.hash = "#/" + id;

  document.body.classList.add("tool");
  document.title = `${tool.title} — FileKit`;
  toolBox.innerHTML = "";

  const cached = mounted.get(id);
  if (cached) { toolBox.appendChild(cached); return; }

  const skeleton = el("div", { class: "loading" }, [
    el("div", { class: "spinner" }),
    el("div", {}, "กำลังเตรียมเครื่องมือ…"),
  ]);
  toolBox.appendChild(skeleton);

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
    toolBox.appendChild(
      el("div", { class: "panel" }, [
        el("div", { class: "status show err" }, "เปิดเครื่องมือไม่สำเร็จ: " + err.message),
        el("button", { class: "btn", type: "button", onclick: () => { mounted.delete(id); go(id, false); } }, "ลองใหม่"),
      ])
    );
  }
}

function goHome(push = true) {
  document.body.classList.remove("tool");
  document.title = "FileKit — เครื่องมือจัดการไฟล์ในเบราว์เซอร์";
  if (push && location.hash) location.hash = "";
  toolBox.innerHTML = "";
}

function route() {
  const id = location.hash.replace(/^#\/?/, "");
  if (id && byId(id)) go(id, false); else goHome(false);
}

// ── ผูกเหตุการณ์ ───────────────────────────────────────────────────────────
$("#back").addEventListener("click", () => goHome());
$("#brand").addEventListener("click", () => goHome());
window.addEventListener("hashchange", route);

let searchTimer;
search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderHome(search.value), 80);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  if (e.key === "Escape" && document.body.classList.contains("tool")) goHome();
});

renderHome();
route();

// สไตล์ส่วนที่เหลือ (หน้าเครื่องมือ) โหลดแบบไม่บล็อกการวาดหน้าแรก
const rest = el("link", { rel: "stylesheet", href: "assets/css/tool.css" });
document.head.appendChild(rest);

// Service worker: ทำให้เปิดซ้ำเร็วและใช้งานออฟไลน์ได้
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
