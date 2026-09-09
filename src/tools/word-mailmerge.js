import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { readPlaceholders, mergeAll, buildRecords, negName, isNegName } from "../docxmerge.js";
import { loadLibs } from "../loader.js";
import { smartDecode } from "../thai.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  let tplFile = null, dataFile = null;
  let fields = [];        // ตัวยึดธรรมดาในเทมเพลต
  let loops = [];         // บล็อกวนซ้ำ เช่น {{#รายการ}} … {{/รายการ}}
  let rows = [];          // ข้อมูลจาก Excel
  let columns = [];       // ชื่อคอลัมน์ใน Excel
  const mapping = {};     // ตัวยึด -> คอลัมน์

  // ── ขั้นที่ 1: เทมเพลต Word ───────────────────────────────────────────────
  const tplZone = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word files (.docx)"),
    accept: ".docx", multiple: false,
    hint: tr("ไฟล์ Word ที่มีตัวยึด เช่น {{ชื่อ}}", "Word file with placeholders, e.g. {{Name}}"),
    onChange: async (f) => { tplFile = f[0] || null; await scanTemplate(); },
  });

  // ── ขั้นที่ 2: ข้อมูล Excel/CSV ───────────────────────────────────────────
  const dataZone = dropzone({
    expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "Excel or CSV files"),
    accept: ".xlsx,.xls,.csv", multiple: false,
    hint: tr("แถวแรก = หัวคอลัมน์, 1 แถว = 1 เอกสาร", "Row 1 = headers, 1 row = 1 doc"),
    onChange: async (f) => { dataFile = f[0] || null; await scanData(); },
  });

  const fieldsBox = el("div", { class: "mm-box", hidden: true });
  const mapBox = el("div", { class: "mm-box", hidden: true });
  const previewBox = el("div", { class: "mm-box", hidden: true });

  const modeSel = select([["row", tr("หนึ่งแถว = หนึ่งเอกสาร", "One row = one document")], ["group", tr("รวมหลายแถวเป็น 1 เอกสาร (ตารางรายการ)", "Combine rows into 1 doc (item tables)")]], "row");
  const groupCol = el("select", {});
  const loopSel = el("select", {});
  const groupField = field(tr("จัดกลุ่มด้วยคอลัมน์", "Group by column"), groupCol, tr("ค่าตรงกันรวมเป็นเอกสารเดียว", "Matching values combine into one doc"));
  const loopField = field(tr("ใส่รายการลงบล็อก", "Fill list items into block"), loopSel);
  const nameCol = el("select", {});
  const go = button(tr("สร้างเอกสารทั้งชุด", "Generate all documents"), { onclick: run });
  go.disabled = true;
  let step3, step4, wait3, wait4;

  // ขั้นที่ยังทำอะไรไม่ได้ต้องบอกให้รู้ว่ารออะไรอยู่ ไม่ใช่โชว์หัวข้อลอย ๆ แล้วปล่อยให้เดา
  // ‼️ แถบลงมือทำต้องรวม "ปุ่ม + สถานะ" ไว้ก้อนเดียวและเป็นลูกคนสุดท้ายของแผง
  //    position:sticky ลอยได้แค่ภายในกรอบพ่อ และหยุดลอยเมื่อของที่อยู่ "ใต้มันในแผง" ไล่มาถึง
  //    เดิมมี st.node กับ results ต่อท้ายอีก 537px ปุ่มจึงหลุดจอช่วงท้ายหน้า
  //    (วัดจริงบนจอ 390x844: เลื่อนถึง 90% ปุ่มอยู่ที่ top=-271px) หลักเดียวกับ .ws-footer
  const goRow = el("div", { class: "actions", "data-locked": "1" }, [go, st.node]);

  function syncLocks() {
    const on3 = mapBox.childElementCount > 0;
    const on4 = previewBox.childElementCount > 0;
    step3?.setAttribute("data-locked", on3 ? "0" : "1");
    step4?.setAttribute("data-locked", on4 ? "0" : "1");
    goRow.setAttribute("data-locked", on4 ? "0" : "1");   // ปุ่มยังหรี่ตามขั้นที่ 4 เหมือนเดิม
    if (sampleBox) sampleBox.hidden = on4;                // มีไฟล์ครบแล้วไม่ต้องชวนโหลดตัวอย่างอีก
    if (wait3) wait3.hidden = on3;
    if (wait4) wait4.hidden = on4;
  }

  body.append(
    el("div", { class: "mm-step" }, [el("span", { class: "mm-num" }, "1"),
      el("div", {}, [el("h2", {}, tr("เลือกเทมเพลต Word", "Choose a Word template")), tplZone.container, fieldsBox])]),
    el("div", { class: "mm-step" }, [el("span", { class: "mm-num" }, "2"),
      el("div", {}, [el("h2", {}, tr("เลือกไฟล์ข้อมูล", "Choose a data file")), dataZone.container])]),
    step3 = el("div", { class: "mm-step", "data-locked": "1" }, [el("span", { class: "mm-num" }, "3"),
      el("div", {}, [el("h2", {}, tr("จับคู่ข้อมูลกับตัวยึด", "Match data to placeholders")),
        wait3 = el("div", { class: "step-wait" }, tr("รอไฟล์จากขั้นที่ 1-2 — จับคู่คอลัมน์ให้อัตโนมัติ", "Waiting for files from steps 1–2 — columns match automatically")),
        mapBox])]),
    step4 = el("div", { class: "mm-step", "data-locked": "1" }, [el("span", { class: "mm-num" }, "4"),
      el("div", {}, [el("h2", {}, tr("ตรวจดูก่อนสร้าง", "Preview before generating")),
        wait4 = el("div", { class: "step-wait" }, tr("จะโชว์ตัวอย่างแถวแรกเมื่อจับคู่ข้อมูลเสร็จ", "Preview shows once the data is matched")),
        previewBox,
        el("div", { class: "row" }, [
          field(tr("รูปแบบเอกสาร", "Document mode"), modeSel),
          groupField, loopField,
          field(tr("ตั้งชื่อไฟล์จากคอลัมน์", "Name files from column"), nameCol, tr("เว้นไว้ = ตั้งชื่อตามลำดับ", "Leave blank = name by sequence")),
        ])])]),
    // ‼️ ปุ่มลงมือต้องเป็นลูกตรงของ .panel ไม่ใช่ซ้อนอยู่ในขั้นที่ 4
    //    position:sticky ลอยได้แค่ในกรอบของพ่อตัวเอง — ตอนอยู่ในขั้นที่ 4 มันลอยไม่พ้นขั้นนั้น
    //    บนมือถือจึงต้องเลื่อนลงไป 3,575px ถึงจะกดได้ (วัดจริงจาก tests/browser_mobile.py)
    //    ย้ายออกมาแล้วแถบลอยติดขอบล่างจอตามกฎ .panel:has(.file-row) .actions
    results, goRow);

  // ให้ลองใช้ได้ทันทีโดยไม่ต้องเตรียมไฟล์เอง — คนส่วนใหญ่ติดตรงไม่รู้ว่าเทมเพลตหน้าตายังไง
  // ‼️ พอมีไฟล์ครบทั้งสองขั้นแล้วกล่องนี้หมดหน้าที่ — ซ่อนทิ้ง (สูง 247px คั่นระหว่างปุ่มกับท้ายหน้า)
  const sampleBox = el("div", { class: "sample-box" }, [
    el("div", {}, [
      el("strong", {}, tr("ยังไม่มีไฟล์? ลองด้วยตัวอย่างสำเร็จรูปได้เลย", "No files yet? Try the ready-made sample")),
      el("p", { class: "mm-label", style: { margin: "5px 0 0" } },
        tr("มีทั้งแบบเรียบง่ายและแบบตารางรายการ พร้อมตัวอย่างเงื่อนไข",
           "Includes a simple sample and a table-based sample with conditions")),
    ]),
    el("div", { class: "sample-links" }, [
      el("a", { class: "chip", href: "samples/ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx", download: true }, tr("เทมเพลตประเมิน", "Evaluation template")),
      el("a", { class: "chip", href: "samples/ตัวอย่าง-ข้อมูลพนักงาน.xlsx", download: true }, tr("ข้อมูลพนักงาน", "Employee data")),
      el("a", { class: "chip", href: "samples/ตัวอย่าง-ใบเสนอราคา.docx", download: true }, tr("เทมเพลตใบเสนอราคา", "Quotation template")),
      el("a", { class: "chip", href: "samples/ตัวอย่าง-ข้อมูลใบเสนอราคา.xlsx", download: true }, tr("ข้อมูลใบเสนอราคา", "Quotation data")),
      el("a", { class: "chip", href: "samples/อ่านก่อนใช้.txt", download: true }, tr("วิธีเขียนตัวยึด", "How to write placeholders")),
    ]),
  ]);
  body.appendChild(sampleBox);
  syncLocks();          // เรียกหลังประกาศ sampleBox แล้วเท่านั้น — ไม่งั้นชนกับ TDZ ของ const

  body.appendChild(el("div", { class: "note" },
    tr("พิมพ์ตัวยึดในไฟล์ Word เช่น {{คำนำหน้า}}{{ชื่อ}} แล้วจับคู่คอลัมน์ Excel — สร้างเอกสารทีละแถว รองรับหัว-ท้ายกระดาษ",
    "Type placeholders like {{Title}}{{Name}} in Word, then match Excel columns — one document per row. Headers/footers supported")));

  body.appendChild(el("div", { class: "note" },
    tr("เงื่อนไข: {{#โบนัส}}…{{/โบนัส}} + Excel ใส่ TRUE/FALSE (หรือ ใช่/ไม่ใช่, มี/ไม่มี), ตรงข้าม {{#ไม่โบนัส}}…{{/ไม่โบนัส}} ไม่ต้องเพิ่มคอลัมน์",
    "Condition: {{#Bonus}}…{{/Bonus}} + Excel TRUE/FALSE (ใช่/ไม่ใช่, มี/ไม่มี work too), Opposite: {{#notBonus}}…{{/notBonus}}, no extra column")));

  body.appendChild(el("div", { class: "note" },
    tr("ตารางรายการ: ใส่ {{#รายการ}} ที่ช่องแรกและ {{/รายการ}} ที่ช่องสุดท้ายของแถว",
    "Item table: put {{#Items}} in the first cell and {{/Items}} in the last cell")));

  // ── อ่านตัวยึดจากเทมเพลต ─────────────────────────────────────────────────
  async function scanTemplate() {
    fieldsBox.hidden = true; fieldsBox.innerHTML = "";
    fields = [];
    if (!tplFile) return refresh();
    st.info(tr("กำลังอ่านตัวยึดในเทมเพลต…", "Reading placeholders in the template…"));
    try {
      const parsed = await readPlaceholders(tplFile);
      fields = parsed.fields; loops = parsed.loops;
      st.clear();
      fieldsBox.hidden = false;
      if (!fields.length && !loops.length) {
        fieldsBox.appendChild(el("div", { class: "status show err" },
          tr("ไม่พบตัวยึด — ต้องอยู่ในรูป {{ชื่อคอลัมน์}} เช่น {{ชื่อ}}",
             "No placeholders found — must look like {{ColumnName}}, e.g. {{Name}}")));
      } else {
        fieldsBox.append(
          el("p", { class: "mm-label" }, tr(`พบตัวยึด ${fields.length} รายการ` +
            (loops.length ? `และบล็อกวนซ้ำ ${loops.length} บล็อก` : ""),
            `Found ${fields.length} placeholders` + (loops.length ? ` and ${loops.length} repeat blocks` : ""))),
          el("div", { class: "stack" }, fields.map((f) => el("span", { text: `{{${f}}}` })))
        );
        if (loops.length) {
          fieldsBox.append(
            el("p", { class: "mm-label", style: { marginTop: "10px" } }, tr("บล็อกวนซ้ำ (ตารางรายการ)", "Repeat blocks (item tables)")),
            el("div", { class: "stack" }, loops.map((f) => el("span", { class: "mm-loop", text: `{{#${f}}} … {{/${f}}}` })))
          );
        }
      }
    } catch (e) {
      st.err(tr("อ่านเทมเพลตไม่สำเร็จ: ", "Could not read template: ") + e.message);
    }
    buildMapping(); refresh();
  }

  // ── อ่านข้อมูลจาก Excel/CSV ──────────────────────────────────────────────
  async function scanData() {
    rows = []; columns = [];
    if (!dataFile) { buildMapping(); return refresh(); }
    st.info(tr("กำลังอ่านข้อมูล…", "Reading data…"));
    try {
      const [XLSXLib] = await loadLibs("xlsx");
      const dbuf = new Uint8Array(await dataFile.arrayBuffer());
      const wb = /\.(csv|txt|tsv)$/i.test(dataFile.name)
        ? XLSXLib.read(smartDecode(dbuf).text, { type: "string" })   // CSV ไทยเพี้ยนก็อ่านออก
        : XLSXLib.read(dbuf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSXLib.utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (!rows.length) throw new Error(tr("ไม่พบข้อมูล (ต้องมีหัวตาราง + 1 แถวข้อมูล)", "No data found (needs a header + 1 data row)"));
      columns = Object.keys(rows[0]);
      st.ok(tr(`อ่านข้อมูลได้ ${rows.length.toLocaleString("th-TH")} แถว, ${columns.length} คอลัมน์ จากชีท “${wb.SheetNames[0]}”`,
        `Read ${rows.length.toLocaleString("en-US")} rows, ${columns.length} columns from sheet “${wb.SheetNames[0]}”`));
    } catch (e) {
      st.err(tr("อ่านไฟล์ข้อมูลไม่สำเร็จ: ", "Could not read the data file: ") + e.message);
    }
    buildMapping(); refresh();
  }

  // ── จับคู่ตัวยึดกับคอลัมน์ (เดาให้ก่อนจากชื่อที่ตรงกัน) ──────────────────
  function buildMapping() {
    mapBox.innerHTML = "";
    Object.keys(mapping).forEach((k) => delete mapping[k]);
    if (!fields.length || !columns.length) {
      mapBox.hidden = true;
      nameCol.innerHTML = "";
      return;
    }
    mapBox.hidden = false;
    const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, "");
    const byNorm = new Map(columns.map((c) => [norm(c), c]));

    const grid = el("div", { class: "mm-grid" });
    // บล็อกเงื่อนไข (เช่น {{#ได้โบนัส}}) ก็ต้องจับคู่กับคอลัมน์เหมือนตัวยึดธรรมดา
    // ไม่งั้นค่าจะไม่ถูกส่งเข้าเทมเพลตและเงื่อนไขจะไม่ทำงานเลย
    // ส่วนบล็อกวนซ้ำที่รับรายการ (ใช้ในโหมดจัดกลุ่ม) ไม่ต้องจับคู่ เพราะระบบสร้างให้เอง
    // ‼️ ใช้ตัวเดียวกับที่ตัวรวมเอกสารใช้ (src/docxmerge.js) ไม่งั้นหน้าจอกับผลลัพธ์จะคิดคนละแบบ
    const loopSet = new Set(loops);
    const condFields = loops.filter((l) => !loopSet.has(negName(l)) || !isNegName(l));
    const mappable = [...fields, ...loops.filter((l) => !isNegName(l))];
    mappable.forEach((f) => {
      const guess = byNorm.get(norm(f)) || "";
      mapping[f] = guess;
      const sel = el("select", { onchange: (e) => { mapping[f] = e.target.value; renderPreview(); renderUnmatched(); refresh(); } });
      sel.appendChild(el("option", { value: "" }, tr("— ไม่ใช้ —", "— Not used —")));
      columns.forEach((c) => sel.appendChild(el("option", { value: c, selected: c === guess }, c)));
      grid.append(
        el("code", { class: "mm-key", text: `{{${f}}}` }),
        el("span", { class: "mm-arrow" }, "←"),
        sel
      );
    });
    mapBox.append(el("p", { class: "mm-label" }, tr("ระบบจับคู่ให้อัตโนมัติเมื่อชื่อตรงกัน ปรับเองได้", "Matched automatically when names match — adjust as needed")), grid);

    renderUnmatched();
    syncLocks();

    nameCol.innerHTML = "";
    nameCol.appendChild(el("option", { value: "" }, tr("— ตั้งชื่อตามลำดับ —", "— Name by sequence —")));
    columns.forEach((c) => nameCol.appendChild(el("option", { value: c }, c)));

    groupCol.innerHTML = "";
    columns.forEach((c) => groupCol.appendChild(el("option", { value: c }, c)));
    loopSel.innerHTML = "";
    loops.forEach((l) => loopSel.appendChild(el("option", { value: l }, `{{#${l}}}`)));
    if (loops.length && modeSel.value === "row" && rows.length > new Set(rows.map(r => r[columns[0]])).size) {
      // ข้อมูลมีค่าซ้ำในคอลัมน์แรกและเทมเพลตมีบล็อกวนซ้ำ → น่าจะตั้งใจทำแบบจัดกลุ่ม
      modeSel.value = "group"; groupCol.value = columns[0];
    }
    syncMode();
    renderPreview();
  }

  // ── พรีวิวแถวแรก ให้เห็นผลก่อนสร้างจริง ─────────────────────────────────
  function renderPreview() {
    previewBox.innerHTML = "";
    queueMicrotask(syncLocks);
    if (!rows.length || !fields.length) { previewBox.hidden = true; return; }
    previewBox.hidden = false;
    const r = rows[0];
    const list = el("div", { class: "mm-preview" });
    const shown = [...fields, ...loops.filter((l) => !isNegName(l) && mapping[l] !== undefined)];
    shown.forEach((f) => {
      const col = mapping[f];
      const v = col ? String(r[col] ?? "") : "";
      list.append(
        el("code", { class: "mm-key", text: `{{${f}}}` }),
        el("span", { class: "mm-arrow" }, "→"),
        el("span", { class: v ? "mm-val" : "mm-val empty", text: v || (col ? tr("(ว่างในแถวแรก)", "(empty in first row)") : tr("(ยังไม่จับคู่)", "(not mapped yet)")) })
      );
    });
    let head = tr(`ตัวอย่างจากแถวแรกของข้อมูล — จะสร้างทั้งหมด ${rows.length.toLocaleString("th-TH")} ไฟล์`,
      `Preview from the first data row — will generate ${rows.length.toLocaleString("en-US")} files total`);
    if (modeSel.value === "group" && groupCol.value) {
      const n = new Set(rows.map((r) => String(r[groupCol.value] ?? ""))).size;
      head = tr(`จัดกลุ่มตามคอลัมน์ “${groupCol.value}” — จะได้ ${n.toLocaleString("th-TH")} ไฟล์ จาก ${rows.length.toLocaleString("th-TH")} แถว`,
        `Grouped by column “${groupCol.value}” — will produce ${n.toLocaleString("en-US")} files from ${rows.length.toLocaleString("en-US")} rows`);
    }
    previewBox.append(el("p", { class: "mm-label" }, head), list);
  }

  // เตือนเฉพาะตัวยึดที่ผู้ใช้ต้องจับคู่จริง — ไม่นับบล็อกที่ระบบเติมรายการให้เองในโหมดจัดกลุ่ม
  let warnNode = null;
  function renderUnmatched() {
    warnNode?.remove(); warnNode = null;
    if (!mapBox || mapBox.hidden) return;
    const skip = modeSel.value === "group" && loopSel.value ? loopSel.value : null;
    const list = [...fields, ...loops.filter((l) => !isNegName(l))]
      .filter((f) => f !== skip && !mapping[f]);
    if (!list.length) return;
    warnNode = el("div", { class: "status show err", style: { marginTop: "12px" } },
      tr(`ยังไม่ได้จับคู่ ${list.length} ตัวยึด: ${list.map((f) => `{{${f}}}`).join(" ")}`,
         `${list.length} placeholders not yet mapped: ${list.map((f) => `{{${f}}}`).join(" ")}`));
    mapBox.appendChild(warnNode);
  }

  function syncMode() {
    const grouped = modeSel.value === "group";
    groupField.style.display = grouped ? "" : "none";
    loopField.style.display = grouped ? "" : "none";
    renderPreview();
  }
  modeSel.addEventListener("change", () => { syncMode(); renderUnmatched(); refresh(); });
  groupCol.addEventListener("change", renderPreview);
  loopSel.addEventListener("change", () => { renderPreview(); renderUnmatched(); });

  const refresh = () => {
    const grouped = modeSel.value === "group";
    go.disabled = !(tplFile && rows.length && (fields.length || loops.length)
                    && (!grouped || (groupCol.value && loopSel.value)));
  };

  // ── สร้างเอกสารทั้งชุด ───────────────────────────────────────────────────
  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังสร้างเอกสาร…", "Generating documents…"));
    try {
      const base = stripExt(tplFile.name);
      const used = new Map();
      const nameOf = (record, i) => {
        const src = record.__rows ? record.__rows[0] : null;
        let label = "";
        if (nameCol.value) {
          label = src ? String(src[nameCol.value] ?? "").trim()
                      : String(record[Object.keys(mapping).find((f) => mapping[f] === nameCol.value)] ?? "").trim();
        }
        label = label.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);   // กันอักขระที่ตั้งชื่อไฟล์ไม่ได้
        let name = label ? `${base}-${label}` : `${base}-${i + 1}`;
        const n = (used.get(name) || 0) + 1;                        // ชื่อซ้ำให้เติมเลขต่อท้าย
        used.set(name, n);
        return (n > 1 ? `${name} (${n})` : name) + ".docx";
      };

      const cleanMapping = { ...mapping };
      if (modeSel.value === "group" && loopSel.value) delete cleanMapping[loopSel.value];
      const records = buildRecords(rows, {
        mode: modeSel.value,
        groupBy: groupCol.value,
        loopName: loopSel.value,
        mapping: cleanMapping,
      });

      const made = await mergeAll(tplFile, records, {
        nameOf,
        onProgress: ({ done, total }) => st.progress((done / total) * 100, `(${done}/${total})`),
      });

      st.progress(null);
      const totalSize = made.reduce((a, m) => a + m.blob.size, 0);
      st.ok(tr(`สร้างเอกสารสำเร็จ ${made.length.toLocaleString("th-TH")} ไฟล์, รวม ${fmtBytes(totalSize)}`,
        `Done — ${made.length.toLocaleString("en-US")} files, ${fmtBytes(totalSize)} total`));

      if (made.length > 1) {
        results.appendChild(el("div", { class: "actions" }, [
          button(tr("โหลดทั้งหมด (ZIP)", "Download all (ZIP)"), { icon: "zip",  onclick: async () => {
            st.info(tr("กำลังบีบเป็น ZIP…", "Zipping…"));
            const [JSZipLib] = await loadLibs("jszip");
            const zip = new JSZipLib();
            made.forEach((m) => zip.file(m.name, m.blob));
            download(await zip.generateAsync({ type: "blob" }), tr(`${base}-รวม ${made.length} ไฟล์.zip`, `${base}-combined ${made.length} files.zip`));
            st.ok(tr("ดาวน์โหลด ZIP แล้ว", "ZIP downloaded"));
          } }),
        ]));
      }
      made.slice(0, 50).forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
      if (made.length > 50) results.appendChild(el("div", { class: "note" },
        tr(`แสดง 50 ไฟล์แรก, ที่เหลืออยู่ใน ZIP ครบ ${made.length} ไฟล์`,
           `Showing first 50, rest included in the ZIP (${made.length} total)`)));
      await yieldToBrowser();
    } catch (e) {
      st.progress(null);
      st.err(tr("สร้างเอกสารไม่สำเร็จ: ", "Could not generate documents: ") + e.message);
    } finally { refresh(); }
  }

  return wrap;
}
