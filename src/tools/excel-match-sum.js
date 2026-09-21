import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, dropzone, download, yieldToBrowser } from "../ui.js";
import { tr, pl } from "../i18n.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, tableToBlob } from "../sheetpick.js";
import { decimalsOf, toInt, fromInt, groupByValue, search } from "../subsetsum.js";
import { stateKit, shareButton } from "../statekit.js";

/* ‼️ ทำไมต้องมีเครื่องมือนี้
 * งานกระทบยอดเจอทุกเดือน: เงินโอนเข้าก้อนเดียว 257,425.30 แต่ในระบบเป็นใบเล็ก ๆ หลายใบ
 * ต้องหาว่าใบไหนบ้างรวมกันได้พอดี ใน Excel ทำได้ด้วย Solver แต่วัดจริงบนเครื่องพี่ปอนด์ 15/09/2026
 * ได้ผลแบบนี้ (รันจริงผ่าน Excel COM ทุกบรรทัด ไม่ได้ประมาณ):
 *   12 ตัวเลข   → 0.84 วินาที ตอบถูก
 *   120 ตัวเลข  → 0.88 วินาที
 *   200 ตัวเลข  → 1.37 วินาที
 *   400 ตัวเลข  → Solver ปฏิเสธทันที (รุ่นที่ติดมากับ Excel รับตัวแปรได้ 200 ตัว)
 *   ‼️ 50 ตัวเลขบางเป้าหมาย → ไม่คืนคำตอบเลยจน 4 นาที ต้องฆ่าโปรเซสทิ้ง ขณะที่เป้าหมายอื่น
 *      บนข้อมูลชุดเดียวกันจบใน 1.2 วินาที เวลาของ Solver จึงเดาไม่ได้ ไม่ได้ขึ้นกับขนาดอย่างเดียว
 * และ Solver คืนคำตอบเดียว ไม่บอกว่ามีกี่ชุด ทั้งยังไม่เลือกชุดที่สั้นที่สุดให้
 *   (เคสที่ซ่อนคำตอบ 4 รายการไว้ Solver ตอบกลับมาเป็นชุด 8 ถึง 12 รายการ ซึ่งก็รวมได้เท่ากัน)
 * วิธีในหน้านี้ใช้การตัดกิ่ง (branch and bound) ที่เขียนเอง ค้นไฟล์จริง 14,651 แถวจบใน 85 ms
 *
 * ‼️ ความจริงที่ต้องบอกผู้ใช้เสมอ: คำตอบแทบไม่เคยมีชุดเดียว
 *    ไฟล์จริงชุดนั้น เป้า 257,425.30 ถ้าให้ใช้ไม่เกิน 3 รายการมีถึง 73 ชุดที่รวมกันได้พอดี
 *    เครื่องมือที่โชว์คำตอบเดียวแล้วเงียบ = หลอกให้เชื่อว่ามันคือคำตอบเดียวที่เป็นไปได้
 */

