/* ดูหน้า PDF ใหญ่ ใช้กับ "จัดการหน้า PDF" (18/11/2026 พี่ปอนด์ขอ ภาพย่อเล็กจนมองไม่เห็น)
 *
 * มีสองอย่าง
 *   ① peek  ชี้เมาส์ค้างบนการ์ดราว 400 ms ภาพใหญ่ลอยขึ้นข้างการ์ด (เฉพาะเครื่องที่มีเมาส์)
 *   ② openViewer  ดูเต็มจอ ซูมได้ทั้งล้อ บีบนิ้ว ปุ่ม + − พอดีจอ 100% ลากเลื่อน ดับเบิลคลิก ลูกศรเปลี่ยนหน้า Esc ปิด
 *
 * ‼️ ซูมแล้วต้องคม จึงเรนเดอร์จาก pdf.js ใหม่ตามระดับซูมทุกครั้งที่หยุดซูม
 *    ไม่ใช่ขยายภาพย่อ (ภาพย่อเรนเดอร์ที่ 0.35 ขยายสามเท่าก็แตกแล้ว)
 *    ระหว่างกำลังซูมใช้ภาพเดิมยืดไปก่อน แล้วค่อยสลับเป็นภาพคมเมื่อนิ่ง 140 ms
 * ‼️ จำกัดพื้นที่ภาพไว้ 16 ล้านพิกเซล เครื่องพี่ปอนด์แรมตึง ภาพ 400% ของ A4 ที่ dpr 2 จะกิน 200 MB ถ้าไม่จำกัด
 * โหลดตอนใช้เท่านั้น ไม่อยู่ในเส้นทางหน้าแรก */
import { el } from "./ui.js";
import { tr } from "./i18n.js";

const MAX_AREA = 16e6;          // พิกเซลสูงสุดของภาพที่เรนเดอร์หนึ่งใบ
const PT2CSS = 96 / 72;         // 100% = ขนาดจริงของกระดาษบนจอ (1 pt = 1/72 นิ้ว, 1 css px = 1/96 นิ้ว)
const MAX_ZOOM = 4;             // 400%

