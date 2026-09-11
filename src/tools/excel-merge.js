// ── รวมหลายไฟล์ Excel/CSV เป็นไฟล์เดียว ────────────────────────────────────
// อีกงานที่ทำมือกันทุกเดือน: ได้ไฟล์ยอดขายมาจาก 12 สาขา แล้วต้องรวมเป็นไฟล์เดียว
// เพื่อทำสรุป เดิมต้องเปิดทีละไฟล์ คัดลอก วางต่อกัน แล้วลุ้นว่าคอลัมน์ตรงกันไหม
//
// ‼️ จุดที่เครื่องมือรวมไฟล์ทั่วไปพลาดกันบ่อยที่สุด: "ต่อแถวตามตำแหน่งคอลัมน์"
//    ถ้าสาขาไหนสลับลำดับคอลัมน์ (หรือเพิ่มคอลัมน์แทรกกลาง) ข้อมูลจะเลื่อนช่องกันเงียบ ๆ
//    ตัวนี้จับคู่ด้วย "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง และบอกให้เห็นเลยว่าไฟล์ไหนหัวไม่ตรง
import { el, dropzone, toolShell, statusBar, button, field, select,
         downloadButton, stripExt, yieldToBrowser, eachFile, failedBox, fmtBytes } from "../ui.js";
import { readWorkbook, sheetToTable, cellText, autoWidths } from "../sheetpick.js";
import { tr } from "../i18n.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 8;

