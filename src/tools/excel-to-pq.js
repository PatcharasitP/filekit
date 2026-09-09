// ── ตารางเป็นสูตร Power Query ────────────────────────────────────────────────
// ลากไฟล์ Excel/CSV เข้ามา แล้วได้โค้ด #table(...) ที่วางใน Power Query ได้เลย
// พร้อมให้กำหนดชนิดข้อมูลของแต่ละคอลัมน์เอง และมีแผงสอนไวยากรณ์อยู่ในหน้าเดียวกัน
//
// ทำไมต้องมี: เวลาต้องฝังตารางอ้างอิงเล็ก ๆ ลงใน query (ตารางแปลงรหัส, ตารางตั้งค่า SLA,
// ตารางวันหยุด) คนต้องนั่งพิมพ์ #table มือทีละแถว ซึ่งพิมพ์ผิดง่ายมากและ error ของ M อ่านยาก

import { el, dropzone, toolShell, statusBar, button, field, select, segmented,
         download, yieldToBrowser } from "../ui.js";
import { readWorkbook, sheetToTable } from "../sheetpick.js";
import { splitSheetsByVisibility } from "../xlsxutil.js";
import { guessTableTypes } from "../pqtypes.js";
import { extractTable, kindOfFile } from "../tabledata.js";
import { PQ_TYPES, buildTableCode, wrapAsQuery } from "../pqm.js";
import { tr } from "../i18n.js";

const STYLE = `
/* ‼️ ตารางคอลัมน์กว้างเกินจอมือถือได้ง่ายมาก ต้องให้มันเลื่อนในกล่องของตัวเอง
   ไม่ใช่ปล่อยให้ทั้งหน้าเลื่อนแนวนอน ซึ่งทำให้ทุกอย่างบนหน้าขยับตามจนใช้งานยาก */
.pq-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.pq-cols{width:100%;border-collapse:collapse;margin-top:10px;font-size:13.5px}
.pq-cols th{text-align:left;font-weight:700;padding:7px 8px;border-bottom:1.5px solid var(--line);white-space:nowrap}
.pq-cols td{padding:5px 8px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
.pq-cols tr[hidden]{display:none}
.pq-name{font-weight:600;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pq-sample{color:var(--text-mute);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* ‼️ ปุ่มกดบนมือถือต้องสูงอย่างน้อย 36px ไม่งั้นนิ้วกดพลาด (มีเทสจับ) */
.pq-cols select{width:100%;min-width:150px;max-width:220px;min-height:36px}
.pq-flag{display:inline-block;margin-left:6px;font-size:11.5px;font-weight:700;
  padding:1px 7px;border-radius:99px;vertical-align:middle;
  color:var(--warn);border:1px solid var(--warn);background:var(--bg-soft)}
.pq-why{display:block;font-size:12px;color:var(--text-mute);margin-top:2px;white-space:normal}
.pq-code{margin-top:12px;padding:12px 14px;border-radius:var(--r-sm);border:1px solid var(--line);
  background:var(--bg-soft);font-family:ui-monospace,"Cascadia Code",Consolas,monospace;
  font-size:12.5px;line-height:1.55;white-space:pre;overflow:auto;max-height:340px}
.pq-code[hidden]{display:none}
.pq-teach{margin-top:14px;border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.pq-teach summary{cursor:pointer;font-weight:700}
.pq-teach table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
.pq-teach th,.pq-teach td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line-soft)}
.pq-teach code{font-family:ui-monospace,Consolas,monospace;background:var(--bg-soft);
  padding:1px 5px;border-radius:4px}
.pq-teach ol{margin:8px 0 0 18px;line-height:1.75}
`;

