// ── PDF เป็น PowerPoint ─────────────────────────────────────────────────────
// เคสจริง: ได้สไลด์มาเป็น PDF แต่ต้องเอาไปฉายต่อในห้องประชุมหรือแทรกในเด็คของตัวเอง
//
// ‼️ บอกตามจริงบนหน้าจอ: แต่ละสไลด์เป็น **ภาพ** แก้ข้อความในสไลด์ไม่ได้
//   เพราะการแปลงกลับเป็นกล่องข้อความที่แก้ได้จริงต้องเดาโครงสร้างสไลด์ ซึ่งผิดบ่อยกว่าถูก
//   เว็บที่โฆษณาว่าแปลงได้ ก็มักได้ผลที่ต้องมานั่งจัดใหม่ทั้งเด็คอยู่ดี
//   เราเลือกทำสิ่งที่ทำได้ดีแล้วพูดตรง ๆ มากกว่าทำสิ่งที่ฟังดูดีแล้วผลออกมาใช้ไม่ได้
import { openPdf, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { loadLibs } from "../loader.js";
import { el, dropzone, statusBar, button, field, select, download,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

/* ขนาดสไลด์ หน่วยนิ้ว
 * ‼️ ประกาศขนาดเองทุกแบบ ไม่ใช้ค่าตั้งต้นของไลบรารี (แก้ 21/09/2026)
 *   เพราะ LAYOUT_16x9 ของไลบรารีคือ 10 x 5.625 นิ้ว ไม่ใช่ 13.333 x 7.5 อย่างที่คิด
 *   ตอนแรกคำนวณตำแหน่งภาพด้วย 13.333 แต่สไลด์จริงกว้าง 10 ภาพเลยล้นออกนอกสไลด์
 *   เทสจับได้จากขนาดที่อ่านจากไฟล์จริง · ประกาศเองแล้วตัวเลขที่ใช้คำนวณกับของจริงตรงกันเสมอ */
const LAYOUTS = {
  wide: { w: 13.333, h: 7.5, label: () => tr("จอกว้าง 16:9 (มาตรฐานปัจจุบัน)", "Widescreen 16:9 (today's standard)") },
  classic: { w: 10, h: 7.5, label: () => tr("จอจัตุรัส 4:3 (เครื่องฉายรุ่นเก่า)", "Classic 4:3 (older projectors)") },
  fit: { fit: true, label: () => tr("ตามสัดส่วนหน้า PDF", "Match the PDF page shape") },
};

const STYLE = `
.pp-stage{display:flex;flex-direction:column;gap:14px;margin:auto;width:100%;max-width:440px;text-align:center}
.pp-stage[hidden]{display:none}
.pp-slide{margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:4px;
  box-shadow:var(--sh2);display:grid;place-items:center;color:var(--text-mute);font-size:12px}
.pp-meta{font-size:13.5px;line-height:1.6;color:var(--text-dim)}
.pp-meta b{color:var(--text)}
.pp-warn{border:1px solid var(--line);border-left:3px solid #b8860b;border-radius:var(--r-sm);
  background:color-mix(in srgb,#b8860b 7%,transparent);padding:10px 12px;font-size:13px;line-height:1.6;text-align:start}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const layoutSel = select(Object.entries(LAYOUTS).map(([k, v]) => [k, v.label()]), "wide");
  const qualitySel = select([
    ["1.6", tr("ปกติ (ไฟล์เล็ก)", "Normal (smaller file)")],
    ["2.2", tr("ละเอียด (แนะนำสำหรับฉายจอใหญ่)", "Detailed, best for a big screen")],
    ["3", tr("ละเอียดมาก (ไฟล์ใหญ่)", "Very detailed (large file)")],
  ], "2.2");

  const slideBox = el("div", { class: "pp-slide" });
  const meta = el("div", { class: "pp-meta" });
  const stage = el("div", { class: "pp-stage", hidden: true }, [slideBox, meta]);

  const go = button(tr("แปลงเป็น PowerPoint", "Convert to PowerPoint"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("รูปแบบสไลด์", "Slide format"), node: el("div", {}, [
      field(tr("ขนาดสไลด์", "Slide size"), layoutSel),
      field(tr("ความละเอียด", "Quality"), qualitySel),
      el("div", { class: "pp-warn" },
         tr("แต่ละสไลด์เป็นภาพของหน้านั้น แก้ข้อความข้างในไม่ได้ ต้องแก้ที่ไฟล์ต้นทางแล้วแปลงใหม่",
            "Each slide becomes a picture of that page, so the text inside cannot be edited. To change the content, edit the source file and convert again")),
    ]) },
    center: { node: stage, empty: tr("เลือกไฟล์ PDF เพื่อดูว่าจะได้กี่สไลด์", "Choose a PDF to see how many slides you get") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let file = null, pdf = null, pageCount = 0, pageSize = null;

  async function onFile(fs) {
    file = fs[0] || null;
    results.innerHTML = "";
    st.clear();
    if (pdf) { try { pdf.destroy(); } catch {} pdf = null; }
    if (!file) { stage.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      pdf = await openPdf(file, passwordBox(ws.body));
      pageCount = pdf.numPages;
      const p1 = await pdf.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      pageSize = { w: vp.width, h: vp.height };
      p1.cleanup();
      stage.hidden = false;
      ws.showCanvas(true);
      go.disabled = false;
      st.clear();
      preview();
    } catch (e) {
      stage.hidden = true; ws.showCanvas(false); go.disabled = true;
      st.err(friendlyPdfError(e, file.name).message);
    }
  }
  layoutSel.onchange = preview;

  /** ขนาดสไลด์ที่จะใช้จริง หน่วยนิ้ว */
  function slideSize() {
    const L = LAYOUTS[layoutSel.value] || LAYOUTS.wide;
    if (!L.fit) return { w: L.w, h: L.h };
    /* ตามสัดส่วนหน้า PDF · 72 พอยต์ = 1 นิ้ว */
    const w = pageSize ? pageSize.w / 72 : 10;
    const h = pageSize ? pageSize.h / 72 : 7.5;
    return { w: +w.toFixed(2), h: +h.toFixed(2) };
  }

  function preview() {
    if (!pageCount) return;
    const s = slideSize();
    const boxW = 220;
    Object.assign(slideBox.style, { width: boxW + "px", height: (boxW * s.h / s.w) + "px" });
    slideBox.textContent = tr(`${s.w} x ${s.h} นิ้ว`, `${s.w} x ${s.h} in`);
    meta.replaceChildren(
      el("b", {}, tr(`${pageCount} หน้า เป็น ${pageCount} สไลด์`,
                     `${pl(pageCount, "page", "pages")} becomes ${pl(pageCount, "slide", "slides")}`)),
      el("div", {}, tr("หน้าจะถูกวางเต็มสไลด์โดยรักษาสัดส่วนเดิม",
                       "Each page is placed to fill the slide while keeping its shape")),
    );
  }

  async function run() {
    if (!file || !pdf) return;
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังเตรียมตัวแปลง…", "Getting the converter ready…"));
    try {
      const [PptxGenJS] = await loadLibs("pptxgen");
      const pptx = new PptxGenJS();
      const s = slideSize();
      pptx.defineLayout({ name: "fkslide", width: s.w, height: s.h });
      pptx.layout = "fkslide";

      const scale = +qualitySel.value || 2.2;
      st.info(tr("กำลังแปลงทีละหน้า…", "Converting page by page…"));
      for (let i = 1; i <= pageCount; i++) {
        if (st.cancelled) break;
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        canvas.width = canvas.height = 0;
        const base = page.getViewport({ scale: 1 });
        page.cleanup();

        /* วางภาพให้เต็มสไลด์โดยรักษาสัดส่วน แล้วจัดกลาง
           ‼️ ถ้าปล่อยให้ยืดเต็มสไลด์ สไลด์แนวตั้งที่วางบนสไลด์แนวนอนจะบิดจนอ่านไม่ได้ */
        const k = Math.min(s.w / (base.width / 72), s.h / (base.height / 72));
        const w = (base.width / 72) * k, h = (base.height / 72) * k;
        const slide = pptx.addSlide();
        slide.addImage({ data: dataUrl, x: (s.w - w) / 2, y: (s.h - h) / 2, w, h });

        st.progress((i / pageCount) * 100, `(${i}/${pageCount})`);
        await yieldToBrowser();
      }
      st.end();

      st.info(tr("กำลังสร้างไฟล์…", "Building the file…"));
      const blob = await pptx.write({ outputType: "blob" });
      const name = stripExt(file.name) + ".pptx";
      st.progress(null);
      st.ok(tr(`แปลงเสร็จ ${pageCount} สไลด์`, `Done, ${pl(pageCount, "slide", "slides")}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageCount} สไลด์, ${fmtBytes(blob.size)}`,
                             `${pl(pageCount, "slide", "slides")}, ${fmtBytes(blob.size)}`))]),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download",
          label: tr(`ดาวน์โหลด ${name}`, `Download ${name}`),
          onclick: () => download(blob, name) }),
      ]));
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
