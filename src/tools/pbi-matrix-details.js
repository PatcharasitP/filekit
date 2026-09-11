// ── รายละเอียดหลายคอลัมน์ในช่องเดียวของ Matrix (Power BI) ────────────────────
//
// ที่มา: คลิป SQLBI "Show transaction details on matrix visual in Power BI" (27/01/2026)
// และบทความ https://www.sqlbi.com/articles/show-transaction-details-on-the-matrix-visual-in-power-bi/
// เทคนิคคือเขียน measure ที่ "คืนค่าเป็นข้อความ" แล้ววางลงช่อง Values ของ Matrix
// ทำให้เอาข้อมูลหลายคอลัมน์มายุบอยู่ในคอลัมน์เดียว โดยหัวแถวทางซ้ายยังตรึงอยู่กับที่
//
// ‼️‼️ จุดที่บทความต้นทางไม่ได้พูดถึงเลย และเป็นจุดที่ทำให้ข้อมูลหายเงียบ ๆ
//
// สูตรของเขาใช้ FILTER ( { ...คอลัมน์... }, [Value] <> "" ) เพื่อตัดค่าว่างทิ้ง
// ซึ่งถูกต้องถ้าทุกคอลัมน์เป็นข้อความ แต่เอกสาร DAX ระบุไว้ตรง ๆ ว่า
//
//   "All comparison operators except == treat BLANK as equal to number 0,
//    empty string "", DATE(1899, 12, 30), or FALSE"
//   (https://learn.microsoft.com/dax/dax-operator-reference)
//
// แปลว่าถ้าคอลัมน์ที่ยัดเข้าไปเป็นตัวเลข วันที่ หรือจริง/เท็จ
//   ยอด 0 จะถูกมองว่าเท่ากับ "" แล้วหายไปจากรายละเอียด
//   วันที่ 30/12/1899 จะหายไป
//   ค่า FALSE จะหายไป
// ทั้งหมดนี้หายแบบไม่มี error ไม่มีคำเตือน ผู้ใช้เห็นแค่ช่องที่ข้อมูลไม่ครบ
// และซ้ำร้าย ตัวสร้างตาราง { } เองก็แปลงชนิดให้อัตโนมัติ ("all values are
// converted to a common data type" https://learn.microsoft.com/dax/table-constructor)
// จึงเดาไม่ได้ว่าสุดท้ายคอลัมน์จะกลายเป็นชนิดไหน
//
// ‼️ ทางออกที่เครื่องมือนี้ใช้: แปลงทุกฟิลด์เป็น "ข้อความ" ให้เสร็จก่อนใส่เข้าวงเล็บปีกกา
//    ปัญหาทั้งชุดหายไปพร้อมกัน เพราะ [Value] เป็นข้อความแน่นอนเสมอ
//      FORMAT ( 0, "#,0" ) = "0" ซึ่งไม่เท่ากับ "" จึงไม่หาย
//      FORMAT ( BLANK(), ... ) = "" ตามเอกสาร จึงยังถูกกรองทิ้งอย่างที่ควรเป็น
//    และได้ของแถมคือคุมรูปแบบรายฟิลด์ได้ ทศนิยมกี่ตำแหน่ง วันที่รูปแบบไหน
//
// ‼️ ราคาที่ต้องจ่าย: FORMAT ทำงานที่ formula engine ไม่ใช่ storage engine
//    คอลัมน์ที่เป็นข้อความอยู่แล้วจึงไม่ห่อ FORMAT ให้เปล่า ๆ (ดู fieldExpr)
//
// ‼️ สถานะความรู้: รูปแบบสูตรมาจากบทความที่ SQLBI วัด performance มาแล้ว
//    ส่วนการแปลงเป็นข้อความอ้างจากเอกสารทางการของ Microsoft ที่ยกมาข้างบน
//    แต่ยังไม่ได้ยิงกับโมเดลจริงในเครื่อง ต้องให้พี่ปอนด์ลองวางใน Power BI จริงก่อน
//    จึงจะนับเป็นความรู้ชั้นที่พิสูจน์แล้ว

import { workspace } from "../workspace.js";
import { el, dropzone, statusBar, button, field, select, segmented,
         download, stripExt } from "../ui.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, sheetToTable, cellText } from "../sheetpick.js";
import { guessColumnType } from "../pqtypes.js";
import { parseAnyDate } from "../thai.js";
import { tr, pl } from "../i18n.js";

/* รูปแบบตั้งต้นของแต่ละชนิดข้อมูล — เลือกให้ "อ่านออกในตาราง" ไม่ใช่ให้ครบทศนิยม
   ‼️ ชนิดข้อความไม่มีรูปแบบ เพราะไม่ต้องแปลงอะไรเลย ห่อ FORMAT ให้เปลืองแรงเปล่า */
const FMT = {
  text:     { dax: null,                   label: () => tr("ข้อความ", "Text") },
  int64:    { dax: "#,0",                  label: () => tr("จำนวนเต็ม", "Whole number") },
  number:   { dax: "#,0.00",               label: () => tr("ทศนิยม", "Decimal") },
  currency: { dax: "#,0.00",               label: () => tr("จำนวนเงิน", "Currency") },
  percentage: { dax: "0.0%",               label: () => tr("เปอร์เซ็นต์", "Percentage") },
  date:     { dax: "dd/MM/yyyy",           label: () => tr("วันที่", "Date") },
  datetime: { dax: "dd/MM/yyyy HH:mm",     label: () => tr("วันที่และเวลา", "Date/Time") },
  time:     { dax: "HH:mm",                label: () => tr("เวลา", "Time") },
  logical:  { dax: null,                   label: () => tr("จริง/เท็จ", "True/False") },
};
const TYPE_IDS = Object.keys(FMT);
/* จำนวนฟิลด์ที่ติ๊กไว้ให้ตั้งแต่แรก นับจากคอลัมน์ถัดจากหัวแถว */
const DEFAULT_ON = 5;
/* ชนิดที่ตกหลุม "ค่าศูนย์หายเงียบ ๆ" ถ้าไม่แปลงเป็นข้อความก่อน */
const RISKY = new Set(["int64", "number", "currency", "percentage", "date", "datetime", "time", "logical"]);

