import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, parsePages, fmtBytes, yieldToBrowser } from "../ui.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const fmt = select([["png", "PNG (คมชัด ไฟล์ใหญ่)"], ["jpeg", "JPG (ไฟล์เล็กกว่า)"]], "png");
  const dpi = select([["1.5", "ปกติ (~110 DPI)"], ["2", "สูง (~150 DPI) แนะนำ"], ["3", "สูงมาก (~220 DPI)"], ["4", "สูงสุด (~300 DPI)"]], "2");
  const rangeInput = el("input", { type: "text", value: "1-", placeholder: "เช่น 1-5,8" });
  const go = button("🖼️ แปลงเป็นรูป", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("ชนิดรูป", fmt), field("ความละเอียด", dpi),
      field("หน้าที่ต้องการ", rangeInput, "ว่างไว้ = ทุกหน้า")]),
    el("div", { class: "actions" }, [go]), st.node, results);

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังเปิดไฟล์…");
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pages = parsePages(rangeInput.value || "1-", pdf.numPages);
      if (!pages.length) throw new Error(`ไฟล์นี้มี ${pdf.numPages} หน้า — ช่วงที่ระบุไม่ตรงกับหน้าใดเลย`);

      const scale = +dpi.value;
      const mime = fmt.value === "png" ? "image/png" : "image/jpeg";
      const ext = fmt.value === "png" ? "png" : "jpg";
      const base = stripExt(file.name);
      const made = [];

      for (let i = 0; i < pages.length; i++) {
        const page = await pdf.getPage(pages[i]);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.92));
        canvas.width = canvas.height = 0;
        page.cleanup();
        made.push({ name: `${base}-หน้า${String(pages[i]).padStart(2, "0")}.${ext}`, blob });
        st.progress(((i + 1) / pages.length) * 100, `(${i + 1}/${pages.length})`);
        await yieldToBrowser();
      }
      pdf.destroy();

      st.progress(null);
      st.ok(`แปลงเสร็จ ${made.length} รูป`);
      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button("📦 ดาวน์โหลดทั้งหมดเป็น ZIP", { onclick: async () => {
          st.info("กำลังบีบเป็น ZIP…");
          const zip = new JSZip();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), base + "-รูปภาพ.zip");
          st.ok("ดาวน์โหลด ZIP แล้ว");
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("⬇", { onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
