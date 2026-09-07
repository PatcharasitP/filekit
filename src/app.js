// ── เปลือกแอป: วาดหน้าแรก + เราเตอร์ + prefetch ตามเจตนาผู้ใช้ ─────────────
// ไฟล์นี้คือ JavaScript ก้อนเดียวที่หน้าแรกโหลด (ไม่กี่ KB) โค้ดของเครื่องมือ
// และไลบรารีหนัก ๆ จะถูกดึงก็ต่อเมื่อผู้ใช้แสดงเจตนาจะใช้จริงเท่านั้น

import { TOOLS, GROUPS, byId } from "./registry.js";
import { warmLibs, loadLibs } from "./loader.js";
import { searchTools, highlightRange } from "./search.js";
import { el, $ } from "./dom.js";
import { toolIcon } from "./icons.js";
import { LANG, IS_EN, tr, setLang, applyStatic } from "./i18n.js";

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

/* ── ป้ายเครื่องมือ (มุมมองหลัก) ── */
function pillOf(t, q = "") {
  const r = q ? highlightRange(t.title, q) : null;
  const label = r
    ? [t.title.slice(0, r[0]), el("mark", {}, t.title.slice(r[0], r[1])), t.title.slice(r[1])]
    : [t.title];
  return el("button", {
    class: "pill", type: "button", "data-id": t.id, style: `--ac:${accentOf(t.group)}`,
    title: t.desc,                       // คำอธิบายยังอยู่ แค่ย้ายไปอยู่ในทูลทิป
    onclick: () => go(t.id),
    onmouseenter: () => prefetch(t), onfocus: () => prefetch(t), ontouchstart: () => prefetch(t),
  }, [el("i", { "aria-hidden": "true" }, [toolIcon(t) || t.icon]), el("span", {}, label)]);
}

/* ── วาดหน้าแรก ── */
let activeCat = "";                     // "" = ทุกหมวด
function renderHome(q = "") {
  const found = searchTools(TOOLS, q);
  const stageH = $("#stageh");
  grids.innerHTML = "";

  // กำลังค้นหา: เรียงตามคะแนน ไม่แบ่งหมวด — คนกำลังค้นอยากเห็นตัวที่ตรงที่สุดก่อน
  if (q.trim()) {
    hits.textContent = found.length ? tr(`พบ ${found.length} เครื่องมือ`, `${found.length} tools found`) : "";
    if (stageH) stageH.textContent = found.length
      ? tr(`ผลการค้นหา “${q.trim()}”`, `Results for “${q.trim()}”`) : "";
    if (!found.length) return showEmpty(q);
    grids.appendChild(el("div", { class: "pills" }, found.map((r) => pillOf(r.t, q))));
    return;
  }

  hits.textContent = "";
  const shown = TOOLS.filter((t) => !activeCat || t.group === activeCat);
  if (stageH) stageH.textContent = activeCat
    ? tr(`${(GROUPS.find((g) => g.id === activeCat) || {}).label} · ${shown.length} เครื่องมือ`,
         `${(GROUPS.find((g) => g.id === activeCat) || {}).label} · ${shown.length} tools`)
    : tr(`${TOOLS.length} เครื่องมือ ทำงานในเครื่องคุณทั้งหมด`,
         `${TOOLS.length} tools · all of them run on your device`);

  const box = el("div", { class: "pills" });
  // แถวเพิ่งใช้ล่าสุดขึ้นก่อน เฉพาะตอนดูทั้งหมด — คนกลับมาเว็บนี้มักใช้ตัวเดิมซ้ำ
  if (!activeCat) {
    const recent = recentIds().map(byId).filter(Boolean);
    if (recent.length >= 2) {
      box.appendChild(el("div", { class: "pill-group" }, [tr("เพิ่งใช้ล่าสุด", "Recently used"), el("s", {})]));
      recent.forEach((t) => box.appendChild(pillOf(t)));
    }
  }
  for (const g of GROUPS) {
    const items = shown.filter((t) => t.group === g.id);
    if (!items.length) continue;
    // ใส่หัวหมวดคั่นเฉพาะตอนดูทั้งหมด — ถ้ากรองหมวดเดียวอยู่แล้วไม่ต้องซ้ำ
    if (!activeCat) box.appendChild(el("div", { class: "pill-group" }, [g.label, el("s", {})]));
    items.forEach((t) => box.appendChild(pillOf(t)));
  }
  grids.appendChild(box);
}

