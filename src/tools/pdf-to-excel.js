import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, guessColumns, rowToCells } from "../pdftext.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  const extra = el("div", {});
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true; },
  });

  const sheetMode = select([["per-page", "แยกชีทตามหน้า"], ["single", "รวมทุกหน้าในชีทเดียว"]], "per-page");
  const strict = select([["3", "ปกติ (คอลัมน์ต้องซ้ำ ≥3 บรรทัด)"], ["2", "ยืดหยุ่น (≥2 บรรทัด)"], ["5", "เข้มงวด (≥5 บรรทัด)"]], "3");
  const go = button("แปลงเป็น Excel", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("การจัดชีท", sheetMode), field("ความเข้มในการจับคอลัมน์", strict, "ถ้าคอลัมน์เพี้ยน ลองสลับค่านี้")]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    "ระบบเดาขอบคอลัมน์จากตำแหน่งข้อความจริงในไฟล์ · ตารางที่มีเซลล์ผสาน (merge) หรือข้อความหลายบรรทัดในเซลล์เดียว " +
    "อาจต้องจัดเพิ่มใน Excel เล็กน้อย · ใช้กับ PDF ที่มีชั้นข้อความเท่านั้น (ไฟล์สแกนให้ผ่าน OCR ก่อน)"));

  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info("กำลังเตรียมตัวอ่าน OCR…");
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`);
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      const wb = XLSX.utils.book_new();
      let rows = 0;
      for (const pg of pages) {
        const aoa = pg.lines.map((l) => l.split(/\s{2,}|\t+/).map((c) => c.trim()));
        if (!aoa.length) continue;
        rows += aoa.length;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `หน้า ${pg.page}`);
      }
      if (!wb.SheetNames.length) throw new Error("อ่านไม่พบข้อความในไฟล์นี้เลย");
      const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      st.progress(null);
      st.ok(`อ่านด้วย OCR สำเร็จ ${rows.toLocaleString("th-TH")} แถว · ${wb.SheetNames.length} ชีท`);
      const name = stripExt(file.name) + ".xlsx";
      results.innerHTML = "";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, "จาก OCR — ควรตรวจทานคอลัมน์")]),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null); st.err("อ่านด้วย OCR ไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; pdf.destroy(); }
  }

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info("กำลังเปิดไฟล์…");
    try {
      const pdf = await openPdf(file, passwordBox(extra));
      if (!(await hasTextLayer(pdf))) {
        st.progress(null);
        st.info("ไฟล์นี้ไม่มีชั้นข้อความ (น่าจะเป็นไฟล์สแกน)");
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            "ระบบอ่านตัวเลขและข้อความจากภาพให้ได้ด้วย OCR แล้วจัดเป็นแถวใน Excel ให้ · " +
            "ครั้งแรกต้องดาวน์โหลดชุดภาษาราว 10-30 MB ·  ตารางจาก OCR อาจต้องจัดคอลัมน์เพิ่มเองใน Excel"),
          el("div", { class: "actions" }, [
            button("อ่านด้วย OCR แล้วทำเป็น Excel", { onclick: () => runOcr(pdf) }),
            button("ยกเลิก", { ghost: true, onclick: () => { extra.innerHTML = ""; st.clear(); pdf.destroy(); } }),
          ]),
        ]));
        go.disabled = false;
        return;
      }
      st.info("กำลังอ่านตาราง…");
      const wb = XLSX.utils.book_new();
      const all = [];
      let totalRows = 0;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const rows = await pageLines(page);
        page.cleanup();
        const cols = guessColumns(rows, +strict.value);
        const aoa = rows
          .map((r) => (cols.length > 1 ? rowToCells(r, cols) : [r.items.map((i) => i.str).join(" ")]))
          .filter((cells) => cells.some((c) => c !== ""));
        totalRows += aoa.length;

        if (sheetMode.value === "per-page") {
          if (aoa.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `หน้า ${p}`);
        } else {
          if (p > 1 && aoa.length) all.push([]);
          all.push(...aoa);
        }
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      pdf.destroy();

      if (sheetMode.value === "single") {
        if (!all.length) throw new Error("อ่านไม่พบข้อความในไฟล์นี้เลย");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), "ข้อมูล");
      }
      if (!wb.SheetNames.length) throw new Error("อ่านไม่พบข้อความในไฟล์นี้เลย");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      st.progress(null);
      st.ok(`แปลงสำเร็จ ${totalRows.toLocaleString("th-TH")} แถว · ${wb.SheetNames.length} ชีท`);

      const sample = (sheetMode.value === "single" ? all : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })).slice(0, 12);
      preview.hidden = false;
      preview.textContent = sample.map((r) => r.join(" | ")).join("\n") || "(ไม่มีข้อมูลตัวอย่าง)";

      const name = stripExt(file.name) + ".xlsx";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${wb.SheetNames.length} ชีท`)]),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