// ‼️ แถวเยอะเกินไปทำให้ query เปิดช้ามากและวางไม่ไหว ตารางอ้างอิงที่ควรฝังใน query
//    ปกติมีไม่กี่สิบแถว ตั้งค่าตั้งต้นไว้เตี้ย ๆ แล้วให้ผู้ใช้ขยายเองถ้าต้องการจริง
const ROW_CHOICES = [["50", "50"], ["200", "200"], ["1000", "1,000"], ["0", ""]];

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const styleEl = el("style", {}, STYLE);

  let table = null;         // { header, rows }
  let cols = [];            // [{ name, type, confidence, reason }]
  let wb = null, sheetNames = [], hiddenNames = [];
  let srcNote = null;      // คำเตือนเรื่องที่มาของข้อมูล เช่นอ่านมาจาก OCR

  const sheetSel = select([], "0");
  const sheetField = field(tr("ชีท", "Sheet"), sheetSel);
  const rowsSel = select(ROW_CHOICES.map(([v, t]) => [v, t || tr("ทุกแถว", "All rows")]), "200");
  const shapeSel = segmented([
    ["snippet", tr("เฉพาะ #table", "#table only")],
    ["query", tr("โค้ดเต็มพร้อมวาง", "Full query")],
  ], "snippet");

  const summary = el("div", { class: "note" });
  const onlyWarn = el("input", { type: "checkbox" });
  const onlyWarnRow = el("label", { class: "clean-check" },
    [onlyWarn, el("span", {}, tr("ดูเฉพาะคอลัมน์ที่ควรตรวจสอบ", "Show only columns worth checking"))]);
  const acceptAll = button(tr("รับค่าที่เดาให้ทั้งหมด", "Accept all inferred types"),
                           { ghost: true, onclick: () => { regenerate(); st.ok(tr("ใช้ชนิดที่เดาให้ทั้งหมดแล้ว", "Using all inferred types")); } });

  const colsBox = el("div", {});
  const codeBox = el("pre", { class: "pq-code", hidden: true });
  const copyBtn = button(tr("คัดลอกโค้ด", "Copy code"), { icon: "copy", onclick: copyCode });
  const saveBtn = button(tr("บันทึกเป็นไฟล์", "Save as file"), { ghost: true, icon: "download", onclick: saveCode });
  const actions = el("div", { class: "actions", hidden: true }, [copyBtn, saveBtn, acceptAll]);

  const dz = dropzone({
    accept: ".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp",
    multiple: false,
    hint: tr("ลากไฟล์ Excel, CSV, PDF, Word หรือรูปถ่ายตารางมาวาง",
             "Drop an Excel, CSV, PDF, Word file, or a photo of a table"),
    // ‼️ ชื่อชนิดต้องตรงกับที่ detectType คืนมา รูปภาพทุกนามสกุลคืนเป็น "image" ตัวเดียว
    expect: ["xlsx", "csv", "pdf", "docx", "image"],
    expectLabel: tr("ไฟล์ตาราง หรือไฟล์ที่มีตารางอยู่ข้างใน", "A spreadsheet, or a file with a table inside"),
    onChange: () => load(),
  });

  /* ‼️ แถวปุ่มลงมือทำต้องเป็นลูกตัวสุดท้ายของแผง ไม่งั้นบนมือถือมันจะหลุดจอ
     กฎ sticky ของเว็บนี้ตรึงแถบปุ่มไว้ที่ก้นจอได้เฉพาะตอนที่ "ตำแหน่งจริง" ของมันอยู่ใต้ขอบจอ
     ถ้ามีเนื้อหาต่อท้ายอีกยาว ๆ (กล่องโค้ด แผงสอน) แถบจะหลุดตรึงแล้วเลื่อนหายไปกับหน้า
     (จับได้จาก tests/browser_mobile.py ข้อ ②) จึงยกแผงสอนออกไปไว้นอกแผง เป็นบล็อกของตัวเอง */
  body.append(styleEl, dz.container,
    el("div", { class: "row" }, [sheetField, field(tr("จำนวนแถวที่ใส่", "Rows to include"), rowsSel),
                                 field(tr("รูปแบบผลลัพธ์", "Output shape"), shapeSel)]),
    summary, colsBox, codeBox, st.node, actions);
  wrap.insertBefore(teachPanel(), wrap.lastElementChild);
  sheetField.hidden = true;

  sheetSel.onchange = () => { pickSheet(+sheetSel.value); };
  rowsSel.onchange = regenerate;
  shapeSel.addEventListener("change", regenerate);
  onlyWarn.onchange = applyFilter;

  async function load() {
    colsBox.innerHTML = ""; summary.textContent = "";
    codeBox.hidden = true; actions.hidden = true; st.clear();
    table = null; srcNote = null;
    const f = dz.files[0];
    if (!f) { sheetField.hidden = true; return; }
    try {
      /* ‼️ ไฟล์ที่ไม่ใช่สเปรดชีต (PDF, Word, รูปถ่าย) ต้องดึงตารางออกมาก่อน
         ใช้ตัวอ่านที่โปรเจกต์มีอยู่แล้วทุกตัว ไม่เขียนใหม่ แล้วส่งเข้าเส้นทางเดียวกันกับ Excel
         ตั้งแต่จุดนี้เป็นต้นไป โค้ดไม่ต้องรู้เลยว่าไฟล์มาจากไหน */
      if (kindOfFile(f.name)) {
        st.begin();
        st.info(tr("กำลังดึงตารางออกจากไฟล์…", "Pulling the table out of the file…"));
        const got = await extractTable(f, {
          onProgress: (p) => {
            if (p.phase === "page") st.progress((p.current / p.total) * 100, `(${p.current}/${p.total})`);
            else if (p.phase === "read") st.progress(p.ratio * 100);
          },
        });
        st.end();
        st.progress(null);
        wb = null; sheetNames = []; hiddenNames = [];
        sheetField.hidden = true;
        if (!got.header.length) throw new Error(tr("ไม่พบตารางในไฟล์นี้", "No table found in this file"));
        table = { header: got.header, rows: got.rows };
        srcNote = got.note;
        cols = guessTableTypes(table.header, table.rows);
        st.clear();
        renderColumns();
        regenerate();
        return;
      }
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      srcNote = null;
      const r = await readWorkbook(f);
      wb = r.wb;
      // ‼️ ชีทที่ผู้ใช้ซ่อนไว้ มักเป็นข้อมูลที่ตั้งใจไม่ให้คนอื่นเห็น ไม่เอามาเป็นตัวเลือกตั้งต้น
      const v = splitSheetsByVisibility(wb);
      sheetNames = v.visible.length ? v.visible : v.all;
      hiddenNames = v.hidden;
      if (!sheetNames.length) throw new Error(tr("ไม่พบชีทในไฟล์นี้", "No sheets found in this file"));
      sheetSel.innerHTML = "";
      sheetNames.forEach((n, i) => sheetSel.appendChild(el("option", { value: String(i) }, n)));
      sheetField.hidden = sheetNames.length < 2;
      st.clear();
      if (r.encNote) st.info(r.encNote);
      pickSheet(0);
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + (e.message || e));
    }
  }

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    if (!table.header.length) { st.err(tr("ชีทนี้ว่างเปล่า", "This sheet is empty")); return; }
    cols = guessTableTypes(table.header, table.rows);
    renderColumns();
    regenerate();
  }

  function renderColumns() {
    const rows = cols.map((c, i) => {
      const sel = select(PQ_TYPES.map((t) => [t.id, t.label()]), c.type);
      sel.onchange = () => { cols[i].type = sel.value; cols[i].confidence = "user"; regenerate(); };
      const sample = table.rows.slice(0, 3)
        .map((r) => (r[i] == null ? "" : String(r[i]))).filter(Boolean).join(" , ");
      const needsCheck = c.confidence === "low" || c.confidence === "medium";
      const nameCell = el("td", { class: "pq-name", title: c.name }, [
        el("span", {}, c.name),
        ...(needsCheck ? [el("span", { class: "pq-flag" }, tr("ควรตรวจ", "check"))] : []),
        ...(c.reason ? [el("small", { class: "pq-why" }, c.reason)] : []),
      ]);
      const tr_ = el("tr", { "data-check": needsCheck ? "1" : "0" }, [
        nameCell, el("td", {}, [sel]), el("td", { class: "pq-sample", title: sample }, sample),
      ]);
      return tr_;
    });

    const warnCount = cols.filter((c) => c.confidence === "low" || c.confidence === "medium").length;
    summary.innerHTML = "";
    summary.append(
      el("div", {}, tr(`อ่านได้ ${table.rows.length.toLocaleString("th-TH")} แถว ${cols.length} คอลัมน์` +
                       (warnCount ? `, มี ${warnCount} คอลัมน์ที่ควรตรวจสอบก่อนใช้` : ", เดาชนิดได้ชัดเจนทุกคอลัมน์"),
                       `${table.rows.length.toLocaleString("en-US")} rows, ${cols.length} columns` +
                       (warnCount ? `, ${warnCount} column(s) worth checking` : ", every column inferred confidently"))),
      ...(hiddenNames.length
        ? [el("div", {}, tr(`ข้ามชีทที่ซ่อนไว้ ${hiddenNames.length} ชีท (${hiddenNames.join(", ")})`,
                            `Skipped ${hiddenNames.length} hidden sheet(s) (${hiddenNames.join(", ")})`))]
        : []),
      ...(srcNote ? [el("div", {}, srcNote)] : []),
    );

    colsBox.innerHTML = "";
    colsBox.append(
      el("div", { class: "row" }, [onlyWarnRow]),
      el("div", { class: "pq-scroll" }, [el("table", { class: "pq-cols" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, tr("คอลัมน์", "Column")),
          el("th", {}, tr("ชนิดข้อมูลใน Power Query", "Power Query type")),
          el("th", {}, tr("ตัวอย่างค่า", "Sample values")),
        ])]),
        el("tbody", {}, rows),
      ])]),
    );
    applyFilter();
  }

  function applyFilter() {
    for (const row of colsBox.querySelectorAll(".pq-cols tbody tr"))
      row.hidden = onlyWarn.checked && row.dataset.check !== "1";
  }

  function regenerate() {
    if (!table) return;
    const limit = +rowsSel.value || table.rows.length;
    const used = table.rows.slice(0, limit);
    const code = buildTableCode(cols, used, { nullable: true });
    codeBox.textContent = shapeSel.value === "query" ? wrapAsQuery(code) : "= " + code;
    codeBox.hidden = false;
    actions.hidden = false;
    const cut = table.rows.length - used.length;
    st.ok(tr(`สร้างโค้ดแล้ว ${used.length.toLocaleString("th-TH")} แถว` +
             (cut ? `, ตัดออก ${cut.toLocaleString("th-TH")} แถวตามที่ตั้งไว้` : ""),
             `Code ready, ${used.length.toLocaleString("en-US")} rows` +
             (cut ? `, ${cut.toLocaleString("en-US")} rows left out by your setting` : "")));
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeBox.textContent);
      st.ok(tr("คัดลอกลงคลิปบอร์ดแล้ว วางใน Power Query ได้เลย", "Copied, paste it into Power Query"));
    } catch {
      st.err(tr("เบราว์เซอร์ไม่ให้คัดลอกอัตโนมัติ ลากคลุมโค้ดแล้วกด Ctrl+C แทน",
                "The browser blocked copying. Select the code and press Ctrl+C instead"));
    }
  }

  function saveCode() {
    const blob = new Blob([codeBox.textContent], { type: "text/plain;charset=utf-8" });
    download(blob, (dz.files[0]?.name || "table").replace(/\.[^.]+$/, "") + ".pq.txt");
  }

  return wrap;
}

