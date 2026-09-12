// ── เปลือกแอป: วาดหน้าแรก + เราเตอร์ + prefetch ตามเจตนาผู้ใช้ ─────────────
// ไฟล์นี้คือ JavaScript ก้อนเดียวที่หน้าแรกโหลด (ไม่กี่ KB) โค้ดของเครื่องมือ
// และไลบรารีหนัก ๆ จะถูกดึงก็ต่อเมื่อผู้ใช้แสดงเจตนาจะใช้จริงเท่านั้น

import { TOOLS, GROUPS, byId } from "./registry.js";
import { warmLibs, loadLibs } from "./loader.js";
import { searchTools, highlightRange } from "./search.js";
import { el, $, $$, showVeil, filesFromClipboard } from "./dom.js";
import { toolIcon, uiIcon } from "./icons.js";
import { LANG, IS_EN, tr, setLang, applyStatic, pl } from "./i18n.js";

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

/* ── ตัวเรียงรายการเครื่องมือ ───────────────────────────────────────────────
 * แนวคิดจากการผ่าเว็บ thepexcel.com 12/09/2026 เขาแยก "ตัวเรียง" ออกจาก "ตัวกรอง"
 * ชัดเจน (ตัวกรองอยู่แถบข้าง ตัวเรียงเป็น dropdown เหนือรายการ) และมีถึง 9 แบบ
 * เพราะคลังเขา 511 รายการ ของเรา 41 ตัว จึงเอาแค่ 3 แบบที่ตอบคำถามคนละข้อกันจริง ๆ
 *   หมวด   = "มีอะไรให้ใช้บ้าง"     (ค่าตั้งต้น จัดกลุ่มให้เห็นภาพรวม)
 *   ใหม่   = "มีอะไรเพิ่มมาตั้งแต่ครั้งก่อน"
 *   ล่าสุด = "ตัวที่ฉันใช้ประจำอยู่ไหน"
 * ‼️ สองแบบหลังต้องวาดเป็นรายการเรียบ ไม่มีหัวหมวดคั่น ไม่งั้นลำดับที่เรียงมาถูกหัวหมวดหั่นทิ้ง */
const SORTS = ["group", "new", "recent"];
let sortBy = "group";
try { const v = localStorage.getItem("fk:sort"); if (SORTS.includes(v)) sortBy = v; } catch { /* โหมดส่วนตัว */ }
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
    ? tr(`${(GROUPS.find((g) => g.id === activeCat) || {}).label}, ${shown.length} เครื่องมือ`,
         `${(GROUPS.find((g) => g.id === activeCat) || {}).label}, ${shown.length} tools`)
    : tr(`${TOOLS.length} เครื่องมือ ทำงานในเครื่องคุณทั้งหมด`,
         `${TOOLS.length} tools, all of them run on your device`);

  const box = el("div", { class: "pills" });
  /* เรียงแบบอื่นที่ไม่ใช่ตามหมวด = รายการเรียบ ไม่มีหัวหมวดคั่น
     ‼️ ถ้ายังใส่หัวหมวด ลำดับที่เพิ่งเรียงมาจะถูกหั่นเป็นก้อน ๆ จนอ่านลำดับไม่ออก */
  const flat = sortedFlat(shown);
  if (flat) {
    flat.forEach((t) => box.appendChild(pillOf(t)));
    grids.appendChild(box);
    return;
  }
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
    /* ‼️ เคยลองให้หัวข้อของหมวดเล็กไหลอยู่ในแถวเดียวกับป้าย หน้าสั้นลงจาก 2643 เหลือ 1990 จริง
       แต่เปิดดูด้วยตาแล้วอ่านไม่รู้เรื่อง หัวข้อไปเกาะท้ายแถวของหมวดก่อนหน้า
       คนอ่านนึกว่าเป็นป้ายของกลุ่มซ้ายมือ ถอนออก 11/09/2026 อย่าลองซ้ำ
       ความสูงไปคุมที่เกณฑ์ความหนาแน่นต่อเครื่องมือใน tests/browser_ux.py แทน */
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
  dropped = { files, kinds, tools, label: kinds.map(typeLabel).join(", "), mixed: kinds.length > 1 };
  search.value = "";
  activeCat = "";
  renderCats();
  renderHome();
  grids.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ‼️ ชื่อไฟล์อย่างเดียวไม่พอ — ภาพที่แคปมาจากคลิปบอร์ดชื่อ "image.png" เหมือนกันหมด
   ต้องเห็นรูปถึงจะรู้ว่าหยิบถูกใบ · กดแล้วดูใหญ่ได้ด้วย (โหลดตัวดูตอนกดครั้งแรกเท่านั้น) */
