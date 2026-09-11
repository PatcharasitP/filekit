// ── PDF เป็นภาพยาวแผ่นเดียว ────────────────────────────────────────────────
// คนไทยส่งเอกสารกันในไลน์เป็นหลัก และ PDF บนแชทมือถือเปิดยาก ต้องกดโหลดก่อน
// คนเลยแคปทีละหน้าส่งเป็นรูป ซึ่งได้ 10 รูปเรียงกันมั่ว ๆ อ่านลำดับไม่ออก
// ตัวนี้ต่อทุกหน้าเป็นภาพเดียวยาว ๆ เลื่อนอ่านรวดเดียวจบ ส่งต่อง่าย
//
// ‼️ ข้อจำกัดจริงของเบราว์เซอร์ที่ต้องจัดการให้ดี: canvas มีเพดานทั้งด้านกว้าง/สูง
//    และเพดาน "พื้นที่รวม" ซึ่งมือถือต่ำกว่าเดสก์ท็อปมาก · เกินเพดานแล้ว canvas
//    จะคืนภาพเปล่าสีดำหรือโปร่งใสแบบเงียบ ๆ ไม่ throw อะไรเลย
//    จึงคำนวณก่อนเสมอ แล้วแบ่งเป็นหลายภาพให้อัตโนมัติเมื่อเกิน พร้อมบอกเหตุผล
import { openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, parsePages, fmtBytes, yieldToBrowser } from "../ui.js";
import { tr, pl } from "../i18n.js";

/* เพดานที่ปลอดภัยข้ามเบราว์เซอร์ (Safari บนมือถือต่ำสุด) — ต่ำกว่าเพดานจริงของ Chrome มาก
   แต่ยอมเสียหัวไว้ ดีกว่าได้ภาพดำสนิทโดยไม่มีอะไรฟ้อง */
const MAX_SIDE = 16384;
const MAX_AREA = 60_000_000;

