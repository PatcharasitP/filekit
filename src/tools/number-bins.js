import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, dropzone, download } from "../ui.js";
import { tr, pl, IS_EN } from "../i18n.js";
import { stateKit, SHARE_MSG } from "../statekit.js";
import { readWorkbook, sheetToTable, tableToBlob, cellText } from "../sheetpick.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import {
  readValues, decimalsIn, suggestBreaks, cleanBreaks, autoLabels,
  assign, distribution, histogram, genM, genSQL, genDAX, roundTo, quantile,
} from "../binkit.js";

/* ‼️ ทำไมต้องมีเครื่องมือนี้
 * "จัดกลุ่มตัวเลข" เป็นงานที่ทำซ้ำทุกเดือนแต่ทำมือทุกครั้ง: อายุงาน SLA, ค่าเช่า, ระยะทางที่ย้าย
 * สองแผลที่เจอซ้ำจนต้องมีเครื่องมือ
 *   ① จัดกลุ่มแล้วกราฟเรียงมั่ว เพราะป้ายเป็นข้อความ "11-15" จึงมาก่อน "6-10" ตามตัวอักษร
 *      ที่นี่จึงให้คอลัมน์เลขเรียงคู่มาเสมอ ไม่มีทางลืม
 *   ② เลือกจุดตัดด้วยความรู้สึก แล้วได้กลุ่มที่บวมกลุ่มเดียวหรือกลุ่มว่าง
 *      ที่นี่จึงโชว์การกระจายจริงก่อน แล้วให้เครื่องเสนอ 4 วิธีมาเทียบ ก่อนตัดสินใจ
 *
 * ‼️ ของจริงที่หน้านี้ต้องรองรับ (พี่ปอนด์สั่งไว้ตรง ๆ 16/09/2026)
 *   "มีหลักการจัดให้ แต่ก็อยากเอาบางตัวไปอยู่หมวดที่ต้องการเองด้วยเลย"
 *   = ล็อกรายตัวได้ และล็อกแล้วลำดับการเรียงต้องไม่พัง (ตรรกะและเทสอยู่ที่ src/binkit.js ข้อ ⑩)
 */

const STYLE = `
.nb-src{display:flex;flex-direction:column;gap:10px}
.nb-ta{width:100%;min-height:120px;resize:vertical;font:13px/1.6 var(--mono,ui-monospace,monospace);
  padding:10px 12px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);color:var(--text)}
.nb-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.nb-chip{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--bg-soft);
  border:1px solid var(--line);color:var(--text-mute);white-space:nowrap;max-width:100%}
/* ‼️ ชิปเตือนยาวกว่าชิปตัวเลข ถ้าบังคับบรรทัดเดียวจะถูกตัดหายไปครึ่งข้อความ */
.nb-chip.warn{white-space:normal;line-height:1.5}
.nb-chip b{color:var(--text);font-weight:700}
.nb-chip.warn{border-color:var(--warn,#c98a00);color:var(--text)}

.nb-group-title{margin:18px 0 8px;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--text-mute)}
.nb-group-title:first-child{margin-top:0}
.nb-hint{display:block;font-size:12px;color:var(--text-mute);line-height:1.6;margin:-2px 0 6px}
.nb-num{width:100%;min-height:36px;padding:8px 11px;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-soft);color:var(--text);font-size:14px}
.nb-num:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.nb-row{display:flex;gap:8px;align-items:center}
.nb-row > .nb-num{flex:1;min-width:0}
.nb-row .btn{flex:none}

.nb-switch-field{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:13px;color:var(--text);padding:5px 0;min-height:36px}
.nb-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.nb-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.nb-track{position:absolute;inset:0;background:var(--line);border-radius:999px;transition:background .15s ease}
.nb-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s ease}
.nb-switch input:checked + .nb-track{background:var(--g-powerbi,var(--brand))}
.nb-switch input:checked + .nb-track::after{transform:translateX(18px)}
.nb-switch input:focus-visible + .nb-track{outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){ .nb-switch{height:36px} .nb-track{top:6px;bottom:6px} }

.nb-chart{width:100%;height:230px;display:block;touch-action:none;user-select:none}
.nb-chart .bar{fill:var(--text-mute);opacity:.5}
.nb-chart .band-a{fill:var(--g-powerbi,var(--brand));opacity:.03}
.nb-chart .band-b{fill:var(--g-powerbi,var(--brand));opacity:.08}
.nb-chart .cut{stroke:var(--g-powerbi,var(--brand));stroke-width:2}
.nb-chart .cut-hit{stroke:transparent;stroke-width:16;cursor:ew-resize}
.nb-chart .cut-lab{font-size:11px;fill:var(--text);font-variant-numeric:tabular-nums}
.nb-chart .axis{stroke:var(--line);stroke-width:1}
.nb-chart .axis-lab{font-size:11px;fill:var(--text-mute);font-variant-numeric:tabular-nums}
.nb-chart .cnt-lab{font-size:11px;fill:var(--text-mute)}
.nb-chart-help{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 2px 0}

.nb-table{width:100%;border-collapse:collapse;font-size:13px}
.nb-table th,.nb-table td{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:middle}
.nb-table th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mute);font-weight:700;white-space:nowrap}
.nb-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
/* ชื่อกลุ่มต้องอยู่บรรทัดเดียว ไม่งั้นคำว่า เฝ้าระวัง ถูกหั่นเป็นสามบรรทัด */
.nb-glabel{white-space:nowrap}
.nb-table td:nth-child(2){white-space:nowrap}
.nb-table tr.is-null td{color:var(--text-mute)}
.nb-barcell{display:block;height:8px;border-radius:999px;background:var(--g-powerbi,var(--brand));opacity:.45;min-width:2px}
.nb-lockdot{display:inline-block;font-size:11.5px;color:var(--text-mute);margin-left:6px}
.nb-tag{font-size:11.5px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--text-mute)}

.nb-locks{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.nb-lock{display:flex;align-items:center;gap:8px;font-size:13px;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-soft);padding:6px 8px 6px 11px}
.nb-lock b{font-weight:700}
.nb-lock span.to{color:var(--text-mute);font-size:12px}
.nb-lock .btn{margin-left:auto;padding:3px 9px;font-size:12px}
.nb-empty-note{font-size:12.5px;color:var(--text-mute);line-height:1.7}

.nb-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(58vh,560px)}
.nb-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre}
.nb-codebar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.nb-scroll{overflow:auto;max-height:min(58vh,560px)}
` + CODE_TOKEN_CSS;

