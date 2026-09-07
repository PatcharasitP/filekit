import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "image/*",
    hint: "เลือกได้หลายไฟล์ · ย่อและบีบอัดพร้อมกันทั้งชุด",
    expect: ["image"], expectLabel: "ไฟล์รูปภาพ",
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const modeSel = select([["long", "จำกัดด้านที่ยาวที่สุด"], ["width", "กำหนดความกว้าง"], ["pct", "ย่อเป็นเปอร์เซ็นต์"], ["none", "ไม่ย่อ (บีบอัดอย่างเดียว)"]], "long");
  const sizeInput = el("input", { type: "number", min: "1", value: "1600" });
  const quality = el("input", { type: "range", min: "40", max: "100", value: "82" });
  const qLabel = el("small", {}, "คุณภาพ 82%");
  quality.addEventListener("input", () => { qLabel.textContent = `คุณภาพ ${quality.value}%`; });
  const fmtSel = select([["keep", "คงชนิดเดิม (PNG→PNG)"], ["jpeg", "บังคับเป็น JPG"], ["webp", "บังคับเป็น WEBP"]], "jpeg");

  const sizeField = field("ขนาด (พิกเซล หรือ %)", sizeInput);
  const syncSize = () => {
    sizeField.style.display = modeSel.value === "none" ? "none" : "";
    sizeInput.value = modeSel.value === "pct" ? "50" : "1600";
  };
  modeSel.addEventListener("change", syncSize);

  const go = button("📐 ย่อและบีบอัด", { onclick: run });
  body.append(dz.container,
    el("div", { class: "row" }, [
      field("วิธีย่อ", modeSel), sizeField,
      el("label", { class: "field" }, [el("span", {}, "คุณภาพไฟล์"), quality, qLabel]),
      field("ชนิดไฟล์ผลลัพธ์", fmtSel),
    ]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "เหมาะกับการเตรียมรูปส่งอีเมล แนบเอกสาร หรืออัปโหลดเว็บที่จำกัดขนาดไฟล์ · รูปต้นฉบับในเครื่องไม่ถูกแก้ไข"));

  function targetSize(w, h) {
    const v = +sizeInput.value || 0;
    if (modeSel.value === "none" || v <= 0) return [w, h];
    if (modeSel.value === "pct") { const s = v / 100; return [Math.round(w * s), Math.round(h * s)]; }
    if (modeSel.value === "width") { const s = v / w; return [v, Math.round(h * s)]; }
    const s = v / Math.max(w, h);
    return s >= 1 ? [w, h] : [Math.round(w * s), Math.round(h * s)]; // ไม่ขยายรูปที่เล็กกว่าเป้าอยู่แล้ว
  }

  async function run() {
    const files = dz.files;
    if (!files.length) return st.err("กรุณาเลือกรูปอย่างน้อย 1 ไฟล์");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังประมวลผล…");
    const made = [];
    let before = 0, after = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const bmp = await createImageBitmap(f);
        const bmpW = bmp.width, bmpH = bmp.height;
        const [w, h] = targetSize(bmpW, bmpH);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        const keepPng = fmtSel.value === "keep" && /png$/i.test(f.type);
        const mime = fmtSel.value === "keep" ? (keepPng ? "image/png" : "image/jpeg")
                   : fmtSel.value === "webp" ? "image/webp" : "image/jpeg";
        if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close?.();
        let blob = await new Promise((r) => canvas.toBlob(r, mime, +quality.value / 100));
        canvas.width = canvas.height = 0;
        let ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
        // ภาพกราฟิกสีเรียบมักโตขึ้นเมื่อแปลงเป็น JPG — ถ้าไม่ได้ย่อขนาดและผลลัพธ์
        // ใหญ่กว่าเดิม ให้คืนไฟล์ต้นฉบับไปเลย ดีกว่าส่งไฟล์ที่แย่ลงให้ผู้ใช้
        let kept = false;
        if (blob.size >= f.size && w === bmpW && h === bmpH) {
          blob = f; ext = (f.name.split(".").pop() || ext).toLowerCase(); kept = true;
        }
        made.push({ name: kept ? f.name : `${stripExt(f.name)}-ย่อ.${ext}`, blob,
                    from: f.size, dim: `${w}×${h}`, kept });
        before += f.size; after += blob.size;
        st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
        await yieldToBrowser();
      }
      st.progress(null);
      const saved = before ? Math.round((1 - after / before) * 100) : 0;
      const keptCount = made.filter((m) => m.kept).length;
      const verdict = saved > 0 ? `เล็กลง ${saved}%` : saved < 0 ? `ใหญ่ขึ้น ${-saved}%` : "ขนาดเท่าเดิม";
      const tail = keptCount ? ` · ${keptCount} ไฟล์คงต้นฉบับไว้เพราะเล็กกว่าอยู่แล้ว` : "";
      st.ok(`เสร็จ ${made.length} ไฟล์ · ${fmtBytes(before)} → ${fmtBytes(after)} (${verdict})${tail}`);
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${m.dim} · ${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}` +
            (m.kept ? " · คงไฟล์เดิม (บีบแล้วใหญ่กว่า)" : ""))]),
        button("⬇", { onclick: () => download(m.blob, m.name) }),
      ])));
      if (made.length > 1) results.prepend(el("div", { class: "actions" }, [
        button("📦 ดาวน์โหลดทั้งหมดเป็น ZIP", { onclick: async () => {
          const zip = new JSZip();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), "รูปย่อแล้ว.zip");
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("ประมวลผลไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
