import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { tr } from "../i18n.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { stateKit, SHARE_MSG } from "../statekit.js";
import { sqlId, sqlTable, sqlStr, stringAgg, coalesceText, DIALECTS, DIALECT_HINT, sqlHeader } from "../sqlgen.js";

/* ‼️ เครื่องนี้ "สร้างโค้ดเรียกใช้" ไม่ได้เขียนฟังก์ชันขึ้นใหม่
 * ตัว fnGroupConcat มีอยู่จริงและผ่านเทส 46/46 (Data/ADVANCE/fnGroupConcat.pq)
 * สิ่งที่คนพลาดที่สุดคือตัวเลือกที่ "อ้างชื่อคอลัมน์" (DistinctBy / SumColumns /
 * TotalColumns / FirstColumns) ต้องพิมพ์ชื่อซ้ำให้ตรงกับที่ต่อไว้เป๊ะ พิมพ์ผิดตัวเดียว
 * ฟังก์ชันฟ้องว่าไม่พบคอลัมน์ เครื่องนี้จึงทำเป็นติ๊กจากรายการที่กรอกไว้แล้ว ไม่ต้องพิมพ์ซ้ำ
 *
 * ‼️ กับดักที่ต้องเตือนตั้งแต่ตอนออกแบบหน้า (บทเรียน 14/09/2026 พี่ปอนด์จับได้จากข้อมูลจริง)
 * ต่อหลายคอลัมน์พร้อมกันแล้วสั่งทิ้งค่าว่าง = สมาชิกแต่ละคอลัมน์ไม่เท่ากัน ตำแหน่งเลื่อนเงียบ
 */

const M_KEYWORDS = new Set([
  "and", "as", "each", "else", "error", "false", "if", "in", "is", "let", "meta",
  "not", "otherwise", "or", "section", "shared", "then", "true", "try", "type",
]);

const FN_URL = "samples/powerquery/fnGroupConcat.pq";

