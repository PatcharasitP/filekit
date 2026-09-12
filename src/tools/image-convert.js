import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser, eachFileConcurrent, failedBox } from "../ui.js";
import { tr, pl } from "../i18n.js";

const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", ico: "image/png" };

/* ขนาดมาตรฐานที่ใส่ไว้ในไฟล์ .ico ใบเดียว
   16 ใช้ในแท็บเบราว์เซอร์ · 32 ในแถบงาน · 48 ในหน้าต่างไฟล์ · 64 บนจอความละเอียดสูง */
const ICO_SIZES = [16, 32, 48, 64];

/**
 * ประกอบไฟล์ .ico จากรูป PNG หลายขนาด
 *
 * ‼️ วัดจริง 12/09/2026 แล้วพบว่าเบราว์เซอร์ **เขียน** ได้แค่ 3 ฟอร์แมต
 *    (PNG, JPEG, WEBP · Firefox ได้ BMP เพิ่ม) เว็บที่ได้ 10 ฟอร์แมตอย่าง Squoosh
 *    ขนตัวเข้ารหัส WASM มาเป็นเมกะไบต์ ซึ่งขัดกับหลักโหลดเท่าที่ใช้ของเว็บนี้
 *    แต่ **.ico เพิ่มได้ฟรี** เพราะตั้งแต่ Windows Vista เป็นต้นมา ไฟล์ .ico
 *    เก็บ PNG ไว้ข้างในได้ตรง ๆ เราจึงแค่เขียนหัวไฟล์ 6 ไบต์ + รายการละ 16 ไบต์
 *    แล้วต่อ PNG ที่เบราว์เซอร์ทำให้อยู่แล้วเข้าไป ไม่ต้องโหลดอะไรเพิ่มสักไบต์
 * ‼️ ช่องกว้างกับสูงเป็น 1 ไบต์ ค่า 0 หมายถึง 256 จึงใช้ size % 256
 * @param {{size:number, data:ArrayBuffer}[]} imgs เรียงจากเล็กไปใหญ่
 */
