// ─────────────────────────────────────────────────────────────────────────────
// โครง "แผงลอย" สำหรับเครื่องมือที่มีพรีวิว — แบบเดียวกับโปรแกรมตัดต่อ/ออกแบบ
//   แผงซ้าย   = รายการของ (ไฟล์ / หน้า / ลายเซ็นที่เก็บไว้)
//   ตรงกลาง   = ผืนงาน แสดงพรีวิวจริง + แถบเครื่องมือลอย
//   แผงขวา    = ตัวเลือกทั้งหมดของงานนี้
//   แถบล่าง   = สถานะ + ปุ่มลงมือ
// บนจอแคบทั้งสามแผงจะเรียงลงมาเป็นชั้น ๆ แทน (ไม่ซ่อนอะไรทิ้ง)
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { toolShell } from "./ui.js";
import { toolIcon, uiIcon } from "./icons.js";
import { configSearch, CFGSEARCH_CSS } from "./cfgsearch.js";
import { tr } from "./i18n.js";

/* ── หัวกลุ่มในแผงตั้งค่า พับได้ (แบบแผง Format ของ Power BI) ─────────────
   ‼️ แผงของเรามีสองโครง ต้องรองรับทั้งคู่ (ไล่ดูของจริงครบ 51 เครื่องมือ 19/09/2026)
      ① หัวข้ออยู่ในกล่องของตัวเอง  <div><h3>สี</h3> ช่อง ช่อง </div>
      ② หัวข้อเรียงแบนปนกับช่อง     <div><h3>สี</h3> ช่อง ช่อง <h3>ขนาด</h3> ช่อง </div>
      แบบ ② มีมากกว่า (9 ใน 16 เครื่องมือที่มีหัวข้อหลายอัน) รอบแรกรองรับแต่แบบ ①
      จึงพับได้จริงแค่ 2 เครื่องมือ ทั้งที่อีก 14 ตัวก็มีของเยอะพอ ๆ กัน
   ‼️ ห้ามห่อของเข้ากล่องใหม่ เพราะหลายแผงเป็น flex ที่จับช่องมาวางคู่กันเป็นแถว
      ห่อแล้วทั้งกลุ่มจะยุบเป็นก้อนเดียวแล้วแถวพัง จึงใช้วิธีซ่อน "พี่น้องที่ตามหลังหัวข้อ"
      จนถึงหัวข้อถัดไปแทน โครงเดิมไม่ถูกแตะเลยสักจุด */

/** ซ่อนโดยจำสภาพเดิมไว้ ‼️ ไม่งั้นตอนกางจะไปเปิดช่องที่เครื่องมือตั้งใจซ่อนไว้เอง */
const hideKeep = (n, flag) => { if (!n.hidden) { n.dataset[flag] = "1"; n.hidden = true; } };
const showBack = (n, flag) => { if (n.dataset[flag]) { delete n.dataset[flag]; n.hidden = false; } };

/** ของในกลุ่ม = พี่น้องที่ตามหลังปุ่มหัวข้อ จนกว่าจะเจอหัวข้อถัดไป
 *  ‼️ คิดสด ๆ ทุกครั้งที่ใช้ ไม่เก็บรายชื่อไว้ เพราะเครื่องมือเติมช่องเข้ากลุ่มทีหลังได้ */
function membersOf(btn) {
  const out = [];
  for (let n = btn.nextElementSibling; n; n = n.nextElementSibling) {
    if (n.tagName === "H3" || n.classList.contains("ws-fold-btn")) break;
    out.push(n);
  }
  return out;
}

