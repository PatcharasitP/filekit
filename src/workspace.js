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
import { toolIcon } from "./icons.js";
import { tr } from "./i18n.js";

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

  const panel = (side, spec) => spec ? el("aside", { class: `ws-panel ws-${side}` }, [
    el("div", { class: "ws-head" }, [
      el("h2", {}, spec.title),
      spec.aside || null,
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

  const grid = el("div", { class: "ws-grid" }, [
    panel("left", cfg.left),
    el("section", { class: "ws-center" }, [canvas]),
    panel("right", cfg.right),
  ]);
  if (!cfg.left) grid.classList.add("no-left");
  if (!cfg.right) grid.classList.add("no-right");

  const footer = cfg.footer && cfg.footer.length ? el("div", { class: "ws-footer" }, cfg.footer) : null;
  body.append(grid, footer);
  if (cfg.note) body.appendChild(el("div", { class: "note" }, cfg.note));

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
