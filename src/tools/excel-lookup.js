import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, dropzone, saveFile } from "../ui.js";
import { tr, pl } from "../i18n.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, tablesToBlob, cellText } from "../sheetpick.js";
import { lookup, applyFill, tableFromAoa, guessHeaderRow, guessKeyPair, guessPullCols,
         colLetter, normHead, isBlank, bestDest, addonKeyCells, keyOf, lowMatch } from "../lookupkit.js";
import { patchXlsx } from "../xlsxpatch.js";
import { watchDrops, handleOf, pickWritable, askWrite, writeBack, canWriteInPlace } from "../fshandle.js";

/* ‼️ ทำไมต้องมีเครื่องมือนี้ (พี่ปอนด์ 30/09/2026)
 * ไฟล์ Pending VAT 2026 ต้องเอาข้อมูลใบกำกับภาษีจากไฟล์ของทีมภาษีมาเติม 3 คอลัมน์ โดยจับคู่ด้วยคีย์ Mapping
 * VLOOKUP ทำได้ แต่ (1) เงียบเวลาไฟล์รองมีคีย์ซ้ำ มันหยิบแถวแรกให้โดยไม่บอกว่ามีแถวอื่นที่ค่าไม่เหมือนกัน
 * (2) ต้องเขียนสูตรทีละคอลัมน์ (3) ต้องรู้เลขลำดับคอลัมน์ (4) ไม่บอกว่ากี่แถวที่ไม่เจอ
 * เครื่องมือนี้บอกครบ และเลือกดึงหลายคอลัมน์พร้อมกันได้
 *
 * ‼️ เขียนกลับทับไฟล์เดิมได้เลย (Challenge จากพี่ปอนด์): ไม่ใช่ให้ SheetJS สร้างไฟล์ใหม่ (สไตล์ สูตร ฟิลเตอร์จะหาย
 *    เช่นคอลัมน์ Mapping ที่เป็นสูตร =A&F จะกลายเป็นตัวเลขตายตัว) แต่แก้เฉพาะช่องปลายทางใน XML ของชีต
 *    (src/xlsxpatch.js) ที่เหลือคงไบต์เดิม พิสูจน์แล้วด้วย Excel จริง ดู tests/xlsxpatch.test.mjs
 * ‼️ Excel ที่เปิดไฟล์อยู่ล็อกไฟล์ เขียนทับไม่ได้ (พิสูจน์แล้ว) หน้านี้บอกให้ปิดใน Excel ก่อน และมีปุ่มดาวน์โหลดสำรองเสมอ
 *
 * ‼️ รอบ 06/10/2026 พี่ปอนด์ลองกับไฟล์จริงแล้วขอ
 *    คีย์ต่อได้กี่คอลัมน์ก็ได้ (เดิมตายตัว 2), ค้นหาคอลัมน์ในรายการดึง, บอกชัดว่าแต่ละคอลัมน์ลงที่ไหนเมื่อชื่อไม่ตรงกัน,
 *    เลือกไฟล์หลักรอบเดียวก็เขียนทับได้ (เดิมต้องเลือกซ้ำด้วยปุ่มแก้ตรง), แท็บผลแยกตามกลุ่มชัด ๆ แทนคำว่า “ต้องตรวจ”,
 *    และแถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี เพิ่มเป็นแถวใหม่ท้ายไฟล์หลักพร้อมป้าย Addon เดือนหรือวัน
 */

const STYLE = `
.lk-side{display:flex;flex-direction:column;gap:10px}
.lk-side + .lk-side{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.lk-h{margin:0;font-size:13px;font-weight:700;color:var(--text)}
.lk-sub{font-size:12px;color:var(--text-mute);line-height:1.6;margin:0}
.lk-num{width:100%;min-height:36px;padding:8px 11px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--bg-soft);color:var(--text);font-size:14px}
.lk-num:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.lk-two{display:flex;gap:10px;flex-wrap:wrap}
.lk-two > *{flex:1 1 130px;min-width:0}
.lk-inplace{font-size:12.5px;line-height:1.65;padding:8px 11px;border-radius:var(--r-sm);border:1px solid var(--line);
  background:var(--bg-soft);color:var(--text-mute)}
.lk-inplace.ok{border-left:3px solid var(--g-data,var(--brand));color:var(--text)}
.lk-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--text);
  padding:5px 0;min-height:36px}
.lk-switch input{width:20px;height:20px;flex:none}
.lk-pull{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto;padding:2px}
.lk-pr{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;padding:7px 9px;
  border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft)}
.lk-pr[hidden]{display:none}
.lk-pr.on{border-color:var(--g-data,var(--brand))}
.lk-pr input[type=checkbox]{width:18px;height:18px}
.lk-pr .nm{font-size:13px;color:var(--text);word-break:break-word}
.lk-dest{grid-column:2;display:flex;align-items:center;gap:6px;min-width:0}
.lk-dest > span{font-size:12px;color:var(--text-mute);white-space:nowrap}
.lk-dest select{flex:1;min-width:0;min-height:32px;font-size:12.5px;font-family:inherit;padding:4px 8px;
  border:1px solid var(--line);border-radius:var(--r-sm);background:var(--card,var(--bg-soft));color:var(--text)}
.lk-dest select:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.lk-pr:not(.on) .lk-dest{display:none}
.lk-pr .lk-hint{grid-column:2;font-size:11.5px;color:var(--text-mute);line-height:1.5}
.lk-pr.on .lk-hint{display:none}
.lk-find{width:100%;min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--bg-soft);color:var(--text);font-size:13px}
.lk-find:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.lk-mini{display:flex;gap:8px;flex-wrap:wrap}
.lk-mini .btn{font-size:12px;padding:4px 10px}
.lk-keys{display:flex;flex-direction:column;gap:6px}
.lk-key{display:flex;align-items:flex-end;gap:6px}
.lk-key .field{flex:1;min-width:0;margin:0}
.lk-key .btn{flex:none;min-height:36px;padding:4px 8px}
.lk-add{align-self:flex-start;font-size:12px;padding:4px 10px}
.lk-note{font-size:12px;color:var(--text-mute);line-height:1.6;margin:-2px 0 0}
.lk-addon{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--line);border-radius:var(--r-sm)}
.lk-addon[hidden]{display:none}
.lk-banner{border:1px solid var(--line);border-left:3px solid var(--g-data,var(--brand));border-radius:var(--r-sm);
  background:var(--bg-soft);padding:10px 13px;font-size:13px;line-height:1.75;color:var(--text);margin:0 0 12px}
.lk-banner.warn{border-left-color:var(--warn,#d99a00)}
.lk-banner.bad{border-left-color:var(--bad,#d64545)}
.lk-banner b{font-weight:700}
.lk-badge{display:inline-block;font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
.lk-badge.one{border-color:var(--g-data,var(--brand))}
.lk-badge.dupSame{border-color:#b8860b}
.lk-badge.dupDiff,.lk-badge.none{border-color:var(--bad,#d64545);color:var(--bad,#d64545)}
.lk-badge.nokey{color:var(--text-mute)}
.lk-tabs{margin-bottom:12px;flex-wrap:wrap}
.lk-tabs .seg-item{flex:0 1 auto}
td.lk-chg{font-weight:700;background:color-mix(in srgb,var(--g-data,var(--brand)) 14%,transparent)}
td.lk-mono{font-variant-numeric:tabular-nums;white-space:nowrap}
.lk-list td small{color:var(--text-mute);display:block}
`;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSM_MIME = "application/vnd.ms-excel.sheet.macroEnabled.12";
const PREVIEW = 40;
const REVIEW_MAX = 300;

const extOf = (n) => (n.split(".").pop() || "").toLowerCase();
const stemOf = (n) => (n.lastIndexOf(".") > 0 ? n.slice(0, n.lastIndexOf(".")) : n);

/* ‼️ ใช้ saveFile ไม่ใช่ download: download() ประกาศว่า “นี่คือผลลัพธ์ของหน้านี้” แล้วโครงหน้า v2 สลับไปหน้าผลลัพธ์
 *    ซ่อนพื้นที่ทำงานทั้งหมด งานนี้คนมักปรับตัวเลือกแล้วดาวน์โหลดซ้ำ จึงต้องอยู่ในพื้นที่ทำงานต่อ (เห็นตอนทดสอบ 30/09/2026) */

/** อ่านทั้งชีตเป็นตารางที่แถว 1 คือแถว 1 ของ Excel เสมอ (ไม่ใช้ sheetToTable กลาง)
 *  ‼️ sheetToTable สั่ง blankrows:false ทิ้งแถวว่างแล้วเลขแถวเลื่อน และเดาหัวตาราง 2 ชั้นเอง
 *     ไฟล์ Pending VAT แถว 1 เป็นยอดรวม หัวจริงอยู่แถว 2 ผลคือหัวคอลัมน์กลายเป็น “18 Vendor/Customer Name”
 *     งานเทียบข้อมูลต้องบอกเลขแถวที่ตรงกับ Excel ทุกแถว ไม่งั้นพี่เปิดไปดูแล้วคนละแถว */
function sheetAoa(sheet) {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const rg = XLSX.utils.decode_range(ref);
  const rows = [];
  for (let R = 0; R <= rg.e.r; R++) {
    const line = new Array(rg.e.c + 1).fill(null);
    for (let C = rg.s.c; C <= rg.e.c; C++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
      // ‼️ ช่อง error (#N/A) เก็บเป็นข้อความ ไม่ใช่ว่าง ไม่งั้นแยกไม่ออกว่า "ไม่มีค่า" กับ "มีแต่เสีย"
      if (cell) line[C] = cell.t === "e" ? (cell.w || "#ERROR") : cell.t === "z" ? null : cell.v;
    }
    rows.push(line);
  }
  return rows;
}

function sameCell(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Math.round(a.getTime() / 60000) === Math.round(b.getTime() / 60000);
  }
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a ?? "").trim() === String(b ?? "").trim();
}