function collapsibleGroups(panel, toolId) {
  const KEY = `filekit-folded-${toolId}`;
  let folded = new Set();
  try { folded = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* โหมดส่วนตัว */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify([...folded])); } catch { /* ไม่เก็บก็ไม่เป็นไร */ }
  };

  const heads = [...panel.querySelectorAll("h3")].filter((h) => !h.closest(".ws-fold-btn"));
  const already = panel.querySelectorAll(".ws-fold-btn").length;
  // ‼️ นับรวมกลุ่มที่จัดไปแล้ว ไม่งั้นรอบที่สองที่เจอหัวข้อใหม่อันเดียวจะถูกตัดทิ้ง
  if (heads.length + already < 2) return;   // มีกลุ่มเดียวไม่ต้องพับ พับแล้วไม่ได้อะไรคืน

  heads.forEach((h, i) => {
    const id = (h.textContent || "").trim().slice(0, 40) || `g${i}`;
    const caret = el("span", { class: "ws-fold-caret", "aria-hidden": "true" }, [uiIcon("chev", "ws-fold-svg")]);
    /* ‼️ จุดบอกว่ากลุ่มนี้มีค่าที่ถูกแก้ ไม่งั้นพับแล้วลืมว่าตั้งอะไรไว้
       เทียบกับค่า ณ ตอนเปิดหน้า ไม่ใช่ค่า default ของ HTML เพราะบางเครื่องมือ
       กู้ค่าที่จำไว้มาใส่ตั้งแต่แรก ซึ่งนับว่าเป็นค่าตั้งต้นของรอบนี้ */
    const dot = el("span", { class: "ws-fold-dot", hidden: true,
      title: tr("กลุ่มนี้มีค่าที่ถูกแก้ไว้", "Something in here was changed") });
    /* ลูกศรอยู่ซ้ายหน้าหัวข้อ ตามแผง Format ของ Power BI — ตานิ่งอยู่ที่ขอบเดียว
       ไล่ดูได้จากคอลัมน์เดียวว่าอันไหนพับอันไหนกาง ไม่ต้องกวาดไปหาปลายบรรทัด */
    const btn = el("button", { class: "ws-fold-btn", type: "button", "aria-expanded": "true" });
    h.replaceWith(btn);
    btn.append(caret, h, dot);

    const fields = () => membersOf(btn).flatMap((n) => [...n.querySelectorAll("input, select, textarea")]);
    const snap = new Map(fields().map((f) => [f, f.type === "checkbox" || f.type === "radio" ? f.checked : f.value]));
    const refreshDot = () => {
      dot.hidden = !fields().some((f) => {
        if (!snap.has(f)) return true;                       // ช่องที่เพิ่งโผล่มา ถือว่าเปลี่ยน
        return snap.get(f) !== (f.type === "checkbox" || f.type === "radio" ? f.checked : f.value);
      });
    };

    const apply = (on) => {
      const mem = membersOf(btn);
      if (on) mem.forEach((n) => hideKeep(n, "wsFold"));
      else mem.forEach((n) => showBack(n, "wsFold"));
      btn.classList.toggle("folded", on);
      btn.setAttribute("aria-expanded", String(!on));
      if (on) refreshDot(); else dot.hidden = true;
    };
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("folded");
      if (on) folded.add(id); else folded.delete(id);
      save();
      apply(on);
    });
    if (folded.has(id)) apply(true);
    btn.wsRefreshDot = refreshDot;
  });

  /* ‼️ ตัวฟังค่าเปลี่ยนต้องมีคู่เดียวต่อแผง ไม่ใช่คู่หนึ่งต่อหนึ่งหัวข้อ
     ตัวสแกนถูกเรียกซ้ำทุกครั้งที่แผงมีของเพิ่ม เครื่องมือที่สร้างแผงใหม่ทั้งก้อน
     (เช่นตอนสลับชุดข้อมูล) จะทำให้ตัวฟังพอกขึ้นเรื่อย ๆ โดยชี้ไปที่ปุ่มที่หลุดจากหน้าไปแล้ว
     ตัวเดียวต่อแผงแล้วไล่หาปุ่มที่ยังอยู่จริงตอนนั้น จึงไม่มีอะไรค้าง
     (อัปเดตจุดแม้กำลังพับอยู่ เพราะผู้ใช้อาจแก้ค่าจากที่อื่น เช่นชุดพร้อมใช้) */
  if (!panel.dataset.wsFoldBound) {
    panel.dataset.wsFoldBound = "1";
    for (const ev of ["change", "input"]) {
      panel.addEventListener(ev, () => {
        for (const b of panel.querySelectorAll(".ws-fold-btn.folded")) b.wsRefreshDot?.();
      });
    }
  }

  /* ‼️ หัวข้อแรกของแผงไม่ต้องมีเส้นคั่นด้านบน แต่ "อันแรก" อาจเปลี่ยนตัวได้
     ถ้าเครื่องมือแทรกกลุ่มใหม่ไว้ข้างบนทีหลัง จึงคิดใหม่ทุกรอบจากตำแหน่งจริง */
  const all = [...panel.querySelectorAll(".ws-fold-btn")];
  all.forEach((b, i) => b.classList.toggle("ws-fold-first", i === 0));

  attachSearch(panel);
  panel.wsSearch?.reindex();
}