const STYLE = `
.pmd-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(58vh,560px)}
.pmd-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre}
@media (max-width:640px){ .pmd-code{max-height:78vh} }
.pmd-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.pmd-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}
.pmd-cols{display:flex;flex-direction:column;gap:8px}
.pmd-col{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px}
.pmd-col.off{opacity:.5}
/* ‼️ ป้ายติ๊กสูงแค่ 22.8px ตกเกณฑ์นิ้วแตะ 36px (tests/browser_mobile.py จับได้)
   ยืดเฉพาะอุปกรณ์สัมผัส เมาส์บนจอใหญ่คงกระชับเหมือนเดิม */
.pmd-col-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
@media (pointer:coarse){ .pmd-col-head{min-height:36px} }
.pmd-levels{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.pmd-level{display:flex;align-items:center;gap:8px;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-soft);padding:6px 9px}
.pmd-level.inner{border-inline-start:3px solid var(--g-powerbi,var(--brand))}
.pmd-level-n{font-size:11.5px;font-weight:700;color:var(--text-mute);flex:none;
  width:18px;text-align:center}
.pmd-level-name{flex:1;min-width:0;font-size:13px;font-weight:600;word-break:break-word}
.pmd-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px;flex:none}
.pmd-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pmd-mini:disabled{opacity:.35;cursor:default}
.pmd-mini.danger{color:var(--danger,#c0392b)}
@media (pointer:coarse){ .pmd-mini{width:36px;height:36px} }
.pmd-col-head input[type="checkbox"]{width:18px;height:18px;flex:none;margin:0}
.pmd-col-name{font-weight:700;font-size:13px;color:var(--text);word-break:break-word;flex:1;min-width:0}
.pmd-col-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pmd-col-row select,.pmd-col-row input{flex:1;min-width:110px;min-height:36px}
.pmd-seen{font-size:12px;color:var(--text-mute);margin-top:5px;line-height:1.6;word-break:break-word}
.pmd-preview{border:1px solid var(--line);border-radius:var(--r-sm);overflow:auto;max-height:min(58vh,560px)}
.pmd-preview table{border-collapse:collapse;width:100%;font-size:12.5px}
.pmd-preview th,.pmd-preview td{border:1px solid var(--line);padding:7px 10px;text-align:left;
  vertical-align:top;line-height:1.6}
.pmd-preview th{background:var(--bg-soft);font-weight:700;position:sticky;top:0}
.pmd-preview td.anchor{font-weight:700;white-space:nowrap;background:var(--bg-soft)}
.pmd-preview td.detail{white-space:pre-wrap;word-break:break-word;color:var(--text)}
.pmd-steps{font-size:12.5px;color:var(--text);line-height:1.85;margin:0;padding-left:18px}
.pmd-steps strong{color:var(--text)}
.pmd-group-title{margin:0 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
` + CODE_TOKEN_CSS;

/** ใส่เครื่องหมายคำพูดเดี่ยวรอบชื่อตารางเมื่อจำเป็น ตามกฎการอ้างชื่อของ DAX */
function quoteTable(name) {
  const t = String(name || "Table").trim() || "Table";
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) ? t : `'${t.replace(/'/g, "''")}'`;
}
const daxStr = (s) => `"${String(s).replace(/"/g, '""')}"`;

/**
 * นิพจน์ของฟิลด์หนึ่งฟิลด์ ที่ "รับประกันว่าเป็นข้อความ"
 *
 * ‼️ หัวใจของเครื่องมือนี้อยู่ที่ฟังก์ชันเดียวนี้ ทุกอย่างที่ออกไปจากตรงนี้ต้องเป็นข้อความ
 *    ไม่งั้นตัวกรอง [Value] <> "" จะกินค่าศูนย์ วันที่ 30/12/1899 และ FALSE ทิ้งไปเงียบ ๆ
 */
export function fieldExpr(col, tableRef) {
  const ref = `${tableRef}[${col.name}]`;
  let body;
  if (col.type === "logical") {
    // จริง/เท็จ ต้องแปลงเองเป็นคำ ไม่งั้น FALSE จะถูกมองว่าเท่ากับ "" แล้วหายไป
    body = `IF ( ${ref}, ${daxStr(col.trueText || tr("ใช่", "Yes"))}, ${daxStr(col.falseText || tr("ไม่ใช่", "No"))} )`;
  } else if (col.type === "text" || !col.fmt) {
    body = ref;                       // เป็นข้อความอยู่แล้ว ไม่ห่อ FORMAT ให้เปลืองแรง
  } else {
    body = `FORMAT ( ${ref}, ${daxStr(col.fmt)} )`;
  }
  if (!col.label) return body;
  /* มีป้ายกำกับ ต้องเช็คว่าง "ก่อน" ต่อป้าย ไม่งั้นแถวที่ไม่มีข้อมูลจะเหลือป้ายลอย ๆ
     ข้อความใช้ <> "" ได้ตรง ๆ (ครอบทั้ง BLANK และสตริงว่าง)
     ชนิดอื่นใช้ NOT ISBLANK เพราะ <> "" กับตัวเลขคือกับดักเดิมที่เรากำลังเลี่ยง */
  const guard = col.type === "text" ? `${ref} <> ""` : `NOT ISBLANK ( ${ref} )`;
  return `IF ( ${guard}, ${daxStr(col.label)} & ${body} )`;
}

