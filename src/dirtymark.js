import { el } from "./dom.js";
import { tr } from "./i18n.js";

/* ── บอกว่าช่องไหนถูกแก้ไปจากค่าเริ่มต้น และคืนค่าทีละช่องได้ ──────────────
 * ปัญหาที่แก้ (วัดเองบนเว็บจริง 11/09/2026)
 *   ปรับ 2 ช่องให้ต่างจากค่าเริ่มต้นแล้ว ไม่มีอะไรบอกเลยสักอย่าง
 *   และคืนค่าได้แค่ "ทั้งชุด" เท่านั้น ไม่มีทางคืนเฉพาะช่องที่เพิ่งปรับพลาด
 *   คนกดชุดพร้อมใช้แล้วปรับต่อไปเรื่อย ๆ จึงไม่รู้ว่าตอนนี้เบี่ยงไปกี่ช่อง ช่องไหนบ้าง
 *
 * ‼️ ทำไมถึงเลือกทำอันนี้ งานวิจัย 11/09/2026 พบว่า 3 เจ้าทำเหมือนกัน
 *   VS Code ใช้แถบสีข้างซ้าย + เมนูคืนค่า, Webflow ใช้จุดสีบอกที่มาของค่า,
 *   Power BI มีปุ่มคืนค่าถึง 3 ระดับ (ทั้งวิชวล ทั้งหมวด และเฉพาะกลุ่มย่อย)
 *
 * ‼️ ห้ามใช้สีเป็นสัญญาณอย่างเดียว คนตาบอดสีจะไม่เห็น จึงมีปุ่มคืนค่าโผล่มาด้วย
 *   ซึ่งเป็นทั้งสัญญาณและทางแก้ในตัว และมีข้อความบอกจำนวนรวมไว้ให้อ่านด้วย
 *
 * วิธีใช้
 *   ให้ตัวสร้างช่องติด data-param="ชื่อพารามิเตอร์" ไว้บน node ของช่องนั้น
 *   const dm = dirtyMarks({ scope: rightBody, defaults, values: () => paramValues,
 *                           onReset: (name) => {...} });
 *   ...แล้วเรียก dm.refresh() ทุกครั้งที่ค่าเปลี่ยน
 */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function dirtyMarks(cfg) {
  /* ‼️ skip = ค่าที่ไม่ได้มาจากผู้ใช้ เช่นคำบรรยายที่เปลี่ยนตามชุดข้อมูลที่เลือก
     ถ้าไม่ข้าม จะนับว่า "ผู้ใช้แก้ไป 1 ช่อง" ตั้งแต่เปิดหน้ามาโดยที่ยังไม่ได้แตะอะไรเลย
     (เจอจริงกับกราฟโดนัท 11/09/2026) ใช้รายการเดียวกับที่ statekit ข้ามอยู่แล้ว */
  const { scope, defaults, values, onReset, skip = [], summaryInto = null } = cfg;
  const summary = summaryInto || el("div", { class: "dm-summary", role: "status", "aria-live": "polite" });

  function fieldsOf() { return scope.querySelectorAll("[data-param]"); }

  /* ‼️ ปุ่มต้องอยู่นอก <label> ที่ครอบช่องกรอก ไม่งั้นชื่อที่โปรแกรมอ่านหน้าจอ
     ได้ยินจะกลายเป็น "ป้ายชื่อ + ข้อความในปุ่ม" ปนกัน หาช่องด้วยชื่อไม่เจอ
     จึงวางเป็นลูกของกล่องห่อ แล้วจัดตำแหน่งด้วย CSS แทน */
  function ensureBtn(node, name) {
    let btn = node.querySelector(":scope > .dm-reset");
    if (btn) return btn;
    btn = el("button", {
      type: "button", class: "dm-reset",
      title: tr("คืนค่าเริ่มต้นของช่องนี้", "Reset this one to its default"),
      "aria-label": tr("คืนค่าเริ่มต้นของช่องนี้", "Reset this one to its default"),
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); onReset(name); },
    }, "↺");
    node.appendChild(btn);
    return btn;
  }

  function refresh() {
    const v = values();
    let n = 0;
    for (const node of fieldsOf()) {
      const name = node.dataset.param;
      if (!(name in defaults) || skip.includes(name)) continue;
      const changed = !same(v[name], defaults[name]);
      node.classList.toggle("dm-changed", changed);
      const btn = ensureBtn(node, name);
      if (btn) btn.hidden = !changed;
      if (changed) n++;
    }
    summary.textContent = n
      ? tr(`ปรับจากค่าเริ่มต้นไป ${n} ช่อง`, `${n} changed from the defaults`)
      : "";
    summary.hidden = !n;
    return n;
  }

  return { node: summary, refresh, count: () => refresh() };
}

export const DIRTYMARK_CSS = `
.dm-summary{font-size:12px;font-weight:600;color:var(--text-mute);line-height:1.6;
  margin:-4px 0 10px;padding-inline-start:9px;
  border-inline-start:2px solid color-mix(in srgb,var(--g-powerbi,var(--brand)) 60%,var(--line))}
/* ‼️ แถบข้างซ้ายเป็นสัญญาณเสริม ไม่ใช่สัญญาณเดียว ปุ่มคืนค่าที่โผล่มาคือตัวหลัก
   เพราะคนตาบอดสีต้องเห็นด้วย */
.dm-field{position:relative}
.dm-field.dm-changed::before{content:"";position:absolute;inset-block:0;inset-inline-start:-9px;
  width:2px;border-radius:2px;background:var(--g-powerbi,var(--brand))}
.dm-reset{position:absolute;inset-block-start:-2px;inset-inline-end:0;border:0;background:transparent;
  cursor:pointer;color:var(--text-mute);font-size:13px;line-height:1;padding:2px 5px;border-radius:6px}
.dm-reset:hover{color:var(--text);background:var(--bg-soft)}
.dm-reset:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
@media (pointer:coarse){ .dm-reset{min-width:36px;min-height:36px} }
`;
