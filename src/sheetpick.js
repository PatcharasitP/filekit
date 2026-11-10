// ─────────────────────────────────────────────────────────────────────────────
// โครงร่วมของเครื่องมือที่ทำงาน "ทีละคอลัมน์"บนไฟล์ Excel/CSV
// เครื่องมือลูกบอกแค่ 2 อย่าง: มีตัวเลือกอะไร และแปลงค่าหนึ่งช่องยังไง
// ที่เหลือ (เลือกชีท เลือกคอลัมน์ พรีวิว สรุปผล ดาวน์โหลด) ไฟล์นี้จัดการให้หมด
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { toolShell, statusBar, button, field, select, dropzone,
         download, stripExt, yieldToBrowser } from "./ui.js";
import { smartDecode, ENC_LABEL } from "./thai.js";
import { tr, pl } from "./i18n.js";
import { assertSheetBytes } from "./filetype.js";
import { readXlsx } from "./xlsxutil.js";

const TEXTY = ["csv", "txt", "tsv"];

/* ‼️ SheetJS แปลงเลขวันที่ของ Excel โดยอิงจุดเริ่ม 30/12/1899 "ตามเขตเวลาของเครื่องผู้ใช้"
 * ประเทศไทยก่อนปี 2463 ใช้เวลาท้องถิ่น +06:42:04 ซึ่งไม่ลงตัวเป็นนาที
 * JavaScript ปัดเศษวินาทีทิ้งจากค่า offset ทุกวันที่ที่อ่านจาก .xlsx จึงเพี้ยนไป 4 วินาที
 * วันที่ล้วนกลายเป็น 23:59:56 ของ "วันก่อนหน้า" พอเอาไปแสดงผลจะได้วันผิดไป 1 วันทั้งไฟล์
 *
 * พิสูจน์แล้ว 09/09/2026: เซลล์วันที่ 1 ก.ย. 2026 อ่านได้เป็น 31 ส.ค. 2026 เวลา 23:59:56
 * ในเครื่องเขตเวลาไทย แต่ถ้าตั้งเครื่องเป็น UTC อ่านได้ 1 ก.ย. 2026 00:00:00 ถูกต้อง
 * (new Date(1899,11,30) ในเครื่องนี้คืน 1899-12-29T17:17:56Z คือ +06:42:04 ไม่ใช่ +07:00)
 *
 * แก้โดยดึงค่ากลับเข้าเส้นนาทีเมื่อห่างไม่เกิน 6 วินาที ซึ่งครอบคลุมความคลาดเคลื่อนนี้พอดี
 * และไม่ไปแตะเวลาที่มีวินาทีจริงเป็นเรื่องเป็นราว (เช่น 10:30:12 ห่างเส้นนาที 12 วินาที ไม่ถูกแตะ) */
const SKEW_TOLERANCE_MS = 6000;

export function fixExcelDateSkew(wb) {
  for (const name of wb.SheetNames || []) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    for (const addr of Object.keys(ws)) {
      if (addr[0] === "!") continue;               // !ref, !merges ฯลฯ ไม่ใช่เซลล์
      const cell = ws[addr];
      if (!cell || cell.t !== "d" || !(cell.v instanceof Date)) continue;
      const ms = cell.v.getTime();
      if (!Number.isFinite(ms)) continue;
      const off = ((ms % 60000) + 60000) % 60000;  // ห่างจากเส้นนาทีก่อนหน้ากี่มิลลิวินาที
      const delta = off <= SKEW_TOLERANCE_MS ? -off
        : (60000 - off <= SKEW_TOLERANCE_MS ? 60000 - off : 0);
      if (delta) cell.v = new Date(ms + delta);
    }
  }
  return wb;
}

/** อ่านไฟล์เป็นสมุดงาน — ไฟล์ข้อความจะเดาการเข้ารหัสให้เองด้วย (ไทยเพี้ยนก็อ่านออก) */
export async function readWorkbook(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  assertSheetBytes(buf, file); // ด่านหัวไฟล์ PDF หรือรูปที่เปลี่ยนนามสกุลเป็นตาราง (filetype.js assertSheetBytes 09/11/2026)
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!TEXTY.includes(ext)) {
    const opts = { type: "array", cellDates: true };
    return { wb: fixExcelDateSkew(await readXlsx(buf, opts)), encNote: null };
  }

  const d = smartDecode(buf);
  let encNote = null;
  if (d.undo) encNote = tr("ไฟล์นี้ไทยเพี้ยนซ้อน ซ่อมให้แล้ว", "Thai text was double-garbled, fixed automatically");
  else if (d.enc !== "utf-8") encNote = tr(`เข้ารหัส ${ENC_LABEL[d.enc] || d.enc} แปลงแล้ว`, `${ENC_LABEL[d.enc] || d.enc} encoding, converted`);
  const opts = { type: "string", cellDates: true };
  return { wb: fixExcelDateSkew(await readXlsx(d.text, opts)), encNote };
}