function dropThumb(file, allFiles) {
  if (!file) return null;
  const btn = el("button", {
    class: "drop-thumb", type: "button",
    title: tr("กดเพื่อดูรูปใหญ่", "Click to view larger"),
    "aria-label": tr(`ดู ${file.name} ขนาดใหญ่`, `View ${file.name} larger`),
    onclick: async () => { const m = await import("./preview.js"); m.viewFile(file, allFiles); },
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
  const what = files.length === 1 ? files[0].name : tr(`${files.length} ไฟล์`, `${pl(files.length, "file", "files")}`);
  if (stageH) stageH.textContent = tools.length
    ? tr(`ไฟล์ของคุณใช้ได้กับ ${tools.length} เครื่องมือ`, `Your file works with ${tools.length} tools`)
    : tr("ยังไม่มีเครื่องมือที่รับไฟล์ชนิดนี้", "No tool takes this file type yet");
  hits.textContent = "";
  grids.appendChild(el("div", { class: "drop-head" }, [
    el("div", { class: "drop-thumbs" }, [
      ...files.slice(0, MAX_THUMBS).map((f) => dropThumb(f, files)),
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
      el("div", {}, tr("ยังไม่มีเครื่องมือที่ทำงานกับทุกชนิดพร้อมกัน กด “ล้าง” แล้วใส่ทีละชนิด",
                       "No tool handles all of them at once, press “Clear” and add one type at a time")),
    ] : [
      el("b", {}, tr("ไฟล์ชนิดนี้ยังไม่มีเครื่องมือรองรับ", "No tool supports this file type yet")),
      el("div", {}, tr("ลองไฟล์ PDF, Word, Excel, CSV, PowerPoint, รูปภาพ",
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
  // ผ้าคลุมจอตอนลากไฟล์ กับภาพย่อของไฟล์ที่วางลงหน้าแรก ใช้สไตล์จาก tool.css
  // ต้องดึงมาตั้งแต่ตอนเริ่มลาก ไม่ใช่รอตอนวางเสร็จ ไม่งั้นแว้บเป็นของไม่มีสไตล์
  loadToolCss();
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
  loadToolCss();                     // ภาพย่อของไฟล์ที่วางไว้ใช้สไตล์จาก tool.css
  takeHomeFiles(f);
});

function showEmpty(q) {
  grids.appendChild(el("div", { class: "empty" }, [
    el("b", {}, tr(`ไม่พบเครื่องมือที่ตรงกับ “${q}”`, `No tool matches “${q}”`)),
    el("div", {}, tr("ลองพิมพ์สั้นลง หรือใช้คำอื่น เช่น “PDF”, “Word”, “รูป”, “ไทย”",
                     "Try a shorter word, or another one: “PDF”, “Word”, “image”, “Excel”")),
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
  renderSort();
}

/** แถบเรียงลำดับ อยู่ท้ายแถบหมวด
 *
 * ‼️ ใช้ <select> ไม่ใช่ปุ่มเรียงกัน ด้วยเหตุผล 3 ข้อที่เทสของเราจับได้เองตอนลองทำเป็นปุ่ม
 *    ① ปุ่ม 3 ปุ่มกิน Tab 3 ที่ ทำให้หน้าแรกทะลุเพดาน 20 ที่ของ browser_a11y
 *    ② ปุ่มเตี้ยกว่า 36px บนจอ 390px ตกเกณฑ์นิ้วแตะของ browser_layout
 *    ③ line-height:1 ที่ใส่ให้ปุ่มเตี้ย ทำสระไทยล้นตามกฎ 1.3 ของโปรเจกต์
 *    และบังเอิญตรงกับของ thepexcel พอดี เขาก็ใช้ <select> เหมือนกัน (ของเขามีถึง 9 ตัวเลือก)
 *    เพราะตัวเรียงเป็น "เลือกหนึ่งจากหลายอย่าง" ซึ่งเป็นงานของ select อยู่แล้ว */
function renderSort() {
  const labels = {
    group: tr("ตามหมวด", "By category"),
    new: tr("ใหม่ก่อน", "Newest first"),
    recent: tr("เพิ่งใช้ก่อน", "Recently used"),
  };
  /* ‼️ ยังไม่เคยเปิดเครื่องมือไหนเลย = ไม่มีลำดับ "เพิ่งใช้" ให้เรียง
     ถ้าปล่อยให้เลือกได้ จะได้รายการเรียงตามชื่อ id ซึ่งไม่มีความหมาย
     แต่ผู้ใช้จะนึกว่านั่นคือประวัติการใช้ของตัวเอง */
  const noHistory = recentIds().length === 0;
  const sel = el("select", { class: "sort-sel", "aria-label": tr("เรียงลำดับเครื่องมือ", "Sort tools") });
  for (const id of SORTS) {
    if (id === "recent" && noHistory) continue;
    sel.appendChild(el("option", { value: id, selected: sortBy === id }, labels[id]));
  }
  sel.addEventListener("change", () => {
    sortBy = sel.value;
    try { localStorage.setItem("fk:sort", sortBy); } catch { /* โหมดส่วนตัว */ }
    renderHome(search.value);
  });
  cats.appendChild(el("div", { class: "sortbar" }, [
    el("span", { class: "sort-lb" }, tr("เรียง", "Sort")), sel,
  ]));
}

/** เรียงรายการเครื่องมือตามที่เลือก คืน null ถ้าให้ใช้การจัดกลุ่มตามหมวดแบบเดิม */
function sortedFlat(list) {
  if (sortBy === "recent" && recentIds().length === 0) return null;   // จำค่าไว้แต่ประวัติถูกล้าง
  if (sortBy === "new") {
    /* ‼️ since เป็นสตริง YYYY-MM-DD เทียบตรง ๆ ได้ ไม่ต้องแปลงเป็นวันที่
       ตัวที่ไม่มี since ให้ไปท้ายสุด ไม่ใช่ขึ้นต้น (ค่าว่างเทียบแล้วน้อยกว่าทุกอย่าง) */
    return [...list].sort((a, b) => (b.since || "").localeCompare(a.since || "") || a.id.localeCompare(b.id));
  }
  if (sortBy === "recent") {
    const order = recentIds();
    const rank = (t) => { const i = order.indexOf(t.id); return i === -1 ? 1e9 : i; };
    return [...list].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  }
  return null;
}

/* ── prefetch: เริ่มดึงโค้ดเครื่องมือ + ไลบรารี ตอนผู้ใช้ "เล็ง"การ์ด ────────
   ผู้ใช้ใช้เวลาจากชี้เมาส์ถึงคลิกราว 100-300 ms ซึ่งพอให้เริ่มโหลดไปก่อนได้ */
const prefetched = new Set();
function prefetch(t) {
  if (!t || prefetched.has(t.id)) return;
  prefetched.add(t.id);
  loadToolCss();                         // สไตล์หน้าเครื่องมือ ดึงพร้อมโค้ดตั้งแต่ตอนเล็งการ์ด
  import(`./tools/${t.id}.js`).catch(() => prefetched.delete(t.id));
  warmLibs(t.libs);
}

/* ── เราเตอร์ ── */
const mounted = new Map();              // เก็บ DOM ของเครื่องมือที่เคยเปิด กลับมาแล้วสถานะยังอยู่
const mounting = new Map();             // เครื่องมือที่กำลังโหลดอยู่ — กันสร้างซ้อนตอนถูกเรียกพร้อมกัน

/* ‼️ แคชนี้เคยไม่มีเพดาน — เปิดครบ 29 ตัวคือถือ DOM ไว้ 29 ก้อนตลอดอายุแท็บ พร้อม
 *    objectURL ของภาพย่อทุกใบที่ไม่เคยถูกคืน (วัดจาก tests/browser_leak.py)
 *    ตัวที่ถูกถอดออกไปจะ mount ใหม่ตอนกดกลับเข้าไป เร็วอยู่แล้วเพราะโค้ดอยู่ในแคชเบราว์เซอร์
 * ‼️ แต่ "เครื่องมือที่ยังมีไฟล์ของผู้ใช้ค้างอยู่" ห้ามถอดเด็ดขาด — คนที่ลากไฟล์ 30 ใบใส่ไว้
 *    แล้วแวะไปดูเครื่องมืออื่น ต้องกลับมาเจอของเดิมครบเสมอ ไม่ใช่ต้องลากใหม่ทั้งชุด */
const MAX_CACHED = 6;
/* พักเครื่องมือที่กำลังจะถูกซ่อน — คืนหน่วยความจำภาพย่อทันที (ไฟล์ยังอยู่ครบ)
 * เรียกก่อนล้าง #tool ทุกครั้ง · ui.js โหลดแล้วแน่นอนถ้ามีเครื่องมือเปิดอยู่ ถ้ายังไม่มีก็ไม่มีอะไรให้พัก */
function sleepCurrent() {
  const showing = toolBox.firstElementChild;
  if (!showing || !mounted.size) return;
  import("./ui.js").then((m) => m.sleepTree(showing)).catch(() => {});
}
async function trimMounted(keepId) {
  if (mounted.size <= MAX_CACHED) return;
  const { disposeTree, treeHasFiles } = await import("./ui.js");   // โหลดอยู่แล้วแน่นอน (เครื่องมือทุกตัวใช้)
  for (const id of [...mounted.keys()]) {
    if (mounted.size <= MAX_CACHED) break;
    if (id === keepId) continue;
    const node = mounted.get(id);
    if (treeHasFiles(node)) continue;              // ยังมีงานค้างอยู่ในนั้น ปล่อยไว้
    disposeTree(node);
    mounted.delete(id);
  }
}
/* ‼️ สลับหน้าเร็ว ๆ (กดรัว/hash เปลี่ยนติด ๆ กัน) ทำให้ transition ที่ค้างอยู่ถูกสั่งข้าม
 * แล้ว ready ของมัน reject ด้วย "Transition was skipped" โดยไม่มีใครรับ → โผล่เป็น
 * page error ในคอนโซลรัว ๆ (จับได้จาก tests/browser_stress.py ⑥ — 20 ครั้งรวดได้ 5 error)
 * ต้องดักให้ครบทั้ง 3 promise ไม่ใช่แค่ finished (ตัวที่ reject จริงคือ ready) */
const hush = (pr) => { pr && typeof pr.catch === "function" && pr.catch(() => {}); };
const swap = (fn) => {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return fn();
  const t = document.startViewTransition(fn);
  hush(t.ready); hush(t.finished); hush(t.updateCallbackDone);
};

async function go(id, push = true) {
  const tool = byId(id);
  if (!tool) return goHome();
  if (push && location.hash !== "#/" + id) location.hash = "#/" + id;
  pushRecent(id);

  swap(() => {
    document.body.classList.add("tool");
    document.title = `${tool.title} - FileKit`;
    sleepCurrent();
    toolBox.innerHTML = "";
    const cached = mounted.get(id);
    // ย้ายไปท้ายคิว = "เพิ่งใช้ล่าสุด" ตัวที่ไม่ได้แตะนานสุดจึงถูกถอดออกก่อนตอนแคชเต็ม
    if (cached) {
      mounted.delete(id); mounted.set(id, cached);
      toolBox.appendChild(cached);
      import("./ui.js").then((m) => m.wakeTree(cached)).catch(() => {});   // วาดภาพย่อกลับมา
      return;
    }
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
      // ‼️ ต้องรอ tool.css จริง ๆ ไม่ใช่แค่สั่งโหลด ไม่งั้นเครื่องมือโผล่มาแบบไม่มีสไตล์แว้บหนึ่ง
      job = Promise.all([import(`./tools/${id}.js`), loadLibs(...tool.libs), loadToolCss()])
        .then(([mod]) => { const node = mod.mount(tool); mounted.set(id, node); return node; });
      mounting.set(id, job);
      job.catch(() => {}).finally(() => mounting.delete(id));
    }
    const node = await job;
    toolBox.innerHTML = "";
    toolBox.appendChild(node);
    await trimMounted(id);
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
    document.title = tr("FileKit - เครื่องมือจัดการไฟล์ในเบราว์เซอร์",
                        "FileKit - file tools that run in your browser");
    sleepCurrent();
    toolBox.innerHTML = "";
    renderHome(search.value);            // อัปเดตแถว "เพิ่งใช้"ให้ทันที
  });
  if (push && location.hash) location.hash = "";
}

function route() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (id && byId(id)) return go(id, false);
  /* ‼️ ชิปหมวดบนหน้าเครื่องมือฝากหมวดไว้ก่อนพากลับหน้าแรก (ui.js import app.js ไม่ได้ จะวนกันเอง)
     อ่านครั้งเดียวแล้วลบทิ้ง ไม่งั้นกลับหน้าแรกครั้งต่อ ๆ ไปจะโดนกรองค้างโดยไม่ได้ตั้งใจ */
  try {
    const want = sessionStorage.getItem("fk:gocat");
    if (want) {
      sessionStorage.removeItem("fk:gocat");
      /* ‼️ ต้องวาดแถบหมวดใหม่ด้วย ไม่งั้นกรองจริงแต่ปุ่มยังชี้ว่า "ทั้งหมด" อยู่
         ผู้ใช้เห็นรายการสั้นลงโดยไม่รู้ว่าถูกกรองอยู่ (เจอจริงตอนทดสอบ) */
      if (GROUPS.some((g) => g.id === want)) { activeCat = want; renderCats(); }
    }
  } catch { /* โหมดส่วนตัว */ }
  // ลิงก์เก่า/พิมพ์ผิด → กลับหน้าแรกแล้วเก็บกวาด hash ที่ไม่มีความหมายทิ้งด้วย
  // (replaceState ไม่เพิ่มประวัติ ปุ่มย้อนกลับจึงไม่ติดกับดักวนที่ hash เสีย)
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  goHome(false);
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
const THEMES = ["light", "dark"];   // ‼️ ไม่มี "auto" ในวงจรกด — ดูหมายเหตุที่ applyTheme
const THEME_NAME = IS_EN
  ? { light: "light", dark: "dark" }
  : { light: "โหมดสว่าง", dark: "โหมดมืด" };
const themeBtn = $("#theme");
function applyTheme(v) {
  if (v === "auto") delete document.documentElement.dataset.theme;   // ค่าเริ่มต้นก่อนผู้ใช้เลือกเอง
  else document.documentElement.dataset.theme = v;
  store.set("fk-theme", v);
  // ไอคอนทั้ง 3 แบบอยู่ในหน้าแล้ว CSS เลือกโชว์เอง — JS ไม่ต้องยัดทีหลัง (กันปุ่มว่างแวบ)
  const name = THEME_NAME[v] || tr("ตามเครื่อง", "system");
  themeBtn.title = themeBtn.ariaLabel = tr(`ธีม: ${name} (กดเพื่อสลับ)`, `Theme: ${name} (click to switch)`);
}
/* ‼️ ค่าเริ่มต้นยังเป็น "ตามระบบ" (ไม่เขียนลง localStorage จนกว่าผู้ใช้จะกดเลือกเอง)
   แต่ปุ่มมีแค่ 2 สถานะให้กดสลับ — คนกดปุ่มธีมเพราะอยากได้สว่างหรือมืด ไม่มีใครกดเพื่อขอ
   "ตามระบบ" · ปุ่ม 3 สถานะทำให้ต้องกดวน 3 ครั้งและมีไอคอนที่ต้องเดาความหมาย
   (เจ้าของเว็บงงกับไอคอนจอมอนิเตอร์เอง 08/09/2026) */
applyTheme(store.get("fk-theme", "auto"));
themeBtn.addEventListener("click", () => {
  // ยังไม่เคยเลือกเอง → กดครั้งแรกให้ไป "ตรงข้ามกับที่เห็นอยู่ตอนนี้"
  const cur = store.get("fk-theme", "auto");
  const now = cur !== "auto" ? cur
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(now === "dark" ? "light" : "dark");
});

/* ปุ่มภาษา 2 ตัว — ตัวที่ใช้อยู่ทำเครื่องหมายด้วย aria-current (ไม่ใช่แค่สี)
   คนที่ใช้โปรแกรมอ่านหน้าจอจึงรู้ด้วยว่าตอนนี้อยู่ภาษาไหน · กดตัวที่ใช้อยู่แล้วไม่ทำอะไร */
$$("#lang .langopt").forEach((b) => {
  const isCurrent = b.dataset.lang === (IS_EN ? "en" : "th");
  b.setAttribute("aria-current", String(isCurrent));
  b.setAttribute("aria-label", b.dataset.lang === "th" ? "ภาษาไทย" : "English");
  if (!isCurrent) b.addEventListener("click", () => setLang(b.dataset.lang));
});

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
  /* ‼️ Esc ตอนเปิดดูรูปเต็มจออยู่ = เดิมปิดกล่องแล้ว "เด้งออกจากเครื่องมือกลับหน้าแรก" พร้อมกัน
   *    ไฟล์ที่เลือกไว้หายหมด ต้องลากเข้ามาใหม่ทั้งชุด (วัดจริงแล้ว: แถวไฟล์เหลือ 0)
   *    กล่อง <dialog> กิน Esc ของตัวเองอยู่แล้ว ตรงนี้แค่ต้องไม่ทำงานซ้อนตอนมีกล่องเปิดอยู่ */
  if (e.key === "Escape" && document.body.classList.contains("tool") && !typing
      && !document.querySelector("dialog[open]")) goHome();
});

// ป้ายปุ่มลัดต้องตรงกับเครื่องที่ใช้จริง — Mac ใช้ ⌘ ไม่ใช่ Ctrl
{
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
/* ‼️ ตอนโหลดหน้าแรก (hash ว่าง) route() จะเรียก goHome() ซึ่ง renderHome() ซ้ำอีกรอบ
 *    = วาดรายการเครื่องมือ 2 ครั้งติดกันทุกครั้งที่เปิดเว็บ เนื้อหาโป่งสองที ดัน footer หลุดจอ
 *    วัดจริงได้ CLS 0.174 (เพดานที่ยอมรับกันคือ 0.05) ทั้งที่รอบที่สองได้ผลเหมือนเดิมเป๊ะ
 *    (จับได้จาก tests/browser_perfbudget.py ด้วย MutationObserver นับการแทนที่ #tools) */
if (location.hash.replace(/^#\/?/, "")) route();

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


/* สไตล์ของ "หน้าเครื่องมือ" (64 KB) — เดิมโหลดทันทีตั้งแต่หน้าแรกทุกครั้ง ทั้งที่คนที่แวะมาดู
 * เฉย ๆ ไม่เคยเปิดเครื่องมือเลยก็ต้องจ่ายค่านี้ฟรี ๆ (ใหญ่กว่า CSS ของหน้าแรกทั้งก้อนอีก)
 * ‼️ ต้องมาถึงก่อนเครื่องมือถูกวาดเสมอ ไม่งั้นหน้าเครื่องมือจะแว้บเป็นหน้าเปล่าก่อนสไตล์มา
 *    จึงดึงตอนผู้ใช้ "แสดงเจตนา" (ชี้เมาส์/แตะป้ายเครื่องมือ) แบบเดียวกับที่ prefetch โค้ดเครื่องมือ
 *    และรออย่างแท้จริงก่อนวาด ด้วย onload ของ <link> */
/* ‼️ เก็บ promise ไว้บนตัวฟังก์ชันเอง ไม่ใช่ตัวแปร let ข้างนอก — go() ถูกเรียกได้ตั้งแต่
 *    ตอน route() บรรทัดบน ๆ ซึ่งยังมาไม่ถึงบรรทัดนี้ ถ้าใช้ let จะพังด้วย ReferenceError
 *    (temporal dead zone) เฉพาะตอนเปิดเว็บด้วยลิงก์เครื่องมือตรง ๆ ซึ่งเป็นทางที่คนแชร์ลิงก์กันใช้ */
function loadToolCss() {
  if (loadToolCss.p) return loadToolCss.p;
  loadToolCss.p = new Promise((resolve) => {
    const link = el("link", { rel: "stylesheet", href: "assets/css/tool.css" });
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });   // โหลดไม่ได้ก็ต้องไม่ค้างหน้า
    document.head.appendChild(link);
  });
  return loadToolCss.p;
}
// เปิดเว็บมาที่ลิงก์เครื่องมือตรง ๆ = ต้องใช้ทันที ไม่ต้องรอเจตนา
// (นอกจากนี้ดึงตอนผู้ใช้เล็งป้ายเครื่องมือ หรือเริ่มลาก/วางไฟล์ลงหน้าแรก ดูจุดเรียกด้านบน)
if (location.hash.replace(/^#\/?/, "")) loadToolCss();

/* แถบ "เตรียมใช้งานออฟไลน์" ท้ายหน้าแรก — ดึงเข้ามาตอนเบราว์เซอร์ว่าง ไม่แย่งเวลาวาดหน้าแรก
 * ‼️ แถบนี้ใช้สไตล์ร่วมจาก tool.css (ปุ่ม แถบความคืบหน้า) — วัดจริงแล้วถ้าไม่มี tool.css
 *    มันสูงขึ้น 300px และหน้าจะกระตุกทันทีที่สไตล์ตามมาทีหลัง จึงต้องรอสไตล์ให้มาถึงก่อน
 *    แล้วค่อยใส่แถบลงหน้า = ไม่มีจังหวะที่ผู้ใช้เห็นของยังไม่แต่งตัว และ CLS ยังเป็น 0 */
{
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));

  idle(() => {
    Promise.all([import("./offline.js"), loadToolCss()])
      .then(([m]) => document.querySelector("footer")?.before(m.offlineBar()))
      .catch(() => {});
  });
}

// Service worker: ทำให้เปิดซ้ำเร็วและใช้งานออฟไลน์ได้
/* ── แจ้งเมื่อมีเวอร์ชันใหม่ ────────────────────────────────────────────────
 * ‼️ อาการที่เจ้าของเว็บเจอเอง: ปล่อยของใหม่แล้วกด Ctrl+Shift+R ก็ยังเห็นของเก่าค้าง
 *    ต้นเหตุไม่ใช่แคชพัง — service worker ตัวเก่ายังเป็นคนเสิร์ฟหน้านั้นอยู่ ตัวใหม่เพิ่ง
 *    ติดตั้งเสร็จและรอคิวอยู่เบื้องหลัง กว่าจะได้คุมจริงคือการโหลดรอบถัดไป
 *    (พิสูจน์ด้วยค่าจริงใน tests/browser_swupdate.py: hard reload ครั้งแรกเห็นของใหม่แว้บหนึ่ง
 *     เพราะเบราว์เซอร์ข้าม service worker ไปดึงจากเน็ตตรง ๆ แล้ว reload ถัดมาย้อนกลับไปของเก่า)
 * เดิมไม่มีอะไรบอกผู้ใช้เลยสักอย่าง จึงดูเหมือนเว็บพัง · แก้ด้วยการบอกให้รู้ตัวแล้วให้กดเอง
 * ‼️ ห้ามรีโหลดให้อัตโนมัติ — ผู้ใช้อาจมีไฟล์ค้างอยู่ในเครื่องมือ รีโหลดเองคือทำงานเขาหาย */
function updateBar() {
  if ($("#updbar")) return;
  const bar = el("div", { class: "upd-bar", id: "updbar", role: "status" }, [
    el("span", { class: "upd-dot", "aria-hidden": "true" }),
    el("span", {}, tr("มีเวอร์ชันใหม่พร้อมใช้แล้ว", "A new version is ready")),
    el("button", { class: "upd-go", type: "button",
      onclick: () => location.reload() }, tr("รีเฟรชเลย", "Refresh now")),
    el("button", { class: "upd-x", type: "button",
      "aria-label": tr("ปิดข้อความนี้", "Dismiss"),
      onclick: () => bar.remove() }, [uiIcon("close", "upd-x-ico")]),
  ]);
  document.body.appendChild(bar);
}

if ("serviceWorker"in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", async () => {
    let reg;
    try { reg = await navigator.serviceWorker.register("sw.js"); } catch { return; }
    // ‼️ เบราว์เซอร์/โหมดที่ปิด service worker ไว้ (โหมดส่วนตัวบางตัว, องค์กรที่ล็อกไว้)
    //    register() ไม่ throw แต่คืนค่าว่างมาเฉย ๆ — เดิมพังต่อทันทีเป็น TypeError หลุดคอนโซล
    if (!reg || typeof reg.addEventListener !== "function") return;
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      // ไม่มี controller = ติดตั้งครั้งแรกของเครื่องนี้ ไม่ใช่การอัปเดต ไม่ต้องรบกวน
      if (!sw || !navigator.serviceWorker.controller) return;
      sw.addEventListener("statechange", () => { if (sw.state === "installed") updateBar(); });
    });
    // กลับมาที่แท็บนี้อีกครั้งหลังทิ้งไว้นาน ค่อยถามหาของใหม่ที (ไม่ยิงถี่ ๆ ให้เปลืองเน็ต)
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < 10 * 60 * 1000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
  });
}
