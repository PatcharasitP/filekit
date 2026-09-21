// ── ใส่เลขหน้าลง PDF ───────────────────────────────────────────────────────
// งานเอกสารราชการและรายงานไทยต้องมีเลขหน้าแทบทุกฉบับ แต่ไฟล์ที่ได้มาจากการรวม
// หลายไฟล์ หรือสแกนมา มักไม่มีเลขหน้าเลย เดิมต้องเปิด Word ทำใหม่ทั้งเล่ม
//
// ‼️ ตัวนี้มีสิ่งที่เครื่องมือต่างชาติไม่มี: เลขไทย ๑๒๓ และคำว่า "หน้า 1 จาก 12"
//    ซึ่งเอกสารราชการไทยใช้จริง
//
// ‼️ วิธีวาดตัวอักษร: pdf-lib ฝังฟอนต์ไทยเองไม่ได้ถ้าไม่มี fontkit (ซึ่งเราไม่โหลด)
//    จึงใช้ 2 ทาง — เลขอารบิกล้วนใช้ฟอนต์ในตัวของ pdf-lib (คมชัด ไฟล์เล็กมาก)
//    ส่วนข้อความที่มีอักษรไทยวาดลง canvas แล้วฝังเป็น PNG (หลักเดียวกับใส่ลายน้ำ)
import { loadPdfLib, ENCRYPTED_WARNING, friendlyPdfError, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";
import { stateKit, SHARE_MSG } from "../statekit.js";

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const toThaiDigits = (s) => String(s).replace(/[0-9]/g, (d) => THAI_DIGITS[+d]);

/* รูปแบบข้อความเลขหน้า — n = เลขหน้าที่จะแสดง, total = จำนวนหน้าที่นับ */
const FORMATS = {
  plain:     { label: () => tr("1", "1"),                       make: (n) => `${n}` },
  dash:      { label: () => tr("- 1 -", "- 1 -"),               make: (n) => `- ${n} -` },
  slash:     { label: () => tr("1/12", "1/12"),                 make: (n, t) => `${n}/${t}` },
  pageThai:  { label: () => tr("หน้า 1", "หน้า 1"),              make: (n) => `หน้า ${n}` },
  pageOfThai:{ label: () => tr("หน้า 1 จาก 12", "หน้า 1 จาก 12"), make: (n, t) => `หน้า ${n} จาก ${t}` },
  pageOfEn:  { label: () => tr("Page 1 of 12", "Page 1 of 12"),  make: (n, t) => `Page ${n} of ${t}` },
  /* ‼️ เลขรัน Bates คือเลขลำดับเอกสารที่ใช้ในงานคดีและงานตรวจสอบ ต้องมีคำนำหน้าและเลขเติมศูนย์
     ต่างจากเลขหน้าตรงที่มันคือ "เลขประจำแผ่น" ที่อ้างอิงข้ามเล่มได้ ห้ามซ้ำกันทั้งคดี
     พิสูจน์แล้ว 21/09/2026 ว่าวาดลงไฟล์ได้จริงและ PyMuPDF อ่านกลับได้ตรง */
  bates:     { label: () => tr("เลขรัน ABC-000001", "Bates ABC-000001"), bates: true },
  custom:    { label: () => tr("ข้อความของฉันเอง", "My own text"), custom: true },
};

/* ตัวแปรที่ใช้ได้ในข้อความอิสระ · เขียนเป็นคำไทยตรง ๆ จะได้ไม่ต้องจำรหัส */
const VARS = [
  ["{หน้า}", (n) => String(n)],
  ["{จำนวนหน้า}", (n, t) => String(t)],
  ["{วันที่}", () => new Date().toLocaleDateString("th-TH")],
];

/* ตำแหน่ง 6 จุด — คนใช้จริงแทบไม่เคยวางกลางหน้า จึงตัดออกให้เลือกง่าย */
const SPOTS = {
  "bottom-center": { label: () => tr("ล่างกลาง", "Bottom center"), v: "bottom", h: "center" },
  "bottom-right":  { label: () => tr("ล่างขวา", "Bottom right"),   v: "bottom", h: "right" },
  "bottom-left":   { label: () => tr("ล่างซ้าย", "Bottom left"),    v: "bottom", h: "left" },
  "top-center":    { label: () => tr("บนกลาง", "Top center"),      v: "top",    h: "center" },
  "top-right":     { label: () => tr("บนขวา", "Top right"),        v: "top",    h: "right" },
  "top-left":      { label: () => tr("บนซ้าย", "Top left"),         v: "top",    h: "left" },
};

const MARGIN_PT = 28;      // ระยะจากขอบกระดาษ ประมาณ 1 เซนติเมตร
const hasThai = (s) => /[฀-๿]/.test(s);

/* วาดข้อความไทยลง canvas แล้วคืน dataURL — สเกล 4 เท่าให้คมบนจอความละเอียดสูงและตอนซูม */
const SCALE = 4;
function textToPng(text, fontSize) {
  const font = `600 ${fontSize * SCALE}px "Sarabun","Noto Sans Thai",sans-serif`;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 8;
  const h = Math.ceil(fontSize * SCALE * 1.6);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 4, h / 2);
  return { dataUrl: canvas.toDataURL("image/png"), w: w / SCALE, h: h / SCALE };
}