// ‼️ Excel ห้ามชื่อชีทยาวเกิน 31 ตัว ห้ามอักขระ [ ] * ? / \ : และห้ามซ้ำกัน
function sheetName(raw, used) {
  const base = String(raw).replace(/[[\]*?/\\:]/g, "-").trim().slice(0, 31) || "Sheet";
  let name = base, n = 2;
  while (used.has(name)) {
    const tail = ` (${n})`;
    name = base.slice(0, 31 - tail.length) + tail;
    n++;
  }
  used.add(name);
  return name;
}

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();

  // เก็บผลอ่านไฟล์ไว้ เพื่อไม่ต้องอ่านซ้ำทุกครั้งที่ผู้ใช้เปลี่ยนตัวเลือก
  let read = [];        // [{ name, header, rows }]
  let readFailed = [];

  const modeSel = select([
    ["append", tr("ต่อแถวกันในชีทเดียว", "Append all rows into one sheet")],
    ["sheets", tr("แยกเป็นชีทละไฟล์", "One sheet per file")],
  ], "append");
  const headSel = select([
    ["yes", tr("แถวแรกของทุกไฟล์คือหัวตาราง", "The first row of every file is the header")],
    ["no", tr("ไม่มีหัวตาราง เป็นข้อมูลทุกแถว", "No header row, every row is data")],
  ], "yes");
  const srcSel = select([
    ["yes", tr("เพิ่มคอลัมน์บอกว่ามาจากไฟล์ไหน", "Add a column showing the source file")],
    ["no", tr("ไม่ต้องเพิ่ม", "Do not add it")],
  ], "yes");

  const chips = el("div", { class: "stats" });
  const warnBox = el("div", {});
  const preview = el("div", { class: "xt-wrap" });
  const panel = el("div", { class: "panel", hidden: true }, [
    el("div", { class: "row" }, [
      field(tr("วิธีรวม", "How to merge"), modeSel),
      field(tr("หัวตาราง", "Header row"), headSel),
    ]),
    el("div", { class: "row" }, [field(tr("ที่มาของแถว", "Row source"), srcSel)]),
    chips, warnBox, preview,
  ]);

  const dz = dropzone({
    accept: ".xlsx,.xls,.csv,.txt,.tsv", reorder: true,
    expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "Excel or CSV files"),
    hint: tr("ลากได้หลายไฟล์ สลับลำดับได้", "Drop several files, drag to reorder"),
    onChange: load,
  });

  const go = button(tr("รวมไฟล์", "Merge the files"), { onclick: run });
  const actions = el("div", { class: "actions" }, [go]);
  actions.hidden = true;
  const results = el("div", { class: "results" });

  body.append(dz.container, panel, actions, st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("จับคู่คอลัมน์ด้วยชื่อหัวตาราง ไม่ใช่ตำแหน่ง ไฟล์ที่สลับลำดับคอลัมน์จึงรวมได้ถูกต้อง",
       "Columns are matched by header name, not position, so files with a different column order still merge correctly")));

  modeSel.onchange = refresh;
  headSel.onchange = refresh;
  srcSel.onchange = refresh;

  async function load() {
    panel.hidden = true; actions.hidden = true; results.innerHTML = "";
    chips.innerHTML = ""; warnBox.innerHTML = ""; preview.innerHTML = "";
    read = []; readFailed = [];
    const files = dz.files;
    if (!files.length) { st.clear(); return; }
    st.info(tr("กำลังอ่านไฟล์…", "Reading the files…"));
    readFailed = await eachFile(files, st, async (f) => {
      const { wb } = await readWorkbook(f);
      const first = wb.SheetNames.find((n) => wb.Sheets[n]);
      if (!first) throw new Error(tr("ไม่พบชีทในไฟล์นี้", "No sheet found in this file"));
      const t = sheetToTable(wb.Sheets[first]);
      if (!t.header.length) throw new Error(tr("ชีทแรกว่างเปล่า", "The first sheet is empty"));
      // ‼️ ใช้แค่ชีทแรกของแต่ละไฟล์ ถ้าไฟล์มีหลายชีทต้องบอกให้รู้ตัว
      //    ไม่งั้นข้อมูลในชีทอื่นหายไปเงียบ ๆ โดยไม่มีอะไรฟ้องเลย
      const others = wb.SheetNames.filter((n) => wb.Sheets[n] && n !== first);
      read.push({ name: f.name, header: t.header, rows: t.rows, sheet: first, others });
    });
    st.progress(null);
    if (!read.length) {
      st.err(tr("อ่านไฟล์ไม่ได้เลยสักไฟล์", "Could not read any of the files"));
      const fb = failedBox(readFailed); if (fb) warnBox.appendChild(fb);
      return;
    }
    panel.hidden = false;
    refresh();
  }

  /** คอลัมน์รวมของผลลัพธ์ = หัวของไฟล์แรก แล้วต่อด้วยคอลัมน์ที่ไฟล์อื่นมีเพิ่ม
   *  ‼️ ยึดไฟล์แรกเป็นหลักเพราะคนใช้จริงเรียงไฟล์เอง (กล่องลากไฟล์สลับลำดับได้)
   *     ไฟล์แรกจึงคือ "แบบฟอร์มที่ถูก" ในความคิดของเขา */
  function unionHeader() {
    const cols = [];
    const seen = new Set();
    for (const f of read) {
      for (const h of f.header) {
        const k = h.trim();
        if (!seen.has(k)) { seen.add(k); cols.push(k); }
      }
    }
    return cols;
  }

  /** ไฟล์ไหนหัวตารางไม่ตรงกับไฟล์แรก บอกให้เห็นเลยว่าขาดอะไร เกินอะไร */
  function headerIssues() {
    if (read.length < 2) return [];
    const base = read[0].header.map((h) => h.trim());
    const baseSet = new Set(base);
    const out = [];
    for (const f of read.slice(1)) {
      const mine = f.header.map((h) => h.trim());
      const mineSet = new Set(mine);
      const missing = base.filter((h) => !mineSet.has(h));
      const extra = mine.filter((h) => !baseSet.has(h));
      const reordered = !missing.length && !extra.length
        && base.join(" ") !== mine.join(" ");
      if (missing.length || extra.length || reordered) out.push({ name: f.name, missing, extra, reordered });
    }
    return out;
  }

  /** ปั้นแถวผลลัพธ์ตามตัวเลือกปัจจุบัน */
  function build() {
    const withHead = headSel.value === "yes";
    const withSrc = srcSel.value === "yes";
    const srcLabel = tr("มาจากไฟล์", "Source file");

    if (!withHead) {
      // ไม่มีหัวตาราง = จับคู่ตามตำแหน่งอย่างเดียว (ไม่มีชื่อให้จับคู่)
      const width = Math.max(...read.map((f) => f.header.length));
      const rows = [];
      for (const f of read) {
        // แถวแรกของไฟล์ถูกอ่านไปเป็น header ตอน sheetToTable จึงต้องเอากลับมาเป็นข้อมูล
        for (const r of [f.header, ...f.rows]) {
          const line = Array.from({ length: width }, (_, i) => (r[i] === undefined ? null : r[i]));
          rows.push(withSrc ? [...line, f.name] : line);
        }
      }
      const header = Array.from({ length: width }, (_, i) => tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`));
      return { header: withSrc ? [...header, srcLabel] : header, rows };
    }

    const cols = unionHeader();
    const rows = [];
    for (const f of read) {
      const index = new Map(f.header.map((h, i) => [h.trim(), i]));
      for (const r of f.rows) {
        const line = cols.map((c) => (index.has(c) ? r[index.get(c)] : null));
        rows.push(withSrc ? [...line, f.name] : line);
      }
    }
    return { header: withSrc ? [...cols, srcLabel] : cols, rows };
  }

  function refresh() {
    if (!read.length) return;
    results.innerHTML = "";
    const asSheets = modeSel.value === "sheets";
    const { header, rows } = build();

    chips.innerHTML = "";
    const chip = (cls, text) => chips.appendChild(el("span", { class: "stat " + cls }, text));
    chip("ok", tr(`อ่านได้ ${read.length} ไฟล์`, `${read.length} files read`));
    chip("dim", asSheets
      ? tr(`จะได้ ${read.length} ชีท`, `${read.length} sheets`)
      : tr(`รวม ${rows.length.toLocaleString()} แถว`, `${rows.length.toLocaleString()} rows total`));
    if (!asSheets) chip("dim", tr(`${header.length} คอลัมน์`, `${header.length} columns`));
    if (readFailed.length) chip("bad", tr(`ข้าม ${readFailed.length} ไฟล์`, `${readFailed.length} files skipped`));

    warnBox.innerHTML = "";
    const fb = failedBox(readFailed); if (fb) warnBox.appendChild(fb);

    const multi = read.filter((f) => f.others.length);
    if (multi.length) warnBox.appendChild(el("div", { class: "fail-box" }, [
      el("strong", {}, tr(`${multi.length} ไฟล์มีหลายชีท ใช้แค่ชีทแรกของแต่ละไฟล์`,
                          `${multi.length} files have more than one sheet. Only the first sheet of each is used`)),
      el("ul", {}, multi.map((f) => el("li", {},
        tr(`${f.name}: ใช้ชีท “${f.sheet}” ไม่ได้ใช้ ${f.others.join(", ")}`,
           `${f.name}: using sheet “${f.sheet}”, skipping ${f.others.join(", ")}`)))),
    ]));

    const issues = headerIssues();
    // ‼️ ต้องเตือนตอนรวมแบบ "ต่อแถว" เท่านั้น แยกเป็นชีทไม่ต้องจับคู่คอลัมน์อยู่แล้ว
    if (issues.length && !asSheets && headSel.value === "yes") {
      warnBox.appendChild(el("div", { class: "fail-box" }, [
        el("strong", {}, tr(`หัวตารางของ ${issues.length} ไฟล์ไม่ตรงกับไฟล์แรก จับคู่ตามชื่อคอลัมน์ให้แล้ว ช่องที่ขาดเว้นว่างไว้`,
                            `${issues.length} files have a different header. Matched by column name, missing cells left blank`)),
        el("ul", {}, issues.map((x) => el("li", {}, [
          x.name + ": ",
          x.missing.length ? tr(`ขาด ${x.missing.join(", ")}`, `missing ${x.missing.join(", ")}`) : "",
          x.missing.length && x.extra.length ? tr(" และ ", " and ") : "",
          x.extra.length ? tr(`มีเพิ่ม ${x.extra.join(", ")}`, `extra ${x.extra.join(", ")}`) : "",
          !x.missing.length && !x.extra.length ? tr("คอลัมน์ครบแต่สลับลำดับ", "same columns in a different order") : "",
        ]))),
      ]));
    }

    preview.innerHTML = "";
    if (asSheets) {
      const used = new Set();
      preview.appendChild(el("table", { class: "xt" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, tr("ไฟล์", "File")),
          el("th", {}, tr("จำนวนแถว", "Rows")),
          el("th", {}, tr("ชื่อชีทที่จะได้", "Output sheet name")),
        ])]),
        el("tbody", {}, read.map((f) => el("tr", {}, [
          el("td", { class: "old" }, f.name),
          el("td", { class: "num" }, f.rows.length.toLocaleString()),
          el("td", { class: "new" }, sheetName(stripExt(f.name), used)),
        ]))),
      ]));
    } else if (!rows.length) {
      preview.appendChild(el("div", { class: "note" }, tr("ไม่มีแถวข้อมูลให้รวม", "No data rows to merge")));
    } else {
      preview.appendChild(el("table", { class: "xt" }, [
        el("thead", {}, [el("tr", {}, header.map((h) => el("th", {}, h)))]),
        el("tbody", {}, rows.slice(0, PREVIEW_ROWS).map((r) =>
          el("tr", {}, r.map((v) => el("td", { class: "old" }, cellText(v)))))),
      ]));
      if (rows.length > PREVIEW_ROWS)
        preview.appendChild(el("div", { class: "note" },
          tr(`แสดง ${PREVIEW_ROWS} จาก ${rows.length.toLocaleString()} แถว ไฟล์ที่ได้มีครบ`,
             `Showing ${PREVIEW_ROWS} of ${rows.length.toLocaleString()} rows, the file has all of them`)));
    }

    if (read.length === 1)
      st.info(tr("มีไฟล์เดียว ลากเพิ่มอีกไฟล์เพื่อรวมกัน", "Only one file. Drop another one to merge"));
    else st.clear();
    actions.hidden = false;
  }

  async function run() {
    if (!read.length) return st.err(tr("ยังไม่มีไฟล์ให้รวม", "No files to merge"));
    go.disabled = true;
    results.innerHTML = "";
    st.info(tr("กำลังรวมไฟล์…", "Merging…"));
    try {
      const out = XLSX.utils.book_new();
      let meta;
      if (modeSel.value === "sheets") {
        const used = new Set();
        // แยกเป็นชีทละไฟล์ = ลอกไฟล์เดิมมาทั้งแผ่น รวมแถวแรกด้วย ไม่ว่าจะเป็นหัวตารางหรือข้อมูล
        for (const f of read) {
          const ws = XLSX.utils.aoa_to_sheet([f.header, ...f.rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
          ws["!cols"] = autoWidths(f.header, f.rows);
          XLSX.utils.book_append_sheet(out, ws, sheetName(stripExt(f.name), used));
          await yieldToBrowser();
        }
        meta = tr(`${read.length} ชีท`, `${read.length} sheets`);
      } else {
        const { header, rows } = build();
        if (!rows.length) throw new Error(tr("ไม่มีแถวข้อมูลให้รวม", "No data rows to merge"));
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true, dateNF: "dd/mm/yyyy" });
        ws["!cols"] = autoWidths(header, rows);
        XLSX.utils.book_append_sheet(out, ws, tr("รวมแล้ว", "Merged"));
        meta = tr(`${rows.length.toLocaleString()} แถว, ${header.length} คอลัมน์`,
                  `${rows.length.toLocaleString()} rows, ${header.length} columns`);
      }
      const blob = new Blob([XLSX.write(out, { bookType: "xlsx", type: "array" })], { type: XLSX_MIME });
      const name = `${stripExt(read[0].name)}${tr("-รวมแล้ว.xlsx", "-merged.xlsx")}`;
      st.ok(tr(`รวมเสร็จ จาก ${read.length} ไฟล์`, `Done, merged ${read.length} files`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, meta)]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("รวมไฟล์ไม่สำเร็จ: ", "Could not merge: ") + e.message);
    } finally {
      go.disabled = false;
    }
  }

  return wrap;
}
