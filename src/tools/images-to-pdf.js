import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser, segmented } from "../ui.js";
import { tr } from "../i18n.js";

const PAGE_SIZES = { auto: null, a4: [595.28, 841.89], letter: [612, 792] };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "image/*", reorder: true,
    hint: tr("JPG/PNG/WEBP, ลากสลับหน้า", "JPG/PNG/WEBP, drag to reorder"),
    expect: ["image"], expectLabel: tr("ไฟล์รูปภาพ", "Image file"),
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const sizeSel = select([["auto", tr("ตามขนาดรูป (ไม่มีขอบ)", "Fit image size (no border)")], ["a4", tr("A4 แนวตั้ง", "A4 portrait")], ["letter", "Letter"]], "auto");
  const orient = segmented([["portrait", tr("แนวตั้ง", "Portrait")], ["landscape", tr("แนวนอน", "Landscape")]], "portrait");
  const margin = el("input", { type: "number", min: "0", max: "80", value: "24" });
  const go = button(tr("สร้างไฟล์ PDF", "Create PDF"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [
      field(tr("ขนาดหน้ากระดาษ", "Page size"), sizeSel),
      field(tr("แนวกระดาษ", "Page orientation"), orient, tr("ใช้เมื่อไม่ได้เลือก “ตามขนาดรูป”", "Used when “Fit image size” isn't selected")),
      field(tr("ขอบกระดาษ (pt)", "Page margin (pt)"), margin),
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
    if (!files.length) return st.err(tr("กรุณาเลือกรูปอย่างน้อย 1 ไฟล์", "Please choose at least 1 image"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังสร้าง PDF…", "Creating the PDF…"));
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
      st.ok(tr(`สร้าง PDF ${files.length} หน้าเรียบร้อย`, `Done — created a ${files.length}-page PDF`));
      const name = stripExt(files[0].name) + tr("-รูปภาพ.pdf", "-images.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${files.length} หน้า`, `${files.length} pages`))]),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("สร้าง PDF ไม่สำเร็จ: ", "Could not create PDF: ") + e.message);
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