const STYLE = `
.pqg-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(62vh,600px)}
.pqg-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre}
/* ‼️ บรรทัด T-SQL ยาวโดยธรรมชาติ ตัดเป็นพารามิเตอร์ทีละบรรทัดแบบภาษา M ไม่ได้
   แต่ SQL ไม่แคร์ช่องว่าง จึงให้กล่องตัดบรรทัดเองเฉพาะโหมดนี้ อ่านครบโดยไม่ต้องลากแนวนอน
   คัดลอกยังได้ต้นฉบับเป๊ะเพราะ textContent ไม่เปลี่ยน (เทส browser_pqgen ข้อ ④ข เฝ้าอยู่) */
.pqg-code.is-sql code{white-space:pre-wrap;word-break:break-word}
.pqg-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}

.pqg-list{display:flex;flex-direction:column;gap:7px}
.pqg-item{display:flex;align-items:center;gap:6px}
.pqg-item input[type=text]{flex:1;min-width:0}
.pqg-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px;flex:none}
.pqg-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pqg-mini:disabled{opacity:.35;cursor:default}
.pqg-mini.danger:hover:not(:disabled){border-color:var(--err);color:var(--err)}
/* นิ้วแตะต้องการ 36x36 (WCAG 2.5.8) ขยายเฉพาะอุปกรณ์สัมผัส เมาส์คงขนาดกระชับ */
@media (pointer:coarse){ .pqg-mini{width:36px;height:36px} }

.pqg-hint{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 0 0}
.pqg-add{margin-top:6px}
.pqg-none{font-size:12px;color:var(--text-mute);line-height:1.7;margin:0;padding:8px 10px;
  border:1px dashed var(--line);border-radius:var(--r-sm)}

/* ชิปติ๊ก: เลือกคอลัมน์จากที่กรอกไว้แล้ว ไม่ต้องพิมพ์ชื่อซ้ำ */
.pqg-chips{display:flex;flex-wrap:wrap;gap:6px}
.pqg-chip{position:relative;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;
  border:1px solid var(--line);border-radius:999px;background:var(--bg-soft);cursor:pointer;
  font-size:12.5px;color:var(--text-mute);line-height:1.5;min-height:32px}
.pqg-chip input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%}
.pqg-chip:hover{border-color:var(--g-powerbi,var(--brand))}
.pqg-chip:has(input:checked){border-color:var(--g-powerbi,var(--brand));color:var(--text);
  background:color-mix(in srgb, var(--g-powerbi,var(--brand)) 12%, transparent)}
.pqg-chip:has(input:focus-visible){outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){ .pqg-chip{min-height:36px} }

.pqg-sect{margin:18px 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--text-mute)}
.pqg-sect:first-child{margin-top:0}

.pqg-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}
.pqg-warn b{color:var(--err)}

/* ตารางเล็กเทียบผลของตัวเลือกค่าว่าง ให้เห็นด้วยตาว่าต่างกันยังไงก่อนเลือก */
.pqg-demo{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  padding:10px 12px;margin-top:8px;font-size:12px;line-height:1.8;color:var(--text-mute)}
.pqg-demo code{font-size:11.5px;color:var(--text);word-break:break-word}

${PRESETS_CSS}
` + CODE_TOKEN_CSS;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  // ‼️ ค่าตั้งต้นต้องเปลี่ยนตามภาษาด้วย ไม่งั้นโหมดอังกฤษได้ตัวอย่างไทยล้วน
  //    (บทเรียนจาก browser_lang.py 11/09) สลับภาษา = โหลดหน้าใหม่ ค่าจึงคงที่ตลอดอายุหน้า
  const SEED = () => ({
    query: tr("ตารางสัญญา", "Contracts"),
    groupBy: [tr("รหัสสถานี", "Site ID")],
    concat: [
      { name: tr("สถานะสัญญา", "Status"), distinct: false, sum: false, total: false },
      { name: tr("เงิน", "Amount"), distinct: false, sum: false, total: false },
    ],
    first: [],
    sort: { column: "", desc: true },
    opt: {
      separator: ", ",
      nullMode: "text",          // text = แสดงข้อความแทน · blank = ช่องว่าง · drop = ทิ้ง
      nullText: tr("(ว่าง)", "(blank)"),
      numberFormat: "",
      dateFormat: "",
      countColumn: "",
      distinctCountColumn: "",
      dialect: "modern",
    },
  });

  /* ชุดพร้อมใช้ = "รูปแบบการใช้งาน" ไม่ใช่หน้าตา เพราะสิ่งที่คนติดคือไม่รู้ว่า
     สถานการณ์ของตัวเองควรเปิดตัวเลือกไหนบ้าง */
  const PRESETS = [
    { id: "plain", name: tr("เห็นทุกแถว", "Every row"),
      desc: tr("ต่อกันทุกแถวตามเดิม ไม่ยุบอะไรเลย เหมาะกับตอนอยากเห็นของทั้งหมดก่อน",
               "Join every row as is, nothing collapsed, good for a first look"),
      values: "plain" },
    { id: "sum", name: tr("ยุบซ้ำแล้วบวกเงิน", "Collapse and add up"),
      desc: tr("สถานะซ้ำยุบเหลือค่าเดียว แล้วเงินของสถานะเดียวกันบวกรวมกัน",
               "Repeated statuses collapse into one and their amounts are added together"),
      values: "sum" },
    { id: "full", name: tr("สรุปพร้อมยอดรวม", "Summary with totals"),
      desc: tr("เพิ่มยอดรวมทั้งกลุ่มเป็นตัวเลขจริง กับตัวนับจำนวนสัญญา ไว้คิดต่อใน DAX",
               "Adds a real numeric total for the group and a contract counter for DAX to use"),
      values: "full" },
  ];

  const seed = SEED();
  let query = seed.query;
  let groupBy = seed.groupBy;
  let concat = seed.concat;
  let first = seed.first;
  const sort = seed.sort;
  const opt = seed.opt;
  let view = "query";
  let fnText = null;

  /* ‼️ const ไม่ hoist ต้องประกาศก่อนโค้ดที่สร้างแผง ไม่ใช่ใต้มัน */
  const presets = presetBar(PRESETS, applyPreset);
  const state = stateKit(tool.id, {
    defaults: SEED(),
    collect: () => ({ query, groupBy, concat, first, sort: { ...sort }, opt: { ...opt } }),
    apply: (v) => {
      if (typeof v.query === "string") query = v.query;
      if (Array.isArray(v.groupBy)) groupBy = v.groupBy;
      if (Array.isArray(v.concat)) concat = v.concat;
      if (Array.isArray(v.first)) first = v.first;
      if (v.sort) Object.assign(sort, v.sort);
      if (v.opt) Object.assign(opt, v.opt);
    },
  });

  const codeEl = el("code", {});
  const warnEl = el("div", { class: "pqg-warn", hidden: true });
  const tabQuery = button(tr("คิวรีที่ได้", "Generated query"), { onclick: () => setView("query") });
  const tabFn = button(tr("ตัวฟังก์ชัน", "The function"), { ghost: true, onclick: () => setView("fn") });
  const tabSql = button("T-SQL", { ghost: true, onclick: () => setView("sql") });
  const centerNode = el("div", {}, [
    el("div", { class: "pqg-tabs" }, [tabQuery, tabFn, tabSql]),
    warnEl,
    el("pre", { class: "pqg-code" }, [codeEl]),
  ]);

  /* ── แผงซ้าย: ตารางและคอลัมน์ ─────────────────────────────────── */
  const groupListEl = el("div", { class: "pqg-list" });
  const concatListEl = el("div", { class: "pqg-list" });
  const queryInput = el("input", { type: "text" });
  queryInput.value = query;
  queryInput.addEventListener("input", () => { query = queryInput.value; render(); });

  const leftBody = el("div", {}, [
    field(tr("ชื่อคิวรีตารางต้นทาง", "Source query name"), queryInput,
      tr("ชื่อที่เห็นในบานหน้าต่างคิวรีทางซ้ายของ Power Query",
         "The name shown in the Queries pane on the left of Power Query")),

    el("h3", { class: "pqg-sect" }, tr("คอลัมน์ที่ใช้จัดกลุ่ม", "Group by these columns")),
    el("p", { class: "pqg-hint" }, tr(
      "หนึ่งกลุ่มจะเหลือแถวเดียว ใส่ได้หลายคอลัมน์ถ้าต้องแยกละเอียดกว่านั้น",
      "Each group collapses to a single row. Add more columns when you need a finer split"
    )),
    groupListEl,
    el("div", { class: "pqg-add" }, [
      button(tr("เพิ่มคอลัมน์จัดกลุ่ม", "Add a group column"), { icon: "plus", ghost: true, onclick: () => { groupBy.push(""); buildGroup(); render(); } }),
    ]),

    el("h3", { class: "pqg-sect" }, tr("คอลัมน์ที่จะเอามาต่อกัน", "Columns to join together")),
    el("p", { class: "pqg-hint" }, tr(
      "ค่าของทุกแถวในกลุ่มจะถูกต่อเป็นข้อความเดียว คั่นตามตัวคั่นที่ตั้งไว้",
      "Every row in the group is joined into one text value using the separator you set"
    )),
    concatListEl,
    el("div", { class: "pqg-add" }, [
      button(tr("เพิ่มคอลัมน์ที่จะต่อ", "Add a column to join"), { icon: "plus", ghost: true, onclick: addConcat }),
    ]),
  ]);

  /* ── แผงขวา: ตัวเลือกทั้งหมด ──────────────────────────────────── */
  const distinctChipsEl = el("div", { class: "pqg-chips" });
  const sumChipsEl = el("div", { class: "pqg-chips" });
  const totalChipsEl = el("div", { class: "pqg-chips" });
  const firstListEl = el("div", { class: "pqg-list" });
  const sortWrapEl = el("div", {});
  const nullWrapEl = el("div", {});
  const miscWrapEl = el("div", {});

  const rightBody = el("div", {}, [
    presets.node,

    el("h3", { class: "pqg-sect" }, tr("ยุบค่าที่ซ้ำกัน", "Collapse repeated values")),
    el("p", { class: "pqg-hint" }, tr(
      "ติ๊กคอลัมน์ที่ค่าซ้ำแล้วอยากให้เหลือค่าเดียว ไม่ติ๊กเลยคือเห็นครบทุกแถว",
      "Tick the columns whose repeats should collapse into one. Tick nothing to keep every row"
    )),
    distinctChipsEl,

    el("h3", { class: "pqg-sect" }, tr("ตัวเลขที่ให้บวกกันตอนยุบ", "Numbers to add up when collapsing")),
    el("p", { class: "pqg-hint" }, tr(
      "เมื่อหลายแถวถูกยุบเป็นแถวเดียว ตัวเลขในคอลัมน์ที่ติ๊กจะบวกกัน ไม่ติ๊กคือเอาค่าของแถวแรก",
      "When rows collapse, ticked number columns are added together. Unticked ones keep the first row's value"
    )),
    sumChipsEl,

    el("h3", { class: "pqg-sect" }, tr("ค่าว่างในคอลัมน์", "Blank values")),
    nullWrapEl,

    el("h3", { class: "pqg-sect" }, tr("เรียงลำดับก่อนต่อ", "Sort before joining")),
    sortWrapEl,

    el("h3", { class: "pqg-sect" }, tr("คอลัมน์เสริมที่อยากได้เพิ่ม", "Extra columns to add")),
    el("p", { class: "pqg-hint" }, tr(
      "ยอดรวมทั้งกลุ่มออกมาเป็นตัวเลขจริง เอาไปคำนวณต่อใน DAX ได้เลย ไม่ใช่ข้อความ",
      "The group total comes out as a real number that DAX can keep calculating with, not text"
    )),
    totalChipsEl,
    miscWrapEl,

    el("h3", { class: "pqg-sect" }, tr("คอลัมน์ที่เอาแค่ค่าแถวแรก", "Columns that keep the first row only")),
    el("p", { class: "pqg-hint" }, tr(
      "เหมาะกับค่าที่เหมือนกันทั้งกลุ่มอยู่แล้ว เช่น ชื่อเจ้าของไซต์ ไม่ต้องเอามาต่อซ้ำ",
      "Good for values that are the same across the whole group, like the site owner, no need to repeat them"
    )),
    firstListEl,
    el("div", { class: "pqg-add" }, [
      button(tr("เพิ่มคอลัมน์แถวแรก", "Add a first-row column"), { icon: "plus", ghost: true, onclick: () => { first.push(""); buildFirst(); render(); } }),
    ]),
  ]);

  const copyBtn = button(tr("คัดลอกโค้ด", "Copy code"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .pq", "Download .pq"), { icon: "download", ghost: true, onclick: onDownload });
  /* ป้ายปุ่มต้องบอกนามสกุลที่จะได้จริง ไม่งั้นกดที่แท็บ T-SQL แล้วได้ .sql ทั้งที่ปุ่มเขียน .pq */
  function syncDlLabel() {
    const span = dlBtn.querySelector("span") || dlBtn;
    span.textContent = view === "sql"
      ? tr("ดาวน์โหลด .sql", "Download .sql")
      : tr("ดาวน์โหลด .pq", "Download .pq");
  }
  const shareBtn = button(tr("คัดลอกลิงก์ค่านี้", "Copy a link to these settings"), { icon: "copy", ghost: true, onclick: onShare });
  const resetBtn = button(tr("คืนค่าเริ่มต้น", "Reset to defaults"), { icon: "undo", ghost: true, onclick: onReset });

  const ws = workspace(tool, {
    left: {
      title: tr("ตารางและคอลัมน์", "Table & columns"), node: leftBody,
      hint: tr("ใส่ชื่อให้ตรงกับที่มีอยู่จริงในไฟล์ของคุณ ตัวพิมพ์ใหญ่เล็กต้องตรงด้วย",
               "Use the names exactly as they appear in your own file, letter case included"),
    },
    center: { title: tr("โค้ด Power Query", "Power Query code"), node: centerNode },
    right: { title: tr("ตัวเลือก", "Options"), node: rightBody },
    footer: [copyBtn, dlBtn, shareBtn, resetBtn, st.node],
    note: tr(
      "วางในคิวรีเปล่าผ่าน Advanced Editor ไฟล์ต้องมีคิวรี fnGroupConcat ด้วย",
      "Paste into a blank query via the Advanced Editor. The file also needs a query named fnGroupConcat"
    ),
  });
  ws.wrap.prepend(styleEl);
  ws.showCanvas(true);

  const restored = state.restore();
  rebuildAll();
  if (restored) {
    st.ok(state.hasLink()
      ? tr("เปิดด้วยค่าที่มากับลิงก์", "Opened with the settings from the link")
      : tr("ใช้ค่าที่คุณตั้งไว้ครั้งก่อน", "Using the settings you had last time"));
    state.dropLinkParam();
  }

  return ws.wrap;

  /* ── ตัวช่วยสร้างช่องกรอกรายการชื่อคอลัมน์ ─────────────────────── */
  function miniBtn(label, title, onclick, danger) {
    const b = el("button", { class: "pqg-mini" + (danger ? " danger" : ""), type: "button", title, "aria-label": title });
    b.textContent = label;
    b.addEventListener("click", onclick);
    return b;
  }

  function listRow(arr, i, onChange, placeholder) {
    const inp = el("input", { type: "text", placeholder });
    inp.value = arr[i] ?? "";
    inp.addEventListener("input", () => { arr[i] = inp.value; onChange(); });
    const del = miniBtn("×", tr("เอาออก", "Remove"), () => { arr.splice(i, 1); onChange(true); }, true);
    del.disabled = arr.length <= 1 && arr === groupBy;
    return el("div", { class: "pqg-item" }, [inp, del]);
  }

  function buildGroup() {
    groupListEl.innerHTML = "";
    groupBy.forEach((_, i) => groupListEl.appendChild(
      listRow(groupBy, i, (rebuild) => { if (rebuild) buildGroup(); render(); }, tr("ชื่อคอลัมน์", "Column name"))
    ));
  }

  function buildConcat() {
    concatListEl.innerHTML = "";
    concat.forEach((c, i) => {
      const inp = el("input", { type: "text", placeholder: tr("ชื่อคอลัมน์", "Column name") });
      inp.value = c.name;
      inp.addEventListener("input", () => { c.name = inp.value; buildChips(); render(); });
      const del = miniBtn("×", tr("เอาออก", "Remove"), () => {
        concat.splice(i, 1); buildConcat(); buildChips(); render();
      }, true);
      del.disabled = concat.length <= 1;
      concatListEl.appendChild(el("div", { class: "pqg-item" }, [inp, del]));
    });
  }

  function addConcat() {
    concat.push({ name: "", distinct: false, sum: false, total: false });
    buildConcat(); buildChips(); render();
  }

  function buildFirst() {
    firstListEl.innerHTML = "";
    if (!first.length) {
      firstListEl.appendChild(el("p", { class: "pqg-none" }, tr("ยังไม่ได้เพิ่ม", "None added yet")));
      return;
    }
    first.forEach((_, i) => firstListEl.appendChild(
      listRow(first, i, (rebuild) => { if (rebuild) buildFirst(); render(); }, tr("ชื่อคอลัมน์", "Column name"))
    ));
  }

  /* ‼️ หัวใจของความ dynamic: ตัวเลือกที่อ้างชื่อคอลัมน์ไม่ให้พิมพ์เอง
     แต่ติ๊กจากรายการที่กรอกไว้แล้ว พิมพ์ผิดจึงเป็นไปไม่ได้ */
  function chips(container, flag, emptyText) {
    container.innerHTML = "";
    const named = concat.filter((c) => c.name.trim());
    if (!named.length) {
      container.appendChild(el("p", { class: "pqg-none" }, emptyText));
      return;
    }
    named.forEach((c) => {
      const box = el("input", { type: "checkbox" });
      box.checked = !!c[flag];
      box.addEventListener("change", () => { c[flag] = box.checked; render(); });
      const chip = el("label", { class: "pqg-chip" }, [box, el("span", {}, c.name)]);
      container.appendChild(chip);
    });
  }

  function buildChips() {
    chips(distinctChipsEl, "distinct", tr("ใส่ชื่อคอลัมน์ที่จะต่อก่อน แล้วค่อยกลับมาติ๊ก", "Name a column to join first, then come back and tick it"));
    chips(sumChipsEl, "sum", tr("ใส่ชื่อคอลัมน์ที่จะต่อก่อน แล้วค่อยกลับมาติ๊ก", "Name a column to join first, then come back and tick it"));
    chips(totalChipsEl, "total", tr("ใส่ชื่อคอลัมน์ที่จะต่อก่อน แล้วค่อยกลับมาติ๊ก", "Name a column to join first, then come back and tick it"));
  }

  /* ── ตัวเลือกค่าว่าง พร้อมตัวอย่างให้เห็นด้วยตาก่อนเลือก ───────── */
  function buildNull() {
    nullWrapEl.innerHTML = "";
    const modeSel = select([
      ["text", tr("แสดงเป็นข้อความแทน", "Show a placeholder")],
      ["blank", tr("เว้นเป็นช่องว่าง", "Leave an empty gap")],
      ["drop", tr("ทิ้งไปเลย", "Drop it entirely")],
    ], opt.nullMode);
    modeSel.addEventListener("change", () => { opt.nullMode = modeSel.value; buildNull(); render(); });

    const textInp = el("input", { type: "text" });
    textInp.value = opt.nullText;
    textInp.addEventListener("input", () => { opt.nullText = textInp.value; render(); });

    nullWrapEl.append(
      field(tr("แถวที่คอลัมน์นั้นว่าง ให้ทำยังไง", "What to do when a column is blank in a row"), modeSel),
    );
    if (opt.nullMode === "text") {
      nullWrapEl.append(field(tr("ข้อความแทนค่าว่าง", "Placeholder text"), textInp));
    }

    // ตัวอย่างจริงจากข้อมูลที่ทำให้เจอบั๊กนี้ ให้เห็นว่าแต่ละแบบได้อะไร
    const demo = opt.nullMode === "drop"
      ? { s: "Active, Active, Active", m: "800, 800, 900, 1100" }
      : opt.nullMode === "blank"
        ? { s: "Active, , Active, Active", m: "800, 800, 900, 1100" }
        : { s: `Active, ${opt.nullText || "(?)"}, Active, Active`, m: "800, 800, 900, 1100" };
    nullWrapEl.append(el("div", { class: "pqg-demo" }, [
      el("div", {}, tr("ถ้าสถานะของแถวที่สองว่าง จะได้แบบนี้", "If the second row has no status, you get this")),
      el("div", {}, [el("code", {}, demo.s)]),
      el("div", {}, [el("code", {}, demo.m)]),
      el("div", {}, opt.nullMode === "drop"
        ? tr("สังเกตว่าสถานะเหลือ 3 ตัวแต่เงินมี 4 ตัว อ่านคู่กันไม่ได้แล้ว",
             "Notice the status has 3 items but the amount has 4, they no longer line up")
        : tr("สถานะกับเงินมีจำนวนเท่ากัน อ่านคู่กันได้ทีละตัว",
             "Status and amount have the same count, so they can be read side by side")),
    ]));
  }

  function buildSort() {
    sortWrapEl.innerHTML = "";
    const named = concat.map((c) => c.name.trim()).filter(Boolean);
    const colSel = select(
      [["", tr("ไม่เรียง ใช้ลำดับเดิมของตาราง", "Don't sort, keep the table's own order")]]
        .concat(named.map((n) => [n, n])),
      named.includes(sort.column) ? sort.column : ""
    );
    colSel.addEventListener("change", () => { sort.column = colSel.value; buildSort(); render(); });
    sortWrapEl.append(field(tr("เรียงตามคอลัมน์", "Sort by column"), colSel));

    if (sort.column) {
      const dirSel = select([
        ["desc", tr("มากไปน้อย ใหม่สุดขึ้นก่อน", "Largest first, newest on top")],
        ["asc", tr("น้อยไปมาก เก่าสุดขึ้นก่อน", "Smallest first, oldest on top")],
      ], sort.desc ? "desc" : "asc");
      dirSel.addEventListener("change", () => { sort.desc = dirSel.value === "desc"; render(); });
      sortWrapEl.append(field(tr("ทิศทาง", "Direction"), dirSel));
    }
  }

  function buildMisc() {
    miscWrapEl.innerHTML = "";
    const mk = (key, label, hint, placeholder) => {
      const inp = el("input", { type: "text", placeholder: placeholder || "" });
      inp.value = opt[key];
      inp.addEventListener("input", () => { opt[key] = inp.value; render(); });
      return field(label, inp, hint);
    };
    miscWrapEl.append(
      mk("countColumn", tr("ชื่อคอลัมน์นับจำนวนแถวเดิม", "Name for the original row counter"),
         tr("เว้นว่างถ้าไม่ต้องการ", "Leave empty to skip"), tr("เช่น จำนวนสัญญา", "e.g. Contracts")),
      mk("distinctCountColumn", tr("ชื่อคอลัมน์นับจำนวนหลังยุบ", "Name for the collapsed counter"),
         tr("เว้นว่างถ้าไม่ต้องการ", "Leave empty to skip"), tr("เช่น จำนวนสถานะ", "e.g. Statuses")),
      mk("separator", tr("ตัวคั่นระหว่างค่า", "Separator between values"),
         tr("ค่าเริ่มต้นคือจุลภาคตามด้วยเว้นวรรค", "The default is a comma followed by a space")),
      mk("numberFormat", tr("รูปแบบตัวเลข", "Number format"),
         tr("เว้นว่าง = ตามค่าเดิม ใส่ #,0 เพื่อใส่ลูกน้ำคั่นหลักพัน", "Empty keeps it as is, use #,0 for thousand separators"), "#,0"),
      mk("dateFormat", tr("รูปแบบวันที่", "Date format"),
         tr("เว้นว่าง = dd/MM/yyyy", "Empty means dd/MM/yyyy"), "dd/MM/yyyy"),
    );
    // รุ่นของเซิร์ฟเวอร์มีผลกับแท็บ T-SQL เท่านั้น จึงวางไว้ท้ายสุดและบอกให้ชัด
    const dia = select(DIALECTS(), opt.dialect);
    dia.addEventListener("change", () => { opt.dialect = dia.value; buildMisc(); render(); });
    miscWrapEl.append(field(tr("รุ่นของ SQL Server (ใช้กับแท็บ T-SQL)", "SQL Server version (for the T-SQL tab)"),
      dia, DIALECT_HINT(opt.dialect)));
  }

  function rebuildAll() {
    buildGroup(); buildConcat(); buildChips(); buildFirst();
    buildNull(); buildSort(); buildMisc(); render();
  }

  /* ── ตัวช่วยเขียน M ให้ถูกไวยากรณ์เสมอ ───────────────────────── */
  function mId(name) {
    const s = String(name ?? "");
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !M_KEYWORDS.has(s) ? s : `#"${s.replace(/"/g, '""')}"`;
  }
  function mStr(s) { return `"${String(s ?? "").replace(/"/g, '""')}"`; }
  function mList(arr) { return `{${arr.map(mStr).join(", ")}}`; }

  function buildQuery() {
    const groups = groupBy.map((g) => g.trim()).filter(Boolean);
    const cols = concat.map((c) => c.name.trim()).filter(Boolean);
    const named = concat.filter((c) => c.name.trim());
    const picked = (flag) => named.filter((c) => c[flag]).map((c) => c.name.trim());

    const pairs = [];
    const distinctBy = picked("distinct");
    const sumCols = picked("sum");
    const totalCols = picked("total");
    const firstCols = first.map((f) => f.trim()).filter(Boolean);

    if (distinctBy.length) pairs.push(`DistinctBy = ${mList(distinctBy)}`);
    if (sumCols.length) pairs.push(`SumColumns = ${mList(sumCols)}`);
    if (opt.separator !== ", ") pairs.push(`Separator = ${mStr(opt.separator)}`);
    if (sort.column.trim()) {
      pairs.push(`SortBy = {{${mStr(sort.column.trim())}, ${sort.desc ? "Order.Descending" : "Order.Ascending"}}}`);
    }
    if (totalCols.length) pairs.push(`TotalColumns = ${mList(totalCols)}`);
    if (opt.countColumn.trim()) pairs.push(`CountColumn = ${mStr(opt.countColumn.trim())}`);
    if (opt.distinctCountColumn.trim()) pairs.push(`DistinctCountColumn = ${mStr(opt.distinctCountColumn.trim())}`);
    if (firstCols.length) pairs.push(`FirstColumns = ${mList(firstCols)}`);
    if (opt.numberFormat.trim()) pairs.push(`NumberFormat = ${mStr(opt.numberFormat.trim())}`);
    if (opt.dateFormat.trim()) pairs.push(`DateFormat = ${mStr(opt.dateFormat.trim())}`);
    // ค่าเริ่มต้นของฟังก์ชันคือ "(ว่าง)" อยู่แล้ว ส่งไปซ้ำก็ได้ผลเท่ากัน จึงส่งเฉพาะที่ต่างออกไป
    if (opt.nullMode === "drop") pairs.push("NullText = null");
    else if (opt.nullMode === "blank") pairs.push('NullText = ""');
    else if (opt.nullText !== tr("(ว่าง)", "(blank)")) pairs.push(`NullText = ${mStr(opt.nullText)}`);

    /* ‼️ กล่องโค้ดกว้างจำกัด บรรทัดยาวกว่านั้นผู้ใช้ต้องลากแนวนอนถึงจะอ่านจบ
       เกณฑ์ 60 ตัวอักษรมาจากการวัดของจริงบนจอ 1280px (กล่อง 460px หาร monospace 7.53px
       = 61 ตัว) ไม่ใช่ตัวเลขที่เดาเอา รอบแรกเดาไว้ 78 แล้วเห็นกับตาว่ายังล้น
       สั้นกว่าเกณฑ์ก็ปล่อยไว้บรรทัดเดียว อ่านง่ายกว่าหักทุกครั้ง */
    const stepName = mId(tr("ยุบเหลือแถวเดียว", "Collapsed"));
    const args = [mId(query), mList(groups), mList(cols)];
    const optInline = pairs.length ? `[ ${pairs.join(", ")} ]` : "";
    const oneLine = `    ${stepName} = fnGroupConcat(${args.concat(optInline ? [optInline] : []).join(", ")})`;

    const call = oneLine.length <= 60 ? oneLine : [
      `    ${stepName} = fnGroupConcat(`,
      ...args.map((a) => `        ${a},`),
      ...(pairs.length ? [`        [ ${pairs.join(",\n          ")} ]`] : []),
      "    )",
    ].join("\n").replace(/,\n    \)$/, "\n    )");

    return [
      "let",
      tr("    // ยุบหลายแถวเหลือแถวเดียวต่อกลุ่ม",
         "    // One row per group, other columns joined"),
      call,
      "in",
      `    ${stepName}`,
    ].join("\n");
  }

  /* ── ท่าเดียวกันในภาษา T-SQL ────────────────────────────────────
     ‼️ พิสูจน์กับ SQL Server 2022 จริงแล้ว 14/09 สองอย่างที่ทำให้ผลต่างจาก Power Query
     ① STRING_AGG ข้ามค่าว่างให้เอง ต้องห่อ COALESCE ไม่งั้นจำนวนสมาชิกไม่เท่ากัน
     ② ไม่สั่ง ORDER BY แล้วลำดับไม่แน่นอน ของจริงเคยคืนกลับด้านกับฝั่ง M */
  function buildSql() {
    const groups = groupBy.map((g) => g.trim()).filter(Boolean);
    const named = concat.filter((c) => c.name.trim());
    const picked = (flag) => named.filter((c) => c[flag]).map((c) => c.name.trim());
    const distinctBy = picked("distinct");
    const sumCols = picked("sum");
    const totalCols = picked("total");
    const firstCols = first.map((f) => f.trim()).filter(Boolean);
    const nullText = opt.nullMode === "drop" ? null : (opt.nullMode === "blank" ? "" : opt.nullText);
    const sep = opt.separator || ", ";
    const table = sqlTable(query);
    const useCte = distinctBy.length > 0;
    const src = useCte ? sqlId(tr("ยุบซ้ำแล้ว", "Collapsed")) : table;

    if (!groups.length || !named.length) {
      return sqlHeader(tr("ยังกรอกไม่ครบ", "Not enough information yet"));
    }

    /* ‼️ ตัวเลขชนิด decimal ติดทศนิยมมาด้วย (ของจริงได้ 800.00 ส่วน Power Query ได้ 800)
       แก้ด้วย FORMAT ได้ แต่ **ห้ามห่อคอลัมน์ข้อความ** ของจริงฟ้องทันทีว่า
       "Argument data type nvarchar is invalid for argument 1 of format function" (ยิงจริงแล้ว 14/09)
       คอลัมน์ที่ผู้ใช้ติ๊กว่าให้บวกหรือให้หายอดรวม = ยืนยันแล้วว่าเป็นตัวเลข ห่อเฉพาะพวกนั้น */
    const numeric = new Set([...sumCols, ...totalCols]);
    const textOf = (c) => {
      const id = sqlId(c);
      return opt.numberFormat.trim() && numeric.has(c)
        ? `FORMAT(${id}, ${sqlStr(opt.numberFormat.trim())})`
        : id;
    };
    /* ‼️ สองข้อนี้ยิงจริงบน SQL Server 2022 แล้วถึงรู้ (14/09)
       ① SQL ไม่มีลำดับแถวโดยธรรมชาติ ไม่สั่ง ORDER BY แล้วลำดับไม่แน่นอน
          ของจริงเคยคืนกลับด้านกับ Power Query จึงต้องสั่งเสมอ
       ② STRING_AGG หลายตัวใน SELECT เดียวกัน **ต้องเรียงด้วยคีย์เดียวกันทั้งหมด**
          เรียงคนละคอลัมน์แล้วฟ้องทันทีว่า "Multiple ordered aggregate functions in the
          same scope have mutually incompatible orderings" จึงคำนวณคีย์เรียงครั้งเดียวใช้ร่วมกัน */
    /* ‼️ คีย์เรียงต้องเป็น "ชื่อคอลัมน์ล้วน" เท่านั้น ใส่นิพจน์ไม่ได้เลย
       ยิงจริงทั้ง 4 แบบแล้ว: 2 ตัวเรียงด้วยคอลัมน์เดียวกันผ่าน, 1 ตัวเรียงด้วย CASE ผ่าน,
       แต่ 2 ตัวเรียงด้วย CASE หรือ COALESCE เหมือนกันทุกตัวอักษรกลับฟ้อง
       "mutually incompatible orderings" ทั้งคู่ จึงห้ามฉลาดเกินตรงนี้ */
    const orderKey = sqlId(sort.column.trim() || named[0].name.trim())
      + (sort.column.trim() && sort.desc ? " DESC" : "");
    const aggOf = (c) => stringAgg({
      expr: coalesceText(`CAST(${textOf(c)} AS nvarchar(MAX))`, nullText),
      sep,
      orderBy: orderKey,
      dialect: opt.dialect,
      from: table,
      where: groups.map((g) => `x.${sqlId(g)} = ${sqlId(g)}`).join(" AND "),
    });

    const lines = [sqlHeader(tr("ยุบหลายแถวเหลือแถวเดียวต่อกลุ่ม", "Collapse many rows into one per group"))];

    if (useCte) {
      // ‼️ ตัวนับ "แถวเดิม" ต้องนับในชั้นนี้แล้วบวกข้างนอก ไม่งั้นจะได้จำนวนกลุ่มหลังยุบแทน
      const inner = groups.concat(distinctBy).map(sqlId);
      const aggs = sumCols.map((c) => `SUM(${sqlId(c)}) AS ${sqlId(c)}`);
      const others = named.map((c) => c.name.trim())
        .filter((c) => !distinctBy.includes(c) && !sumCols.includes(c))
        .map((c) => `MIN(${sqlId(c)}) AS ${sqlId(c)}`);
      const firsts = firstCols.map((c) => `MIN(${sqlId(c)}) AS ${sqlId(c)}`);
      lines.push(`WITH ${sqlId(tr("ยุบซ้ำแล้ว", "Collapsed"))} AS (`);
      lines.push(`    SELECT ${inner.join(", ")},`);
      lines.push(`           ${aggs.concat(others, firsts, [`COUNT(*) AS ${sqlId("__rows")}`]).join(",\n           ")}`);
      lines.push(`    FROM ${table}`);
      lines.push(`    GROUP BY ${inner.join(", ")}`);
      lines.push(")");
    }

    const cols = [];
    groups.forEach((g) => cols.push(sqlId(g)));
    named.forEach((c) => {
      const n = c.name.trim();
      cols.push(`${aggOf(n)} AS ${sqlId(n)}`);
    });
    totalCols.forEach((c) => cols.push(`SUM(${sqlId(c)}) AS ${sqlId(tr("รวม ", "Total ") + c)}`));
    if (opt.countColumn.trim()) {
      cols.push(`${useCte ? `SUM(${sqlId("__rows")})` : "COUNT(*)"} AS ${sqlId(opt.countColumn.trim())}`);
    }
    if (opt.distinctCountColumn.trim()) cols.push(`COUNT(*) AS ${sqlId(opt.distinctCountColumn.trim())}`);
    firstCols.forEach((c) => cols.push(`MIN(${sqlId(c)}) AS ${sqlId(c)}`));

    lines.push("SELECT");
    lines.push("    " + cols.join(",\n    "));
    lines.push(`FROM ${useCte ? sqlId(tr("ยุบซ้ำแล้ว", "Collapsed")) : table}`);
    lines.push(`GROUP BY ${groups.map(sqlId).join(", ")};`);
    return lines.join("\n");
  }

  /* ‼️ จับสิ่งที่ทำให้คิวรีพังหรือได้ผลผิดแบบเงียบ ให้เห็นตั้งแต่ยังไม่ได้เอาไปวาง */
  function warnings() {
    const msgs = [];
    const groups = groupBy.map((g) => g.trim()).filter(Boolean);
    const named = concat.filter((c) => c.name.trim());
    const cols = named.map((c) => c.name.trim());
    const picked = (flag) => named.filter((c) => c[flag]).map((c) => c.name.trim());

    if (!groups.length) msgs.push(tr("ยังไม่ได้ใส่คอลัมน์ที่ใช้จัดกลุ่ม", "No group column yet"));
    if (!cols.length) msgs.push(tr("ยังไม่ได้ใส่คอลัมน์ที่จะเอามาต่อกัน", "No column to join yet"));

    const clash = groups.filter((g) => cols.includes(g));
    if (clash.length) {
      msgs.push(tr(
        `คอลัมน์ ${clash.join(", ")} อยู่ทั้งในกลุ่มและในรายการที่จะต่อ ฟังก์ชันจะฟ้องทันที เลือกอย่างใดอย่างหนึ่ง`,
        `Column ${clash.join(", ")} is both a group column and a joined column, the function will refuse it, pick one`
      ));
    }

    const dup = cols.filter((n, i) => cols.indexOf(n) !== i);
    if (dup.length) {
      msgs.push(tr(`ใส่คอลัมน์ ${[...new Set(dup)].join(", ")} ซ้ำสองครั้ง`, `Column ${[...new Set(dup)].join(", ")} is listed twice`));
    }

    // ‼️ กับดักที่เงียบที่สุด: บวกเงินโดยไม่ได้ยุบอะไรเลย ตัวเลือกนี้จะไม่มีผล
    if (picked("sum").length && !picked("distinct").length) {
      msgs.push(tr(
        "เลือกให้บวกตัวเลขไว้ แต่ยังไม่ได้ติ๊กคอลัมน์ไหนให้ยุบค่าซ้ำเลย การบวกจึงยังไม่เกิดขึ้น",
        "You asked to add numbers up but nothing is set to collapse yet, so no adding will happen"
      ));
    }

    // ‼️ บทเรียน 14/09/2026 ตำแหน่งเลื่อนเงียบ ต้องเตือนแรง ๆ ตรงนี้
    if (opt.nullMode === "drop" && cols.length > 1) {
      msgs.push(tr(
        "ทิ้งค่าว่างทั้งที่ต่อหลายคอลัมน์ ถ้าแถวไหนว่างบางคอลัมน์ จำนวนค่าจะไม่เท่ากัน อ่านคู่กันไม่ได้",
        "Dropping blanks while joining several columns means a row that is blank in only one of them makes the counts differ, so they cannot be read side by side"
      ));
    }

    /* ‼️ ความต่างที่วัดได้จริงระหว่างสองภาษา บอกตามตรงดีกว่าให้ไปเจอเองทีหลัง */
    if (view === "sql") {
      if (!sort.column.trim()) {
        msgs.push(tr(
          "SQL ไม่มีลำดับแถวตามธรรมชาติ ยังไม่เลือกคอลัมน์เรียง จึงเรียงตามคอลัมน์แรก ลำดับต่างจาก Power Query",
          "SQL has no natural row order. With no sort column chosen it orders by the first joined column, so the order will differ from Power Query and blanks come first"
        ));
      }
      if (!opt.numberFormat.trim() && picked("sum").length) {
        msgs.push(tr(
          "คอลัมน์ทศนิยมจะติด .00 มาในฝั่ง SQL อยากได้เหมือน Power Query ใส่รูปแบบตัวเลขเป็น 0 หรือ #,0",
          "Decimal columns keep their .00 on the SQL side. To match Power Query set the number format to 0 or #,0"
        ));
      }
    }
    if (opt.nullMode === "text" && !opt.nullText.trim()) {
      msgs.push(tr("ยังไม่ได้ใส่ข้อความแทนค่าว่าง ผลจะออกมาเหมือนเว้นช่องว่าง", "No placeholder text yet, the result will look like an empty gap"));
    }

    return msgs;
  }

  function render() {
    state.save();
    if (view === "fn") return;
    if (view === "sql") { setView("sql"); return; }
    codeEl.innerHTML = paintCode(buildQuery(), "m");
    const msgs = warnings();
    warnEl.hidden = msgs.length === 0;
    warnEl.textContent = msgs.join("  ");
  }

  async function setView(v) {
    view = v;
    tabQuery.classList.toggle("ghost", v !== "query");
    tabFn.classList.toggle("ghost", v !== "fn");
    tabSql.classList.toggle("ghost", v !== "sql");
    /* ‼️ สองบรรทัดนี้ต้องอยู่เหนือ return ของแท็บคิวรี ไม่งั้นกลับมาแล้วป้ายปุ่มค้างเป็น .sql
       (กดจริงแล้วเจอ 14/09 ตอนแรกวางไว้ใต้ return) */
    codeEl.parentElement.classList.toggle("is-sql", v === "sql");
    syncDlLabel();
    if (v === "query") { render(); return; }
    if (v === "sql") {
      codeEl.innerHTML = paintCode(buildSql(), "sql");
      const msgs = warnings();
      warnEl.hidden = msgs.length === 0;
      warnEl.textContent = msgs.join("  ");
      return;
    }
    warnEl.hidden = true;
    if (fnText === null) {
      codeEl.textContent = tr("กำลังโหลดตัวฟังก์ชัน…", "Loading the function…");
      try {
        const res = await fetch(FN_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fnText = await res.text();
      } catch (e) {
        fnText = null;
        codeEl.textContent = "";
        st.err(tr("โหลดตัวฟังก์ชันไม่สำเร็จ: ", "Couldn't load the function: ") + e.message);
        return;
      }
    }
    codeEl.innerHTML = paintCode(fnText, "m");
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      st.ok(view === "fn"
        ? tr("คัดลอกตัวฟังก์ชันแล้ว สร้างคิวรีชื่อ fnGroupConcat แล้ววางได้เลย", "Function copied, make a query named fnGroupConcat and paste it")
        : view === "sql"
          ? tr("คัดลอกแล้ว เอาไปรันใน SSMS หรือทำเป็น VIEW ได้เลย", "Copied, run it in SSMS or wrap it in a view")
          : tr("คัดลอกแล้ว วางใน Advanced Editor ได้เลย", "Copied, paste it into the Advanced Editor"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    const name = view === "fn" ? "fnGroupConcat.pq" : view === "sql" ? "group-concat.sql" : "group-concat.pq";
    download(new Blob([codeEl.textContent], { type: "text/plain;charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }

  function applyPreset(kind) {
    const fresh = SEED();
    query = fresh.query;
    groupBy = fresh.groupBy;
    concat = fresh.concat;
    first = fresh.first;
    Object.assign(sort, fresh.sort);
    Object.assign(opt, fresh.opt);

    if (kind === "sum" || kind === "full") {
      concat[0].distinct = true;   // ยุบสถานะที่ซ้ำ
      concat[1].sum = true;        // แล้วบวกเงินของสถานะเดียวกัน
    }
    if (kind === "full") {
      concat[1].total = true;
      opt.countColumn = tr("จำนวนสัญญา", "Contracts");
      opt.distinctCountColumn = tr("จำนวนสถานะ", "Statuses");
      opt.numberFormat = "#,0";
    }
    rebuildAll();
    st.ok(tr("ใช้ชุดที่เลือกแล้ว ปรับต่อได้ตามใจ", "Applied, tweak it from here"));
  }

  async function onShare() {
    const link = state.shareLink();
    try {
      await navigator.clipboard.writeText(link);
      st.ok(link.includes("?s=") ? SHARE_MSG.ok() : SHARE_MSG.plain());
    } catch { st.err(SHARE_MSG.fail()); }
  }

  function onReset() {
    const fresh = SEED();
    query = fresh.query;
    groupBy = fresh.groupBy;
    concat = fresh.concat;
    first = fresh.first;
    Object.assign(sort, fresh.sort);
    Object.assign(opt, fresh.opt);
    queryInput.value = query;
    state.clear();
    rebuildAll();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Back to the defaults"));
  }
}
