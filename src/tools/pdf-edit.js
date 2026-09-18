// ── แก้ไขข้อความบน PDF ─────────────────────────────────────────────────────
// โจทย์จริงจากพี่ปอนด์ 18/09/2026 "ต้องการลบวันที่ใน PDF แล้วพิมพ์อีกวันที่แทน"
// เป็นงานที่เจอบ่อยมากกับสัญญาและเอกสารราชการ ที่ได้ไฟล์มาแล้วต้องแก้นิดเดียว
// แต่ไม่มีไฟล์ต้นฉบับ Word จึงต้องเปิดโปรแกรมแพง ๆ หรือพิมพ์ออกมาแล้วเขียนมือ
//
// ‼️ ทำไมเป็น "ปิดทับแล้วพิมพ์ใหม่" ไม่ใช่แก้ตัวอักษรในไฟล์จริง
//    ข้อความใน PDF ไม่ได้เก็บเป็นบรรทัดให้แก้ได้ แต่เป็นคำสั่งวาดทีละชิ้น
//    พร้อมพิกัดและระยะห่างที่คำนวณไว้แล้ว แก้ตัวอักษรตรง ๆ จึงทำให้ทั้งย่อหน้าเพี้ยน
//    เครื่องมือระดับโลกอย่าง iLovePDF ก็ใช้วิธีวางกล่องทับเหมือนกัน (ดูของจริงแล้ว)
//
// ‼️ ภาษาไทยไม่ต้องโหลดไลบรารีเพิ่ม
//    pdf-lib ฝังฟอนต์ไทยเองไม่ได้ถ้าไม่มี fontkit ซึ่งเราไม่โหลดเพราะหนัก
//    จึงใช้วิธีเดียวกับใส่เลขหน้าและลายน้ำ คือวาดข้อความลง canvas แล้วฝังเป็น PNG
//    ได้ภาษาไทยครบทุกตัวรวมสระและวรรณยุกต์ โดยไม่เพิ่มขนาดที่ต้องโหลด
import { loadPdfLib, ENCRYPTED_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { tr, pl } from "../i18n.js";

const VIEW_SCALE = 1.6;    // ความละเอียดที่เรนเดอร์หน้ามาให้ดู ยิ่งสูงยิ่งวางตำแหน่งแม่น
const PNG_SCALE = 4;       // ความละเอียดของข้อความที่ฝังลงไฟล์ ต้องสูงกว่าจอไม่งั้นเบลอ

/* วาดข้อความลง canvas แล้วคืนเป็น PNG พร้อมขนาดจริงเป็นหน่วยของ PDF
   ‼️ ต้องเผื่อความสูงให้สระบนกับวรรณยุกต์ไทย ไม่งั้นโดนตัดหัว
      ใช้ 1.7 เท่าของขนาดตัวอักษร ซึ่งวัดจากข้อความที่มีของยากครบแล้ว */
function textToPng(text, { fontSize, color, weight = 400 }) {
  const font = `${weight} ${fontSize * PNG_SCALE}px "FK Sarabun","Sarabun","Noto Sans Thai",sans-serif`;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 6;
  const h = Math.ceil(fontSize * PNG_SCALE * 1.7);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(w, 2);
  canvas.height = Math.max(h, 2);
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 3, h / 2);
  return { dataUrl: canvas.toDataURL("image/png"), w: w / PNG_SCALE, h: h / PNG_SCALE };
}

const hexToRgb01 = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

