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
      const more = el("button", {
        type: "button", class: "ws-more", "aria-expanded": "false",
        onclick: () => {
          const open = footer.classList.toggle("more-open");
          more.setAttribute("aria-expanded", String(open));
          more.textContent = open
            ? tr("ย่อปุ่มอื่น", "Fewer buttons")
            : tr(`อีก ${extra.length} ปุ่ม`, `${extra.length} more`);
        },
      }, tr(`อีก ${extra.length} ปุ่ม`, `${extra.length} more`));
      extra.forEach((b) => b.classList.add("ws-foot-extra"));
      footer.insertBefore(more, extra[0]);
      footer.classList.add("has-more");
      /* ‼️ ตั้งใจไม่จำสถานะกางข้ามหน้า (เคยใส่แล้วถอดออก 18/09/2026)
       *   ใส่ไปแล้ววัดจริงพบว่าเปิดเครื่องมือไหนแถบก็สูงค้างอยู่อย่างนั้น เพราะเคยกางไว้ครั้งเดียว
       *   ซึ่งย้อนกลับไปเป็นปัญหาเดิมที่ตั้งใจแก้ คือแถบบังงานของผู้ใช้
       *   การกางเป็นการกระทำชั่วคราวตอนจะกดปุ่ม ไม่ใช่ความชอบถาวรที่ควรจำ */
    }
  }
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