/**
 * สร้าง measure DAX ทั้งก้อน
 * @param {object} o
 *   o.measure   ชื่อ measure
 *   o.table     ชื่อตารางในโมเดล
 *   o.anchors   ชื่อคอลัมน์หัวแถวเรียงจากนอกไปใน เช่น ["ลูกค้า","เลขที่ใบสั่ง"]
 *
 * ‼️ ทำไมต้องรับหลายชั้น ไม่ใช่ชั้นเดียว (พี่ปอนด์ทัก 11/09/2026)
 *    Matrix ของจริงมักลากหลายคอลัมน์ลงช่อง Rows เป็นลำดับชั้น
 *    และคอลัมน์รหัสหลายตัวก็ "ซ้ำได้หลายแถว" เช่นรหัสสินค้าโผล่ในหลายใบสั่ง
 *    ถ้าผูก ISINSCOPE กับชั้นนอก ข้อความจะไปโผล่ที่แถวสรุปของชั้นนั้นด้วย
 *    ซึ่งเอาข้อมูลคนละรายการมากองรวมกัน และคำนวณหนักโดยไม่จำเป็น
 *    ผูกกับ "ชั้นในสุด" จึงถูกต้องเสมอ เพราะ ISINSCOPE เป็นจริงเฉพาะตอนชั้นนั้นกางอยู่
 *   o.cols      ฟิลด์ที่เลือก [{ name, type, fmt, label, trueText, falseText }]
 *   o.strategy  "rows" | "values" | "summarize"
 *   o.fieldSep  ตัวคั่นระหว่างฟิลด์ในแถวเดียวกัน
 *   o.rowSep    "newline" | ", " | " - " ตัวคั่นระหว่างแถว
 */
export function buildMeasure(o) {
  const T = quoteTable(o.table);
  const items = o.cols.map((c) => fieldExpr(c, T));
  const pad = (s, n) => s.split("\n").map((l) => " ".repeat(n) + l).join("\n");
  const list = items.map((x) => pad(x, 20)).join(",\n");
  const inner =
`CONCATENATEX (
            FILTER (
                {
${list}
                },
                [Value] <> ""
            ),
            [Value],
            ${daxStr(o.fieldSep)}
        )`;
  const rowSep = o.rowSep === "newline" ? "UNICHAR ( 10 )" : daxStr(o.rowSep);

  let body;
  if (o.strategy === "values") {
    /* ไล่ค่าที่ไม่ซ้ำของแต่ละฟิลด์ เหมาะกับฟิลด์ที่มาจากตารางมิติซึ่งคาดว่ามีค่าเดียว
       ‼️ ไม่มี row context จึงต้องใช้ VALUES ครอบทุกคอลัมน์ */
    const vlist = o.cols.map((c) => {
      const ref = `VALUES ( ${T}[${c.name}] )`;
      if (c.type === "logical")
        return pad(`IF ( ${ref}, ${daxStr(c.trueText || tr("ใช่", "Yes"))}, ${daxStr(c.falseText || tr("ไม่ใช่", "No"))} )`, 20);
      if (c.type === "text" || !c.fmt) return pad(ref, 20);
      return pad(`FORMAT ( ${ref}, ${daxStr(c.fmt)} )`, 20);
    }).join(",\n");
    body =
`CONCATENATEX (
        FILTER (
            {
${vlist}
            },
            [Value] <> ""
        ),
        [Value],
        ${daxStr(o.fieldSep)}
    )`;
  } else if (o.strategy === "summarize") {
    const slist = o.cols.map((c) => `            ${T}[${c.name}]`).join(",\n");
    body =
`CONCATENATEX (
        SUMMARIZE (
            ${T},
${slist}
        ),
        ${inner},
        ${rowSep}
    )`;
  } else {
    body =
`CONCATENATEX (
        ${T},
        ${inner},
        ${rowSep}
    )`;
  }

  const anchors = o.anchors && o.anchors.length ? o.anchors : [o.anchor];
  const innerCol = anchors[anchors.length - 1];
  const note = anchors.length > 1
    ? `\n    -- หัวแถว ${anchors.length} ชั้น: ${anchors.join(" > ")}\n    -- ผูกกับชั้นในสุด ข้อความจึงขึ้นเฉพาะแถวลึกสุด ไม่ไปโผล่ที่แถวสรุปของชั้นนอก`
    : "";
  return `${o.measure} =${note}
IF (
    ISINSCOPE ( ${T}[${innerCol}] ),
    ${body}
)`;
}

/** ข้อความที่ผู้ใช้จะเห็นจริงในช่องหนึ่งช่อง คำนวณจากข้อมูลตัวอย่างในไฟล์
 *
 * ‼️ ต้องเดินตามตรรกะของ "วิธีรวมข้อมูล" ที่เลือกไว้จริง ๆ ไม่ใช่วาดทุกแถวเสมอ
 *    เจอเองตอนทดสอบ: เลือก SUMMARIZE แล้วพรีวิวยังโชว์ 3 บรรทัดซ้ำกัน
 *    ทั้งที่ของจริงตัดซ้ำเหลือบรรทัดเดียว พรีวิวที่ไม่ตรงของจริงอันตรายกว่าไม่มีพรีวิว
 *    เพราะคนเชื่อไปแล้วว่าเห็นผลลัพธ์จริง
 * @returns {{text:string, multi:string[]}} multi = ฟิลด์ที่มีหลายค่าในกลุ่มเดียว
 *   ซึ่งทำให้วิธี "ค่าที่ไม่ซ้ำของแต่ละฟิลด์" พังในของจริง (VALUES คืนหลายแถว)
 */
export function previewCell(rowsOfGroup, cols, fieldSep, rowSepText, strategy = "rows") {
  const cell = (r) => {
    const parts = [];
    for (const c of cols) {
      const v = formatSample(r[c.idx], c);
      if (v === "") continue;                    // เท่ากับ FILTER [Value] <> ""
      parts.push(c.label ? c.label + v : v);
    }
    return parts.join(fieldSep);
  };

  if (strategy === "values") {
    /* ไม่มี row context จึงเป็นบรรทัดเดียว แต่ละฟิลด์คือค่าที่ไม่ซ้ำของทั้งกลุ่ม
       ถ้าฟิลด์ไหนมีมากกว่า 1 ค่า ของจริงจะพังเพราะ VALUES คืนตารางหลายแถว */
    const parts = [], multi = [];
    for (const c of cols) {
      const vals = [...new Set(rowsOfGroup.map((r) => formatSample(r[c.idx], c)).filter((v) => v !== ""))];
      if (!vals.length) continue;
      if (vals.length > 1) multi.push(c.name);
      parts.push(c.label ? c.label + vals[0] : vals[0]);
    }
    return { text: parts.join(fieldSep), multi };
  }

  let lines = rowsOfGroup.map(cell).filter((x) => x !== "");
  if (strategy === "summarize") lines = [...new Set(lines)];   // SUMMARIZE ตัดค่าซ้ำให้
  return { text: lines.join(rowSepText), multi: [] };
}