const newSide = () => ({ file: null, bytes: null, ext: "", wb: null, sheetNames: [], sheetIdx: 0,
  aoa: null, headerIdx: 0, table: null, handle: null, meta: null });

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();
  watchDrops();

  const M = newSide(), S = newSide();
  let userKey = false, userPull = false;
  let pullState = new Map();               // คอลัมน์ไฟล์รอง → { on, dest: "new" | เลขคอลัมน์ไฟล์หลัก }
  let last = null;                         // ผลล่าสุด { spec, result, fill, problems }
  let lastSave = null;                     // ไว้ย้อนกลับ { orig, handle, meta }
  let confirmTimer = null;

  // ── แผงซ้าย: ไฟล์ ─────────────────────────────────────────────────────────
  const mkDz = (which) => dropzone({
    accept: ".xlsx,.xlsm,.xls,.csv,.txt", multiple: false,
    expect: ["xlsx", "csv", "txt"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: which === "main"
      ? tr("ไฟล์ที่จะถูกเติมข้อมูล", "The file that gets filled in")
      : tr("ไฟล์ที่เป็นแหล่งข้อมูล", "The file the data comes from"),
    onChange: () => onFile(which),
  });
  const mainDz = mkDz("main"), secDz = mkDz("sec");

  const numIn = () => el("input", { class: "lk-num", type: "number", min: "1", step: "1", inputmode: "numeric" });
  const mainSheet = select([["0", "-"]], "0"), secSheet = select([["0", "-"]], "0");
  const mainHead = numIn(), secHead = numIn();
  const mainSheetF = field(tr("ชีต", "Sheet"), mainSheet), secSheetF = field(tr("ชีต", "Sheet"), secSheet);
  const headHint = tr("เดาให้แล้ว แก้ได้ถ้าไม่ตรง", "Guessed for you, change it if wrong");
  const mainHeadF = field(tr("หัวตารางอยู่แถวที่", "Header row number"), mainHead, headHint);
  const secHeadF = field(tr("หัวตารางอยู่แถวที่", "Header row number"), secHead, headHint);
  mainSheetF.hidden = secSheetF.hidden = mainHeadF.hidden = secHeadF.hidden = true;

  const inplaceBox = el("div", { class: "lk-inplace", hidden: true });
  /* ‼️ เลือกไฟล์หลักรอบเดียวก็เขียนทับได้ (พี่ปอนด์ 06/10/2026 “ทำให้ต้องเลือกไฟล์ 2 รอบ”)
   *    กล่องรับไฟล์กลางเปิดหน้าต่างเลือกไฟล์แบบเก่า (input type=file) ซึ่งไม่ให้มือจับไฟล์ เขียนกลับไม่ได้
   *    เดิมจึงมีปุ่มแยก “เปิดไฟล์หลักแบบแก้ตรง” ให้เลือกซ้ำอีกรอบ
   *    ตอนนี้ดักการกดกล่องของไฟล์หลักตั้งแต่ชั้น capture แล้วเปิดตัวเลือกที่ให้มือจับแทน (เฉพาะ Chrome และ Edge บนคอม)
   *    ชุดชนิดไฟล์กว้างเท่ากล่องเดิม จะเลือก CSV ก็ได้ เพียงแต่ไฟล์ชนิดนั้นเขียนกลับไม่ได้ */
  const PICK_TYPES = [{ description: "Excel / CSV", accept: {
    [XLSX_MIME]: [".xlsx"], [XLSM_MIME]: [".xlsm"], "application/vnd.ms-excel": [".xls"], "text/csv": [".csv"], "text/plain": [".txt"],
  } }];
  if (canWriteInPlace()) {
    const zone = mainDz.container.querySelector(".dz");
    const grab = (e) => {
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault(); e.stopImmediatePropagation();
      pickMain();
    };
    if (zone) { zone.addEventListener("click", grab, true); zone.addEventListener("keydown", grab, true); }
  }
  const mainInfo = el("div", { class: "lk-sub" });
  const secInfo = el("div", { class: "lk-sub" });

  const left = el("div", {}, [
    el("div", { class: "lk-side" }, [
      el("h3", { class: "lk-h" }, tr("1. ไฟล์หลัก", "1. Main file")),
      el("p", { class: "lk-sub" }, tr("ไฟล์ที่มีคอลัมน์ว่างรอเติม เช่น Pending VAT", "The file with empty columns waiting to be filled")),
      mainDz.container, mainInfo, mainSheetF, mainHeadF, inplaceBox,
    ]),
    el("div", { class: "lk-side" }, [
      el("h3", { class: "lk-h" }, tr("2. ไฟล์รอง", "2. Source file")),
      el("p", { class: "lk-sub" }, tr("ไฟล์ที่มีข้อมูลที่จะดึงมาเติม เช่นไฟล์จากทีมภาษี", "The file that holds the data to bring over")),
      secDz.container, secInfo, secSheetF, secHeadF,
    ]),
  ]);

  // ── แผงขวา: เงื่อนไข ─────────────────────────────────────────────────────
  /* ‼️ คีย์ต่อกันได้กี่คอลัมน์ก็ได้ (พี่ปอนด์ 06/10/2026 “เหมือนฟิกว่าได้แค่ 2”)
   *    เก็บเป็นรายการเลขคอลัมน์ต่อฝั่ง แล้ววาดช่องเลือกใหม่จากรายการทุกครั้ง ช่องแรกเอาออกไม่ได้ */
  const MAX_KEYS = 8;
  const keyVals = { main: [0], sec: [0] };
  const keyBox = { main: el("div", { class: "lk-keys" }), sec: el("div", { class: "lk-keys" }) };
  function renderKeys(which) {
    const t = sideOf(which).table;
    const box = keyBox[which];
    box.innerHTML = "";
    const opts = t ? t.header.map((h, c) => [String(c), `${colLetter(c)}: ${h}`]) : [["0", "-"]];
    keyVals[which].forEach((v, i) => {
      const s = select(opts, String(v));
      s.onchange = () => { keyVals[which][i] = +s.value; userKey = true; afterKeyChange(); };
      const label = i === 0
        ? (which === "main" ? tr("ไฟล์หลัก คอลัมน์คีย์", "Main file key") : tr("ไฟล์รอง คอลัมน์คีย์", "Source file key"))
        : tr(`ต่อด้วย (ลำดับ ${i + 1})`, `Then (part ${i + 1})`);
      const rm = i === 0 ? null : button("", { icon: "close", ghost: true,
        label: tr(`เอาคีย์ลำดับ ${i + 1} ออก`, `Remove key part ${i + 1}`),
        onclick: () => { keyVals[which].splice(i, 1); userKey = true; renderKeys(which); afterKeyChange(); } });
      box.appendChild(el("div", { class: "lk-key" }, [field(label, s), rm]));
    });
    if (t && keyVals[which].length < Math.min(MAX_KEYS, t.width)) {
      const add = button(tr("+ ต่ออีกคอลัมน์", "+ Join another column"), { ghost: true, onclick: () => {
        const used = new Set(keyVals[which]);
        let c = 0; while (used.has(c) && c < t.width - 1) c++;
        keyVals[which].push(c); userKey = true; renderKeys(which); afterKeyChange();
        const sels = keyBox[which].querySelectorAll("select");
        sels[sels.length - 1].focus();
      } });
      add.classList.add("lk-add");
      box.appendChild(add);
    }
  }
  const afterKeyChange = () => { if (M.table && S.table) buildPullList(false); refresh(); };
  const caseSw = el("input", { type: "checkbox", checked: true, "aria-label": tr("ไม่สนตัวพิมพ์ใหญ่เล็ก", "Ignore upper and lower case") });
  const zeroSw = el("input", { type: "checkbox", "aria-label": tr("มองว่า 0012 กับ 12 เป็นค่าเดียวกัน", "Treat 0012 and 12 as the same") });
  const sw = (label, input, hint) => el("div", {}, [
    el("label", { class: "lk-switch" }, [el("span", {}, label), input]),
    hint ? el("small", { class: "lk-sub" }, hint) : null,
  ]);
  const pullBox = el("div", { class: "lk-pull" });
  const pullAll = button(tr("ติ๊กทั้งหมด", "Tick all"), { ghost: true, onclick: () => setAllPull(true) });
  const pullNone = button(tr("ล้าง", "Clear"), { ghost: true, onclick: () => setAllPull(false) });
  // ค้นหาคอลัมน์ในรายการดึง โผล่เมื่อไฟล์รองมีคอลัมน์มากพอให้หาไม่เจอ
  const pullFind = el("input", { class: "lk-find", type: "search", placeholder: tr("ค้นหาคอลัมน์ของไฟล์รอง", "Find a source column"),
    "aria-label": tr("ค้นหาคอลัมน์ที่จะดึงมาเติม", "Find a column to bring over") });
  const pullEmpty = el("p", { class: "lk-note", hidden: true });
  pullFind.oninput = filterPull;
  const dupHint = el("p", { class: "lk-note" });
  const DUP_HINT = {
    first: tr("ใช้ค่าของแถวบนสุดที่เจอ เหมือน VLOOKUP", "Uses the topmost matching row, like VLOOKUP"),
    last: tr("ใช้ค่าของแถวล่างสุดที่เจอ เหมาะกับไฟล์ที่ต่อรายการใหม่ไว้ท้าย", "Uses the bottom matching row, good when new entries are added at the end"),
    blank: tr("แถวที่ซ้ำมีค่าไม่เหมือนกัน เว้นว่างไว้ให้ตรวจเอง ถ้าเหมือนกันยังเติมให้", "If the repeated rows disagree the cell stays empty for you to check. If they agree it is filled"),
    join: tr("คีย์เดียวเจอหลายแถว ค่าต่างกันจะต่อไว้ช่องเดียว เช่น TX-001; TX-002 ค่าเหมือนกันได้ค่าเดียว",
      "When one key matches several rows, different values are joined in one cell, like TX-001; TX-002. Equal values stay single"),
  };
  const dupSel = select([
    ["first", tr("เอาแถวแรก (เหมือน VLOOKUP)", "Take the first row (like VLOOKUP)")],
    ["last", tr("เอาแถวสุดท้าย", "Take the last row")],
    ["blank", tr("ไม่เติม ถ้าแถวซ้ำมีค่าต่างกัน", "Leave blank if the repeated rows differ")],
    ["join", tr("รวมค่าที่ต่างกันเป็นข้อความเดียว", "Join the different values into one text")],
  ], "first");
  const fillSel = segmented([
    ["empty", tr("เติมเฉพาะช่องว่าง", "Only empty cells")],
    ["always", tr("ทับของเดิมด้วย", "Overwrite too")],
  ], "empty");
  /* ── คอลัมน์ผลการหา เลือกได้ทีละคอลัมน์ ─────────────────────────────────
   * ‼️ (07/10/2026 พี่ปอนด์) เดิมเป็นสวิตช์เดียวเปิดปิดทั้งชุด อยากได้แค่บางคอลัมน์ไม่ได้
   *    และถ้าไฟล์มีคอลัมน์ของตัวเองอยู่แล้วแต่ชื่อไม่ตรง จะได้คอลัมน์ใหม่ซ้อนขึ้นมา
   *    ตอนนี้แต่ละคอลัมน์เลือก ไม่ใส่ / คอลัมน์ใหม่ / คอลัมน์ที่มีอยู่แล้ว ชื่อเหมือนหรือใกล้กันจับคู่ให้เอง */
  const STATUS_HEAD = [tr("ผลการหา", "Lookup result"), tr("เจอในไฟล์รองกี่แถว", "Rows found in source"),
    tr("เติมแล้ว", "Filled"), tr("ค่ามาจากแถวในไฟล์รอง", "Taken from source row")];
  const STATUS_HINT = [tr("เจอ 1 แถว, ไม่เจอ, เจอ 2 แถว (ค่าต่างกัน)", "Found in 1 row, Not found, ..."), tr("ตัวเลข เช่น 0, 1, 2", "A number like 0, 1, 2"),
    tr("Yes หรือ No ไว้กดฟิลเตอร์", "Yes or No, handy for filtering"), tr("เลขแถวตาม Excel เช่น 7, 8", "Excel row numbers like 7, 8")];
  let userStatus = false;
  /* ‼️ (07/10/2026 พี่ปอนด์) ชื่อคอลัมน์ใหม่ตั้งเองได้ ค่าเริ่มต้นเป็นชื่อเดิม
   *    ชื่อที่ตรงกับคอลัมน์ที่มีอยู่แล้ว = เขียนลงคอลัมน์นั้น (ทับทุกแถว) บอกใต้ช่องชื่อให้เห็นก่อนบันทึก */
  const nameIn = (value, label) => el("input", { class: "lk-num", type: "text", value, "aria-label": label });
  const statusSel = STATUS_HEAD.map(() => select([["new", "-"]], "new"));
  const statusName = STATUS_HEAD.map((h) => nameIn(h, tr(`ชื่อคอลัมน์ใหม่ของ ${h}`, `New column name for ${h}`)));
  const statusNote = STATUS_HEAD.map(() => el("p", { class: "lk-note", hidden: true }));
  statusSel.forEach((s, i) => {
    s.onchange = () => { userStatus = true; syncNames(); refresh(); };
    statusName[i].oninput = refresh;
  });
  const setAllStatus = (v) => { userStatus = true; statusSel.forEach((s) => { s.value = v; }); syncNames(); refresh(); };
  const statusBox = el("div", { class: "lk-keys" }, statusSel.map((s, i) => el("div", {}, [
    field(STATUS_HEAD[i], s, STATUS_HINT[i]),
    field(tr("ชื่อคอลัมน์ใหม่", "New column name"), statusName[i]), statusNote[i],
  ])));

  /* ── แถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี → เพิ่มเป็นแถวใหม่ (Addon) ─────────────
   * ปิดไว้เป็นค่าเริ่มต้น เพราะการเพิ่มแถวลงไฟล์จริงของบริษัทต้องเป็นการตัดสินใจของคนใช้เอง */
  const pad = (n) => String(n).padStart(2, "0");
  const monthTag = () => { const d = new Date(); return `Addon ${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const dayTag = () => { const d = new Date(); return `Addon ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const addonSw = el("input", { type: "checkbox", "aria-label": tr("เพิ่มเป็นแถวใหม่ท้ายไฟล์หลัก", "Add them as new rows at the end of the main file") });
  const addonInfo = el("p", { class: "lk-sub" });
  const tagIn = el("input", { class: "lk-num", type: "text", value: monthTag(), "aria-label": tr("ป้ายของแถวใหม่", "Label for the new rows") });
  const tagCol = select([["new", tr("คอลัมน์ใหม่ท้ายตาราง", "New column at the end")], ["none", tr("ไม่ใส่ป้าย", "No label")]], "new");
  const tagName = nameIn("Addon", tr("ชื่อคอลัมน์ป้าย", "Label column name"));
  const tagNameF = field(tr("ชื่อคอลัมน์ป้าย", "Label column name"), tagName);
  const tagNote = el("p", { class: "lk-note", hidden: true });
  const setTag = (v) => { tagIn.value = v; refresh(); };
  const addonBox = el("div", { class: "lk-addon", hidden: true }, [
    field(tr("ป้ายบอกว่าเป็นแถวเพิ่ม", "Label for the added rows"), tagIn),
    el("div", { class: "lk-mini" }, [
      button(tr("เดือนนี้", "This month"), { ghost: true, onclick: () => setTag(monthTag()) }),
      button(tr("วันนี้", "Today"), { ghost: true, onclick: () => setTag(dayTag()) }),
    ]),
    field(tr("ใส่ป้ายที่คอลัมน์", "Put the label in"), tagCol), tagNameF, tagNote,
    el("p", { class: "lk-note" }, tr("แถวใหม่ได้คีย์ กับคอลัมน์ที่ติ๊กไว้ด้านบน ลงคอลัมน์ตามที่เลือกไว้",
      "New rows get the key and the ticked columns above, in the destinations you chose")),
  ]);
  addonSw.onchange = () => { addonBox.hidden = !addonSw.checked; refresh(); };
  tagIn.oninput = refresh;
  tagCol.onchange = () => { syncNames(); refresh(); };
  tagName.oninput = refresh;

  const right = el("div", {}, [
    el("h3", { class: "lk-h" }, tr("คีย์ที่ใช้จับคู่", "Match on")),
    el("p", { class: "lk-sub" }, tr("เลือกคอลัมน์ที่ค่าตรงกันทั้งสองไฟล์ ต่อหลายคอลัมน์ได้ จะต่อกันตรง ๆ เหมือนสูตร A&F",
      "Pick the column whose values agree in both files, like Mapping. Several columns are glued together like the formula A&F")),
    el("div", { class: "lk-two" }, [keyBox.main, keyBox.sec]),
    sw(tr("ไม่สนตัวพิมพ์ใหญ่เล็ก", "Ignore upper and lower case"), caseSw),
    sw(tr("มองว่า 0012 กับ 12 เป็นค่าเดียวกัน", "Treat 0012 and 12 as the same"), zeroSw,
      tr("ปิดไว้ดีกว่าถ้าคีย์เป็นรหัสที่ขึ้นต้นด้วย 0", "Better off when keys are codes that start with 0")),
    el("h3", { class: "lk-h", style: "margin-top:18px" }, tr("คอลัมน์ที่จะดึงมาเติม", "Columns to bring over")),
    el("p", { class: "lk-sub" }, tr("ติ๊กคอลัมน์ของไฟล์รอง แล้วเลือกว่าลงคอลัมน์ไหนของไฟล์หลัก ชื่อเหมือนหรือใกล้กันจับคู่ให้แล้ว",
      "Tick source columns and choose where each goes in the main file. Same or similar names are paired for you")),
    pullFind,
    el("div", { class: "lk-mini" }, [pullAll, pullNone]),
    pullBox, pullEmpty,
    el("h3", { class: "lk-h", style: "margin-top:18px" }, tr("ถ้าไฟล์รองมีคีย์ซ้ำ", "If the source repeats a key")),
    field(tr("เลือกค่าจากแถวไหน", "Which row to take from"), dupSel),
    dupHint,
    el("h3", { class: "lk-h", style: "margin-top:18px" }, tr("ช่องปลายทางที่มีข้อมูลอยู่แล้ว", "Destination cells that already have data")),
    fillSel,
    el("p", { class: "lk-note" }, tr("ช่องที่มีแต่เว้นวรรคถือว่าว่าง เติมได้ ช่องที่เป็นสูตรไม่ถูกทับ",
      "Cells holding only spaces count as empty. Formula cells are never overwritten")),
    el("h3", { class: "lk-h", style: "margin-top:18px" }, tr("คอลัมน์ผลการหา", "Result columns")),
    el("p", { class: "lk-sub" }, tr("เลือกทีละคอลัมน์ ไม่ใส่ หรือต่อท้ายตาราง หรือลงคอลัมน์ที่มีอยู่แล้ว (ทับค่าเดิมทุกแถว)",
      "Per column: leave out, add at the end, or write into an existing column (overwrites every row)")),
    el("div", { class: "lk-mini" }, [
      button(tr("ใส่ทั้งหมด", "Add all"), { ghost: true, onclick: () => setAllStatus("new") }),
      button(tr("ไม่ใส่เลย", "None"), { ghost: true, onclick: () => setAllStatus("none") }),
    ]),
    statusBox,
    el("h3", { class: "lk-h", style: "margin-top:18px" }, tr("แถวที่ไฟล์หลักยังไม่มี", "Rows the main file does not have yet")),
    addonInfo,
    sw(tr("เพิ่มเป็นแถวใหม่ท้ายไฟล์หลัก (Addon)", "Add them as new rows at the end (Addon)"), addonSw),
    addonBox,
  ]);

  // ── ตรงกลาง: ผล ──────────────────────────────────────────────────────────
  const chips = el("div", { class: "stats" });
  const banner = el("div", { class: "lk-banner", hidden: true });
  /* ‼️ แท็บผลแยกตามกลุ่ม พร้อมจำนวน (พี่ปอนด์ 06/10/2026: ตัวอย่างผลควรโชว์ที่เจอ และ “ต้องตรวจ” ไม่สื่อ)
   *    เดิมตัวอย่างผลโชว์ 40 แถวแรกของไฟล์ ไฟล์จริง 23,212 แถวเจอแค่ 7 จึงเห็นแต่ “ไม่เจอ” ทั้งจอ
   *    แท็บแรกจึงเป็นแถวที่เจอเสมอ แท็บที่ไม่มีรายการไม่โชว์ */
  const tabsHost = el("div");
  let view = "found";
  const viewBox = el("div", { class: "xt-wrap" });
  const centerNode = el("div", {}, [chips, banner, tabsHost, viewBox]);

  // ── ปุ่มล่าง ─────────────────────────────────────────────────────────────
  const saveBtn = button(tr("บันทึกลงไฟล์หลักเดิม", "Save into the main file"), { icon: "check", onclick: onSaveClick });
  const dlBtn = button(tr("ดาวน์โหลดไฟล์ที่เติมแล้ว", "Download the filled file"), { icon: "download", ghost: true, onclick: downloadFilled });
  const repBtn = button(tr("ดาวน์โหลดรายงาน", "Download the report"), { icon: "download", ghost: true, onclick: downloadReport });
  const undoBtn = button(tr("ย้อนกลับ", "Undo"), { icon: "undo", ghost: true, onclick: undoSave });
  saveBtn.hidden = true; undoBtn.hidden = true;
  const setActions = (on) => { saveBtn.disabled = dlBtn.disabled = repBtn.disabled = !on; };
  setActions(false);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "Files"), node: left, hint: tr("อ่านจากไฟล์ในเครื่องคุณเอง ไม่ได้ส่งขึ้นเซิร์ฟเวอร์", "Read on your own machine, nothing is uploaded") },
    center: { title: tr("ผลการจับคู่", "Match result"), node: centerNode,
      empty: tr("เปิดไฟล์หลักและไฟล์รอง แล้วเลือกคอลัมน์ที่จะดึงมาเติม", "Open the main file and the source file, then choose the columns to bring over") },
    right: { title: tr("เงื่อนไข", "Conditions"), node: right },
    footer: [saveBtn, dlBtn, repBtn, undoBtn, st.node],
  });
  ws.body.prepend(styleEl);
  ws.showCanvas(false);

  // ── อ่านไฟล์ ─────────────────────────────────────────────────────────────
  const sideOf = (w) => (w === "main" ? M : S);
  const dzOf = (w) => (w === "main" ? mainDz : secDz);

  async function onFile(which) {
    const f = dzOf(which).files[0];
    const side = sideOf(which);
    // ไฟล์ใหม่หรือเอาไฟล์ออก (รวมปุ่มเริ่มใหม่) = เดาคีย์และคอลัมน์ที่จะดึงใหม่ ไม่ยึดค่าที่ตั้งกับไฟล์เก่า
    userKey = false; userPull = false; pullState = new Map(); pullFind.value = "";
    keyVals[which] = [0];
    if (which === "main") { lastSave = null; undoBtn.hidden = true; }
    if (!f) { Object.assign(side, newSide()); afterTables(true); return; }
    await loadSide(which, f, null, false);
  }

  /** โหลดไฟล์เข้าฝั่งนั้น keep = โหลดซ้ำหลังบันทึก ให้คงชีตและแถวหัวตารางที่เลือกไว้ */
  async function loadSide(which, file, handle, keep) {
    const side = sideOf(which);
    const prev = { name: side.sheetNames[side.sheetIdx], headerIdx: side.headerIdx };
    // ‼️ โหลดซ้ำหลังบันทึก (keep) ห้ามแตะแถบสถานะ ไม่งั้นข้อความ “บันทึกแล้ว อ่านกลับตรงทุกช่อง” หายทันทีที่โผล่ (เจอตอนทดสอบ 30/09/2026)
    if (!keep) st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
    try {
      await loadLibs("xlsx", "jszip");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { wb } = await readWorkbook(file);
      const names = wb.SheetNames.filter((n) => wb.Sheets[n]);
      if (!names.length) throw new Error(tr("ไม่พบชีตในไฟล์นี้", "No sheets in this file"));
      side.file = file; side.bytes = bytes; side.ext = extOf(file.name); side.wb = wb; side.sheetNames = names;
      side.meta = { size: file.size, lastModified: file.lastModified };
      if (which === "main") side.handle = handle || await handleOf(file);
      const sel = which === "main" ? mainSheet : secSheet;
      sel.innerHTML = "";
      names.forEach((n, i) => sel.appendChild(el("option", { value: String(i) }, n)));
      const idx = keep ? Math.max(0, names.indexOf(prev.name)) : 0;
      sel.value = String(idx);
      (which === "main" ? mainSheetF : secSheetF).hidden = names.length < 2;
      pickSheet(which, idx, keep ? prev.headerIdx : null);
      if (!keep) st.clear();
    } catch (e) {
      Object.assign(side, newSide());
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + (e.message || e));
      afterTables(true);
    }
  }

  function pickSheet(which, i, headerIdx) {
    const side = sideOf(which);
    side.sheetIdx = i;
    side.aoa = sheetAoa(side.wb.Sheets[side.sheetNames[i]]);
    side.headerIdx = headerIdx != null ? headerIdx : guessHeaderRow(side.aoa);
    (which === "main" ? mainHead : secHead).value = String(side.headerIdx + 1);
    (which === "main" ? mainHeadF : secHeadF).hidden = false;
    side.table = tableFromAoa(side.aoa, side.headerIdx);
    afterTables(headerIdx == null);
  }

  mainSheet.onchange = () => pickSheet("main", +mainSheet.value, null);
  secSheet.onchange = () => pickSheet("sec", +secSheet.value, null);
  const onHead = (which, input) => () => {
    const side = sideOf(which);
    const n = Math.max(1, Math.min(side.aoa ? side.aoa.length : 1, Math.round(+input.value) || 1));
    input.value = String(n);
    side.headerIdx = n - 1;
    side.table = tableFromAoa(side.aoa, side.headerIdx);
    afterTables(true);
  };
  mainHead.onchange = onHead("main", mainHead);
  secHead.onchange = onHead("sec", secHead);

  // ── หลังตารางเปลี่ยน: เติมตัวเลือก เดาค่าเริ่มต้น ─────────────────────────
  function afterTables(reguess) {
    const mt = M.table, stt = S.table;
    mainInfo.textContent = mt ? tr(`${mt.rows.length.toLocaleString()} แถวข้อมูล ${mt.width} คอลัมน์`, `${pl(mt.rows.length.toLocaleString(), "data row", "data rows")}, ${pl(mt.width, "column", "columns")}`) : "";
    secInfo.textContent = stt ? tr(`${stt.rows.length.toLocaleString()} แถวข้อมูล ${stt.width} คอลัมน์`, `${pl(stt.rows.length.toLocaleString(), "data row", "data rows")}, ${pl(stt.width, "column", "columns")}`) : "";
    renderInplace();
    // คอลัมน์คีย์ที่เกินความกว้างของตารางใหม่ (เปลี่ยนชีตหรือแถวหัว) ตัดทิ้ง
    for (const w of ["main", "sec"]) {
      const t = sideOf(w).table;
      if (!t) { keyVals[w] = [0]; continue; }
      keyVals[w] = keyVals[w].filter((c) => c < t.width);
      if (!keyVals[w].length) keyVals[w] = [0];
    }
    if (mt && stt && !userKey) {
      const g = guessKeyPair(mt.header, stt.header);
      keyVals.main = [g ? g.main : 0]; keyVals.sec = [g ? g.sec : 0];
    }
    renderKeys("main"); renderKeys("sec");
    // ป้ายแถวใหม่ลงคอลัมน์ที่มีอยู่แล้วได้ ตัวเลือกตามหัวตารางไฟล์หลัก
    const keepTag = tagCol.value;
    tagCol.innerHTML = "";
    [["new", tr("คอลัมน์ใหม่ท้ายตาราง", "New column at the end")], ["none", tr("ไม่ใส่ป้าย", "No label")],
      ...(mt ? mt.header.map((h, c) => [String(c), `${colLetter(c)}: ${h}`]) : [])]
      .forEach(([v, t]) => tagCol.appendChild(el("option", { value: v }, t)));
    tagCol.value = [...tagCol.options].some((o) => o.value === keepTag) ? keepTag : "new";
    // คอลัมน์ผล: ตัวเลือกตามหัวตารางไฟล์หลัก ค่าเริ่มต้น = คอลัมน์ชื่อเหมือนหรือใกล้กันถ้ามี ไม่มีก็คอลัมน์ใหม่
    statusSel.forEach((sel, i) => {
      const keep = sel.value;
      sel.innerHTML = "";
      [["new", tr("คอลัมน์ใหม่ท้ายตาราง", "New column at the end")], ["none", tr("ไม่ใส่", "Leave out")],
        ...(mt ? mt.header.map((h, c) => [String(c), `${colLetter(c)}: ${h}`]) : [])]
        .forEach(([v, t]) => sel.appendChild(el("option", { value: v }, t)));
      const guess = mt ? bestDest(STATUS_HEAD[i], mt.header) : -1;
      const want = userStatus ? keep : guess >= 0 ? String(guess) : "new";
      sel.value = [...sel.options].some((o) => o.value === want) ? want : "new";
    });
    syncNames();
    if (mt && stt) buildPullList(reguess && !userPull);
    else { pullBox.innerHTML = ""; pullFind.hidden = true; }
    refresh();
  }

  function buildPullList(guess) {
    const mt = M.table, stt = S.table;
    const skip = keyVals.sec;
    const old = pullState;
    pullState = new Map();
    const guessed = new Map(guess ? guessPullCols(mt.header, mt.rows, stt.header, skip).map((g) => [g.sec, g.main]) : []);
    pullBox.innerHTML = "";
    stt.header.forEach((h, j) => {
      if (skip.includes(j)) return;
      if (isBlank(h) || /^\([A-Z]+\)$/.test(h)) return;       // คอลัมน์ไม่มีหัว ไม่มีอะไรให้เลือกด้วยชื่อ
      // ‼️ ชื่อไม่ตรงเป๊ะก็จับคู่ให้ (Tax Inv. Date (SM) กับ Tax Inv Date SM) ไม่เจอเลย = คอลัมน์ใหม่ท้ายตาราง
      const match = bestDest(h, mt.header);
      const exact = match >= 0 && normHead(mt.header[match]) === normHead(h);
      const prev = old.get(j);
      const st0 = prev && !guess ? prev : { on: guessed.has(j), dest: match >= 0 ? String(match) : "new" };
      pullState.set(j, st0);
      const name = `${colLetter(j)}: ${h}`;
      const cb = el("input", { type: "checkbox", checked: st0.on || null, "aria-label": tr(`ดึงคอลัมน์ ${h}`, `Bring the column ${h}`) });
      const dest = select([["new", tr("คอลัมน์ใหม่ท้ายตาราง", "New column at the end")],
        ...mt.header.map((mh, c) => [String(c), `${colLetter(c)}: ${mh}`])], st0.dest);
      dest.setAttribute("aria-label", tr(`ปลายทางของ ${h}`, `Destination for ${h}`));
      // ‼️ บอกให้เห็นตั้งแต่ยังไม่ติ๊ก ว่าคอลัมน์นี้จะลงที่ไหน (พี่ถาม “มันรู้ได้ไงว่าต้องเอาไปเติมที่คอลัมน์ไหน”)
      const hint = el("small", { class: "lk-hint" }, match < 0
        ? tr("ไม่มีชื่อตรงในไฟล์หลัก ติ๊กแล้วเลือกปลายทางเองได้", "No matching name in the main file. Tick it to pick a destination")
        : exact ? tr(`จะลง ${colLetter(match)}: ${mt.header[match]} (ชื่อตรงกัน)`, `Goes to ${colLetter(match)}: ${mt.header[match]} (same name)`)
          : tr(`จะลง ${colLetter(match)}: ${mt.header[match]} (ชื่อใกล้กัน ตรวจอีกที)`, `Goes to ${colLetter(match)}: ${mt.header[match]} (similar name, check it)`));
      const row = el("div", { class: "lk-pr" + (st0.on ? " on" : ""), "data-q": `${name} ${normHead(h)}`.toLowerCase() }, [
        cb, el("span", { class: "nm" }, name),
        el("div", { class: "lk-dest" }, [el("span", {}, tr("ลงที่", "Goes to")), dest]), hint,
      ]);
      cb.onchange = () => { st0.on = cb.checked; row.classList.toggle("on", cb.checked); userPull = true; refresh(); };
      dest.onchange = () => { st0.dest = dest.value; userPull = true; refresh(); };
      pullBox.appendChild(row);
    });
    pullFind.hidden = pullBox.children.length <= 6;
    filterPull();
  }

  function filterPull() {
    const q = pullFind.value.trim().toLowerCase();
    let shown = 0;
    for (const row of pullBox.children) {
      row.hidden = !!q && !row.dataset.q.includes(q);
      if (!row.hidden) shown++;
    }
    pullEmpty.hidden = !q || shown > 0;
    pullEmpty.textContent = tr(`ไม่มีคอลัมน์ที่ชื่อมี “${pullFind.value.trim()}”`, `No column name contains “${pullFind.value.trim()}”`);
  }

  /** ติ๊กหรือล้าง เฉพาะแถวที่เห็นอยู่ (กำลังค้นหาอยู่ = ทำกับผลค้นหาเท่านั้น) */
  function setAllPull(on) {
    userPull = true;
    const cols = [...pullState.keys()];
    [...pullBox.children].forEach((row, i) => {
      if (row.hidden) return;
      pullState.get(cols[i]).on = on;
      const cb = row.querySelector("input"); cb.checked = on; row.classList.toggle("on", on);
    });
    refresh();
  }

  for (const c of [caseSw, zeroSw]) c.onchange = refresh;
  dupSel.onchange = () => { dupHint.textContent = DUP_HINT[dupSel.value] || ""; refresh(); };
  dupHint.textContent = DUP_HINT[dupSel.value];
  fillSel.onchange = refresh;

  // ── คำนวณ ─────────────────────────────────────────────────────────────────
  const stLabel = (p) => {
    if (p.status === "one") return tr("เจอ 1 แถว", "Found in 1 row");
    if (p.status === "dupSame") return tr(`เจอ ${p.n} แถว (ค่าเหมือนกัน)`, `Found in ${pl(p.n, "row", "rows")} (equal values)`);
    if (p.status === "dupDiff") return p.withheld
      ? tr(`เจอ ${p.n} แถว (ค่าต่างกัน ไม่ได้เติม)`, `Found in ${pl(p.n, "row", "rows")} (different values, not filled)`)
      : tr(`เจอ ${p.n} แถว (ค่าต่างกัน)`, `Found in ${pl(p.n, "row", "rows")} (different values)`);
    if (p.status === "none") return tr("ไม่เจอ", "Not found");
    return tr("คีย์ว่าง", "Empty key");
  };

  function spec() {
    const mk = keyVals.main.slice(), sk = keyVals.sec.slice();
    const pull = [...pullState].filter(([, v]) => v.on).map(([j, v]) => ({ sec: j, dest: v.dest }));
    return { mk, sk, pull };
  }

  /** ปลายทางคอลัมน์ผลทีละคอลัมน์ "new" | "none" | เลขคอลัมน์ */
  const statusDests = () => statusSel.map((s) => (s.value === "new" || s.value === "none" ? s.value : +s.value));
  const nameOf = (input, fallback) => input.value.trim() || fallback;
  /** คอลัมน์ของไฟล์หลักที่ชื่อนี้ (ตรงเป๊ะ ไม่สนตัวพิมพ์) ไม่มี = -1 */
  const headAt = (name) => (M.table ? M.table.header.findIndex((h) => normHead(h) === normHead(name)) : -1);

  /** ช่องชื่อโผล่เฉพาะตอนเลือกคอลัมน์ใหม่ */
  function syncNames() {
    statusSel.forEach((s, i) => { statusName[i].closest(".field").hidden = s.value !== "new"; });
    tagNameF.hidden = tagCol.value !== "new";
  }

  /** ชื่อคอลัมน์ใหม่ที่ตรงกับคอลัมน์ที่มีอยู่ = จะเขียนทับลงคอลัมน์นั้น บอกใต้ช่องชื่อ */
  function renderNameNotes() {
    const tell = (note, on, name) => {
      const at = on ? headAt(name) : -1;
      note.hidden = at < 0;
      if (at >= 0) note.textContent = tr(`มีคอลัมน์ชื่อนี้แล้ว (${colLetter(at)}) จะเขียนทับลงคอลัมน์นั้น`,
        `A column with this name exists (${colLetter(at)}). It will be overwritten`);
    };
    statusSel.forEach((s, i) => tell(statusNote[i], s.value === "new", nameOf(statusName[i], STATUS_HEAD[i])));
    tell(tagNote, tagCol.value === "new" && addonSw.checked, nameOf(tagName, "Addon"));
  }

  /* ‼️ (07/10/2026) ทุกอย่างที่จะเขียนลงคอลัมน์ ต้องไม่ลงที่เดียวกัน คีย์ คอลัมน์ที่ดึง คอลัมน์ผล ป้าย Addon
   *    ชื่อคอลัมน์ใหม่ที่ตั้งเองอาจไปตรงกับคอลัมน์ที่มีอยู่ หรือตรงกันเอง ค่าจะทับกันโดยไม่มีใครรู้ */
  function clashOf({ mk, pull }, addonOn) {
    const where = [];       // [ชื่อสิ่งที่เขียน, ที่ลง]
    const at = (d, name) => (d === "new" ? (headAt(name) >= 0 ? headAt(name) : "n:" + normHead(name)) : +d);
    mk.forEach((c) => where.push([tr(`คีย์ ${colLetter(c)}`, `key ${colLetter(c)}`), c]));
    pull.forEach((p) => where.push([S.table.header[p.sec], at(p.dest, S.table.header[p.sec])]));
    statusDests().forEach((d, i) => { if (d !== "none") where.push([nameOf(statusName[i], STATUS_HEAD[i]), at(d, nameOf(statusName[i], STATUS_HEAD[i]))]); });
    if (addonOn && tagCol.value !== "none") where.push([tr("ป้าย Addon", "Addon label"), at(tagCol.value, nameOf(tagName, "Addon"))]);
    const seen = new Map();
    for (const [who, w] of where) {
      if (seen.has(w)) return [seen.get(w), who, typeof w === "number" ? colLetter(w) : w.slice(2)];
      seen.set(w, who);
    }
    return null;
  }

  function problemsOf({ mk, sk, pull }, addonOn) {
    const out = [];
    const dests = pull.filter((p) => p.dest !== "new").map((p) => +p.dest);
    const clash = clashOf({ mk, pull }, addonOn);
    if (clash) out.push(tr(`ลงคอลัมน์เดียวกัน: ${clash[0]} กับ ${clash[1]} (${clash[2]}) เปลี่ยนปลายทางหรือชื่ออย่างใดอย่างหนึ่ง`,
      `Same column: ${clash[0]} and ${clash[1]} (${clash[2]}). Change one destination or name`));
    if (!pull.length) out.push(tr("ยังไม่ได้ติ๊กคอลัมน์ที่จะดึงมาเติม", "No column ticked to bring over yet"));
    if (addonOn) {
      if (addonKeyCells(mk, sk, []) == null) out.push(tr("แถวใหม่: แยกคีย์ไฟล์รองลงหลายคอลัมน์ไม่ได้ ให้คีย์ไฟล์หลักเหลือคอลัมน์เดียว",
        "New rows: the source key cannot be split into several main columns. Use one main key column"));
    }
    return out;
  }

  let timer = 0;
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(compute, 40);
  }

  /** เลขแถว (ตาม Excel) ของไฟล์รองที่ค่าถูกหยิบมาใช้จริง เช่น "5" หรือ "5, 6" ตอนรวมค่า */
  const srcRowsText = (p) => (p.used || []).map((h) => S.table.rowIdx[h] + 1).join(", ");

  /** แถวสุดท้ายที่มีข้อมูลของไฟล์หลัก (ตำแหน่งใน aoa) แถวใหม่ต่อจากตรงนี้ */
  const lastDataIdx = () => (M.table.rowIdx.length ? M.table.rowIdx[M.table.rowIdx.length - 1] : M.headerIdx);

  function compute() {
    last = null; setActions(false);
    confirmReset();
    if (!M.table || !S.table) { ws.showCanvas(false); addonInfo.textContent = ""; return; }
    const sp = spec();
    const keyOpts = { ignoreCase: caseSw.checked, ignoreZeros: zeroSw.checked };
    const result = lookup({
      mainRows: M.table.rows, mainKeyCols: sp.mk, secRows: S.table.rows, secKeyCols: sp.sk,
      pullCols: sp.pull.map((p) => p.sec), keyOpts, dup: dupSel.value,
    });
    const s = result.stats;
    addonInfo.textContent = s.secOnly
      ? tr(`ไฟล์รองมี ${s.secOnly.toLocaleString()} แถวที่คีย์ไม่อยู่ในไฟล์หลัก ดูได้ที่แท็บ “มีแต่ในไฟล์รอง”`,
           `The source has ${pl(s.secOnly.toLocaleString(), "row", "rows")} whose key is not in the main file. See the “Only in source” tab`)
      : tr("ทุกคีย์ของไฟล์รองมีอยู่ในไฟล์หลักแล้ว ไม่มีแถวให้เพิ่ม", "Every source key is already in the main file. Nothing to add");
    const addonOn = addonSw.checked && s.secOnly > 0;
    const problems = problemsOf(sp, addonOn);
    let fill = null, addon = null;
    if (!problems.length) {
      // ‼️ ปลายทาง “คอลัมน์ใหม่” แต่ในไฟล์หลักมีคอลัมน์ชื่อเดียวกันอยู่แล้ว (เช่นทำซ้ำบนไฟล์ที่เพิ่งบันทึก) ใช้ของเดิม ไม่ต่อซ้ำ
      const existing = (name) => M.table.header.findIndex((h) => normHead(h) === normHead(name));
      const dests = sp.pull.map((p) => {
        if (p.dest !== "new") return { col: +p.dest };
        const at = existing(S.table.header[p.sec]);
        return at >= 0 ? { col: at } : { col: null, name: S.table.header[p.sec] };
      });
      if (addonOn) {
        const tc = tagCol.value, value = tagIn.value.trim();
        addon = {
          at: lastDataIdx() + 1,
          rows: result.secOnly.map((h) => ({ src: h, keys: addonKeyCells(sp.mk, sp.sk, S.table.rows[h]),
            vals: sp.pull.map((p) => S.table.rows[h][p.sec] ?? null) })),
          tag: tc === "none" || !value ? null : tc === "new" ? { col: null, name: nameOf(tagName, "Addon"), value } : { col: +tc, value },
          label: (a) => tr(`เพิ่มจากไฟล์รอง แถว ${S.table.rowIdx[a.src] + 1}`, `Added from source row ${S.table.rowIdx[a.src] + 1}`),
          src: (a) => String(S.table.rowIdx[a.src] + 1),
        };
      }
      fill = applyFill({
        aoa: M.aoa, headerIdx: M.headerIdx, rowIdx: M.table.rowIdx, width: M.table.width, result, dests,
        fill: fillSel.value, addon,
        status: statusDests().some((d) => d !== "none")
          ? { head: STATUS_HEAD.map((h, i) => nameOf(statusName[i], h)), dest: statusDests(), label: stLabel, src: srcRowsText } : null,
      });
    }
    last = { sp, result, fill, problems, addon, keyOpts };
    renderNameNotes();
    ws.showCanvas(true);
    renderChips();
    renderTabs();
    renderView();
    setActions(!problems.length && !!fill);
    renderInplace();
  }

  function renderChips() {
    const { result, fill, problems, addon, sp, keyOpts } = last;
    const s = result.stats;
    chips.innerHTML = "";
    const chip = (cls, text) => chips.appendChild(el("span", { class: "stat " + cls }, text));
    chip("dim", tr(`ไฟล์หลัก ${s.total.toLocaleString()} แถว`, `${pl(s.total.toLocaleString(), "main row", "main rows")}`));
    chip("ok", tr(`เจอ ${s.found.toLocaleString()} แถว`, `${s.found.toLocaleString()} found`));
    if (s.none) chip("bad", tr(`ไม่เจอ ${s.none.toLocaleString()} แถว`, `${s.none.toLocaleString()} not found`));
    if (s.dupSame) chip("warn", tr(`เจอซ้ำค่าเหมือนกัน ${s.dupSame.toLocaleString()} แถว`, `${s.dupSame.toLocaleString()} repeated, equal values`));
    if (s.dupDiff) chip("bad", tr(`เจอซ้ำค่าต่างกัน ${s.dupDiff.toLocaleString()} แถว`, `${s.dupDiff.toLocaleString()} repeated, different values`));
    if (s.nokey) chip("dim", tr(`คีย์ว่าง ${s.nokey.toLocaleString()} แถว`, `${s.nokey.toLocaleString()} empty keys`));
    if (fill) chip("ok", tr(`จะเติม ${fill.stat.filled.toLocaleString()} ช่อง`, `${pl(fill.stat.filled.toLocaleString(), "cell", "cells")} to fill`));
    if (fill && fill.stat.keptOld) chip("dim", tr(`ไม่ทับของเดิม ${fill.stat.keptOld.toLocaleString()} ช่อง`, `${pl(fill.stat.keptOld.toLocaleString(), "cell", "cells")} kept as is`));
    if (fill && fill.stat.added) chip("ok", tr(`จะเพิ่มแถวใหม่ ${fill.stat.added.toLocaleString()} แถว`, `${pl(fill.stat.added.toLocaleString(), "new row", "new rows")} to add`));
    else if (s.secOnly) chip("dim", tr(`มีแต่ในไฟล์รอง ${s.secOnly.toLocaleString()} แถว`, `${s.secOnly.toLocaleString()} only in source`));

    const lines = [];
    let cls = "";
    if (problems.length) { lines.push(...problems.map((p) => `<b>${esc(p)}</b>`)); cls = " bad"; }
    if (s.secDupKeys) {
      lines.push(tr(
        `ไฟล์รองมีคีย์ซ้ำ <b>${s.secDupKeys.toLocaleString()}</b> ค่า ถูกไฟล์หลักใช้จริง <b>${s.secDupKeysHit.toLocaleString()}</b> ค่า`,
        `The source repeats <b>${s.secDupKeys.toLocaleString()}</b> keys, <b>${s.secDupKeysHit.toLocaleString()}</b> of them are used by the main file`));
      if (s.dupDiff) { lines.push(tr(`มี <b>${s.dupDiff.toLocaleString()}</b> แถวที่คีย์ซ้ำและข้อมูลที่ดึงไม่เหมือนกัน ดูแท็บ “เจอหลายแถว” ก่อนใช้`, `<b>${s.dupDiff.toLocaleString()}</b> rows have a repeated key with different data. Check the “Found in several rows” tab before using`)); cls = cls || " warn"; }
    }
    // ‼️ คีย์ว่างเกินครึ่ง: สาเหตุที่เจอจริงคือคีย์เป็นสูตรในไฟล์ที่ไม่เคยถูก Excel บันทึก (เช่นสร้างจากสคริปต์) สูตรจึงไม่มีค่าที่คำนวณไว้
    //    SheetJS ไม่สร้างเซลล์นั้นให้เลยจึงแยกไม่ได้ว่าเป็นสูตรหรือว่างจริง ต้องบอกสาเหตุที่เป็นไปได้ ไม่ใช่ให้ผู้ใช้เดาเอง
    if (s.total && s.nokey > s.total / 2) {
      lines.push(`<b>${esc(tr(`คีย์ของไฟล์หลักว่างเกินครึ่ง (${s.nokey.toLocaleString()} จาก ${s.total.toLocaleString()} แถว) ถ้าเป็นสูตร ให้เปิดไฟล์ใน Excel แล้วกดบันทึกก่อน`,
        `The main file's key is empty on over half the rows (${s.nokey.toLocaleString()} of ${s.total.toLocaleString()}). If it is a formula, open the file in Excel and save once`))}</b>`);
      cls = " bad";
    }
    /* ‼️ เจอน้อยผิดปกติ (ไฟล์จริงของพี่ 06/10/2026 เจอ 7 จาก 23,205) โชว์หน้าตาคีย์ที่เอามาเทียบจริงสองฝั่ง
     *    ให้เห็นเองว่าต่างกันตรงไหน (คนละคอลัมน์ ศูนย์นำหน้า มีขีด) แทนการเดาสาเหตุ */
    // ‼️ (07/10/2026) เทียบกับฝั่งที่มีคีย์น้อยกว่า และพูดบรรทัดเดียว ตัวอย่างคีย์โชว์เฉพาะตอนหน้าตาสองฝั่งต่างกันจริง
    const mainSample = result.perRow.filter((p) => p.key != null).slice(0, 3).map((p) => p.key);
    const secSample = [];
    for (const r of S.table.rows) { const k = keyOf(r, sp.sk, keyOpts); if (k != null) secSample.push(k); if (secSample.length >= 3) break; }
    const lm = lowMatch(s, mainSample, secSample);
    if (lm) {
      const of = Math.min(s.mainKeys, s.secKeys).toLocaleString(), got = s.matchedKeys.toLocaleString();
      lines.push(lm.samples
        ? tr(`เจอแค่ <b>${got}</b> จาก ${of} คีย์ หน้าตาคีย์ต่างกัน ไฟล์หลัก <b>${esc(mainSample[0])}</b> ไฟล์รอง <b>${esc(secSample[0])}</b>`,
             `Only <b>${got}</b> of ${of} keys matched. They look different: main <b>${esc(mainSample[0])}</b>, source <b>${esc(secSample[0])}</b>`)
        : tr(`เจอแค่ <b>${got}</b> จาก ${of} คีย์ ตรวจว่าเลือกคีย์และไฟล์ถูกคู่`, `Only <b>${got}</b> of ${of} keys matched. Check the key columns and files`));
      cls = cls || " warn";
      // ‼️ คีย์ผิดคอลัมน์ = ทุกแถวของไฟล์รองดูเหมือน “ไม่มีในไฟล์หลัก” เปิด Addon ไว้จะเพิ่มแถวซ้ำทั้งไฟล์
      if (fill && fill.stat.added) {
        lines.push(`<b>${esc(tr(`ระวัง จะเพิ่ม ${fill.stat.added.toLocaleString()} แถว ทั้งที่อาจมีอยู่แล้วแต่คีย์หน้าตาไม่ตรง ตรวจคีย์ก่อนบันทึก`,
          `Careful: ${pl(fill.stat.added.toLocaleString(), "row", "rows")} would be added though they may already exist with differently shaped keys. Check the keys before saving`))}</b>`);
        cls = " bad";
      }
    }
    if (s.secBlankKeys) lines.push(tr(`ไฟล์รองมี ${s.secBlankKeys.toLocaleString()} แถวที่คีย์ว่างหรือเป็น error (ข้ามไป)`, `${pl(s.secBlankKeys.toLocaleString(), "source row has", "source rows have")} an empty or error key (skipped)`));
    if (addon && fill && fill.stat.added) lines.push(tr(`แถวใหม่ต่อท้ายตั้งแต่แถว <b>${addon.at + 1}</b> สูตรยอดรวมที่อ้างช่วงเดิมจะไม่นับแถวใหม่`,
      `New rows start at row <b>${addon.at + 1}</b>. Total formulas that point at the old range will not count them`));
    banner.className = "lk-banner" + cls;
    banner.hidden = !lines.length;
    banner.innerHTML = lines.join("<br>");
  }

  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const keyText = (row, cols) => cols.map((c) => cellText(row[c])).filter(Boolean).join(" ");
  const badge = (p) => el("span", { class: "lk-badge " + p.status }, stLabel(p));
  const FOUND = new Set(["one", "dupSame", "dupDiff"]);

  function renderTabs() {
    const s = last.result.stats;
    const n = (x) => x.toLocaleString();
    const opts = [["found", tr(`เจอ ${n(s.found)}`, `Found ${n(s.found)}`)]];
    if (s.none) opts.push(["none", tr(`ไม่เจอ ${n(s.none)}`, `Not found ${n(s.none)}`)]);
    if (s.dupSame + s.dupDiff) opts.push(["multi", tr(`เจอหลายแถว ${n(s.dupSame + s.dupDiff)}`, `Found in several rows ${n(s.dupSame + s.dupDiff)}`)]);
    if (s.nokey) opts.push(["nokey", tr(`คีย์ว่าง ${n(s.nokey)}`, `Empty key ${n(s.nokey)}`)]);
    if (s.secOnly) opts.push(["secOnly", tr(`มีแต่ในไฟล์รอง ${n(s.secOnly)}`, `Only in source ${n(s.secOnly)}`)]);
    // ‼️ (07/10/2026) ไม่มีแท็บ คีย์ซ้ำในไฟล์รอง แล้ว ซ้ำกับ เจอหลายแถว ที่มองจากไฟล์หลักและบอกแถวไฟล์รองครบ
    //    คีย์ซ้ำที่ไฟล์หลักไม่ใช้ไม่มีผลกับการเติม ยังอยู่ในชีตของรายงานที่ดาวน์โหลด
    if (!opts.some(([v]) => v === view)) view = "found";
    const seg = segmented(opts, view);
    seg.classList.add("lk-tabs");
    seg.setAttribute("aria-label", tr("กลุ่มผลการจับคู่", "Match result groups"));
    seg.onchange = () => { view = seg.value; renderView(); };
    tabsHost.replaceChildren(seg);
  }

  function renderView() {
    viewBox.innerHTML = "";
    if (!last) return;
    if (view === "found") return renderFound();
    if (view === "secOnly") return renderSecOnly();
    return renderList(view);
  }

  const note = (t) => viewBox.appendChild(el("div", { class: "note" }, t));

  function renderFound() {
    const { sp, result, fill } = last;
    if (!fill) { note(tr("แก้ข้อความสีแดงด้านบนก่อน จึงจะเห็นตัวอย่างผล", "Fix the notice above first to see a preview")); return; }
    const rows = [];
    result.perRow.forEach((p, k) => { if (FOUND.has(p.status)) rows.push(k); });
    if (!rows.length) { note(tr("ยังไม่เจอเลยสักแถว ดูแท็บ “ไม่เจอ” แล้วลองเปลี่ยนคอลัมน์คีย์", "Nothing matched yet. See the “Not found” tab and try other key columns")); return; }
    const cols = fill.cols;
    const head = cols.map((c) => fill.aoa[M.headerIdx][c]);
    const shown = rows.slice(0, PREVIEW);
    viewBox.appendChild(el("table", { class: "xt" }, [
      el("thead", {}, [el("tr", {}, [el("th", {}, tr("แถว", "Row")), el("th", {}, tr("คีย์", "Key")), ...head.map((h) => el("th", {}, String(h ?? ""))), el("th", {}, tr("ผล", "Result")), el("th", {}, tr("จากแถวในไฟล์รอง", "From source row"))])]),
      el("tbody", {}, shown.map((k) => {
        const p = result.perRow[k];
        const i = M.table.rowIdx[k];
        return el("tr", {}, [
          el("td", { class: "num" }, String(i + 1)),
          el("td", { class: "old lk-mono" }, keyText(M.table.rows[k], sp.mk)),
          ...cols.map((c) => {
            const after = fill.aoa[i][c], before = M.aoa[i][c];
            const changed = !sameCell(after, before) && !(after == null && before == null);
            return el("td", { class: (changed ? "new lk-chg" : "old") }, cellText(after));
          }),
          el("td", {}, [badge(p)]),
          el("td", { class: "old num" }, srcRowsText(p)),
        ]);
      })),
    ]));
    note(tr(`แสดง ${shown.length.toLocaleString()} จาก ${rows.length.toLocaleString()} แถวที่เจอ ช่องที่จะถูกเติมตัวหนาและมีสีรอง`,
      `Showing ${shown.length.toLocaleString()} of ${pl(rows.length.toLocaleString(), "matched row", "matched rows")}. Cells to be filled are bold and tinted`));
  }

  function renderList(group) {
    const { sp, result } = last;
    const want = group === "multi" ? (p) => p.status === "dupSame" || p.status === "dupDiff" : (p) => p.status === group;
    const rows = [];
    result.perRow.forEach((p, k) => { if (want(p)) rows.push({ p, k }); });
    const withSrc = group === "multi";
    viewBox.appendChild(el("table", { class: "xt lk-list" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("แถวในไฟล์หลัก", "Main row")), el("th", {}, tr("คีย์", "Key")), el("th", {}, tr("ผล", "Result")),
        withSrc ? el("th", {}, tr("แถวในไฟล์รอง", "Source rows")) : null])]),
      el("tbody", {}, rows.slice(0, REVIEW_MAX).map(({ p, k }) => el("tr", {}, [
        el("td", { class: "num" }, String(M.table.rowIdx[k] + 1)),
        el("td", { class: "old lk-mono" }, keyText(M.table.rows[k], sp.mk)),
        el("td", {}, [badge(p)]),
        withSrc ? el("td", { class: "old" }, p.hits.map((h) => S.table.rowIdx[h] + 1).join(", ")) : null,
      ]))),
    ]));
    if (rows.length > REVIEW_MAX) note(tr(`แสดง ${REVIEW_MAX} จาก ${rows.length.toLocaleString()} รายการ รายงานที่ดาวน์โหลดมีครบ`,
      `Showing ${REVIEW_MAX} of ${pl(rows.length.toLocaleString(), "item", "items")}. The downloadable report has all of them`));
  }

  /** แถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี ถ้าเปิดเพิ่มแถวใหม่ บอกด้วยว่าจะไปเป็นแถวไหนของไฟล์หลัก */
  function renderSecOnly() {
    const { sp, result, addon, fill } = last;
    const list = result.secOnly;
    const added = addon && fill && fill.stat.added;
    viewBox.appendChild(el("table", { class: "xt lk-list" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("แถวในไฟล์รอง", "Source row")), el("th", {}, tr("คีย์", "Key")),
        ...sp.pull.map((p) => el("th", {}, S.table.header[p.sec])),
        added ? el("th", {}, tr("จะเป็นแถวในไฟล์หลัก", "Becomes main row")) : null])]),
      el("tbody", {}, list.slice(0, REVIEW_MAX).map((h, n) => el("tr", {}, [
        el("td", { class: "num" }, String(S.table.rowIdx[h] + 1)),
        el("td", { class: "old lk-mono" }, keyText(S.table.rows[h], sp.sk)),
        ...sp.pull.map((p) => el("td", { class: "old" }, cellText(S.table.rows[h][p.sec]))),
        added ? el("td", { class: "new lk-chg num" }, String(addon.at + n + 1)) : null,
      ]))),
    ]));
    if (list.length > REVIEW_MAX) note(tr(`แสดง ${REVIEW_MAX} จาก ${list.length.toLocaleString()} แถว`, `Showing ${REVIEW_MAX} of ${list.length.toLocaleString()}`));
    if (!added) note(tr("อยากเพิ่มแถวพวกนี้เข้าไฟล์หลัก เปิด “เพิ่มเป็นแถวใหม่ท้ายไฟล์หลัก” ด้านขวา", "To add these rows to the main file, turn on “Add them as new rows” on the right"));
  }

  // ── ผลลัพธ์เป็นไฟล์ ───────────────────────────────────────────────────────
  const isXlsx = () => M.ext === "xlsx" || M.ext === "xlsm";

  /** สร้างไฟล์หลักที่เติมแล้ว xlsx/xlsm = แก้เฉพาะช่องใน XML เดิม, ชนิดอื่น = สร้างไฟล์ใหม่ด้วย SheetJS */
  async function buildFilled() {
    const { fill } = last;
    if (isXlsx()) {
      const edits = fill.edits.map((e) => ({ r: e.i + 1, c: e.c, v: e.v }));
      // แถวใหม่ (Addon) ลอกสไตล์จากแถวข้อมูลสุดท้าย และขยายฟิลเตอร์กับตาราง Excel ให้ครอบแถวใหม่
      const opts = fill.stat.added ? { appendFrom: last.addon.at + 1, styleRow: lastDataIdx() + 1 } : {};
      const out = await patchXlsx(window.JSZip, M.bytes, M.sheetNames[M.sheetIdx], edits, opts);
      return { bytes: out.bytes, patch: out, ext: M.ext };
    }
    const wsx = XLSX.utils.aoa_to_sheet(fill.aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
    const wbx = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbx, wsx, String(M.sheetNames[M.sheetIdx]).replace(/[[\]*?/\\:]/g, "-").slice(0, 31) || "Sheet1");
    return { bytes: new Uint8Array(XLSX.write(wbx, { bookType: "xlsx", type: "array" })), patch: null, ext: "xlsx" };
  }

  const mimeOf = (ext) => (ext === "xlsm" ? XLSM_MIME : XLSX_MIME);

  async function downloadFilled() {
    if (!last || !last.fill) return;
    setActions(false); st.info(tr("กำลังสร้างไฟล์…", "Building the file…"));
    try {
      const out = await buildFilled();
      const name = `${stemOf(M.file.name)}${tr("-เติมแล้ว", "-filled")}.${out.ext}`;
      saveFile(new Blob([out.bytes], { type: mimeOf(out.ext) }), name);
      st.ok(doneText(out, tr("ดาวน์โหลดแล้ว", "Downloaded")));
    } catch (e) {
      st.err(tr("สร้างไฟล์ไม่สำเร็จ: ", "Could not build the file: ") + (e.message || e));
    } finally { setActions(!!last && !last.problems.length); }
  }

  function doneText(out, head) {
    const f = last.fill.stat;
    let t = tr(`${head} เติม ${f.filled.toLocaleString()} ช่อง`, `${head}, filled ${pl(f.filled.toLocaleString(), "cell", "cells")}`);
    if (f.added) t += tr(`, เพิ่มแถวใหม่ ${f.added.toLocaleString()} แถว`, `, added ${pl(f.added.toLocaleString(), "new row", "new rows")}`);
    if (out.patch && out.patch.stat.skippedFormula)
      t += tr(`, ข้าม ${out.patch.stat.skippedFormula.toLocaleString()} ช่องที่เป็นสูตร (ไม่ทับสูตร)`, `, skipped ${pl(out.patch.stat.skippedFormula.toLocaleString(), "formula cell", "formula cells")} (formulas are never overwritten)`);
    if (!isXlsx()) t += tr(" (ไฟล์ชนิดนี้สร้างเป็น .xlsx ใหม่ สไตล์เดิมไม่ติดมา)", " (this file type is rebuilt as .xlsx, original styling does not carry over)");
    return t;
  }

  function downloadReport() {
    if (!last || !last.fill) return;
    const { sp, result } = last;
    const s = result.stats;
    const summary = { header: [tr("รายการ", "Item"), tr("จำนวน", "Count")], rows: [
      [tr("ไฟล์หลัก", "Main file"), M.file.name], [tr("ไฟล์รอง", "Source file"), S.file.name],
      [tr("คีย์ไฟล์หลัก", "Main key"), sp.mk.map((c) => M.table.header[c]).join(" + ")],
      [tr("คีย์ไฟล์รอง", "Source key"), sp.sk.map((c) => S.table.header[c]).join(" + ")],
      [tr("แถวไฟล์หลัก", "Main rows"), s.total], [tr("เจอ", "Found"), s.found],
      [tr("เจอ 1 แถว", "Found once"), s.one], [tr("เจอซ้ำ ค่าเหมือนกัน", "Repeated, equal values"), s.dupSame],
      [tr("เจอซ้ำ ค่าต่างกัน", "Repeated, different values"), s.dupDiff], [tr("ไม่เจอ", "Not found"), s.none],
      [tr("คีย์ว่าง", "Empty key"), s.nokey], [tr("คีย์ซ้ำในไฟล์รอง (ค่า)", "Repeated keys in source"), s.secDupKeys],
      [tr("ในนั้นไฟล์หลักใช้จริง", "Of which used by the main file"), s.secDupKeysHit],
      [tr("มีแต่ในไฟล์รอง (แถว)", "Only in source (rows)"), s.secOnly],
      [tr("เพิ่มเป็นแถวใหม่ (แถว)", "Added as new rows"), last.fill ? last.fill.stat.added : 0],
    ] };
    const check = { header: [tr("แถวในไฟล์หลัก", "Main row"), tr("คีย์", "Key"), tr("ผล", "Result"), tr("เจอกี่แถว", "Rows found"), tr("แถวในไฟล์รอง", "Source rows")],
      rows: result.perRow.map((p, k) => [p, k]).filter(([p]) => p.status !== "one")
        .map(([p, k]) => [M.table.rowIdx[k] + 1, keyText(M.table.rows[k], sp.mk), stLabel(p), p.n, p.hits.map((h) => S.table.rowIdx[h] + 1).join(", ")]) };
    const dups = { header: [tr("คีย์", "Key"), tr("แถวในไฟล์รอง", "Source rows"), tr("ค่าที่ดึง", "Values"), tr("ไฟล์หลักใช้กี่แถว", "Main rows using it")],
      rows: result.secDupKeys.map((d) => [d.key, d.rows.map((h) => S.table.rowIdx[h] + 1).join(", "), d.agree ? tr("เหมือนกัน", "Equal") : tr("ต่างกัน", "Different"), d.mainHits]) };
    const only = { header: [tr("แถวในไฟล์รอง", "Source row"), tr("คีย์", "Key")],
      rows: result.secOnly.map((h) => [S.table.rowIdx[h] + 1, keyText(S.table.rows[h], sp.sk)]) };
    const sheets = [[tr("สรุป", "Summary"), summary], [tr("ไม่เจอและเจอหลายแถว", "Not found or repeated"), check]];
    if (dups.rows.length) sheets.push([tr("คีย์ซ้ำในไฟล์รอง", "Repeated in source"), dups]);
    if (only.rows.length) sheets.push([tr("มีแต่ในไฟล์รอง", "Only in source"), only]);
    saveFile(tablesToBlob(sheets), `${stemOf(M.file.name)}${tr("-รายงานการจับคู่.xlsx", "-lookup-report.xlsx")}`);
    st.ok(tr("ดาวน์โหลดรายงานแล้ว", "Report downloaded"));
  }

  // ── แก้ตรงในไฟล์เดิม ─────────────────────────────────────────────────────
  function renderInplace() {
    inplaceBox.className = "lk-inplace";
    saveBtn.hidden = true;
    if (!M.file) { inplaceBox.hidden = true; return; }
    inplaceBox.hidden = false;
    if (!canWriteInPlace()) {
      inplaceBox.textContent = tr("เบราว์เซอร์นี้เขียนกลับทับไฟล์เดิมไม่ได้ (ใช้ได้ใน Chrome และ Edge บนคอม) ให้ใช้ปุ่มดาวน์โหลดแทน",
        "This browser cannot write back into the original file (Chrome or Edge on a computer can). Use the download button instead");
    } else if (!isXlsx()) {
      inplaceBox.textContent = tr("แก้ตรงในไฟล์ได้เฉพาะ .xlsx และ .xlsm ไฟล์ชนิดนี้ให้ดาวน์โหลดแทน", "Direct editing works for .xlsx and .xlsm only. Download this one instead");
    } else if (!M.handle) {
      inplaceBox.textContent = tr("ไฟล์นี้เปิดแบบอ่านอย่างเดียว เขียนทับไม่ได้ กดกล่องไฟล์หลักเลือกใหม่ หรือใช้ปุ่มดาวน์โหลด",
        "This file was opened read only and cannot be written back. Click the main file box and choose the file again, or use the download button");
    } else {
      inplaceBox.classList.add("ok");
      inplaceBox.textContent = tr("แก้ตรงในไฟล์นี้ได้ กดบันทึกแล้วเขียนทับเลย ต้องปิดไฟล์ใน Excel ก่อน เพราะ Excel ล็อกไฟล์ที่เปิดอยู่",
        "This file can be edited in place. Close it in Excel before saving, because Excel locks an open file and it cannot be overwritten (the original stays safe)");
      saveBtn.hidden = false;
    }
  }

  async function pickMain() {
    try {
      const r = await pickWritable(PICK_TYPES);
      if (!r) return;
      // ส่งไฟล์เข้ากล่องหย่อนของไฟล์หลักให้ทำงานเหมือนลากมาวาง แล้วผูกมือจับให้
      const input = mainDz.container.querySelector("input[type=file]");
      const dt = new DataTransfer(); dt.items.add(r.file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {
      st.err(tr("เปิดไฟล์ไม่สำเร็จ: ", "Could not open the file: ") + (e.message || e));
    }
  }

  function confirmReset() {
    clearTimeout(confirmTimer); confirmTimer = null;
    saveBtn.querySelector("span").textContent = tr("บันทึกลงไฟล์หลักเดิม", "Save into the main file");
    saveBtn.classList.remove("danger");
  }

  /** กดครั้งแรก = ขอยืนยัน (5 วินาที) กดซ้ำ = เขียนจริง กันเผลอกดทับไฟล์จริงของบริษัท */
  function onSaveClick() {
    if (!last || !last.fill || !M.handle) return;
    if (!confirmTimer) {
      const n = last.fill.stat.filled, a = last.fill.stat.added;
      const more = a ? tr(` เพิ่ม ${a.toLocaleString()} แถว`, `, ${pl(a.toLocaleString(), "new row", "new rows")}`) : "";
      saveBtn.querySelector("span").textContent = tr(`กดอีกครั้งเพื่อเขียนทับ ${M.file.name} (${n.toLocaleString()} ช่อง${more})`, `Press again to overwrite ${M.file.name} (${pl(n.toLocaleString(), "cell", "cells")}${more})`);
      saveBtn.classList.add("danger");
      confirmTimer = setTimeout(confirmReset, 5000);
      return;
    }
    confirmReset();
    saveInPlace();
  }

  async function saveInPlace() {
    const handle = M.handle;
    setActions(false); undoBtn.hidden = true;
    try {
      st.info(tr("กำลังตรวจสอบก่อนเขียนทับ…", "Checking before overwriting…"));
      if (!(await askWrite(handle))) throw Object.assign(new Error(tr("ไม่ได้รับอนุญาตให้เขียนไฟล์นี้", "Permission to write this file was not given")), { soft: true });
      // ‼️ กันเขียนทับงานที่ใครบันทึกทับไปหลังเปิดเข้ามา (เช่นพี่แก้ใน Excel แล้วเซฟระหว่างที่หน้านี้เปิดอยู่)
      const cur = await handle.getFile();
      if (cur.size !== M.meta.size || cur.lastModified !== M.meta.lastModified)
        throw Object.assign(new Error(tr("ไฟล์ถูกเปลี่ยนหลังจากที่เปิดเข้ามา จึงไม่เขียนทับ ให้ลากไฟล์เข้ามาใหม่แล้วทำอีกครั้ง",
          "The file changed after it was opened here, so it was not overwritten. Drop the file in again and repeat")), { soft: true });
      const out = await buildFilled();
      const orig = M.bytes;
      st.info(tr("กำลังเขียนทับไฟล์เดิม…", "Overwriting the original file…"));
      try {
        await writeBack(handle, out.bytes);
      } catch (e) {
        throw Object.assign(new Error(tr(
          `เขียนทับไม่ได้ (${e.name || "error"}) ส่วนใหญ่เพราะไฟล์ยังเปิดใน Excel ปิดแล้วกดอีกครั้ง ไฟล์เดิมไม่ได้เสียหาย`,
          `Could not overwrite (${e.name || "error"}). Usually the file is still open in Excel. Close it there and press again. The original is not damaged. You can also download the filled file instead`)), { soft: true });
      }
      // อ่านกลับจากไฟล์บนดิสก์จริง ๆ แล้วเทียบทุกช่องที่เขียน
      const back = await handle.getFile();
      const { wb } = await readWorkbook(back);
      const aoa = sheetAoa(wb.Sheets[M.sheetNames[M.sheetIdx]]);
      const bad = out.patch.applied.filter((a) => !sameCell(a.v, (aoa[a.r - 1] || [])[a.c]));
      lastSave = { orig, handle, meta: { size: back.size, lastModified: back.lastModified }, name: M.file.name };
      let msg = bad.length
        ? tr(`เขียนแล้ว แต่อ่านกลับมาไม่ตรง ${bad.length} ช่อง กดย้อนกลับได้`, `Written, but ${bad.length} cells read back different. You can undo`)
        : tr(`บันทึกลง ${M.file.name} แล้ว เติม ${out.patch.stat.written.toLocaleString()} ช่อง อ่านกลับจากไฟล์แล้วตรงทุกช่อง`,
             `Saved into ${M.file.name}, ${pl(out.patch.stat.written.toLocaleString(), "cell", "cells")} filled, all read back correctly from the file`);
      if (last.fill.stat.added) msg += tr(`, เพิ่มแถวใหม่ ${last.fill.stat.added.toLocaleString()} แถว`, `, ${pl(last.fill.stat.added.toLocaleString(), "new row", "new rows")} added`);
      if (out.patch.stat.skippedFormula) msg += tr(`, ข้าม ${out.patch.stat.skippedFormula.toLocaleString()} ช่องที่เป็นสูตร`, `, skipped ${pl(out.patch.stat.skippedFormula.toLocaleString(), "formula cell", "formula cells")}`);
      (bad.length ? st.err : st.ok)(msg);
      undoBtn.hidden = false;
      await loadSide("main", back, handle, true);       // โหลดสถานะไฟล์ใหม่ ตัวเลือกที่ตั้งไว้คงเดิม
    } catch (e) {
      st.err(e.soft ? e.message : tr("บันทึกไม่สำเร็จ: ", "Could not save: ") + (e.message || e));
    } finally { setActions(!!last && !last.problems.length); }
  }

  async function undoSave() {
    if (!lastSave) return;
    const { orig, handle, meta } = lastSave;
    try {
      const cur = await handle.getFile();
      if (cur.size !== meta.size || cur.lastModified !== meta.lastModified)
        throw new Error(tr("ไฟล์ถูกเปลี่ยนหลังจากที่บันทึกไว้ จึงไม่ย้อนกลับให้ กันทับงานใหม่", "The file changed after the save, so it will not be rolled back over newer work"));
      await writeBack(handle, orig);
      const back = await handle.getFile();
      lastSave = null; undoBtn.hidden = true;
      st.ok(tr("ย้อนกลับแล้ว ไฟล์กลับเป็นเหมือนก่อนบันทึก", "Undone, the file is back as it was before the save"));
      await loadSide("main", back, handle, true);
    } catch (e) {
      st.err(tr("ย้อนกลับไม่สำเร็จ: ", "Could not undo: ") + (e.message || e));
    }
  }

  return ws.wrap;
}