const STYLE = `
.pz{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;
  background:rgba(12,14,20,.86);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;
  animation:pz-in .18s var(--ease-snap,ease)}
@keyframes pz-in{from{opacity:0}to{opacity:1}}
.pz-top{display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:52px}
.pz-title{flex:1;min-width:0;font:600 14px/1.4 var(--font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pz-title small{font-weight:500;opacity:.72;margin-inline-start:8px}
.pz-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;cursor:default}
.pz-stage.can-pan{cursor:grab}
.pz-stage.panning{cursor:grabbing}
.pz-paper{position:absolute;left:0;top:0;transform-origin:0 0;background:#fff;
  box-shadow:0 18px 50px rgba(0,0,0,.45);will-change:transform}
.pz-paper canvas,.pz-paper img{display:block;width:100%;height:100%}
/* ── แก้ไขบนหน้าในตัวดู (เฟส 2 19/11/2026) ชั้นของที่วางซ้อนบนภาพ แผงเครื่องมือด้านขวา จอแคบอยู่ใต้ภาพ ── */
.pz-paper{overflow:hidden}
.pz-media{position:absolute;inset:0}
.pz-paper .pe-box img{height:auto}
.pz-main{flex:1;min-height:0;display:flex}
.pz-main > .pz-stage{min-width:0}
.pz-edit{width:340px;flex:none;overflow:auto;background:var(--card,#fff);color:var(--text,#111);
  border-radius:14px 0 0 14px;padding:12px 14px 16px;display:flex;flex-direction:column;gap:10px}
.pz:not(.editing) .pz-edit{display:none}
.pz:not(.editing) .pe-layer{pointer-events:none}
.pz:not(.editing) .pe-box .rm,.pz:not(.editing) .pe-grip{display:none}
.pz-edit .pz-edit-row{display:flex;flex-wrap:wrap;gap:6px}
.pz-btn[aria-pressed="true"]{background:rgba(255,255,255,.24)}
@media (max-width:760px){
  .pz-main{flex-direction:column}
  .pz-edit{width:auto;max-height:44vh;border-radius:14px 14px 0 0}
}
.pz-blank{display:grid;place-items:center;color:#667;font:600 14px var(--font);width:100%;height:100%}
.pz-bar{align-self:center;display:flex;align-items:center;gap:2px;margin:10px auto 16px;padding:5px;
  border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}
.pz-btn{appearance:none;border:0;background:transparent;color:#fff;min-width:38px;height:38px;padding:0 10px;
  border-radius:999px;font:600 13px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.pz-btn:hover:not(:disabled){background:rgba(255,255,255,.16)}
.pz-btn:focus-visible{outline:2px solid #fff;outline-offset:1px}
.pz-btn:disabled{opacity:.35;cursor:default}
.pz-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pz-pgno{min-width:54px;text-align:center;font:600 13px/1 var(--font);font-variant-numeric:tabular-nums;opacity:.9}
.pz-pct{min-width:58px;text-align:center;font:600 13px/1 var(--font);font-variant-numeric:tabular-nums}
.pz-sep{width:1px;height:22px;background:rgba(255,255,255,.2);margin:0 4px}
.pz-close{margin-inline-start:auto}
.pz-busy{position:absolute;right:16px;bottom:12px;font:500 12px var(--font);opacity:.7}
@media (max-width:560px){ .pz-bar .pz-wide{display:none} .pz-btn{min-width:42px;height:42px} }
.pp-peek{position:fixed;z-index:900;pointer-events:none;background:#fff;border-radius:10px;
  box-shadow:0 22px 60px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.06);overflow:hidden;
  opacity:0;transform:scale(.96);transition:opacity .14s ease,transform .16s var(--ease-snap,ease)}
.pp-peek.on{opacity:1;transform:none}
.pp-peek canvas,.pp-peek img{display:block;width:100%;height:auto}
.pp-peek .pz-blank{aspect-ratio:var(--ar,0.707)}
@media (prefers-reduced-motion:reduce){ .pz{animation:none} .pp-peek{transition:none} }
`;
let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  document.head.appendChild(el("style", {}, STYLE));
}

/* ไอคอนเส้นเล็ก ๆ ใช้เฉพาะในตัวดู (ไม่เพิ่มเข้า icons.js ซึ่งอยู่ในเส้นทางหน้าแรก) */
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  prev: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
};
function ico(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", PATHS[name]);
  svg.appendChild(p);
  return svg;
}

/** ขนาดหน้าที่ "เห็น" (pt) หลังครอบและหมุนแล้ว */
export function shownSize(it) {
  let w = it.pw, h = it.ph;
  if (it.crop) { w *= it.crop.w; h *= it.crop.h; }
  return (it.rotate % 180) ? { w: h, h: w } : { w, h };
}

/** เรนเดอร์หน้าเป็น canvas ที่ความกว้างเป้าหมาย (px จริง) พร้อมครอบและหมุนตามที่ผู้ใช้จัด
 *  ‼️ ค่าครอบเก็บเป็นสัดส่วนของภาพที่ pdf.js วาดตามการหมุนเดิมของไฟล์ จึงเรนเดอร์แบบไม่ใส่การหมุนของเราก่อน
 *     ตัดส่วนที่ครอบ แล้วค่อยหมุนตอนวาดลงใบสุดท้าย */
