import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  let file = null, text = "";

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; preview.hidden = true; },
  });

  const layout = select([["lines", "จัดบรรทัดตามตำแหน่งจริง (แนะนำ)"], ["raw", "ต่อกันตามลำดับในไฟล์"]], "lines");
  const marker = select([["yes", "ใส่ตัวคั่นหน้า"], ["no", "ไม่ใส่"]], "yes");
  const go = button("📄 ดึงข้อความ", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("การจัดวางข้อความ", layout), field("ตัวคั่นหน้า", marker)]),
    el("div", { class: "actions" }, [go]), st.node, results, preview);
  body.appendChild(el("div", { class: "note" },
    "ใช้ได้กับ PDF ที่มีชั้นข้อความจริงเท่านั้น · ถ้าเป็นไฟล์สแกน (ได้ข้อความว่าง) ให้ใช้เครื่องมือ OCR แทน"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info("กำลังอ่านข้อความ…");
    try {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const chunks = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        let pageText;
        if (layout.value === "raw") {
          pageText = content.items.map((i) => i.str).join(" ");
        } else {
          // จัดกลุ่ม item ตามพิกัด Y เพื่อคืนรูปบรรทัดให้ใกล้ของจริง
          const rows = new Map();
          for (const it of content.items) {
            const y = Math.round(it.transform[5]);
            const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
            (rows.get(key) || rows.set(key, []).get(key)).push(it);
          }
          pageText = [...rows.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4])
              .map((i) => i.str).join("").trimEnd())
            .join("\n");
        }
        chunks.push(marker.value === "yes" ? `--- หน้า ${p} ---\n${pageText}` : pageText);
        page.cleanup();
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      pdf.destroy();
      text = chunks.join("\n\n");
      st.progress(null);

      const chars = text.replace(/\s/g, "").length;
      if (!chars) {
        st.err("ไม่พบชั้นข้อความในไฟล์นี้ — น่าจะเป็น PDF ที่สแกนมา ลองใช้เครื่องมือ OCR แทน");
        return;
      }
      st.ok(`ดึงข้อความสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${pdf.numPages} หน้า`);
      preview.hidden = false;
      preview.textContent = text.slice(0, 4000) + (text.length > 4000 ? "\n\n… (แสดงตัวอย่าง 4,000 ตัวอักษรแรก)" : "");

      const name = stripExt(file.name) + ".txt";
      results.appendChild(el("div", { class: "actions" }, [
        button("⬇ ดาวน์โหลด .txt", { onclick: () =>
          download(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }), name) }),
        button("📋 คัดลอกทั้งหมด", { ghost: true, onclick: async () => {
          try { await navigator.clipboard.writeText(text); st.ok("คัดลอกลงคลิปบอร์ดแล้ว"); }
          catch { st.err("เบราว์เซอร์ไม่อนุญาตให้คัดลอก — ใช้ปุ่มดาวน์โหลดแทนได้"); }
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("อ่านไฟล์ไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