const STYLE = `
.pe-left,.pe-right{display:flex;flex-direction:column;gap:10px}
.pe-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:7px;
  max-height:330px;overflow:auto;padding:2px}
.pe-thumb{position:relative;border:2px solid var(--line-soft);border-radius:7px;overflow:hidden;
  cursor:pointer;background:#fff;padding:0;line-height:0}
.pe-thumb img{width:100%;height:auto;display:block}
.pe-thumb.on{border-color:var(--brand)}
.pe-thumb b{position:absolute;inset-block-end:2px;inset-inline-end:3px;font-size:10px;
  background:rgba(0,0,0,.6);color:#fff;border-radius:4px;padding:0 4px;line-height:15px;font-weight:700}
.pe-thumb .dot{position:absolute;inset-block-start:3px;inset-inline-start:3px;width:8px;height:8px;
  border-radius:50%;background:var(--brand);box-shadow:0 0 0 2px #fff}

/* เวทีแก้ไข หน้ากระดาษกับชั้นวาดทับต้องซ้อนกันพอดีเป๊ะ ไม่งั้นตำแหน่งเพี้ยน */
/* ‼️ เวทีต้องสูงเท่าหน้ากระดาษเป๊ะ ห้ามถูกบีบ (เจอจริง 18/09/2026)
   กล่องกลางเป็น flex column ที่มีเพดานความสูง เวทีจึงโดนหดจาก 954 เหลือ 631
   แต่ภาพข้างในยังสูง 954 ตามเดิม ผลคือชั้นวาดทับซึ่งอิงขนาดเวที เตี้ยกว่าภาพ 34%
   พิกัดที่คำนวณจากชั้นนั้นจึงเพี้ยนทั้งหมด ข้อความที่วางออกมาใหญ่กว่าที่เห็นบนจอ 53%
   flex:none บอกว่าอย่าหด แล้วปล่อยให้กล่องกลางเลื่อนแทน */
.pe-stage{position:relative;margin:0 auto;max-width:100%;line-height:0;flex:none;
  box-shadow:var(--sh2);border-radius:4px;background:#fff}
.pe-stage canvas{display:block;width:100%;height:auto}
.pe-layer{position:absolute;inset:0;cursor:crosshair}
.pe-layer.text-mode{cursor:text}
.pe-box{position:absolute;box-sizing:border-box}
/* ‼️ กล่องปิดทับมักเป็นสีขาวเพื่อกลืนกับกระดาษ ซึ่งแปลว่าบนจอก็มองไม่เห็นเหมือนกัน
   ผู้ใช้จึงไม่รู้ว่าปิดไปตรงไหนบ้างและปิดครบหรือยัง
   จึงตีกรอบให้เห็นบนจอ แต่กรอบนี้อยู่แค่บนจอ ไม่ได้ติดลงไฟล์จริง */
.pe-box.cover{border:1.5px dashed var(--brand); box-shadow:inset 0 0 0 9999px transparent}
.pe-box.cover::before{content:""; position:absolute; inset:0; background:var(--brand); opacity:.10}
.pe-box.text{display:flex;align-items:center;white-space:pre;overflow:visible;
  font-family:"FK Sarabun","Sarabun","Noto Sans Thai",sans-serif;line-height:1.2}
/* ‼️ ปุ่มเอาออกโผล่เฉพาะตอนชี้หรือโฟกัส (18/09/2026)
   เดิมโผล่ตลอด พอวางของใกล้กันปุ่มจะซ้อนกันจนบังงานตัวเอง
   บนจอสัมผัสที่ไม่มีการชี้ ให้โผล่ตลอดเหมือนเดิม ไม่งั้นกดลบไม่ได้เลย */
.pe-box .rm{position:absolute;inset-block-start:-9px;inset-inline-end:-9px;width:18px;height:18px;
  border-radius:50%;border:0;background:var(--danger,#c0392b);color:#fff;font-size:11px;
  line-height:18px;text-align:center;cursor:pointer;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.4);
  opacity:0;transition:opacity .12s}
.pe-box:hover .rm,.pe-box .rm:focus-visible{opacity:1}
@media (hover:none){ .pe-box .rm{opacity:1} }
.pe-hint{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
`;

