import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser, eachFile, failedBox } from "../ui.js";
import { tr } from "../i18n.js";

const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "image/*",
    hint: tr("JPG, PNG, WEBP, BMP, GIF", "JPG, PNG, WEBP, BMP, GIF"),
    expect: ["image"], expectLabel: tr("ไฟล์รูปภาพ", "Image files"),
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const typeSel = select([["png", tr("PNG (ไม่เสียคุณภาพ โปร่งใส)", "PNG (lossless, transparent)")],
                          ["jpeg", tr("JPG (ไฟล์เล็ก เหมาะภาพถ่าย)", "JPG (small, good for photos)")],
                          ["webp", tr("WEBP เล็ก โปร่งใส", "WEBP (small, transparent)")]], "jpeg");
  const quality = el("input", { type: "range", min: "40", max: "100", value: "88" });
  const qLabel = el("small", {}, tr("คุณภาพ 88%", "Quality 88%"));
  quality.addEventListener("input", () => { qLabel.textContent = tr(`คุณภาพ ${quality.value}%`, `Quality ${quality.value}%`); });

  const qField = el("label", { class: "field" }, [el("span", {}, tr("คุณภาพไฟล์", "File quality")), quality, qLabel]);
  const syncQ = () => { qField.style.display = typeSel.value === "png" ? "none" : ""; };
  typeSel.addEventListener("change", syncQ); syncQ();

  const go = button(tr("แปลงไฟล์", "Convert files"), { onclick: run });
  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("แปลงเป็นชนิด", "Convert to"), typeSel), qField]),
    el("div", { class: "actions" }, [go]), st.node, results);

  async function run() {
    const files = dz.files;
    if (!files.length) return st.err(tr("กรุณาเลือกรูปอย่างน้อย 1 ไฟล์", "Please choose at least 1 image"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังแปลง…", "Converting…"));
    const mime = TYPES[typeSel.value];
    const q = +quality.value / 100;
    const made = [];
    try {
      const failed = await eachFile(files, st, async (f) => {
        const bmp = await createImageBitmap(f);
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width; canvas.height = bmp.height;
        const ctx = canvas.getContext("2d");
        // JPG ไม่มีช่องโปร่งใส — รองพื้นขาวไว้ก่อน ไม่งั้นพื้นโปร่งจะกลายเป็นดำ
        if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        const blob = await new Promise((r) => canvas.toBlob(r, mime, q));
        if (!blob) throw new Error(tr(`เบราว์เซอร์นี้ยังบันทึกเป็น ${typeSel.value.toUpperCase()} ไม่ได้`, `This browser cannot save as ${typeSel.value.toUpperCase()} yet`));
        canvas.width = canvas.height = 0; // ปล่อยหน่วยความจำทันที ไม่รอ GC
        made.push({ name: `${stripExt(f.name)}.${typeSel.value === "jpeg" ? "jpg" : typeSel.value}`, blob, from: f.size });
      });
      st.progress(null);
      if (!made.length) throw new Error(tr("แปลงไม่สำเร็จ — ตรวจว่าเป็นรูปจริง", "Could not convert — check they're valid images"));
      st.ok(tr(`แปลงเสร็จ ${made.length} ไฟล์` + (failed.length ? `, ข้าม ${failed.length} ไฟล์` : ""),
        `Done — ${made.length} files` + (failed.length ? `, skipped ${failed.length}` : "")));
      const fb = failedBox(failed); if (fb) results.appendChild(fb);
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}`)]),
        // ปุ่มไอคอนล้วนหลายปุ่มเรียงกัน — ต้องบอกชื่อไฟล์ ไม่งั้นโปรแกรมอ่านหน้าจอได้ยิน "ดาวน์โหลด" ซ้ำทุกปุ่ม
        button("", { icon: "download", label: tr(`ดาวน์โหลด ${m.name}`, `Download ${m.name}`),  onclick: () => download(m.blob, m.name) }),
      ])));
      if (made.length > 1) results.prepend(el("div", { class: "actions" }, [
        button(tr("โหลดทั้งหมด (ZIP)", "Download all (ZIP)"), { icon: "zip",  onclick: async () => {
          const zip = new JSZip();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("รูปที่แปลงแล้ว.zip", "converted-images.zip"));
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
