import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";

const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "image/*",
    hint: "รองรับ JPG · PNG · WEBP · BMP · GIF (เลือกได้หลายไฟล์)",
    expect: ["image"], expectLabel: "ไฟล์รูปภาพ",
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const typeSel = select([["png", "PNG (ไม่สูญเสียคุณภาพ รองรับพื้นโปร่งใส)"],
                          ["jpeg", "JPG (ไฟล์เล็ก เหมาะกับภาพถ่าย)"],
                          ["webp", "WEBP (เล็กที่สุด รองรับโปร่งใส)"]], "jpeg");
  const quality = el("input", { type: "range", min: "40", max: "100", value: "88" });
  const qLabel = el("small", {}, "คุณภาพ 88%");
  quality.addEventListener("input", () => { qLabel.textContent = `คุณภาพ ${quality.value}%`; });

  const qField = el("label", { class: "field" }, [el("span", {}, "คุณภาพไฟล์"), quality, qLabel]);
  const syncQ = () => { qField.style.display = typeSel.value === "png" ? "none" : ""; };
  typeSel.addEventListener("change", syncQ); syncQ();

  const go = button("🔄 แปลงไฟล์", { onclick: run });
  body.append(dz.container,
    el("div", { class: "row" }, [field("แปลงเป็นชนิด", typeSel), qField]),
    el("div", { class: "actions" }, [go]), st.node, results);

  async function run() {
    const files = dz.files;
    if (!files.length) return st.err("กรุณาเลือกรูปอย่างน้อย 1 ไฟล์");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังแปลง…");
    const mime = TYPES[typeSel.value];
    const q = +quality.value / 100;
    const made = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const bmp = await createImageBitmap(f);
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width; canvas.height = bmp.height;
        const ctx = canvas.getContext("2d");
        // JPG ไม่มีช่องโปร่งใส — รองพื้นขาวไว้ก่อน ไม่งั้นพื้นโปร่งจะกลายเป็นดำ
        if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        const blob = await new Promise((r) => canvas.toBlob(r, mime, q));
        if (!blob) throw new Error(`เบราว์เซอร์นี้ยังบันทึกเป็น ${typeSel.value.toUpperCase()} ไม่ได้`);
        canvas.width = canvas.height = 0; // ปล่อยหน่วยความจำทันที ไม่รอ GC
        made.push({ name: `${stripExt(f.name)}.${typeSel.value === "jpeg" ? "jpg" : typeSel.value}`, blob, from: f.size });
        st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
        await yieldToBrowser();
      }
      st.progress(null);
      st.ok(`แปลงเสร็จ ${made.length} ไฟล์`);
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}`)]),
        button("⬇", { onclick: () => download(m.blob, m.name) }),
      ])));
      if (made.length > 1) results.prepend(el("div", { class: "actions" }, [
        button("📦 ดาวน์โหลดทั้งหมดเป็น ZIP", { onclick: async () => {
          const zip = new JSZip();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), "รูปที่แปลงแล้ว.zip");
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