/**
 * ต่อช่องค้นหาการตั้งค่าให้แผงที่ของเยอะ
 *
 * ‼️ ใช้ configSearch ตัวเดิมที่ทำไว้แล้ว ไม่เขียนใหม่ ของเดิมมีของที่คิดมาแล้วครบกว่า
 *    ตัดวรรณยุกต์ก่อนเทียบ, เผื่อลืมสลับแป้นพิมพ์, ไฮไลต์คำที่ตรง, บอกจำนวนที่พบ
 *    (ตอนแรกฟ้าเขียนช่องค้นหาใหม่เองจนได้ช่องค้นหาซ้อนกันสองอันในแผงเดียว
 *     เห็นตอนเปิดรูปดูด้วยตา ไม่ใช่ตอนรันเทส เพราะเทสไม่ได้ถามว่า "มีกี่อัน")
 * ‼️ ใส่เฉพาะแผงที่ของเยอะจริง แผงที่มีสามช่องไม่ต้องมี กวาดตาทีเดียวก็เห็นหมด
 */
const FIND_MIN_FIELDS = 12;
function attachSearch(panel) {
  if (panel.querySelector(".cfs-wrap")) return;                      // เครื่องมือต่อเองไว้แล้ว
  if (panel.querySelectorAll("input, select, textarea").length < FIND_MIN_FIELDS) return;

  /* ของในกลุ่มที่เอาไปเทียบคำค้น ถ้าก้อนไหนมีหลายช่องข้างในให้ลงไปทีละช่อง
     ก้อนที่ไม่มีช่องเลย (คำอธิบาย/แถวปุ่ม) นับเป็นหน่วยเดียว จะได้ถูกซ่อนไปพร้อมกลุ่ม */
  const SUB = ".dm-field, .field";
  const fieldsOf = (btn) => membersOf(btn).flatMap((m) => {
    if (m.matches?.(SUB)) return [m];
    const inner = [...m.querySelectorAll(SUB)];
    return inner.length ? inner : [m];
  });

  /* ‼️ ตอนเริ่มค้นต้องกางกลุ่มที่พับไว้ก่อน ไม่งั้นของในกลุ่มที่พับจะถูกนับว่า
     "เครื่องมือซ่อนไว้เอง" แล้วค้นไม่เจอ พอล้างคำค้นก็พับกลับให้เหมือนเดิม
     เพราะการกางค้างไว้ไม่ใช่เจตนาของผู้ใช้ เขาแค่มาค้นของ */
  let openedForSearch = null;
  const beforeRun = (q) => {
    const btns = [...panel.querySelectorAll(".ws-fold-btn")];
    if (q && !openedForSearch) {
      openedForSearch = btns.filter((x) => x.classList.contains("folded"));
      openedForSearch.forEach((x) => x.click());
    } else if (!q && openedForSearch) {
      openedForSearch.forEach((x) => { if (!x.classList.contains("folded")) x.click(); });
      openedForSearch = null;
    }
  };

  /* ‼️ เครื่องมือที่ต่อช่องค้นหาเองจะแปะ CSS มาพร้อมแผงของตัวเอง แต่ตัวที่เราต่อให้
     ไม่มีใครแปะให้ ต้องแปะเองครั้งเดียวต่อหนึ่งหน้า ไม่งั้นได้ช่องค้นหาที่ไม่มีหน้าตา */
  if (!document.getElementById("cfs-css")) {
    document.head.append(el("style", { id: "cfs-css" }, CFGSEARCH_CSS));
  }
  const cs = configSearch({
    scope: panel, groupSel: ".ws-fold-btn", fieldsOf, beforeRun,
    groupText: (btn) => btn.querySelector("h3")?.textContent || "",
  });
  panel.prepend(cs.node);
  panel.wsSearch = cs;      // ให้รอบสแกนถัดไปสั่งอ่านโครงใหม่ได้
}

/**
 * @param tool  รายการจากทะเบียนเครื่องมือ
 * @param cfg   {
 *   left:    { title, node, hint }            // ไม่ใส่ = ไม่มีแผงซ้าย
 *   center:  { title, node, empty }           // empty = สิ่งที่แสดงตอนยังไม่มีไฟล์
 *   right:   { title, node }                  // ไม่ใส่ = ไม่มีแผงขวา
 *   toolbar: [node]                           // แถบลอยเหนือผืนงาน
 *   footer:  [node]                           // แถบล่าง (ปุ่มหลัก/สถานะ)
 *   note:    string
 * }
 * คืน { wrap, body, setBusy, showCanvas }
 */
