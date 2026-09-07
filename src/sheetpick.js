// ─────────────────────────────────────────────────────────────────────────────
// โครงร่วมของเครื่องมือที่ทำงาน "ทีละคอลัมน์" บนไฟล์ Excel/CSV
// เครื่องมือลูกบอกแค่ 2 อย่าง: มีตัวเลือกอะไร และแปลงค่าหนึ่งช่องยังไง
// ที่เหลือ (เลือกชีท เลือกคอลัมน์ พรีวิว สรุปผล ดาวน์โหลด) ไฟล์นี้จัดการให้หมด
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { toolShell, statusBar, button, field, select, dropzone,
         download, stripExt, yieldToBrowser } from "./ui.js";
import { smartDecode, ENC_LABEL } from "./thai.js";

const TEXTY = ["csv", "txt", "tsv"];

/** อ่านไฟล์เป็นสมุดงาน — ไฟล์ข้อความจะเดาการเข้ารหัสให้เองด้วย (ไทยเพี้ยนก็อ่านออก) */
export async function readWorkbook(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!TEXTY.includes(ext))
    return { wb: XLSX.read(buf, { type: "array", cellDates: true }), encNote: null };

  const d = smartDecode(buf);
  let encNote = null;
  if (d.undo) encNote = "ไฟล์นี้ภาษาไทยเพี้ยนซ้อน — ซ่อมให้อัตโนมัติตอนอ่านแล้ว";
  else if (d.enc !== "utf-8") encNote = `ไฟล์นี้เข้ารหัสแบบ ${ENC_LABEL[d.enc] || d.enc} — แปลงให้อัตโนมัติแล้ว`;
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
    header.push(h == null || String(h).trim() === "" ? `คอลัมน์ ${i + 1}` : String(h).trim());
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
 *   suffix -> ต่อท้ายชื่อไฟล์ที่ดาวน์โหลด
 * }
 */
export function columnTool(tool, cfg) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();

  let table = null, sheetNames = [], wb = null, encNote = null;

  const sheetSel = select([["0", "—"]], "0");
  const colSel = select([["0", "—"]], "0");
  const modeSel = select([["add", "เพิ่มเป็นคอลัมน์ใหม่ (เก็บของเดิมไว้)"],
                          ["replace", "เขียนทับคอลัมน์เดิม"]], "add");
  const sheetField = field("ชีท", sheetSel);
  const colField = field("คอลัมน์ที่จะแปลง", colSel);
  const modeField = field("ผลลัพธ์", modeSel);
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
  const goX = button("ดาวน์โหลดเป็น Excel", { icon: "download",  onclick: () => save("xlsx") });
  const goC = button("ดาวน์โหลดเป็น CSV", { icon: "download",  onclick: () => save("csv"), ghost: true });
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
      st.info("กำลังอ่านไฟล์…");
      ({ wb, encNote } = await readWorkbook(f));
      sheetNames = wb.SheetNames.filter((n) => wb.Sheets[n]);
      if (!sheetNames.length) throw new Error("ไม่พบชีทในไฟล์นี้");
      sheetSel.innerHTML = "";
      sheetNames.forEach((n, i) => sheetSel.appendChild(el("option", { value: String(i) }, n)));
      sheetField.hidden = sheetNames.length < 2;
      pickSheet(0);
    } catch (e) {
      st.err("อ่านไฟล์ไม่สำเร็จ — " + (e.message || e));
    }
  }

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    if (!table.header.length) { st.err("ชีทนี้ว่างเปล่า"); panel.hidden = true; return; }
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
    chip("ok", `✅ ${L.ok || "แปลงได้"} ${stat.ok.toLocaleString()} แถว`);
    if (stat.warn) chip("warn", `⚠️ ${L.warn || "ต้องเดาปี"} ${stat.warn.toLocaleString()} แถว`);
    if (stat.bad) chip("bad", `❌ ${L.bad || "อ่านรูปแบบไม่ออก"} ${stat.bad.toLocaleString()} แถว`);
    if (stat.skip) chip("dim", `➖ ช่องว่าง ${stat.skip.toLocaleString()} แถว`);

    const rows = [];
    for (let i = 0; i < table.rows.length && rows.length < 12; i++) {
      if (out[i].skip) continue;
      rows.push([i, out[i]]);
    }
    preview.innerHTML = "";
    if (!rows.length) { preview.appendChild(el("div", { class: "note" }, "ไม่มีข้อมูลให้แสดง")); }
    else {
      const t = el("table", { class: "xt" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, "แถว"), el("th", {}, table.header[c] + " (เดิม)"),
          el("th", {}, "→"), el("th", {}, cfg.outName(o, table.header[c])),
        ])]),
        el("tbody", {}, rows.map(([i, res]) => el("tr", { class: res.ok ? "" : "bad" }, [
          el("td", { class: "num" }, String(i + 2)),
          el("td", { class: "old" }, cellText(table.rows[i][c])),
          el("td", { class: "arrow" }, res.ok ? "→" : "✕"),
          el("td", { class: "new" }, res.ok ? String(res.value) : (res.reason || "อ่านไม่ออก")),
        ]))),
      ]);
      preview.appendChild(t);
      if (stat.ok + stat.bad > rows.length)
        preview.appendChild(el("div", { class: "note" },
          `แสดง ${rows.length} แถวแรกจาก ${(stat.ok + stat.bad).toLocaleString()} แถว — ดาวน์โหลดแล้วจะได้ครบทุกแถว`));
    }
    if (encNote) st.info(encNote); else st.clear();
  }

  async function save(kind) {
    const { out, stat, o, c } = computeAll();
    const srcName = table.header[c];
    const outCol = cfg.outName(o, srcName);
    const header = table.header.slice();
    let target = c;
    if (modeSel.value === "add") { target = c + 1; header.splice(target, 0, outCol); }
    else header[c] = outCol;

    const rows = table.rows.map((r, i) => {
      const res = out[i];
      const v = res.skip ? null
        : res.ok ? res.value
        : cfg.writeFail ? (res.value ?? res.reason ?? "")
        : cellText(r[c]);
      const nr = r.slice();
      if (modeSel.value === "add") nr.splice(target, 0, v);
      else nr[c] = v;
      return nr;
    });
    await yieldToBrowser();

    const base = stripExt(dz.files[0].name) + (cfg.suffix || "-แปลงแล้ว");
    if (kind === "csv") {
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
      download(new Blob(["﻿" + XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }), base + ".csv");
    } else {
      download(tableToBlob(header, rows, sheetNames[+sheetSel.value]), base + ".xlsx");
    }
    const L2 = cfg.labels || {};
    st.ok(`บันทึกแล้ว — ${L2.ok || "แปลงสำเร็จ"} ${stat.ok.toLocaleString()} แถว` +
          (stat.bad ? ` · ${L2.bad || "อ่านไม่ออก"} ${stat.bad.toLocaleString()} แถว` : ""));
  }

  return wrap;
}
