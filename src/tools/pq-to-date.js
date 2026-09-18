import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { tr } from "../i18n.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { stateKit, SHARE_MSG } from "../statekit.js";
import { sqlId, sqlTable, sqlStr, sqlHeader } from "../sqlgen.js";

/* ‼️ เครื่องนี้ "สร้างโค้ดเรียกใช้" ไม่ได้เขียนฟังก์ชันขึ้นใหม่
 * ตัว fnToDate มีอยู่จริงและผ่านเทส 34 เคส (Data/ADVANCE/fnToDate.pq)
 *
 * ‼️ เรื่องที่คนไทยพลาดกันมากที่สุดและเป็นเหตุผลที่ฟังก์ชันนี้เกิดขึ้น
 * Table.TransformColumnTypes อาศัย culture ของเครื่อง เครื่องที่ตั้งเป็นไทยจะตีปี
 * เป็น พ.ศ. ให้เองเงียบ ๆ ไฟล์เดียวกันเปิดคนละเครื่องจึงได้วันคนละปี
 * ฟังก์ชันนี้อ่านตัวเลขเองไม่พึ่ง culture และบังคับให้ "ประกาศปฏิทินมาให้ชัด"
 * เครื่องมือหน้านี้จึงต้องถามเรื่องปฏิทินตั้งแต่ต้น ไม่ปล่อยให้เดา
 */

const M_KEYWORDS = new Set([
  "and", "as", "each", "else", "error", "false", "if", "in", "is", "let", "meta",
  "not", "otherwise", "or", "section", "shared", "then", "true", "try", "type",
]);

const FN_URL = "samples/powerquery/fnToDate.pq";

