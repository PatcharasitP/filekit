import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser, segmented } from "../ui.js";

const PAGE_SIZES = { auto: null, a4: [595.28, 841.89], letter: [612, 792] };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "image/*", reorder: true,
    hint: "รองรับ JPG · PNG · WEBP · ลากแถวเพื่อจัดลำดับหน้า",
    expect: ["image"], expectLabel: "ไฟล์รูปภาพ",
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const sizeSel = select([["auto", "ตามขนาดรูป (ไม่มีขอบ)"], ["a4", "A4 แนวตั้ง"], ["letter", "Letter"]], "auto");
  const orient = segmented([["portrait", "แนวตั้ง"], ["landscape", "แนวนอน"]], "portrait");
  const margin = el("input", { type: "number", min: "0", max: "80", value: "24" });
  const go = button("🧩 สร้างไฟล์ PDF", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [
      field("ขนาดหน้ากระดาษ", sizeSel),
      field("แนวกระดาษ", orient, "ใช้เมื่อไม่ได้เลือก “ตามขนาดรูป”"),
      field("ขอบกระดาษ (pt)", margin),
    ]),
    el("div", { class: "actions" }, [go]), st.node, results);

  // แปลงรูปเป็น JPEG/PNG ที่ pdf-lib ฝังได้ — WEBP ต้องวาดผ่าน canvas ก่อน
  async function toEmbeddable(file) {
    if (/jpe?g$/i.test(file.type) || /png$/i.test(file.type)) {
      return { bytes: new Uint8Array(await file.arrayBuffer()), kind: file.type.includes("png") ? "png" : "jpg" };
    }
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "jpg" };
  }

  async function run() {
    const files = dz.files;
    if (!files.length) return st.err("กรุณาเลือกรูปอย่างน้อย 1 ไฟล์");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังสร้าง PDF…");
    try {
      const { PDFDocument } = PDFLib;
      const doc = await PDFDocument.create();
      const m = Math.max(0, +margin.value || 0);

      for (let i = 0; i < files.length; i++) {
        const { bytes, kind } = await toEmbeddable(files[i]);
        const img = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

        let pw, ph;
        if (sizeSel.value === "auto") {
          pw = img.width + m * 2; ph = img.height + m * 2;
        } else {
          const [a, b] = PAGE_SIZES[sizeSel.value];
          [pw, ph] = orient.value === "landscape" ? [b, a] : [a, b];
        }
        const page = doc.addPage([pw, ph]);
        const boxW = pw - m * 2, boxH = ph - m * 2;
        const scale = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });

        st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
        await yieldToBrowser();
      }

      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      st.progress(null);
      st.ok(`สร้าง PDF ${files.length} หน้าเรียบร้อย`);
      const name = stripExt(files[0].name) + "-รูปภาพ.pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${files.length} หน้า`)]),
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("สร้าง PDF ไม่สำเร็จ: " + e.message);
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