function showEmpty(q) {
  grids.appendChild(el("div", { class: "empty" }, [
    el("b", {}, tr(`ไม่พบเครื่องมือที่ตรงกับ “${q}”`, `No tool matches “${q}”`)),
    el("div", {}, tr("ลองพิมพ์สั้นลง หรือใช้คำอื่น เช่น “PDF” · “Word” · “รูป” · “ไทย”",
                     "Try a shorter word, or another one — “PDF” · “Word” · “image” · “Excel”")),
    el("button", { class: "btn-soft", type: "button", onclick: clearSearch }, tr("ล้างคำค้นหา แล้วดูทั้งหมด", "Clear search and show everything")),
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
  cats.appendChild(mk("", tr("ทั้งหมด", "All"), TOOLS.length, "var(--text)"));   // หมวดรวมใช้สีกลาง ไม่แย่งสีประจำหมวด
  for (const g of GROUPS) {
    const n = TOOLS.filter((t) => t.group === g.id).length;
    if (n) cats.appendChild(mk(g.id, g.short || g.label, n, accentOf(g.id)));
  }
}

/* ── prefetch: เริ่มดึงโค้ดเครื่องมือ + ไลบรารี ตอนผู้ใช้ "เล็ง"การ์ด ────────
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
      el("div", { class: "spinner" }), el("div", {}, tr("กำลังเตรียมเครื่องมือ…", "Preparing the tool…")),
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
      el("div", { class: "status show err" },
        tr("เปิดเครื่องมือไม่สำเร็จ: ", "Could not open this tool: ") + err.message),
      el("button", { class: "btn", type: "button", onclick: () => { mounted.delete(id); go(id, false); } }, tr("ลองใหม่", "Try again")),
    ]));
  }
}

function goHome(push = true) {
  swap(() => {
    document.body.classList.remove("tool");
    document.title = tr("FileKit — เครื่องมือจัดการไฟล์ในเบราว์เซอร์",
                        "FileKit — file tools that run in your browser");
    toolBox.innerHTML = "";
    renderHome(search.value);            // อัปเดตแถว "เพิ่งใช้"ให้ทันที
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
    const first = grids.querySelector("button.pill");
    if (first) { e.preventDefault(); e.key === "Enter" ? first.click() : first.focus(); }
  }
});

/* ── เดินในกริดด้วยลูกศร (นับจำนวนคอลัมน์จากตำแหน่งจริงบนจอ) ── */
grids.addEventListener("keydown", (e) => {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  const list = [...grids.querySelectorAll("button.pill")];
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
const THEME_SVG = {
  auto:  `<circle cx="12"cy="12"r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4z"fill="currentColor"stroke="none"/>`,
  light: `<circle cx="12"cy="12"r="4.6"/><path d="M12 2.4v2.6M12 19v2.6M4.2 12H1.6M22.4 12h-2.6M6.5 6.5L4.6 4.6M19.4 19.4l-1.9-1.9M17.5 6.5l1.9-1.9M4.6 19.4l1.9-1.9"/>`,
  dark:  `<path d="M20.2 14.2A8.6 8.6 0 0 1 9.8 3.8a8.6 8.6 0 1 0 10.4 10.4z"/>`,
};
const THEME_NAME = IS_EN
  ? { auto: "system", light: "light", dark: "dark" }
  : { auto: "ตามระบบ", light: "โหมดสว่าง", dark: "โหมดมืด" };
const themeBtn = $("#theme");
function applyTheme(v) {
  if (v === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
  store.set("fk-theme", v);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "btn-ico"); svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true"); svg.innerHTML = THEME_SVG[v];
  themeBtn.replaceChildren(svg);
  themeBtn.title = themeBtn.ariaLabel = tr(`ธีม: ${THEME_NAME[v]} (กดเพื่อเปลี่ยน)`,
                                          `Theme: ${THEME_NAME[v]} (click to change)`);
}
applyTheme(store.get("fk-theme", "auto"));
themeBtn.addEventListener("click", () =>
  applyTheme(THEMES[(THEMES.indexOf(store.get("fk-theme", "auto")) + 1) % THEMES.length]));

const langBtn = $("#lang");
// ป้ายบนปุ่มคือ "ภาษาที่จะเปลี่ยนไป" ไม่ใช่ภาษาปัจจุบัน — กดแล้วได้อย่างที่เห็น
langBtn.textContent = IS_EN ? "ไทย" : "EN";
langBtn.addEventListener("click", () => setLang(IS_EN ? "th" : "en"));

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

// เอียงปึกกระดาษในฉากเปิดตามเมาส์เล็กน้อย ให้รู้สึกเป็น 3 มิติจริงไม่ใช่ภาพนิ่ง
// ‼️ เปิดเฉพาะเครื่องที่มีเมาส์จริง — บนจอสัมผัส pointermove จะยิงตอนเลื่อนหน้า ทำให้กระตุก
{
  const obj = document.querySelector(".hero-obj");
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (obj && fine && !still) {
    const hero = obj.closest(".hero");
    let raf = 0, ev = null;
    const set = (x, y) => { obj.style.setProperty("--tx", x + "deg"); obj.style.setProperty("--ty", y + "deg"); };
    hero.addEventListener("pointermove", (e) => {
      ev = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = hero.getBoundingClientRect();
        set(((0.5 - (ev.clientY - r.top) / r.height) * 9).toFixed(2),
            (((ev.clientX - r.left) / r.width - 0.5) * 12).toFixed(2));
      });
    });
    hero.addEventListener("pointerleave", () => set(0, 0));
  }
}


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
if ("serviceWorker"in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