const GAP = { none: 0, thin: 8, thick: 24 };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});
  const plan = el("div", { class: "note" });
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    accept: "application/pdf,.pdf", multiple: false,
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; plan.textContent = ""; },
  });

  const fmt = select([
    ["jpeg", tr("JPG (ไฟล์เล็ก ส่งไลน์ง่าย)", "JPG (small, easy to send)")],
    ["png", tr("PNG (คมชัด ไฟล์ใหญ่)", "PNG (sharp, larger file)")],
  ], "jpeg");
  const dpi = select([
    ["1.2", tr("อ่านบนมือถือพอ (~90 DPI)", "Enough to read on a phone (~90 DPI)")],
    ["1.8", tr("ชัดดี แนะนำ (~130 DPI)", "Good and sharp, recommended (~130 DPI)")],
    ["2.6", tr("ชัดมาก ไฟล์ใหญ่ (~190 DPI)", "Very sharp, large file (~190 DPI)")],
  ], "1.8");
  const gapSel = select([
    ["thin", tr("เส้นคั่นบาง", "Thin gap")],
    ["thick", tr("เว้นห่างชัด", "Wide gap")],
    ["none", tr("ต่อกันสนิท", "No gap")],
  ], "thin");
  const rangeInput = el("input", { type: "text", value: "1-", placeholder: tr("เช่น 1-5,8", "e.g. 1-5,8") });
  const go = button(tr("ต่อเป็นภาพยาว", "Stitch into one long image"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [
      field(tr("ชนิดรูป", "Image type"), fmt),
      field(tr("ความละเอียด", "Resolution"), dpi),
    ]),
    el("div", { class: "row" }, [
      field(tr("ช่องว่างระหว่างหน้า", "Gap between pages"), gapSel),
      field(tr("หน้าที่ต้องการ", "Pages"), rangeInput, tr("ว่างไว้ = ทุกหน้า", "Leave blank = all pages")),
    ]),
    el("div", { class: "actions" }, [go]), st.node, plan, extra, results);
  body.appendChild(el("div", { class: "note" },
    tr("ได้ภาพเดียวยาวต่อกันทุกหน้า เลื่อนอ่านรวดเดียว ส่งในแชทได้เลยไม่ต้องกดโหลด",
       "You get one tall image with every page stacked, ready to send in a chat with no download step")));

  /** แบ่งหน้าออกเป็นก้อน ๆ ให้แต่ละก้อนอยู่ในเพดาน canvas
   *  ‼️ ต้องคำนวณก่อนวาด ไม่ใช่วาดแล้วค่อยรู้ — เกินเพดานแล้ว canvas เงียบ ไม่ throw */
  function chunkPages(sizes, gap) {
    const width = Math.max(...sizes.map((s) => s.w));
    const chunks = [];
    let cur = [], curH = 0;
    for (const s of sizes) {
      const add = s.h + (cur.length ? gap : 0);
      const tooTall = curH + add > MAX_SIDE;
      const tooBig = width * (curH + add) > MAX_AREA;
      if (cur.length && (tooTall || tooBig)) { chunks.push({ pages: cur, h: curH }); cur = []; curH = 0; }
      cur.push(s);
      curH += cur.length === 1 ? s.h : add;
    }
    if (cur.length) chunks.push({ pages: cur, h: curH });
    return { width, chunks };
  }

  async function run() {
    if (!file) return st.err(tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF file first"));
    results.innerHTML = "";
    plan.textContent = "";
    go.disabled = true;
    st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
    try {
      const pdf = await openPdf(file, passwordBox(extra));
      const pageNums = parsePages(rangeInput.value || "1-", pdf.numPages);
      if (!pageNums.length)
        throw new Error(tr(`ไม่พบหน้าตามที่ระบุ (ไฟล์มี ${pdf.numPages} หน้า)`,
                           `No matching pages (the file has ${pdf.numPages})`));

      const scale = +dpi.value;
      const gap = GAP[gapSel.value];
      const mime = fmt.value === "png" ? "image/png" : "image/jpeg";
      const ext = fmt.value === "png" ? "png" : "jpg";

      // ① วัดขนาดทุกหน้าก่อน เพื่อรู้ว่าต้องแบ่งกี่ภาพ (ยังไม่วาดอะไรเลย)
      st.info(tr("กำลังวัดขนาดหน้า…", "Measuring the pages…"));
      const sizes = [];
      for (const n of pageNums) {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale });
        sizes.push({ n, w: Math.floor(vp.width), h: Math.floor(vp.height) });
        page.cleanup();
      }
      // ‼️ หน้าเดียวที่ใหญ่เกินเพดานเอง (เช่นโปสเตอร์ A0 ที่ความละเอียดสูงสุด) แบ่งยังไงก็ไม่พอ
      //    ต้องบอกให้ลดความละเอียดตั้งแต่ตอนนี้ ไม่ใช่ปล่อยให้วาดแล้วได้ภาพดำ
      const tooBig = sizes.find((s) => s.h > MAX_SIDE || s.w > MAX_SIDE || s.w * s.h > MAX_AREA);
      if (tooBig)
        throw new Error(tr(`หน้า ${tooBig.n} ใหญ่เกินที่เบราว์เซอร์วาดไหวที่ความละเอียดนี้ ลองเลือกความละเอียดต่ำลง`,
                           `Page ${tooBig.n} is too large for a browser to draw at this resolution. Pick a lower one`));

      const { width, chunks } = chunkPages(sizes, gap);

      if (chunks.length > 1)
        plan.textContent = tr(
          `หน้าทั้งหมดต่อกันแล้วสูงเกินที่เบราว์เซอร์วาดไหว จึงแบ่งให้เป็น ${chunks.length} ภาพ`,
          `Stacked together the pages exceed what a browser can draw, so this is split into ${pl(chunks.length, "image", "images")}`);

      // ② วาดจริงทีละก้อน
      const base = stripExt(file.name);
      const made = [];
      let done = 0;
      st.begin();
      for (let c = 0; c < chunks.length; c++) {
        if (st.cancelled) break;
        const { pages, h } = chunks[c];
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        // ‼️ ต้องทาพื้นขาวเสมอ ไม่ใช่เฉพาะ JPG — หน้า PDF ที่ไม่ได้ทาพื้นจะโปร่งใส
        //    พอเปิดในแอปแชทที่พื้นหลังมืด ตัวหนังสือดำจะจมหายไปทั้งแผ่น
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, h);

        let y = 0;
        for (const s of pages) {
          if (st.cancelled) break;
          const page = await pdf.getPage(s.n);
          const vp = page.getViewport({ scale });

          /* ‼️ ห้ามวาดหลายหน้าลง canvas ใบเดียวตรง ๆ ด้วย transform เด็ดขาด
           * pdf.js ทาพื้นทับ canvas "ทั้งใบ" ก่อนวาดทุกครั้ง (beginDrawing เรียก
           * ctx.fillRect(0, 0, canvas.width, canvas.height) เสมอ) หน้าที่วาดไปแล้ว
           * จึงถูกลบเกลี้ยง เหลือแค่หน้าสุดท้ายหน้าเดียว โดยไม่มี error อะไรเลย
           * และสถานะยังขึ้นว่า "ต่อ 5 หน้าเรียบร้อย" ตามปกติ
           * (จับได้จาก tests/browser_datatools.py ที่ตรวจว่าทุกแถบของภาพมีเนื้อหาจริง)
           * จึงวาดทีละหน้าลงผืนของตัวเองก่อน แล้วค่อยแปะลงผืนยาว */
          const one = document.createElement("canvas");
          one.width = s.w; one.height = s.h;
          await page.render({ canvasContext: one.getContext("2d"), viewport: vp }).promise;
          page.cleanup();

          // หน้าที่แคบกว่าหน้าอื่น (เช่นหน้าแนวตั้งปนแนวนอน) จัดกลางให้ ไม่ชิดซ้าย
          ctx.drawImage(one, Math.floor((width - s.w) / 2), y);
          one.width = one.height = 0;

          y += s.h + gap;
          st.progress((++done / sizes.length) * 100, `(${done}/${sizes.length})`);
          await yieldToBrowser();
        }

        const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.9));
        canvas.width = canvas.height = 0;
        if (!blob) throw new Error(tr("เบราว์เซอร์สร้างภาพขนาดนี้ไม่ไหว ลองลดความละเอียดลง",
                                      "The browser could not create an image this large. Try a lower resolution"));
        const suffix = chunks.length > 1 ? `-${c + 1}` : "";
        made.push({
          blob,
          name: tr(`${base}-ภาพยาว${suffix}.${ext}`, `${base}-long${suffix}.${ext}`),
          meta: tr(`${pages.length} หน้า, ${width}x${h} px, ${fmtBytes(blob.size)}`,
                   `${pl(pages.length, "page", "pages")}, ${width}x${h} px, ${fmtBytes(blob.size)}`),
        });
      }
      st.end();
      st.progress(null);
      if (!made.length) throw new Error(tr("ยังไม่ได้ภาพเลย", "No image was produced"));

      st.ok(st.cancelled
        ? tr(`หยุดตามที่สั่งแล้ว ได้ ${made.length} ภาพที่ทำเสร็จก่อนหยุด`,
             `Stopped as asked, ${pl(made.length, "image", "images")} finished before that`)
        : made.length === 1
          ? tr(`ต่อ ${sizes.length} หน้าเป็นภาพเดียวเรียบร้อย`, `Stacked ${pl(sizes.length, "page", "pages")} into one image`)
          : tr(`ได้ ${made.length} ภาพ จาก ${sizes.length} หน้า`, `${pl(made.length, "image", "images")} from ${pl(sizes.length, "page", "pages")}`));

      for (const m of made) {
        results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, m.meta)]),
          el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
          downloadButton(m.blob, m.name),
        ]));
      }
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(tr("ต่อภาพไม่สำเร็จ: ", "Could not stitch the image: ") + e.message);
    } finally {
      go.disabled = false;
    }
  }

  return wrap;
}