/* แผงสอนเขียนสูตร อยู่ในหน้าเดียวกับเครื่องมือ เพราะคนเรียนตอนกำลังใช้งานจริงจำได้ดีที่สุด
   เนื้อหาอ้างอิงเอกสารทางการของ Microsoft (Power Query M language specification) */
function teachPanel() {
  const rows = [
    ["ข้อความ", "text", '"สมชาย"'],
    ["จำนวนเต็ม", "Int64.Type", "1001"],
    ["ทศนิยม", "number", "12500.50"],
    ["จำนวนเงิน", "Currency.Type", "12500.5000"],
    ["เปอร์เซ็นต์", "Percentage.Type", "0.875"],
    ["วันที่", "date", "#date(2026,9,1)"],
    ["วันที่และเวลา", "datetime", "#datetime(2026,9,1,8,30,0)"],
    ["วันที่ เวลา โซนเวลา", "datetimezone", "#datetimezone(2026,9,1,8,30,0,7,0)"],
    ["เวลา", "time", "#time(8,30,0)"],
    ["ช่วงเวลา", "duration", "#duration(2,5,30,0)"],
    ["จริง/เท็จ", "logical", "true"],
    ["ไม่มีค่า", "nullable ...", "null"],
  ];
  return el("details", { class: "pq-teach" }, [
    el("summary", {}, tr("วิธีเขียนสูตร M ด้วยตัวเอง (กดเพื่อดู)", "How to write M yourself (click to open)")),
    el("p", {}, tr("โครงของ #table มีสองส่วน ส่วนแรกคือประกาศชนิดของแต่ละคอลัมน์ ส่วนที่สองคือค่าทีละแถว",
                   "#table has two parts, first declares each column's type, second lists the row values")),
    el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("ชนิด", "Kind")),
        el("th", {}, tr("เขียนในส่วนประกาศ", "In the type part")),
        el("th", {}, tr("เขียนค่าอย่างไร", "How to write a value")),
      ])]),
      el("tbody", {}, rows.map(([a, b, c]) => el("tr", {}, [
        el("td", {}, tr(a, a)), el("td", {}, [el("code", {}, b)]), el("td", {}, [el("code", {}, c)]),
      ]))),
    ]),
    el("p", {}, tr("สามข้อที่พลาดกันบ่อยที่สุด", "The three most common mistakes")),
    el("ol", {}, [
      el("li", {}, tr("เปอร์เซ็นต์เก็บเป็นสัดส่วน 87.5% ต้องเขียน 0.875 ไม่ใช่ 87.5",
                      "Percentage is stored as a fraction, 87.5% is written 0.875, not 87.5")),
      el("li", {}, tr("เครื่องหมายคำพูดในข้อความต้องเขียนซ้อนสองตัว และถ้าข้อความมี #( ต้องเขียนเป็น #(#)(",
                      'A quote inside text must be doubled, and a literal #( must be written #(#)(')),
      el("li", {}, tr("ชื่อคอลัมน์ที่มีช่องว่างหรือเป็นภาษาไทย ต้องครอบด้วย #\"...\"",
                      'Column names with spaces or Thai text must be wrapped in #"..."')),
    ]),
    el("p", {}, tr("เอาโค้ดไปใช้ยังไง", "How to use the code")),
    el("ol", {}, [
      el("li", {}, tr("ใน Excel หรือ Power BI เปิด Power Query Editor", "In Excel or Power BI open the Power Query Editor")),
      el("li", {}, tr("กด New Source แล้วเลือก Blank Query", "Click New Source, then Blank Query")),
      el("li", {}, tr("กด Advanced Editor แล้ววางโค้ดที่คัดลอกไป", "Open Advanced Editor and paste the copied code")),
      el("li", {}, tr("ถ้าเลือกแบบ เฉพาะ #table ให้วางในช่องสูตรของขั้นตอนใหม่แทน",
                      'If you picked "#table only", paste it into the formula bar of a new step instead')),
    ]),
  ]);
}