const STYLE = `
.pqd-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(62vh,600px)}
.pqd-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre}
/* ‼️ บรรทัด T-SQL ยาวโดยธรรมชาติ ตัดเป็นพารามิเตอร์ทีละบรรทัดแบบภาษา M ไม่ได้
   แต่ SQL ไม่แคร์ช่องว่าง จึงให้กล่องตัดบรรทัดเองเฉพาะโหมดนี้ อ่านครบโดยไม่ต้องลากแนวนอน
   คัดลอกยังได้ต้นฉบับเป๊ะเพราะ textContent ไม่เปลี่ยน (เทส browser_pqgen ข้อ ④ข เฝ้าอยู่) */
.pqd-code.is-sql code{white-space:pre-wrap;word-break:break-word}
.pqd-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}

.pqd-list{display:flex;flex-direction:column;gap:7px}
.pqd-item{display:flex;align-items:center;gap:6px}
.pqd-item input[type=text]{flex:1;min-width:0}
.pqd-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px;flex:none}
.pqd-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pqd-mini:disabled{opacity:.35;cursor:default}
.pqd-mini.danger:hover:not(:disabled){border-color:var(--err);color:var(--err)}
@media (pointer:coarse){ .pqd-mini{width:36px;height:36px} }

.pqd-hint{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 0 0}
.pqd-add{margin-top:6px}
.pqd-sect{margin:18px 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--text-mute)}
.pqd-sect:first-child{margin-top:0}

.pqd-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}

/* กล่องตัวอย่างค่าจริง ให้เห็นว่าข้อความหน้าตาแบบไหนจะกลายเป็นวันที่อะไร */
.pqd-demo{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  padding:10px 12px;margin-top:8px;font-size:12px;line-height:1.9;color:var(--text-mute)}
.pqd-demo table{width:100%;border-collapse:collapse}
.pqd-demo td{padding:2px 0;vertical-align:top}
.pqd-demo td:first-child{width:46%;padding-right:10px}
.pqd-demo code{font-size:11.5px;color:var(--text);word-break:break-all}
.pqd-demo .bad code{color:var(--err)}

${PRESETS_CSS}
` + CODE_TOKEN_CSS;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  const SEED = () => ({
    query: tr("ตารางสัญญา", "Contracts"),
    pick: "list",                 // list = ระบุคอลัมน์เอง · auto = ให้หาให้
    columns: ["SUB_BOOKED_DATE", "CREATED_DOC_DATE"],
    detect: "byName",
    namePattern: ["DATE"],
    sampleRows: "200",
    minHitRate: "0.8",
    era: "CE",
    twoDigit: "none",
    mode: "replace",
    prefix: "",
    suffix: "_d",
    parser: "",
    reportColumn: "",
  });

  const PRESETS = [
    { id: "plain", name: tr("วันที่ ค.ศ. ทั่วไป", "Ordinary CE dates"),
      desc: tr("ระบุคอลัมน์เอง แปลงทับคอลัมน์เดิม ใช้ได้กับข้อมูลส่วนใหญ่",
               "Name the columns yourself and convert in place, which fits most data"),
      values: "plain" },
    { id: "be", name: tr("ข้อมูลเป็น พ.ศ.", "Buddhist era data"),
      desc: tr("ลบ 543 ให้ทุกค่า และเก็บคอลัมน์ข้อความเดิมไว้เทียบด้วย",
               "Subtracts 543 from every value and keeps the original text column for comparison"),
      values: "be" },
    { id: "auto", name: tr("ให้หาคอลัมน์ให้เอง", "Let it find the columns"),
      desc: tr("ไม่ต้องไล่พิมพ์ชื่อ อ่านค่าจริง 200 แถวแรกแล้วตัดสินว่าคอลัมน์ไหนเป็นวันที่",
               "No typing names, it reads the first 200 rows and decides which columns hold dates"),
      values: "auto" },
  ];

  const s = SEED();
  let query = s.query;
  let pick = s.pick;
  let columns = s.columns;
  let namePattern = s.namePattern;
  const o = {
    detect: s.detect, sampleRows: s.sampleRows, minHitRate: s.minHitRate,
    era: s.era, twoDigit: s.twoDigit, mode: s.mode, prefix: s.prefix,
    suffix: s.suffix, parser: s.parser, reportColumn: s.reportColumn,
  };
  let view = "query";
  let fnText = null;

  const presets = presetBar(PRESETS, applyPreset);
  const state = stateKit(tool.id, {
    defaults: SEED(),
    collect: () => ({ query, pick, columns, namePattern, ...o }),
    apply: (v) => {
      if (typeof v.query === "string") query = v.query;
      if (typeof v.pick === "string") pick = v.pick;
      if (Array.isArray(v.columns)) columns = v.columns;
      if (Array.isArray(v.namePattern)) namePattern = v.namePattern;
      for (const k of Object.keys(o)) if (v[k] !== undefined) o[k] = v[k];
    },
  });

  const codeEl = el("code", {});
  const warnEl = el("div", { class: "pqd-warn", hidden: true });
  const tabQuery = button(tr("คิวรีที่ได้", "Generated query"), { onclick: () => setView("query") });
  const tabFn = button(tr("ตัวฟังก์ชัน", "The function"), { ghost: true, onclick: () => setView("fn") });
  const tabSql = button("T-SQL", { ghost: true, onclick: () => setView("sql") });
  const centerNode = el("div", {}, [
    el("div", { class: "pqd-tabs" }, [tabQuery, tabFn, tabSql]),
    warnEl,
    el("pre", { class: "pqd-code" }, [codeEl]),
  ]);

  const queryInput = el("input", { type: "text" });
  queryInput.value = query;
  queryInput.addEventListener("input", () => { query = queryInput.value; render(); });

  const pickWrapEl = el("div", {});
  const colListEl = el("div", { class: "pqd-list" });
  const autoWrapEl = el("div", {});
  const addColBtn = button(tr("เพิ่มคอลัมน์", "Add a column"), { icon: "plus", ghost: true, onclick: () => { columns.push(""); buildCols(); render(); } });
  const addColWrap = el("div", { class: "pqd-add" }, [addColBtn]);

  const leftBody = el("div", {}, [
    field(tr("ชื่อคิวรีตารางต้นทาง", "Source query name"), queryInput,
      tr("ชื่อที่เห็นในบานหน้าต่างคิวรีทางซ้ายของ Power Query",
         "The name shown in the Queries pane on the left of Power Query")),
    el("h3", { class: "pqd-sect" }, tr("จะแปลงคอลัมน์ไหน", "Which columns to convert")),
    pickWrapEl,
    colListEl,
    addColWrap,
    autoWrapEl,
  ]);

  const eraWrapEl = el("div", {});
  const modeWrapEl = el("div", {});
  const extraWrapEl = el("div", {});

  const rightBody = el("div", {}, [
    presets.node,
    el("h3", { class: "pqd-sect" }, tr("ปฏิทินของข้อมูล", "Which calendar the data uses")),
    el("p", { class: "pqd-hint" }, tr(
      "ต้องบอกให้ชัด ฟังก์ชันจะไม่เดาปฏิทินให้เอง เพราะเดาผิดทีเดียวคือวันเพี้ยนไป 543 ปีทั้งคอลัมน์",
      "You must say which one. The function never guesses, because guessing wrong shifts the whole column by 543 years"
    )),
    eraWrapEl,
    el("h3", { class: "pqd-sect" }, tr("ผลลัพธ์ลงที่ไหน", "Where the result goes")),
    modeWrapEl,
    el("h3", { class: "pqd-sect" }, tr("ตัวเลือกเพิ่มเติม", "More options")),
    extraWrapEl,
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
      "วางในคิวรีเปล่าผ่าน Advanced Editor ไฟล์ต้องมีคิวรี fnToDate ด้วย",
      "Paste into a blank query via the Advanced Editor. The file also needs a query named fnToDate"
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

  function miniBtn(label, title, onclick, danger) {
    const b = el("button", { class: "pqd-mini" + (danger ? " danger" : ""), type: "button", title, "aria-label": title });
    b.textContent = label;
    b.addEventListener("click", onclick);
    return b;
  }

  function listRow(arr, i, rebuild, placeholder) {
    const inp = el("input", { type: "text", placeholder });
    inp.value = arr[i] ?? "";
    inp.addEventListener("input", () => { arr[i] = inp.value; render(); });
    const del = miniBtn("×", tr("เอาออก", "Remove"), () => { arr.splice(i, 1); rebuild(); render(); }, true);
    del.disabled = arr.length <= 1;
    return el("div", { class: "pqd-item" }, [inp, del]);
  }

  function buildPick() {
    pickWrapEl.innerHTML = "";
    const sel = select([
      ["list", tr("ระบุชื่อคอลัมน์เอง เร็วที่สุด", "Name them myself, the fastest")],
      ["auto", tr("ให้หาคอลัมน์วันที่ให้เอง", "Let it find the date columns")],
    ], pick);
    sel.addEventListener("change", () => { pick = sel.value; rebuildAll(); });
    pickWrapEl.append(field(tr("วิธีเลือกคอลัมน์", "How to choose columns"), sel));
  }

  function buildCols() {
    colListEl.innerHTML = "";
    const show = pick === "list";
    colListEl.hidden = !show;
    addColWrap.hidden = !show;
    if (!show) return;
    columns.forEach((_, i) => colListEl.appendChild(
      listRow(columns, i, buildCols, tr("ชื่อคอลัมน์ที่เก็บวันที่เป็นข้อความ", "A column holding dates as text"))
    ));
  }

  function buildAuto() {
    autoWrapEl.innerHTML = "";
    if (pick !== "auto") return;

    const dsel = select([
      ["byName", tr("ดูจากชื่อคอลัมน์", "By column name")],
      ["byContent", tr("ดูจากค่าจริงในคอลัมน์", "By the values inside")],
      ["all", tr("เอาคอลัมน์ข้อความทั้งหมด", "Every text column")],
    ], o.detect);
    dsel.addEventListener("change", () => { o.detect = dsel.value; buildAuto(); render(); });
    autoWrapEl.append(field(tr("หายังไง", "How to find them"), dsel,
      o.detect === "byContent"
        ? tr("ช้ากว่าแบบดูชื่อ เพราะต้องอ่านค่าจริง แต่จับคอลัมน์ที่ชื่อไม่มีคำว่า DATE ได้",
             "Slower than by name because it reads real values, but it catches columns whose names say nothing about dates")
        : o.detect === "all"
          ? tr("กวาดทุกคอลัมน์ข้อความ คอลัมน์ที่ไม่ใช่วันที่จะกลายเป็นค่าว่าง ระวังข้อมูลหาย",
               "Sweeps every text column. Columns that are not dates turn blank, so mind your data")
          : tr("เร็วที่สุดในสามแบบ แต่จับได้เฉพาะคอลัมน์ที่ชื่อเข้าเกณฑ์",
               "The fastest of the three, but only catches columns whose names match")));

    if (o.detect === "byName") {
      const listEl = el("div", { class: "pqd-list" });
      namePattern.forEach((_, i) => listEl.appendChild(
        listRow(namePattern, i, buildAuto, tr("คำที่อยู่ในชื่อคอลัมน์", "A word found in the column name"))
      ));
      autoWrapEl.append(
        el("h3", { class: "pqd-sect" }, tr("ชื่อคอลัมน์ที่มีคำเหล่านี้", "Column names containing these words")),
        el("p", { class: "pqd-hint" }, tr("ไม่สนตัวพิมพ์ใหญ่เล็ก ใส่ได้หลายคำ", "Case does not matter, add as many words as you like")),
        listEl,
        el("div", { class: "pqd-add" }, [
          button(tr("เพิ่มคำ", "Add a word"), { icon: "plus", ghost: true, onclick: () => { namePattern.push(""); buildAuto(); render(); } }),
        ]),
      );
    }

    if (o.detect === "byContent") {
      const rows = el("input", { type: "text", inputmode: "numeric" });
      rows.value = o.sampleRows;
      rows.addEventListener("input", () => { o.sampleRows = rows.value; render(); });
      const rate = el("input", { type: "text", inputmode: "decimal" });
      rate.value = o.minHitRate;
      rate.addEventListener("input", () => { o.minHitRate = rate.value; render(); });
      autoWrapEl.append(
        field(tr("อ่านกี่แถวก่อนตัดสิน", "How many rows to read first"), rows,
          tr("มากขึ้นแม่นขึ้นแต่ช้าลง", "More rows is more accurate but slower")),
        field(tr("ต้องแปลงได้กี่ส่วนถึงนับว่าเป็นวันที่", "How much must convert to count as a date"), rate,
          tr("0.8 คือแปลงได้ 8 ใน 10 ค่า", "0.8 means 8 out of every 10 values")),
      );
    }
  }

  function buildEra() {
    eraWrapEl.innerHTML = "";
    const sel = select([
      ["CE", tr("ค.ศ. เช่น 2024", "CE, like 2024")],
      ["BE", tr("พ.ศ. เช่น 2567 ลบ 543 ให้ทุกค่า", "BE, like 2567, minus 543 on every value")],
      ["auto", tr("ให้ดูทั้งคอลัมน์แล้วตัดสินครั้งเดียว", "Look at the whole column and decide once")],
    ], o.era);
    sel.addEventListener("change", () => { o.era = sel.value; buildEra(); render(); });
    eraWrapEl.append(field(tr("ปีในข้อมูลเป็นปฏิทินไหน", "Which calendar the years use"), sel,
      o.era === "auto"
        ? tr("ถ้าเจอปี ค.ศ. กับ พ.ศ. ปนกันในคอลัมน์เดียว จะฟ้องออกมาเลย ไม่เดาต่อให้",
             "If the column mixes CE and BE years it will raise an error instead of guessing")
        : null));

    const two = select([
      ["none", tr("ไม่รับ คืนค่าว่าง", "Reject them, leave blank")],
      ["CE", tr("ตีเป็น ค.ศ.", "Read them as CE")],
      ["BE", tr("ตีเป็น พ.ศ.", "Read them as BE")],
    ], o.twoDigit);
    two.addEventListener("change", () => { o.twoDigit = two.value; render(); });
    eraWrapEl.append(field(tr("ปีที่เขียนแค่ 2 หลัก เช่น 19/08/69", "Years written with two digits, like 19/08/69"), two,
      tr("ค่าเริ่มต้นคือไม่เดาให้ เพราะ 69 เป็นได้ทั้ง 2569 และ 1969",
         "The default is not to guess, because 69 could be 2569 or 1969")));

    // ตัวอย่างจริงว่าข้อความแบบไหนได้อะไร ตามค่าที่เลือกอยู่ตอนนี้
    const be = o.era === "BE";
    const ex = [
      ["2024-01-15", be ? "15/01/1481" : "15/01/2024"],
      ["31/10/2567", be ? "31/10/2024" : "31/10/2567"],
      ["19/08/69", o.twoDigit === "none" ? tr("ค่าว่าง", "blank") : (o.twoDigit === "BE" ? "19/08/2026" : "19/08/1969")],
      [tr("ข้อความที่ไม่ใช่วันที่", "not a date at all"), tr("ค่าว่าง", "blank")],
    ];
    eraWrapEl.append(el("div", { class: "pqd-demo" }, [
      el("div", {}, tr("ด้วยค่าที่ตั้งอยู่ตอนนี้ ข้อความเหล่านี้จะกลายเป็น", "With the current settings these texts become")),
      el("table", {}, [el("tbody", {}, ex.map(([a, b]) =>
        el("tr", { class: /blank|ค่าว่าง/.test(b) ? "bad" : "" }, [
          el("td", {}, [el("code", {}, a)]),
          el("td", {}, [el("code", {}, "→ " + b)]),
        ])
      ))]),
    ]));
  }

  function buildMode() {
    modeWrapEl.innerHTML = "";
    const sel = select([
      ["replace", tr("แปลงทับคอลัมน์เดิม", "Convert in place")],
      ["add", tr("เพิ่มคอลัมน์ใหม่ เก็บของเดิมไว้", "Add a new column and keep the original")],
    ], o.mode);
    sel.addEventListener("change", () => { o.mode = sel.value; buildMode(); render(); });
    modeWrapEl.append(field(tr("วิธีลงผลลัพธ์", "How the result lands"), sel,
      o.mode === "add"
        ? tr("เหมาะกับตอนยังไม่มั่นใจ จะได้เทียบค่าเดิมกับค่าที่แปลงแล้วได้",
             "Good while you are still unsure, so you can compare the old text with the converted value")
        : tr("คอลัมน์เดิมจะกลายเป็นชนิดวันที่ ข้อความเดิมไม่เหลือ",
             "The original column becomes a real date and the text is gone")));

    if (o.mode === "add") {
      const pre = el("input", { type: "text", placeholder: tr("เติมข้างหน้า", "goes in front") });
      pre.value = o.prefix;
      pre.addEventListener("input", () => { o.prefix = pre.value; render(); });
      const suf = el("input", { type: "text", placeholder: "_d" });
      suf.value = o.suffix;
      suf.addEventListener("input", () => { o.suffix = suf.value; render(); });
      const sample = (columns[0] || "SUB_BOOKED_DATE").trim() || "SUB_BOOKED_DATE";
      modeWrapEl.append(
        field(tr("คำนำหน้าชื่อคอลัมน์ใหม่", "Prefix for the new column"), pre),
        field(tr("คำต่อท้ายชื่อคอลัมน์ใหม่", "Suffix for the new column"), suf,
          tr(`จะได้คอลัมน์ชื่อ ${o.prefix}${sample}${o.suffix}`, `You will get a column named ${o.prefix}${sample}${o.suffix}`)),
      );
    }
  }

  function buildExtra() {
    extraWrapEl.innerHTML = "";
    const rep = el("input", { type: "text", placeholder: tr("เช่น แปลงไม่ได้กี่ช่อง", "e.g. Bad values") });
    rep.value = o.reportColumn;
    rep.addEventListener("input", () => { o.reportColumn = rep.value; render(); });

    const par = el("input", { type: "text", placeholder: "fnParseThaiDate" });
    par.value = o.parser;
    par.addEventListener("input", () => { o.parser = par.value; render(); });

    extraWrapEl.append(
      field(tr("คอลัมน์นับช่องที่แปลงไม่ได้", "Column counting values that failed"), rep,
        tr("เว้นว่างถ้าไม่ต้องการ ใส่ไว้จะกรองหาแถวข้อมูลเสียได้ง่าย",
           "Leave empty to skip. With it you can filter straight to the broken rows")),
      field(tr("ฟังก์ชันแปลงเอง", "Your own parser function"), par,
        tr("เช่น fnParseThaiDate ที่อ่านเดือนภาษาไทยได้ ใส่แล้วจะข้ามการตั้งค่าปฏิทินข้างบน",
           "Such as fnParseThaiDate which understands Thai month names. It overrides the calendar settings above")),
    );
  }

  function rebuildAll() {
    buildPick(); buildCols(); buildAuto(); buildEra(); buildMode(); buildExtra(); render();
  }

  function mId(name) {
    const v = String(name ?? "");
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) && !M_KEYWORDS.has(v) ? v : `#"${v.replace(/"/g, '""')}"`;
  }
  function mStr(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
  function mList(arr) { return `{${arr.map(mStr).join(", ")}}`; }
  function mNum(v, fallback) {
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? String(n) : String(fallback);
  }

  function buildQuery() {
    const cols = columns.map((c) => c.trim()).filter(Boolean);
    const pats = namePattern.map((c) => c.trim()).filter(Boolean);

    const pairs = [];
    if (pick === "auto") {
      if (o.detect !== "byName") pairs.push(`Detect = ${mStr(o.detect)}`);
      if (o.detect === "byName" && (pats.length !== 1 || pats[0] !== "DATE")) pairs.push(`NamePattern = ${mList(pats)}`);
      if (o.detect === "byContent") {
        if (mNum(o.sampleRows, 200) !== "200") pairs.push(`SampleRows = ${mNum(o.sampleRows, 200)}`);
        if (mNum(o.minHitRate, 0.8) !== "0.8") pairs.push(`MinHitRate = ${mNum(o.minHitRate, 0.8)}`);
      }
    }
    if (o.era !== "CE") pairs.push(`YearEra = ${mStr(o.era)}`);
    if (o.twoDigit !== "none") pairs.push(`TwoDigitYear = ${mStr(o.twoDigit)}`);
    if (o.mode === "add") {
      pairs.push(`Mode = "add"`);
      if (o.prefix) pairs.push(`Prefix = ${mStr(o.prefix)}`);
      if (o.suffix !== "_d") pairs.push(`Suffix = ${mStr(o.suffix)}`);
    }
    if (o.parser.trim()) pairs.push(`Parser = ${o.parser.trim()}`);
    if (o.reportColumn.trim()) pairs.push(`ReportColumn = ${mStr(o.reportColumn.trim())}`);

    const colArg = pick === "auto" ? "null" : mList(cols);
    const args = [mId(query), colArg];
    // ‼️ พารามิเตอร์ที่ 2 เว้นไม่ได้ถ้ายังมีพารามิเตอร์ที่ 3 ตามมา ต้องใส่ null คั่นไว้
    const optInline = pairs.length ? `[ ${pairs.join(", ")} ]` : "";
    if (optInline) args.push(optInline);
    // ไม่มีตัวเลือกเลยและให้หาเอง จึงตัด null ท้ายทิ้งได้ อ่านสะอาดกว่า
    const finalArgs = (!optInline && colArg === "null") ? [mId(query)] : args;

    const stepName = mId(tr("แปลงวันที่แล้ว", "DatesConverted"));
    const oneLine = `    ${stepName} = fnToDate(${finalArgs.join(", ")})`;
    const call = oneLine.length <= 60 ? oneLine : [
      `    ${stepName} = fnToDate(`,
      `        ${mId(query)},`,
      `        ${colArg}${pairs.length ? "," : ""}`,
      ...(pairs.length ? [`        [ ${pairs.join(",\n          ")} ]`] : []),
      "    )",
    ].join("\n");

    return [
      "let",
      tr("    // แปลงคอลัมน์ข้อความเป็นวันที่จริง",
         "    // Text columns into real dates, all at once"),
      call,
      "in",
      `    ${stepName}`,
    ].join("\n");
  }

  /* ── ท่าเดียวกันในภาษา T-SQL ────────────────────────────────────
     ‼️ พิสูจน์บน SQL Server 2022 จริงแล้ว 14/09
     `TRY_CONVERT(date, s, 103)` อ่านรูปแบบ วว/ดด/ปปปป และคืน NULL เมื่อไม่ใช่วันที่ ไม่ระเบิด
     พ.ศ. ใช้ `DATEADD(year, -543, ...)` ครอบอีกชั้น ปี 2567 ยังอยู่ในช่วงของชนิด date จึงทำได้ */
  function buildSql() {
    const cols = columns.map((c) => c.trim()).filter(Boolean);
    const table = sqlTable(query);
    if (pick === "auto") {
      return [
        sqlHeader(tr("แปลงข้อความเป็นวันที่", "Turn text into real dates")),
        tr("-- ฝั่ง SQL ไม่มีการหาคอลัมน์ให้เอง ต้องระบุชื่อคอลัมน์เองเสมอ",
           "-- SQL has no auto-detect, the columns must always be named"),
        tr("-- กลับไปเลือก \"ระบุชื่อคอลัมน์เอง\" ทางซ้าย แล้วโค้ดตรงนี้จะขึ้นให้",
           "-- Switch to \"Name them myself\" on the left and this code will appear"),
      ].join("\n");
    }
    if (!cols.length) return sqlHeader(tr("ยังไม่ได้ใส่ชื่อคอลัมน์", "No column named yet"));

    // ‼️ รูปแบบ 103 = วว/ดด/ปปปป ส่วน 23 = ปปปป-ดด-วว ลองเรียงกันด้วย COALESCE ให้รับได้ทั้งสองแบบ
    const conv = (c) => {
      const id = sqlId(c);
      const base = `COALESCE(TRY_CONVERT(date, ${id}, 103), TRY_CONVERT(date, ${id}, 23))`;
      if (o.era === "BE") return `DATEADD(year, -543, ${base})`;
      return base;
    };
    const lines = [sqlHeader(tr("แปลงข้อความเป็นวันที่", "Turn text into real dates"))];
    if (o.era === "auto") {
      lines.push(tr("-- ฝั่ง SQL ไม่ตัดสินปฏิทินให้เอง เลือก ค.ศ. หรือ พ.ศ. ให้ชัดก่อน โค้ดนี้คิดเป็น ค.ศ.",
                    "-- SQL will not decide the calendar for you. This assumes CE, pick one explicitly"));
    }
    lines.push("SELECT");
    const parts = ["    *"];
    cols.forEach((c) => {
      const name = o.mode === "add" ? `${o.prefix}${c}${o.suffix}` : c;
      parts.push(`    ${conv(c)} AS ${sqlId(name)}`);
    });
    // แปลงทับคอลัมน์เดิมทำใน SELECT ไม่ได้ ต้องไล่ชื่อคอลัมน์เอง จึงบอกทางเลือกที่ใช้ได้จริงแทน
    if (o.mode === "replace") {
      lines.length = 1;
      lines.push(tr("-- แปลงทับคอลัมน์เดิมในคิวรีเดียวไม่ได้ เพราะชื่อคอลัมน์จะซ้ำกัน",
                    "-- Converting in place inside one query is not possible, the names would clash"));
      lines.push(tr("-- ใช้วิธีนี้แทน: เลือกคอลัมน์อื่นที่ต้องการแล้วใส่คอลัมน์วันที่ที่แปลงแล้วด้วยชื่อเดิม",
                    "-- Do this instead: list the other columns you want, then the converted date columns under their original names"));
      lines.push("SELECT");
      lines.push(cols.map((c) => `    ${conv(c)} AS ${sqlId(c)}`).join(",\n"));
      lines.push(tr("    -- , คอลัมน์อื่นที่ต้องการ", "    -- , your other columns here"));
      lines.push(`FROM ${table};`);
      return lines.join("\n");
    }
    lines.push(parts.join(",\n"));
    lines.push(`FROM ${table};`);
    return lines.join("\n");
  }

  function warnings() {
    const msgs = [];
    const cols = columns.map((c) => c.trim()).filter(Boolean);
    const pats = namePattern.map((c) => c.trim()).filter(Boolean);

    if (pick === "list" && !cols.length) msgs.push(tr("ยังไม่ได้ใส่ชื่อคอลัมน์ที่จะแปลง", "No column to convert yet"));
    if (pick === "auto" && o.detect === "byName" && !pats.length) {
      msgs.push(tr("ยังไม่ได้ใส่คำที่ใช้หาชื่อคอลัมน์", "No word to search column names with yet"));
    }
    const dup = cols.filter((n, i) => cols.indexOf(n) !== i);
    if (dup.length) msgs.push(tr(`ใส่คอลัมน์ ${[...new Set(dup)].join(", ")} ซ้ำสองครั้ง`, `Column ${[...new Set(dup)].join(", ")} is listed twice`));

    if (pick === "auto" && o.detect === "all") {
      msgs.push(tr(
        "กวาดคอลัมน์ข้อความทั้งหมด คอลัมน์ที่ไม่ใช่วันที่จะกลายเป็นค่าว่าง ควรใช้กับตารางที่รู้จักดี",
        "Sweeping every text column turns non-date columns blank straight away, so only use it on a table you know well"
      ));
    }
    if (o.era === "auto") {
      msgs.push(tr(
        "ให้ตัดสินปฏิทินเอง ถ้าข้อมูลมีปี ค.ศ. ปนกับ พ.ศ. คิวรีจะฟ้องออกมาเลย ไม่เดาให้",
        "Deciding the calendar automatically means a column mixing CE and BE years will raise an error rather than guess"
      ));
    }
    if (o.mode === "add" && !o.prefix && !o.suffix) {
      msgs.push(tr(
        "เลือกเพิ่มคอลัมน์ใหม่แต่ไม่ได้ตั้งคำนำหน้าหรือคำต่อท้าย ชื่อจะไปชนคอลัมน์เดิม",
        "You chose to add new columns but gave neither prefix nor suffix, so the names will clash with the originals"
      ));
    }
    if (o.parser.trim() && (o.era !== "CE" || o.twoDigit !== "none")) {
      msgs.push(tr(
        "ใส่ฟังก์ชันแปลงเองไว้ ค่าปฏิทินกับปี 2 หลักข้างบนจะไม่ถูกใช้",
        "With your own parser in place, the calendar and two-digit-year settings above are ignored"
      ));
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
        ? tr("คัดลอกตัวฟังก์ชันแล้ว สร้างคิวรีชื่อ fnToDate แล้ววางได้เลย", "Function copied, make a query named fnToDate and paste it")
        : view === "sql"
          ? tr("คัดลอกแล้ว เอาไปรันใน SSMS ได้เลย", "Copied, run it in SSMS")
          : tr("คัดลอกแล้ว วางใน Advanced Editor ได้เลย", "Copied, paste it into the Advanced Editor"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    const name = view === "fn" ? "fnToDate.pq" : view === "sql" ? "to-date.sql" : "to-date.pq";
    download(new Blob([codeEl.textContent], { type: "text/plain;charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }

  function applyPreset(kind) {
    const fresh = SEED();
    query = fresh.query;
    pick = fresh.pick;
    columns = fresh.columns;
    namePattern = fresh.namePattern;
    Object.assign(o, {
      detect: fresh.detect, sampleRows: fresh.sampleRows, minHitRate: fresh.minHitRate,
      era: fresh.era, twoDigit: fresh.twoDigit, mode: fresh.mode, prefix: fresh.prefix,
      suffix: fresh.suffix, parser: fresh.parser, reportColumn: fresh.reportColumn,
    });
    if (kind === "be") { o.era = "BE"; o.mode = "add"; }
    if (kind === "auto") { pick = "auto"; o.detect = "byContent"; }
    queryInput.value = query;
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
    applyPreset("plain");
    state.clear();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Back to the defaults"));
  }
}
