import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser } from "../ui.js";
import { useThaiFont, warmThaiFont, THAI_FONT, splitThaiTextToSize } from "../thaifont.js";
import { smartDecode } from "../thai.js";
import { splitSheetsByVisibility } from "../xlsxutil.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;
  warmThaiFont();

  const dz = dropzone({
    accept: ".xlsx,.xls,.csv", multiple: false,
    hint: tr("รองรับ .xlsx, .xls, .csv", "Supports .xlsx, .xls, .csv"),
    expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "Excel or CSV file"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; includeHidden = false; },
  });

  const orient = select([["landscape", tr("แนวนอน (เหมาะกับตารางกว้าง)", "Landscape (good for wide tables)")], ["portrait", tr("แนวตั้ง", "Portrait")]], "landscape");
  const headerRow = select([["yes", tr("แถวแรกเป็นหัวตาราง", "First row is the header")], ["no", tr("ไม่มีหัวตาราง", "No header row")]], "yes");
  const fontSize = select([["8", tr("8 pt (ตารางกว้างมาก)", "8 pt (very wide tables)")], ["9", "9 pt"], ["10", "10 pt"], ["12", "12 pt"]], "9");
  // ค่าตั้งต้นคือ "ไม่พิมพ์ชีทที่ซ่อนไว้" · ผู้ใช้กดขอเองได้ทีหลังเมื่อเห็นว่ามีชีทซ่อนอยู่จริง
  let includeHidden = false;

  const go = button(tr("แปลงเป็น PDF", "Convert to PDF"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("แนวกระดาษ", "Page orientation"), orient), field(tr("หัวตาราง", "Table header"), headerRow), field(tr("ขนาดตัวอักษร", "Font size"), fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("แต่ละชีทขึ้นหน้าใหม่, สูตรแปลงเป็นค่าล่าสุดที่บันทึกไว้",
       "Each sheet starts a new page, formulas convert to their last saved values")));

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ Excel ก่อน", "Please choose an Excel file first"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
    try {
      // CSV ที่ไม่ใช่ UTF-8 (ส่งออกจากระบบเก่า) ต้องเดาการเข้ารหัสก่อน ไม่งั้นไทยเพี้ยนทั้งไฟล์
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = /\.(csv|txt|tsv)$/i.test(file.name)
        ? XLSX.read(smartDecode(buf).text, { type: "string" })
        : XLSX.read(buf, { type: "array" });
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: orient.value });
      await useThaiFont(doc, "both");

      // ‼️ ชีทที่ผู้ใช้ซ่อนไว้ = ของที่ตั้งใจไม่ให้คนอื่นเห็น ห้ามพิมพ์ลง PDF ให้เองโดยไม่ถาม
      const { visible, hidden } = splitSheetsByVisibility(wb);
      const picked = includeHidden ? [...visible, ...hidden] : visible;
      if (!picked.length && hidden.length)
        throw new Error(tr("ไฟล์นี้มีแต่ชีทที่ซ่อนไว้ กดปุ่มด้านล่างถ้าต้องการพิมพ์ชีทที่ซ่อน",
                           "This file only has hidden sheets. Use the button below if you want them printed"));

      let first = true, totalRows = 0;
      for (let s = 0; s < picked.length; s++) {
        const name = picked[s];
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false });
        const rows = aoa.filter((r) => r.some((c) => String(c).trim() !== ""));
        if (!rows.length) continue;
        totalRows += rows.length;

        if (!first) doc.addPage();
        first = false;
        doc.setFont(THAI_FONT, "bold");
        doc.setFontSize(+fontSize.value + 4);
        doc.text(name, 40, 34);

        const useHead = headerRow.value === "yes" && rows.length > 1;
        /* ‼️ autoTable ตัดบรรทัดในเซลล์ด้วย doc.splitTextToSize ของ jsPDF ซึ่งฉีกคำไทยกลางคำ
           (เจอจริง 09/09/2026: คอลัมน์แคบ "หมายเหตุ" ถูกตัดเป็น หม / ายเ / หตุ อ่านไม่รู้เรื่อง)
           สลับตัวตัดบรรทัดเฉพาะช่วงที่ autoTable ทำงานแล้วคืนของเดิมทันที ปลอดภัยกว่าไปแก้ไฟล์ vendor */
        const nativeSplit = doc.splitTextToSize.bind(doc);
        doc.splitTextToSize = (t, w, o) => (Array.isArray(t) ? t : [t]).flatMap(
          (x) => splitThaiTextToSize(doc, x, w, { fallback: nativeSplit, fontSize: o && o.fontSize }));
        try {
        doc.autoTable({
          head: useHead ? [rows[0].map(String)] : undefined,
          body: (useHead ? rows.slice(1) : rows).map((r) => r.map(String)),
          startY: 46,
          margin: { left: 32, right: 32, bottom: 34 },
          styles: { font: THAI_FONT, fontStyle: "normal", fontSize: +fontSize.value, cellPadding: 3, overflow: "linebreak" },
          headStyles: { font: THAI_FONT, fontStyle: "bold", fillColor: [108, 140, 255], textColor: 255 },
          alternateRowStyles: { fillColor: [246, 248, 255] },
        });
        } finally { doc.splitTextToSize = nativeSplit; }
        st.progress(((s + 1) / picked.length) * 100, tr(`(${s + 1}/${picked.length} ชีท)`, `(${s + 1}/${picked.length} sheets)`));
        await yieldToBrowser();
      }
      if (first) throw new Error(tr("ไม่พบข้อมูลในไฟล์นี้", "No data was found in this file"));

      const blob = doc.output("blob");
      st.progress(null);
      st.ok(tr(`แปลงสำเร็จ ${doc.getNumberOfPages()} หน้า, ${totalRows.toLocaleString("th-TH")} แถว`,
               `Done, ${doc.getNumberOfPages()} pages, ${totalRows.toLocaleString("en-US")} rows`));
      const outName = stripExt(file.name) + ".pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, outName), el("small", {}, tr(`${doc.getNumberOfPages()} หน้า`, `${doc.getNumberOfPages()} pages`))]),
        downloadButton(blob, outName),
      ]));
      if (hidden.length && !includeHidden) results.appendChild(el("div", { class: "note warn" }, [
        el("div", {}, tr(`ข้ามชีทที่ซ่อนไว้ในไฟล์ ${hidden.length} ชีท (${hidden.join(", ")}) เพราะมักเป็นข้อมูลที่ตั้งใจไม่ให้เผยแพร่`,
                         `Skipped ${hidden.length} hidden sheet(s) (${hidden.join(", ")}) because they are usually meant to stay private`)),
        button(tr("พิมพ์ชีทที่ซ่อนด้วย", "Include the hidden sheets too"),
               { onclick: () => { includeHidden = true; run(); } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