const MAX_PREVIEW = 30;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  // ── สถานะทั้งหมดของหน้า ────────────────────────────────────────────────
  let wb = null, sheetNames = [], table = null;     // table = { header, rows }
  let values = [];                                  // ค่าดิบของคอลัมน์ที่เลือก
  let keys = [];                                    // ชื่อรายการคู่กัน (ใช้ล็อกรายตัว)
  let read = { nums: [], badRows: [], blank: 0, total: 0 };
  let breaks = [];
  let overrides = {};                               // { key: ป้าย }
  let extraOrder = [];                              // ลำดับหมวดพิเศษที่เกิดจากการล็อก
  let customLabels = null;                          // ป้ายที่ผู้ใช้พิมพ์เอง
  /* ‼️ ต้องประกาศตรงนี้ ไม่ใช่กลางไฟล์ เพราะ apply() ของการกู้ค่าแตะตัวนี้
     ถ้าประกาศทีหลังจะชนกฎ TDZ แล้วเครื่องมือพังตอนเปิดลิงก์ที่มีค่ามา */
  let wholeTouched = false;                         // ผู้ใช้เคยกดสวิตช์ป้ายจำนวนเต็มเองหรือยัง
  let lastAssigned = null;

  // ── แผงซ้าย: ตัวเลขมาจากไหน ───────────────────────────────────────────
  const srcTabs = segmented([
    ["file", tr("ไฟล์ Excel หรือ CSV", "Excel or CSV file")],
    ["paste", tr("วางตัวเลขเอง", "Paste numbers")],
  ], "file");
  const sheetSel = select([["0", "-"]], "0");
  const colSel = select([["0", "-"]], "0");
  const keySel = select([["-1", tr("ไม่ใช้", "None")]], "-1");
  const sheetField = field(tr("ชีต", "Sheet"), sheetSel);
  const colField = field(tr("คอลัมน์ตัวเลข", "Number column"), colSel);
  const keyField = field(tr("คอลัมน์ชื่อรายการ", "Column that names each row"), keySel,
    tr("เช่น รหัสสถานี ใช้ตอนล็อกบางรายการไปหมวดที่ต้องการเอง", "For example a site code, used when you lock a row into a group of your own"));
  const ta = el("textarea", {
    class: "nb-ta", spellcheck: "false",
    placeholder: tr("วางตัวเลขทีละบรรทัด คัดลอกจาก Excel มาวางได้เลย", "Paste one number per line, straight from Excel"),
  });
  const pasteBox = el("div", {}, [ta]);
  pasteBox.hidden = true;
  const chips = el("div", { class: "nb-chips" });

  const dz = dropzone({
    accept: ".xlsx,.xlsm,.xls,.csv,.txt", multiple: false,
    expect: ["xlsx", "csv", "txt"],
    expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("เปิดไฟล์ที่มีหัวตารางแถวบนสุด", "Open a file whose top row is the header"),
    onChange: onFiles,
  });
  const fileBox = el("div", {}, [dz.container, sheetField, colField, keyField]);
  sheetField.hidden = true; colField.hidden = true; keyField.hidden = true;

  const leftBody = el("div", { class: "nb-src" }, [srcTabs, fileBox, pasteBox, chips]);

  srcTabs.onchange = () => {
    const v = srcTabs.value;
    fileBox.hidden = v !== "file";
    pasteBox.hidden = v !== "paste";
    if (v === "paste") readPasted(); else pickColumn();
  };
  ta.addEventListener("input", () => { readPasted(); });
  sheetSel.onchange = () => pickSheet(+sheetSel.value);
  colSel.onchange = () => pickColumn();
  keySel.onchange = () => { pickColumn(); };

  // ── แผงขวา: กติกาการจัดกลุ่ม ──────────────────────────────────────────
  const methodSel = select([
    ["round", tr("เลขกลม (คนอ่านง่ายสุด)", "Round numbers (easiest to read)")],
    ["quantile", tr("จำนวนเท่ากันทุกกลุ่ม", "Equal count per group")],
    ["natural", tr("ช่องว่างธรรมชาติในข้อมูล", "Natural gaps in the data")],
    ["equal", tr("ความกว้างเท่ากัน", "Equal width")],
  ], "round");
  const kSel = select([3, 4, 5, 6, 7, 8, 10].map((n) => [String(n), String(n)]), "5");
  const applyBtn = button(tr("ให้เครื่องเสนอจุดตัด", "Suggest the cut points"), { onclick: () => { applySuggestion(); }, ghost: true });

  const breaksIn = el("input", { class: "nb-num", type: "text", inputmode: "decimal", placeholder: "0, 5, 10, 20" });
  breaksIn.addEventListener("change", () => {
    breaks = cleanBreaks(breaksIn.value.split(/[,\s;]+/).filter(Boolean));
    customLabels = null;
    refresh();
  });

  const unitIn = el("input", { class: "nb-num", type: "text", placeholder: tr("เช่น  กม.", "e.g.  km") });
  unitIn.addEventListener("input", () => refresh());
  const nullIn = el("input", { class: "nb-num", type: "text", value: tr("ไม่มีข้อมูล", "No data") });
  nullIn.addEventListener("input", () => refresh());

  const wholeSw = sw(tr("ป้ายแบบจำนวนเต็ม (1-5)", "Whole-number labels (1-5)"), true,
    tr("ปิดไว้จะได้ป้ายแบบช่วงแท้ มากกว่า 0 ถึง 5 ซึ่งจำเป็นเมื่อข้อมูลมีทศนิยม",
       "Off gives true range labels, over 0 to 5, which you need when the data has decimals"));
  wholeSw.input.addEventListener("change", () => { wholeTouched = true; customLabels = null; refresh(); });

  const labelsIn = el("textarea", { class: "nb-ta", style: "min-height:96px", spellcheck: "false",
    placeholder: tr("เว้นว่างไว้ = ใช้ป้ายอัตโนมัติ  หรือพิมพ์เองบรรทัดละป้าย", "Leave empty for automatic labels, or type one label per line") });
  labelsIn.addEventListener("change", () => {
    const list = labelsIn.value.split("\n").map((s) => s.trim()).filter(Boolean);
    customLabels = list.length === breaks.length + 1 ? list : null;
    if (list.length && list.length !== breaks.length + 1) {
      st.err(tr(`ป้ายต้องมี ${breaks.length + 1} บรรทัด (จำนวนจุดตัด + 1) แต่พิมพ์มา ${list.length}`,
                `You need ${breaks.length + 1} labels (cut points + 1) but typed ${list.length}`));
    } else st.clear();
    refresh();
  });

  const lockKeyIn = el("input", { class: "nb-num", type: "text", placeholder: tr("รหัสรายการ เช่น SKA1029", "Row code, e.g. SKA1029") });
  const lockToIn = el("input", { class: "nb-num", type: "text", placeholder: tr("ชื่อหมวดที่ต้องการ", "Group to force it into") });
  const lockAdd = button(tr("ล็อก", "Lock"), { onclick: addLock, ghost: true });
  const lockList = el("div", { class: "nb-locks" });
  lockKeyIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lockToIn.focus(); } });
  lockToIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLock(); } });

  const bandColIn = el("input", { class: "nb-num", type: "text", placeholder: tr("เว้นว่าง = <ชื่อคอลัมน์> Band", "Empty = <column> Band") });
  const sortColIn = el("input", { class: "nb-num", type: "text", placeholder: tr("เว้นว่าง = <ชื่อคอลัมน์> Band Sort", "Empty = <column> Band Sort") });
  bandColIn.addEventListener("input", () => refresh());
  sortColIn.addEventListener("input", () => refresh());

  const rightBody = el("div", {}, [
    el("h3", { class: "nb-group-title" }, tr("หลักการจัดกลุ่ม", "How to cut the groups")),
    field(tr("วิธี", "Method"), methodSel),
    el("small", { class: "nb-hint" }, tr(
      "ถ้ามีกฎธุรกิจอยู่แล้ว เช่น SLA 7, 30, 90 วัน ให้พิมพ์จุดตัดเองด้านล่างเลย กฎธุรกิจชนะทุกวิธี",
      "If a business rule already exists, say an SLA of 7, 30, 90 days, just type the cut points below. A business rule beats every method")),
    field(tr("จำนวนกลุ่ม", "How many groups"), kSel),
    applyBtn,
    el("h3", { class: "nb-group-title" }, tr("จุดตัด", "Cut points")),
    field(tr("ขอบบนของแต่ละช่วง", "Upper edge of each group"), breaksIn,
      tr("คั่นด้วยจุลภาค ค่าที่เท่ากับจุดตัดพอดีจะอยู่ในช่วงล่างเสมอ", "Separate with commas. A value equal to a cut point always falls in the lower group")),
    el("h3", { class: "nb-group-title" }, tr("ป้ายกลุ่ม", "Group labels")),
    wholeSw.wrap,
    field(tr("หน่วยต่อท้ายป้าย", "Unit after the label"), unitIn),
    field(tr("ป้ายที่พิมพ์เอง", "Your own labels"), labelsIn),
    field(tr("ชื่อกลุ่มของค่าว่าง", "Name for the empty group"), nullIn),
    el("h3", { class: "nb-group-title" }, tr("ล็อกรายตัว", "Lock a row into a group")),
    el("small", { class: "nb-hint" }, tr(
      "บังคับบางรายการไปอยู่หมวดที่ต้องการ ไม่ว่าตัวเลขจะตกช่วงไหน ลำดับการเรียงยังถูกเหมือนเดิม",
      "Force chosen rows into a group whatever their number says. The sort order stays correct")),
    lockKeyIn, el("div", { style: "height:6px" }), el("div", { class: "nb-row" }, [lockToIn, lockAdd]),
    lockList,
    el("h3", { class: "nb-group-title" }, tr("ชื่อคอลัมน์ผลลัพธ์", "Names of the new columns")),
    field(tr("คอลัมน์ป้าย", "Label column"), bandColIn),
    field(tr("คอลัมน์เลขเรียง", "Sort column"), sortColIn),
  ]);

  // ── ตรงกลาง: กราฟ + ตาราง + โค้ด ──────────────────────────────────────
  const viewTabs = segmented([
    ["groups", tr("กลุ่มที่ได้", "Groups")],
    ["rows", tr("ตัวอย่างผลลัพธ์", "Result preview")],
    ["m", tr("Power Query", "Power Query")],
    ["sql", tr("SQL และ DAX", "SQL and DAX")],
  ], "groups");
  const chartWrap = el("div", {});
  const groupsBox = el("div", { class: "nb-scroll" });
  const rowsBox = el("div", { class: "nb-scroll" });
  rowsBox.hidden = true;
  const codeBox = el("div", {});
  codeBox.hidden = true;
  const sqlBox = el("div", {});
  sqlBox.hidden = true;
  viewTabs.onchange = () => {
    const v = viewTabs.value;
    groupsBox.hidden = v !== "groups";
    rowsBox.hidden = v !== "rows";
    codeBox.hidden = v !== "m";
    sqlBox.hidden = v !== "sql";
    if (v === "m" || v === "sql") renderCode();
  };
  const centerNode = el("div", {}, [chartWrap, viewTabs, groupsBox, rowsBox, codeBox, sqlBox]);
  centerNode.hidden = true;

  // ── แถบล่าง ───────────────────────────────────────────────────────────
  const goX = button(tr("ดาวน์โหลดเป็น Excel", "Download as Excel"), { icon: "download", onclick: () => save("xlsx") });
  const goC = button(tr("ดาวน์โหลดเป็น CSV", "Download as CSV"), { icon: "download", onclick: () => save("csv"), ghost: true });
  goX.disabled = true; goC.disabled = true;

  /* ── จำกติกาไว้ และส่งต่อด้วยลิงก์ ───────────────────────────────────
     ‼️ เก็บเฉพาะกติกาที่ไม่ผูกกับไฟล์ ชีต/คอลัมน์/รายการล็อกไม่เก็บ
        เพราะมันอ้างถึงไฟล์ที่เปิดอยู่ ส่งลิงก์ไปคนอื่นแล้วจะชี้ผิดที่ */
  const RULES = () => ({
    method: methodSel.value, k: kSel.value, breaks: breaksIn.value,
    unit: unitIn.value, nullLabel: nullIn.value, whole: wholeSw.input.checked,
    labels: labelsIn.value, bandCol: bandColIn.value, sortCol: sortColIn.value,
  });
  const store = stateKit(tool.id, {
    defaults: RULES(),
    collect: RULES,
    apply: (v) => {
      if (v.method !== undefined) methodSel.value = v.method;
      if (v.k !== undefined) kSel.value = v.k;
      if (v.unit !== undefined) unitIn.value = v.unit;
      if (v.nullLabel !== undefined) nullIn.value = v.nullLabel;
      if (v.whole !== undefined) { wholeSw.input.checked = v.whole; wholeTouched = true; }
      if (v.bandCol !== undefined) bandColIn.value = v.bandCol;
      if (v.sortCol !== undefined) sortColIn.value = v.sortCol;
      /* ‼️ จุดตัดกับป้ายต้องแปลงกลับเหมือนที่ตัวรับ event ทำ การตั้ง .value เฉย ๆ
         ไม่ทำให้ตัวแปร breaks/customLabels เปลี่ยนตาม แล้วจะได้ลิงก์ที่ดูเหมือนติด แต่ไม่ทำงาน */
      if (v.breaks !== undefined) {
        breaksIn.value = v.breaks;
        breaks = cleanBreaks(v.breaks.split(/[,\s;]+/).filter(Boolean));
      }
      if (v.labels !== undefined) {
        labelsIn.value = v.labels;
        const list = v.labels.split("\n").map((x) => x.trim()).filter(Boolean);
        customLabels = list.length === breaks.length + 1 ? list : null;
      }
    },
  });

  async function onShare() {
    const link = store.shareLink();
    try {
      await navigator.clipboard.writeText(link);
      st.ok(link.includes("?s=") ? SHARE_MSG.ok() : SHARE_MSG.plain());
    } catch { st.err(SHARE_MSG.fail()); }
  }
  const goL = button(tr("คัดลอกลิงก์ค่านี้", "Copy link to these settings"), { icon: "link", onclick: onShare, ghost: true });
  store.restore();     // ลิงก์มาก่อนของที่จำไว้ในเครื่องเสมอ (statekit จัดลำดับให้แล้ว)

  const ws = workspace(tool, {
    left: { title: tr("ตัวเลขที่จะจัดกลุ่ม", "Numbers to group"), node: leftBody },
    center: { node: centerNode, empty: tr("เปิดไฟล์หรือวางตัวเลข แล้วจะเห็นการกระจายทันที", "Open a file or paste numbers to see the spread right away") },
    right: { title: tr("กติกา", "Rules"), node: rightBody },
    footer: [goX, goC, goL, st.node],
  });
  ws.body.prepend(styleEl);

  // ── อ่านข้อมูลเข้า ────────────────────────────────────────────────────
  async function onFiles() {
    const f = dz.files[0];
    if (!f) return;
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
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

  function pickSheet(i) {
    table = sheetToTable(wb.Sheets[sheetNames[i]]);
    if (!table.header.length) { st.err(tr("ชีตนี้ว่างเปล่า", "This sheet is empty")); return; }
    colSel.innerHTML = "";
    keySel.innerHTML = "";
    keySel.appendChild(el("option", { value: "-1" }, tr("ไม่ใช้", "None")));
    table.header.forEach((h, c) => {
      colSel.appendChild(el("option", { value: String(c) }, h || `#${c + 1}`));
      keySel.appendChild(el("option", { value: String(c) }, h || `#${c + 1}`));
    });
    // เดาคอลัมน์ตัวเลขให้: คอลัมน์แรกที่อ่านเป็นตัวเลขได้เกินครึ่ง
    let best = 0, bestScore = -1;
    table.header.forEach((h, c) => {
      const col = table.rows.map((r) => r[c]);
      const got = readValues(col);
      const score = got.nums.length - got.badRows.length;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    colSel.value = String(best);
    // เดาคอลัมน์ชื่อรายการ: คอลัมน์ข้อความที่ค่าไม่ซ้ำมากที่สุด
    let kBest = -1, kScore = 0;
    table.header.forEach((h, c) => {
      if (c === best) return;
      const col = table.rows.map((r) => cellText(r[c]));
      const uniq = new Set(col.filter(Boolean)).size;
      const numeric = readValues(col).nums.length;
      if (numeric > col.length * 0.6) return;              // คอลัมน์ตัวเลข ไม่ใช่ชื่อรายการ
      if (uniq > kScore) { kScore = uniq; kBest = c; }
    });
    keySel.value = String(kBest);
    colField.hidden = false; keyField.hidden = false;
    pickColumn();
  }

  function pickColumn() {
    if (!table) return;
    const c = +colSel.value;
    values = table.rows.map((r) => r[c]);
    const kc = +keySel.value;
    keys = kc >= 0 ? table.rows.map((r) => cellText(r[kc])) : table.rows.map((_, i) => String(i + 1));
    afterRead();
  }

  function readPasted() {
    const lines = ta.value.split("\n").map((s) => s.trim()).filter((s) => s !== "");
    values = lines;
    keys = lines.map((_, i) => String(i + 1));
    afterRead();
  }

  function afterRead() {
    read = readValues(values);
    if (!wholeTouched) {
      // ข้อมูลมีทศนิยม = ป้ายจำนวนเต็มอ่านแล้วเข้าใจผิดแน่นอน สลับให้เป็นป้ายช่วงแท้เอง
      const shouldWhole = decimalsIn(read.nums) === 0;
      if (wholeSw.input.checked !== shouldWhole) { wholeSw.input.checked = shouldWhole; customLabels = null; }
    }
    if (!read.nums.length) {
      centerNode.hidden = true; ws.showCanvas(false);
      goX.disabled = true; goC.disabled = true;
      renderChips();
      return;
    }
    if (!breaks.length) applySuggestion(true);
    else refresh();
  }

  function applySuggestion(quiet) {
    breaks = suggestBreaks(read.nums, methodSel.value, +kSel.value);
    breaksIn.value = breaks.join(", ");
    customLabels = null;
    labelsIn.value = "";
    if (!quiet && !breaks.length) st.err(tr("ข้อมูลชุดนี้ไม่มีจุดตัดที่มีความหมาย (ค่าเหมือนกันหมด)", "This data has no meaningful cut point, every value is the same"));
    refresh();
  }

  methodSel.onchange = () => applySuggestion();
  kSel.onchange = () => applySuggestion();

  // ── ล็อกรายตัว ────────────────────────────────────────────────────────
  function addLock() {
    const k = lockKeyIn.value.trim();
    const to = lockToIn.value.trim();
    if (!k || !to) { st.err(tr("ใส่ทั้งรหัสรายการและชื่อหมวด", "Fill in both the row code and the group name")); return; }
    if (keys.length && !keys.includes(k)) {
      st.err(tr(`ไม่พบรายการ ${k} ในคอลัมน์ชื่อรายการที่เลือกไว้`, `No row named ${k} in the column you picked`));
      return;
    }
    overrides[k] = to;
    if (!extraOrder.includes(to)) extraOrder.push(to);
    lockKeyIn.value = ""; lockToIn.value = "";
    st.clear();
    refresh();
    lockKeyIn.focus();
  }

  function renderLocks() {
    lockList.innerHTML = "";
    const ks = Object.keys(overrides);
    if (!ks.length) {
      lockList.appendChild(el("p", { class: "nb-empty-note" },
        tr("ยังไม่มีรายการที่ล็อกไว้", "Nothing locked yet")));
      return;
    }
    for (const k of ks) {
      lockList.appendChild(el("div", { class: "nb-lock" }, [
        el("b", {}, k),
        el("span", { class: "to" }, "→"),
        el("span", {}, overrides[k]),
        button(tr("เอาออก", "Remove"), {
          ghost: true, onclick: () => {
            const lab = overrides[k];
            delete overrides[k];
            if (!Object.values(overrides).includes(lab)) extraOrder = extraOrder.filter((x) => x !== lab);
            refresh();
          },
        }),
      ]));
    }
  }

  // ── คำนวณและวาดใหม่ทั้งหน้า ───────────────────────────────────────────
  function currentCfg() {
    const decimals = decimalsIn(read.nums);
    return {
      breaks,
      labels: customLabels,
      whole: wholeSw.input.checked,
      unit: unitIn.value,
      decimals,
      lang: IS_EN ? "en" : "th",          // ป้ายช่วงแท้ใช้คำว่า ถึง หรือ to ตามภาษาที่เปิดอยู่
      nullLabel: nullIn.value.trim() || tr("ไม่มีข้อมูล", "No data"),
      overrides,
      extraOrder,
    };
  }

  function refresh() {
    store.save();     // ‼️ ต้องอยู่ก่อน return ข้างล่าง ไม่งั้นตั้งกติกาก่อนเปิดไฟล์แล้วไม่ถูกจำ
    renderChips();
    renderLocks();
    if (!read.nums.length) return;
    const cfg = currentCfg();
    const rows = values.map((v, i) => ({ key: keys[i] ?? String(i + 1), value: v, row: i }));
    lastAssigned = assign(rows, cfg);
    if (!labelsIn.value.trim()) labelsIn.placeholder = lastAssigned.labels.join("\n");
    centerNode.hidden = false;
    ws.showCanvas(true);
    goX.disabled = false; goC.disabled = false;
    drawChart();
    renderGroups();
    renderRows();
    if (!codeBox.hidden || !sqlBox.hidden) renderCode();
  }

  function renderChips() {
    chips.innerHTML = "";
    const add = (html, warn) => chips.appendChild(el("span", { class: "nb-chip" + (warn ? " warn" : ""), html }));
    if (!read.total) { chips.appendChild(el("span", { class: "nb-chip" }, tr("ยังไม่มีข้อมูล", "No data yet"))); return; }
    const d = decimalsIn(read.nums);
    add(tr(`อ่านเป็นตัวเลขได้ <b>${read.nums.length.toLocaleString()}</b> แถว`,
           `<b>${read.nums.length.toLocaleString()}</b> ${pl(read.nums.length, "row", "rows")} read as numbers`));
    if (read.blank) add(tr(`ว่าง <b>${read.blank.toLocaleString()}</b> แถว`, `<b>${read.blank.toLocaleString()}</b> blank`));
    if (read.badRows.length) add(tr(`อ่านไม่ออก <b>${read.badRows.length.toLocaleString()}</b> แถว`,
                                    `<b>${read.badRows.length.toLocaleString()}</b> unreadable`), true);
    if (read.nums.length) {
      const s = [...read.nums].sort((a, b) => a - b);
      const f = (x) => roundTo(x, Math.max(d, 0)).toLocaleString("en-US", { maximumFractionDigits: Math.max(d, 0) });
      add(tr(`ต่ำสุด <b>${f(s[0])}</b>`, `min <b>${f(s[0])}</b>`));
      add(tr(`กลาง <b>${f(quantile(s, 0.5))}</b>`, `median <b>${f(quantile(s, 0.5))}</b>`));
      add(tr(`สูงสุด <b>${f(s[s.length - 1])}</b>`, `max <b>${f(s[s.length - 1])}</b>`));
      if (d > 0) {
        add(wholeSw.input.checked
          ? tr("ข้อมูลมีทศนิยม ป้ายแบบจำนวนเต็มจะกำกวม", "Decimals present, whole-number labels are ambiguous")
          : tr("ข้อมูลมีทศนิยม จึงใช้ป้ายแบบช่วงแท้ให้", "Decimals present, so true range labels are used"), wholeSw.input.checked);
      }
    }
  }

  // ── กราฟการกระจาย + ลากเส้นแบ่ง ───────────────────────────────────────
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (n, attrs = {}, text) => {
    const e = document.createElementNS(NS, n);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function drawChart() {
    chartWrap.innerHTML = "";
    const W = Math.max(360, Math.round(chartWrap.clientWidth || 900)), H = 230;
    const padL = 12, padR = 12, padT = 22, padB = 34;
    const h = histogram(read.nums, 48);
    const lo = h.min, hi = h.max;
    const span = hi - lo || 1;
    const x = (v) => padL + ((v - lo) / span) * (W - padL - padR);
    const svg = svgEl("svg", { class: "nb-chart", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", role: "img",
      "aria-label": tr("การกระจายของตัวเลขและเส้นแบ่งกลุ่ม", "Spread of the numbers with the group cut lines") });

    // พื้นหลังแต่ละกลุ่ม สลับเข้มอ่อน ให้เห็นว่าช่วงไหนคือช่วงไหน
    const edges = [lo, ...breaks.filter((b) => b > lo && b < hi), hi];
    for (let i = 0; i < edges.length - 1; i++) {
      svg.appendChild(svgEl("rect", {
        class: i % 2 ? "band-b" : "band-a",
        x: x(edges[i]), y: padT, width: Math.max(0, x(edges[i + 1]) - x(edges[i])), height: H - padT - padB,
      }));
    }

    // แท่งฮิสโตแกรม
    const maxC = h.max_count || 1;
    for (const b of h.bins) {
      const bh = (b.count / maxC) * (H - padT - padB);
      if (!b.count) continue;
      svg.appendChild(svgEl("rect", {
        class: "bar", x: x(b.x0), y: H - padB - bh,
        width: Math.max(1, x(b.x1) - x(b.x0) - 1), height: bh,
      }));
    }
    svg.appendChild(svgEl("line", { class: "axis", x1: padL, y1: H - padB, x2: W - padR, y2: H - padB }));

    // ป้ายแกน
    const d = decimalsIn(read.nums);
    const fmtV = (v) => roundTo(v, d).toLocaleString("en-US", { maximumFractionDigits: Math.max(d, 0) });
    svg.appendChild(svgEl("text", { class: "axis-lab", x: padL, y: H - 12 }, fmtV(lo)));
    const hiLab = svgEl("text", { class: "axis-lab", x: W - padR, y: H - 12, "text-anchor": "end" }, fmtV(hi));
    svg.appendChild(hiLab);
    svg.appendChild(svgEl("text", { class: "cnt-lab", x: padL, y: 13 },
      tr(`สูงสุด ${maxC.toLocaleString()} แถวต่อช่อง`, `tallest bar ${maxC.toLocaleString()} ${pl(maxC, "row", "rows")}`)));

    // เส้นแบ่ง ลากได้
    breaks.forEach((b, i) => {
      if (b < lo || b > hi) return;
      const gx = x(b);
      svg.appendChild(svgEl("line", { class: "cut", x1: gx, y1: padT, x2: gx, y2: H - padB }));
      svg.appendChild(svgEl("text", { class: "cut-lab", x: gx + 4, y: padT + 11 }, fmtV(b)));
      const hit = svgEl("line", {
        class: "cut-hit", x1: gx, y1: padT, x2: gx, y2: H - padB,
        "data-i": i, tabindex: "0", role: "slider",
        "aria-label": tr(`จุดตัดที่ ${i + 1} ค่า ${fmtV(b)} ลากหรือกดลูกศรเพื่อปรับ`, `Cut point ${i + 1} at ${fmtV(b)}, drag or use arrow keys`),
        "aria-valuenow": b,
      });
      hit.addEventListener("pointerdown", (ev) => startDrag(ev, i, svg, lo, hi, W, padL, padR));
      hit.addEventListener("keydown", (ev) => {
        const step = (hi - lo) / 100;
        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
          ev.preventDefault();
          const next = breaks[i] + (ev.key === "ArrowRight" ? step : -step);
          setBreak(i, next);
        } else if (ev.key === "Delete" || ev.key === "Backspace") {
          ev.preventDefault();
          breaks.splice(i, 1); customLabels = null; breaksIn.value = breaks.join(", "); refresh();
        }
      });
      svg.appendChild(hit);
    });

    // คลิกที่ว่าง = เพิ่มจุดตัดตรงนั้น
    svg.addEventListener("dblclick", (ev) => {
      const r = svg.getBoundingClientRect();
      const v = lo + ((ev.clientX - r.left) / r.width) * (hi - lo);
      breaks = cleanBreaks([...breaks, roundTo(v, Math.max(d, 0))]);
      customLabels = null;
      breaksIn.value = breaks.join(", ");
      refresh();
    });

    chartWrap.appendChild(svg);
    chartWrap.appendChild(el("p", { class: "nb-chart-help" }, tr(
      "ลากเส้นเพื่อขยับจุดตัด, ดับเบิลคลิกที่ว่างเพื่อเพิ่มเส้นใหม่, คลิกเส้นแล้วกด Delete เพื่อเอาออก",
      "Drag a line to move a cut point, double-click an empty spot to add one, click a line and press Delete to remove it")));
  }

  function setBreak(i, v) {
    const d = decimalsIn(read.nums);
    breaks[i] = roundTo(v, Math.max(d, 0));
    breaks = cleanBreaks(breaks);
    customLabels = null;
    breaksIn.value = breaks.join(", ");
    refresh();
  }

  function startDrag(ev, i, svg, lo, hi, W, padL, padR) {
    ev.preventDefault();
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const ratio = (e.clientX - r.left) / r.width;
      const inner = (W - padL - padR) / W;
      const v = lo + ((ratio - padL / W) / inner) * (hi - lo);
      breaks[i] = Math.max(lo, Math.min(hi, v));
      drawChart();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setBreak(i, breaks[i]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── ตารางกลุ่ม ────────────────────────────────────────────────────────
  function renderGroups() {
    groupsBox.innerHTML = "";
    const dist = distribution(lastAssigned);
    const maxC = Math.max(1, ...dist.map((d) => d.count));
    const dec = decimalsIn(read.nums);
    const f = (x) => x === null ? "" : roundTo(x, dec).toLocaleString("en-US", { maximumFractionDigits: Math.max(dec, 0) });
    const tbl = el("table", { class: "nb-table nb-groups" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("ลำดับ", "Order")),
        el("th", {}, tr("กลุ่ม", "Group")),
        el("th", { class: "num" }, tr("กี่แถว", "Rows")),
        el("th", { class: "num" }, "%"),
        el("th", {}, ""),
        el("th", { class: "num" }, tr("ค่าจริงต่ำสุด", "Lowest actual")),
        el("th", { class: "num" }, tr("ค่าจริงสูงสุด", "Highest actual")),
      ])]),
      el("tbody", {}, dist.map((g) => el("tr", { class: g.sort === 0 ? "is-null" : "" }, [
        el("td", { class: "num" }, String(g.sort)),
        el("td", {}, [
          el("span", { class: "nb-glabel" }, g.label),
          g.locked ? el("span", { class: "nb-lockdot" }, tr(`ล็อกไว้ ${g.locked}`, `${g.locked} locked`)) : null,
          g.count === 0 ? el("span", { class: "nb-lockdot" }, tr("กลุ่มว่าง", "empty group")) : null,
        ]),
        el("td", { class: "num" }, g.count.toLocaleString()),
        el("td", { class: "num" }, g.pct.toFixed(1)),
        el("td", { style: "width:34%" }, [el("span", { class: "nb-barcell", style: `width:${(g.count / maxC) * 100}%` })]),
        el("td", { class: "num" }, f(g.min)),
        el("td", { class: "num" }, f(g.max)),
      ]))),
    ]);
    groupsBox.appendChild(tbl);
    const empties = dist.filter((g) => g.count === 0 && g.sort > 0).length;
    const big = dist.find((g) => g.sort > 0 && g.pct >= 70);
    const notes = [];
    if (empties) notes.push(tr(`มีกลุ่มที่ไม่มีแถวเลย ${empties} กลุ่ม ลองลดจำนวนกลุ่มหรือขยับจุดตัด`,
                               `${empties} ${pl(empties, "group", "groups")} came out empty. Try fewer groups or move the cut points`));
    if (big) notes.push(tr(`กลุ่ม ${big.label} กินไปแล้ว ${big.pct.toFixed(1)}% ของทั้งหมด ถ้าอยากให้กระจายกว่านี้ลองวิธีจำนวนเท่ากัน`,
                           `Group ${big.label} holds ${big.pct.toFixed(1)}% of every row. For a more even split try the equal-count method`));
    if (notes.length) groupsBox.appendChild(el("p", { class: "nb-chart-help" }, notes.join(" ")));
  }

  // ── ตัวอย่างผลลัพธ์รายแถว ─────────────────────────────────────────────
  function renderRows() {
    rowsBox.innerHTML = "";
    const dec = decimalsIn(read.nums);
    const bandCol = bandColIn.value.trim() || defaultBandName();
    const sortCol = sortColIn.value.trim() || defaultSortName();
    const locked = lastAssigned.rows.filter((r) => r.locked);
    const rest = lastAssigned.rows.filter((r) => !r.locked);
    const show = [...locked.slice(0, 10), ...rest.slice(0, MAX_PREVIEW - Math.min(10, locked.length))];
    rowsBox.appendChild(el("table", { class: "nb-table nb-rows" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("รายการ", "Row")),
        el("th", { class: "num" }, tr("ค่า", "Value")),
        el("th", {}, bandCol),
        el("th", { class: "num" }, sortCol),
      ])]),
      el("tbody", {}, show.map((r) => el("tr", { class: r.sort === 0 ? "is-null" : "" }, [
        el("td", {}, [
          document.createTextNode(String(r.key)),
          r.locked ? el("span", { class: "nb-tag", style: "margin-left:6px" }, tr("ล็อก", "locked")) : null,
        ]),
        el("td", { class: "num" }, r.num === null ? "" : roundTo(r.num, dec).toLocaleString("en-US", { maximumFractionDigits: Math.max(dec, 0) })),
        el("td", {}, r.band),
        el("td", { class: "num" }, String(r.sort)),
      ]))),
    ]));
    rowsBox.appendChild(el("p", { class: "nb-chart-help" }, tr(
      `แสดง ${show.length.toLocaleString()} แถวจาก ${lastAssigned.rows.length.toLocaleString()} แถว ไฟล์ที่ดาวน์โหลดจะได้ครบทุกแถว`,
      `Showing ${show.length.toLocaleString()} of ${pl(lastAssigned.rows.length.toLocaleString(), "row", "rows")}. The download has every row`)));
  }

  function defaultBandName() {
    const base = table && srcTabs.value === "file" ? (table.header[+colSel.value] || tr("ตัวเลข", "Value")) : tr("ตัวเลข", "Value");
    return base + " Band";
  }
  function defaultSortName() {
    return defaultBandName() + " Sort";
  }

  // ── โค้ดที่ก๊อปไปใช้ต่อ ────────────────────────────────────────────────
  function codeCfg() {
    const colName = table && srcTabs.value === "file" ? (table.header[+colSel.value] || "Value") : "Value";
    const keyCol = table && srcTabs.value === "file" && +keySel.value >= 0 ? table.header[+keySel.value] : null;
    return {
      column: colName,
      keyColumn: keyCol,
      breaks,
      labels: lastAssigned.labels,
      extras: lastAssigned.extras,
      nullLabel: currentCfg().nullLabel,
      overrides,
      bandColumn: bandColIn.value.trim() || null,
      sortColumn: sortColIn.value.trim() || null,
    };
  }

  function codeCard(title, code, lang, filename) {
    const pre = el("pre", { class: "nb-code" }, [el("code", { html: paintCode(code, lang) })]);
    const bar = el("div", { class: "nb-codebar" }, [
      button(tr("คัดลอกโค้ด", "Copy code"), {
        icon: "copy",
        onclick: async (e) => {
          try {
            await navigator.clipboard.writeText(code);
            const b = e.currentTarget || e.target;
            const old = b.textContent;
            b.textContent = tr("คัดลอกแล้ว", "Copied");
            setTimeout(() => { b.textContent = old; }, 1400);
          } catch { st.err(tr("คัดลอกไม่สำเร็จ ลองเลือกข้อความแล้วกด Ctrl+C", "Copy failed. Select the text and press Ctrl+C")); }
        },
      }),
      button(tr("บันทึกเป็นไฟล์", "Save as a file"), {
        ghost: true, icon: "download",
        onclick: () => download(new Blob([code], { type: "text/plain;charset=utf-8" }), filename),
      }),
    ]);
    return el("div", {}, [el("h3", { class: "nb-group-title" }, title), bar, pre]);
  }

  function renderCode() {
    if (!lastAssigned) return;
    const cfg = codeCfg();
    if (!codeBox.hidden) {
      codeBox.innerHTML = "";
      codeBox.appendChild(codeCard(tr("โค้ด Power Query วางใน Advanced Editor ได้เลย", "Power Query code, paste into the Advanced Editor"),
        genM(cfg), "m", "จัดกลุ่มตัวเลข.pq"));
      codeBox.appendChild(el("p", { class: "nb-chart-help" }, tr(
        "อย่าลืมตั้ง Sort by column ในโมเดล ให้คอลัมน์ป้ายใช้คอลัมน์เลขเรียง ไม่งั้นกราฟเรียงตามตัวอักษร",
        "One last step in the model: set Sort by column so the label column sorts by the number column, otherwise charts sort alphabetically")));
    }
    if (!sqlBox.hidden) {
      sqlBox.innerHTML = "";
      sqlBox.appendChild(codeCard("SQL Server", genSQL({ ...cfg, table: "dbo.YourTable" }), "sql", "จัดกลุ่มตัวเลข.sql"));
      sqlBox.appendChild(codeCard("DAX", genDAX({ ...cfg, table: "Table" }), "dax", "จัดกลุ่มตัวเลข.dax"));
    }
  }

  // ── ดาวน์โหลดผลลัพธ์ ──────────────────────────────────────────────────
  function save(kind) {
    if (!lastAssigned) return;
    const bandCol = bandColIn.value.trim() || defaultBandName();
    const sortCol = sortColIn.value.trim() || defaultSortName();
    let header, rows;
    if (table && srcTabs.value === "file") {
      header = [...table.header, bandCol, sortCol];
      rows = table.rows.map((r, i) => [...r, lastAssigned.rows[i].band, lastAssigned.rows[i].sort]);
    } else {
      header = [tr("ลำดับ", "No"), tr("ตัวเลข", "Value"), bandCol, sortCol];
      rows = lastAssigned.rows.map((r, i) => [i + 1, r.num, r.band, r.sort]);
    }
    const name = tr("จัดกลุ่มตัวเลข", "grouped-numbers");
    if (kind === "csv") {
      const esc = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
      download(new Blob([csv], { type: "text/csv;charset=utf-8" }), name + ".csv");
    } else {
      download(tableToBlob(header, rows, tr("จัดกลุ่ม", "Grouped")), name + ".xlsx");
    }
    st.ok(tr(`บันทึกแล้ว ${rows.length.toLocaleString()} แถว พร้อมคอลัมน์ป้ายและเลขเรียง`,
             `Saved ${rows.length.toLocaleString()} ${pl(rows.length, "row", "rows")} with the label and sort columns`));
  }

  function sw(labelText, checked, hint) {
    const input = el("input", { type: "checkbox", checked: checked || null });
    const row = el("div", { class: "nb-switch-field" }, [
      el("span", {}, labelText),
      el("span", { class: "nb-switch" }, [input, el("span", { class: "nb-track" })]),
    ]);
    const wrap = el("div", {}, [row, hint ? el("small", { class: "nb-hint" }, hint) : null]);
    return { wrap, input };
  }

  renderLocks();
  if (typeof ResizeObserver === "function") {
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      const w = Math.round(chartWrap.clientWidth || 0);
      if (!lastAssigned || !w || Math.abs(w - lastW) < 24) return;
      lastW = w;
      drawChart();
    });
    ro.observe(chartWrap);
  }
  return ws.wrap;
}
