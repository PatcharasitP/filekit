// จัดข้อมูลลูกค้าไทยหลายอย่างในรอบเดียว: แยกที่อยู่ แยกชื่อ ตรวจเลขบัตร แปลงปี บาทถ้วน ไฟล์เดียวได้ครบ
// ที่มา 07/11/2026 พี่ปอนด์อยากรวมเครื่องมือที่เกี่ยวกันเป็นอุปกรณ์เดียว วัดเส้นทางเดิมบนเว็บจริง v222
// ผ่านการ์ดทำต่อ 4 งาน กด 8 ครั้ง ได้ 4 ไฟล์ ชื่อยาวขึ้นทุกขั้น ตัวแปลงทุกตัวคือ config() ของหน้าเดี่ยวเดิม
import { el } from "../dom.js";
import { columnSuite } from "../sheetpick.js";
import { tr } from "../i18n.js";
import { config as addressCfg } from "./thai-address.js";
import { config as nameCfg } from "./thai-name.js";
import { config as idCfg } from "./thai-id.js";
import { config as dateCfg } from "./thai-date.js";
import { config as numberCfg } from "./thai-number.js";

const STYLE = `
.suite-jobs{display:grid;gap:10px;margin:8px 0 12px}
.suite-job{border:1px solid var(--line,#dfe3ea);border-radius:12px;padding:10px 12px}
.suite-job.off{opacity:.62}
.suite-job.off .row,.suite-job.off .suite-opts{display:none}
.suite-head{display:flex;align-items:center;gap:8px;cursor:pointer;min-height:36px}
.suite-head input{width:18px;height:18px}
.suite-job .row{margin-top:8px;align-items:flex-end}
.suite-opts{margin-top:6px}
`;

// ‼️ คำประสมในหัวงานถูกตัดกลางคำบนจอ 390 (รหัส/ไปรษณีย์ , ผู้เสีย/ภาษี ภาพ suite_mobile.png 07/11/2026) ห่อก้อนห้ามตัด
//    ตามโน้ต คำประสมไทยถูกตัดข้ามบรรทัด ห่อก้อนห้ามตัดหลังวาดทุกครั้ง (tests/browser_thai_suite.py ตรวจว่าทุกคำอยู่ในก้อน nowrap)
export const NB_WORDS = ["รหัสไปรษณีย์", "ผู้เสียภาษี", "บัตรประชาชน", "นามสกุล", "คำนำหน้า", "บาทถ้วน", "ตำบล", "อำเภอ", "จังหวัด"];
const NB_RE = new RegExp(`(${NB_WORDS.join("|")})`);
const nb = (s) => s.split(NB_RE).filter(Boolean).map((x) => (NB_WORDS.includes(x) ? el("span", { class: "nb", style: "white-space:nowrap" }, x) : x));

export function mount(tool) {
  const items = [
    { id: "address", label: nb(tr("แยกที่อยู่เป็นตำบล อำเภอ จังหวัด รหัสไปรษณีย์", "Split address into subdistrict, district, province, postcode")), cfg: addressCfg() },
    { id: "name", label: nb(tr("แยกคำนำหน้า ชื่อ นามสกุล", "Split title, first name, last name")), cfg: nameCfg() },
    { id: "id", label: nb(tr("ตรวจเลขบัตรประชาชนหรือเลขผู้เสียภาษี", "Check national ID or tax ID")), cfg: idCfg() },
    { id: "date", label: nb(tr("สลับปี พ.ศ. กับ ค.ศ.", "Swap Buddhist and Gregorian years")), cfg: dateCfg() },
    { id: "number", label: nb(tr("ตัวเลขเป็นบาทถ้วน", "Numbers to Thai baht text")), cfg: numberCfg() },
  ];
  const wrap = columnSuite(tool, items, { expect: ["xlsx", "csv"] });
  wrap.prepend(el("style", { text: STYLE }));
  return wrap;
}
