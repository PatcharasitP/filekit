// ── เปลือกแอป: วาดหน้าแรก + เราเตอร์ + prefetch ตามเจตนาผู้ใช้ ─────────────
// ไฟล์นี้คือ JavaScript ก้อนเดียวที่หน้าแรกโหลด (ไม่กี่ KB) โค้ดของเครื่องมือ
// และไลบรารีหนัก ๆ จะถูกดึงก็ต่อเมื่อผู้ใช้แสดงเจตนาจะใช้จริงเท่านั้น

import { TOOLS, GROUPS, byId } from "./registry.js";
import { warmLibs, loadLibs } from "./loader.js";
import { searchTools, highlightRange } from "./search.js";
import { el, $, showVeil, filesFromClipboard } from "./dom.js";
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
function pillOf(t, q = "", onPick = null) {
  const r = q ? highlightRange(t.title, q) : null;
  const label = r
    ? [t.title.slice(0, r[0]), el("mark", {}, t.title.slice(r[0], r[1])), t.title.slice(r[1])]
    : [t.title];
  return el("button", {
    class: "pill", type: "button", "data-id": t.id, style: `--ac:${accentOf(t.group)}`,
    title: t.desc,                       // คำอธิบายยังอยู่ แค่ย้ายไปอยู่ในทูลทิป
    onclick: () => (onPick ? onPick() : go(t.id)),
    onmouseenter: () => prefetch(t), onfocus: () => prefetch(t), ontouchstart: () => prefetch(t),
  }, [el("i", { "aria-hidden": "true" }, [toolIcon(t) || t.icon]), el("span", {}, label),
      isNew(t) && el("b", { class: "new" }, tr("ใหม่", "New"))]);
}
// ป้าย "ใหม่" โผล่เอง 30 วันนับจาก `since` ในทะเบียน แล้วหายเอง — ไม่ต้องกลับมาถอด
const NEW_DAYS = 30;
const isNew = (t) => !!t.since && Date.now() - Date.parse(t.since) < NEW_DAYS * 864e5;

