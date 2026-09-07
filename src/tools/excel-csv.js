import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dirSel = select([["to-csv", "Excel → CSV (แยกทีละชีท)"], ["to-xlsx", "CSV → Excel (รวมเป็นไฟล์เดียว)"]], "to-csv");
  const dz = dropzone({
    accept: ".xlsx,.xls,.csv",
    hint: "Excel → CSV รับครั้งละ 1 ไฟล์ · CSV → Excel เลือกหลายไฟล์ได้ (1 ไฟล์ = 1 ชีท)",
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const go = button("🔁 แปลงไฟล์", { onclick: run });
  body.append(el("div", { class: "row" }, [field("ทิศทางการแปลง", dirSel)]), dz.container,
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "ไฟล์ CSV ที่สร้างจะใส่ BOM (UTF-8) ให้อัตโนมัติ — เปิดใน Excel ภาษาไทยแล้วไม่กลายเป็นอักษรต่างดาว"));

  async function run() {
    const files = dz.files;
    if (!files.length) return st.err("กรุณาเลือกไฟล์ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    try {
      if (dirSel.value === "to-csv") {
        st.info("กำลังแยกชีท…");
        const f = files[0];
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const base = stripExt(f.name);
        const made = [];
        for (const name of wb.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
          if (!csv.trim()) continue;
          made.push({
            name: `${base}${wb.SheetNames.length > 1 ? "-" + name : ""}.csv`,
            blob: new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
          });
          await yieldToBrowser();
        }
        if (!made.length) throw new Error("ไม่พบข้อมูลในไฟล์นี้");
        st.ok(`แยกได้ ${made.length} ไฟล์ CSV`);
        made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, m.name)]),
          el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
          button("⬇", { onclick: () => download(m.blob, m.name) }),
        ])));
        if (made.length > 1) results.prepend(el("div", { class: "actions" }, [
          button("📦 ดาวน์โหลดทั้งหมดเป็น ZIP", { onclick: async () => {
            const zip = new JSZip();
            made.forEach((m) => zip.file(m.name, m.blob));
            download(await zip.generateAsync({ type: "blob" }), base + "-csv.zip");
          } }),
        ]));
      } else {
        st.info("กำลังรวมเป็น Excel…");
        const wb = XLSX.utils.book_new();
        for (let i = 0; i < files.length; i++) {
          const text = await files[i].text();
          const sheet = XLSX.read(text, { type: "string" }).Sheets.Sheet1;
          // ชื่อชีทของ Excel ยาวได้ไม่เกิน 31 ตัว และห้ามอักขระพิเศษบางตัว
          const safe = stripExt(files[i].name).replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || `ชีท${i + 1}`;
          XLSX.utils.book_append_sheet(wb, sheet, safe);
          st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
          await yieldToBrowser();
        }
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        st.progress(null);
        st.ok(`รวมเป็น Excel ${wb.SheetNames.length} ชีทแล้ว`);
        const name = stripExt(files[0].name) + ".xlsx";
        results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${wb.SheetNames.length} ชีท`)]),
          button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
        ]));
      }
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