/* ‼️ ตารางจริงจำนวนมากใช้หัวตาราง 2 ชั้น แถวบนผสานช่องเป็นชื่อหมวด แถวล่างเป็นชื่อคอลัมน์ย่อย
 * ช่องที่ถูกผสานจะมีค่าเฉพาะช่องซ้ายสุด ที่เหลือเป็นค่าว่าง หัวตารางจึงกลายเป็น "คอลัมน์ 2"
 * "คอลัมน์ 4" ซึ่งผู้ใช้อ่านไม่ออกว่าคอลัมน์ไหนคืออะไร แล้วเลือกคอลัมน์ผิดได้ง่าย
 * (ยิงจริง 09/09/2026 กับไฟล์หัว 2 ชั้น ตัวเลือกคอลัมน์อ่านไม่รู้เรื่องครึ่งหนึ่ง)
 *
 * รวมสองแถวเป็นชื่อเดียวเฉพาะเมื่อเข้าเงื่อนไขครบ กันกินแถวข้อมูลแถวแรกไปเป็นหัวตาราง:
 *   1. แถวบนมีช่องว่างจริง และแถวล่างเติมช่องว่างเหล่านั้นได้ครบทุกช่อง
 *   2. แถวล่างหน้าตาเป็นหัวตาราง คือเป็นข้อความล้วน ไม่มีตัวเลขหรือวันที่ปน
 *   3. ต้องมีแถวข้อมูลเหลืออย่างน้อย 1 แถวหลังตัดหัวออก
 * และถ้าแถวบนมีค่าอยู่ช่องเดียว แปลว่าเป็น "แถวชื่อเรื่อง" ไม่ใช่ชื่อหมวด ให้ใช้แถวล่างเป็นหัวอย่างเดียว */
