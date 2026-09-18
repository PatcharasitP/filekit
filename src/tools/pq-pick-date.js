import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { tr } from "../i18n.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { stateKit, SHARE_MSG } from "../statekit.js";
import { sqlId, sqlTable, sqlHeader } from "../sqlgen.js";

/* ‼️ เครื่องนี้ "สร้างโค้ดเรียกใช้" ไม่ได้เขียนฟังก์ชันขึ้นใหม่
 * ตัว fnPickDate มีอยู่จริงและผ่านเทส 44 เคส (Data/ADVANCE/fnPickDate.pq)
 *
 * ‼️ สิ่งที่เครื่องนี้มีแล้วคนทำเองมักพลาด
 * ① fnPickDate ไม่แปลงวันที่ให้ คอลัมน์ต้องเป็นวันที่จริงก่อน หน้านี้จึงแทรก fnToDate
 *    ให้เป็นบรรทัดแรกได้เลย และประกาศรายชื่อคอลัมน์ไว้ตัวแปรเดียวใช้ซ้ำทุกชั้น
 * ② เลือกหลายอันดับ = เรียกซ้อนกันหลายชั้น ผลของชั้นก่อนต้องเป็นตารางเข้าชั้นถัดไป
 *    เขียนมือแล้วมักลืมต่อชั้น กลายเป็นทุกชั้นอ่านจากตารางต้นทางเดิม คอลัมน์ก่อนหน้าหาย
 * ③ ค่าสำรองใส่ได้เฉพาะชั้นแรก ถ้าใส่ทุกชั้นจะได้วันเดียวกันหมดแล้วช่วงห่างกลายเป็น 0 วันปลอม
 */

const M_KEYWORDS = new Set([
  "and", "as", "each", "else", "error", "false", "if", "in", "is", "let", "meta",
  "not", "otherwise", "or", "section", "shared", "then", "true", "try", "type",
]);

const FN_URL = "samples/powerquery/fnPickDate.pq";