export function buildIco(imgs) {
  const n = imgs.length;
  const head = new Uint8Array(6 + 16 * n);
  const dv = new DataView(head.buffer);
  dv.setUint16(0, 0, true);          // สงวนไว้ ต้องเป็น 0
  dv.setUint16(2, 1, true);          // 1 = ไอคอน (2 = เคอร์เซอร์)
  dv.setUint16(4, n, true);
  let offset = head.length, total = 0;
  imgs.forEach((im, i) => {
    const b = 6 + i * 16;
    head[b] = im.size % 256;         // กว้าง
    head[b + 1] = im.size % 256;     // สูง
    head[b + 2] = 0;                 // จำนวนสีในตาราง 0 = ไม่ใช้ตารางสี
    head[b + 3] = 0;                 // สงวนไว้
    dv.setUint16(b + 4, 1, true);    // color planes
    dv.setUint16(b + 6, 32, true);   // bit ต่อพิกเซล
    dv.setUint32(b + 8, im.data.byteLength, true);
    dv.setUint32(b + 12, offset, true);
    offset += im.data.byteLength;
    total += im.data.byteLength;
  });
  const out = new Uint8Array(head.length + total);
  out.set(head, 0);
  let at = head.length;
  for (const im of imgs) { out.set(new Uint8Array(im.data), at); at += im.data.byteLength; }
  return new Blob([out], { type: "image/x-icon" });
}

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
                          ["webp", tr("WEBP เล็ก โปร่งใส", "WEBP (small, transparent)")],
                          ["ico", tr("ICO ไอคอนเว็บ (favicon)", "ICO website icon (favicon)")]], "jpeg");
  const quality = el("input", { type: "range", min: "40", max: "100", value: "88" });
  const qLabel = el("small", {}, tr("คุณภาพ 88%", "Quality 88%"));
  quality.addEventListener("input", () => { qLabel.textContent = tr(`คุณภาพ ${quality.value}%`, `Quality ${quality.value}%`); });

  const qField = el("label", { class: "field" }, [el("span", {}, tr("คุณภาพไฟล์", "File quality")), quality, qLabel]);
  /* ICO ใช้ PNG อยู่ข้างในซึ่งไม่มีการปรับคุณภาพ จึงซ่อนแถบคุณภาพเหมือน PNG
     และบอกด้วยว่าไฟล์ที่ได้จะมีกี่ขนาดอยู่ข้างใน เพราะเป็นเรื่องที่คนไม่รู้มาก่อน */
  const icoNote = el("small", { class: "th-iconote" },
    tr(`ได้ไฟล์เดียวที่มีครบ ${ICO_SIZES.join(", ")} พิกเซล ใช้เป็น favicon ได้เลย`,
       `One file containing ${ICO_SIZES.join(", ")} px, ready to use as a favicon`));
  const syncQ = () => {
    const t = typeSel.value;
    qField.style.display = (t === "png" || t === "ico") ? "none" : "";
    icoNote.style.display = t === "ico" ? "" : "none";
  };
  typeSel.addEventListener("change", syncQ); syncQ();

  const go = button(tr("แปลงไฟล์", "Convert files"), { onclick: run });
  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("แปลงเป็นชนิด", "Convert to"), typeSel), qField]),
    icoNote,
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
      // แปลงหลายใบพร้อมกันได้ (งานหนักอยู่ฝั่ง codec ของเบราว์เซอร์) แต่เก็บผลตามลำดับไฟล์เดิม
      const failed = await eachFileConcurrent(files, st, {
        prepare: async (f) => {
        const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        /** วาดลงผืนผ้าใบขนาดที่ต้องการแล้วคืนเป็น blob */
        const shot = async (w, h) => {
          canvas.width = w; canvas.height = h;
          // JPG ไม่มีช่องโปร่งใส — รองพื้นขาวไว้ก่อน ไม่งั้นพื้นโปร่งจะกลายเป็นดำ
          if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
          else ctx.clearRect(0, 0, w, h);
          ctx.drawImage(bmp, 0, 0, w, h);
          const b = await new Promise((r) => canvas.toBlob(r, mime, q));
          if (!b) throw new Error(tr(`เบราว์เซอร์นี้ยังบันทึกเป็น ${typeSel.value.toUpperCase()} ไม่ได้`,
            `This browser cannot save as ${typeSel.value.toUpperCase()} yet`));
          return b;
        };
        let blob;
        if (typeSel.value === "ico") {
          /* ‼️ ไอคอนต้องเป็นสี่เหลี่ยมจัตุรัส ย่อด้านที่ยาวกว่าลงมาแล้วจัดกลาง
             ไม่ใช่บีบให้เพี้ยน เพราะโลโก้ที่ยืดผิดส่วนดูออกทันที */
          const imgs = [];
          for (const sz of ICO_SIZES) {
            canvas.width = canvas.height = sz;
            ctx.clearRect(0, 0, sz, sz);
            const k = Math.min(sz / bmp.width, sz / bmp.height);
            const w = bmp.width * k, h = bmp.height * k;
            ctx.drawImage(bmp, (sz - w) / 2, (sz - h) / 2, w, h);
            const b = await new Promise((r) => canvas.toBlob(r, "image/png"));
            if (!b) throw new Error(tr("เบราว์เซอร์นี้บันทึก PNG ไม่ได้", "This browser cannot save PNG"));
            imgs.push({ size: sz, data: await b.arrayBuffer() });
          }
          blob = buildIco(imgs);
        } else {
          blob = await shot(bmp.width, bmp.height);
        }
        bmp.close?.();
        canvas.width = canvas.height = 0; // ปล่อยหน่วยความจำทันที ไม่รอ GC
        return { name: `${stripExt(f.name)}.${typeSel.value === "jpeg" ? "jpg" : typeSel.value}`, blob, from: f.size };
        },
        commit: (r) => { made.push(r); },
      });
      st.progress(null);
      if (!made.length) throw new Error(tr("แปลงไม่สำเร็จ ตรวจว่าเป็นรูปจริง", "Could not convert. Check they're valid images."));
      st.ok(tr(`แปลงเสร็จ ${made.length} ไฟล์` + (failed.length ? `, ข้าม ${failed.length} ไฟล์` : ""),
        `Done, ${pl(made.length, "file", "files")}` + (failed.length ? `, skipped ${failed.length}` : "")));
      const fb = failedBox(failed); if (fb) results.appendChild(fb);
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}`)]),
        // ปุ่มไอคอนล้วนหลายปุ่มเรียงกัน — ต้องบอกชื่อไฟล์ ไม่งั้นโปรแกรมอ่านหน้าจอได้ยิน "ดาวน์โหลด" ซ้ำทุกปุ่ม
        button(tr("ดาวน์โหลด", "Download"), { icon: "download", label: tr(`ดาวน์โหลด ${m.name}`, `Download ${m.name}`),  onclick: () => download(m.blob, m.name) }),
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
