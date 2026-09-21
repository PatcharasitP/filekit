// ── ดึงรูปออกจาก PDF ───────────────────────────────────────────────────────
// เคสจริง: ได้โบรชัวร์หรือรายงานมาเป็น PDF แล้วอยากได้รูปข้างในไปใช้ต่อ
// เดิมต้องจับภาพหน้าจอซึ่งได้ความละเอียดเท่าที่จอมี และติดพื้นหลังมาด้วย
//
// ‼️ ต่างจาก "PDF เป็นรูป" ที่แปลงทั้งหน้าเป็นภาพ
//   ตัวนี้ดึง **รูปที่ฝังอยู่ในไฟล์** ออกมาตรง ๆ จึงได้ความละเอียดเต็มตามต้นฉบับ
//
// ‼️ ใช้ pdf.js ไม่ใช่ pdf-lib (พิสูจน์แล้ว 21/09/2026)
//   pdf-lib ดึงได้เฉพาะรูปที่เก็บเป็น JPEG ส่วนรูปที่เก็บเป็นพิกเซลดิบคืนค่าว่าง
//   ส่วน pdf.js ถอดให้เป็น bitmap ทุกชนิด แล้วเราวาดลง canvas บันทึกเป็น PNG ได้หมด
import { openPdf, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { loadLibs } from "../loader.js";
import { el, dropzone, statusBar, button, field, select, download, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

const STYLE = `
.xi-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.xi-wrap[hidden]{display:none}
.xi-bar{font-size:13px;color:var(--text-mute)}
.xi-grid{flex:1 1 auto;min-height:0;overflow:auto;display:grid;gap:10px;padding:4px;
  grid-template-columns:repeat(auto-fill,minmax(150px,1fr));align-content:start}
.xi-card{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--card);
  padding:8px;display:flex;flex-direction:column;gap:6px}
.xi-card img{width:100%;height:110px;object-fit:contain;background:var(--bg-soft);border-radius:4px}
.xi-cap{font-size:11.5px;color:var(--text-mute);line-height:1.5;font-variant-numeric:tabular-nums}
.xi-card .btn{width:100%;justify-content:center;min-height:36px;font-size:12.5px}
.xi-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
.xi-empty{padding:28px 16px;text-align:center;color:var(--text-mute);font-size:14px;line-height:1.7}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const minSel = select([
    ["0", tr("ทุกขนาด", "Every size")],
    ["64", tr("ข้ามรูปเล็กกว่า 64 พิกเซล (ไอคอนกับเส้นคั่น)", "Skip images under 64px (icons and rules)")],
    ["200", tr("เฉพาะรูปใหญ่กว่า 200 พิกเซล", "Only images over 200px")],
  ], "64");
  const fmtSel = select([
    ["png", tr("PNG (คมชัด ไฟล์ใหญ่)", "PNG (sharp, larger)")],
    ["jpeg", tr("JPG (ไฟล์เล็ก)", "JPG (smaller)")],
  ], "png");

  const bar = el("div", { class: "xi-bar" });
  const grid = el("div", { class: "xi-grid" });
  const wrap = el("div", { class: "xi-wrap", hidden: true }, [
    bar, grid,
    el("div", { class: "xi-note" },
       tr("ได้รูปตามความละเอียดที่ฝังอยู่ในไฟล์จริง ไม่ใช่ภาพหน้าจอ รูปที่ถูกครอบหรือหมุนในหน้า จะได้ภาพเต็มใบก่อนถูกจัดวาง",
          "You get each image at the resolution stored in the file, not a screenshot. Images that were cropped or rotated on the page come out whole, before the layout was applied")),
  ]);

  const go = button(tr("ดึงรูปทั้งหมด", "Extract every image"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("ตัวเลือก", "Options"), node: el("div", {}, [
      field(tr("ขนาดรูปที่ต้องการ", "Which sizes to keep"), minSel),
      field(tr("ชนิดไฟล์ที่ได้", "Output format"), fmtSel),
      el("div", { class: "xi-note" },
         tr("ต่างจากเครื่องมือ PDF เป็น Images ที่แปลงทั้งหน้าเป็นภาพ ตัวนี้ดึงเฉพาะรูปที่ฝังอยู่ในไฟล์",
            "Unlike the PDF to Images tool which turns whole pages into pictures, this one pulls out the images embedded in the file")),
    ]) },
    center: { node: wrap, empty: tr("เลือกไฟล์ PDF ที่มีรูปอยู่ข้างใน", "Choose a PDF that has images inside") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let file = null, pdf = null, found = [];

  async function onFile(fs) {
    file = fs[0] || null;
    results.innerHTML = "";
    grid.replaceChildren();
    found = [];
    st.clear();
    if (pdf) { try { pdf.destroy(); } catch {} pdf = null; }
    if (!file) { wrap.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    try {
      st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
      pdf = await openPdf(file, passwordBox(ws.body));
      wrap.hidden = false;
      ws.showCanvas(true);
      go.disabled = false;
      bar.textContent = tr(`${pdf.numPages} หน้า กดปุ่มด้านล่างเพื่อค้นหารูปในไฟล์`,
                           `${pl(pdf.numPages, "page", "pages")}. Press the button below to find the images inside`);
      st.clear();
    } catch (e) {
      wrap.hidden = true; ws.showCanvas(false); go.disabled = true;
      st.err(friendlyPdfError(e, file.name).message);
    }
  }

  /** วาด bitmap ที่ pdf.js ถอดมาแล้ว ลง canvas เพื่อบันทึกเป็นไฟล์ภาพ */
  async function toBlob(obj, type) {
    const canvas = document.createElement("canvas");
    canvas.width = obj.width;
    canvas.height = obj.height;
    const ctx = canvas.getContext("2d");
    if (obj.bitmap) {
      ctx.drawImage(obj.bitmap, 0, 0);
    } else if (obj.data) {
      /* บางรุ่นคืนเป็นอาร์เรย์พิกเซลแทน bitmap · kind 1=เทา 2=RGB 3=RGBA */
      const img = ctx.createImageData(obj.width, obj.height);
      const src = obj.data, dst = img.data;
      const ch = src.length / (obj.width * obj.height);
      for (let i = 0, p = 0; p < dst.length; p += 4) {
        if (ch >= 3) { dst[p] = src[i++]; dst[p + 1] = src[i++]; dst[p + 2] = src[i++]; dst[p + 3] = ch === 4 ? src[i++] : 255; }
        else { const v = src[i++]; dst[p] = dst[p + 1] = dst[p + 2] = v; dst[p + 3] = 255; }
      }
      ctx.putImageData(img, 0, 0);
    } else return null;
    const blob = await new Promise((r) => canvas.toBlob(r, `image/${type}`, type === "jpeg" ? 0.92 : undefined));
    canvas.width = canvas.height = 0;
    return blob;
  }

  async function run() {
    if (!pdf || !file) return;
    results.innerHTML = "";
    grid.replaceChildren();
    found = [];
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังค้นหารูปในไฟล์…", "Looking for images inside the file…"));
    try {
      const [pdfjsLib] = await loadLibs("pdfjs");
      const min = +minSel.value || 0;
      const type = fmtSel.value;
      const seen = new Set();     // กันรูปเดียวกันที่ถูกวางซ้ำหลายหน้า เช่นโลโก้บนหัวกระดาษ
      const base = stripExt(file.name);

      for (let i = 1; i <= pdf.numPages; i++) {
        if (st.cancelled) break;
        const page = await pdf.getPage(i);
        const ops = await page.getOperatorList();
        for (let k = 0; k < ops.fnArray.length; k++) {
          const fn = ops.fnArray[k];
          if (fn !== pdfjsLib.OPS.paintImageXObject && fn !== pdfjsLib.OPS.paintJpegXObject) continue;
          const name = ops.argsArray[k][0];
          if (seen.has(name)) continue;
          seen.add(name);
          let obj = null;
          try { obj = page.objs.get(name); } catch { continue; }
          if (!obj || !obj.width || !obj.height) continue;
          if (obj.width < min || obj.height < min) continue;
          const blob = await toBlob(obj, type);
          if (!blob) continue;
          found.push({ name: `${base}-รูป${found.length + 1}.${type === "jpeg" ? "jpg" : "png"}`,
                       blob, w: obj.width, h: obj.height, page: i });
          await yieldToBrowser();
        }
        page.cleanup();
        st.progress((i / pdf.numPages) * 100, `(${i}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      st.end();
      st.progress(null);

      if (!found.length) {
        grid.replaceChildren(el("div", { class: "xi-empty" },
          min > 0
            ? tr(`ไม่พบรูปที่ใหญ่กว่า ${min} พิกเซลในไฟล์นี้ ลองเปลี่ยนเป็น "ทุกขนาด"`,
                 `No images larger than ${min}px were found. Try switching to "Every size"`)
            : tr("ไม่พบรูปที่ฝังอยู่ในไฟล์นี้ อาจเป็นเอกสารข้อความล้วน",
                 "No embedded images were found, this may be a text-only document")));
        bar.textContent = "";
        st.info(tr("ไม่พบรูปในไฟล์นี้", "No images found in this file"));
        return;
      }

      bar.textContent = tr(`พบ ${found.length} รูป`, `Found ${pl(found.length, "image", "images")}`);
      grid.replaceChildren(...found.map((f) => {
        const url = URL.createObjectURL(f.blob);
        const img = el("img", { src: url, alt: tr(`รูปจากหน้า ${f.page}`, `Image from page ${f.page}`), loading: "lazy" });
        /* ‼️ ต้องคืน URL เมื่อรูปโหลดเสร็จ ไม่งั้นหน่วยความจำรั่วเมื่อดึงรูปหลายรอบ */
        img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
        return el("div", { class: "xi-card" }, [
          img,
          el("div", { class: "xi-cap" }, tr(`หน้า ${f.page}, ${f.w}x${f.h}, ${fmtBytes(f.blob.size)}`,
                                            `Page ${f.page}, ${f.w}x${f.h}, ${fmtBytes(f.blob.size)}`)),
          button(tr("บันทึก", "Save"), { icon: "download", label: tr(`บันทึก ${f.name}`, `Save ${f.name}`),
            onclick: () => download(f.blob, f.name) }),
        ]);
      }));

      st.ok(tr(`ดึงได้ ${found.length} รูป`, `Extracted ${pl(found.length, "image", "images")}`));
      if (found.length > 1) {
        const JSZip = (await loadLibs("jszip"))[0];
        results.appendChild(el("div", { class: "actions" }, [
          button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip", onclick: async () => {
            st.info(tr("กำลังบีบเป็น ZIP…", "Zipping…"));
            const zip = new JSZip();
            found.forEach((f) => zip.file(f.name, f.blob));
            download(await zip.generateAsync({ type: "blob" }), base + tr("-รูปทั้งหมด.zip", "-images.zip"));
            st.ok(tr("ดาวน์โหลด ZIP แล้ว", "ZIP downloaded"));
          } }),
        ]));
      } else {
        results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, found[0].name),
            el("small", {}, `${found[0].w}x${found[0].h}`)]),
          downloadButton(found[0].blob, found[0].name),
        ]));
      }
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(friendlyPdfError(e, file && file.name).message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
