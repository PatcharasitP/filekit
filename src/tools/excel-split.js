// ── แยกไฟล์ Excel ตามค่าในคอลัมน์ ──────────────────────────────────────────
// งานที่ออฟฟิศไทยทำมือกันทุกเดือน: ไฟล์รายชื่อพนักงานรวมทุกฝ่าย แล้วต้องส่งให้
// หัวหน้าแต่ละฝ่ายเห็นแค่ฝ่ายตัวเอง หรือยอดขายรวมทุกจังหวัดแล้วต้องแยกรายจังหวัด
// เดิมต้องกรอง คัดลอก วางไฟล์ใหม่ ทีละกลุ่ม ผิดง่ายและกินเวลาเป็นชั่วโมง
//
// ‼️ ให้เลือกได้ 2 แบบผลลัพธ์ เพราะคนใช้จริงต้องการต่างกัน
//    · ไฟล์แยกกัน (ZIP) = ส่งต่อให้คนอื่นทีละคน ไม่ให้เห็นข้อมูลกลุ่มอื่น
//    · ไฟล์เดียวหลายชีท = เอาไว้ดูเองเทียบข้ามกลุ่ม เปิดทีเดียวจบ
import { el, dropzone, toolShell, statusBar, button, field, select,
         downloadButton, stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { readWorkbook, sheetToTable, cellText, autoWidths } from "../sheetpick.js";
import { tr, pl } from "../i18n.js";

const BLANK_KEY = () => tr("(ไม่ระบุ)", "(Unspecified)");

// ‼️ Excel ห้ามชื่อชีทยาวเกิน 31 ตัว ห้ามอักขระ [ ] * ? / \ : และห้ามซ้ำกัน
//    ถ้าซ้ำต้องต่อเลขท้ายให้ ไม่งั้นไฟล์ที่ได้เปิดไม่ขึ้นเลย
function sheetName(raw, used) {
  const base = String(raw).replace(/[[\]*?/\\:]/g, "-").trim().slice(0, 31)
    || tr("ว่าง", "Blank");
  let name = base, n = 2;
  while (used.has(name)) {
    const tail = ` (${n})`;
    name = base.slice(0, 31 - tail.length) + tail;
    n++;
  }
  used.add(name);
  return name;
}

// ‼️ ชื่อไฟล์บน Windows ห้ามมีอักขระพวกนี้ และห้ามลงท้ายด้วยจุดหรือช่องว่าง
function fileName(raw) {
  return String(raw).replace(/[<>:"/\\|?*]/g, "-").replace(/[. ]+$/, "").slice(0, 80)
    || tr("ว่าง", "Blank");
}

/** ปั้นสมุดงาน 1 ชีทจากแถวที่ให้มา (ใส่หัวตารางหรือไม่ก็ได้) */
function makeSheet(rows, header, withHead, name, colRef) {
  const aoa = withHead ? [header, ...rows] : rows;
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws["!cols"] = autoWidths(colRef, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  return wb;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const toBlob = (wb) => new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: XLSX_MIME });

const MAX_GROUPS = 300;       // เกินนี้แปลว่าเลือกคอลัมน์ผิด (เช่นไปเลือกคอลัมน์รหัสที่ไม่ซ้ำกันเลย)
const PREVIEW_GROUPS = 12;

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();

  let table = null, wb = null, sheetNames = [], encNote = null;

  const sheetSel = select([["0", "-"]], "0");
  const colSel = select([["0", "-"]], "0");
  const outSel = select([
    ["zip", tr("ไฟล์แยกกันทีละกลุ่ม (ZIP)", "One file per group (ZIP)")],
    ["sheets", tr("ไฟล์เดียว แยกเป็นชีท", "One file, one sheet per group")],
  ], "zip");
  const headSel = select([
    ["yes", tr("ใส่หัวตารางให้ทุกกลุ่ม", "Repeat the header row in every group")],
    ["no", tr("ไม่ใส่หัวตาราง", "No header row")],
  ], "yes");

  const chips = el("div", { class: "stats" });
  const preview = el("div", { class: "xt-wrap" });
  const panel = el("div", { class: "panel", hidden: true }, [
    el("div", { class: "row" }, [
      field(tr("ชีท", "Sheet"), sheetSel),
      field(tr("แยกตามคอลัมน์", "Split by column"), colSel),
    ]),
    el("div", { class: "row" }, [
      field(tr("รูปแบบผลลัพธ์", "Result format"), outSel),
      field(tr("หัวตาราง", "Header row"), headSel),
    ]),
    chips, preview,
  ]);

  const dz = dropzone({
    accept: ".xlsx,.xls,.csv,.txt,.tsv", multiple: false,
    expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: load,
  });

  const go = button(tr("แยกไฟล์", "Split the file"), { onclick: run });
  const actions = el("div", { class: "actions" }, [go]);
  actions.hidden = true;
  const results = el("div", { class: "results" });

  body.append(dz.container, panel, actions, st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("ค่าที่เหมือนกันจะถูกรวมเป็นกลุ่มเดียว แถวที่ช่องนั้นว่างจะไปอยู่กลุ่ม (ไม่ระบุ)",
       "Rows with the same value go into one group. Rows with an empty cell go into an Unspecified group")));

  sheetSel.onchange = () => pickSheet(+sheetSel.value);
  colSel.onchange = refresh;
  outSel.onchange = refresh;
  headSel.onchange = refresh;

  async function load() {
    panel.hidden = true; actions.hidden = true; results.innerHTML = "";
    chips.innerHTML = ""; preview.innerHTML = ""; st.clear();
    const f = dz.files[0];
    if (!f) return;
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      ({ wb, encNote } = await readWorkbook(f));
      sheetNames = wb.SheetNames.filter((n) => wb.Sheets[n]);
      if (!sheetNames.length) throw new Error(tr("ไม่พบชีทในไฟล์นี้", "No sheets found in this file"));
      sheetSel.innerHTML = "";
      sheetNames.forEach((n, i) => sheetSel.appendChild(el("option", { value: String(i) }, n)));
      pickSheet(0);
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + e.message);
    }
  }

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    colSel.innerHTML = "";
    table.header.forEach((h, c) => colSel.appendChild(el("option", { value: String(c) }, h)));
    panel.hidden = false;
    refresh();
  }

  /** จัดกลุ่มแถวตามค่าในคอลัมน์ที่เลือก
   *  ‼️ คืนลำดับตามที่เจอในไฟล์ ไม่เรียงใหม่ — คนใช้จริงคาดหวังลำดับเดิมของไฟล์
   *     ไม่ใช่ลำดับตัวอักษรที่ตัวเองไม่ได้สั่ง (Map ใน JS จำลำดับที่ใส่ให้อยู่แล้ว) */
  function groupRows() {
    const c = +colSel.value;
    const map = new Map();
    for (const row of table.rows) {
      const key = cellText(row[c]).trim() || BLANK_KEY();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }

  function refresh() {
    if (!table) return;
    results.innerHTML = "";
    const groups = groupRows();
    const asZip = outSel.value === "zip";

    chips.innerHTML = "";
    const chip = (cls, text) => chips.appendChild(el("span", { class: "stat " + cls }, text));
    chip("ok", tr(`แยกได้ ${groups.size.toLocaleString()} กลุ่ม`, `${groups.size.toLocaleString()} groups`));
    chip("dim", tr(`จาก ${table.rows.length.toLocaleString()} แถว`, `from ${pl(table.rows.length.toLocaleString(), "row", "rows")}`));
    const blank = groups.get(BLANK_KEY());
    if (blank) chip("warn", tr(`ช่องว่าง ${blank.length.toLocaleString()} แถว`,
                               `${pl(blank.length.toLocaleString(), "row", "rows")} with an empty cell`));

    preview.innerHTML = "";
    const list = [...groups.entries()];
    if (!list.length) {
      preview.appendChild(el("div", { class: "note" }, tr("ไม่มีข้อมูลให้แยก", "Nothing to split")));
      actions.hidden = true;
      return;
    }
    const used = new Set();
    preview.appendChild(el("table", { class: "xt" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("กลุ่ม", "Group")),
        el("th", {}, tr("จำนวนแถว", "Rows")),
        el("th", {}, asZip ? tr("ชื่อไฟล์ที่จะได้", "Output file name")
                           : tr("ชื่อชีทที่จะได้", "Output sheet name")),
      ])]),
      el("tbody", {}, list.slice(0, PREVIEW_GROUPS).map(([k, rows]) => el("tr", {}, [
        el("td", { class: "old" }, k),
        el("td", { class: "num" }, rows.length.toLocaleString()),
        el("td", { class: "new" }, asZip ? fileName(k) + ".xlsx" : sheetName(k, used)),
      ]))),
    ]));
    if (list.length > PREVIEW_GROUPS)
      preview.appendChild(el("div", { class: "note" },
        tr(`แสดง ${PREVIEW_GROUPS} จาก ${list.length.toLocaleString()} กลุ่ม ผลลัพธ์ได้ครบทุกกลุ่ม`,
           `Showing ${PREVIEW_GROUPS} of ${list.length.toLocaleString()} groups, the result has all of them`)));

    // ‼️ เตือนตั้งแต่ก่อนกด ไม่ใช่ปล่อยให้รอสร้าง 300 ไฟล์แล้วค่อยรู้ว่าเลือกคอลัมน์ผิด
    if (groups.size > MAX_GROUPS) {
      // ‼️ แยกเป็น 2 บรรทัด ไม่รวมเป็นก้อนเดียว เพราะข้อความยาวเกิน 100 ตัวอักษรล้นกล่องบนมือถือ
      //    (มีเทสคุมงบความยาวอยู่ที่ tests/browser_layout.py)
      st.err(tr(`ได้ ${groups.size.toLocaleString()} กลุ่ม เกินเพดาน ${MAX_GROUPS}`,
                `${groups.size.toLocaleString()} groups, over the ${MAX_GROUPS} limit`));
      preview.appendChild(el("div", { class: "note" },
        tr("คอลัมน์นี้อาจเป็นรหัสที่ไม่ซ้ำกัน ลองเลือกคอลัมน์ที่ค่าซ้ำกันหลายแถว",
           "This column may be a unique ID. Pick one whose values repeat across rows")));
      actions.hidden = true;
      return;
    }
    if (groups.size === 1)
      st.info(tr("คอลัมน์นี้มีค่าเดียวทั้งไฟล์ แยกแล้วจะได้ไฟล์เดียวเหมือนเดิม",
                 "This column has one value for the whole file, so splitting gives one file"));
    else if (encNote) st.info(encNote);
    else st.clear();
    actions.hidden = false;
  }

  async function run() {
    const groups = groupRows();
    if (!groups.size) return st.err(tr("ไม่มีข้อมูลให้แยก", "Nothing to split"));
    go.disabled = true;
    results.innerHTML = "";
    st.begin();
    st.info(tr("กำลังแยกไฟล์…", "Splitting…"));
    const src = stripExt(dz.files[0].name);
    const withHead = headSel.value === "yes";
    const usedNames = new Set();
    let done = 0;
    try {
      if (outSel.value === "sheets") {
        const out = XLSX.utils.book_new();
        for (const [k, rows] of groups) {
          if (st.cancelled) break;
          const ws = XLSX.utils.aoa_to_sheet(withHead ? [table.header, ...rows] : rows,
            { cellDates: true, dateNF: "dd/mm/yyyy" });
          ws["!cols"] = autoWidths(table.header, rows);
          XLSX.utils.book_append_sheet(out, ws, sheetName(k, usedNames));
          st.progress((++done / groups.size) * 100, `(${done}/${groups.size})`);
          await yieldToBrowser();
        }
        if (!done) throw new Error(tr("ยังไม่ได้ชีทเลย", "No sheet was produced"));
        const blob = toBlob(out);
        const name = `${src}${tr("-แยกตามกลุ่ม.xlsx", "-split.xlsx")}`;
        finish(blob, name, tr(`${done} ชีท`, `${pl(done, "sheet", "sheets")}`),
               tr(`ได้ไฟล์เดียว ${done} ชีท`, `One file with ${pl(done, "sheet", "sheets")}`));
      } else {
        const zip = new JSZip();
        for (const [k, rows] of groups) {
          if (st.cancelled) break;
          const one = makeSheet(rows, table.header, withHead, sheetName(k, usedNames), table.header);
          zip.file(`${fileName(k)}.xlsx`, toBlob(one));
          st.progress((++done / groups.size) * 100, `(${done}/${groups.size})`);
          await yieldToBrowser();
        }
        if (!done) throw new Error(tr("ยังไม่ได้ไฟล์เลย", "No file was produced"));
        const blob = await zip.generateAsync({ type: "blob" });
        const name = `${src}${tr("-แยกตามกลุ่ม.zip", "-split.zip")}`;
        finish(blob, name, tr(`${done} ไฟล์`, `${pl(done, "file", "files")}`),
               st.cancelled
                 ? tr(`หยุดตามที่สั่งแล้ว ได้ ${done} ไฟล์ที่ทำเสร็จก่อนหยุด`,
                      `Stopped as asked, ${pl(done, "file", "files")} finished before that`)
                 : tr(`แยกได้ ${done} ไฟล์`, `Split into ${pl(done, "file", "files")}`));
      }
    } catch (e) {
      st.end(); st.progress(null);
      st.err(tr("แยกไฟล์ไม่สำเร็จ: ", "Could not split: ") + e.message);
    } finally {
      go.disabled = false;
    }
  }

  function finish(blob, name, meta, msg) {
    st.end(); st.progress(null); st.ok(msg);
    results.appendChild(el("div", { class: "result" }, [
      el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, meta)]),
      el("span", { class: "r-size" }, fmtBytes(blob.size)),
      downloadButton(blob, name),
    ]));
  }

  return wrap;
}