export function workspace(tool, cfg = {}) {
  const { wrap, body } = toolShell(tool);
  body.classList.add("ws-body");
  body.id = "ws-top";        // จุดหมายของลิงก์ "พื้นที่ทำงาน" ในรางซ้าย

  /* ── ปุ่มย้ายแผงตั้งค่าขึ้นไปเป็นริบบอนด้านบน (20/09/2026) ────────────────
   * ‼️ พี่ปอนด์ขอริบบอนแบบ Power BI สำหรับ "การตั้งค่า" ของแต่ละเครื่องมือ
   *   วัดแล้วได้พื้นที่เอกสารคืนมา 11% บนเครื่องมือ PDF (แผงขวากิน 340px)
   *   และคืนได้มากกว่านั้นมากบนเครื่องมือที่เนื้อหาตรงกลางเป็นตารางหรือกราฟ
   *
   * ‼️ ทำเป็นโหมดที่สลับได้ ไม่ใช่บังคับ เพราะแผงแนวตั้งดีกว่าเมื่อค่าตั้งเยอะ
   *   และจำไว้รายเครื่องมือ เพราะเครื่องมือที่มี 3 ช่องกับ 25 ช่องต้องการคนละแบบ
   * ‼️ จอแคบกลับไปเป็นแนวตั้งเสมอ ริบบอนแนวนอนบนจอ 390px ใช้ไม่ได้จริง (กติกาอยู่ใน CSS) */
  const RIB_KEY = `filekit-cfg-ribbon-${tool.id}`;
  /* ‼️ ค่าเริ่มต้นต้องวัดของจริง ไม่ใช่เดาจากจำนวนช่อง (บทเรียน 20/09/2026)
     รอบแรกฟ้าใช้ "จำนวนช่องไม่เกิน 12" เป็นเกณฑ์ ซึ่งเดาผิดกับ pdf-sign ทันที
     มันมีแค่ 2 ช่อง แต่มีแผ่นวาดลายเซ็นใหญ่ ริบบอนจึงสูง 353px
     ‼️ ต้นทุนจริงของริบบอนคือ "ความสูงที่มันกิน" ไม่ใช่ "จำนวนช่องที่มันมี" จึงต้องวัดอันนั้นตรง ๆ
     ความสูงคือของหายากในหน้าเครื่องมือเอกสาร ส่วนความกว้างคือของที่เหลือเฟือ
     ‼️ ถ้าผู้ใช้เคยเลือกเองแล้ว ความตั้งใจของผู้ใช้ชนะค่าเริ่มต้นเสมอ */
  const RIB_MAX_H = 220;
  let userChose = null;
  try { const v = localStorage.getItem(RIB_KEY); if (v !== null) userChose = v === "1"; } catch { /* โหมดส่วนตัว */ }
  let asRibbon = userChose !== null ? userChose : !!cfg.right;

  const ribBtn = el("button", { type: "button", class: "ws-ribbtn" },
    [uiIcon("rows", "ico-svg")]);

  /* ── พับแผงข้างเก็บเป็นแถบไอคอน (พี่ปอนด์ขอ 20/09/2026 ตามผังของ Power BI) ────
   * Power BI ไม่ได้ให้เลือกระหว่าง "มีแผง" กับ "ไม่มีแผง" แต่พับแผงเป็นแถบบาง ๆ
   * ที่ยังอยู่ในสายตาและกดกลับมาได้ทันที ต่างจากการซ่อนหายไปเลยซึ่งผู้ใช้จะหาไม่เจอ
   * ‼️ แถบที่พับแล้วต้องมีชื่อแผงในแนวตั้ง ไม่ใช่ไอคอนเปล่า เพราะงานวิจัยของเราเอง
   *   ระบุว่า "หาไม่เจอ" คือสาเหตุ 45% ของงานที่ทำไม่สำเร็จ ไอคอนเปล่าแปลว่าต้องเดา
   * ‼️ จำรายเครื่องมือ เพราะแต่ละเครื่องมือใช้แผงซ้ายและขวาไม่เหมือนกันเลย
   * ‼️ ปุ่มพับกับแถบไอคอนคือปุ่มคนละตัวที่สลับกันโผล่ จึงต้องย้ายโฟกัสตามไปด้วย
   *   ไม่งั้นคนที่ใช้คีย์บอร์ดกดพับแล้วโฟกัสหายไปอยู่ต้นเอกสาร */
  const PANE_KEY = (side) => `filekit-pane-${side}-${tool.id}`;
  const folded = { left: false, right: false };
  const foldBtn = {}, rail = {};
  for (const side of ["left", "right"]) {
    if (!cfg[side]) continue;
    try { folded[side] = localStorage.getItem(PANE_KEY(side)) === "1"; } catch { /* โหมดส่วนตัว */ }
    foldBtn[side] = el("button", { type: "button", class: "ws-panefold" }, [uiIcon("chev", "ico-svg")]);
    rail[side] = el("button", { type: "button", class: `ws-rail ws-rail-${side}` }, [
      uiIcon(side === "left" ? "stack" : "sliders", "ws-rail-ico"),
      el("span", { class: "ws-rail-txt" }, cfg[side].title),
    ]);
    const flip = () => {
      folded[side] = !folded[side];
      try { localStorage.setItem(PANE_KEY(side), folded[side] ? "1" : "0"); } catch { /* ไม่เป็นไร */ }
      applyPanes();
      (folded[side] ? rail[side] : foldBtn[side]).focus();
    };
    foldBtn[side].addEventListener("click", flip);
    rail[side].addEventListener("click", flip);
  }
  /* ‼️ แผงขวาที่ถูกย้ายขึ้นไปเป็นริบบอนแล้ว ห้ามพับซ้อนอีกชั้น
     ไม่งั้นจะได้ทั้งริบบอนข้างบนและแถบไอคอนด้านขวาพร้อมกัน ซึ่งคือของชิ้นเดียวกันสองที่ */
  function applyPanes() {
    for (const side of ["left", "right"]) {
      if (!cfg[side]) continue;
      /* ‼️ ตรงนี้เคยมีโค้ด "ล้างสถานะพับทิ้งเมื่ออยู่โหมดริบบอน" แล้วถอดออก (20/09/2026)
         เหตุผลที่ใส่ไป กลัวว่าพอกดย้ายการตั้งค่ากลับไปด้านขวา แผงจะยุบเป็นแถบทันที
         เหตุผลที่ถอด สภาพนั้นเกิดผ่านหน้าจอจริงไม่ได้ เพราะปุ่มริบบอนอยู่ในแผง
         พอพับแผง ปุ่มก็หายไปด้วย จึงไม่มีทางกดเปิดริบบอนตอนที่พับค้างอยู่
         แต่โค้ดที่ใส่ไปกลับพังของที่เกิดจริง คือค่าเริ่มต้นของหลายเครื่องมือเดาเป็นริบบอนก่อน
         แล้วค่อยถอยเป็นแผงข้างหลังวัดความสูงเสร็จ จังหวะที่เดายังเป็นริบบอนอยู่
         มันไปล้างสถานะพับที่ผู้ใช้ตั้งไว้ทิ้ง = เปิดหน้าใหม่แล้วแผงกางเองทุกครั้ง
         ‼️ บทเรียน กันสภาพที่เกิดไม่ได้ ด้วยโค้ดที่ทำงานในสภาพที่เกิดจริง = ขาดทุน
         การกดทับ (`&& !asRibbon` ข้างล่าง) พอแล้ว เพราะมันไม่แตะค่าที่เก็บไว้เลย */
      const on = folded[side] && !(side === "right" && asRibbon);
      grid.classList.toggle(`fold-${side}`, on);
      const t = cfg[side].title;
      const lbl = on ? tr(`เปิดแผง ${t}`, `Show ${t}`) : tr(`พับแผง ${t} เก็บ`, `Collapse ${t}`);
      for (const b of [foldBtn[side], rail[side]]) {
        b.setAttribute("aria-expanded", String(!on));
        b.setAttribute("aria-label", lbl);
        b.title = lbl;
      }
    }
  }

  const panel = (side, spec) => spec ? el("aside", { class: `ws-panel ws-${side}` }, [
    el("div", { class: "ws-head" }, [
      el("h2", {}, spec.title),
      spec.aside || null,
      el("div", { class: "ws-head-act" }, [
        side === "right" ? ribBtn : null,
        foldBtn[side],
      ]),
    ]),
    spec.hint ? el("p", { class: "ws-hint" }, spec.hint) : null,
    el("div", { class: "ws-scroll" }, [spec.node]),
  ]) : null;

  const emptyBox = el("div", { class: "ws-empty" }, [
    el("div", { class: "ws-empty-ico", "aria-hidden": "true" }, [toolIcon(tool, "ws-empty-svg")]),
    el("div", {}, (cfg.center && cfg.center.empty) || tr("ยังไม่มีไฟล์ เลือกไฟล์ก่อนเพื่อดูตัวอย่าง", "No file yet. Choose a file first to see a preview")),
  ]);

  const canvas = el("div", { class: "ws-canvas" }, [
    cfg.toolbar && cfg.toolbar.length ? el("div", { class: "ws-toolbar" }, cfg.toolbar) : null,
    el("div", { class: "ws-stage-in" }, [emptyBox, cfg.center ? cfg.center.node : null]),
  ]);

  /* ‼️ แถบไอคอนวางไว้ติดกับแผงที่มันแทน แล้วให้ CSS โชว์ทีละอัน
     จึงได้อยู่ในช่องกริดเดียวกันเสมอ ไม่ต้องคำนวณตำแหน่งเอง */
  const grid = el("div", { class: "ws-grid" }, [
    panel("left", cfg.left),
    rail.left || null,
    el("section", { class: "ws-center" }, [canvas]),
    panel("right", cfg.right),
    rail.right || null,
  ]);
  if (!cfg.left) grid.classList.add("no-left");
  if (!cfg.right) grid.classList.add("no-right");

  /* ‼️ ย้ายด้วยการสลับที่ใน DOM จริง ไม่ใช่ซ่อนอันหนึ่งสร้างอีกอัน
     เพราะเครื่องมือถือ reference ของ node ในแผงไว้ ถ้าสร้างใหม่ค่าที่ผู้ใช้ตั้งไว้จะหายหมด
     ‼️ ใส่กลับต้องต่อท้าย grid เสมอ เพราะผังเรียงตามลำดับ ซ้าย กลาง ขวา */
  const leftPanel = grid.querySelector(".ws-left");
  const rightPanel = grid.querySelector(".ws-right");
  function applyRibbon() {
    if (!rightPanel) return;
    rightPanel.classList.toggle("as-ribbon", asRibbon);
    grid.classList.toggle("ribbon-mode", asRibbon);
    if (asRibbon) { if (rightPanel.parentNode !== body) body.insertBefore(rightPanel, grid); }
    else if (rightPanel.parentNode !== grid) grid.appendChild(rightPanel);
    ribBtn.setAttribute("aria-expanded", String(asRibbon));
    ribBtn.setAttribute("aria-label", asRibbon
      ? tr("ย้ายการตั้งค่ากลับไปด้านขวา", "Move settings back to the right")
      : tr("ย้ายการตั้งค่าขึ้นไปด้านบน", "Move settings to the top"));
    ribBtn.title = ribBtn.getAttribute("aria-label");
    applyPanes();
  }
  ribBtn.addEventListener("click", () => {
    asRibbon = !asRibbon;
    try { localStorage.setItem(RIB_KEY, asRibbon ? "1" : "0"); } catch { /* ไม่เป็นไร */ }
    applyRibbon();
  });

  /* ‼️ แถบปุ่มล่างกินจอมือถือมากเกินไป (วัดจริง 18/09/2026)
   *   ปุ่มเรียงด้วย flex-wrap ปุ่มละบรรทัด พอเครื่องมือมี 6-7 ปุ่มจึงสูงถึง 362px
   *   บนจอ 390x844 คือ 43% ของจอ และแถบนี้ลอยค้างตลอด เนื้อหาจึงถูกบังเกือบครึ่ง
   *   ผู้ใช้ต้องเลื่อนผ่านปุ่มที่ยังไม่ได้จะกดทุกครั้งที่อยากดูผลงานตัวเอง
   *
   *   ทางแก้ ปุ่มแรกคือปุ่มที่คนกดบ่อยที่สุดอยู่แล้ว (ทุกเครื่องมือวางไว้ตัวแรก)
   *   จึงให้ปุ่มแรกอยู่นอกเสมอ ที่เหลือพับเก็บไว้หลังปุ่มเดียวที่บอกจำนวนตรง ๆ
   *   ‼️ ไม่ซ่อนแบบไม่บอก เพราะงานวิจัยของเราเองระบุว่า "หาไม่เจอ" เป็นสาเหตุ 45%
   *   ของงานที่ทำไม่สำเร็จ ปุ่มพับจึงบอกจำนวนที่ซ่อนไว้ และจำสถานะที่ผู้ใช้เลือกไว้
   *   ‼️ พับเฉพาะจอแคบ บนเดสก์ท็อปแถบนี้กว้างพอ ปุ่มอยู่แถวเดียวอยู่แล้ว ไม่ต้องแตะ */
  let footer = null;
  if (cfg.footer && cfg.footer.length) {
    const items = cfg.footer.filter(Boolean);
    const buttons = items.filter((n) => n && n.tagName === "BUTTON");
    footer = el("div", { class: "ws-footer" }, items);
    if (buttons.length >= 3) {
      const extra = buttons.slice(1);
      /* ‼️ ต้องนับเฉพาะปุ่มที่ "กดได้ตอนนี้" ไม่ใช่ปุ่มทั้งหมดที่ประกาศไว้ (แก้ 20/09/2026)
       *   เครื่องมือซ่อนปุ่มดาวน์โหลดไว้จนกว่าจะมีผลลัพธ์ ปุ่มนี้จึงเคยบอกว่า "อีก 2 ปุ่ม"
       *   ตั้งแต่ยังไม่ได้ใส่ไฟล์ พอผู้ใช้กดกางก็ไม่มีอะไรโผล่เลยสักปุ่ม
       *   (พี่ปอนด์เจอกับเครื่องจริงบนมือถือ "กดไปก็ไม่มีอะไร")
       *   จำนวนต้องขยับตามความจริงตลอดเวลา จึงเฝ้าแอตทริบิวต์ hidden ของปุ่มที่พับไว้
       * ‼️ ซ่อนปุ่มนี้ด้วย style ตรง ๆ ไม่ใช้แอตทริบิวต์ hidden เพราะกฎ .ws-more ในจอแคบ
       *   ตั้ง display ไว้และมีน้ำหนักเท่ากับ [hidden] ของเบราว์เซอร์ แต่มาทีหลังจึงชนะ
       * ‼️ คำว่า "ย่อ" ใช้ไม่ได้ เพราะเครื่องมือย่อรูปใช้คำนี้เป็นคำสั่งหลักอยู่แล้ว
       *   ผู้ใช้อ่านว่า "ย่อปุ่มอื่น" แล้วงงว่ามันจะไปย่ออะไร ใช้ "ซ่อน" ที่ไม่ชนกับใคร */
      const liveExtra = () => extra.filter((b) => !b.hidden);
      const syncMore = () => {
        const n = liveExtra().length;
        more.style.display = n ? "" : "none";
        more.textContent = footer.classList.contains("more-open")
          ? tr("ซ่อนปุ่มที่เหลือ", "Fewer buttons")
          : tr(`อีก ${n} ปุ่ม`, `${n} more`);
      };
      const more = el("button", {
        type: "button", class: "ws-more", "aria-expanded": "false",
        onclick: () => {
          const open = footer.classList.toggle("more-open");
          more.setAttribute("aria-expanded", String(open));
          syncMore();
        },
      }, "");
      extra.forEach((b) => b.classList.add("ws-foot-extra"));
      footer.insertBefore(more, extra[0]);
      footer.classList.add("has-more");
      const watch = new MutationObserver(syncMore);
      for (const b of extra) watch.observe(b, { attributes: true, attributeFilter: ["hidden"] });
      syncMore();
      /* ‼️ ตั้งใจไม่จำสถานะกางข้ามหน้า (เคยใส่แล้วถอดออก 18/09/2026)
       *   ใส่ไปแล้ววัดจริงพบว่าเปิดเครื่องมือไหนแถบก็สูงค้างอยู่อย่างนั้น เพราะเคยกางไว้ครั้งเดียว
       *   ซึ่งย้อนกลับไปเป็นปัญหาเดิมที่ตั้งใจแก้ คือแถบบังงานของผู้ใช้
       *   การกางเป็นการกระทำชั่วคราวตอนจะกดปุ่ม ไม่ใช่ความชอบถาวรที่ควรจำ */
    }
  }
  body.append(grid, footer);
  applyRibbon();
  applyPanes();
  /* วัดของจริงหลังวาดเสร็จ ถ้าริบบอนสูงเกินเกณฑ์ ถอยกลับไปเป็นแผงข้างให้เอง
     ‼️ ต้องเฝ้าดู ไม่ใช่วัดครั้งเดียว เพราะเครื่องมือหลายตัวเติมเนื้อหาในแผงทีหลัง
        (pbi-bar โหลด Vega แล้วค่อยวาดตัวเลือก) วัดครั้งเดียวตอนมันยังเตี้ยจะตัดสินผิด
     ‼️ เลิกเฝ้าเมื่อพลิกไปแล้ว หรือเมื่อครบ 6 วินาที จะได้ไม่เฝ้าค้างทั้งชีวิตหน้า
        และเฉพาะตอนที่ผู้ใช้ยังไม่เคยเลือกเอง ความตั้งใจของผู้ใช้ห้ามถูกทับ */
  if (userChose === null && asRibbon && rightPanel && window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (!asRibbon) return ro.disconnect();
      if (rightPanel.getBoundingClientRect().height > RIB_MAX_H) {
        asRibbon = false; applyRibbon(); ro.disconnect();
      }
    });
    ro.observe(rightPanel);
    setTimeout(() => ro.disconnect(), 6000);   // ตัวจับเวลานี้คือเพดานสูงสุดของการเฝ้า
  }
  if (cfg.note) body.appendChild(el("div", { class: "note" }, cfg.note));

  /* ‼️ ต้องเรียกหลังแผงถูกประกอบครบแล้ว และหน่วงหนึ่งเฟรม
     เพราะหลายเครื่องมือเติมของเข้าแผงต่อหลังเรียก workspace() เสร็จ
     ถ้าสแกนทันทีจะเจอกลุ่มไม่ครบ */
  /* ‼️ สแกนรอบเดียวไม่พอ หลายเครื่องมือเติมของเข้าแผงหลังโหลดข้อมูลเสร็จ
     (เช่นกราฟโดนัทสร้างแผงขวาหลังอ่านไฟล์ตัวอย่าง ซึ่งช้ากว่าหลายวินาที)
     จึงเฝ้าดูแผงแล้วสแกนซ้ำเมื่อมีของเพิ่ม ตัวสแกนข้ามกล่องที่ทำไปแล้วจึงเรียกซ้ำได้
     ‼️ หน่วงด้วย rAF ก่อนสแกนทุกครั้ง กันกรณีเครื่องมือทยอยต่อ DOM ทีละชิ้น
        แล้วเราไปสแกนกลางคัน เจอหัวข้อที่ยังไม่มีเนื้อในกลุ่ม */
  /* ‼️ ต้องหาจาก node ของแผงตรง ๆ ห้าม querySelector จาก grid (บั๊ก 20/09/2026)
     โหมดริบบอนย้ายแผงขวาออกไปอยู่นอก grid ตั้งแต่ตอนวาดเสร็จ
     grid.querySelector จึงคืน null แล้วกลุ่มพับได้ไม่ถูกสร้างเลยสักกลุ่ม
     เทส foldpanes จับได้ว่ากราฟโดนัทเหลือ 0 กลุ่มจากเดิม 4 กลุ่ม */
  for (const [side, node] of [["left", leftPanel], ["right", rightPanel]]) {
    const sc = node && node.querySelector(".ws-scroll");
    if (!sc) continue;
    void side;
    let queued = false;
    const watch = { childList: true, subtree: true };
    const scan = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        /* ‼️ ปิดการเฝ้าดูตอนตัวเองแก้ DOM ไม่งั้นการห่อปุ่มจะปลุกตัวสแกนเอง วนไม่จบ
           (disconnect ล้างคิวที่ค้างอยู่ให้ด้วย จึงไม่มีรายการเก่าเด้งกลับหลังต่อใหม่) */
        obs.disconnect();
        try { collapsibleGroups(sc, tool.id); } finally { obs.observe(sc, watch); }
      });
    };
    const obs = new MutationObserver(scan);
    scan();
    obs.observe(sc, watch);
  }

  return {
    wrap, body, grid, canvas,
    /** เปิด/ปิดสถานะกำลังทำงาน (ผืนงานจะหรี่ลงและกดไม่ได้) */
    setBusy: (on) => grid.classList.toggle("busy", !!on),
    /** สลับระหว่าง "ยังไม่มีไฟล์" กับพรีวิวจริง */
    showCanvas: (on) => {
      emptyBox.hidden = !!on;
      if (cfg.center) cfg.center.node.hidden = !on;
      // บอก CSS ว่ามีไฟล์แล้ว — แถบปุ่มล่างจอบนมือถือค่อยเริ่มลอยตอนนี้
      // (ตอนยังไม่มีไฟล์ ปุ่มยังกดไม่ได้อยู่แล้ว แถบลอยมีแต่จะไปบังข้อความ "ยังไม่มีไฟล์…")
      body.classList.toggle("has-file", !!on);
    },
  };
}