/** จำลอง FORMAT ของ DAX เท่าที่จำเป็นสำหรับพรีวิว */
function formatSample(raw, col) {
  const s = cellText(raw).trim();
  if (s === "") return "";
  if (col.type === "logical") {
    const t = s.toLowerCase();
    const isTrue = ["true", "yes", "y", "ใช่", "จริง", "เปิด", "1"].includes(t);
    return isTrue ? (col.trueText || tr("ใช่", "Yes")) : (col.falseText || tr("ไม่ใช่", "No"));
  }
  if (col.type === "text" || !col.fmt) return s;
  const n = Number(String(raw).replace(/,/g, ""));
  if (col.type === "date" || col.type === "datetime" || col.type === "time") {
    /* ‼️ ห้ามใช้ new Date(s) ตรง ๆ กับข้อมูลไทย "7 กันยายน 2569" จะได้ Invalid Date
       แล้วตกไปคืนข้อความดิบ ผลคือพรีวิวโชว์วันแบบไทย แต่ DAX จริงจะได้ 07/09/2026
       พรีวิวที่ไม่ตรงกับของจริง อันตรายกว่าไม่มีพรีวิว เพราะคนเชื่อไปแล้ว
       ใช้ตัวแปลงกลางของโปรเจกต์ที่รู้จักเดือนไทยและปี พ.ศ. แทน */
    const parts = parseAnyDate(raw instanceof Date ? raw : s);
    if (!parts || !parts.y || !parts.m || !parts.d) return s;
    const p = (x) => String(x).padStart(2, "0");
    const dmy = `${p(parts.d)}/${p(parts.m)}/${parts.y}`;
    const d = raw instanceof Date ? raw : null;
    const hm = d ? `${p(d.getHours())}:${p(d.getMinutes())}` : "00:00";
    return col.type === "date" ? dmy : col.type === "time" ? hm : `${dmy} ${hm}`;
  }
  if (!Number.isFinite(n)) return s;
  if (col.type === "percentage") return (n * 100).toFixed(1) + "%";
  const dec = /\.(0+)/.exec(col.fmt || "");
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dec ? dec[1].length : 0,
    maximumFractionDigits: dec ? dec[1].length : 0,
  });
}

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  let wb = null;
  let table = null;            // { header, rows }
  let cols = [];               // [{ name, idx, type, fmt, label, on, samples, blanks }]

  /* ── แผงขวา: การตั้งค่า ───────────────────────────────────────────── */
  const measureInput = el("input", { type: "text", value: "Details" });
  const tableInput = el("input", { type: "text", value: "Sales", placeholder: "Sales" });
  let levels = [];                     // ดัชนีคอลัมน์หัวแถว เรียงจากนอกไปใน
  const levelsEl = el("div", { class: "pmd-levels" });
  const addSel = select([["", "-"]], "");
  const addBtn = button(tr("เพิ่มชั้น", "Add level"), { ghost: true, onclick: onAddLevel });
  const strategySel = select([
    ["rows", tr("ไล่ทีละแถวของตาราง (แนะนำ)", "Iterate the table rows (recommended)")],
    ["values", tr("ค่าที่ไม่ซ้ำของแต่ละฟิลด์", "Distinct values per field")],
    ["summarize", tr("จับกลุ่มด้วย SUMMARIZE", "Group with SUMMARIZE")],
  ], "rows");
  const fieldSepSel = select([
    [", ", tr("จุลภาค  ,", "Comma  ,")],
    [" | ", tr("ขีดตั้ง  |", "Pipe  |")],
    [" - ", tr("ขีดกลาง  -", "Dash  -")],
    ["  ", tr("เว้นวรรค", "Space")],
  ], ", ");
  const rowSepSel = select([
    ["newline", tr("ขึ้นบรรทัดใหม่", "New line")],
    [" - ", tr("ขีดกลาง  -", "Dash  -")],
    [", ", tr("จุลภาค  ,", "Comma  ,")],
  ], "newline");

  const sheetSel = select([["0", "-"]], "0");
  const sheetField = field(tr("ชีต", "Sheet"), sheetSel);
  sheetField.hidden = true;

  const colsEl = el("div", { class: "pmd-cols" });
  const rightBody = el("div", {}, [
    field(tr("ชื่อ measure", "Measure name"), measureInput),
    field(tr("ชื่อตารางในโมเดล", "Table name in the model"), tableInput,
      tr("ชื่อที่ใช้จริงใน Power BI ไม่ใช่ชื่อไฟล์", "The name used in Power BI, not the file name")),
    el("h3", { class: "pmd-group-title", style: "margin:18px 0 8px" },
      tr("หัวแถวที่ตรึงไว้ เรียงจากนอกไปใน", "Frozen row headers, outer to inner")),
    el("p", { class: "pmd-seen", style: "margin:0 0 8px" },
      tr("ลำดับเดียวกับที่ลากลงช่อง Rows ของ Matrix ข้อความจะขึ้นเฉพาะแถวของชั้นในสุด",
         "Same order you drop them into the matrix Rows box, the text appears only on the innermost level")),
    levelsEl,
    el("div", { class: "pmd-col-row", style: "margin-bottom:4px" }, [addSel, addBtn]),
    field(tr("วิธีรวมข้อมูล", "How to gather the data"), strategySel),
    field(tr("ตัวคั่นระหว่างฟิลด์", "Separator between fields"), fieldSepSel),
    field(tr("ตัวคั่นระหว่างแถว", "Separator between rows"), rowSepSel),
    el("h3", { class: "pmd-group-title", style: "margin:18px 0 8px" }, tr("ฟิลด์ที่จะเอามาแสดง", "Fields to show")),
    colsEl,
  ]);

  /* ── กลาง: ผลลัพธ์ ────────────────────────────────────────────────── */
  const tabs = segmented([
    ["dax", tr("สูตร DAX", "DAX measure")],
    ["preview", tr("ตัวอย่างที่จะได้", "What you will see")],
    ["setup", tr("วิธีตั้งค่า Matrix", "Matrix setup")],
  ], "dax");
  tabs.classList.add("pmd-tabs");

  const warnEl = el("div", { class: "pmd-warn", hidden: true });
  const codeEl = el("code", {});
  const codeBox = el("pre", { class: "pmd-code" }, [codeEl]);
  const previewBox = el("div", { class: "pmd-preview", hidden: true });
  const setupBox = el("div", { hidden: true });
  const centerNode = el("div", {}, [tabs, warnEl, codeBox, previewBox, setupBox]);

  const dz = dropzone({
    accept: ".xlsx,.xlsm,.xls,.csv,.txt", multiple: false,
    expect: ["xlsx", "xls", "xlsm", "csv", "txt"],
    expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("เปิดไฟล์ตัวอย่างของตารางที่จะใช้ หัวตารางอยู่แถวบนสุด",
             "Open a sample export of the table you will use, header on the top row"),
    onChange: onFiles,
  });

  const copyBtn = button(tr("คัดลอกสูตร", "Copy measure"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .dax", "Download .dax"), { icon: "download", ghost: true, onclick: onDownload });

  const ws = workspace(tool, {
    left: {
      title: tr("ตารางต้นทาง", "Source table"),
      node: el("div", {}, [dz.container, sheetField]),
      hint: tr("อ่านจากไฟล์ในเครื่องคุณเอง ไม่ได้ส่งขึ้นเซิร์ฟเวอร์",
               "Read straight from your own machine, nothing is uploaded"),
    },
    center: {
      title: tr("ผลลัพธ์", "Result"), node: centerNode,
      empty: tr("เปิดไฟล์ตัวอย่างของตาราง เพื่อสร้างสูตร",
                "Open a sample export of your table to build the measure"),
    },
    right: { title: tr("ปรับแต่ง", "Customize"), node: rightBody },
    footer: [copyBtn, dlBtn, st.node],
    note: tr(
      "เอาไปใช้ยังไง: สร้าง measure ใหม่ใน Power BI วางสูตรนี้ลงไป แล้วลากไปไว้ช่อง Values ของ Matrix โดยคอลัมน์หัวแถวอยู่ช่อง Rows",
      "How to use it: create a new measure in Power BI, paste this in, then drop it into the Values box of a matrix with your header column in Rows"
    ),
  });
  ws.wrap.prepend(styleEl);

  for (const c of [measureInput, tableInput]) c.addEventListener("input", render);
  for (const c of [strategySel, fieldSepSel, rowSepSel]) c.addEventListener("change", render);
  tabs.addEventListener("change", render);
  sheetSel.addEventListener("change", () => pickSheet(sheetSel.value));

  return ws.wrap;

  /* ── อ่านไฟล์ ─────────────────────────────────────────────────────── */
  async function onFiles(files) {
    const f = files && files[0];
    if (!f) return;
    st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
    try {
      await loadLibs("xlsx");
      const res = await readWorkbook(f);
      wb = res.wb;
      const names = (wb.SheetNames || []).filter((n) => wb.Sheets[n]);
      if (!names.length) throw new Error(tr("ไฟล์นี้ไม่มีชีตที่อ่านได้", "This file has no readable sheet"));
      sheetSel.innerHTML = "";
      for (const n of names) sheetSel.appendChild(el("option", { value: n }, n));
      sheetField.hidden = names.length < 2;
      if (!tableInput.dataset.touched) tableInput.value = stripExt(f.name);
      pickSheet(names[0]);
      st.ok(res.encNote || tr("อ่านไฟล์แล้ว", "File loaded"));
    } catch (e) {
      console.error(e);
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Couldn't read the file: ") + e.message);
    }
  }
  tableInput.addEventListener("input", () => { tableInput.dataset.touched = "1"; });

  function pickSheet(name) {
    table = sheetToTable(wb.Sheets[name]);
    if (!table.header.length) { st.err(tr("ชีตนี้ว่างเปล่า", "This sheet is empty")); return; }
    cols = table.header.map((h, i) => {
      const values = table.rows.map((r) => r[i]);
      const g = guessColumnType(values);
      const type = FMT[g.type] ? g.type : "text";
      return {
        name: String(h || tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`)), idx: i, type,
        fmt: FMT[type].dax, label: "", on: true, reason: g.reason,
        samples: values.map(cellText).filter((v) => v.trim() !== "").slice(0, 2),
        blanks: values.filter((v) => cellText(v).trim() === "").length,
      };
    });
    /* คอลัมน์แรกที่เป็นข้อความหรือรหัส มักเป็นตัวที่คนเอาไปวางเป็นหัวแถว */
    levels = [0];                     // เริ่มที่คอลัมน์แรก ผู้ใช้เพิ่มชั้นเองได้
    /* ‼️ ตารางจริงมักมี 20 คอลัมน์ขึ้นไป ถ้าติ๊กครบตั้งแต่แรกจะได้สูตรยาวเป็นหน้าจอ
       ซึ่งไม่มีใครอ่าน และไม่ใช่สิ่งที่คนตั้งใจจะเอาไปใช้จริง
       เริ่มที่ไม่กี่ฟิลด์ให้พออ่านออกว่าได้อะไร แล้วบอกจำนวนที่เลือกไว้ให้เห็นชัด
       ไม่ใช่ซ่อนเงียบ ๆ (ข้อความอยู่ในกล่องเตือนกลางจอ) */
    cols.forEach((c, i) => { c.on = i !== 0 && i <= DEFAULT_ON; });
    buildLevels();
    buildColumnPanel();
    ws.showCanvas(true);
    render();
  }

  /* ── หัวแถวหลายชั้น ───────────────────────────────────────────────── */
  function onAddLevel() {
    const i = Number(addSel.value);
    if (addSel.value === "" || levels.includes(i)) return;
    levels.push(i);
    cols[i].on = false;               // ชั้นหัวแถวไม่ต้องเอามาแสดงซ้ำในรายละเอียด
    buildLevels(); buildColumnPanel(); render();
  }
  function buildLevels() {
    levelsEl.innerHTML = "";
    levels.forEach((ci, k) => {
      const move = (d) => {
        const j = k + d;
        if (j < 0 || j >= levels.length) return;
        [levels[k], levels[j]] = [levels[j], levels[k]];
        buildLevels(); render();
      };
      levelsEl.appendChild(el("div", { class: "pmd-level" }, [
        el("span", { class: "pmd-level-n" }, String(k + 1)),
        el("span", { class: "pmd-level-name" }, cols[ci].name),
        el("button", { class: "pmd-mini", type: "button", title: tr("เลื่อนออกนอก", "Move outward"),
          "aria-label": tr(`เลื่อน ${cols[ci].name} ออกนอก`, `Move ${cols[ci].name} outward`),
          disabled: k === 0 || null, onclick: () => move(-1) }, "↑"),
        el("button", { class: "pmd-mini", type: "button", title: tr("เลื่อนเข้าใน", "Move inward"),
          "aria-label": tr(`เลื่อน ${cols[ci].name} เข้าใน`, `Move ${cols[ci].name} inward`),
          disabled: k === levels.length - 1 || null, onclick: () => move(1) }, "↓"),
        el("button", { class: "pmd-mini danger", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr(`เอา ${cols[ci].name} ออกจากหัวแถว`, `Remove ${cols[ci].name} from the headers`),
          disabled: levels.length === 1 || null,
          onclick: () => { levels.splice(k, 1); buildLevels(); buildColumnPanel(); render(); } }, "×"),
      ]));
    });
    addSel.innerHTML = "";
    addSel.appendChild(el("option", { value: "" }, tr("เลือกคอลัมน์…", "Pick a column…")));
    cols.forEach((c, i) => {
      if (!levels.includes(i)) addSel.appendChild(el("option", { value: String(i) }, c.name));
    });
    /* ‼️ ชั้นในสุดคือตัวที่ ISINSCOPE ผูกอยู่ ต้องเห็นชัดว่าตัวไหน ไม่ให้เดา */
    const last = levelsEl.lastElementChild;
    if (last) last.classList.add("inner");
  }
  /* ‼️ ต้องเป็น function declaration ไม่ใช่ const arrow เพราะโค้ดก้อนนี้อยู่หลัง
     return ws.wrap ของ mount() ตัว const จึงไม่มีวันถูกสร้าง (Cannot access before
     initialization) ส่วน function declaration ถูกยกขึ้นไปทั้งตัวจึงเรียกได้
     บั๊กชนิดนี้เกิดซ้ำในโปรเจกต์นี้มาหลายครั้งแล้ว */
  function innerAnchor() { return cols[levels[levels.length - 1]]; }

  /* ── แผงเลือกฟิลด์ ────────────────────────────────────────────────── */
  function buildColumnPanel() {
    colsEl.innerHTML = "";
    for (const c of cols) {
      const box = el("input", { type: "checkbox" });
      box.checked = c.on;
      const typeSel = select(TYPE_IDS.map((t) => [t, FMT[t].label()]), c.type);
      const fmtInput = el("input", { type: "text", value: c.fmt || "",
        placeholder: tr("รูปแบบ เช่น #,0.00", "format, e.g. #,0.00") });
      const labelInput = el("input", { type: "text", value: c.label,
        placeholder: tr("ป้ายนำหน้า เช่น ลูกค้า: ", "prefix, e.g. Customer: ") });
      const row = el("div", { class: "pmd-col" + (c.on ? "" : " off") }, [
        el("label", { class: "pmd-col-head" }, [box, el("span", { class: "pmd-col-name" }, c.name)]),
        el("div", { class: "pmd-col-row" }, [typeSel, fmtInput]),
        el("div", { class: "pmd-col-row", style: "margin-top:6px" }, [labelInput]),
        el("div", { class: "pmd-seen" }, seenText(c)),
      ]);
      box.addEventListener("change", () => {
        c.on = box.checked; row.classList.toggle("off", !c.on); render();
      });
      typeSel.addEventListener("change", () => {
        c.type = typeSel.value;
        c.fmt = FMT[c.type].dax;
        fmtInput.value = c.fmt || "";
        fmtInput.disabled = c.type === "text" || c.type === "logical";
        render();
      });
      fmtInput.disabled = c.type === "text" || c.type === "logical";
      fmtInput.addEventListener("input", () => { c.fmt = fmtInput.value.trim() || null; render(); });
      labelInput.addEventListener("input", () => { c.label = labelInput.value; render(); });
      colsEl.appendChild(row);
    }
  }

  function seenText(c) {
    const eg = c.samples.length
      ? tr(`เช่น ${c.samples.join(", ")}`, `e.g. ${c.samples.join(", ")}`) : "";
    const bl = c.blanks
      ? tr(`  ว่าง ${c.blanks} แถว`, `  ${pl(c.blanks, "blank row", "blank rows")}`) : "";
    return eg + bl + (c.reason ? "  " + c.reason : "");
  }

  /* ── วาดผลลัพธ์ ───────────────────────────────────────────────────── */
  /* ฟิลด์ที่จะแสดง = ที่ติ๊กไว้ และไม่ใช่คอลัมน์หัวแถวชั้นไหนเลย (ไม่งั้นซ้ำกับหัวแถว) */
  function chosen() { return cols.filter((c, i) => c.on && !levels.includes(i)); }

  function render() {
    if (!table) return;
    const view = tabs.value;
    codeBox.hidden = view !== "dax";
    previewBox.hidden = view !== "preview";
    setupBox.hidden = view !== "setup";

    const picked = chosen();
    const msgs = [];
    const pickable = cols.length - 1;
    if (!picked.length) msgs.push(tr("ยังไม่ได้เลือกฟิลด์ที่จะแสดง ติ๊กอย่างน้อย 1 ช่องทางขวา",
                                     "No field picked yet, tick at least one on the right"));
    else if (picked.length < pickable)
      msgs.push(tr(`เลือกไว้ ${picked.length} จาก ${pickable} ฟิลด์ ติ๊กเพิ่มหรือเอาออกได้ทางขวา`,
                   `${picked.length} of ${pickable} fields picked, tick more or fewer on the right`));
    const risky = picked.filter((c) => RISKY.has(c.type));
    if (risky.length) {
      msgs.push(tr(
        `${risky.length} ฟิลด์ไม่ใช่ข้อความ แปลงให้แล้ว ถ้าไม่แปลง ยอด 0 กับค่า FALSE จะหายเงียบ ๆ เพราะ DAX มองว่าเท่ากับช่องว่าง`,
        `${risky.length} fields are not text, converted for you. Otherwise a zero or FALSE vanishes silently, DAX reads them as empty`));
    }
    warnEl.textContent = msgs.join("  ");
    warnEl.hidden = !msgs.length;

    if (view === "dax") {
      codeEl.innerHTML = picked.length
        ? paintCode(buildMeasure({
            measure: measureInput.value.trim() || "Details",
            table: tableInput.value.trim() || "Table",
            anchors: levels.map((i) => cols[i].name),
            cols: picked, strategy: strategySel.value,
            fieldSep: fieldSepSel.value, rowSep: rowSepSel.value,
          }), "dax")
        : "";
    } else if (view === "preview") {
      drawPreview(picked);
    } else {
      drawSetup();
    }
  }

  /* ตารางตัวอย่าง จำลองหน้าตา Matrix จริงจากข้อมูลในไฟล์
     ‼️ จับกลุ่มตามคอลัมน์หัวแถวจริง ๆ ไม่ใช่โชว์แถวดิบ ไม่งั้นพรีวิวไม่ตรงกับของจริง */
  function drawPreview(picked) {
    previewBox.innerHTML = "";
    /* ‼️ ต้องจับกลุ่มด้วยหัวแถว "ครบทุกชั้น" ไม่ใช่ชั้นในสุดอย่างเดียว
       เคสที่พี่ปอนด์ทัก 11/09/2026: คอลัมน์รหัสซ้ำได้หลายแถวและข้ามเอกสาร
       ถ้าจับกลุ่มด้วยรหัสอย่างเดียว รายการของคนละใบจะถูกเอามากองรวมกัน
       ซึ่งไม่ตรงกับ Matrix จริงที่แยกตามลำดับชั้นที่ลากลงช่อง Rows */
    const groups = new Map();          // "ชั้น1\u0000ชั้น2" → { keys, rows }
    for (const r of table.rows) {
      const keys = levels.map((i) => cellText(r[i]).trim());
      if (keys.every((k) => k === "")) continue;
      const k = keys.join("\u0000");
      if (!groups.has(k)) groups.set(k, { keys, rows: [] });
      groups.get(k).rows.push(r);
    }
    const sep = rowSepSel.value === "newline" ? "\n" : rowSepSel.value;
    const rows = [...groups.values()].slice(0, 12).map((g) => [g.keys, g.rows]);
    previewBox.appendChild(el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        ...levels.map((i) => el("th", {}, cols[i].name)),
        el("th", {}, measureInput.value.trim() || "Details"),
      ])]),
      el("tbody", {}, rows.map(([keys, rs]) => el("tr", {}, [
        ...keys.map((k) => el("td", { class: "anchor" }, k)),
        el("td", { class: "detail" }, previewCell(rs, picked, fieldSepSel.value, sep, strategySel.value).text),
      ]))),
    ]));
    /* ‼️ เตือนเคสรหัสซ้ำข้ามกลุ่ม ซึ่งเป็นอาการที่บอกว่าหัวแถวยังไม่พอ
       ถ้าค่าของชั้นในสุดโผล่ในหลายกลุ่ม แปลว่าลำพังชั้นนี้ระบุแถวไม่ได้จริง */
    if (levels.length) {
      const innerVals = new Map();
      for (const g of groups.values()) {
        const v = g.keys[g.keys.length - 1];
        innerVals.set(v, (innerVals.get(v) || 0) + 1);
      }
      const repeated = [...innerVals.entries()].filter(([, n]) => n > 1);
      if (repeated.length) {
        previewBox.appendChild(el("div", { class: "pmd-warn", style: "margin:10px" },
          tr(`${repeated.length} ค่าของ ${innerAnchor().name} โผล่หลายกลุ่ม ลำพังชั้นนี้ระบุรายการไม่ได้ เพิ่มชั้นหัวแถวให้ครบ ไม่งั้นคนละรายการจะปนกัน`,
             `${repeated.length} values of ${innerAnchor().name} span several groups, so this level alone cannot identify a record. Add the other header levels`)));
      }
    }
    /* ‼️ เคสที่เจอจริงกับใบเสนอราคา: เลือกฟิลด์ระดับ "หัวเอกสาร" (วันที่ ชื่อลูกค้า)
       แล้วใช้วิธีไล่ทีละแถว ทุกบรรทัดจึงออกมาเหมือนกันเป๊ะตามจำนวนรายการสินค้า
       ไม่ใช่บั๊ก แต่ไม่ใช่สิ่งที่คนตั้งใจ ต้องบอกทางออกให้ ไม่ปล่อยให้งงเอง */
    const dup = rows.filter(([, rs]) => {
      if (rs.length < 2) return false;
      const lines = rs.map((r) => previewCell([r], picked, fieldSepSel.value, sep, "rows").text);
      return new Set(lines).size === 1;
    }).length;
    if (dup && strategySel.value === "rows") {
      previewBox.appendChild(el("div", { class: "pmd-warn", style: "margin:10px" },
        tr(`${dup} กลุ่มมีบรรทัดซ้ำกันหมด เพราะฟิลด์ที่เลือกอยู่ระดับหัวเอกสาร ลองใช้ SUMMARIZE หรือเลือกฟิลด์ระดับรายการ`,
           `${dup} groups repeat the same line, because the picked fields sit at document level. Try SUMMARIZE, or pick line-level fields`)));
    }
    /* ‼️ วิธี "ค่าที่ไม่ซ้ำของแต่ละฟิลด์" ใช้ VALUES ซึ่งต้องมีค่าเดียวต่อกลุ่ม
       ถ้ากลุ่มไหนมีหลายค่า ของจริงใน Power BI จะขึ้น error ไม่ใช่แค่แสดงเพี้ยน
       ตรวจจากข้อมูลจริงในไฟล์แล้วบอกชื่อฟิลด์ที่จะทำให้พัง */
    if (strategySel.value === "values") {
      const bad = new Set();
      for (const [, rs] of rows) for (const n of previewCell(rs, picked, fieldSepSel.value, sep, "values").multi) bad.add(n);
      if (bad.size) {
        previewBox.appendChild(el("div", { class: "pmd-warn", style: "margin:10px" },
          tr(`ฟิลด์ ${[...bad].join(", ")} มีหลายค่าในกลุ่มเดียว วิธีนี้จะขึ้น error ใน Power BI ให้ใช้ไล่ทีละแถวหรือ SUMMARIZE`,
             `${[...bad].join(", ")} hold several values in one group, which errors in Power BI. Use row iteration or SUMMARIZE`)));
      }
    }
    /* ‼️ ไฟล์ไทยมักเก็บวันที่เป็น พ.ศ. ส่วนโมเดลที่ประกาศชนิดเป็นวันที่จริงจะเป็น ค.ศ.
       พรีวิวซื่อตรงกับไฟล์ไว้ก่อน แล้วบอกให้รู้ว่าของจริงอาจต่างตรงไหน ดีกว่าแอบแปลงให้ */
    const beCols = picked.filter((c) => (c.type === "date" || c.type === "datetime") &&
      table.rows.some((r) => { const q = parseAnyDate(cellText(r[c.idx])); return q && q.y > 2400; }));
    if (beCols.length) {
      previewBox.appendChild(el("div", { class: "pmd-warn", style: "margin:10px" },
        tr(`วันที่ในไฟล์เป็น พ.ศ. พรีวิวจึงแสดงตามไฟล์ ถ้าโมเดลเก็บเป็นชนิดวันที่จริง จะได้ ค.ศ.`,
           `Dates here use the Buddhist era, shown as-is. A real Date column in your model shows the Gregorian year`)));
    }
    if (groups.size > rows.length) {
      previewBox.appendChild(el("div", { class: "pmd-seen", style: "padding:8px 10px" },
        tr(`แสดง ${rows.length} จาก ${groups.size} กลุ่ม`,
           `Showing ${rows.length} of ${pl(groups.size, "group", "groups")}`)));
    }
  }

  function drawSetup() {
    setupBox.innerHTML = "";
    const a = innerAnchor();
    const m = measureInput.value.trim() || "Details";
    setupBox.appendChild(el("ol", { class: "pmd-steps" }, [
      el("li", {}, tr(`ใส่กราฟ Matrix แล้วลากคอลัมน์ ${a.name} ลงช่อง Rows`,
                      `Add a Matrix visual and drop ${a.name} into the Rows box`)),
      el("li", {}, tr(`สร้าง measure ชื่อ ${m} ด้วยสูตรจากแท็บซ้าย แล้วลากลงช่อง Values`,
                      `Create a measure named ${m} with the code from the first tab, then drop it into Values`)),
      el("li", {}, tr("เปิด Format แล้วปิด Stepped layout ในหัวข้อ Row headers หัวแถวจะได้แยกเป็นคอลัมน์ของตัวเอง",
                      "Open Format and turn Stepped layout off under Row headers so each level gets its own column")),
      el("li", {}, tr("ในหัวข้อ Values เปิด Word wrap ไม่งั้นข้อความยาวจะถูกตัดหายไปเหลือจุดสามจุด",
                      "Under Values turn Word wrap on, otherwise long text is cut off to an ellipsis")),
      el("li", {}, tr("ลากขอบคอลัมน์รายละเอียดให้กว้างพอ แล้วตั้ง Row padding ให้สูงขึ้นหน่อยจะอ่านง่ายกว่า",
                      "Widen the details column and raise Row padding a little, it reads much better")),
      el("li", {}, tr("หัวแถวทางซ้ายจะอยู่กับที่เองเมื่อเลื่อนแนวนอน ไม่ต้องตั้งค่าอะไรเพิ่ม",
                      "The row headers stay in place when you scroll sideways, nothing extra to set")),
    ]));
    setupBox.appendChild(el("div", { class: "pmd-warn", style: "margin:14px 0 0" },
      tr("measure นี้คืนค่าเป็นข้อความ ใช้กับกราฟที่ต้องการตัวเลขไม่ได้ และเรียงตามตัวอักษร",
         "This measure returns text, so charts that need numbers cannot use it, and it sorts alphabetically")));
  }

  function currentCode() {
    const picked = chosen();
    if (!picked.length) return "";
    return buildMeasure({
      measure: measureInput.value.trim() || "Details",
      table: tableInput.value.trim() || "Table",
      anchors: levels.map((i) => cols[i].name),
      cols: picked, strategy: strategySel.value,
      fieldSep: fieldSepSel.value, rowSep: rowSepSel.value,
    });
  }

  async function onCopy() {
    const code = currentCode();
    if (!code) { st.err(tr("ยังไม่มีสูตรให้คัดลอก เลือกฟิลด์ก่อน", "Nothing to copy yet, pick a field first")); return; }
    try {
      await navigator.clipboard.writeText(code);
      st.ok(tr("คัดลอกแล้ว เอาไปวางในช่องสูตรของ measure ได้เลย",
               "Copied, paste it into the measure formula bar"));
    } catch {
      st.err(tr("คัดลอกไม่สำเร็จ ลองเลือกข้อความในกล่องแล้วกด Ctrl+C",
                "Couldn't copy, select the text in the box and press Ctrl+C instead"));
    }
  }

  function onDownload() {
    const code = currentCode();
    if (!code) { st.err(tr("ยังไม่มีสูตรให้ดาวน์โหลด", "Nothing to download yet")); return; }
    const name = (measureInput.value.trim() || "Details").replace(/[\\/:*?"<>|]/g, "-") + ".dax";
    download(new Blob([code], { type: "text/plain;charset=utf-8" }), name);
    st.ok(tr("ดาวน์โหลดแล้ว", "Downloaded"));
  }
}