const STYLE = `
.pn-stage{display:flex;flex-direction:column;gap:10px;align-items:center;margin:auto;width:100%;max-width:380px}
.pn-stage[hidden]{display:none}
.pn-meta{font-size:12px;color:var(--text-mute);text-align:center;min-height:1.4em}
.pn-page{position:relative;width:100%;aspect-ratio:210/297;background:#fff;
  border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;box-shadow:var(--sh2)}
.pn-content{position:absolute;inset:0;padding:11% 12%;display:flex;flex-direction:column;gap:6%}
.pn-line{height:2.4%;min-height:3px;border-radius:2px;background:rgba(0,0,0,.12)}
.pn-title{width:48%;height:4%;min-height:5px;margin-bottom:2%;background:rgba(0,0,0,.3)}
.pn-num{position:absolute;color:#111;font-weight:600;white-space:nowrap;line-height:1;
  font-family:"Sarabun","Noto Sans Thai",sans-serif}
.pn-num.is-skipped{color:#c00;font-weight:700}
`;

export function mount(tool) {
  const posSel = select(Object.entries(SPOTS).map(([k, v]) => [k, v.label()]), "bottom-center");
  const fmtSel = select(Object.entries(FORMATS).map(([k, v]) => [k, v.label()]), "plain");
  const digitSel = select([
    ["arabic", tr("เลขอารบิก 1 2 3", "Arabic numerals 1 2 3")],
    ["thai", tr("เลขไทย ๑ ๒ ๓", "Thai numerals ๑ ๒ ๓")],
  ], "arabic");
  const sizeSel = select([["9", "9 pt"], ["11", "11 pt"], ["13", "13 pt"], ["16", "16 pt"]], "11");
  const startAt = el("input", { type: "number", value: "1", min: "1", step: "1" });
  const firstPage = el("input", { type: "number", value: "1", min: "1", step: "1" });
  const batesPrefix = el("input", { type: "text", value: "ABC-", placeholder: tr("เช่น ABC-", "e.g. ABC-") });
  const batesDigits = select([["4", "0001"], ["5", "00001"], ["6", "000001"], ["7", "0000001"]], "6");
  const customText = el("input", { type: "text", value: "",
    placeholder: tr("เช่น เอกสารลับ หน้า {หน้า}/{จำนวนหน้า}", "e.g. Confidential, page {หน้า}/{จำนวนหน้า}") });
  const fBates = field(tr("คำนำหน้าเลขรัน", "Bates prefix"), batesPrefix,
    tr("ใส่ไว้หน้าเลขทุกแผ่น เช่น ABC- จะได้ ABC-000001", "Goes before every number, so ABC- gives ABC-000001"));
  const fDigits = field(tr("จำนวนหลัก", "Number of digits"), batesDigits);
  const fCustom = field(tr("ข้อความที่จะใส่", "Text to stamp"), customText,
    tr("ใช้ {หน้า} {จำนวนหน้า} {วันที่} แทนค่าจริงได้", "Use {หน้า} {จำนวนหน้า} {วันที่} for real values"));
  for (const f of [fBates, fDigits, fCustom]) f.style.display = "none";

  const st = statusBar();
  const results = el("div", { class: "results" });

  const mockNum = el("div", { class: "pn-num" }, "1");
  const mockPage = el("div", { class: "pn-page" }, [
    el("div", { class: "pn-content" }, [
      el("div", { class: "pn-line pn-title" }),
      ...Array.from({ length: 9 }, () => el("div", { class: "pn-line" })),
    ]),
    mockNum,
  ]);
  const meta = el("div", { class: "pn-meta" });
  const stage = el("div", { class: "pn-stage", hidden: true }, [mockPage, meta]);

  async function onShare() {
    const link = store.shareLink();
    try {
      await navigator.clipboard.writeText(link);
      st.ok(link.includes("?s=") ? SHARE_MSG.ok() : SHARE_MSG.plain());
    } catch { st.err(SHARE_MSG.fail()); }
  }
  const shareBtn = button(tr("คัดลอกลิงก์ค่านี้", "Copy link to these settings"), { ghost: true, onclick: onShare });
  const go = button(tr("ใส่เลขหน้า", "Add page numbers"), { onclick: run });

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("ตัวเลือก", "Options"), node: el("div", {}, [
      field(tr("ตำแหน่ง", "Position"), posSel),
      field(tr("รูปแบบ", "Format"), fmtSel),
      field(tr("ชนิดตัวเลข", "Numerals"), digitSel),
      field(tr("ขนาดตัวอักษร", "Font size"), sizeSel),
      field(tr("เริ่มนับเลขที่", "Start counting at"), startAt,
            tr("ใช้เมื่อเล่มนี้ต่อจากเล่มก่อน", "Use this when the document continues from another one")),
      fBates, fDigits, fCustom,
      field(tr("เริ่มใส่จากหน้าที่", "Start printing on page"), firstPage,
            tr("หน้าก่อนหน้านี้จะไม่มีเลข เช่นข้ามปกกับสารบัญ", "Earlier pages get no number, for example a cover and contents")),
    ]) },
    center: { node: stage, empty: tr("เลือกไฟล์ PDF เพื่อดูตัวอย่างตำแหน่งเลขหน้า", "Choose a PDF to preview where the number lands") },
    footer: [go, shareBtn, st.node],
  });
  /* ── จำค่าที่ตั้งไว้ และส่งต่อด้วยลิงก์ ───────────────────────────────
     ค่าทั้ง 6 ไม่ผูกกับไฟล์เลย (ตำแหน่ง รูปแบบ ชนิดตัวเลข ขนาด เริ่มนับที่ เริ่มใส่จากหน้าที่)
     ส่งลิงก์ให้เพื่อนแล้วได้รูปแบบเลขหน้าเหมือนกันเป๊ะ ใช้กับไฟล์ของเขาเองได้เลย */
  const RULES = () => ({ pos: posSel.value, fmt: fmtSel.value, digit: digitSel.value,
    size: sizeSel.value, start: startAt.value, first: firstPage.value,
    bp: batesPrefix.value, bd: batesDigits.value });
  const store = stateKit(tool.id, {
    defaults: RULES(),
    collect: RULES,
    apply: (v) => {
      if (v.pos !== undefined) posSel.value = v.pos;
      if (v.fmt !== undefined) fmtSel.value = v.fmt;
      if (v.digit !== undefined) digitSel.value = v.digit;
      if (v.size !== undefined) sizeSel.value = v.size;
      if (v.start !== undefined) startAt.value = v.start;
      if (v.first !== undefined) firstPage.value = v.first;
      if (v.bp !== undefined) batesPrefix.value = v.bp;
      if (v.bd !== undefined) batesDigits.value = v.bd;
    },
  });
  store.restore();

  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.wrap.appendChild(results);

  let file = null, pageCount = 0, encrypted = false;

  function syncFields() {
    const def = FORMATS[fmtSel.value] || {};
    fBates.style.display = def.bates ? "" : "none";
    fDigits.style.display = def.bates ? "" : "none";
    fCustom.style.display = def.custom ? "" : "none";
  }
  syncFields();
  const onTweak = () => { syncFields(); store.save(); drawPreview(); };
  for (const c of [posSel, fmtSel, digitSel, sizeSel, batesDigits]) c.onchange = onTweak;
  for (const c of [startAt, firstPage, batesPrefix, customText]) c.oninput = onTweak;

  async function onFile() {
    file = dz.files[0] || null;
    results.innerHTML = "";
    st.clear();
    if (!file) { stage.hidden = true; ws.showCanvas(false); return; }
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      const r = await loadPdfLib(file, passwordBox(ws.body));
      pageCount = r.doc.getPageCount();
      encrypted = r.encrypted;
      stage.hidden = false;
      ws.showCanvas(true);
      st.clear();
      if (encrypted) st.info(ENCRYPTED_WARNING);
      drawPreview();
    } catch (e) {
      stage.hidden = true; ws.showCanvas(false);
      st.err(friendlyPdfError(e, file.name).message);   // st.err รับข้อความ ไม่ใช่ Error ไม่งั้นขึ้นคำว่า Error: นำหน้า
    }
  }

  /** จำนวนหน้าที่จะมีเลข และเลขที่จะแสดงบนหน้านั้น ๆ */
  function plan() {
    const from = Math.max(1, Math.min(pageCount, Math.round(+firstPage.value) || 1));
    const start = Math.max(1, Math.round(+startAt.value) || 1);
    const numbered = Math.max(0, pageCount - from + 1);
    return { from, start, numbered, last: start + numbered - 1 };
  }

  function label(n, total) {
    const def = FORMATS[fmtSel.value];
    let text;
    if (def.bates) {
      /* ‼️ เลขรันไม่แปลงเป็นเลขไทย เพราะมันคือรหัสอ้างอิงที่ต้องพิมพ์ซ้ำได้เป๊ะในเอกสารอื่น */
      return (batesPrefix.value || "") + String(n).padStart(+batesDigits.value || 6, "0");
    }
    if (def.custom) {
      text = customText.value || "";
      for (const [token, fn] of VARS) text = text.split(token).join(fn(n, total));
    } else {
      text = def.make(n, total);
    }
    return digitSel.value === "thai" ? toThaiDigits(text) : text;
  }

  function drawPreview() {
    if (!file || !pageCount) return;
    const { from, start, numbered, last } = plan();
    const spot = SPOTS[posSel.value];
    const size = +sizeSel.value;

    mockNum.textContent = numbered ? label(start, last) : tr("ไม่มีหน้าไหนได้เลข", "No page gets a number");
    mockNum.classList.toggle("is-skipped", !numbered);

    // ‼️ ตำแหน่งบนกระดาษจำลองต้องคิดเป็นสัดส่วน ไม่ใช่พิกเซล เพราะกล่องพรีวิวยืดตามจอ
    //    A4 กว้าง 595pt สูง 842pt · ระยะขอบจริง 28pt = 4.7% ของความกว้าง
    const padX = (MARGIN_PT / 595) * 100;
    const padY = (MARGIN_PT / 842) * 100;
    //    ตัวอักษรบนพรีวิวไม่ต้องเป๊ะเท่าของจริง แค่ให้เห็นว่าเล็กใหญ่ต่างกัน
    mockNum.style.fontSize = `${size * 0.9}px`;
    mockNum.style.top = spot.v === "top" ? `${padY}%` : "";
    mockNum.style.bottom = spot.v === "bottom" ? `${padY}%` : "";
    mockNum.style.left = spot.h === "left" ? `${padX}%` : spot.h === "center" ? "50%" : "";
    mockNum.style.right = spot.h === "right" ? `${padX}%` : "";
    mockNum.style.transform = spot.h === "center" ? "translateX(-50%)" : "";

    meta.textContent = numbered
      ? tr(`ใส่เลขให้ ${numbered} หน้า จากทั้งหมด ${pageCount} หน้า, เลข ${start} ถึง ${last}`,
           `Numbering ${numbered} of ${pl(pageCount, "page", "pages")}, ${start} to ${last}`)
      : tr(`ไฟล์นี้มี ${pageCount} หน้า แต่ตั้งให้เริ่มที่หน้า ${from} จึงไม่มีหน้าไหนได้เลข`,
           `This file has ${pl(pageCount, "page", "pages")} but numbering starts on page ${from}, so no page gets a number`);
    go.disabled = !numbered;
  }

  async function run() {
    if (!file) return st.err(tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF file first"));
    // ‼️ เปิดไฟล์ไม่ได้ (เช่นไฟล์เข้ารหัส) ข้อความจริงถูกแสดงไว้แล้วตอนโหลด
    //    ห้ามเขียนทับด้วยเหตุผลผิด ๆ ว่า "ไม่มีหน้าไหนได้เลข" ซึ่งพาผู้ใช้ไปแก้ผิดจุด
    if (!pageCount) return;
    const { from, start, numbered, last } = plan();
    if (!numbered) return st.err(tr("ตั้งค่าแล้วไม่มีหน้าไหนได้เลข ลองลดเลข “เริ่มใส่จากหน้าที่”",
                                    "With these settings no page gets a number. Try lowering “Start printing on page”"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังใส่เลขหน้า…", "Adding page numbers…"));
    try {
      const { StandardFonts, rgb, degrees } = PDFLib;
      const { doc } = await loadPdfLib(file, passwordBox(ws.body));
      const size = +sizeSel.value;
      const pages = doc.getPages();

      // ฟอนต์ในตัวใช้ได้เฉพาะตอนไม่มีอักษรไทย ฝังครั้งเดียวใช้ทุกหน้า
      const sample = label(start, last);
      /* ‼️ ต้องดูจากข้อความจริงที่จะวาด ไม่ใช่จากตัวเลือก "ชนิดตัวเลข" (แก้ 21/09/2026)
       * เลขรัน Bates ไม่แปลงเป็นเลขไทยอยู่แล้ว (เป็นรหัสอ้างอิงที่ต้องพิมพ์ซ้ำได้เป๊ะ)
       * แต่เงื่อนไขเดิมดูจาก digitSel ตรง ๆ พอผู้ใช้เคยเลือกเลขไทยไว้ เลขรันเลยถูกวาดเป็นภาพ
       * ผลคือคัดลอกรหัสออกจากไฟล์ไม่ได้ ซึ่งทำลายประโยชน์ทั้งหมดของเลขรัน */
      const useImage = hasThai(sample) || /[๐-๙]/.test(sample);
      const font = useImage ? null : await doc.embedFont(StandardFonts.Helvetica);

      // ‼️ ข้อความแต่ละหน้ายาวไม่เท่ากัน (9 กับ 10 กว้างต่างกัน) ต้องวัด/ฝังทีละหน้า
      //    แต่ภาพซ้ำ ๆ ควรฝังครั้งเดียวต่อข้อความหนึ่งชุด กันไฟล์บวม
      const pngCache = new Map();

      st.begin();
      for (let i = from - 1; i < pages.length; i++) {
        if (st.cancelled) break;
        const page = pages[i];
        const { width: pw, height: ph } = page.getSize();
        const spot = SPOTS[posSel.value];
        const text = label(start + (i - (from - 1)), last);

        /* ‼️ หน้าที่ถูกหมุนไว้ (/Rotate 90, 180, 270 — เจอบ่อยกับไฟล์สแกน) มีพิกัดจริง
           ในกระดาษคนละแกนกับที่ "ตาเห็น" · ถ้าวางเลขหน้าด้วยพิกัดดิบ เลขจะไปโผล่ขอบซ้าย
           ขอบขวา หรือหัวกระดาษแทนที่จะเป็นขอบล่าง แถมตัวเลขเองก็ตะแคงตามหน้าไปด้วย
           (ยิงจริง 09/09/2026 กับไฟล์ที่หมุนสลับ 0/90/270/180) จึงต้องคิดตำแหน่งใน
           "พิกัดตามที่ตาเห็น" ก่อน แล้วแปลงกลับเป็นพิกัดจริง พร้อมหมุนตัวเลขชดเชยให้ตั้งตรง */
        const rot = ((page.getRotation().angle % 360) + 360) % 360;
        const swap = rot === 90 || rot === 270;
        const vw = swap ? ph : pw;
        const vh = swap ? pw : ph;
        const toPage = (vx, vy) =>
          rot === 90 ? { x: pw - vy, y: vx }
          : rot === 180 ? { x: pw - vx, y: ph - vy }
          : rot === 270 ? { x: vy, y: ph - vx }
          : { x: vx, y: vy };

        if (useImage) {
          if (!pngCache.has(text)) {
            const { dataUrl, w, h } = textToPng(text, size);
            pngCache.set(text, { png: await doc.embedPng(dataUrl), w, h });
          }
          const { png, w, h } = pngCache.get(text);
          const vx = spot.h === "left" ? MARGIN_PT
                   : spot.h === "right" ? vw - MARGIN_PT - w
                   : (vw - w) / 2;
          const vy = spot.v === "bottom" ? MARGIN_PT : vh - MARGIN_PT - h;
          page.drawImage(png, { ...toPage(vx, vy), width: w, height: h, rotate: degrees(rot) });
        } else {
          const w = font.widthOfTextAtSize(text, size);
          const vx = spot.h === "left" ? MARGIN_PT
                   : spot.h === "right" ? vw - MARGIN_PT - w
                   : (vw - w) / 2;
          const vy = spot.v === "bottom" ? MARGIN_PT : vh - MARGIN_PT - size;
          page.drawText(text, { ...toPage(vx, vy), size, font, color: rgb(0, 0, 0), rotate: degrees(rot) });
        }
        st.progress(((i - from + 2) / numbered) * 100, `(${i - from + 2}/${numbered})`);
        await yieldToBrowser();
      }
      st.end();

      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      const name = stripExt(file.name) + tr("-มีเลขหน้า.pdf", "-numbered.pdf");
      st.progress(null);
      st.ok(st.cancelled
        ? tr("หยุดตามที่สั่งแล้ว หน้าที่ใส่ไปแล้วยังอยู่ในไฟล์", "Stopped as asked. Pages already numbered are kept in the file")
        : tr(`ใส่เลขหน้าให้ ${numbered} หน้าเรียบร้อย`, `Done, numbered ${pl(numbered, "page", "pages")}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageCount} หน้า, เลข ${start} ถึง ${last}`,
                             `${pl(pageCount, "page", "pages")}, numbered ${start} to ${last}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(friendlyPdfError(e, file.name).message);   // st.err รับข้อความ ไม่ใช่ Error ไม่งั้นขึ้นคำว่า Error: นำหน้า
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