/* ── วาดหน้าแรก ── */
let activeCat = "";                     // "" = ทุกหมวด
function renderHome(q = "") {
  const found = searchTools(TOOLS, q);
  const stageH = $("#stageh");
  grids.innerHTML = "";

  // ลากไฟล์เข้ามาแล้ว: ไม่ต้องไล่หาเครื่องมือเอง เว็บคัดให้เลยว่าไฟล์ชนิดนี้ทำอะไรได้บ้าง
  if (dropped && !q.trim()) return renderDropped(stageH);

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

/* ── ลากไฟล์ลงหน้าแรกได้เลย ───────────────────────────────────────────────
 * คนคิดจากไฟล์ในมือ ("มี PDF ใบนี้ ทำอะไรได้บ้าง") ไม่ได้คิดจากชื่อเครื่องมือ
 * เดิมต้องเดาชื่อเครื่องมือให้ถูกก่อนถึงจะลากไฟล์ได้ ตอนนี้ลากลงหน้าแรกแล้วเว็บคัดให้
 * ทะเบียนรู้ชนิดที่แต่ละเครื่องมือรับ (accepts) อยู่แล้ว จึงจับคู่ได้โดยไม่ต้องเปิดเครื่องมือ */
let dropped = null;         // { files, kinds, tools, label, mixed }
const MAX_THUMBS = 5;       // เกินนี้โชว์เป็น "+N" — แถวเดียวพอ ไม่ให้แถบสูงขึ้น
let homeDragDepth = 0;
let uiMod = null;           // ui.js ที่โหลดแล้ว — ใช้ล้างไฟล์ฝากตอนกลับหน้าแรก
const onHomeNow = () => !document.body.classList.contains("tool");
const dragHasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");

async function takeHomeFiles(incoming) {
  const { detectType, typeLabel } = await import("./filetype.js");
  // ‼️ วางเพิ่มต้อง "สะสม" ไม่ใช่ทับของเดิม — คลิปบอร์ดวินโดวส์เก็บได้ทีละใบ คนที่แคป
  //    หลายหน้าจอจึงต้องวางทีละครั้ง ถ้าทับทุกครั้งก็รวมเป็น PDF ทีเดียวไม่ได้เลย
  //    (หน้าเครื่องมือสะสมอยู่แล้ว หน้าแรกเคยทับ — ไม่สอดคล้องกัน)
  // ‼️ ห้ามเอา lastModified มาเป็นกุญแจ — ไฟล์ที่วางจากคลิปบอร์ดถูกสร้างใหม่ทุกครั้ง
  //    เวลาจึงไม่เคยตรงกัน กันซ้ำไม่ได้เลย · ชื่อ+ขนาดตรงกันเป๊ะ = ไฟล์เดียวกันในทางปฏิบัติ
  const key = (f) => `${f.name}|${f.size}`;
  const seen = new Set((dropped?.files || []).map(key));
  const files = [...(dropped?.files || []), ...incoming.filter((f) => !seen.has(key(f)))];

  const kinds = [...new Set(files.map(detectType).filter(Boolean))];
  // เสนอเฉพาะเครื่องมือที่ทำงานกับ "ทุกไฟล์" ในชุดได้ — ถ้าเสนอตัวที่รับได้แค่บางใบ
  // พอกดเข้าไปไฟล์ที่เหลือจะถูกทิ้งเงียบ ๆ โดยผู้ใช้ไม่รู้ตัว
  const tools = kinds.length ? TOOLS.filter((t) => kinds.every((k) => (t.accepts || []).includes(k))) : [];
  dropped = { files, kinds, tools, label: kinds.map(typeLabel).join(" · "), mixed: kinds.length > 1 };
  search.value = "";
  activeCat = "";
  renderCats();
  renderHome();
  grids.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ‼️ ชื่อไฟล์อย่างเดียวไม่พอ — ภาพที่แคปมาจากคลิปบอร์ดชื่อ "image.png" เหมือนกันหมด
   ต้องเห็นรูปถึงจะรู้ว่าหยิบถูกใบ · กดแล้วดูใหญ่ได้ด้วย (โหลดตัวดูตอนกดครั้งแรกเท่านั้น) */
function dropThumb(file) {
  if (!file) return null;
  const btn = el("button", {
    class: "drop-thumb", type: "button",
    title: tr("กดเพื่อดูรูปใหญ่", "Click to view larger"),
    "aria-label": tr(`ดู ${file.name} ขนาดใหญ่`, `View ${file.name} larger`),
    onclick: async () => { const m = await import("./preview.js"); m.viewFile(file); },
  });
  import("./filetype.js").then(({ detectType }) => {
    if (detectType(file) !== "image") {
      btn.classList.add("as-icon");
      import("./icons.js").then(({ fileKindIcon, uiIcon }) => {
        btn.appendChild(fileKindIcon(detectType(file)) || uiIcon("list"));
      });
      return;
    }
    const u = URL.createObjectURL(file);
    const img = el("img", { alt: "", decoding: "async" });
    img.addEventListener("load", () => btn.appendChild(img), { once: true });
    img.addEventListener("error", () => URL.revokeObjectURL(u), { once: true });
    img.src = u;
  });
  return btn;
}

function renderDropped(stageH) {
  const { files, tools, label } = dropped;
  const what = files.length === 1 ? files[0].name : tr(`${files.length} ไฟล์`, `${files.length} files`);
  if (stageH) stageH.textContent = tools.length
    ? tr(`ไฟล์ของคุณใช้ได้กับ ${tools.length} เครื่องมือ`, `Your file works with ${tools.length} tools`)
    : tr("ยังไม่มีเครื่องมือที่รับไฟล์ชนิดนี้", "No tool takes this file type yet");
  hits.textContent = "";
  grids.appendChild(el("div", { class: "drop-head" }, [
    el("div", { class: "drop-thumbs" }, [
      ...files.slice(0, MAX_THUMBS).map(dropThumb),
      files.length > MAX_THUMBS
        ? el("span", { class: "drop-more" }, `+${files.length - MAX_THUMBS}`) : null,
    ]),
    el("div", { class: "drop-what" }, [el("b", {}, what), label ? el("span", {}, label) : null]),
    el("button", { class: "btn-soft", type: "button",
      onclick: () => { dropped = null; renderHome(); } }, tr("ล้าง", "Clear")),
  ]));
  if (!tools.length) {
    grids.appendChild(el("div", { class: "empty" }, dropped.mixed ? [
      el("b", {}, tr(`ไฟล์ที่วางมาเป็นคนละชนิดกัน (${label})`, `These files are different types (${label})`)),
      el("div", {}, tr("ยังไม่มีเครื่องมือที่ทำงานกับทุกชนิดพร้อมกัน — กด “ล้าง” แล้วใส่ทีละชนิด",
                       "No tool handles all of them at once — press “Clear” and add one type at a time")),
    ] : [
      el("b", {}, tr("ไฟล์ชนิดนี้ยังไม่มีเครื่องมือรองรับ", "No tool supports this file type yet")),
      el("div", {}, tr("ลองไฟล์ PDF · Word · Excel · CSV · PowerPoint · รูปภาพ",
                       "Try a PDF, Word, Excel, CSV, PowerPoint or image file")),
    ]));
    return;
  }
  grids.appendChild(el("div", { class: "pills" }, tools.map((t) => pillOf(t, "", async () => {
    uiMod = uiMod || await import("./ui.js");
    uiMod.stashFiles(files);          // ไฟล์ตามไปด้วย ไม่ต้องเลือกใหม่ที่หน้าเครื่องมือ
    dropped = null;
    go(t.id);
  }))));
}

document.addEventListener("dragenter", (e) => {
  if (!onHomeNow() || !dragHasFiles(e)) return;
  homeDragDepth++;
  showVeil(true, tr("ปล่อยไฟล์เพื่อดูว่าทำอะไรได้บ้าง", "Drop a file to see what you can do"));
});
document.addEventListener("dragover", (e) => { if (onHomeNow() && dragHasFiles(e)) e.preventDefault(); });
document.addEventListener("dragleave", () => {
  if (!onHomeNow()) return;
  if (--homeDragDepth <= 0) { homeDragDepth = 0; showVeil(false); }
});
document.addEventListener("drop", (e) => {
  if (!onHomeNow()) return;
  homeDragDepth = 0; showVeil(false);
  const f = [...(e.dataTransfer?.files || [])];
  if (!f.length) return;
  e.preventDefault();
  takeHomeFiles(f);
});
document.addEventListener("paste", (e) => {
  if (!onHomeNow()) return;
  const f = filesFromClipboard(e);
  if (!f.length) return;             // วางข้อความธรรมดา (เช่นในช่องค้นหา) ปล่อยผ่านตามปกติ
  e.preventDefault();
  takeHomeFiles(f);
});

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
      onclick: () => { dropped = null; activeCat = activeCat === id ? "" : id; renderCats(); renderHome(search.value); },
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
const mounting = new Map();             // เครื่องมือที่กำลังโหลดอยู่ — กันสร้างซ้อนตอนถูกเรียกพร้อมกัน
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
    // ‼️ กดป้ายครั้งเดียวแต่ go() ถูกเรียก 2 รอบเสมอ — รอบแรกจากปุ่ม รอบสองจาก hashchange
    //    ที่ go() เองเป็นคนตั้ง · ตอนนั้น mounted ยังว่างอยู่ (ยังไม่ await เสร็จ) กันไม่ทัน
    //    ผลคือ mount() ถูกเรียก 2 ครั้ง สร้างเครื่องมือซ้อนกัน 2 ชุด ชุดแรกถูกทิ้ง
    //    (จับได้ตอนทำ "ลากไฟล์ลงหน้าแรก" — ไฟล์ที่ฝากไว้ถูกชุดที่ถูกทิ้งหยิบไปกิน)
    //    จองคิวด้วย promise เดียวต่อเครื่องมือ ทั้งสองรอบจึงได้ DOM ก้อนเดียวกัน
    let job = mounting.get(id);
    if (!job) {
      // โหลดโค้ดเครื่องมือกับไลบรารีขนานกัน ไม่ต่อคิวกัน
      job = Promise.all([import(`./tools/${id}.js`), loadLibs(...tool.libs)])
        .then(([mod]) => { const node = mod.mount(tool); mounted.set(id, node); return node; });
      mounting.set(id, job);
      job.catch(() => {}).finally(() => mounting.delete(id));
    }
    const node = await job;
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
  searchTimer = setTimeout(() => { if (search.value.trim()) dropped = null; activeCat = ""; renderCats(); renderHome(search.value); }, 90);
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

// แถบบนใสตอนอยู่บนสุด กลายเป็นกระจกฝ้าเมื่อเลื่อนลง
// ‼️ อ่าน scrollY ใน rAF ไม่ใช่ในตัว handler — อ่านค่า layout ระหว่างสกอลล์บังคับให้เบราว์เซอร์
//    คำนวณผังใหม่ทุกเฟรม (forced reflow) · passive:true บอกเบราว์เซอร์ว่าเราไม่ขวางการสกอลล์
{
  const root = document.documentElement;
  let ticking = false;
  // จำตำแหน่งเดิมไว้ดูทิศทาง — แถบหมวดบนมือถือหลบเมื่อเลื่อนลง กลับมาเมื่อเลื่อนขึ้น
  let lastY = 0;
  const HIDE_AFTER = 220;               // ยังไม่หลบจนกว่าจะพ้นฉากเปิดไปแล้ว
  const sync = () => {
    ticking = false;
    const y = window.scrollY;
    if (y > 8) root.dataset.scrolled = "";
    else root.removeAttribute("data-scrolled");

    if (y > HIDE_AFTER && y > lastY + 6) root.dataset.hidecats = "";
    else if (y < lastY - 6 || y <= HIDE_AFTER) root.removeAttribute("data-hidecats");
    lastY = y;
  };
  addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(sync); }
  }, { passive: true });
  sync();
}

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
// ?q=... เปิดเว็บพร้อมคำค้นมาเลย — ใช้กับ SearchAction ใน schema.org และแปะลิงก์ส่งกันได้
{
  const q0 = new URLSearchParams(location.search).get("q") || "";
  if (q0) { search.value = q0; searchBox.classList.add("has"); }
  renderHome(q0);
}
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
