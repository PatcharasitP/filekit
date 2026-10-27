/* กล่อง "สรุปจากข้อมูลนี้" ใต้กราฟ ใช้ร่วมกันใน pbi-bar กับ pbi-donut
 * ไอเดียจาก dash-man.com (ศึกษา 27/10/2026) ตรรกะคิดประโยคอยู่ src/insightkit.js (ไม่แตะ DOM)
 * ไฟล์นี้มีแต่หน้าตา: หัวกราฟแบบเล่าเรื่อง 1 บรรทัด ปุ่มคัดลอกไปเป็น Title ของวิชวล และประโยครอง */
import { el, button } from "./ui.js";
import { tr, IS_EN } from "./i18n.js";
import { summarize, details, headline } from "./insightkit.js";

// ‼️ โปร่ง บาง ไม่มีพื้นสี (รสนิยมพี่ปอนด์) ฝังผ่าน STYLE ของเครื่องมือแบบ COLORKIT_CSS
export const INSIGHT_CSS = `
.ib{margin-top:10px;border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.ib-h{margin:0 0 6px;font-size:12px;font-weight:700;color:var(--text-mute)}
.ib-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.ib-title{flex:1 1 220px;font-size:14.5px;font-weight:700;color:var(--text);line-height:1.6}
.ib-list{margin:6px 0 0;padding-left:18px;font-size:12.5px;line-height:1.75;color:var(--text)}
`;

/** st = statusBar ของเครื่องมือ ใช้บอกผลการคัดลอก
 *  update(rows) รับแถว { Category, Value, Target? } ที่แปลชื่อตามภาษาแล้ว ข้อมูลใช้ไม่ได้ = ซ่อนกล่อง */
export function insightBox(st) {
  const label = tr("สรุปจากข้อมูลนี้", "What this data says");
  const title = el("div", { class: "ib-title" });
  const list = el("ul", { class: "ib-list" });
  const copy = button(tr("คัดลอกหัวกราฟ", "Copy headline"), { icon: "copy", ghost: true, onclick: onCopy });
  const node = el("section", { class: "ib", hidden: true, "aria-label": label }, [
    el("h3", { class: "ib-h" }, label),
    el("div", { class: "ib-head" }, [title, copy]),
    list,
  ]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(title.textContent);
      st.ok(tr("คัดลอกหัวกราฟแล้ว วางในช่อง Title ของวิชวลได้เลย", "Headline copied. Paste it into the visual's Title"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง", "Couldn't copy, select the text and copy it yourself"));
    }
  }

  function update(rows) {
    const s = rows ? summarize(rows) : null;
    node.hidden = !s;
    if (!s) return;
    title.textContent = headline(s, IS_EN);
    list.replaceChildren(...details(s, IS_EN).map((x) => el("li", {}, x)));
  }

  return { node, update };
}
