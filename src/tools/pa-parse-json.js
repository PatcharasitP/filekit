import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, dropzone, download } from "../ui.js";
import { tr } from "../i18n.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, sheetToTable, cellText } from "../sheetpick.js";

/* ‼️ ทำไมต้องมีเครื่องมือนี้
 * Power Automate ให้ "Generate from sample" ก็จริง แต่มันเดาชนิดจากตัวอย่างที่วางไปเท่านั้น
 * ช่องไหนที่ตัวอย่างบังเอิญไม่มีค่าว่าง มันจะออกมาเป็น "type": "string" เฉย ๆ
 * พอ flow วิ่งจริงแล้วเจอค่าว่างสักแถว Parse JSON จะพังทั้ง run พร้อมข้อความที่อ่านไม่รู้เรื่อง
 * เครื่องนี้อ่านทั้งคอลัมน์ก่อนตัดสิน ช่องไหนมีค่าว่างจริงจะออกมาเป็น ["string","null"] ให้เลย
 * และ required จะเหลือเฉพาะช่องที่ไม่เคยว่าง ซึ่งเป็นสิ่งที่ generate-from-sample ทำให้ไม่ได้
 */

const TYPES = ["string", "integer", "number", "boolean"];

// ‼️ สไตล์ฝังในโมดูลตัวเอง ห้ามแก้ assets/css/tool.css
const STYLE = `
.paj-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(60vh,560px)}
.paj-code code{font-size:12.5px;line-height:1.65;color:var(--text);white-space:pre}
.paj-tabs{margin-bottom:12px}
.paj-cols{display:flex;flex-direction:column;gap:8px}
.paj-col{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px}
.paj-col-name{font-weight:700;font-size:13px;color:var(--text);word-break:break-word;margin-bottom:6px}
.paj-col-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
/* ‼️ วัดบนจอ 390x844 จริง: select สูง 19px และ label 'ว่างได้' สูง 21.9px ทั้งคู่เล็กกว่าเกณฑ์
   นิ้วแตะ 36px ของ WCAG/Apple/Google · ตารางหลายคอลัมน์ = ซ้ำกันทุกแถวจนตกรวม 69 จุด
   (จับได้จาก tests/browser_mobile.py ข้อ ④) · ขยายเฉพาะแนวตั้ง ไม่ขยับเลย์เอาต์แนวนอน */
.paj-col-row select{flex:1;min-width:120px;min-height:36px}
.paj-null{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-mute);
  white-space:nowrap;min-height:36px}
.paj-null input[type="checkbox"]{width:18px;height:18px;flex:none}
.paj-seen{font-size:12px;color:var(--text-mute);margin-top:5px;line-height:1.6}
.paj-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}
.paj-steps{font-size:12.5px;color:var(--text-mute);line-height:1.8;margin:0;padding-left:18px}

/* ‼️ คลาสสองชุดนี้ยืมชื่อมาจากเครื่องมือกราฟโดนัท แต่ CSS ของมันฝังอยู่ในโมดูลนั้น
   หน้านี้ไม่ได้โหลดโมดูลนั้น จึงต้องประกาศเองซ้ำ ไม่งั้นสวิตช์กลายเป็นช่องติ๊กเปล่า
   (เจอจริงตอนดูจอ 11/09/2026) กฎของโปรเจกต์คือสไตล์อยู่ในโมดูลตัวเอง ห้ามไปแก้ tool.css */
.pbid-group-title{margin:0 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
.pbid-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pbid-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pbid-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pbid-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pbid-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pbid-switch input:checked + .pbid-switch-track{background:var(--g-powerbi,var(--brand))}
.pbid-switch input:checked + .pbid-switch-track::after{transform:translateX(18px)}
.pbid-switch input:focus-visible + .pbid-switch-track{outline:2px solid var(--brand);outline-offset:2px}
/* ‼️ สวิตช์สูง 24px เตี้ยกว่าเกณฑ์นิ้วแตะ 36px — ยืดกรอบที่กดได้เป็น 36 แต่คงรางสูง 24 เท่าเดิม
   โดยดันขอบบนล่างเข้ามา 6px (ทับ inset:0 ของราง) หน้าตาจึงไม่เปลี่ยน แค่กดโดนง่ายขึ้น */
@media (pointer:coarse){
  .pbid-switch{height:36px}
  .pbid-switch-track{top:6px;bottom:6px}
}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  let wb = null;
  let table = null;          // { header, rows }
  let cols = [];             // [{ name, type, nullable, blanks, samples }]
  let sampleCount = 3;

  const sheetSel = select([["0", "-"]], "0");
  const sheetField = field(tr("ชีต", "Sheet"), sheetSel);
  sheetField.hidden = true;

  const rowsSel = select([["3", "3"], ["5", "5"], ["10", "10"], ["all", tr("ทุกแถว", "All rows")]], "3");
  const colsEl = el("div", { class: "paj-cols" });
  const rightBody = el("div", {}, [
    field(tr("จำนวนแถวใน JSON ตัวอย่าง", "Rows in the sample JSON"), rowsSel,
      tr("Schema ใช้ทั้งคอลัมน์เสมอ ไม่ได้ดูแค่แถวตัวอย่าง", "The schema always reads the whole column, not just the sample rows")),
    el("h3", { class: "pbid-group-title", style: "margin:16px 0 8px" }, tr("ชนิดของแต่ละคอลัมน์", "Type of each column")),
    colsEl,
  ]);

  const tabs = segmented([
    ["schema", tr("Schema สำหรับ Parse JSON", "Schema for Parse JSON")],
    ["json", tr("JSON ตัวอย่าง", "Sample JSON")],
  ], "schema");
  tabs.classList.add("paj-tabs");

  const warnEl = el("div", { class: "paj-warn", hidden: true });
  const codeEl = el("code", {});
  const centerNode = el("div", {}, [tabs, warnEl, el("pre", { class: "paj-code" }, [codeEl])]);

  const dz = dropzone({
    accept: ".xlsx,.xlsm,.xls,.csv,.txt", multiple: false,
    expect: ["xlsx", "xls", "xlsm", "csv", "txt"],
    expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("เปิดไฟล์ที่มีหัวตารางแถวบนสุด", "Open a file whose top row is the header"),
    onChange: onFiles,
  });

  const copyBtn = button(tr("คัดลอก", "Copy"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .json", "Download .json"), { icon: "download", ghost: true, onclick: onDownload });

  const ws = workspace(tool, {
    left: {
      title: tr("ไฟล์ต้นทาง", "Source file"),
      node: el("div", {}, [dz.container, sheetField]),
      hint: tr("อ่านจากไฟล์ในเครื่องคุณเอง ไม่ได้ส่งขึ้นเซิร์ฟเวอร์", "Read straight from your own machine, nothing is uploaded"),
    },
    center: {
      title: tr("โค้ดที่ได้", "Generated code"), node: centerNode,
      empty: tr("เปิดไฟล์ Excel หรือ CSV เพื่อสร้าง schema", "Open an Excel or CSV file to build the schema"),
    },
    right: { title: tr("ปรับแต่ง", "Customize"), node: rightBody },
    footer: [copyBtn, dlBtn, st.node],
    note: tr(
      "เพิ่มแอ็กชัน Parse JSON ชี้ช่อง Content ไปที่ข้อมูลของคุณ แล้ววางโค้ดนี้ลงช่อง Schema",
      "How to use it: in Power Automate add a Parse JSON action, point Content at your data, then paste the code from here straight into the Schema box"
    ),
  });
  ws.wrap.prepend(styleEl);

  tabs.addEventListener("change", render);
  rowsSel.addEventListener("change", () => {
    sampleCount = rowsSel.value === "all" ? Infinity : Number(rowsSel.value);
    render();
  });
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
      pickSheet(names[0]);
      st.ok(res.encNote || tr("อ่านไฟล์แล้ว", "File loaded"));
    } catch (e) {
      console.error(e);
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Couldn't read the file: ") + e.message);
    }
  }

  function pickSheet(name) {
    table = sheetToTable(wb.Sheets[name]);
    if (!table.header.length) {
      st.err(tr("ชีตนี้ว่างเปล่า", "This sheet is empty"));
      return;
    }
    cols = table.header.map((h, i) => inspectColumn(h, i));
    buildColumnPanel();
    ws.showCanvas(true);
    render();
  }

  /* ── ดูทั้งคอลัมน์แล้วสรุปว่าเป็นชนิดอะไร และเคยว่างไหม ───────────── */
  function inspectColumn(header, idx) {
    let blanks = 0, numeric = 0, integral = 0, bool = 0, filled = 0;
    const samples = [];
    for (const r of table.rows) {
      const raw = r[idx];
      const t = cellText(raw).trim();
      if (t === "") { blanks++; continue; }
      filled++;
      if (samples.length < 3) samples.push(t);
      const n = toNumber(raw);
      if (n !== null) { numeric++; if (Number.isInteger(n)) integral++; }
      if (/^(true|false)$/i.test(t)) bool++;
    }
    let type = "string";
    if (filled > 0 && bool === filled) type = "boolean";
    else if (filled > 0 && numeric === filled) type = integral === filled ? "integer" : "number";
    return {
      name: String(header || tr(`คอลัมน์ ${idx + 1}`, `Column ${idx + 1}`)),
      idx, type, nullable: blanks > 0, blanks, filled, samples,
    };
  }

  function toNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const t = cellText(v).replace(/[,\s ]/g, "");
    if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /* ── แผงขวา: ชนิดของแต่ละคอลัมน์ ─────────────────────────────────── */
  function buildColumnPanel() {
    colsEl.innerHTML = "";
    for (const c of cols) {
      const typeSel = select(TYPES.map((t) => [t, t]), c.type);
      typeSel.addEventListener("change", () => { c.type = typeSel.value; render(); });

      const nullBox = el("input", { type: "checkbox" });
      nullBox.checked = c.nullable;
      nullBox.addEventListener("change", () => { c.nullable = nullBox.checked; render(); });

      const seen = c.blanks
        ? tr(`ว่าง ${c.blanks} แถวจาก ${c.blanks + c.filled}`, `${c.blanks} blank of ${c.blanks + c.filled} rows`)
        : tr(`มีค่าครบทุกแถว (${c.filled})`, `every row has a value (${c.filled})`);
      const eg = c.samples.length ? tr(` เช่น ${c.samples.join(", ")}`, ` e.g. ${c.samples.join(", ")}`) : "";

      colsEl.appendChild(el("div", { class: "paj-col" }, [
        el("div", { class: "paj-col-name" }, c.name),
        el("div", { class: "paj-col-row" }, [
          typeSel,
          el("label", { class: "paj-null" }, [nullBox, el("span", {}, tr("ว่างได้", "Allow null"))]),
        ]),
        el("div", { class: "paj-seen" }, seen + eg),
      ]));
    }
  }

  /* ── สร้างโค้ด ────────────────────────────────────────────────────── */
  function buildSchema() {
    const properties = {};
    const required = [];
    for (const c of cols) {
      properties[c.name] = { type: c.nullable ? [c.type, "null"] : c.type };
      if (!c.nullable) required.push(c.name);
    }
    return { type: "array", items: { type: "object", properties, required } };
  }

  function buildSample() {
    const out = [];
    for (const r of table.rows) {
      if (out.length >= sampleCount) break;
      const obj = {};
      for (const c of cols) obj[c.name] = castValue(r[c.idx], c);
      out.push(obj);
    }
    return out;
  }

  function castValue(raw, c) {
    const t = cellText(raw).trim();
    if (t === "") return null;
    if (c.type === "integer" || c.type === "number") {
      const n = toNumber(raw);
      if (n === null) return t;
      return c.type === "integer" ? Math.round(n) : n;
    }
    if (c.type === "boolean") {
      if (/^true$/i.test(t)) return true;
      if (/^false$/i.test(t)) return false;
      return t;
    }
    return t;
  }

  function render() {
    if (!table) return;
    const data = tabs.value === "json" ? buildSample() : buildSchema();
    codeEl.textContent = JSON.stringify(data, null, 4);
    showWarnings();
  }

  /* ‼️ 2 กับดักที่ทำให้ flow พังแบบหาสาเหตุยากมาก จับให้เห็นตั้งแต่ตอนนี้
   * ① ชื่อคอลัมน์มีเว้นวรรคหัวท้าย มองด้วยตาไม่เห็น แต่ชื่อคีย์ใน JSON จะไม่ตรงกับที่พิมพ์ตามใน expression
   * ② คอลัมน์ที่ยอมให้ว่างได้ ถ้าไม่ประกาศ null ไว้ Parse JSON จะพังตอนเจอแถวว่างแถวแรก */
  function showWarnings() {
    const msgs = [];
    const spaced = cols.filter((c) => c.name !== c.name.trim());
    if (spaced.length) {
      msgs.push(tr(
        `ชื่อคอลัมน์ ${spaced.length} ช่องมีเว้นวรรคหัวหรือท้าย ตามองไม่เห็น แต่คีย์จะไม่ตรงกับที่พิมพ์ใน expression`,
        `${spaced.length} column names have a leading or trailing space, invisible to the eye but the key will not match what you type in an expression`
      ));
    }
    const nulls = cols.filter((c) => c.nullable).length;
    if (nulls) {
      msgs.push(tr(
        `${nulls} คอลัมน์เคยว่างจริงในไฟล์นี้ จึงประกาศ null ไว้ให้ ถ้าเอาออก flow จะพังตอนเจอแถวว่าง`,
        `${nulls} columns really do have blanks in this file, so they are declared nullable. Remove that and the flow breaks on the first blank row`
      ));
    }
    warnEl.hidden = msgs.length === 0;
    warnEl.textContent = msgs.join("  ");
  }

  /* ── ปุ่มล่าง ─────────────────────────────────────────────────────── */
  async function onCopy() {
    if (!table) return;
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      st.ok(tr("คัดลอกแล้ว วางในช่อง Schema ได้เลย", "Copied, paste it into the Schema box"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    if (!table) return;
    const name = tabs.value === "json" ? "sample.json" : "parse-json-schema.json";
    download(new Blob([codeEl.textContent], { type: "application/json;charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }
}
