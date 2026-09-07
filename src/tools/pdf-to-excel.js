import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, guessColumns, rowToCells } from "../pdftext.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  let file = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; preview.hidden = true; },
  });

  const sheetMode = select([["per-page", "แยกชีทตามหน้า"], ["single", "รวมทุกหน้าในชีทเดียว"]], "per-page");
  const strict = select([["3", "ปกติ (คอลัมน์ต้องซ้ำ ≥3 บรรทัด)"], ["2", "ยืดหยุ่น (≥2 บรรทัด)"], ["5", "เข้มงวด (≥5 บรรทัด)"]], "3");
  const go = button("📊 แปลงเป็น Excel", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("การจัดชีท", sheetMode), field("ความเข้มในการจับคอลัมน์", strict, "ถ้าคอลัมน์เพี้ยน ลองสลับค่านี้")]),
    el("div", { class: "actions" }, [go]), st.node, results, preview);
  body.appendChild(el("div", { class: "note" },
    "ระบบเดาขอบคอลัมน์จากตำแหน่งข้อความจริงในไฟล์ · ตารางที่มีเซลล์ผสาน (merge) หรือข้อความหลายบรรทัดในเซลล์เดียว " +
    "อาจต้องจัดเพิ่มใน Excel เล็กน้อย · ใช้กับ PDF ที่มีชั้นข้อความเท่านั้น (ไฟล์สแกนให้ผ่าน OCR ก่อน)"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info("กำลังอ่านตาราง…");
    try {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
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
        if (!all.length) throw new Error("ไม่พบข้อความในไฟล์ — ถ้าเป็นไฟล์สแกน ให้ใช้เครื่องมือ OCR ก่อน");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), "ข้อมูล");
      }
      if (!wb.SheetNames.length) throw new Error("ไม่พบข้อความในไฟล์ — ถ้าเป็นไฟล์สแกน ให้ใช้เครื่องมือ OCR ก่อน");

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
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
