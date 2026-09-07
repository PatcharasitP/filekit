import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { useThaiFont, warmThaiFont, THAI_FONT } from "../thaifont.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;
  warmThaiFont();

  const dz = dropzone({
    accept: ".xlsx,.xls,.csv", multiple: false,
    hint: "รองรับ .xlsx · .xls · .csv",
    expect: ["xlsx", "csv"], expectLabel: "ไฟล์ Excel หรือ CSV",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const orient = select([["landscape", "แนวนอน (เหมาะกับตารางกว้าง)"], ["portrait", "แนวตั้ง"]], "landscape");
  const headerRow = select([["yes", "แถวแรกเป็นหัวตาราง"], ["no", "ไม่มีหัวตาราง"]], "yes");
  const fontSize = select([["8", "8 pt (ตารางกว้างมาก)"], ["9", "9 pt"], ["10", "10 pt"], ["12", "12 pt"]], "9");
  const go = button("📕 แปลงเป็น PDF", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("แนวกระดาษ", orient), field("หัวตาราง", headerRow), field("ขนาดตัวอักษร", fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "แต่ละชีทจะขึ้นหน้าใหม่พร้อมชื่อชีทกำกับ · รองรับข้อความไทย · สูตรจะถูกแปลงเป็นค่าผลลัพธ์ล่าสุดที่บันทึกไว้ในไฟล์"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ Excel ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังอ่านไฟล์…");
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: orient.value });
      await useThaiFont(doc, "both");

      let first = true, totalRows = 0;
      for (let s = 0; s < wb.SheetNames.length; s++) {
        const name = wb.SheetNames[s];
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
        doc.autoTable({
          head: useHead ? [rows[0].map(String)] : undefined,
          body: (useHead ? rows.slice(1) : rows).map((r) => r.map(String)),
          startY: 46,
          margin: { left: 32, right: 32, bottom: 34 },
          styles: { font: THAI_FONT, fontStyle: "normal", fontSize: +fontSize.value, cellPadding: 3, overflow: "linebreak" },
          headStyles: { font: THAI_FONT, fontStyle: "bold", fillColor: [108, 140, 255], textColor: 255 },
          alternateRowStyles: { fillColor: [246, 248, 255] },
        });
        st.progress(((s + 1) / wb.SheetNames.length) * 100, `(${s + 1}/${wb.SheetNames.length} ชีท)`);
        await yieldToBrowser();
      }
      if (first) throw new Error("ไม่พบข้อมูลในไฟล์นี้");

      const blob = doc.output("blob");
      st.progress(null);
      st.ok(`แปลงสำเร็จ ${doc.getNumberOfPages()} หน้า · ${totalRows.toLocaleString("th-TH")} แถว`);
      const outName = stripExt(file.name) + ".pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, outName), el("small", {}, `${doc.getNumberOfPages()} หน้า`)]),
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, outName) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