export function sheetToTable(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
  if (!aoa.length) return { header: [], rows: [] };
  const width = Math.max(...aoa.map((r) => r.length));
  const cell = (r, i) => {
    const v = r ? r[i] : null;
    return v == null || String(v).trim() === "" ? "" : String(v).trim();
  };
  const filledCount = (r) => {
    let n = 0;
    for (let i = 0; i < width; i++) if (cell(r, i)) n++;
    return n;
  };
  const textOnly = (r) => {
    for (let i = 0; i < width; i++) {
      const v = r ? r[i] : null;
      if (v == null || String(v).trim() === "") continue;
      if (typeof v === "number" || v instanceof Date) return false;
      if (/^-?[\d,]+(\.\d+)?%?$/.test(String(v).trim())) return false;
    }
    return filledCount(r) > 0;
  };

  let headRows = 1;
  let useGroupRow = false;
  if (aoa.length > 2) {
    const blanks = [];
    for (let i = 0; i < width; i++) if (!cell(aoa[0], i)) blanks.push(i);
    const covered = blanks.filter((i) => cell(aoa[1], i)).length;
    if (blanks.length && covered === blanks.length && textOnly(aoa[1])) {
      headRows = 2;
      useGroupRow = filledCount(aoa[0]) > 1;   // ช่องเดียว = แถวชื่อเรื่อง ไม่ใช่ชื่อหมวด
    }
  }

  const header = [];
  for (let i = 0; i < width; i++) {
    let top = useGroupRow ? cell(aoa[0], i) : "";
    if (useGroupRow && !top) {
      // ช่องที่ถูกผสานมีค่าเฉพาะช่องซ้ายสุด ต้องลากชื่อหมวดมาจากช่องซ้ายที่ใกล้ที่สุด
      for (let j = i - 1; j >= 0; j--) {
        const v = cell(aoa[0], j);
        if (v) { top = v; break; }
      }
    }
    const sub = headRows === 2 ? cell(aoa[1], i) : cell(aoa[0], i);
    const name = [top, sub].filter(Boolean).join(" ");
    header.push(name || tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`));
  }

  const rows = aoa.slice(headRows).map((r) => {
    const c = r.slice(0, width);
    while (c.length < width) c.push(null);
    return c;
  });
  return { header, rows };
}

export function autoWidths(header, rows, max = 46) {
  const txt = (v) => (v == null ? "" : v instanceof Date ? "0000-00-00" : String(v));
  return header.map((h, c) => {
    let n = txt(h).length;
    for (const r of rows) n = Math.max(n, txt(r[c]).length);
    return { wch: Math.min(max, Math.max(8, n + 2)) };
  });
}

export function tableToBlob(header, rows, sheetName = "Sheet1") {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws["!cols"] = autoWidths(header, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName).replace(/[[\]*?/\\:]/g, "-").slice(0, 31) || "Sheet1");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true })],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** สมุดงานหลายชีตในไฟล์เดียว — sheets = [[ชื่อชีต, { header, rows }], ...]
 *  ‼️ งานที่ต้องส่งต่อเข้า Power BI มักต้องการหลายตารางในไฟล์เดียว (ตารางหลัก, ตารางรูปทรง, ตารางเส้นทาง)
 *     ถ้าแยกเป็นหลายไฟล์ ผู้ใช้ต้องมานั่งต่อเองใน Power Query ทุกครั้ง */
export function tablesToBlob(sheets) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const [rawName, t] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([t.header, ...t.rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
    ws["!cols"] = autoWidths(t.header, t.rows);
    let name = String(rawName).replace(/[[\]*?/\\:]/g, "-").slice(0, 31) || "Sheet";
    let i = 2;
    while (used.has(name)) name = name.slice(0, 28) + "_" + i++;      // ชื่อชีตซ้ำ = ไฟล์เปิดไม่ขึ้น
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true })],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export const cellText = (v) =>
  v == null ? "" : v instanceof Date
    ? `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`
    : String(v);

/**
 * cfg = {
 *   accept, hint, expect, expectLabel, note,
 *   options(refresh) -> { node, read() }   ตัวเลือกเฉพาะเครื่องมือ
 *   convert(value, opts) -> null (ข้ามเพราะว่าง) | {ok:true, value} | {ok:false, reason}
 *   outName(opts, srcName) -> ชื่อคอลัมน์ผลลัพธ์
 *
 *   ‼️ รองรับผลหลายคอลัมน์: ถ้า outName คืน "อาร์เรย์ของชื่อ" แทนสตริงเดี่ยว
 *      convert ต้องคืน value เป็นอาร์เรย์ความยาวเท่ากัน (เช่น แยกที่อยู่เป็น 4 ช่อง)
 *      โหมด "เขียนทับ" จะถูกปิดอัตโนมัติ เพราะเขียนทับ 1 ช่องด้วย 4 ค่าไม่ได้
 *   suffix -> ต่อท้ายชื่อไฟล์ที่ดาวน์โหลด
 * }
 */
const COLTOOL_SAMPLE = "samples/ตัวอย่าง-ข้อมูลลูกค้า.xlsx"; // มีชื่อ เลขผู้เสียภาษี ที่อยู่ วันที่ ยอดเงิน ครบทั้ง 5 เครื่องมือ

export function columnTool(tool, cfg) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();

  let table = null, sheetNames = [], wb = null, encNote = null;

  const sheetSel = select([["0", "-"]], "0");
  const colSel = select([["0", "-"]], "0");
  const modeSel = select([["add", tr("เพิ่มคอลัมน์ใหม่ (เก็บของเดิม)", "Add new column (keeps original)")],
                          ["replace", tr("เขียนทับคอลัมน์เดิม", "Overwrite original")]], "add");
  const sheetField = field(tr("ชีท", "Sheet"), sheetSel);
  const colField = field(tr("คอลัมน์ที่จะแปลง", "Column to convert"), colSel);
  const modeField = field(tr("ผลลัพธ์", "Result"), modeSel);
  const opts = cfg.options ? cfg.options(refresh) : { node: null, read: () => ({}) };

  const chips = el("div", { class: "stats" });
  const preview = el("div", { class: "xt-wrap" });
  const modeRow = el("div", { class: "row" }, [modeField]);
  const panel = el("div", { class: "panel", hidden: true }, [
    el("div", { class: "row" }, [sheetField, colField]),
    ...(opts.node ? [opts.node] : []),
    modeRow,
    chips, preview,
  ]);

  // ‼️ ตระกูลนี้ต้องมีไฟล์ตัวอย่างของตัวเอง ตัวอย่างกลาง (ข้อมูลใบเสนอราคา) ไม่มีคอลัมน์ที่อยู่ ไม่มีเลขบัตร
  //    ไล่กดเว็บจริง 07/11/2026 แยกที่อยู่ได้ 0 จาก 5 , ตรวจเลขบัตรเลือกคอลัมน์ ภาษี , คำอ่านตัวเลขเลือกคอลัมน์วันที่ (tests/browser_coltool_samples.py)
  const dz = dropzone({
    accept: cfg.accept, multiple: false, expect: cfg.expect, expectLabel: cfg.expectLabel,
    hint: cfg.hint, onChange: load,
    samples: cfg.samples || [[COLTOOL_SAMPLE, "ข้อมูลลูกค้าตัวอย่าง (Excel)", "Sample customer data (Excel)"]],
  });
  const goX = button(tr("ดาวน์โหลดเป็น Excel", "Download as Excel"), { icon: "download",  onclick: () => save("xlsx") });
  const goC = button(tr("ดาวน์โหลดเป็น CSV", "Download as CSV"), { icon: "download",  onclick: () => save("csv"), ghost: true });
  const actions = el("div", { class: "actions" }, [goX, goC]);
  actions.hidden = true;

  body.append(dz.container, panel, actions, st.node);
  if (cfg.note) body.appendChild(el("div", { class: "note" }, cfg.note));

  sheetSel.onchange = () => { pickSheet(+sheetSel.value); };
  colSel.onchange = refresh;
  modeSel.onchange = refresh;

  async function load() {
    panel.hidden = true; actions.hidden = true; st.clear(); chips.innerHTML = ""; preview.innerHTML = "";
    const f = dz.files[0];
    if (!f) return;
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      ({ wb, encNote } = await readWorkbook(f));
      sheetNames = wb.SheetNames.filter((n) => wb.Sheets[n]);
      if (!sheetNames.length) throw new Error(tr("ไม่พบชีทในไฟล์นี้", "No sheets found in this file"));
      sheetSel.innerHTML = "";
      sheetNames.forEach((n, i) => sheetSel.appendChild(el("option", { value: String(i) }, n)));
      sheetField.hidden = sheetNames.length < 2;
      pickSheet(0);
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + (e.message || e));
    }
  }

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    /* ‼️ ชีทว่างต้องเหลือช่องเลือกชีทไว้ เดิมซ่อนทั้งแผง กลับชีทเดิมไม่ได้ (รีวิว 08/11/2026) */
    const empty = !table.header.length;
    panel.hidden = false;
    for (const n of [colField, opts.node, modeRow, chips, preview, actions]) if (n) n.hidden = empty;
    if (empty) { table = null; st.err(tr("ชีทนี้ว่างเปล่า เลือกชีทอื่นด้านบน", "This sheet is empty, pick another sheet above")); return; }
    colSel.innerHTML = "";
    table.header.forEach((h, c) => colSel.appendChild(el("option", { value: String(c) }, h)));
    // เดาคอลัมน์ที่น่าจะใช่ให้ล่วงหน้า
    const guess = cfg.guessColumn ? table.header.findIndex((h) => cfg.guessColumn(h)) : -1;
    colSel.value = String(guess >= 0 ? guess : 0);
    panel.hidden = false; actions.hidden = false;
    refresh();
  }

  function computeAll() {
    const o = opts.read();
    const c = +colSel.value;
    const out = [], stat = { ok: 0, skip: 0, bad: 0, warn: 0 };
    for (const r of table.rows) {
      const res = cfg.convert(r[c], o);
      if (res == null) { stat.skip++; out.push({ skip: true }); continue; }
      if (res.ok) { stat.ok++; if (res.warn) stat.warn++; }
      else stat.bad++;
      out.push(res);
    }
    return { out, stat, o, c };
  }

  function refresh() {
    if (!table) return;
    const { out, stat, o, c } = computeAll();
    chips.innerHTML = "";
    const chip = (cls, text) => chips.appendChild(el("span", { class: "stat " + cls }, text));
    const L = cfg.labels || {};
    chip("ok", `${L.ok || tr("แปลงได้", "Converted")} ${stat.ok.toLocaleString()} ${tr("แถว", "rows")}`);
    if (stat.warn) chip("warn", `${L.warn || tr("ต้องเดาปี", "Year guessed")} ${stat.warn.toLocaleString()} ${tr("แถว", "rows")}`);
    if (stat.bad) chip("bad", `${L.bad || tr("อ่านรูปแบบไม่ออก", "Unrecognized format")} ${stat.bad.toLocaleString()} ${tr("แถว", "rows")}`);
    if (stat.skip) chip("dim", `➖ ${tr("ช่องว่าง", "Empty")} ${stat.skip.toLocaleString()} ${tr("แถว", "rows")}`);

    const rows = [];
    for (let i = 0; i < table.rows.length && rows.length < 12; i++) {
      if (out[i].skip) continue;
      rows.push([i, out[i]]);
    }
    preview.innerHTML = "";
    if (!rows.length) { preview.appendChild(el("div", { class: "note" }, tr("ไม่มีข้อมูลให้แสดง", "No data to show"))); }
    else {
      const t = el("table", { class: "xt" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, tr("แถว", "Row")), el("th", {}, table.header[c] + tr(" (เดิม)", " (original)")),
          el("th", {}, "→"),
      ...(Array.isArray(cfg.outName(o, table.header[c]))
          ? cfg.outName(o, table.header[c]).map((n) => el("th", {}, n))
          : [el("th", {}, cfg.outName(o, table.header[c]))]),
        ])]),
        el("tbody", {}, rows.map(([i, res]) => el("tr", { class: res.ok ? "" : "bad" }, [
          el("td", { class: "num" }, String(i + 2)),
          el("td", { class: "old" }, cellText(table.rows[i][c])),
          el("td", { class: "arrow" }, res.ok ? "→" : "✕"),
          ...(() => {
            const names = cfg.outName(o, table.header[c]);
            const n = Array.isArray(names) ? names.length : 1;
            if (!res.ok) return [el("td", { class: "new", colspan: n > 1 ? String(n) : null },
                                    res.reason || tr("อ่านไม่ออก", "Could not read"))];
            const vals = Array.isArray(res.value) ? res.value : [res.value];
            return Array.from({ length: n }, (_, k) =>
              el("td", { class: "new" }, vals[k] == null ? "" : String(vals[k])));
          })(),
        ]))),
      ]);
      preview.appendChild(t);
      if (stat.ok + stat.bad > rows.length)
        preview.appendChild(el("div", { class: "note" },
          tr(`แสดง ${rows.length}/${(stat.ok + stat.bad).toLocaleString()} แถว ดาวน์โหลดครบ`,
             `Showing ${rows.length}/${pl((stat.ok + stat.bad).toLocaleString(), "row", "rows")}, download has all`)));
    }
    if (encNote) st.info(encNote); else st.clear();
  }

  async function save(kind) {
    const { out, stat, o, c } = computeAll();
    const srcName = table.header[c];
    const outCol = cfg.outName(o, srcName);
    const multi = Array.isArray(outCol);          // ผลลัพธ์หลายคอลัมน์
    const overwrite = !multi && modeSel.value === "replace";   // หลายคอลัมน์เขียนทับไม่ได้
    // หัวใหม่ห้ามซ้ำหัวเดิม (เขียนทับไม่นับหัวของคอลัมน์ที่ถูกทับ) ล่าบั๊ก F4 08/11/2026
    const names = freshNames(multi ? outCol : [outCol], new Set(table.header.filter((_, i) => !(overwrite && i === c)).map(hkey)));
    const header = table.header.slice();
    const target = c + 1;
    if (overwrite) header[c] = names[0];
    else header.splice(target, 0, ...names);

    const rows = table.rows.map((r, i) => {
      const res = out[i];
      const raw = res.skip ? null
        : res.ok ? res.value
        : cfg.writeFail ? (res.value ?? res.reason ?? "")
        : cellText(r[c]);
      // ค่าเดี่ยวที่ตกลงมาในโหมดหลายคอลัมน์ (เช่นแถวว่าง/อ่านไม่ออก) ให้ลงช่องแรก ที่เหลือว่าง
      const cells = multi
        ? (Array.isArray(raw) ? names.map((_, k) => raw[k] ?? null) : [raw, ...names.slice(1).map(() => null)])
        : [raw];
      const nr = r.slice();
      if (overwrite) nr[c] = cells[0];
      else nr.splice(target, 0, ...cells);
      return nr;
    });
    await yieldToBrowser();

    const base = stripExt(dz.files[0].name) + (cfg.suffix || tr("-แปลงแล้ว", "-converted"));
    if (kind === "csv") {
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
      download(new Blob(["﻿" + XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }), base + ".csv");
    } else {
      download(tableToBlob(header, rows, sheetNames[+sheetSel.value]), base + ".xlsx");
    }
    const L2 = cfg.labels || {};
    st.ok(tr(`บันทึกแล้ว: ${L2.ok || "แปลงสำเร็จ"} ${stat.ok.toLocaleString()} แถว`,
             `Saved: ${L2.ok || "converted"} ${pl(stat.ok.toLocaleString(), "row", "rows")}`) +
          (stat.bad ? tr(`, ${L2.bad || "อ่านไม่ออก"} ${stat.bad.toLocaleString()} แถว`,
                          `, ${L2.bad || "could not read"} ${pl(stat.bad.toLocaleString(), "row", "rows")}`) : ""));
  }

  return wrap;
}

/* ─── อุปกรณ์รวมหลายงานต่อคอลัมน์ในรอบเดียว (thai-suite 07/11/2026) ─────────────
   วัดเส้นทางเดิมบนเว็บจริง v222: แยกที่อยู่ แยกชื่อ ตรวจเลขบัตร แปลงปี ผ่านการ์ดทำต่อ
   กด 8 ครั้ง ได้ไฟล์ 4 ไฟล์ ชื่อยาวขึ้นทุกขั้น (.claude/evidence/2026-11-07-filekit-suite-plan/chain_now.log)
   ใช้ config() เดิมของแต่ละเครื่องมือ ตัวแปลงจึงเป็นตัวเดียวกับหน้าเดี่ยวทุกตัว */

/** ผลของหลายงานบนทั้งตาราง jobs: [{ cfg, o, c }] คืน { header, rows, stats } ใส่คอลัมน์ใหม่ต่อท้ายคอลัมน์ต้นทางของแต่ละงาน
 *  งานที่ใช้คอลัมน์ต้นทางเดียวกัน เรียงคอลัมน์ใหม่ตามลำดับงาน ไม่เขียนทับคอลัมน์เดิม */
/* หัวคอลัมน์ใหม่ห้ามซ้ำหัวที่มีอยู่ ไฟล์ที่มีหัว ชื่อ นามสกุล อยู่แล้ว แยกชื่อได้หัวซ้ำสองคู่
   Power Query PivotTable VLOOKUP หยิบผิดคอลัมน์ (ล่าบั๊ก F4 08/11/2026 tests/apply_jobs.test.mjs)
   หัวที่ชนเติม (ใหม่) (ใหม่ 2) ตามลำดับ หัวที่ไม่ชนคงชื่อเดิม */
const hkey = (s) => String(s ?? "").trim().toLowerCase();
export function freshNames(names, taken) {
  return names.map((n) => {
    let out = n;
    for (let i = 1; taken.has(hkey(out)); i++) out = `${n} (${tr("ใหม่", "new")}${i > 1 ? " " + i : ""})`;
    taken.add(hkey(out));
    return out;
  });
}

export function applyJobs(table, jobs) {
  const header = table.header.slice();
  const rows = table.rows.map((r) => r.slice());
  const stats = jobs.map(() => ({ ok: 0, skip: 0, bad: 0, warn: 0 }));
  const taken = new Set(table.header.map(hkey));
  const done = jobs.map((j, k) => {
    const outCol = j.cfg.outName(j.o, table.header[j.c]);
    const names = freshNames(Array.isArray(outCol) ? outCol : [outCol], taken);
    const cells = table.rows.map((r) => {
      const res = j.cfg.convert(r[j.c], j.o);
      const s = stats[k];
      if (res == null) { s.skip++; return names.map(() => null); }
      if (res.ok) { s.ok++; if (res.warn) s.warn++; } else s.bad++;
      const raw = res.ok ? res.value : j.cfg.writeFail ? (res.value ?? res.reason ?? "") : cellText(r[j.c]);
      return Array.isArray(raw) ? names.map((_, i) => raw[i] ?? null) : [raw, ...names.slice(1).map(() => null)];
    });
    return { k, c: j.c, names, cells };
  });
  // ใส่จากคอลัมน์ขวาสุดก่อน ตำแหน่งคอลัมน์ทางซ้ายจึงไม่เลื่อน คอลัมน์เดียวกันใส่งานหลังก่อน ผลจึงเรียงตามลำดับงาน
  done.sort((a, b) => b.c - a.c || b.k - a.k);
  const fresh = header.map(() => false); // เดินคู่กับ header บอกว่าตำแหน่งไหนเป็นคอลัมน์ใหม่ (ชื่อหัวใหม่ซ้ำของเดิมได้ เทียบชื่อไม่ได้)
  for (const d of done) {
    header.splice(d.c + 1, 0, ...d.names);
    fresh.splice(d.c + 1, 0, ...d.names.map(() => true));
    rows.forEach((r, i) => r.splice(d.c + 1, 0, ...d.cells[i]));
  }
  return { header, rows, stats, added: fresh.flatMap((f, i) => (f ? [i] : [])) };
}

/** หน้าอุปกรณ์รวม items: [{ id, label, cfg }] ไฟล์เดียว เลือกหลายงาน ดาวน์โหลดไฟล์เดียว */
export function columnSuite(tool, items, { suffix = tr("-จัดข้อมูลแล้ว", "-cleaned"), samples, expect = ["xlsx", "csv"] } = {}) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  let table = null, sheetNames = [], wb = null, encNote = null;
  const sheetSel = select([["0", "-"]], "0");
  const sheetField = field(tr("ชีท", "Sheet"), sheetSel);
  const jobsEl = el("div", { class: "suite-jobs" });
  const chips = el("div", { class: "stats" });
  const preview = el("div", { class: "xt-wrap" });
  const panel = el("div", { class: "panel", hidden: true }, [el("div", { class: "row" }, [sheetField]), jobsEl, chips, preview]);
  const rowsUi = items.map((it) => {
    const on = el("input", { type: "checkbox", class: "suite-on", "data-job": it.id });
    const colSel = select([["0", "-"]], "0");
    const opts = it.cfg.options ? it.cfg.options(refresh) : { node: null, read: () => ({}) };
    const stat = el("span", { class: "stat dim suite-stat" }, "");
    const node = el("div", { class: "suite-job", "data-job": it.id }, [
      el("label", { class: "suite-head" }, [on, el("strong", {}, it.label)]),
      el("div", { class: "row" }, [field(tr("คอลัมน์", "Column"), colSel), stat]),
      ...(opts.node ? [el("div", { class: "suite-opts" }, [opts.node])] : []),
    ]);
    on.onchange = () => { node.classList.toggle("off", !on.checked); refresh(); };
    colSel.onchange = refresh;
    jobsEl.appendChild(node);
    return { it, on, colSel, opts, stat, node };
  });
  const dz = dropzone({
    accept: ".xlsx,.xls,.csv", multiple: false, expect, expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("ไฟล์เดียว .xlsx .xls .csv ติ๊กงานที่อยากทำ ได้ไฟล์เดียวครบ", "One .xlsx .xls .csv file, tick the jobs, get one file with all of it"),
    onChange: load, samples: samples || [[COLTOOL_SAMPLE, "ข้อมูลลูกค้าตัวอย่าง (Excel)", "Sample customer data (Excel)"]],
  });
  const goX = button(tr("ดาวน์โหลดเป็น Excel", "Download as Excel"), { icon: "download", onclick: () => save("xlsx") });
  const goC = button(tr("ดาวน์โหลดเป็น CSV", "Download as CSV"), { icon: "download", onclick: () => save("csv"), ghost: true });
  const actions = el("div", { class: "actions" }, [goX, goC]);
  actions.hidden = true;
  body.append(dz.container, panel, actions, st.node);
  sheetSel.onchange = () => pickSheet(+sheetSel.value);

  async function load() {
    panel.hidden = true; actions.hidden = true; st.clear(); chips.innerHTML = ""; preview.innerHTML = "";
    const f = dz.files[0];
    if (!f) return;
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      ({ wb, encNote } = await readWorkbook(f));
      sheetNames = wb.SheetNames.filter((n) => wb.Sheets[n]);
      if (!sheetNames.length) throw new Error(tr("ไม่พบชีทในไฟล์นี้", "No sheets found in this file"));
      sheetSel.innerHTML = "";
      sheetNames.forEach((n, i) => sheetSel.appendChild(el("option", { value: String(i) }, n)));
      sheetField.hidden = sheetNames.length < 2;
      pickSheet(0);
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + (e.message || e));
    }
  }

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    /* ‼️ ชีทว่างต้องเหลือช่องเลือกชีทไว้ เดิมซ่อนทั้งแผงรวมช่องเลือกชีท กลับชีทเดิมไม่ได้ (รีวิว 08/11/2026) */
    const empty = !table.header.length;
    panel.hidden = false;
    jobsEl.hidden = chips.hidden = preview.hidden = actions.hidden = empty;
    if (empty) { table = null; st.err(tr("ชีทนี้ว่างเปล่า เลือกชีทอื่นด้านบน", "This sheet is empty, pick another sheet above")); return; }
    for (const u of rowsUi) {
      u.colSel.innerHTML = "";
      table.header.forEach((h, c) => u.colSel.appendChild(el("option", { value: String(c) }, h)));
      const g = guessJob(u.it.cfg, u.opts.read());
      u.colSel.value = String(g.c);
      u.on.checked = g.on; // ติ๊กให้เฉพาะงานที่ข้อมูลในคอลัมน์แปลงได้จริง งานอื่นให้คนเลือกเอง
      u.node.classList.toggle("off", !u.on.checked);
    }
    refresh();
  }

  /* เดาจากชื่อหัวอย่างเดียวหลวมเกิน หัว Paid ติด id หัว ภาษีมูลค่าเพิ่ม ติด ภาษี หัว ชื่อสินค้า ติด ชื่อ
     ไฟล์ผลลัพธ์ได้คอลัมน์ ผลตรวจ ผิดทุกแถวที่ผู้ใช้ไม่ได้ขอ (รีวิว 08/11/2026 tests/browser_thai_suite_guard.py)
     จึงลองแปลงข้อมูลจริง 200 แถวแรกของทุกหัวที่เข้าเค้า เลือกหัวที่แปลงได้มากสุด
     และติ๊กให้เมื่อแปลงได้มากกว่าแปลงไม่ได้ของช่องที่มีค่า */
  function guessJob(cfg, o) {
    if (!cfg.guessColumn) return { c: 0, on: false };
    let best = null;
    table.header.forEach((h, c) => {
      if (!cfg.guessColumn(h)) return;
      let ok = 0, bad = 0;
      for (const r of table.rows.slice(0, 200)) {
        const res = cfg.convert(r[c], o);
        if (res == null) continue;
        if (res.ok) ok++; else bad++;
      }
      if (!best || ok > best.ok) best = { c, ok, bad };
    });
    if (!best) return { c: 0, on: false };
    return { c: best.c, on: best.ok > best.bad };
  }

  const picked = () => rowsUi.filter((u) => u.on.checked);
  const jobsNow = () => picked().map((u) => ({ cfg: u.it.cfg, o: u.opts.read(), c: +u.colSel.value }));

  function refresh() {
    if (!table) return;
    const use = picked();
    goX.disabled = goC.disabled = !use.length;
    goX.dataset.why = goC.dataset.why = use.length ? "" : tr("ติ๊กงานอย่างน้อยหนึ่งงานก่อน", "Tick at least one job first");
    const { header, rows, stats, added: cols } = applyJobs(table, jobsNow());
    for (const u of rowsUi) { u.stat.textContent = ""; u.stat.className = "stat dim suite-stat"; }
    use.forEach((u, k) => {
      const s = stats[k], L = u.it.cfg.labels || {};
      const bad = s.bad ? "  " + (L.bad || tr("อ่านไม่ออก", "Unreadable")) + " " + s.bad.toLocaleString() : "";
      // แถวที่ระบบเดา (ที่อยู่ไม่ชัวร์ ปี 2 หลัก) ต้องบอกเหมือนหน้าเดี่ยว เดิมนับเป็นสำเร็จเงียบ (รีวิว 08/11/2026)
      const warn = s.warn ? "  " + (L.warn || tr("ควรตรวจซ้ำ", "Double-check")) + " " + s.warn.toLocaleString() : "";
      u.stat.textContent = (L.ok || tr("แปลงได้", "Converted")) + " " + s.ok.toLocaleString() + warn + bad;
      u.stat.className = "stat suite-stat " + (s.bad || s.warn ? "warn" : "ok");
    });
    chips.innerHTML = "";
    chips.appendChild(el("span", { class: "stat ok", id: "suite-newcols" },
      tr("คอลัมน์ใหม่ " + cols.length + " คอลัมน์ ในไฟล์เดียว", pl(cols.length, "new column", "new columns") + " in one file")));
    preview.innerHTML = "";
    if (!cols.length) { preview.appendChild(el("div", { class: "note" }, tr("ติ๊กงานด้านบนเพื่อดูผล", "Tick a job above to see the result"))); }
    else preview.appendChild(el("table", { class: "xt" }, [
      el("thead", {}, [el("tr", {}, [el("th", {}, tr("แถว", "Row")), ...cols.map((i) => el("th", {}, header[i]))])]),
      el("tbody", {}, rows.slice(0, 8).map((r, n) => el("tr", {}, [el("td", { class: "num" }, String(n + 2)), ...cols.map((i) => el("td", { class: "new" }, cellText(r[i])))]))),
    ]));
    if (encNote) st.info(encNote); else st.clear();
  }

  async function save(kind) {
    if (!picked().length) return;
    const { header, rows } = applyJobs(table, jobsNow());
    await yieldToBrowser();
    const base = stripExt(dz.files[0].name) + suffix;
    if (kind === "csv") {
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
      download(new Blob(["﻿" + XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }), base + ".csv");
    } else download(tableToBlob(header, rows, sheetNames[+sheetSel.value]), base + ".xlsx");
    st.ok(tr("บันทึกแล้ว " + picked().length + " งานในไฟล์เดียว", "Saved, " + pl(picked().length, "job", "jobs") + " in one file"));
  }

  return wrap;
}
