import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { smartDecode } from "../thai.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dirSel = select([["to-csv", tr("Excel → CSV (แยกทีละชีท)", "Excel → CSV (one file per sheet)")], ["to-xlsx", tr("CSV → Excel (รวมเป็นไฟล์เดียว)", "CSV → Excel (combine into one file)")]], "to-csv");
  const dz = dropzone({
    accept: ".xlsx,.xls,.csv",
    hint: tr("Excel → CSV รับครั้งละ 1 ไฟล์ · CSV → Excel เลือกหลายไฟล์ได้ (1 ไฟล์ = 1 ชีท)", "Excel → CSV takes 1 file at a time · CSV → Excel accepts multiple files (1 file = 1 sheet)"),
    expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "Excel or CSV file"),
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const go = button(tr("แปลงไฟล์", "Convert file"), { onclick: run });
  body.append(el("div", { class: "row" }, [field(tr("ทิศทางการแปลง", "Conversion direction"), dirSel)]), dz.container,
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("ไฟล์ CSV ที่สร้างจะใส่ BOM (UTF-8) ให้อัตโนมัติ — เปิดใน Excel ภาษาไทยแล้วไม่กลายเป็นอักษรต่างดาว",
       "Generated CSV files automatically include a UTF-8 BOM — Thai text opens correctly in Excel instead of turning into garbled characters")));

  async function run() {
    const files = dz.files;
    if (!files.length) return st.err(tr("กรุณาเลือกไฟล์ก่อน", "Please choose a file first"));
    results.innerHTML = "";
    go.disabled = true;
    try {
      if (dirSel.value === "to-csv") {
        st.info(tr("กำลังแยกชีท…", "Splitting sheets…"));
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
        if (!made.length) throw new Error(tr("ไม่พบข้อมูลในไฟล์นี้", "No data was found in this file"));
        st.ok(tr(`แยกได้ ${made.length} ไฟล์ CSV`, `Done — ${made.length} CSV files`));
        made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, m.name)]),
          el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
          button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
        ])));
        if (made.length > 1) results.prepend(el("div", { class: "actions" }, [
          button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip",  onclick: async () => {
            const zip = new JSZip();
            made.forEach((m) => zip.file(m.name, m.blob));
            download(await zip.generateAsync({ type: "blob" }), base + "-csv.zip");
          } }),
        ]));
      } else {
        st.info(tr("กำลังรวมเป็น Excel…", "Combining into Excel…"));
        let fixedEnc = 0;
        const wb = XLSX.utils.book_new();
        for (let i = 0; i < files.length; i++) {
          // ห้ามใช้ .text() ตรง ๆ — มันบังคับอ่านเป็น UTF-8 ทำให้ CSV ที่ส่งออกจาก
          // ระบบเก่า (TIS-620/Windows-874) กลายเป็นตัวประหลาดทั้งไฟล์
          const dec = smartDecode(new Uint8Array(await files[i].arrayBuffer()));
          if (dec.enc !== "utf-8" || dec.undo) fixedEnc++;
          const sheet = XLSX.read(dec.text, { type: "string" }).Sheets.Sheet1;
          // ชื่อชีทของ Excel ยาวได้ไม่เกิน 31 ตัว และห้ามอักขระพิเศษบางตัว
          const safe = stripExt(files[i].name).replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || tr(`ชีท${i + 1}`, `Sheet${i + 1}`);
          XLSX.utils.book_append_sheet(wb, sheet, safe);
          st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
          await yieldToBrowser();
        }
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        st.progress(null);
        st.ok(tr(`รวมเป็น Excel ${wb.SheetNames.length} ชีทแล้ว` +
          (fixedEnc ? ` · ซ่อมภาษาไทยที่เพี้ยนให้ ${fixedEnc} ไฟล์` : ""),
          `Combined into Excel — ${wb.SheetNames.length} sheets` +
          (fixedEnc ? ` · fixed garbled Thai text in ${fixedEnc} files` : "")));
        const name = stripExt(files[0].name) + ".xlsx";
        results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${wb.SheetNames.length} ชีท`, `${wb.SheetNames.length} sheets`))]),
          button(tr("ดาวน์โหลด", "Download"), { icon: "download",  onclick: () => download(blob, name) }),
        ]));
      }
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
