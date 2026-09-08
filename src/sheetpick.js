// ─────────────────────────────────────────────────────────────────────────────
// โครงร่วมของเครื่องมือที่ทำงาน "ทีละคอลัมน์"บนไฟล์ Excel/CSV
// เครื่องมือลูกบอกแค่ 2 อย่าง: มีตัวเลือกอะไร และแปลงค่าหนึ่งช่องยังไง
// ที่เหลือ (เลือกชีท เลือกคอลัมน์ พรีวิว สรุปผล ดาวน์โหลด) ไฟล์นี้จัดการให้หมด
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { toolShell, statusBar, button, field, select, dropzone,
         download, stripExt, yieldToBrowser } from "./ui.js";
import { smartDecode, ENC_LABEL } from "./thai.js";
import { tr } from "./i18n.js";

const TEXTY = ["csv", "txt", "tsv"];

/** อ่านไฟล์เป็นสมุดงาน — ไฟล์ข้อความจะเดาการเข้ารหัสให้เองด้วย (ไทยเพี้ยนก็อ่านออก) */
export async function readWorkbook(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!TEXTY.includes(ext))
    return { wb: XLSX.read(buf, { type: "array", cellDates: true }), encNote: null };

  const d = smartDecode(buf);
  let encNote = null;
  if (d.undo) encNote = tr("ไฟล์นี้ไทยเพี้ยนซ้อน — ซ่อมให้แล้ว", "Thai text was double-garbled — fixed automatically");
  else if (d.enc !== "utf-8") encNote = tr(`เข้ารหัส ${ENC_LABEL[d.enc] || d.enc} — แปลงแล้ว`, `${ENC_LABEL[d.enc] || d.enc} encoding — converted`);
  return { wb: XLSX.read(d.text, { type: "string", cellDates: true }), encNote };
}

/** ชีท → { header:[...], rows:[[...]] } โดยเติมช่องที่ขาดให้ทุกแถวยาวเท่ากัน */
export function sheetToTable(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
  if (!aoa.length) return { header: [], rows: [] };
  const width = Math.max(...aoa.map((r) => r.length));
  const header = [];
  for (let i = 0; i < width; i++) {
    const h = aoa[0][i];
    header.push(h == null || String(h).trim() === "" ? tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`) : String(h).trim());
  }
  const rows = aoa.slice(1).map((r) => {
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
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })],
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
export function columnTool(tool, cfg) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();

  let table = null, sheetNames = [], wb = null, encNote = null;

  const sheetSel = select([["0", "—"]], "0");
  const colSel = select([["0", "—"]], "0");
  const modeSel = select([["add", tr("เพิ่มคอลัมน์ใหม่ (เก็บของเดิม)", "Add new column (keeps original)")],
                          ["replace", tr("เขียนทับคอลัมน์เดิม", "Overwrite original")]], "add");
  const sheetField = field(tr("ชีท", "Sheet"), sheetSel);
  const colField = field(tr("คอลัมน์ที่จะแปลง", "Column to convert"), colSel);
  const modeField = field(tr("ผลลัพธ์", "Result"), modeSel);
  const opts = cfg.options ? cfg.options(refresh) : { node: null, read: () => ({}) };

  const chips = el("div", { class: "stats" });
  const preview = el("div", { class: "xt-wrap" });
  const panel = el("div", { class: "panel", hidden: true }, [
    el("div", { class: "row" }, [sheetField, colField]),
    ...(opts.node ? [opts.node] : []),
    el("div", { class: "row" }, [modeField]),
    chips, preview,
  ]);

  const dz = dropzone({
    accept: cfg.accept, multiple: false, expect: cfg.expect, expectLabel: cfg.expectLabel,
    hint: cfg.hint, onChange: load,
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
      st.err(tr("อ่านไฟล์ไม่สำเร็จ — ", "Could not read the file — ") + (e.message || e));
    }
  }

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    if (!table.header.length) { st.err(tr("ชีทนี้ว่างเปล่า", "This sheet is empty")); panel.hidden = true; return; }
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
          tr(`แสดง ${rows.length}/${(stat.ok + stat.bad).toLocaleString()} แถว — ดาวน์โหลดครบ`,
             `Showing ${rows.length}/${(stat.ok + stat.bad).toLocaleString()} rows — download has all`)));
    }
    if (encNote) st.info(encNote); else st.clear();
  }

  async function save(kind) {
    const { out, stat, o, c } = computeAll();
    const srcName = table.header[c];
    const outCol = cfg.outName(o, srcName);
    const multi = Array.isArray(outCol);          // ผลลัพธ์หลายคอลัมน์
    const names = multi ? outCol : [outCol];
    const header = table.header.slice();
    const overwrite = !multi && modeSel.value === "replace";   // หลายคอลัมน์เขียนทับไม่ได้
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
    st.ok(tr(`บันทึกแล้ว — ${L2.ok || "แปลงสำเร็จ"} ${stat.ok.toLocaleString()} แถว`,
             `Saved — ${L2.ok || "converted"} ${stat.ok.toLocaleString()} rows`) +
          (stat.bad ? tr(` · ${L2.bad || "อ่านไม่ออก"} ${stat.bad.toLocaleString()} แถว`,
                          ` · ${L2.bad || "could not read"} ${stat.bad.toLocaleString()} rows`) : ""));
  }

  return wrap;
}
