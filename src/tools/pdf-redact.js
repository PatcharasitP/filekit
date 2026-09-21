// ── ปิดทับข้อมูลลับให้หายจริง ──────────────────────────────────────────────
// ‼️ ทำไมต้องมีตัวนี้แยกจาก "แก้ไขข้อความบน PDF"
//   ตัวแก้ไขข้อความวาดสี่เหลี่ยมทับ ซึ่ง **ตัวอักษรเดิมยังอยู่ในไฟล์ครบทุกตัว**
//   ลากคลุมแล้วคัดลอกก็ยังได้ข้อความเดิมออกมา เปิดด้วยโปรแกรมอื่นก็เห็น
//   ตัวมันเองเขียนเตือนไว้ว่า "ถ้าเป็นความลับให้ใช้วิธีอื่น" มาตลอด โดยที่เรายังไม่มีวิธีอื่นให้
//   ตัวนี้คือวิธีอื่นนั้น
//
// ‼️ วิธีที่ใช้: หน้าไหนมีกล่องปิดทับ **แปลงทั้งหน้าเป็นภาพ** แล้ววาดกล่องทึบลงบนภาพ
//   ข้อความใต้กล่องจึงไม่เหลืออยู่ในไฟล์เลย เพราะทั้งหน้าไม่มีชั้นข้อความอีกต่อไป
//   ส่วนหน้าที่ไม่ได้แตะ คัดลอกของเดิมมาทั้งหน้า ข้อความยังค้นได้เหมือนเดิม
//   ราคาที่ต้องจ่ายคือหน้าที่ถูกปิดทับจะค้นหาข้อความไม่ได้อีก ซึ่งบอกผู้ใช้ตรง ๆ บนหน้าจอ
//
// ‼️ ล้างข้อมูลกำกับไฟล์ด้วยเสมอ เพราะชื่อเรื่องกับชื่อผู้เขียนมักมีข้อมูลลับติดมา
//   (เช่น "สัญญาจ้าง-นายสมชาย-ฉบับลับ.docx" ที่ Word ใส่เป็น Title ให้อัตโนมัติ)
import { openPdf, loadPdfLib, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, downloadButton, select,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

const VIEW_SCALE = 1.6;      // ความละเอียดของภาพที่ใช้ดูบนจอ
const OUT_SCALE = 2.2;       // ความละเอียดของภาพที่ฝังลงไฟล์จริง สูงกว่าจอเพราะต้องพิมพ์ได้

const STYLE = `
.rd-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.rd-wrap[hidden]{display:none}
.rd-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-mute)}
.rd-bar .grow{flex:1 1 auto}
.rd-scroll{flex:1 1 auto;min-height:0;overflow:auto;display:flex;justify-content:center;
  align-items:flex-start;padding:4px}
.rd-stage{position:relative;line-height:0;box-shadow:var(--sh2);border-radius:var(--r-sm);overflow:hidden}
.rd-stage canvas{display:block;width:100%;height:auto}
.rd-layer{position:absolute;inset:0;cursor:crosshair;touch-action:none}
.rd-box{position:absolute;background:#111;box-sizing:border-box}
.rd-box .rm{position:absolute;inset-block-start:-9px;inset-inline-end:-9px;width:20px;height:20px;
  border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--text);
  font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer;padding:0}
.rd-pages{display:flex;gap:6px;flex-wrap:wrap}
.rd-pg{min-width:36px;min-height:36px;padding:4px 9px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--card);color:var(--text);font-size:13px;cursor:pointer;font-variant-numeric:tabular-nums}
.rd-pg.on{border-color:var(--g-pdf);color:var(--g-pdf);font-weight:700}
.rd-pg.has{background:color-mix(in srgb,#111 12%,transparent)}
.rd-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
.rd-warn{border:1px solid var(--line);border-left:3px solid #b8860b;border-radius:var(--r-sm);
  background:color-mix(in srgb,#b8860b 7%,transparent);padding:10px 12px;font-size:13px;line-height:1.6}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const viewCanvas = el("canvas", {});
  const layer = el("div", { class: "rd-layer" });
  const stage = el("div", { class: "rd-stage" }, [viewCanvas, layer]);
  const scroller = el("div", { class: "rd-scroll" }, [stage]);
  const pagesBar = el("div", { class: "rd-pages" });
  const counter = el("div", { class: "grow" });
  const undoBtn = button(tr("ย้อนกล่องล่าสุด", "Undo last box"), { ghost: true, icon: "undo", onclick: undoLast });
  const clearBtn = button(tr("ล้างทั้งหมด", "Clear all"), { ghost: true, onclick: clearAll });
  const wrap = el("div", { class: "rd-wrap", hidden: true }, [
    el("div", { class: "rd-bar" }, [counter, undoBtn, clearBtn]),
    scroller,
    pagesBar,
    el("div", { class: "rd-note" },
       tr("ลากคลุมส่วนที่ต้องการลบ หน้าที่มีกล่องจะถูกแปลงเป็นภาพทั้งหน้า ข้อความใต้กล่องจึงหายไปจากไฟล์จริง",
          "Drag over what must go. Any page with a box becomes an image, so the text underneath is gone from the file")),
  ]);

  const qualitySel = select([
    ["2.2", tr("ปกติ", "Normal")],
    ["3", tr("ละเอียดสูง (ไฟล์ใหญ่ขึ้น)", "High detail (larger file)")],
  ], "2.2");

  const go = button(tr("บันทึกไฟล์ที่ลบแล้ว", "Save the redacted file"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("การลบ", "Redaction"), node: el("div", {}, [
      el("div", { class: "rd-warn" },
         tr("ลบของจริง ไม่ใช่วางสี่เหลี่ยมทับ หน้าที่ลบจะค้นหาไม่ได้และย้อนไม่ได้ เก็บต้นฉบับไว้เสมอ",
            "Removes the content for real. Redacted pages are no longer searchable and cannot be undone, so keep your original")),
      el("label", { class: "field" }, [
        el("span", {}, tr("ความละเอียดของหน้าที่ถูกลบ", "Quality of redacted pages")),
        qualitySel,
      ]),
      el("div", { class: "rd-note" },
         tr("ข้อมูลกำกับไฟล์ เช่นชื่อเรื่องและชื่อผู้เขียน จะถูกล้างให้อัตโนมัติ เพราะมักมีข้อมูลลับติดมาด้วย",
            "The file's title, author and other metadata are cleared automatically, since they often carry secrets too")),
    ]) },
    center: { node: wrap, empty: tr("เลือกไฟล์ PDF แล้วลากคลุมส่วนที่ต้องการลบ", "Choose a PDF, then drag over what must be removed") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let file = null, pdf = null, pageCount = 0, cur = 0;
  let boxes = [];            // { page, x, y, w, h } ทุกค่าเป็นสัดส่วน 0 ถึง 1 ของหน้า

  async function onFile(fs) {
    file = fs[0] || null;
    results.innerHTML = "";
    boxes = [];
    st.clear();
    if (pdf) { try { pdf.destroy(); } catch {} pdf = null; }
    if (!file) { wrap.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    try {
      st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
      pdf = await openPdf(file, passwordBox(ws.body));
      pageCount = pdf.numPages;
      cur = 0;
      wrap.hidden = false;
      ws.showCanvas(true);
      await showPage(0);
      st.clear();
      refresh();
    } catch (e) {
      wrap.hidden = true; ws.showCanvas(false);
      st.err(friendlyPdfError(e, file.name).message);
    }
  }

  async function showPage(i) {
    if (!pdf || i < 0 || i >= pageCount) return;
    cur = i;
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: VIEW_SCALE });
    viewCanvas.width = Math.floor(vp.width);
    viewCanvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: viewCanvas.getContext("2d"), viewport: vp }).promise;
    page.cleanup();
    /* ‼️ กว้างเท่าที่ในกล่องกลางมี ไม่ใช่เลขตายตัว จะได้ใช้จอกว้างได้เต็มและไม่ล้นจอแคบ */
    const room = Math.max(240, (scroller.clientWidth || 700) - 20);
    stage.style.width = Math.min(vp.width, room) + "px";
    drawBoxes();
    refresh();
  }

  function drawBoxes() {
    layer.replaceChildren();
    boxes.forEach((b, idx) => {
      if (b.page !== cur) return;
      const node = el("div", { class: "rd-box", style: {
        left: b.x * 100 + "%", top: b.y * 100 + "%",
        width: b.w * 100 + "%", height: b.h * 100 + "%" } }, [
        el("button", { class: "rm", type: "button",
          "aria-label": tr(`ลบกล่องที่ ${idx + 1}`, `Remove box ${idx + 1}`),
          onclick: (ev) => { ev.stopPropagation(); boxes.splice(idx, 1); drawBoxes(); refresh(); } }, "×"),
      ]);
      layer.appendChild(node);
    });
  }

  function refresh() {
    const n = boxes.length;
    const pagesHit = new Set(boxes.map((b) => b.page));
    go.disabled = !n;
    counter.textContent = n
      ? tr(`${n} กล่อง บน ${pagesHit.size} หน้า`, `${pl(n, "box", "boxes")} on ${pl(pagesHit.size, "page", "pages")}`)
      : tr("ยังไม่มีกล่อง ลากคลุมบนหน้าเพื่อเริ่ม", "No boxes yet, drag over the page to start");
    undoBtn.disabled = !n;
    clearBtn.disabled = !n;
    pagesBar.replaceChildren(...Array.from({ length: pageCount }, (_, i) => {
      const b = el("button", { class: "rd-pg" + (i === cur ? " on" : "") + (pagesHit.has(i) ? " has" : ""),
        type: "button", onclick: () => showPage(i),
        "aria-label": tr(`ไปหน้า ${i + 1}`, `Go to page ${i + 1}`) }, String(i + 1));
      return b;
    }));
  }

  function undoLast() { boxes.pop(); drawBoxes(); refresh(); }
  function clearAll() { boxes = []; drawBoxes(); refresh(); }

  /* ── ลากคลุมเพื่อสร้างกล่อง ─────────────────────────────────────────── */
  const rel = (ev) => {
    const r = layer.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  };
  let start = null, ghost = null;
  layer.addEventListener("pointerdown", (ev) => {
    if (!pdf || ev.target.closest(".rm")) return;
    ev.preventDefault();
    start = rel(ev);
    ghost = el("div", { class: "rd-box", style: { opacity: ".7" } });
    layer.appendChild(ghost);
    layer.setPointerCapture(ev.pointerId);
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start || !ghost) return;
    const p = rel(ev);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    Object.assign(ghost.style, { left: x * 100 + "%", top: y * 100 + "%",
                                 width: w * 100 + "%", height: h * 100 + "%" });
  });
  const endDrag = (ev) => {
    if (!start || !ghost) return;
    const p = rel(ev);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    start = null; ghost.remove(); ghost = null;
    /* กล่องจิ๋วเกินไปมักเกิดจากการคลิกพลาด ไม่ใช่เจตนา */
    if (w > 0.005 && h > 0.004) boxes.push({ page: cur, x, y, w, h });
    drawBoxes();
    refresh();
  };
  layer.addEventListener("pointerup", endDrag);
  layer.addEventListener("pointercancel", endDrag);

  /* ── บันทึก ─────────────────────────────────────────────────────────── */
  async function run() {
    if (!file || !pdf || !boxes.length) return;
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังลบข้อมูลออกจากไฟล์…", "Removing the content from the file…"));
    try {
      const { PDFDocument } = PDFLib;
      const src = await loadPdfLib(file);
      const out = await PDFDocument.create();
      const scale = +qualitySel.value || OUT_SCALE;
      const hit = new Set(boxes.map((b) => b.page));

      for (let i = 0; i < pageCount; i++) {
        if (st.cancelled) break;
        if (!hit.has(i)) {
          /* หน้าที่ไม่ได้แตะ คัดลอกของเดิมมาทั้งหน้า ข้อความยังค้นได้ */
          const [copied] = await out.copyPages(src.doc, [i]);
          out.addPage(copied);
        } else {
          const page = await pdf.getPage(i + 1);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          /* ‼️ วาดกล่องทึบลงบนภาพ ไม่ใช่ลงบน PDF
             ถ้าวาดลง PDF ทีหลัง ข้อความใต้กล่องจะยังอยู่ในชั้นข้อความเหมือนเดิม
             ซึ่งคือบั๊กเดียวกับที่เครื่องมือแก้ไขข้อความมีอยู่ และเป็นเหตุผลที่ตัวนี้เกิดขึ้น */
          ctx.fillStyle = "#111";
          for (const b of boxes) {
            if (b.page !== i) continue;
            ctx.fillRect(Math.round(b.x * canvas.width), Math.round(b.y * canvas.height),
                         Math.ceil(b.w * canvas.width), Math.ceil(b.h * canvas.height));
          }
          const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const base = page.getViewport({ scale: 1 });
          canvas.width = canvas.height = 0;
          page.cleanup();
          const img = await out.embedJpg(bytes);
          const p = out.addPage([base.width, base.height]);
          p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        }
        st.progress(((i + 1) / pageCount) * 100, `(${i + 1}/${pageCount})`);
        await yieldToBrowser();
      }
      st.end();

      /* ‼️ ล้างข้อมูลกำกับไฟล์ ชื่อเรื่องกับผู้เขียนมักมีข้อมูลลับติดมาจากโปรแกรมต้นทาง */
      out.setTitle(""); out.setAuthor(""); out.setSubject("");
      out.setKeywords([]); out.setCreator(""); out.setProducer("");

      const blob = new Blob([await out.save()], { type: "application/pdf" });
      const name = stripExt(file.name) + tr("-ลบข้อมูลแล้ว.pdf", "-redacted.pdf");
      st.progress(null);
      st.ok(tr(`ลบข้อมูลใน ${hit.size} หน้าเรียบร้อย หน้าที่ถูกลบจะค้นหาข้อความไม่ได้อีก`,
               `Redacted ${pl(hit.size, "page", "pages")}. Those pages are no longer searchable`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageCount} หน้า, ลบใน ${hit.size} หน้า, ${fmtBytes(blob.size)}`,
                             `${pl(pageCount, "page", "pages")}, ${hit.size} redacted, ${fmtBytes(blob.size)}`))]),
        downloadButton(blob, name),
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