export function mount(tool) {
  const st = statusBar();
  const extra = el("div", {});
  const results = el("div", { class: "results" });
  const thumbs = el("div", { class: "pe-thumbs" });
  const stage = el("div", { class: "pe-stage", hidden: true });
  const viewCanvas = el("canvas", {});
  const layer = el("div", { class: "pe-layer" });
  stage.append(viewCanvas, layer);

  let file = null;
  let pdf = null;            // เอกสารที่เปิดค้างไว้ ใช้เรนเดอร์หน้าที่เลือก
  let pageCount = 0;
  let cur = 0;               // หน้าที่กำลังแก้ เริ่มนับ 0
  let pageSize = null;       // ขนาดจริงของหน้าเป็นหน่วย PDF
  let edits = [];            // {page, kind:'cover'|'text', x,y,w,h, text,size,color,weight}
  let thumbData = [];

  // ── เครื่องมือและค่าตั้ง ────────────────────────────────────────────────
  const modeSeg = segmentedModes();
  const textInput = el("input", { type: "text", placeholder: tr("พิมพ์ข้อความที่จะใส่", "Text to add") });
  const sizeSel = select([["10", "10"], ["12", "12"], ["14", "14"], ["16", "16"], ["18", "18"], ["22", "22"], ["28", "28"]], "14");
  const weightSel = select([["400", tr("ปกติ", "Regular")], ["700", tr("หนา", "Bold")]], "400");
  const textColor = el("input", { type: "color", value: "#000000" });
  const coverColor = el("input", { type: "color", value: "#ffffff" });

  function segmentedModes() {
    const wrap = el("div", { class: "row" });
    const mk = (v, label, icon) => {
      const b = button(label, { icon, ghost: true, onclick: () => setMode(v) });
      b.dataset.mode = v;
      return b;
    };
    wrap.append(mk("cover", tr("ปิดทับ", "Cover"), "trash"), mk("text", tr("ใส่ข้อความ", "Add text"), "edit"));
    return wrap;
  }
  let mode = "cover";
  function setMode(v) {
    mode = v;
    layer.classList.toggle("text-mode", v === "text");
    modeSeg.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.mode === v;
      b.classList.toggle("ghost", !on);
      b.setAttribute("aria-pressed", String(on));
    });
    st.info(v === "cover"
      ? tr("ลากคลุมข้อความที่ต้องการลบ", "Drag over the text you want to remove")
      : tr("พิมพ์ข้อความด้านขวาก่อน แล้วคลิกตำแหน่งบนหน้า", "Type the text on the right, then click a spot"));
  }

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => {
      file = f[0] || null;
      results.innerHTML = "";
      edits = [];
      if (file) openFile();
      else resetAll();
    },
  });

  const undoBtn = button(tr("ย้อนล่าสุด", "Undo last"), { icon: "undo", ghost: true, onclick: undoLast });
  const clearBtn = button(tr("ล้างหน้านี้", "Clear page"), { icon: "trash", ghost: true, onclick: clearPage });
  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  [undoBtn, clearBtn].forEach((b) => { b.disabled = true; });
  saveBtn.disabled = true;

  const leftNode = el("div", { class: "pe-left" }, [
    dz.container, extra,
    el("div", {}, [el("h3", {}, tr("หน้าในไฟล์", "Pages")), thumbs]),
  ]);
  const rightNode = el("div", { class: "pe-right" }, [
    el("div", {}, [el("h3", {}, tr("เครื่องมือ", "Tool")), modeSeg]),
    el("div", {}, [
      el("h3", {}, tr("ข้อความที่จะใส่", "Text to add")),
      field(tr("ข้อความ", "Text"), textInput),
      el("div", { class: "row" }, [
        field(tr("ขนาด", "Size"), sizeSel),
        field(tr("น้ำหนัก", "Weight"), weightSel),
        field(tr("สีตัวอักษร", "Text colour"), textColor),
      ]),
    ]),
    el("div", {}, [
      el("h3", {}, tr("สีที่ใช้ปิดทับ", "Cover colour")),
      field(tr("สี", "Colour"), coverColor,
        tr("ปกติใช้สีขาวให้กลืนกับกระดาษ", "White usually blends with the paper")),
    ]),
    el("div", { class: "pe-hint" },
      tr("ปิดทับคือวางสี่เหลี่ยมทับข้อความเดิม ตัวอักษรเดิมยังอยู่ในไฟล์",
         "Cover puts a rectangle over the old text. The original text stays in the file")),
  ]);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF file"), node: leftNode },
    center: { node: stage, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อเริ่มแก้ไข", "No file yet. Choose a PDF to start") },
    right: { title: tr("ตัวเลือก", "Options"), node: rightNode },
    toolbar: [undoBtn, clearBtn],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.append(results,
    el("div", { class: "note" },
      tr("ลากคลุมเพื่อปิดทับข้อความเดิม แล้วพิมพ์ข้อความใหม่วางแทนที่ได้",
         "Drag to cover the old text, then place your new text on top")),
    el("div", { class: "note" },
      tr("ข้อความเดิมยังอยู่ในไฟล์ ถ้าเป็นความลับให้ใช้วิธีอื่น",
         "The original text remains in the file. Do not rely on this to hide secrets")),
  );
  ws.showCanvas(false);
  setMode("cover");

  function resetAll() {
    pdf?.destroy?.();
    pdf = null; pageCount = 0; cur = 0; edits = []; thumbData = [];
    thumbs.innerHTML = "";
    stage.hidden = true;
    st.clear();
    saveBtn.disabled = true;
    undoBtn.disabled = true;
    clearBtn.disabled = true;
    ws.showCanvas(false);
  }

  async function openFile() {
    resetAllKeepFile();
    st.info(tr("กำลังเปิดไฟล์…", "Opening file…"));
    ws.setBusy(true);
    try {
      pdf = await openPdf(file, passwordBox(extra));
      pageCount = pdf.numPages;
      for (let p = 1; p <= pageCount; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 0.2 });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        page.cleanup();
        thumbData.push(c.toDataURL("image/jpeg", 0.6));
        c.width = c.height = 0;
        st.progress((p / pageCount) * 100, `(${p}/${pageCount})`);
        await yieldToBrowser();
      }
      st.progress(null);
      renderThumbs();
      await showPage(0);
      ws.setBusy(false);
      ws.showCanvas(true);
      saveBtn.disabled = false;
      st.ok(tr(`เปิดแล้ว ${pageCount} หน้า`, `Opened ${pl(pageCount, "page", "pages")}`));
      setMode(mode);
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
    }
  }
  function resetAllKeepFile() {
    pdf?.destroy?.();
    pdf = null; thumbData = []; thumbs.innerHTML = "";
    stage.hidden = true; ws.showCanvas(false);
  }

  function renderThumbs() {
    thumbs.innerHTML = "";
    thumbData.forEach((src, i) => {
      const n = edits.filter((e) => e.page === i).length;
      const b = el("button", {
        class: "pe-thumb" + (i === cur ? " on" : ""), type: "button",
        "aria-label": tr(`ไปหน้า ${i + 1}`, `Go to page ${i + 1}`),
        "aria-pressed": String(i === cur),
        onclick: () => showPage(i),
      }, [
        el("img", { src, alt: tr(`หน้า ${i + 1}`, `Page ${i + 1}`), loading: "lazy" }),
        el("b", {}, String(i + 1)),
        n ? el("span", { class: "dot", title: tr(`แก้ไว้ ${n} จุด`, `${n} edits`) }) : null,
      ]);
      thumbs.appendChild(b);
    });
  }

  async function showPage(i) {
    if (!pdf || i < 0 || i >= pageCount) return;
    cur = i;
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: VIEW_SCALE });
    viewCanvas.width = Math.floor(vp.width);
    viewCanvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: viewCanvas.getContext("2d"), viewport: vp }).promise;
    const base = page.getViewport({ scale: 1 });
    pageSize = { w: base.width, h: base.height };
    page.cleanup();
    stage.hidden = false;
    stage.style.width = `${Math.min(vp.width, 900)}px`;
    renderThumbs();
    drawOverlay();
  }

  /* วาดกล่องที่แก้ไว้ทับบนหน้า
     ‼️ ใช้หน่วยเปอร์เซ็นต์ ไม่ใช่พิกเซล เพราะเวทีย่อขยายตามความกว้างจอ
        ถ้าเก็บเป็นพิกเซลของจอ พอจอเปลี่ยนขนาดกล่องจะเลื่อนไปคนละที่ */
  function drawOverlay() {
    layer.innerHTML = "";
    edits.filter((e) => e.page === cur).forEach((e) => {
      const box = el("div", {
        class: `pe-box ${e.kind}`,
        style: {
          left: `${e.x * 100}%`, top: `${e.y * 100}%`,
          width: e.kind === "cover" ? `${e.w * 100}%` : "auto",
          height: e.kind === "cover" ? `${e.h * 100}%` : "auto",
          background: e.kind === "cover" ? e.color : "transparent",
          color: e.kind === "text" ? e.color : null,
          fontSize: e.kind === "text" ? `${(e.size / pageSize.h) * 100 * (stage.clientHeight / 100)}px` : null,
          fontWeight: e.kind === "text" ? e.weight : null,
        },
      }, [
        e.kind === "text" ? e.text : null,
        el("button", {
          class: "rm", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr("เอาการแก้นี้ออก", "Remove this edit"),
          onclick: (ev) => { ev.stopPropagation(); edits = edits.filter((x) => x !== e); drawOverlay(); syncButtons(); renderThumbs(); },
        }, "✕"),
      ]);
      layer.appendChild(box);
    });
    syncButtons();
  }

  function syncButtons() {
    const n = edits.length;
    undoBtn.disabled = !n;
    clearBtn.disabled = !edits.some((e) => e.page === cur);
    st.info(n ? tr(`แก้ไว้ ${n} จุด`, `${n} edit${n > 1 ? "s" : ""} pending`) : "");
  }
  function undoLast() { edits.pop(); drawOverlay(); renderThumbs(); }
  function clearPage() { edits = edits.filter((e) => e.page !== cur); drawOverlay(); renderThumbs(); }

  // ── ลากคลุมเพื่อปิดทับ กับ คลิกเพื่อวางข้อความ ─────────────────────────
  let start = null, ghost = null;
  const rel = (ev) => {
    const r = layer.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  layer.addEventListener("pointerdown", (ev) => {
    if (!pdf || ev.target.closest(".rm")) return;
    if (mode === "text") return placeText(rel(ev));
    start = rel(ev);
    ghost = el("div", { class: "pe-box cover", style: { background: coverColor.value, opacity: ".75" } });
    layer.appendChild(ghost);
    layer.setPointerCapture(ev.pointerId);
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start || !ghost) return;
    const p = rel(ev);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    ghost.style.left = `${x * 100}%`; ghost.style.top = `${y * 100}%`;
    ghost.style.width = `${Math.abs(p.x - start.x) * 100}%`;
    ghost.style.height = `${Math.abs(p.y - start.y) * 100}%`;
  });
  layer.addEventListener("pointerup", (ev) => {
    if (!start) return;
    const p = rel(ev);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    ghost?.remove(); ghost = null; start = null;
    // กันคลิกพลาดกลายเป็นกล่องจิ๋วที่มองไม่เห็นแต่ค้างอยู่ในไฟล์
    if (w < 0.004 || h < 0.004) { drawOverlay(); return; }
    edits.push({ page: cur, kind: "cover", x, y, w, h, color: coverColor.value });
    drawOverlay(); renderThumbs();
    st.ok(tr("ปิดทับแล้ว 1 จุด", "Covered one spot"));
  });

  function placeText(p) {
    const text = textInput.value.trim();
    if (!text) { st.err(tr("พิมพ์ข้อความด้านขวาก่อน", "Type the text on the right first")); return; }
    edits.push({ page: cur, kind: "text", x: p.x, y: p.y, text,
                 size: +sizeSel.value, color: textColor.value, weight: +weightSel.value });
    drawOverlay(); renderThumbs();
    st.ok(tr("วางข้อความแล้ว", "Text placed"));
  }

  async function save() {
    if (!file) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!edits.length) return st.err(tr("ยังไม่ได้แก้อะไรเลย", "No edits yet"));
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { PDFDocument, rgb } = PDFLib;
      const { doc, encrypted } = await loadPdfLib(file);
      const pages = doc.getPages();
      for (const e of edits) {
        const page = pages[e.page];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        if (e.kind === "cover") {
          const c = hexToRgb01(e.color);
          /* ‼️ PDF นับแกนตั้งจากล่างขึ้นบน ส่วนหน้าจอนับจากบนลงล่าง
             ต้องกลับด้าน ไม่งั้นกล่องไปโผล่คนละที่กับที่ผู้ใช้ลาก */
          page.drawRectangle({
            x: e.x * pw, y: ph - (e.y + e.h) * ph,
            width: e.w * pw, height: e.h * ph,
            color: rgb(c.r, c.g, c.b),
          });
        } else {
          const { dataUrl, w, h } = textToPng(e.text, { fontSize: e.size, color: e.color, weight: e.weight });
          const png = await doc.embedPng(dataUrl);
          page.drawImage(png, { x: e.x * pw, y: ph - e.y * ph - h / 2, width: w, height: h });
        }
        await yieldToBrowser();
      }
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + tr("-แก้ไขแล้ว.pdf", "-edited.pdf");
      st.ok(tr(`บันทึกแล้ว แก้ไป ${edits.length} จุด`, `Saved with ${edits.length} edit${edits.length > 1 ? "s" : ""}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageCount} หน้า`, `${pl(pageCount, "page", "pages")}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่ได้: ", "Couldn't save: ") + e.message);
    } finally {
      ws.setBusy(false);
      saveBtn.disabled = false;
    }
  }

  return ws.wrap;
}