const STYLE = `
.ms-src{display:flex;flex-direction:column;gap:10px}
.ms-ta{width:100%;min-height:150px;resize:vertical;font:13px/1.6 var(--mono,ui-monospace,monospace);
  padding:10px 12px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);color:var(--text)}
.ms-stats{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.ms-chip{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--bg-soft);
  border:1px solid var(--line);color:var(--text-mute);white-space:nowrap}
.ms-chip b{color:var(--text);font-weight:700}

.ms-target-row{display:flex;gap:10px;flex-wrap:wrap}
.ms-target-row > *{flex:1 1 140px;min-width:0}
.ms-num{width:100%;min-height:36px;padding:8px 11px;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-soft);color:var(--text);font-size:14px}
.ms-num:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.ms-pair{display:flex;gap:8px;align-items:center}
.ms-pair .ms-num{flex:1;min-width:0}
.ms-pair span{font-size:12.5px;color:var(--text-mute);flex:none}

.ms-group-title{margin:18px 0 8px;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--text-mute)}
.ms-group-title:first-child{margin-top:0}
.ms-switch-field{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:13px;color:var(--text);padding:5px 0;min-height:36px}
.ms-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.ms-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.ms-track{position:absolute;inset:0;background:var(--line);border-radius:999px;transition:background .15s ease}
.ms-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s ease}
.ms-switch input:checked + .ms-track{background:var(--g-data,var(--brand))}
.ms-switch input:checked + .ms-track::after{transform:translateX(18px)}
.ms-switch input:focus-visible + .ms-track{outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){ .ms-switch{height:36px} .ms-track{top:6px;bottom:6px} }

.ms-banner{border:1px solid var(--line);border-left:3px solid var(--g-data,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 13px;font-size:13px;
  color:var(--text);line-height:1.7;margin-bottom:12px}
.ms-banner b{font-weight:700}
.ms-cards{display:flex;flex-direction:column;gap:10px}
.ms-card{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);overflow:hidden}
.ms-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 13px;
  border-bottom:1px solid var(--line)}
.ms-card-no{font-weight:700;font-size:13px;color:var(--text)}
.ms-card-meta{font-size:12px;color:var(--text-mute)}
.ms-tagfit{font-size:11.5px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);
  color:var(--text-mute);margin-left:auto}
.ms-rows{width:100%;border-collapse:collapse;font-size:13px}
.ms-rows td{padding:6px 13px;border-top:1px solid var(--line)}
.ms-rows tr:first-child td{border-top:0}
.ms-rows .ms-v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}
.ms-rows .ms-where{color:var(--text-mute);font-size:12px;word-break:break-word}
.ms-rows tr.ms-sum td{border-top:1px solid var(--line);font-weight:700;background:var(--bg)}
.ms-card-act{display:flex;gap:8px;flex-wrap:wrap;padding:9px 13px;border-top:1px solid var(--line)}
.ms-card-act .btn{font-size:12.5px;padding:5px 11px}

.ms-steps{font-size:13px;color:var(--text);line-height:1.9;margin:0;padding-left:20px}
.ms-steps code{font-size:12.5px;background:var(--bg-soft);border:1px solid var(--line);
  border-radius:4px;padding:1px 6px;word-break:break-word}
.ms-table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0 14px}
.ms-table th,.ms-table td{border:1px solid var(--line);padding:6px 10px;text-align:left}
.ms-table th{background:var(--bg-soft);font-weight:700}
.ms-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ms-empty-hint{font-size:13px;color:var(--text-mute);line-height:1.8}
.ms-solverbox{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  padding:13px 15px;margin-bottom:16px}
.ms-solverbox p{margin:0 0 11px;font-size:13px;line-height:1.75;color:var(--text)}
.ms-solverbox small{display:block;margin-top:9px;font-size:12px;color:var(--text-mute);line-height:1.6}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  let wb = null, sheetNames = [], rawTable = null, table = null;
  let items = [];        // [{ row, v, label }] หน่วยจำนวนเต็ม
  // จำว่าผู้ใช้เลือกคอลัมน์เองแล้วหรือยัง ถ้ายัง ให้ใช้คอลัมน์ที่เดาไว้เสมอ
  let userPickedCol = false, userPickedLabel = false;
  let decimals = 2;
  let lastResults = [], lastTargetInt = 0;

  // ── แผงซ้าย: ตัวเลขมาจากไหน ───────────────────────────────────────────────
  const srcTabs = segmented([["file", tr("ไฟล์ Excel หรือ CSV", "Excel or CSV file")], ["paste", tr("วางตัวเลขเอง", "Paste numbers")]], "file");
  const sheetSel = select([["0", "-"]], "0");
  const colSel = select([["0", "-"]], "0");
  const labelSel = select([["-1", tr("ไม่ใช้", "None")]], "-1");
  const sheetField = field(tr("ชีต", "Sheet"), sheetSel);
  const colField = field(tr("คอลัมน์ตัวเลข", "Number column"), colSel);
  const labelField = field(tr("คอลัมน์ที่ใช้เรียกชื่อรายการ", "Column to name each row"), labelSel,
    tr("เช่น เลขที่ใบแจ้งหนี้ จะได้รู้ว่าแต่ละยอดคือใบไหน", "For example an invoice number, so each amount says which document it is"));
  const ta = el("textarea", {
    class: "ms-ta", spellcheck: "false",
    placeholder: tr("วางตัวเลขทีละบรรทัด คัดลอกจาก Excel มาวางได้เลย", "Paste one number per line, straight from Excel"),
  });
  const pasteBox = el("div", {}, [ta]);
  pasteBox.hidden = true;
  const stats = el("div", { class: "ms-stats" });

  const dz = dropzone({
    accept: ".xlsx,.xlsm,.xls,.csv,.txt", multiple: false,
    expect: ["xlsx", "csv", "txt"],
    expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("เปิดไฟล์ที่มีหัวตารางแถวบนสุด", "Open a file whose top row is the header"),
    onChange: onFiles,
  });
  // ‼️ ไฟล์กระทบยอดจริงมักเป็นคอลัมน์ตัวเลขล้วน ไม่มีหัวตาราง (ไฟล์ของพี่ปอนด์ 14,656 แถวก็แบบนั้น)
  //    ถ้าเหมาเอาว่าแถวแรกคือหัวตารางเสมอ ตัวเลขแถวแรกจะหายไปเงียบ ๆ แล้วคำตอบเพี้ยนโดยไม่มีอะไรฟ้อง
  const headerSw = el("input", { type: "checkbox", checked: true });
  const headerRow = el("div", { class: "ms-switch-field" }, [
    el("span", {}, tr("แถวแรกเป็นหัวตาราง", "First row is a header")),
    el("span", { class: "ms-switch" }, [headerSw, el("span", { class: "ms-track" })]),
  ]);
  headerRow.hidden = true;
  const fileBox = el("div", {}, [dz.container, sheetField, headerRow, colField, labelField]);
  sheetField.hidden = true; colField.hidden = true; labelField.hidden = true;

  // ── แผงขวา: เงื่อนไข ─────────────────────────────────────────────────────
  const num = (ph, val) => el("input", { class: "ms-num", type: "text", inputmode: "decimal", placeholder: ph, value: val ?? "" });
  const targetIn = num("257425.30");
  const tolIn = num("0", "0");
  const minCountIn = num("1", "1");
  const maxCountIn = num("4", "4");
  const minValIn = num(tr("ไม่จำกัด", "no limit"));
  const maxValIn = num(tr("ไม่จำกัด", "no limit"));
  const wantIn = num("20", "20");
  const timeIn = num("5", "5");

  const sw = (labelText, checked, hint) => {
    const input = el("input", { type: "checkbox", checked: checked || null });
    const row = el("div", { class: "ms-switch-field" }, [
      el("span", {}, labelText),
      el("span", { class: "ms-switch" }, [input, el("span", { class: "ms-track" })]),
    ]);
    const wrap = el("div", {}, [row, hint ? el("small", { style: "display:block;font-size:12px;color:var(--text-mute);line-height:1.6;margin:-2px 0 6px" }, hint) : null]);
    return { wrap, input };
  };
  const negSw = sw(tr("ใช้รายการที่ติดลบด้วย", "Include negative amounts"), false,
    tr("ยอดคืนเงินหรือส่วนลดที่ติดลบ จะถูกนำมารวมด้วย", "Refunds and discounts stored as negative numbers get used too"));
  const reuseSw = sw(tr("ค่าที่ซ้ำกันหลายแถว ใช้ซ้ำได้", "Let repeated values be used more than once"), true,
    tr("ปิดไว้ = ค่าที่เท่ากันนับเป็นของชิ้นเดียว แม้ในไฟล์จะมีหลายแถว", "Off means equal values count as one item even if the file repeats them"));

  const rightBody = el("div", {}, [
    el("h3", { class: "ms-group-title" }, tr("ยอดที่ต้องการ", "Target amount")),
    field(tr("ยอดเป้าหมาย", "Target"), targetIn),
    field(tr("ยอมคลาดเคลื่อนได้ บวกลบ", "Allowed difference, plus or minus"), tolIn,
      tr("ใส่ 0 = ต้องตรงเป๊ะ ใส่ 1 = ยอมต่างได้ไม่เกิน 1 บาท", "0 means exact. 1 allows the total to be off by up to 1")),
    el("h3", { class: "ms-group-title" }, tr("ใช้กี่รายการ", "How many rows may be used")),
    el("div", { class: "ms-pair" }, [minCountIn, el("span", {}, tr("ถึง", "to")), maxCountIn]),
    el("small", { style: "display:block;font-size:12px;color:var(--text-mute);line-height:1.6;margin-top:6px" },
      tr("ยิ่งให้ใช้ได้หลายรายการ ยิ่งเจอหลายชุดจนเลือกไม่ถูก เริ่มที่ 2 ถึง 4 ก่อนดีที่สุด",
         "The more rows you allow, the more combinations appear. Start with 2 to 4")),
    el("h3", { class: "ms-group-title" }, tr("คัดรายการก่อนค้น", "Filter rows before searching")),
    el("div", { class: "ms-pair" }, [minValIn, el("span", {}, tr("ถึง", "to")), maxValIn]),
    el("small", { style: "display:block;font-size:12px;color:var(--text-mute);line-height:1.6;margin-top:6px" },
      tr("เอาเฉพาะรายการที่อยู่ในช่วงนี้ เช่น ใส่ช่องขวา 1000000 คือไม่เอารายการที่เกินหนึ่งล้าน",
         "Only rows inside this range are used. For example put 1000000 on the right to ignore anything above a million")),
    negSw.wrap, reuseSw.wrap,
    el("h3", { class: "ms-group-title" }, tr("ขอบเขตการค้น", "Search limits")),
    field(tr("อยากได้กี่ชุด", "How many sets to find"), wantIn),
    field(tr("ใช้เวลาค้นไม่เกิน (วินาที)", "Stop searching after (seconds)"), timeIn),
  ]);

  // ── ตรงกลาง: ผลลัพธ์ ─────────────────────────────────────────────────────
  const viewTabs = segmented([["result", tr("ชุดที่รวมกันได้", "Matching sets")], ["excel", tr("ทำเองใน Excel", "Do it in Excel")]], "result");
  const banner = el("div", { class: "ms-banner", hidden: true });
  const cards = el("div", { class: "ms-cards" });
  const excelBox = el("div", {});
  excelBox.hidden = true;
  const centerNode = el("div", {}, [viewTabs, el("div", { style: "height:12px" }), banner, cards, excelBox]);

  viewTabs.onchange = () => {
    const isExcel = viewTabs.value === "excel";
    excelBox.hidden = !isExcel;
    cards.hidden = isExcel;
    banner.hidden = isExcel ? true : !banner.textContent;
    if (isExcel) renderExcelGuide();
  };

  /* ── จำเงื่อนไขไว้ และส่งต่อด้วยลิงก์ ────────────────────────────────────
     ‼️ เก็บเฉพาะช่องในแผง "เงื่อนไข" เท่านั้น ไม่เก็บชีต คอลัมน์ หรือหัวตาราง
        เพราะสามอย่างนั้นผูกกับไฟล์ที่เปิดอยู่ คนเปิดลิงก์ใช้อีกไฟล์แล้วจะเพี้ยนทันที
        งานกระทบยอดตั้งเงื่อนไขเดิมทุกเดือน การต้องตั้ง 10 ช่องใหม่ทุกครั้งคือความเจ็บจริง */
  const RULES = () => ({
    target: targetIn.value, tol: tolIn.value,
    minCount: minCountIn.value, maxCount: maxCountIn.value,
    minVal: minValIn.value, maxVal: maxValIn.value,
    want: wantIn.value, time: timeIn.value,
    neg: negSw.input.checked, reuse: reuseSw.input.checked,
  });
  const store = stateKit(tool.id, {
    defaults: RULES(),
    collect: RULES,
    apply: (v) => {
      const set = (node, key) => { if (v[key] !== undefined) node.value = v[key]; };
      set(targetIn, "target"); set(tolIn, "tol");
      set(minCountIn, "minCount"); set(maxCountIn, "maxCount");
      set(minValIn, "minVal"); set(maxValIn, "maxVal");
      set(wantIn, "want"); set(timeIn, "time");
      if (v.neg !== undefined) negSw.input.checked = !!v.neg;
      if (v.reuse !== undefined) reuseSw.input.checked = !!v.reuse;
    },
  });
  store.restore();
  for (const n of [targetIn, tolIn, minCountIn, maxCountIn, minValIn, maxValIn, wantIn, timeIn])
    n.addEventListener("input", () => store.save());
  for (const n of [negSw.input, reuseSw.input]) n.addEventListener("change", () => store.save());

  const goBtn = button(tr("ค้นหาชุดที่รวมกันได้", "Find matching sets"), { icon: "play", onclick: run });
  const dlBtn = button(tr("ดาวน์โหลดผลเป็น Excel", "Download results as Excel"), { icon: "download", ghost: true, onclick: downloadAll });
  dlBtn.hidden = true;

  const ws = workspace(tool, {
    left: {
      title: tr("ตัวเลขที่จะเอามาบวก", "Numbers to add up"),
      node: el("div", { class: "ms-src" }, [srcTabs, fileBox, pasteBox, stats]),
      hint: tr("อ่านจากไฟล์ในเครื่องคุณเอง ไม่ได้ส่งขึ้นเซิร์ฟเวอร์", "Read straight from your own machine, nothing is uploaded"),
    },
    center: {
      title: tr("ผลการค้นหา", "Results"), node: centerNode,
      empty: tr("เปิดไฟล์หรือวางตัวเลข แล้วใส่ยอดเป้าหมายทางขวา", "Open a file or paste numbers, then set the target on the right"),
    },
    right: { title: tr("เงื่อนไข", "Conditions"), node: rightBody },
    footer: [goBtn, shareButton(store, st, button), dlBtn, st.node],
  });
  ws.body.prepend(styleEl);
  // ‼️ ต้องสั่งซ่อนผืนงานตั้งแต่ต้น ไม่งั้นแท็บผลลัพธ์กับข้อความ "ยังไม่มีไฟล์" จะโผล่ซ้อนกัน
  //    (เห็นกับตาตอนเปิดหน้าจริงครั้งแรก 15/09/2026 — workspace ไม่ได้ซ่อนให้เอง)
  ws.showCanvas(false);

  srcTabs.onchange = () => {
    const paste = srcTabs.value === "paste";
    fileBox.hidden = paste; pasteBox.hidden = !paste;
    if (paste) readPasted(); else if (table) readColumn(); else { items = []; goBtn.disabled = true; ws.showCanvas(false); }
  };
  ta.oninput = () => { clearTimeout(ta._t); ta._t = setTimeout(readPasted, 250); };
  sheetSel.onchange = () => pickSheet(+sheetSel.value);
  colSel.onchange = () => { userPickedCol = true; readColumn(); };
  labelSel.onchange = () => { userPickedLabel = true; readColumn(); };

  // ── อ่านข้อมูลเข้า ────────────────────────────────────────────────────────
  async function onFiles() {
    const f = dz.files[0];
    if (!f) return;
    st.clear();
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      await loadLibs(["xlsx"]);
      ({ wb } = await readWorkbook(f));
      sheetNames = wb.SheetNames.filter((n) => wb.Sheets[n]);
      if (!sheetNames.length) throw new Error(tr("ไม่พบชีตในไฟล์นี้", "No sheets in this file"));
      sheetSel.innerHTML = "";
      sheetNames.forEach((n, i) => sheetSel.appendChild(el("option", { value: String(i) }, n)));
      sheetField.hidden = sheetNames.length < 2;
      pickSheet(0);
      st.clear();
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + (e.message || e));
    }
  }

  /* ‼️ เครื่องนี้อ่านชีตเองแทน sheetToTable กลางของโปรเจกต์ เพราะตัวกลางสั่ง blankrows:false
     แถวที่ทั้งแถวอ่านไม่ได้ (ไฟล์จริงของพี่ปอนด์มี #N/A อยู่ 5 แถว) จึงหลุดหายไปทั้งแถว
     ทำให้ "แถวที่ 14591" กลายเป็น "แถว 14586" คลาดไป 5 แถวแบบไม่มีอะไรฟ้อง
     งานกระทบยอดต้องเปิดไฟล์จริงไปดูแถวนั้นต่อ เลขแถวผิดคือผิดทั้งงาน
     (จับได้ตอนเทียบผลบนหน้าเว็บกับไฟล์ต้นฉบับทีละแถว 15/09/2026) */
  function pickSheet(i) {
    const sheet = wb.Sheets[sheetNames[i]];
    const ref = sheet["!ref"];
    if (!ref) { st.err(tr("ชีตนี้ว่างเปล่า", "This sheet is empty")); return; }
    const range = XLSX.utils.decode_range(ref);
    const width = range.e.c - range.s.c + 1;
    const rows = [];
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cells = [];
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
        // ‼️ ช่องที่เป็น error (#N/A, #REF!, #DIV/0!) ต้องเก็บข้อความไว้ ไม่ใช่ปล่อยเป็นช่องว่าง
        //    ไม่งั้นแถวที่ "มีของแต่อ่านไม่ได้" จะเงียบหายไป ผู้ใช้ไม่มีทางรู้ว่าบางใบไม่ถูกนำมาคิด
        //    ไฟล์จริงของพี่ปอนด์มี #N/A อยู่ 5 แถวจาก 14,656 แถว
        cells.push(!cell ? null : cell.t === "e" ? (cell.w || "#ERROR") : cell.v);
      }
      rows.push({ cells, rowNum: R + 1 });
    }
    rawTable = { width, rows };
    if (!rawTable.rows.length) { st.err(tr("ชีตนี้ว่างเปล่า", "This sheet is empty")); return; }
    const first = rawTable.rows[0].cells;
    headerSw.checked = !first.some((v) => looksNumeric(v));
    headerRow.hidden = false;
    applyHeaderMode();
  }

  headerSw.onchange = () => { applyHeaderMode(); };

  function applyHeaderMode() {
    const keep = colSel.value, keepL = labelSel.value;
    const hasHeader = headerSw.checked;
    const head = hasHeader
      ? rawTable.rows[0].cells.map((v, i) => (v == null || String(v).trim() === "" ? tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`) : String(v).trim()))
      : [];
    const header = [];
    for (let c = 0; c < rawTable.width; c++) header.push(head[c] || tr(`คอลัมน์ ${c + 1}`, `Column ${c + 1}`));
    table = { header, rows: hasHeader ? rawTable.rows.slice(1) : rawTable.rows };

    colSel.innerHTML = ""; labelSel.innerHTML = "";
    labelSel.appendChild(el("option", { value: "-1" }, tr("ไม่ใช้", "None")));
    table.header.forEach((h, c) => {
      colSel.appendChild(el("option", { value: String(c) }, h));
      labelSel.appendChild(el("option", { value: String(c) }, h));
    });
    // เดาคอลัมน์ตัวเลขให้ล่วงหน้า: คอลัมน์ที่อ่านเป็นตัวเลขได้มากที่สุด
    let best = 0, bestScore = -1;
    for (let c = 0; c < table.header.length; c++) {
      let hit = 0;
      for (const r of table.rows) if (looksNumeric(r.cells[c])) hit++;
      if (hit > bestScore) { bestScore = hit; best = c; }
    }
    // ‼️ บั๊กที่เทส browser_affordance จับได้ 16/09/2026: เดิมเช็คว่า keep มีค่าไหม
    //    แต่ค่าเริ่มต้นของ dropdown คือสตริง "0" ซึ่งเป็นค่าจริงในเงื่อนไข คอลัมน์ที่เดาไว้จึงไม่เคยถูกใช้เลย
    //    ไฟล์ที่คอลัมน์แรกเป็นข้อความ (เช่น ไฟล์ตัวอย่างของเว็บเอง) จึงขึ้นว่า "อ่านเป็นตัวเลขได้ 0 แถว" ทันที
    //    ต้องแยกให้ชัดว่า "ผู้ใช้เลือกเอง" กับ "ค่าเริ่มต้นของกล่อง" ไม่ใช่เรื่องเดียวกัน
    colSel.value = userPickedCol && +keep < table.header.length ? keep : String(best);
    if (userPickedLabel && +keepL < table.header.length) labelSel.value = keepL;
    colField.hidden = false; labelField.hidden = false;
    readColumn();
  }

  const looksNumeric = (v) => v != null && String(v).trim() !== "" && /^[-+]?[\d,]*\.?\d+$/.test(String(v).trim());

  function readColumn() {
    if (!table) return;
    const c = +colSel.value, lc = +labelSel.value;
    const raw = [];
    for (const r of table.rows) {
      const cell = r.cells[c];
      if (cell == null || String(cell).trim() === "") continue;
      raw.push({ text: String(cell).trim(), row: r.rowNum, label: lc >= 0 ? String(r.cells[lc] ?? "").trim() : "" });
    }
    buildItems(raw);
  }

  function readPasted() {
    const raw = ta.value.split(/[\n\r\t;]+/).map((s) => s.trim()).filter(Boolean)
      .map((text, i) => ({ text, row: i + 1, label: "" }));
    buildItems(raw);
  }

  function buildItems(raw) {
    decimals = 0;
    for (const r of raw) decimals = Math.max(decimals, decimalsOf(r.text));
    decimals = Math.min(decimals, 6);        // ทศนิยมเกินหกตำแหน่ง งานเงินไม่มี และทำให้จำนวนเต็มบวม
    items = [];
    let unreadable = 0;
    for (const r of raw) {
      const v = toInt(r.text, decimals);
      if (v == null) { unreadable++; continue; }
      items.push({ row: r.row, v, label: r.label });
    }
    renderStats(raw.length, unreadable);
    /* ‼️ ปุ่มหลักถูกกล่องลากไฟล์ปิดไว้จนกว่าจะมีไฟล์ (กฎกลางใน ui.js) แต่เครื่องนี้ยังมีโหมด
       "วางตัวเลขเอง" ที่ไม่มีไฟล์เลย ถ้าไม่เปิดเอง ปุ่มค้นหาจะกดไม่ได้ทั้งโหมด
       (เจอกับตาตอนลองวางตัวเลข 7 ตัวแล้วกดค้น ไม่มีอะไรเกิดขึ้น 15/09/2026) */
    goBtn.disabled = !items.length;
    ws.showCanvas(items.length > 0);
    if (viewTabs.value === "excel") renderExcelGuide();
  }

  function renderStats(total, unreadable) {
    stats.innerHTML = "";
    if (!total) return;
    const chip = (t) => stats.appendChild(el("span", { class: "ms-chip", html: t }));
    const neg = items.filter((x) => x.v < 0).length;
    const sum = items.reduce((a, x) => a + x.v, 0);
    const uniq = new Set(items.map((x) => x.v)).size;
    chip(tr(`อ่านเป็นตัวเลขได้ <b>${items.length.toLocaleString()}</b> แถว`, `<b>${items.length.toLocaleString()}</b> rows read as numbers`));
    chip(tr(`ค่าไม่ซ้ำ <b>${uniq.toLocaleString()}</b> ค่า`, `<b>${uniq.toLocaleString()}</b> distinct values`));
    if (neg) chip(tr(`ติดลบ <b>${neg.toLocaleString()}</b> แถว`, `<b>${neg.toLocaleString()}</b> negative`));
    if (unreadable) chip(tr(`อ่านไม่ออก <b>${unreadable.toLocaleString()}</b> แถว`, `<b>${unreadable.toLocaleString()}</b> unreadable`));
    chip(tr(`รวมทั้งคอลัมน์ <b>${fromInt(sum, decimals)}</b>`, `column total <b>${fromInt(sum, decimals)}</b>`));
  }

  // ── ค้นหา ────────────────────────────────────────────────────────────────
  const intOf = (input, dflt) => {
    const t = String(input.value).replace(/,/g, "").trim();
    if (!t) return dflt;
    const n = Number(t);
    return Number.isFinite(n) ? n : dflt;
  };

  async function run() {
    if (!items.length) { st.err(tr("ยังไม่มีตัวเลข เปิดไฟล์หรือวางตัวเลขก่อน", "No numbers yet. Open a file or paste some first")); return; }
    const targetTxt = String(targetIn.value).trim();
    const target = toInt(targetTxt, decimals);
    if (target == null) { st.err(tr("ยอดเป้าหมายอ่านไม่ออก ใส่เป็นตัวเลข เช่น 257425.30", "The target is not a number. Try 257425.30")); return; }

    const tol = Math.abs(toInt(String(tolIn.value).trim() || "0", decimals) ?? 0);
    const minCount = Math.max(1, Math.round(intOf(minCountIn, 1)));
    const maxCount = Math.max(minCount, Math.round(intOf(maxCountIn, 4)));
    const want = Math.max(1, Math.round(intOf(wantIn, 20)));
    const budget = Math.max(0.2, intOf(timeIn, 5)) * 1000;
    const lo = String(minValIn.value).trim() ? toInt(String(minValIn.value).trim(), decimals) : null;
    const hi = String(maxValIn.value).trim() ? toInt(String(maxValIn.value).trim(), decimals) : null;
    const useNeg = negSw.input.checked;
    const reuse = reuseSw.input.checked;

    // คัดรายการก่อนค้น: ตัวที่ใหญ่เกินเป้าไปแล้วใช้ไม่ได้อยู่ดี ถ้าไม่มีค่าลบมาถ่วง
    let pool = items.filter((x) => {
      if (!useNeg && x.v < 0) return false;
      if (lo != null && x.v < lo) return false;
      if (hi != null && x.v > hi) return false;
      return true;
    });
    if (!useNeg) pool = pool.filter((x) => x.v <= target + tol);
    if (!pool.length) { st.err(tr("ไม่เหลือรายการให้ค้นเลย ลองผ่อนเงื่อนไขการคัดลง", "No rows left to search. Loosen the filters")); return; }

    const groups = groupByValue(pool);
    // จำ label ของแต่ละแถวไว้ใช้ตอนแสดงผล
    const labelOf = new Map(pool.map((x) => [x.row, x.label]));

    st.begin();
    st.info(tr("กำลังค้น…", "Searching…"));
    goBtn.disabled = true;
    cards.innerHTML = ""; banner.hidden = true; dlBtn.hidden = true;
    lastResults = []; lastTargetInt = target;

    const t0 = performance.now();
    let exhaustedAll = true;
    // ‼️ ไล่ทีละขนาดชุด (2 รายการก่อน แล้วค่อย 3, 4, …) แทนการค้นรวดเดียว
    //    เพราะชุดที่ใช้รายการน้อยคือชุดที่คนอยากได้ก่อน และทำให้หน้าจอไม่ค้างยาว
    //    ระหว่างแต่ละขนาดจะคืนคิวให้เบราว์เซอร์หนึ่งครั้ง ปุ่มหยุดจึงกดติดจริง
    for (let k = minCount; k <= maxCount; k++) {
      if (st.cancelled) { exhaustedAll = false; break; }
      const left = Math.max(120, budget - (performance.now() - t0));
      const share = left / (maxCount - k + 1);
      const r = search(groups, target, {
        tol, minCount: k, maxCount: k, maxResults: want - lastResults.length,
        timeMs: share, reuseValue: reuse,
        onTick: () => !st.cancelled,
      });
      if (!r.exhausted) exhaustedAll = false;
      lastResults.push(...r.results);
      renderCards(labelOf);
      st.info(tr(`ค้นชุดละ ${k} รายการแล้ว เจอ ${lastResults.length} ชุด`, `Checked sets of ${k}. Found ${lastResults.length} so far`));
      st.progress(Math.round(((k - minCount + 1) / (maxCount - minCount + 1)) * 100));
      await yieldToBrowser();
      if (lastResults.length >= want) { exhaustedAll = false; break; }
      if (performance.now() - t0 > budget) { exhaustedAll = false; break; }
    }
    const ms = Math.round(performance.now() - t0);
    st.end(); st.progress(null); goBtn.disabled = false;

    renderCards(labelOf);
    dlBtn.hidden = lastResults.length === 0;
    if (!lastResults.length) {
      st.err(tr(`ไม่เจอชุดที่รวมกันได้ ${fromInt(target, decimals)} ภายในเงื่อนไขนี้ (ใช้เวลา ${ms} ms)`,
                `No set adds up to ${fromInt(target, decimals)} under these conditions (${ms} ms)`));
      banner.hidden = false;
      banner.innerHTML = tr(
        `<b>ยังไม่เจอ</b> ลองเพิ่มจำนวนรายการที่ยอมให้ใช้, ใส่ค่าคลาดเคลื่อนสัก 0.5 หรือเปิดใช้รายการติดลบดู${exhaustedAll ? " ทั้งนี้เงื่อนไขชุดนี้ค้นครบทุกความเป็นไปได้แล้ว จึงยืนยันได้ว่าไม่มีจริง" : " การค้นถูกตัดจบก่อนเพราะหมดเวลา ยังไม่ได้ไล่ครบทุกความเป็นไปได้"}`,
        `<b>Nothing found.</b> Try allowing more rows, an allowed difference of 0.5, or including negative amounts.${exhaustedAll ? " This search did cover every possibility, so there really is none." : " The search stopped on time before covering everything."}`);
    } else {
      st.ok(tr(`เจอ ${lastResults.length} ชุด ใช้เวลา ${ms} ms`, `Found ${pl(lastResults.length, "set", "sets")} in ${ms} ms`));
      banner.hidden = false;
      banner.innerHTML = tr(
        `เจอ <b>${lastResults.length} ชุด</b> ที่รวมได้${exhaustedAll ? " ทั้งหมดเท่านี้" : " และมีอีก"} <b>ไม่ได้มีชุดเดียว</b> เลือกที่เข้ากับงานจริง`,
        `Found <b>${pl(lastResults.length, "set", "sets")}</b> that match${exhaustedAll ? ", and that is all of them" : ", and more exist if the search continues"}. <b>There is no single right answer</b>, so check which set makes sense for the real work.`);
    }
  }

  function renderCards(labelOf) {
    cards.innerHTML = "";
    lastResults.forEach((res, i) => {
      const rows = [];
      for (const p of res.picks) {
        const use = p.g.rows.slice(0, p.times);
        for (const row of use) {
          const lb = labelOf.get(row);
          rows.push(el("tr", {}, [
            el("td", { class: "ms-v" }, fromInt(p.g.v, decimals)),
            el("td", { class: "ms-where" }, [lb ? `${lb} ` : "", tr(`แถว ${row}`, `row ${row}`)].join("")),
          ]));
        }
      }
      rows.push(el("tr", { class: "ms-sum" }, [
        el("td", { class: "ms-v" }, fromInt(res.sum, decimals)),
        el("td", {}, tr("รวม", "total")),
      ]));
      const fit = res.diff === 0
        ? tr("ตรงเป้าพอดี", "exact match")
        : tr(`ต่างจากเป้า ${fromInt(res.diff, decimals)}`, `off by ${fromInt(res.diff, decimals)}`);
      cards.appendChild(el("div", { class: "ms-card" }, [
        el("div", { class: "ms-card-head" }, [
          el("span", { class: "ms-card-no" }, tr(`ชุดที่ ${i + 1}`, `Set ${i + 1}`)),
          el("span", { class: "ms-card-meta" }, tr(pl(res.count, "รายการ", "รายการ"), pl(res.count, "row", "rows"))),
          el("span", { class: "ms-tagfit" }, fit),
        ]),
        el("table", { class: "ms-rows" }, [el("tbody", {}, rows)]),
        el("div", { class: "ms-card-act" }, [
          button(tr("คัดลอกชุดนี้", "Copy this set"), { icon: "copy", ghost: true, onclick: () => copySet(res, labelOf) }),
        ]),
      ]));
    });
  }

  function setLines(res, labelOf) {
    const lines = [];
    for (const p of res.picks) for (const row of p.g.rows.slice(0, p.times)) {
      const lb = labelOf.get(row);
      lines.push([fromInt(p.g.v, decimals), lb || "", tr(`แถว ${row}`, `row ${row}`)].filter(Boolean).join("\t"));
    }
    lines.push(`${fromInt(res.sum, decimals)}\t${tr("รวม", "total")}`);
    return lines.join("\n");
  }

  async function copySet(res, labelOf) {
    try {
      await navigator.clipboard.writeText(setLines(res, labelOf));
      st.ok(tr("คัดลอกแล้ว วางใน Excel ได้เลย", "Copied. Paste it into Excel"));
    } catch {
      st.err(tr("คัดลอกไม่สำเร็จ เบราว์เซอร์ไม่อนุญาต", "Copy failed, the browser blocked it"));
    }
  }

  function downloadAll() {
    if (!lastResults.length) return;
    const header = [tr("ชุดที่", "Set"), tr("จำนวนรายการ", "Rows used"), tr("ยอด", "Amount"),
                    tr("ชื่อรายการ", "Label"), tr("แถวในไฟล์", "Row in file"), tr("รวมของชุด", "Set total"),
                    tr("ต่างจากเป้า", "Difference")];
    const lc = +labelSel.value;
    const labelOf = new Map(items.map((x) => [x.row, x.label]));
    const rows = [];
    lastResults.forEach((res, i) => {
      let first = true;
      for (const p of res.picks) for (const row of p.g.rows.slice(0, p.times)) {
        rows.push([i + 1, res.count, Number(fromInt(p.g.v, decimals).replace(/,/g, "")),
                   lc >= 0 ? (labelOf.get(row) || "") : "", row,
                   first ? Number(fromInt(res.sum, decimals).replace(/,/g, "")) : "",
                   first ? Number(fromInt(res.diff, decimals).replace(/,/g, "")) : ""]);
        first = false;
      }
    });
    download(tableToBlob(header, rows, tr("ชุดที่รวมกันได้", "Matching sets")),
      tr("ชุดที่รวมกันได้.xlsx", "matching-sets.xlsx"));
  }

  /* สร้างไฟล์ Excel ที่ "ตั้ง Solver ไว้ให้เสร็จแล้ว" เปิดมากด Data > Solver > Solve ได้เลย
   *
   * ‼️ Solver ไม่ได้เก็บการตั้งค่าไว้ที่ไหนลึกลับ มันเก็บเป็นชื่อที่นิยามระดับชีต (defined names)
   *    ชื่อ solver_opt / solver_adj / solver_typ / solver_val / solver_eng / solver_relN ฯลฯ
   *    พิสูจน์แล้ว 15/09/2026: ให้ Excel จริงกด SolverSave แล้วดัมพ์ชื่อออกมาดู จากนั้นสร้างไฟล์เอง
   *    ด้วยไลบรารีตัวเดียวกับที่หน้านี้ใช้ แล้วสั่ง SolverSolve ทันทีโดยไม่ตั้งค่าใหม่เลย
   *    ได้คำตอบถูกใน 0.51 วินาที (return code 14) = Excel อ่านค่าที่เราฝังไว้จริง
   *
   * ‼️ เพดาน 200 ตัวแปรของ Solver รุ่นที่ติดมากับ Excel เป็นของจริง ใส่เกินแล้วมันปฏิเสธทั้งงาน
   *    ไฟล์นี้จึงใส่ได้มากสุด 200 แถว และ **ยกแถวที่อยู่ในคำตอบที่หน้านี้หาเจอขึ้นก่อนเสมอ**
   *    เพื่อให้กด Solve แล้วเจอคำตอบแน่ ไม่ใช่ตัด 200 แถวแรกมาแบบสุ่มแล้วไม่มีคำตอบอยู่ในนั้นเลย
   */
  const SOLVER_MAX_VARS = 200;

  function buildSolverWorkbook() {
    const target = toInt(String(targetIn.value).trim(), decimals);
    if (target == null) return null;
    const tolInt = Math.abs(toInt(String(tolIn.value).trim() || "0", decimals) ?? 0);
    const maxCount = Math.max(1, Math.round(intOf(maxCountIn, 4)));

    // แถวที่อยู่ในคำตอบมาก่อน แล้วค่อยเติมแถวอื่นที่ยังมีสิทธิ์เป็นคำตอบจนครบเพดาน
    const picked = new Set();
    for (const res of lastResults) for (const p of res.picks) for (const row of p.g.rows.slice(0, p.times)) picked.add(row);
    const inAnswer = items.filter((x) => picked.has(x.row));
    const rest = items.filter((x) => !picked.has(x.row) && x.v > 0 && x.v <= target + tolInt);
    const chosen = [...inAnswer, ...rest].slice(0, SOLVER_MAX_VARS);
    if (!chosen.length) return null;

    const sheetName = tr("หายอด", "MatchSum");
    const last = chosen.length + 1;
    const head = [tr("ยอด", "Amount"), tr("เลือก 0 หรือ 1", "Pick 0 or 1"),
                  tr("แถวในไฟล์เดิม", "Row in source"), tr("ชื่อรายการ", "Label")];
    const aoa = [head, ...chosen.map((x) => [Number(fromInt(x.v, decimals).replace(/,/g, "")), 0, x.row, x.label || ""])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const put = (addr, cell) => { ws[addr] = cell; };
    put("F1", { t: "s", v: tr("รวมที่เลือก", "Picked total") });
    put("G1", { t: "n", f: `SUMPRODUCT(A2:A${last},B2:B${last})` });
    put("F2", { t: "s", v: tr("เป้าหมาย", "Target") });
    put("G2", { t: "n", v: Number(fromInt(target, decimals).replace(/,/g, "")) });
    put("F3", { t: "s", v: tr("ส่วนต่าง", "Difference") });
    put("G3", { t: "n", f: "G1-G2" });
    put("F4", { t: "s", v: tr("ใช้กี่รายการ", "Rows used") });
    put("G4", { t: "n", f: `SUM(B2:B${last})` });
    ws["!ref"] = `A1:G${Math.max(last, 4)}`;
    ws["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 15 }, { wch: 22 }, { wch: 2 }, { wch: 16 }, { wch: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // แผ่นวิธีใช้ เขียนเป็นข้อความล้วน เปิดมาแล้วอ่านรู้เรื่องโดยไม่ต้องกลับมาที่เว็บ
    const guide = [
      [tr("เปิดไฟล์นี้ใน Excel แล้วทำตามนี้", "Open this file in Excel and do this")],
      [tr("1. แถบ Data ขวาสุด กด Solver (ไม่เห็นปุ่ม ให้เปิดที่ File > Options > Add-ins > Solver Add-in)",
          "1. Data tab, far right, click Solver (missing? enable it in File > Options > Add-ins > Solver Add-in)")],
      [tr("2. ช่องทุกช่องถูกตั้งไว้ให้แล้ว กด Solve ได้เลย", "2. Everything is already filled in. Just press Solve")],
      [tr("3. เสร็จแล้วดูคอลัมน์ B แถวไหนเป็น 1 คือแถวที่ถูกเลือก และคอลัมน์ C บอกว่าเป็นแถวที่เท่าไรในไฟล์เดิม",
          "3. Afterwards, rows with 1 in column B are the picked ones, and column C says which row they were in the source file")],
      [""],
      [tr(`ไฟล์นี้ใส่มาให้ ${chosen.length.toLocaleString()} แถว จากทั้งหมด ${items.length.toLocaleString()} แถวในไฟล์ต้นทาง`,
          `This file carries ${chosen.length.toLocaleString()} of the ${pl(items.length.toLocaleString(), "row", "rows")} in the source file`)],
      [tr("เพราะ Solver ที่ติดมากับ Excel รับตัวแปรได้มากสุด 200 ตัว ใส่เกินกว่านั้นมันจะไม่ยอมทำงานทั้งงาน",
          "The Solver bundled with Excel takes at most 200 variables. Past that it refuses the whole job")],
      [tr("แถวที่หน้าเว็บหาเจอว่าเป็นคำตอบถูกยกมาไว้ก่อนแล้ว กด Solve จึงเจอคำตอบแน่นอน",
          "Rows already known to form an answer are placed first, so pressing Solve will find one")],
      [""],
      [tr("อยากเปลี่ยนเงื่อนไขเอง", "To change the rules yourself")],
      [tr("จำกัดจำนวนใบที่ใช้: ใน Solver กด Add แล้วใส่ $G$4 <= 4", "Cap how many rows: in Solver press Add and set $G$4 <= 4")],
      [tr("ยอมคลาดเคลื่อนได้: เปลี่ยน Set Objective เป็น Min ของ =ABS(G1-G2) แทนแบบ Value Of",
          "Allow a small difference: set the objective to Min of =ABS(G1-G2) instead of Value Of")],
    ];
    const gws = XLSX.utils.aoa_to_sheet(guide);
    gws["!cols"] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, gws, tr("วิธีใช้", "How to"));

    // ‼️ การตั้งค่า Solver ต้องเป็นชื่อระดับชีต (Sheet: 0) ถ้าเป็นระดับสมุดงาน Solver จะมองไม่เห็น
    const q = `'${sheetName}'`;
    const val = Number(fromInt(target, decimals).replace(/,/g, ""));
    const names = [
      { Name: "solver_opt", Ref: `${q}!$G$1` },
      { Name: "solver_typ", Ref: "3" },                    // 3 = Value Of
      { Name: "solver_val", Ref: String(val) },
      { Name: "solver_adj", Ref: `${q}!$B$2:$B$${last}` },
      { Name: "solver_eng", Ref: "2" },                    // 2 = Simplex LP
      { Name: "solver_neg", Ref: "1" },
      { Name: "solver_ver", Ref: "3" },
      { Name: "solver_num", Ref: "2" },
      { Name: "solver_lhs1", Ref: `${q}!$B$2:$B$${last}` },
      { Name: "solver_rel1", Ref: "5" },                   // 5 = binary
      { Name: "solver_rhs1", Ref: '"binary"' },
      { Name: "solver_lhs2", Ref: `${q}!$G$4` },
      { Name: "solver_rel2", Ref: "1" },                   // 1 = <=
      { Name: "solver_rhs2", Ref: String(maxCount) },
    ].map((n) => ({ ...n, Sheet: 0 }));
    wb.Workbook = { Names: names };

    return { wb, count: chosen.length, cut: items.length - chosen.length };
  }

  function downloadSolverFile() {
    const built = buildSolverWorkbook();
    if (!built) { st.err(tr("ยังไม่มีตัวเลขหรือยอดเป้าหมาย", "No numbers or target yet")); return; }
    const buf = XLSX.write(built.wb, { bookType: "xlsx", type: "array" });
    download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      tr("ตั้ง Solver ไว้ให้แล้ว.xlsx", "solver-ready.xlsx"));
    st.ok(built.cut > 0
      ? tr(`ได้ไฟล์แล้ว ใส่มาให้ ${built.count.toLocaleString()} แถว (ตัดออก ${built.cut.toLocaleString()} แถวเพราะ Solver รับได้ 200 ตัวแปร)`,
           `File ready with ${pl(built.count.toLocaleString(), "row", "rows")} (${built.cut.toLocaleString()} left out, Solver takes 200 variables)`)
      : tr(`ได้ไฟล์แล้ว ใส่มาให้ครบ ${built.count.toLocaleString()} แถว`, `File ready with all ${pl(built.count.toLocaleString(), "row", "rows")}`));
  }

  // ── แท็บ "ทำเองใน Excel" ─────────────────────────────────────────────────
  function renderExcelGuide() {
    const n = items.length || 0;
    const last = n + 1;
    const col = table ? (String.fromCharCode(65 + Math.min(25, +colSel.value))) : "A";
    const targetTxt = String(targetIn.value).trim() || "257425.30";
    const tooBig = n > 200;
    excelBox.innerHTML = "";
    const dlSolver = button(tr("ดาวน์โหลดไฟล์ Excel ที่ตั้ง Solver ไว้ให้แล้ว", "Download an Excel file with Solver already set up"),
      { icon: "download", onclick: downloadSolverFile });
    dlSolver.disabled = !items.length;
    excelBox.append(
      el("div", { class: "ms-solverbox" }, [
        el("p", {}, tr(
          "ไฟล์ที่ได้ฝังตัวเลข สูตร และค่า Solver ไว้ครบ เปิดใน Excel แล้วกด Data > Solver > Solve ได้เลย",
          "Rather not fill in every box? This file comes with the numbers, the pick column, the formula and the Solver setup already inside. Open it in Excel and press Data > Solver > Solve")),
        dlSolver,
        el("small", {}, n > SOLVER_MAX_VARS
          ? tr(`มี ${n.toLocaleString()} แถว ไฟล์ที่ได้ใส่ให้ ${SOLVER_MAX_VARS} แถว ยกแถวที่เป็นคำตอบขึ้นก่อน เพราะ Solver รับได้เท่านี้`,
               `The open file has ${pl(n.toLocaleString(), "row", "rows")}. The download carries ${SOLVER_MAX_VARS} of them, answer rows first, because that is Solver's limit`)
          : tr(`ไฟล์ที่ได้จะใส่ให้ครบทั้ง ${n.toLocaleString()} แถว`, `The download carries all ${pl(n.toLocaleString(), "row", "rows")}`)),
      ]),
      el("p", { class: "ms-empty-hint" }, tr(
        "ตั้งเองในไฟล์ของคุณก็ได้ Solver อยู่ท้ายแถบ Data (ไม่เห็น เปิดที่ File > Options > Add-ins)",
        "Or to set it up yourself in your own file, Solver sits at the right end of the Data tab (missing? enable it in File > Options > Add-ins > Solver Add-in). Here is how")),
      el("ol", { class: "ms-steps" }, [
        el("li", { html: tr(
          `ตัวเลขอยู่คอลัมน์ <code>${col}</code> แถว 2 ถึง ${last} ส่วน <code>B</code> ใส่ 0 ทุกแถว คือช่องเลือก`,
          `Put the numbers in column <code>${col}</code>, rows 2 to ${last}, and leave column <code>B</code> as 0 on every row. That column means "picked or not"`) }),
        el("li", { html: tr(
          `ช่อง <code>E1</code> ใส่สูตร <code>=SUMPRODUCT(${col}2:${col}${last},B2:B${last})</code> คือผลรวมเฉพาะแถวที่ถูกเลือก`,
          `In <code>E1</code> put <code>=SUMPRODUCT(${col}2:${col}${last},B2:B${last})</code>, the total of the picked rows only`) }),
        el("li", { html: tr(
          `เปิด <b>Data &gt; Solver</b> ตั้ง Set Objective = <code>$E$1</code> แล้วเลือก <b>Value Of</b> ใส่ <code>${targetTxt}</code>`,
          `Open <b>Data &gt; Solver</b>, set the objective to <code>$E$1</code>, choose <b>Value Of</b> and type <code>${targetTxt}</code>`) }),
        el("li", { html: tr(
          `By Changing Variable Cells ใส่ <code>$B$2:$B$${last}</code>`,
          `By Changing Variable Cells: <code>$B$2:$B$${last}</code>`) }),
        el("li", { html: tr(
          `กด Add เพิ่มข้อจำกัด <code>$B$2:$B$${last}</code> เลือกชนิด <b>bin</b> (เลือกได้แค่ 0 หรือ 1)`,
          `Add a constraint on <code>$B$2:$B$${last}</code> of type <b>bin</b> (0 or 1 only)`) }),
        el("li", { html: tr(
          `เลือกวิธี <b>Simplex LP</b> แล้วกด Solve`,
          `Pick <b>Simplex LP</b> and press Solve`) }),
        el("li", { html: tr(
          `จำกัดจำนวนใบ ใส่ <code>E4</code> = <code>=SUM(B2:B${last})</code> แล้ว Add <code>$E$4 &lt;= 4</code>`,
          `To cap how many rows may be used, put <code>=SUM(B2:B${last})</code> in <code>E4</code> and add the constraint <code>$E$4 &lt;= 4</code>`) }),
      ]),
      el("h3", { class: "ms-group-title", style: "margin-top:20px" }, tr("ผลที่วัดเองจากเครื่องจริง", "Measured on a real machine")),
      el("table", { class: "ms-table" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, tr("จำนวนตัวเลข", "How many numbers")),
          el("th", {}, tr("Solver ของ Excel", "Excel Solver")),
          el("th", {}, tr("หน้านี้", "This page")),
        ])]),
        el("tbody", {}, [
          el("tr", {}, [el("td", { class: "num" }, "12"), el("td", {}, tr("0.84 วินาที ตอบถูก", "0.84 s, correct")), el("td", {}, tr("ต่ำกว่า 1 ms", "under 1 ms"))]),
          el("tr", {}, [el("td", { class: "num" }, "120"), el("td", {}, tr("0.88 วินาที", "0.88 s")), el("td", {}, tr("ต่ำกว่า 1 ms", "under 1 ms"))]),
          el("tr", {}, [el("td", { class: "num" }, "200"), el("td", {}, tr("1.37 วินาที", "1.37 s")), el("td", {}, tr("ต่ำกว่า 1 ms", "under 1 ms"))]),
          el("tr", {}, [el("td", { class: "num" }, "50"), el("td", {}, tr("บางเป้าหมายไม่จบเลยจน 4 นาที", "some targets never finish, gave up at 4 minutes")), el("td", {}, tr("ต่ำกว่า 1 ms", "under 1 ms"))]),
          el("tr", {}, [el("td", { class: "num" }, "400"), el("td", {}, tr("ปฏิเสธทันที เพดานตัวแปร 200 ตัว", "refused at once, 200 variable cap")), el("td", {}, tr("2 ms", "2 ms"))]),
          el("tr", {}, [el("td", { class: "num" }, "14,651"), el("td", {}, tr("ใส่ไม่ได้ตั้งแต่ต้น", "cannot even be entered")), el("td", {}, tr("85 ms", "85 ms"))]),
        ]),
      ]),
      el("p", { class: "ms-empty-hint" }, tr(
        "Solver คืนคำตอบเดียวแล้วจบ ไม่บอกว่ามีกี่ชุด และไม่เลือกชุดที่สั้นที่สุด",
        "Two things Solver will not do: it returns one answer and stops, never saying how many other sets add up the same, and it does not prefer the shortest set (hiding a 4 row answer, it came back with 8 to 12 rows)")),
      el("p", { class: "ms-empty-hint" }, tooBig
        ? tr(`มี ${n.toLocaleString()} แถว เกินเพดาน 200 ตัวแปรของ Solver ที่ติดมากับ Excel ต้องคัดให้เหลือไม่เกิน 200 แถวก่อน`,
             `The open file has ${pl(n.toLocaleString(), "row", "rows")}, past the 200 variable cap of the Solver bundled with Excel. You would have to narrow it to 200 rows first`)
        : tr("Solver เหมาะกับชุดเล็ก ๆ ไม่กี่สิบแถว พอเกินนั้นมันจะไล่ความเป็นไปได้ไม่ไหว",
             "Solver copes with a few dozen rows. Past that it cannot walk the possibilities fast enough")),
    );
  }

  return ws.wrap;
}