export async function renderItem(doc, it, targetW) {
  const page = await doc.getPage(it.index + 1);
  const base = page.getViewport({ scale: 1 });
  // ด้านกว้างที่เห็นหลังครอบและหมุน = targetW
  const contentW = it.crop ? base.width * it.crop.w : base.width;
  const contentH = it.crop ? base.height * it.crop.h : base.height;
  let scale = targetW / (it.rotate % 180 ? contentH : contentW);
  // จำกัดพื้นที่ภาพ
  const area = contentW * contentH * scale * scale;
  if (area > MAX_AREA) scale *= Math.sqrt(MAX_AREA / area);
  const vp = page.getViewport({ scale });
  const full = document.createElement("canvas");
  full.width = Math.max(1, Math.floor(vp.width));
  full.height = Math.max(1, Math.floor(vp.height));
  const ctx = full.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, full.width, full.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  const sx = it.crop ? Math.floor(it.crop.x * full.width) : 0;
  const sy = it.crop ? Math.floor(it.crop.y * full.height) : 0;
  const sw = it.crop ? Math.max(1, Math.round(it.crop.w * full.width)) : full.width;
  const sh = it.crop ? Math.max(1, Math.round(it.crop.h * full.height)) : full.height;
  if (!it.crop && !it.rotate) return full;
  const out = document.createElement("canvas");
  const turn = it.rotate % 180 !== 0;
  out.width = turn ? sh : sw;
  out.height = turn ? sw : sh;
  const o = out.getContext("2d");
  o.translate(out.width / 2, out.height / 2);
  o.rotate((it.rotate * Math.PI) / 180);
  o.drawImage(full, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  full.width = full.height = 0;
  return out;
}

function blankNode(it) {
  return el("div", { class: "pz-blank", style: { "--ar": `${it.pw} / ${it.ph}` } }, tr("หน้าว่าง", "Blank page"));
}

/* ── ① ภาพลอยตอนชี้ค้าง ───────────────────────────────────────────── */
/** @param grid ตะแกรงการ์ด  @param opts {itemOf(card), getDoc(fi), blocked()} */
export function attachPeek(grid, { itemOf, getDoc, blocked }) {
  ensureStyle();
  if (!matchMedia("(hover:hover) and (pointer:fine)").matches) return () => {};
  let timer = 0, shownFor = null, node = null, token = 0;
  const cache = new Map();    // คีย์ = ตัว item + การหมุน + การครอบ -> canvas (เก็บล่าสุด 12 ใบ)
  const keyOf = (it) => `${it.rotate}|${it.crop ? [it.crop.x, it.crop.y, it.crop.w, it.crop.h].join(",") : ""}`;
  const hide = () => {
    clearTimeout(timer);
    token++;
    shownFor = null;
    if (node) { const n = node; node = null; n.classList.remove("on"); setTimeout(() => n.remove(), 160); }
  };
  async function show(card) {
    // ‼️ เอกสารอาจถูกปิดไปแล้วระหว่างรอ (โหลดไฟล์ใหม่ทั้งชุด) ภาพลอยเป็นของเสริม พลาดก็เงียบไว้
    try { await showInner(card); } catch { hide(); }
  }
  async function showInner(card) {
    const it = itemOf(card);
    if (!it || blocked()) return;
    const my = ++token;
    shownFor = card;
    const r = card.getBoundingClientRect();
    const s = it.blank ? { w: it.pw, h: it.ph } : shownSize(it);
    const ar = s.w / s.h;
    // กว้างพอให้อ่านตัวหนังสือได้ แต่ไม่เกินจอ ตั้งไว้ข้างการ์ดฝั่งที่มีที่มากกว่า
    const roomR = innerWidth - r.right - 16, roomL = r.left - 16;
    const maxH = innerHeight - 24;
    let w = Math.min(460, Math.max(roomR, roomL) - 12, maxH * ar);
    if (w < 200) return;                      // ไม่มีที่ข้างการ์ด ไม่ลอยทับการ์ดตัวเอง
    const h = w / ar;
    const left = roomR >= roomL ? r.right + 12 : r.left - 12 - w;
    const top = Math.max(12, Math.min(innerHeight - h - 12, r.top + r.height / 2 - h / 2));
    let pic;
    if (it.blank) pic = blankNode(it);
    else {
      const k = keyOf(it);
      let entry = cache.get(it);
      if (!entry || entry.k !== k) {
        const doc = await getDoc(it.fi);
        if (my !== token || !doc) return;
        const c = await renderItem(doc, it, Math.round(w * Math.min(2, devicePixelRatio || 1)));
        if (my !== token) return;
        entry = { k, c };
        cache.delete(it);
        cache.set(it, entry);
        if (cache.size > 12) cache.delete(cache.keys().next().value);
      }
      pic = el("img", { src: entry.url || (entry.url = entry.c.toDataURL("image/jpeg", 0.88)), alt: "" });
    }
    if (my !== token) return;
    if (node) node.remove();
    node = el("div", { class: "pp-peek", "aria-hidden": "true",
      style: { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${Math.round(w)}px` } }, [pic]);
    document.body.appendChild(node);
    requestAnimationFrame(() => node && node.classList.add("on"));
  }
  /* ‼️ "ชี้ค้าง" = เมาส์นิ่งบนการ์ด 400 ms ไม่ใช่แค่เข้ามาในการ์ด
     รุ่นแรกนับจากตอนเข้าการ์ด คนที่กำลังคลิกเลือกหลายหน้าเจอภาพลอยเด้งบังทุกใบ (เห็นในภาพหลักฐาน 18/11/2026)
     และการ์ดที่เพิ่งคลิก ไม่ลอยจนกว่าเมาส์จะออกจากการ์ดนั้น คนคลิกคือกำลังทำงาน ไม่ได้อยากดู */
  let quiet = null;
  const arm = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const card = e.target.closest?.(".pg");
    if (!card || card.classList.contains("pp-ghost")) return;
    if (e.target.closest(".tools")) { hide(); return; }   // ชี้ที่ปุ่ม ไม่ต้องลอยบังเมนู
    if (card === shownFor || card === quiet) return;
    clearTimeout(timer);
    if (shownFor) hide();
    timer = setTimeout(() => show(card), 400);
  };
  const over = arm;
  const out = (e) => {
    const to = e.relatedTarget;
    if (to && shownFor && shownFor.contains(to) && !to.closest(".tools")) return;
    if (to && to.closest?.(".pg") && to.closest(".pg") === e.target.closest?.(".pg") && !to.closest(".tools")) return;
    hide();
  };
  grid.addEventListener("pointerover", over);
  grid.addEventListener("pointermove", arm);
  grid.addEventListener("pointerout", (e) => {
    const c = e.target.closest?.(".pg");
    if (c && c === quiet && !(e.relatedTarget && c.contains(e.relatedTarget))) quiet = null;
    out(e);
  });
  grid.addEventListener("pointerdown", (e) => { quiet = e.target.closest?.(".pg") || null; hide(); }, true);
  addEventListener("scroll", hide, true);
  addEventListener("keydown", hide, true);
  return hide;
}

/* ── ② ดูเต็มจอ ซูมได้ ─────────────────────────────────────────────── */
/** @param opts {list: item[], start: number, getDoc(fi), label(it, i, n) -> [title, sub]} */
/** edit (ไม่ใส่ = ดูอย่างเดียวแบบเดิม) { panel, layer, sync(it, W, H), onPage(it), onToggle(on), open }
 *  panel = แผงเครื่องมือแก้ไข , layer = ชั้นของที่วาง (วางซ้อนบนภาพ host จัดตำแหน่งเองใน sync)
 *  sync เรียกทุกครั้งที่ขนาดกระดาษบนจอเปลี่ยน ส่งขนาดเป็น px , open = เปิดมาพร้อมกางแผงแก้ไข
 *  key(e) คีย์ลัดตอนกำลังแก้ไข คืน true = ใช้แล้ว */
export function openViewer({ list, start, getDoc, label, onClose, edit }) {
  ensureStyle();
  const back = document.activeElement;
  let at = Math.max(0, Math.min(list.length - 1, start));
  let z = 1, fitZ = 1, tx = 0, ty = 0;     // z = สเกลจาก pt เป็น css px
  let pw = 0, ph = 0;                       // ขนาดหน้าที่เห็น (pt)
  let renderTimer = 0, renderToken = 0, renderedZ = 0;

  const title = el("div", { class: "pz-title", id: "pz-title" });
  const closeBtn = el("button", { class: "pz-btn pz-close", type: "button", "aria-label": tr("ปิด", "Close"),
    title: tr("ปิด (Esc)", "Close (Esc)"), onclick: () => close() }, [ico("close")]);
  const media = el("div", { class: "pz-media" });
  const paper = el("div", { class: "pz-paper" }, [media, edit ? edit.layer : null]);
  const busy = el("div", { class: "pz-busy", "aria-live": "polite" });
  const stage = el("div", { class: "pz-stage" }, [paper, busy]);
  const pct = el("span", { class: "pz-pct", "aria-live": "polite" });
  const b = (icon, text, tip, fn, cls = "") => el("button", { class: "pz-btn " + cls, type: "button",
    "aria-label": tip, title: tip, onclick: fn }, [icon ? ico(icon) : null, text || null]);
  const prevBtn = b("prev", "", tr("หน้าก่อนหน้า (←)", "Previous page (←)"), () => go(-1));
  const nextBtn = b("next", "", tr("หน้าถัดไป (→)", "Next page (→)"), () => go(1));
  const outBtn = b("minus", "", tr("ซูมออก (−)", "Zoom out (−)"), () => zoomBy(1 / 1.25));
  const inBtn = b("plus", "", tr("ซูมเข้า (+)", "Zoom in (+)"), () => zoomBy(1.25));
  /* ‼️ 18/11/2026 ค่ำ พี่ปอนด์: "พอดีจอ กับ 100% ยุบเหลือสักอันนึงพอ" ปุ่มเดียวสลับ
     อยู่พอดีจอ = ปุ่มพาไป 100% , ซูมอยู่ระดับอื่น = ปุ่มพากลับพอดีจอ ป้ายบอกสิ่งที่จะเกิดเมื่อกด */
  const toggleBtn = b(null, "100%", "", () => (isFit() ? zoomTo(PT2CSS) : fit()), "pz-wide pz-toggle");
  /* พี่ปอนด์: "ควรมีบอกไว้สักที่ไหมว่าที่เปิดอยู่มันคือหน้าไหน" เลขหน้าอยู่ระหว่างปุ่มก่อนหน้ากับถัดไป */
  const pageNo = el("span", { class: "pz-pgno", "aria-live": "polite" });
  const bar = el("div", { class: "pz-bar", role: "toolbar", "aria-label": tr("ซูมและเปลี่ยนหน้า", "Zoom and pages") }, [
    prevBtn, pageNo, nextBtn, el("span", { class: "pz-sep" }), outBtn, pct, inBtn, el("span", { class: "pz-sep pz-wide" }), toggleBtn,
  ]);
  /* ‼️ 19/11/2026 พี่ปอนด์: "ไม่อยากให้เราลิงก์ไปเครื่องมืออื่นเลย อยากทำให้มันแก้ไขได้ตั้งแต่หน้านี้เลย"
     ปุ่มนี้กางแผงเครื่องมือแก้ไข (ปิดทับ ข้อความ ไฮไลต์ ลายเซ็น รูป) ข้างภาพ กดอีกทีพับ กลับไปลากเลื่อนดูได้ */
  const editBtn = edit ? el("button", { class: "pz-btn pz-editbtn", type: "button", "aria-pressed": "false",
    title: tr("แก้ไขบนหน้า ปิดทับ ข้อความ ไฮไลต์ ลายเซ็น รูป", "Edit on the page: cover, text, highlight, signature, image"),
    onclick: () => setEditing(!editing) }, tr("แก้ไขบนหน้า", "Edit on page")) : null;
  const main = el("div", { class: "pz-main" }, [stage, edit ? edit.panel : null]);
  if (edit) edit.panel.classList.add("pz-edit");
  const wrap = el("div", { class: "pz", role: "dialog", "aria-modal": "true", "aria-labelledby": "pz-title" }, [
    el("div", { class: "pz-top" }, [title, editBtn, closeBtn]), main, bar,
  ]);
  let editing = false;
  function setEditing(on) {
    if (!edit) return;
    editing = !!on;
    wrap.classList.toggle("editing", editing);
    editBtn.setAttribute("aria-pressed", String(editing));
    edit.onToggle?.(editing);
    // แผงกางหรือพับ เวทีเปลี่ยนขนาด ต้องคิดพอดีจอใหม่
    requestAnimationFrame(() => { if (wrap.isConnected) { if (isFit()) fit(); else apply(); } });
  }

  const stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  const minZ = () => Math.min(fitZ, PT2CSS * 0.25);
  const isFit = () => Math.abs(z - fitZ) < 1e-6;
  function clampPan() {
    const { w, h } = stageSize();
    const cw = pw * z, ch = ph * z;
    // เล็กกว่าจอ = จัดกลาง ใหญ่กว่าจอ = เลื่อนได้แต่ห้ามหลุดขอบ
    tx = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, tx));
    ty = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, ty));
    stage.classList.toggle("can-pan", cw > w + 1 || ch > h + 1);
  }
  function apply() {
    clampPan();
    paper.style.width = `${pw * z}px`;
    paper.style.height = `${ph * z}px`;
    paper.style.transform = `translate(${tx}px,${ty}px)`;
    if (edit && list[at]) edit.sync(list[at], pw * z, ph * z);
    pct.textContent = `${Math.round((z / PT2CSS) * 100)}%`;
    outBtn.disabled = z <= minZ() + 1e-6;
    inBtn.disabled = z >= PT2CSS * MAX_ZOOM - 1e-6;
    wrap.dataset.zoom = String(Math.round((z / PT2CSS) * 100));
    const toReal = isFit();
    toggleBtn.textContent = toReal ? "100%" : tr("พอดีจอ", "Fit");
    toggleBtn.title = toReal ? tr("ขนาดจริง 100%", "Actual size 100%") : tr("พอดีจอ (0)", "Fit to screen (0)");
    toggleBtn.setAttribute("aria-label", toggleBtn.title);
    scheduleRender();
  }
  function zoomTo(nz, cx, cy) {
    nz = Math.max(minZ(), Math.min(PT2CSS * MAX_ZOOM, nz));
    const { w, h } = stageSize();
    if (cx == null) { cx = w / 2; cy = h / 2; }
    // จุดใต้เมาส์ต้องอยู่ที่เดิมหลังซูม
    const px = (cx - tx) / z, py = (cy - ty) / z;
    z = nz;
    tx = cx - px * z;
    ty = cy - py * z;
    apply();
  }
  const zoomBy = (k, cx, cy) => zoomTo(z * k, cx, cy);
  function fit() {
    if (!pw || !ph) return;                 // ยังวาดหน้าแรกไม่เสร็จ (เปิดตัวดูแล้วย่อขยายหน้าต่างทันที)
    const { w, h } = stageSize();
    fitZ = Math.min((w - 32) / pw, (h - 24) / ph);
    z = fitZ;
    apply();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderSharp, 140);
  }
  async function renderSharp() {
    try { await renderSharpInner(); } catch { busy.textContent = ""; }
  }
  async function renderSharpInner() {
    const it = list[at];
    if (!it || it.blank) return;
    const dpr = Math.min(3, devicePixelRatio || 1);
    const want = pw * z * dpr;
    if (renderedZ && Math.abs(renderedZ - want) / want < 0.04) return;   // คมพอแล้ว ไม่วาดซ้ำ
    const my = ++renderToken;
    /* ‼️ ไม่ขึ้นข้อความ "กำลังทำให้คม" แล้ว พี่ปอนด์: "ไม่ต้องเขียนขึ้นบอกก็ได้" ภาพคมขึ้นเองในเสี้ยววินาที */
    try {
      const doc = await getDoc(it.fi);
      if (my !== renderToken || !doc) return;
      const c = await renderItem(doc, it, Math.round(want));
      if (my !== renderToken) { c.width = c.height = 0; return; }
      const old = media.querySelector("canvas");
      media.replaceChildren(c);
      if (old) old.width = old.height = 0;
      renderedZ = want;
      paper.dataset.px = String(c.width);       // เทสอ่านความละเอียดจริงจากตรงนี้
    } finally {
      if (my === renderToken) busy.textContent = "";
    }
  }

  /* ‼️ 18/11/2026 ค่ำ พี่ปอนด์: "ตอนเปลี่ยนหน้ามันเห็นกระดาษลาง ๆ ก่อน"
     รุ่นแรกโชว์ภาพย่อ (ความละเอียด 0.35) ขยายเต็มจอก่อน แล้วค่อยเปลี่ยนเป็นภาพคม ตาเห็นเบลอแวบหนึ่งทุกครั้ง
     ตอนนี้วาดภาพคมของหน้าใหม่ให้เสร็จก่อน ระหว่างนั้นหน้าเดิมค้างอยู่ แล้วสลับทีเดียว
     ภาพย่อใช้เฉพาะตอนวาดไม่สำเร็จ (ไฟล์อ่านไม่ได้) จะได้ไม่เห็นจอว่าง */
  function show(pre) {
    const it = list[at];
    const s = it.blank ? { w: it.pw, h: it.ph } : shownSize(it);
    pw = s.w; ph = s.h;
    renderToken++;
    const [t, sub] = label(it, at, list.length);
    title.replaceChildren(...[t, sub ? el("small", {}, sub) : null].filter(Boolean));
    const old = media.querySelector("canvas");
    media.replaceChildren(it.blank ? blankNode(it) : pre || el("img", { src: it.thumb, alt: t }));
    edit?.onPage?.(it);
    if (old && old !== pre) old.width = old.height = 0;
    renderedZ = pre ? pre.width : 0;
    if (pre) paper.dataset.px = String(pre.width);
    pageNo.textContent = `${at + 1} / ${list.length}`;
    prevBtn.disabled = at === 0;
    nextBtn.disabled = at === list.length - 1;
    fit();
  }
  let goToken = 0, target = null;
  async function goTo(n) {
    if (n < 0 || n >= list.length) return;
    const my = ++goToken;
    target = n;
    const it = list[n];
    let pre = null;
    if (!it.blank) {
      try {
        const s = shownSize(it);
        const { w, h } = stageSize();
        const fz = Math.min((w - 32) / s.w, (h - 24) / s.h);
        const doc = await getDoc(it.fi);
        if (doc && my === goToken) pre = await renderItem(doc, it, Math.round(s.w * fz * Math.min(3, devicePixelRatio || 1)));
      } catch { pre = null; }
      if (my !== goToken) { if (pre) pre.width = pre.height = 0; return; }
    }
    target = null;
    at = n;
    show(pre);
  }
  // กดรัว ๆ ต้องนับต่อจากหน้าที่กำลังจะไป ไม่ใช่หน้าที่ยังโชว์อยู่
  const go = (d) => goTo((target ?? at) + d);

  /* ── ล้อเมาส์: ล้อหรือบีบทัชแพด = ซูม , ปัดสองนิ้วบนทัชแพดตอนซูมอยู่ = เลื่อน ─────────── */
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0.5 && z > fitZ + 1e-6;
    if (trackpadPan) { tx -= e.deltaX; ty -= e.deltaY; apply(); return; }
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), cx, cy);
  }, { passive: false });

  /* ── นิ้วกับเมาส์: ลากเลื่อน , สองนิ้วบีบซูม , ปัดซ้ายขวาตอนพอดีจอ = เปลี่ยนหน้า ─────────── */
  const pts = new Map();
  let startPinch = null, pan = null, swipe = null, lastTap = 0;
  /* ‼️ กำลังแก้ไข แตะหรือลากบนชั้นของที่วาง = วางของ ไม่ใช่เลื่อนหรือปัดเปลี่ยนหน้า
     ถ้าเวทีจับนิ้วไว้ด้วย (setPointerCapture) การลากคลุมปิดทับจะไปเป็นการเลื่อนภาพแทน */
  const onInk = (e) => editing && !!e.target.closest?.(".pe-layer");
  stage.addEventListener("pointerdown", (e) => {
    if (onInk(e)) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, c] = [...pts.values()];
      startPinch = { d: Math.hypot(a.x - c.x, a.y - c.y), z };
      pan = null; swipe = null;
    } else if (pts.size === 1) {
      pan = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      swipe = z <= fitZ + 1e-6 ? { x: e.clientX, y: e.clientY } : null;
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (startPinch && pts.size >= 2) {
      const [a, c] = [...pts.values()];
      const r = stage.getBoundingClientRect();
      zoomTo(startPinch.z * (Math.hypot(a.x - c.x, a.y - c.y) / startPinch.d), (a.x + c.x) / 2 - r.left, (a.y + c.y) / 2 - r.top);
      return;
    }
    if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
      if (!swipe) { tx = pan.tx + dx; ty = pan.ty + dy; stage.classList.add("panning"); apply(); }
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    stage.classList.remove("panning");
    if (pts.size < 2) startPinch = null;
    if (swipe && pts.size === 0) {
      const dx = e.clientX - swipe.x;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) go(dx < 0 ? 1 : -1);
    }
    // แตะสองครั้งบนจอสัมผัส = ซูม (dblclick ของเมาส์จัดการแยกข้างล่าง)
    if (e.pointerType !== "mouse" && pan && !pan.moved && pts.size === 0) {
      const now = performance.now();
      if (now - lastTap < 300) { toggleZoom(e); lastTap = 0; } else lastTap = now;
    }
    if (pts.size === 0) { pan = null; swipe = null; }
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  function toggleZoom(e) {
    const r = stage.getBoundingClientRect();
    const target = z > fitZ * 1.05 ? fitZ : Math.max(fitZ * 2, PT2CSS);
    if (target === fitZ) fit(); else zoomTo(target, e.clientX - r.left, e.clientY - r.top);
  }
  stage.addEventListener("dblclick", (e) => { if (onInk(e)) return; e.preventDefault(); toggleZoom(e); });

  function onKey(e) {
    /* ‼️ ช่องพิมพ์ ปุ่มในแผงแก้ไข และของที่วาง (ลูกศรขยับ Delete เอาออก) ต้องได้คีย์ของตัวเอง
       จึงไม่ดักที่นี่ ปล่อยไปถึงตัวมัน แล้วตัวดูหยุดไว้ตอนไหลกลับขึ้นมา (ตัวฟังที่ wrap ข้างล่าง)
       คีย์ลัดของเครื่องมือข้างหลังจึงยังไม่เห็นอะไรเลย Esc กับ Tab ยังเป็นของตัวดูเสมอ */
    const t = e.target;
    // คีย์ลัดของโหมดแก้ไข (Ctrl+Z ย้อนของที่วาง) ยกเว้นในช่องพิมพ์ ที่ต้องย้อนตัวอักษรของมันเอง
    if (editing && edit.key && !t.closest?.("input, textarea, select") && edit.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== "Escape" && e.key !== "Tab" && wrap.contains(t) && t.closest?.(".pz-edit, .pe-layer")) return;
    // ‼️ กันคีย์ลัดของเครื่องมือข้างหลัง (Del ลบหน้า) ทำงานขณะดูอยู่
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.25); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.25); }
    else if (e.key === "0") { e.preventDefault(); fit(); }
    else if (e.key === "Tab") {             // วนโฟกัสอยู่ในตัวดู
      const f = [...wrap.querySelectorAll("button:not(:disabled), input:not([type=file]), select, [tabindex='0']")]
        .filter((n) => n.offsetParent || n === document.activeElement);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  /* ‼️ ฟังที่ window ชั้น capture ไม่ใช่ที่ตัวดู ดับเบิลคลิกหรือลากบนภาพ โฟกัสตกไปที่ body
     คีย์ลูกศรกับ Esc จะไม่วิ่งผ่านตัวดูเลย (เจอในเทส 18/11/2026) และกันคีย์ลัดของเครื่องมือข้างหลังได้ทั้งหมด */
  addEventListener("keydown", onKey, true);
  wrap.addEventListener("keydown", (e) => e.stopPropagation());   // คีย์ที่ปล่อยให้แผงแก้ไขใช้ ห้ามไหลต่อไปถึงคีย์ลัดของหน้า
  const onResize = () => { const keep = z === fitZ; if (keep) fit(); else apply(); };
  addEventListener("resize", onResize);

  function close() {
    clearTimeout(renderTimer);
    renderToken++;
    removeEventListener("resize", onResize);
    removeEventListener("keydown", onKey, true);
    paper.querySelectorAll("canvas").forEach((c) => { c.width = c.height = 0; });
    wrap.remove();
    document.documentElement.style.overflow = prevOverflow;
    if (back && back.isConnected) back.focus();
    onClose?.();
  }
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.appendChild(wrap);
  // เปิดครั้งแรกก็วาดภาพคมก่อนโชว์ ไม่โชว์ภาพย่อเบลอ (ต้องอยู่หลัง appendChild เพราะต้องรู้ขนาดเวที)
  goTo(at);
  closeBtn.focus();
  if (edit?.open) setEditing(true);
  return { close, setEditing };
}
