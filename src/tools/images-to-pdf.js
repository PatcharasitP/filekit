import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, segmented, eachFile, failedBox } from "../ui.js";
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

  /* ‼️ PNG ที่ถูกตัดกลางสตรีมทำให้ pdf-lib ค้างไม่จบ (>100 วินาที หน้าเว็บแข็งทั้งแท็บ
   * กดปุ่มหยุดก็ไม่ได้เพราะ main thread ตาย — จับได้จาก tests/browser_stress.py ④)
   * เบราว์เซอร์ถอดรหัสไฟล์แบบนี้ "ผ่าน" (วาดเท่าที่มีข้อมูล) จึงเช็คด้วย createImageBitmap ไม่ได้
   * ต้องเดินดูโครงสร้างก้อนข้อมูล (chunk) เองว่าครบถึง IEND ไหม — เร็วมาก อ่านแค่หัวก้อน
   * ไฟล์ที่ไม่ครบจะถูกส่งไปวาดผ่าน canvas แทน (ได้เท่าที่ภาพมีจริง ดีกว่าค้างทั้งหน้า) */
  function pngComplete(bytes) {
    const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 12) return false;
    for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) return false;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 8;
    while (p + 12 <= bytes.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      const next = p + 12 + len;
      if (len > bytes.length || next > bytes.length) return false;   // ก้อนสุดท้ายขาดกลางทาง
      if (type === "IEND") return true;
      p = next;
    }
    return false;
  }

  // แปลงรูปเป็น JPEG/PNG ที่ pdf-lib ฝังได้ — WEBP ต้องวาดผ่าน canvas ก่อน
  async function toEmbeddable(file) {
    const isPng = /png$/i.test(file.type);
    const raw = (/jpe?g$/i.test(file.type) || isPng) ? new Uint8Array(await file.arrayBuffer()) : null;
    if (raw && !(isPng && !pngComplete(raw))) {
      /* ทางนี้ส่งไบต์ดิบเข้า pdf-lib ตรง ๆ (เร็วสุด ไม่เสียคุณภาพ) — โครงสร้างผ่านแล้ว
       * เหลือแค่กันไฟล์ที่หัวถูกแต่เนื้อในเป็นขยะจริง ๆ ให้เบราว์เซอร์ลองถอดรหัสดูก่อน */
      let probe;
      try { probe = await createImageBitmap(file); }
      catch { throw new Error(tr("ไฟล์รูปเสียหาย เปิดไม่ได้", "This image file is damaged")); }
      probe.close?.();
      return { bytes: raw, kind: isPng ? "png" : "jpg" };
    }
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error(tr("ไฟล์รูปเสียหาย เปิดไม่ได้", "This image file is damaged")); }
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

      // ‼️ เดิมใช้ for ธรรมดา — ไฟล์เสียใบเดียวทำให้ทั้งชุดพัง ("สร้าง PDF ไม่สำเร็จ: undefined")
      //    และไม่มีปุ่มหยุดให้กดเลยระหว่างงานหนัก · eachFile() แก้ทั้งสองอย่างในตัว
      //    (ข้ามไฟล์เสียแล้วทำต่อ + มีปุ่มหยุด + บอกท้ายว่าข้ามใบไหนเพราะอะไร)
      let pages = 0;
      const failed = await eachFile(files, st, async (f) => {
        const { bytes, kind } = await toEmbeddable(f);
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

        pages++;
      });

      if (!pages) {
        // ไม่ได้สักหน้า — ต้องบอกด้วยว่าแต่ละไฟล์ติดตรงไหน ไม่ใช่บอกลอย ๆ ว่าใช้ไม่ได้
        st.progress(null);
        st.err(tr("สร้าง PDF ไม่สำเร็จ: ไม่มีรูปที่เปิดได้เลย", "Could not create PDF: no image could be opened"));
        const box = failedBox(failed); if (box) results.appendChild(box);
        return;
      }
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      st.progress(null);
      st.ok(tr(`สร้าง PDF ${pages} หน้าเรียบร้อย`, `Done, created a ${pages}-page PDF`));
      const name = stripExt(files[0].name) + tr("-รูปภาพ.pdf", "-images.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${pages} หน้า`, `${pages} pages`))]),
        downloadButton(blob, name),
      ]));
      const fb = failedBox(failed); if (fb) results.appendChild(fb);   // บอกว่าข้ามใบไหนเพราะอะไร
    } catch (e) {
      st.progress(null);
      st.err(tr("สร้าง PDF ไม่สำเร็จ: ", "Could not create PDF: ") + e.message);
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