const STYLE = `
.pqp-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(62vh,600px)}
.pqp-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre}
/* ‼️ บรรทัด T-SQL ยาวโดยธรรมชาติ ตัดเป็นพารามิเตอร์ทีละบรรทัดแบบภาษา M ไม่ได้
   แต่ SQL ไม่แคร์ช่องว่าง จึงให้กล่องตัดบรรทัดเองเฉพาะโหมดนี้ อ่านครบโดยไม่ต้องลากแนวนอน
   คัดลอกยังได้ต้นฉบับเป๊ะเพราะ textContent ไม่เปลี่ยน (เทส browser_pqgen ข้อ ④ข เฝ้าอยู่) */
.pqp-code.is-sql code{white-space:pre-wrap;word-break:break-word}
.pqp-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}

.pqp-list{display:flex;flex-direction:column;gap:7px}
.pqp-item{display:flex;align-items:center;gap:6px}
.pqp-item input[type=text]{flex:1;min-width:0}
.pqp-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px;flex:none}
.pqp-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pqp-mini:disabled{opacity:.35;cursor:default}
.pqp-mini.danger:hover:not(:disabled){border-color:var(--err);color:var(--err)}
@media (pointer:coarse){ .pqp-mini{width:36px;height:36px} }

.pqp-hint{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 0 0}
.pqp-add{margin-top:6px}
.pqp-sect{margin:18px 0 8px;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--text-mute)}
.pqp-sect:first-child{margin-top:0}

/* การ์ด 1 ใบ = การเลือก 1 ชั้น เพิ่มได้เรื่อย ๆ */
.pqp-layer{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  padding:11px 12px;margin-bottom:10px}
.pqp-layer-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.pqp-layer-no{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mute)}
.pqp-layer .field{margin-bottom:8px}
.pqp-layer .field:last-child{margin-bottom:0}
.pqp-two{display:flex;gap:8px}
.pqp-two > *{flex:1;min-width:0}

.pqp-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}

.pqp-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pqp-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pqp-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pqp-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pqp-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pqp-switch input:checked + .pqp-switch-track{background:var(--g-powerbi,var(--brand))}
.pqp-switch input:checked + .pqp-switch-track::after{transform:translateX(18px)}
.pqp-switch input:focus-visible + .pqp-switch-track{outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){
  .pqp-switch{height:36px}
  .pqp-switch-track{top:6px;bottom:6px}
}

${PRESETS_CSS}
` + CODE_TOKEN_CSS;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  const SEED = () => ({
    query: tr("ตารางงานต่อสัญญา", "RenewalTasks"),
    columns: ["SUB_BOOKED_DATE", "CREATED_DOC_DATE", "SUBMIT_LETTER_DATE"],
    convertFirst: true,
    fallback: "MODIFY_DATE",
    layers: [
      { mode: "MAX", rank: "1", name: "" },
      { mode: "MAX", rank: "2", name: "" },
    ],
    opt: { countRepeated: false, fallbackEveryRank: false, skipTypeCheck: false },
  });

  const PRESETS = [
    { id: "sla", name: tr("คิดช่วงห่าง 2 ขั้นล่าสุด", "Gap between the last two steps"),
      desc: tr("ได้วันล่าสุดกับวันรองลงมา เอาไปลบกันเป็นจำนวนวันที่ใช้ไปในขั้นล่าสุด",
               "Gives the latest date and the one before it, subtract them for the days spent on the last step"),
      values: "sla" },
    { id: "span", name: tr("วันแรกถึงวันล่าสุด", "First day to latest day"),
      desc: tr("ได้วันแรกสุดกับวันล่าสุด เอาไปคิดอายุงานรวมทั้งเรื่อง",
               "Gives the earliest and the latest date, for the total age of the case"),
      values: "span" },
    { id: "one", name: tr("เอาแค่วันล่าสุด", "Just the latest date"),
      desc: tr("ชั้นเดียวจบ เหมาะกับตอนอยากได้คอลัมน์เดียวไปใช้ต่อ",
               "A single layer, for when one column is all you need"),
      values: "one" },
  ];

  const s = SEED();
  let query = s.query;
  let columns = s.columns;
  let convertFirst = s.convertFirst;
  let fallback = s.fallback;
  let layers = s.layers;
  const opt = { ...s.opt };
  let view = "query";
  let fnText = null;

  const presets = presetBar(PRESETS, applyPreset);
  const state = stateKit(tool.id, {
    defaults: SEED(),
    collect: () => ({ query, columns, convertFirst, fallback, layers, opt: { ...opt } }),
    apply: (v) => {
      if (typeof v.query === "string") query = v.query;
      if (Array.isArray(v.columns)) columns = v.columns;
      if (typeof v.convertFirst === "boolean") convertFirst = v.convertFirst;
      if (typeof v.fallback === "string") fallback = v.fallback;
      if (Array.isArray(v.layers)) layers = v.layers;
      if (v.opt) Object.assign(opt, v.opt);
    },
  });

  const codeEl = el("code", {});
  const warnEl = el("div", { class: "pqp-warn", hidden: true });
  const tabQuery = button(tr("คิวรีที่ได้", "Generated query"), { onclick: () => setView("query") });
  const tabFn = button(tr("ตัวฟังก์ชัน", "The function"), { ghost: true, onclick: () => setView("fn") });
  const tabSql = button("T-SQL", { ghost: true, onclick: () => setView("sql") });
  const centerNode = el("div", {}, [
    el("div", { class: "pqp-tabs" }, [tabQuery, tabFn, tabSql]),
    warnEl,
    el("pre", { class: "pqp-code" }, [codeEl]),
  ]);

  const queryInput = el("input", { type: "text" });
  queryInput.value = query;
  queryInput.addEventListener("input", () => { query = queryInput.value; render(); });

  const fallbackInput = el("input", { type: "text", placeholder: tr("เว้นว่างได้", "may be left empty") });
  fallbackInput.value = fallback;
  fallbackInput.addEventListener("input", () => { fallback = fallbackInput.value; render(); });

  const colListEl = el("div", { class: "pqp-list" });
  const convertWrapEl = el("div", {});

  const leftBody = el("div", {}, [
    field(tr("ชื่อคิวรีตารางต้นทาง", "Source query name"), queryInput,
      tr("ชื่อที่เห็นในบานหน้าต่างคิวรีทางซ้ายของ Power Query",
         "The name shown in the Queries pane on the left of Power Query")),
    el("h3", { class: "pqp-sect" }, tr("คอลัมน์วันที่ที่เอามาเทียบกัน", "Date columns to compare")),
    el("p", { class: "pqp-hint" }, tr(
      "ทุกชั้นใช้รายชื่อชุดเดียวกันนี้ โค้ดที่ได้จึงประกาศไว้ครั้งเดียวแล้วเรียกซ้ำ แก้ทีเดียวเปลี่ยนหมด",
      "Every layer uses this same list, so the code declares it once and reuses it, change it in one place"
    )),
    colListEl,
    el("div", { class: "pqp-add" }, [
      button(tr("เพิ่มคอลัมน์วันที่", "Add a date column"), { icon: "plus", ghost: true, onclick: () => { columns.push(""); buildCols(); render(); } }),
    ]),
    el("h3", { class: "pqp-sect" }, tr("คอลัมน์ที่ยังเป็นข้อความ", "When the columns are still text")),
    convertWrapEl,
    el("h3", { class: "pqp-sect" }, tr("ถ้าไม่มีวันที่เลยสักคอลัมน์", "When there is no date at all")),
    field(tr("คอลัมน์สำรอง", "Fallback column"), fallbackInput,
      tr("ใช้กับชั้นแรกเท่านั้นโดยตั้งใจ เว้นว่างคือปล่อยให้เป็นค่าว่างไป",
         "Used on the first layer only, by design. Leave it empty to just get a blank")),
  ]);

  const layersEl = el("div", {});
  const optWrapEl = el("div", {});

  const rightBody = el("div", {}, [
    presets.node,
    el("h3", { class: "pqp-sect" }, tr("ชั้นการเลือก", "Selection layers")),
    el("p", { class: "pqp-hint" }, tr(
      "หนึ่งชั้นได้หนึ่งคอลัมน์ใหม่ เพิ่มได้เรื่อย ๆ ผลของชั้นก่อนจะถูกส่งต่อเข้าชั้นถัดไปให้เอง",
      "Each layer gives one new column. Add as many as you like, each one is fed the result of the one before"
    )),
    layersEl,
    el("div", { class: "pqp-add" }, [
      button(tr("เพิ่มชั้น", "Add a layer"), { icon: "plus", ghost: true, onclick: addLayer }),
    ]),
    el("h3", { class: "pqp-sect" }, tr("กติกาการนับ", "Counting rules")),
    optWrapEl,
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
    right: { title: tr("ชั้นและกติกา", "Layers & rules"), node: rightBody },
    footer: [copyBtn, dlBtn, shareBtn, resetBtn, st.node],
    note: tr(
      "วางในคิวรีเปล่าผ่าน Advanced Editor ไฟล์ต้องมีคิวรี fnPickDate ด้วย",
      "Paste into a blank query via the Advanced Editor. The file also needs a query named fnPickDate"
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
    const b = el("button", { class: "pqp-mini" + (danger ? " danger" : ""), type: "button", title, "aria-label": title });
    b.textContent = label;
    b.addEventListener("click", onclick);
    return b;
  }

  function switchField(labelText, checked, onchange, hint) {
    const box = el("input", { type: "checkbox" });
    box.checked = checked;
    box.addEventListener("change", () => onchange(box.checked));
    return el("div", {}, [
      el("div", { class: "field pqp-switch-field" }, [
        el("span", {}, labelText),
        el("label", { class: "pqp-switch" }, [box, el("span", { class: "pqp-switch-track" })]),
      ]),
      hint ? el("p", { class: "pqp-hint" }, hint) : null,
    ]);
  }

  function buildCols() {
    colListEl.innerHTML = "";
    columns.forEach((_, i) => {
      const inp = el("input", { type: "text", placeholder: tr("ชื่อคอลัมน์วันที่", "Date column name") });
      inp.value = columns[i] ?? "";
      inp.addEventListener("input", () => { columns[i] = inp.value; render(); });
      const del = miniBtn("×", tr("เอาออก", "Remove"), () => { columns.splice(i, 1); buildCols(); render(); }, true);
      del.disabled = columns.length <= 1;
      colListEl.appendChild(el("div", { class: "pqp-item" }, [inp, del]));
    });
  }

  function buildConvert() {
    convertWrapEl.innerHTML = "";
    convertWrapEl.append(switchField(
      tr("แปลงเป็นวันที่ให้ก่อน 1 บรรทัด", "Convert them to dates first"),
      convertFirst,
      (v) => { convertFirst = v; render(); },
      tr("ตัวเลือกวันที่ไม่แปลงข้อความให้เอง คอลัมน์ที่ยังเป็นข้อความต้องเปิดอันนี้ ไม่งั้นคิวรีจะฟ้อง",
         "The picker never converts text itself. If your columns are still text you need this on, otherwise the query will complain that they are not dates")
    ));
  }

  function layerName(l, i) {
    if (l.name.trim()) return l.name.trim();
    const rank = Number(l.rank) || 1;
    if (l.mode === "MIN") return rank === 1 ? tr("วันที่แรกสุด", "EarliestDate") : tr(`วันที่แรกสุดอันดับ ${rank}`, `EarliestDate${rank}`);
    return rank === 1 ? tr("วันที่ล่าสุด", "LatestDate") : rank === 2 ? tr("วันที่ล่าสุดรองลงมา", "SecondLatestDate") : tr(`วันที่ล่าสุดอันดับ ${rank}`, `LatestDate${rank}`);
  }

  function buildLayers() {
    layersEl.innerHTML = "";
    layers.forEach((l, i) => {
      const modeSel = select([
        ["MAX", tr("มากสุด วันล่าสุด", "Largest, the latest")],
        ["MIN", tr("น้อยสุด วันแรกสุด", "Smallest, the earliest")],
      ], l.mode);
      modeSel.addEventListener("change", () => { l.mode = modeSel.value; buildLayers(); render(); });

      const rankSel = select(
        [1, 2, 3, 4, 5].map((n) => [String(n), n === 1 ? tr("อันดับ 1", "1st") : tr(`อันดับ ${n}`, `${n}th`)]),
        String(Number(l.rank) || 1)
      );
      rankSel.addEventListener("change", () => { l.rank = rankSel.value; buildLayers(); render(); });

      const nameInp = el("input", { type: "text", placeholder: layerName(l, i) });
      nameInp.value = l.name;
      nameInp.addEventListener("input", () => { l.name = nameInp.value; render(); });

      const del = miniBtn("×", tr("ลบชั้นนี้", "Remove this layer"), () => {
        layers.splice(i, 1); buildLayers(); render();
      }, true);
      del.disabled = layers.length <= 1;

      layersEl.appendChild(el("div", { class: "pqp-layer" }, [
        el("div", { class: "pqp-layer-head" }, [
          el("span", { class: "pqp-layer-no" }, tr(`ชั้นที่ ${i + 1}`, `Layer ${i + 1}`)),
          del,
        ]),
        el("div", { class: "pqp-two" }, [
          field(tr("เอาอันไหน", "Which one"), modeSel),
          field(tr("อันดับที่", "Rank"), rankSel),
        ]),
        field(tr("ชื่อคอลัมน์ผลลัพธ์", "Result column name"), nameInp,
          i === 0 && fallback.trim()
            ? tr("ชั้นนี้เป็นชั้นแรก ค่าสำรองจะถูกใช้กับชั้นนี้เท่านั้น", "This is the first layer, the fallback applies only here")
            : tr("เว้นว่างได้ ฟังก์ชันจะตั้งชื่อให้เอง", "Leave it empty and the function names it for you")),
      ]));
    });
  }

  function addLayer() {
    const last = layers[layers.length - 1];
    layers.push({ mode: last ? last.mode : "MAX", rank: String((Number(last?.rank) || 0) + 1 || 1), name: "" });
    buildLayers(); render();
  }

  function buildOpt() {
    optWrapEl.innerHTML = "";
    optWrapEl.append(
      switchField(tr("วันเดียวกันในหลายคอลัมน์ นับเป็นหลายค่า", "Count the same date in several columns as several values"),
        opt.countRepeated, (v) => { opt.countRepeated = v; render(); },
        tr("ปิดไว้คือวันซ้ำนับเป็นค่าเดียว ถ้าเปิด อันดับ 2 มักได้วันเดียวกับอันดับ 1 แล้วช่วงห่างกลายเป็น 0 วัน",
           "Left off, repeated dates count once. Turned on, the 2nd rank usually equals the 1st and the gap collapses to zero days")),
      switchField(tr("ใช้ค่าสำรองกับทุกชั้น ไม่ใช่แค่ชั้นแรก", "Use the fallback on every layer, not just the first"),
        opt.fallbackEveryRank, (v) => { opt.fallbackEveryRank = v; render(); },
        tr("เปิดแล้วแถวที่ไม่มีวันที่จะได้วันเดียวกันทุกชั้น ช่วงห่างกลายเป็น 0 วันทั้งที่จริงคือไม่มีข้อมูล",
           "With this on, rows with no dates get the same day on every layer, so the gap reads as zero days when the truth is no data at all")),
      switchField(tr("ข้ามการตรวจว่าคอลัมน์เป็นวันที่จริง", "Skip checking that the columns really are dates"),
        opt.skipTypeCheck, (v) => { opt.skipTypeCheck = v; render(); },
        tr("เร็วขึ้นเล็กน้อยบนตารางใหญ่ แลกกับการที่พิมพ์ชื่อคอลัมน์ผิดแล้วจะไม่มีใครเตือน",
           "A little faster on big tables, at the cost of nobody warning you when a column name is mistyped")),
    );
  }

  function rebuildAll() {
    buildCols(); buildConvert(); buildLayers(); buildOpt(); render();
  }

  function mId(name) {
    const v = String(name ?? "");
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) && !M_KEYWORDS.has(v) ? v : `#"${v.replace(/"/g, '""')}"`;
  }
  function mStr(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
  function mList(arr) { return `{${arr.map(mStr).join(", ")}}`; }

  /* โค้ดที่ได้เป็นสายพาน: ตารางเข้าชั้น 1 ออกมาเป็นตารางเข้าชั้น 2 ต่อไปเรื่อย ๆ
     คนเขียนมือพลาดตรงนี้บ่อยที่สุด เพราะเผลออ้างตารางต้นทางเดิมทุกชั้น */
  function buildQuery() {
    const cols = columns.map((c) => c.trim()).filter(Boolean);
    const fb = fallback.trim();
    const colsVar = mId(tr("คอลัมน์วันที่", "DateColumns"));
    const lines = ["let"];

    lines.push(tr("    // ประกาศรายชื่อคอลัมน์ครั้งเดียว ทุกชั้นใช้ร่วมกัน",
                  "    // Declare the column list once, shared by every layer"));
    /* ‼️ กล่องโค้ดกว้างจำกัด ชื่อคอลัมน์จริงมักยาวจนล้นออกนอกกรอบ (เห็นกับตาตอนดูจอ 14/09)
       รายการยาวเกินจึงหักเป็นบรรทัดละคอลัมน์ สั้นอยู่แล้วก็ปล่อยไว้บรรทัดเดียว */
    const colsLine = `    ${colsVar} = ${mList(cols)},`;
    if (colsLine.length <= 60) {
      lines.push(colsLine);
    } else {
      lines.push(`    ${colsVar} =`, "    {");
      cols.forEach((c, i) => lines.push(`        ${mStr(c)}${i === cols.length - 1 ? "" : ","}`));
      lines.push("    },");
    }

    let cursor = mId(query);
    if (convertFirst) {
      const step = mId(tr("แปลงวันที่แล้ว", "DatesConverted"));
      const all = fb ? `${colsVar} & ${mList([fb])}` : colsVar;
      lines.push(tr("    // ตัวเลือกวันที่ไม่แปลงข้อความให้ ต้องแปลงก่อน",
                    "    // The picker won't convert text, so convert first"));
      const conv = `    ${step} = fnToDate(${cursor}, ${all}),`;
      if (conv.length <= 60) {
        lines.push(conv);
      } else {
        lines.push(`    ${step} = fnToDate(`, `        ${cursor},`, `        ${all}`, "    ),");
      }
      cursor = step;
    }

    const opts = [];
    if (opt.countRepeated) opts.push("CountRepeatedDates = true");
    if (opt.fallbackEveryRank) opts.push("FallbackEveryRank = true");
    if (opt.skipTypeCheck) opts.push("SkipTypeCheck = true");
    const optArg = opts.length ? `[ ${opts.join(", ")} ]` : null;

    layers.forEach((l, i) => {
      const name = layerName(l, i);
      const step = mId(name);
      const rank = String(Number(l.rank) || 1);
      // ‼️ ค่าสำรองใส่เฉพาะชั้นแรก ชั้นหลังส่ง null เพื่อไม่ให้ได้วันเดียวกันทุกชั้น
      const useFb = i === 0 && fb;
      const args = [cursor, colsVar, mStr(l.mode), rank];
      const needName = true;               // ตั้งชื่อให้ชัดเสมอ อ่านโค้ดแล้วรู้ทันทีว่าคอลัมน์ไหนคืออะไร
      if (useFb || needName || optArg) args.push(useFb ? mStr(fb) : "null");
      if (needName || optArg) args.push(mStr(name));
      if (optArg) args.push(optArg);

      const last = i === layers.length - 1;
      const oneLine = `    ${step} = fnPickDate(${args.join(", ")})${last ? "" : ","}`;
      if (oneLine.length <= 60) {
        lines.push(oneLine);
      } else {
        lines.push(`    ${step} = fnPickDate(`);
        args.forEach((a, ai) => lines.push(`        ${a}${ai === args.length - 1 ? "" : ","}`));
        lines.push(`    )${last ? "" : ","}`);
      }
      cursor = step;
    });

    lines.push("in", `    ${cursor}`);
    return lines.join("\n");
  }

  /* ── ท่าเดียวกันในภาษา T-SQL ────────────────────────────────────
     ‼️ พิสูจน์บน SQL Server 2022 จริงแล้ว 14/09
     คลี่หลายคอลัมน์เป็นแถวด้วย CROSS APPLY (VALUES ...) แล้วจัดอันดับด้วย ROW_NUMBER
     `SELECT DISTINCT` คือกติกา "วันซ้ำนับเป็นค่าเดียว" ของฝั่ง Power Query เป๊ะ ๆ
     แถวที่ไม่มีวันที่เลยได้ NULL ทุกอันดับ ค่าสำรองจึงเติมได้เฉพาะอันดับแรกเหมือนกัน */
  function buildSql() {
    const cols = columns.map((c) => c.trim()).filter(Boolean);
    const fb = fallback.trim();
    const table = sqlTable(query);
    if (!cols.length || !layers.length) {
      return sqlHeader(tr("ยังกรอกไม่ครบ", "Not enough information yet"));
    }
    const maxRank = Math.max(...layers.map((l) => Number(l.rank) || 1));
    const dir = layers.some((l) => l.mode === "MIN") && layers.every((l) => l.mode === "MIN") ? "ASC" : null;

    const lines = [sqlHeader(tr("เลือกวันที่จากหลายคอลัมน์", "Pick dates across several columns"))];
    if (convertFirst) {
      lines.push(tr("-- คอลัมน์ต้องเป็นชนิดวันที่แล้ว ถ้ายังเป็นข้อความให้ครอบ TRY_CONVERT(date, col, 103) ก่อน",
                    "-- Columns must already be dates. If they are still text, wrap them in TRY_CONVERT(date, col, 103) first"));
    }
    lines.push("SELECT");
    lines.push("    t.*,");
    const outs = layers.map((l, i) => {
      const name = layerName(l, i);
      const rank = Number(l.rank) || 1;
      const col = l.mode === "MIN" ? `v.[min${rank}]` : `v.[max${rank}]`;
      // ‼️ ค่าสำรองใช้กับชั้นแรกเท่านั้น เหมือนฝั่ง Power Query ไม่งั้นช่วงห่างกลายเป็น 0 วันปลอม
      const withFb = i === 0 && fb && !opt.fallbackEveryRank ? `COALESCE(${col}, ${sqlId(fb)})` : col;
      const withFbAll = fb && opt.fallbackEveryRank ? `COALESCE(${col}, ${sqlId(fb)})` : withFb;
      return `    ${withFbAll} AS ${sqlId(name)}`;
    });
    lines.push(outs.join(",\n"));
    lines.push(`FROM ${table} AS t`);
    lines.push("CROSS APPLY (");
    lines.push("    SELECT");
    const picks = [];
    for (let r = 1; r <= maxRank; r++) {
      if (layers.some((l) => l.mode === "MAX" && (Number(l.rank) || 1) === r)) {
        picks.push(`        MAX(CASE WHEN [rn_desc] = ${r} THEN [d] END) AS [max${r}]`);
      }
      if (layers.some((l) => l.mode === "MIN" && (Number(l.rank) || 1) === r)) {
        picks.push(`        MAX(CASE WHEN [rn_asc] = ${r} THEN [d] END) AS [min${r}]`);
      }
    }
    lines.push(picks.join(",\n"));
    lines.push("    FROM (");
    lines.push("        SELECT [d],");
    lines.push("               ROW_NUMBER() OVER (ORDER BY [d] DESC) AS [rn_desc],");
    lines.push("               ROW_NUMBER() OVER (ORDER BY [d] ASC)  AS [rn_asc]");
    lines.push("        FROM (");
    // ‼️ DISTINCT = กติกาวันซ้ำนับเป็นค่าเดียว ปิดกติกานี้เมื่อไหร่ก็ถอด DISTINCT ออก
    lines.push(`            SELECT ${opt.countRepeated ? "" : "DISTINCT "}[d]`);
    lines.push(`            FROM (VALUES ${cols.map((c) => `(t.${sqlId(c)})`).join(", ")}) AS x([d])`);
    lines.push("            WHERE [d] IS NOT NULL");
    lines.push("        ) AS u");
    lines.push("    ) AS r");
    lines.push(") AS v;");
    return lines.join("\n");
  }

  function warnings() {
    const msgs = [];
    const cols = columns.map((c) => c.trim()).filter(Boolean);
    if (!cols.length) msgs.push(tr("ยังไม่ได้ใส่คอลัมน์วันที่", "No date column yet"));
    if (!layers.length) msgs.push(tr("ยังไม่ได้เพิ่มชั้นการเลือกเลย", "No selection layer yet"));

    const dup = cols.filter((n, i) => cols.indexOf(n) !== i);
    if (dup.length) msgs.push(tr(`ใส่คอลัมน์ ${[...new Set(dup)].join(", ")} ซ้ำสองครั้ง`, `Column ${[...new Set(dup)].join(", ")} is listed twice`));

    const names = layers.map((l, i) => layerName(l, i));
    const dupName = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupName.length) {
      msgs.push(tr(
        `ชั้นที่ตั้งชื่อผลลัพธ์ซ้ำกัน: ${[...new Set(dupName)].join(", ")} คอลัมน์หลังจะทับคอลัมน์แรก`,
        `Layers sharing a result name: ${[...new Set(dupName)].join(", ")}, the later one overwrites the first`
      ));
    }

    const maxRank = Math.max(...layers.map((l) => Number(l.rank) || 1));
    if (maxRank > cols.length) {
      msgs.push(tr(
        `ขออันดับที่ ${maxRank} แต่มีคอลัมน์วันที่แค่ ${cols.length} คอลัมน์ แถวส่วนใหญ่จะได้ค่าว่าง`,
        `You asked for rank ${maxRank} but there are only ${cols.length} date columns, so most rows come back blank`
      ));
    }

    if (opt.fallbackEveryRank && layers.length > 1) {
      msgs.push(tr(
        "ใช้ค่าสำรองทุกชั้น แถวที่ไม่มีวันที่จะได้วันเดียวกัน เอาไปลบกันได้ 0 วันที่ไม่ใช่ความจริง",
        "With the fallback on every layer, rows without dates get the same day everywhere and subtracting them gives a zero that is not real"
      ));
    }
    if (opt.countRepeated && layers.length > 1) {
      msgs.push(tr(
        "เปิดให้นับวันซ้ำ ระบบต้นทางที่ลงวันเดียวกันหลายคอลัมน์จะทำให้อันดับ 2 เท่ากับอันดับ 1",
        "Counting repeated dates means a source that stamps the same day in several columns makes rank 2 equal rank 1"
      ));
    }
    if (!convertFirst) {
      msgs.push(tr(
        "ปิดการแปลงวันที่ไว้ ถ้าคอลัมน์ยังเป็นข้อความอยู่ คิวรีจะฟ้องว่าคอลัมน์ไม่ใช่ชนิดวันที่",
        "Date conversion is off, so if the columns are still text the query will complain that they are not dates"
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
        ? tr("คัดลอกตัวฟังก์ชันแล้ว สร้างคิวรีชื่อ fnPickDate แล้ววางได้เลย", "Function copied, make a query named fnPickDate and paste it")
        : convertFirst
          ? tr("คัดลอกแล้ว โค้ดนี้เรียกทั้ง fnToDate และ fnPickDate ไฟล์ต้องมีทั้งสองคิวรี", "Copied. This code calls both fnToDate and fnPickDate, so the file needs both queries")
          : view === "sql"
            ? tr("คัดลอกแล้ว เอาไปรันใน SSMS ได้เลย", "Copied, run it in SSMS")
            : tr("คัดลอกแล้ว วางใน Advanced Editor ได้เลย", "Copied, paste it into the Advanced Editor"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    const name = view === "fn" ? "fnPickDate.pq" : view === "sql" ? "pick-date.sql" : "pick-date.pq";
    download(new Blob([codeEl.textContent], { type: "text/plain;charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }

  function applyPreset(kind) {
    const fresh = SEED();
    query = fresh.query;
    columns = fresh.columns;
    convertFirst = fresh.convertFirst;
    fallback = fresh.fallback;
    layers = fresh.layers;
    Object.assign(opt, fresh.opt);

    if (kind === "span") layers = [{ mode: "MIN", rank: "1", name: "" }, { mode: "MAX", rank: "1", name: "" }];
    if (kind === "one") layers = [{ mode: "MAX", rank: "1", name: "" }];

    queryInput.value = query;
    fallbackInput.value = fallback;
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
    applyPreset("sla");
    state.clear();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Back to the defaults"));
  }
}
