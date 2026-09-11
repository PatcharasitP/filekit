import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { tr } from "../i18n.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { stateKit, SHARE_MSG } from "../statekit.js";

/* ‼️ เครื่องนี้ "สร้างโค้ดเรียกใช้" ไม่ได้เขียนฟังก์ชันขึ้นใหม่
 * ตัวฟังก์ชัน fnMultiSourceFallbackLookup มีอยู่จริงและผ่านเทส 40/40 มาแล้ว
 * (Data/ADVANCE/fnMultiSourceFallbackLookup.pq) สิ่งที่คนเสียเวลาที่สุดคือการนั่งประกอบ
 * ลิสต์ Sources ให้ถูกวงเล็บถูกเครื่องหมาย โดยเฉพาะ Payload map ที่ต้องจับคู่
 * "ชื่อผลลัพธ์ที่อยากได้" กับ "ชื่อคอลัมน์จริงของแต่ละแหล่งซึ่งมักตั้งไม่เหมือนกัน"
 * ตารางกริดในแผงขวาคือหัวใจของเครื่องนี้ 1 แถว = 1 คอลัมน์ผลลัพธ์ 1 ช่อง = ชื่อในแหล่งนั้น
 */

// ‼️ คำสงวนของ M ถ้าชื่อไปตรงกับพวกนี้ต้องครอบ #"..." เสมอ ไม่งั้นคิวรีพัง
const M_KEYWORDS = new Set([
  "and", "as", "each", "else", "error", "false", "if", "in", "is", "let", "meta",
  "not", "otherwise", "or", "section", "shared", "then", "true", "try", "type",
]);


const FN_URL = "samples/powerquery/fnMultiSourceFallbackLookup.pq";

const STYLE = `
.pqm-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(62vh,600px)}
.pqm-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre}
.pqm-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}

.pqm-src{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  padding:11px 12px;margin-bottom:10px}
.pqm-src-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.pqm-src-no{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-mute)}
.pqm-src-btns{display:flex;gap:4px}
.pqm-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px}
.pqm-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pqm-mini:disabled{opacity:.35;cursor:default}
/* ‼️ นิ้วแตะต้องการ 36x36px (WCAG 2.5.8 / Apple HIG / Material) แต่ปุ่มไอคอนพวกนี้กว้าง 26px
   วัดบนจอ 390x844 จริงแล้วตกเกณฑ์ทุกใบ (tests/browser_mobile.py ข้อ ④)
   ขยายเฉพาะอุปกรณ์สัมผัส เมาส์บนจอใหญ่คงขนาดกระชับเหมือนเดิม */
@media (pointer:coarse){ .pqm-mini{width:36px;height:36px} }
.pqm-mini.danger:hover:not(:disabled){border-color:#d64550;color:#d64550}

.pqm-grid{display:flex;flex-direction:column;gap:8px}
.pqm-row{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px}
.pqm-row-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.pqm-row-head input{flex:1}
.pqm-from{display:flex;flex-direction:column;gap:6px}
.pqm-from label{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-mute)}
.pqm-from span{flex:0 0 40%;word-break:break-word}
.pqm-from input{flex:1;min-width:0}
.pqm-hint{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 0 0}
.pqm-add{margin-top:4px}
${PRESETS_CSS}
.pqm-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}

/* ‼️ คลาสสองชุดนี้ยืมชื่อมาจากเครื่องมือกราฟโดนัท แต่ CSS ของมันฝังอยู่ในโมดูลนั้น
   หน้านี้ไม่ได้โหลดโมดูลนั้น จึงต้องประกาศเองซ้ำ ไม่งั้นสวิตช์กลายเป็นช่องติ๊กเปล่า
   (เจอจริงตอนดูจอ 11/09/2026) กฎของโปรเจกต์คือสไตล์อยู่ในโมดูลตัวเอง ห้ามไปแก้ tool.css */
.pbid-group-title{margin:0 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
.pbid-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pbid-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pbid-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pbid-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pbid-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pbid-switch input:checked + .pbid-switch-track{background:var(--g-powerbi,var(--brand))}
.pbid-switch input:checked + .pbid-switch-track::after{transform:translateX(18px)}
.pbid-switch input:focus-visible + .pbid-switch-track{outline:2px solid var(--brand);outline-offset:2px}
/* ‼️ สวิตช์สูง 24px เตี้ยกว่าเกณฑ์นิ้วแตะ 36px — ยืดกรอบที่กดได้เป็น 36 แต่คงรางสูง 24 เท่าเดิม
   โดยดันขอบบนล่างเข้ามา 6px (ทับ inset:0 ของราง) หน้าตาจึงไม่เปลี่ยน แค่กดโดนง่ายขึ้น */
@media (pointer:coarse){
  .pbid-switch{height:36px}
  .pbid-switch-track{top:6px;bottom:6px}
}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  // ‼️ ค่าเริ่มต้นต้องเปลี่ยนตามภาษาด้วย ไม่งั้นโหมดอังกฤษได้โค้ดตัวอย่างที่เป็นไทยล้วน
  // (เทส browser_lang.py จับเจอจริง 11/09/2026) · สลับภาษา = โหลดหน้าใหม่ ค่าพวกนี้จึงคงที่ตลอดอายุหน้า
  const DEFAULTS = {
    separator: ",",
    notFound: tr("ไม่พบ", "not found"),
    codeName: "Matched_Code", viaName: "Match_Via", sourceName: "Match_Source",
  };
  const SEED = () => ({
    main: { query: tr("ตารางหลัก", "MainTable"), codeColumn: "Site Code" },
    sources: [
      { name: "Latest Contract", table: "Latest Contract",
        keys: [tr("รหัสสถานี", "Site ID"), tr("รหัสสถานีเดิม", "Old Site ID")], label: "" },
      { name: "SAP", table: "SAP_SM", keys: ["Site Code"], label: "" },
    ],
    payload: [
      { out: "Company", from: ["Company", "CSType"] },
      { out: "SITE OWNER", from: ["SITE OWNER", "Owner"] },
    ],
  });

  // ── สถานะทั้งหมดของเครื่องมือ ─────────────────────────────────────
  /* ‼️ ชุดพร้อมใช้ของเครื่องนี้คือ "รูปแบบการใช้งาน" ไม่ใช่หน้าตา
     เพราะสิ่งที่คนติดคือไม่รู้ว่าโครง Sources ควรหน้าตายังไงในแต่ละสถานการณ์ */
  const PRESETS = [
    { id: "two", name: tr("สองแหล่ง", "Two sources"),
      desc: tr("ค้นจากสัญญาใหม่ก่อน ไม่เจอค่อยไปดูระบบหลัง", "Look in the newer table first, fall back to the back office system"),
      values: null },
    { id: "three", name: tr("สามแหล่ง", "Three sources"),
      desc: tr("เพิ่มแหล่งสำรองไว้ท้ายสุด", "Adds a third fallback at the end"),
      values: "three" },
    { id: "multikey", name: tr("แหล่งเดียว key หลายชั้น", "One source, layered keys"),
      desc: tr("ตารางเดียวแต่รหัสมีหลายแบบ ลองทีละชั้นจนเจอ", "One table where the code comes in several forms, tried one layer at a time"),
      values: "multikey" },
  ];

  const seed = SEED();
  const main = seed.main;
  let sources = seed.sources;
  // 1 แถว = 1 คอลัมน์ผลลัพธ์ · from[i] = ชื่อคอลัมน์ในแหล่งที่ i (ว่าง = แหล่งนั้นไม่มีคอลัมน์นี้)
  let payload = seed.payload;
  const options = { ...DEFAULTS, keepPerSource: false };
  let view = "query";
  let fnText = null;

  /* ‼️ ต้องประกาศก่อนโค้ดที่สร้างแผง ไม่ใช่ใต้มัน
     const ไม่ hoist วางผิดที่ได้ ReferenceError ทันที (พลาดครั้งที่ 4 แล้ว ดู PROVEN.md) */
  const presets = presetBar(PRESETS, applyPreset);
  const state = stateKit(tool.id, {
    defaults: SEED(),
    collect: () => ({ main: { ...main }, sources, payload, options: { ...options } }),
    apply: (v) => {
      if (v.main) Object.assign(main, v.main);
      if (Array.isArray(v.sources)) sources = v.sources;
      if (Array.isArray(v.payload)) payload = v.payload;
      if (v.options) Object.assign(options, v.options);
    },
  });

  const codeEl = el("code", {});
  const warnEl = el("div", { class: "pqm-warn", hidden: true });
  const tabQuery = button(tr("คิวรีที่ได้", "Generated query"), { onclick: () => setView("query") });
  const tabFn = button(tr("ตัวฟังก์ชัน", "The function"), { ghost: true, onclick: () => setView("fn") });
  const centerNode = el("div", {}, [
    el("div", { class: "pqm-tabs" }, [tabQuery, tabFn]),
    warnEl,
    el("pre", { class: "pqm-code" }, [codeEl]),
  ]);

  const srcListEl = el("div", {});
  const addSrcBtn = button(tr("เพิ่มแหล่ง", "Add a source"), { icon: "plus", ghost: true, onclick: addSource });
  const leftBody = el("div", {}, [
    field(tr("ชื่อคิวรีตารางหลัก", "Main query name"), textInput(main, "query")),
    field(tr("คอลัมน์ที่ใช้ค้น (ในตารางหลัก)", "Lookup column in the main table"), textInput(main, "codeColumn"),
      tr("ช่องเดียวใส่หลายรหัสคั่นด้วยตัวคั่นได้", "One cell may hold several codes separated by the separator")),
    el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("แหล่งข้อมูล เรียงตามลำดับที่จะค้น", "Sources, in the order they are searched")),
    el("p", { class: "pqm-hint" }, tr(
      "ค้นจากบนลงล่าง เจอแหล่งไหนก่อนก็หยุด แหล่งที่เหลือไม่ถูกแตะเลย",
      "Searched top to bottom, it stops at the first hit and never touches the rest"
    )),
    srcListEl,
    el("div", { class: "pqm-add" }, [addSrcBtn]),
  ]);

  const gridEl = el("div", { class: "pqm-grid" });
  const addRowBtn = button(tr("เพิ่มคอลัมน์ผลลัพธ์", "Add an output column"), { icon: "plus", ghost: true, onclick: addPayloadRow });
  const optionsEl = el("div", {});
  const rightBody = el("div", {}, [
    presets.node,
    el("h3", { class: "pbid-group-title" }, tr("คอลัมน์ผลลัพธ์", "Output columns")),
    el("p", { class: "pqm-hint" }, tr(
      "ชื่อซ้ายคือคอลัมน์ที่จะได้ ข้างในคือชื่อจริงของแต่ละแหล่ง เว้นว่างถ้าแหล่งนั้นไม่มี",
      "The left name is the column you get, inside are the real names per source. Leave one empty when it has none"
    )),
    gridEl,
    el("div", { class: "pqm-add" }, [addRowBtn]),
    el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("ตัวเลือก", "Options")),
    optionsEl,
  ]);

  const copyBtn = button(tr("คัดลอกโค้ด", "Copy code"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .pq", "Download .pq"), { icon: "download", ghost: true, onclick: onDownload });
  const shareBtn = button(tr("คัดลอกลิงก์ค่านี้", "Copy a link to these settings"), { icon: "copy", ghost: true, onclick: onShare });
  const resetBtn = button(tr("คืนค่าเริ่มต้น", "Reset to defaults"), { icon: "undo", ghost: true, onclick: onReset });

  const ws = workspace(tool, {
    left: {
      title: tr("แหล่งข้อมูล", "Sources"), node: leftBody,
      hint: tr("กรอกชื่อคิวรีและชื่อคอลัมน์ตามที่มีอยู่จริงในไฟล์ของคุณ", "Use the query and column names exactly as they are in your own file"),
    },
    center: { title: tr("โค้ด Power Query", "Power Query code"), node: centerNode },
    right: { title: tr("ผลลัพธ์และตัวเลือก", "Output & options"), node: rightBody },
    footer: [copyBtn, dlBtn, shareBtn, resetBtn, st.node],
    note: tr(
      "วางในคิวรีเปล่าผ่าน Advanced Editor ไฟล์ต้องมีคิวรี fnMultiSourceFallbackLookup ด้วย",
      "Paste into a blank query via the Advanced Editor. The file also needs a query named fnMultiSourceFallbackLookup"
    ),
  });
  ws.wrap.prepend(styleEl);
  ws.showCanvas(true);

  const restored = state.restore();
  buildSources();
  buildGrid();
  buildOptions();
  render();
  if (restored) {
    st.ok(state.hasLink()
      ? tr("เปิดด้วยค่าที่มากับลิงก์", "Opened with the settings from the link")
      : tr("ใช้ค่าที่คุณตั้งไว้ครั้งก่อน", "Using the settings you had last time"));
    state.dropLinkParam();
  }

  return ws.wrap;

  /* ── ช่องกรอกที่ผูกกับ object โดยตรง ──────────────────────────────── */
  function textInput(obj, key, onInput) {
    const input = el("input", { type: "text" });
    input.value = obj[key] ?? "";
    input.addEventListener("input", () => {
      obj[key] = input.value;
      presets.clearActive();
      if (onInput) onInput();
      render();
    });
    return input;
  }

  /* ── แผงซ้าย: การ์ดของแต่ละแหล่ง ─────────────────────────────────── */
  function buildSources() {
    srcListEl.innerHTML = "";
    sources.forEach((s, i) => srcListEl.appendChild(sourceCard(s, i)));
  }

  function sourceCard(s, i) {
    const up = miniBtn("↑", tr("เลื่อนขึ้น", "Move up"), () => moveSource(i, -1));
    const down = miniBtn("↓", tr("เลื่อนลง", "Move down"), () => moveSource(i, 1));
    const del = miniBtn("×", tr("ลบแหล่งนี้", "Remove this source"), () => removeSource(i), true);
    up.disabled = i === 0;
    down.disabled = i === sources.length - 1;
    del.disabled = sources.length <= 1;

    const keysInput = el("input", { type: "text" });
    keysInput.value = s.keys.join(", ");
    keysInput.addEventListener("input", () => {
      s.keys = keysInput.value.split(",").map((x) => x.trim()).filter(Boolean);
      render();
    });

    return el("div", { class: "pqm-src" }, [
      el("div", { class: "pqm-src-head" }, [
        el("span", { class: "pqm-src-no" }, tr(`แหล่งที่ ${i + 1}`, `Source ${i + 1}`)),
        el("div", { class: "pqm-src-btns" }, [up, down, del]),
      ]),
      field(tr("ชื่อแหล่ง", "Source name"), textInput(s, "name"),
        tr("ชื่อนี้จะไปโผล่ในคอลัมน์ Match_Source", "This shows up in the Match_Source column")),
      field(tr("ชื่อคิวรีตารางที่จะค้น", "Query name of the lookup table"), textInput(s, "table")),
      field(tr("คอลัมน์ key เรียงตามลำดับ", "Key columns, in order"), keysInput,
        tr("คั่นด้วยจุลภาค ค้นชั้นแรกไม่เจอค่อยไปชั้นถัดไป", "Comma separated, it tries the next one only when the first misses")),
      field(tr("ป้ายกำกับแบบไดนามิก (ไม่ใส่ก็ได้)", "Dynamic label (optional)"), textInput(s, "label"),
        tr('ใส่นิพจน์ M เช่น "Site Rental - " & [Type] จะเอาไปต่อท้าย each ให้เอง', 'An M expression such as "Site Rental - " & [Type], it is placed after each for you')),
    ]);
  }

  function miniBtn(text, label, onclick, danger) {
    return el("button", {
      class: "pqm-mini" + (danger ? " danger" : ""), type: "button",
      title: label, "aria-label": label, onclick,
    }, text);
  }

  function moveSource(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= sources.length) return;
    [sources[i], sources[j]] = [sources[j], sources[i]];
    for (const row of payload) [row.from[i], row.from[j]] = [row.from[j], row.from[i]];
    buildSources(); buildGrid(); render();
  }

  function removeSource(i) {
    if (sources.length <= 1) return;
    sources.splice(i, 1);
    for (const row of payload) row.from.splice(i, 1);
    buildSources(); buildGrid(); render();
  }

  function addSource() {
    sources.push({ name: tr(`แหล่งที่ ${sources.length + 1}`, `Source ${sources.length + 1}`), table: "", keys: [], label: "" });
    for (const row of payload) row.from.push("");
    buildSources(); buildGrid(); render();
  }

  /* ── แผงขวา: กริดจับคู่ชื่อผลลัพธ์กับชื่อคอลัมน์ของแต่ละแหล่ง ─────── */
  function buildGrid() {
    gridEl.innerHTML = "";
    payload.forEach((row, ri) => {
      const outInput = el("input", { type: "text", placeholder: tr("ชื่อคอลัมน์ผลลัพธ์", "Output column name") });
      outInput.value = row.out;
      outInput.addEventListener("input", () => { row.out = outInput.value; render(); });

      const del = miniBtn("×", tr("ลบแถวนี้", "Remove this row"), () => {
        payload.splice(ri, 1); buildGrid(); render();
      }, true);

      const froms = el("div", { class: "pqm-from" }, sources.map((s, si) => {
        const inp = el("input", { type: "text", placeholder: tr("ไม่มีในแหล่งนี้", "not in this source") });
        inp.value = row.from[si] ?? "";
        inp.addEventListener("input", () => { row.from[si] = inp.value; render(); });
        return el("label", {}, [el("span", {}, s.name || tr(`แหล่งที่ ${si + 1}`, `Source ${si + 1}`)), inp]);
      }));

      gridEl.appendChild(el("div", { class: "pqm-row" }, [
        el("div", { class: "pqm-row-head" }, [outInput, del]),
        froms,
      ]));
    });
  }

  function addPayloadRow() {
    payload.push({ out: "", from: sources.map(() => "") });
    buildGrid(); render();
  }

  function buildOptions() {
    optionsEl.innerHTML = "";
    const keep = el("input", { type: "checkbox" });
    keep.checked = options.keepPerSource;
    keep.addEventListener("change", () => { options.keepPerSource = keep.checked; render(); });

    optionsEl.append(
      field(tr("ตัวคั่นรหัสในเซลล์เดียว", "Separator inside one cell"), textInput(options, "separator")),
      field(tr("ข้อความเมื่อหาไม่เจอ", "Text when nothing matches"), textInput(options, "notFound")),
      field(tr("ชื่อคอลัมน์รหัสที่ชนได้", "Name of the matched code column"), textInput(options, "codeName")),
      field(tr("ชื่อคอลัมน์บอก key ที่ชน", "Name of the matched key column"), textInput(options, "viaName")),
      field(tr("ชื่อคอลัมน์บอกแหล่งที่ชน", "Name of the matched source column"), textInput(options, "sourceName")),
      el("div", { class: "field pbid-switch-field" }, [
        el("span", {}, tr("เก็บผลลัพธ์แยกรายแหล่งด้วย", "Also keep a column per source")),
        el("label", { class: "pbid-switch" }, [keep, el("span", { class: "pbid-switch-track" })]),
      ])
    );
  }

  /* ── ตัวช่วยเขียน M ให้ถูกไวยากรณ์เสมอ ───────────────────────────── */
  // ชื่อที่ไม่ใช่ตัวระบุ M ธรรมดา (มีเว้นวรรค ภาษาไทย ขึ้นต้นด้วยเลข หรือชนคำสงวน) ต้องครอบ #"..."
  function mId(name) {
    const s = String(name ?? "");
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !M_KEYWORDS.has(s) ? s : `#"${s.replace(/"/g, '""')}"`;
  }
  function mStr(s) {
    return `"${String(s ?? "").replace(/"/g, '""')}"`;
  }

  function buildQuery() {
    const srcBlocks = sources.map((s) => {
      const lines = [
        `        [ Name    = ${mStr(s.name)},`,
        `          Table   = ${mId(s.table)},`,
        `          Keys    = {${s.keys.map(mStr).join(", ")}},`,
      ];
      const pairs = payload
        .map((row, ri) => ({ out: row.out.trim(), from: (row.from[sources.indexOf(s)] ?? "").trim(), ri }))
        .filter((x) => x.out && x.from)
        .map((x) => `${mId(x.out)} = ${mStr(x.from)}`);
      const label = s.label.trim();
      lines.push(`          Payload = [ ${pairs.join(", ")} ]${label ? "," : " ]"}`);
      if (label) lines.push(`          Label   = each ${label} ]`);
      return lines.join("\n");
    });

    const optPairs = [];
    if (options.separator !== DEFAULTS.separator) optPairs.push(`Separator = ${mStr(options.separator)}`);
    if (options.keepPerSource) optPairs.push("KeepPerSource = true");
    if (options.notFound !== DEFAULTS.notFound) optPairs.push(`NotFound = ${mStr(options.notFound)}`);
    if (options.codeName !== DEFAULTS.codeName) optPairs.push(`CodeName = ${mStr(options.codeName)}`);
    if (options.viaName !== DEFAULTS.viaName) optPairs.push(`ViaName = ${mStr(options.viaName)}`);
    if (options.sourceName !== DEFAULTS.sourceName) optPairs.push(`SourceName = ${mStr(options.sourceName)}`);
    const optArg = optPairs.length ? `, [ ${optPairs.join(", ")} ]` : "";

    const stepName = mId(tr("เติมข้อมูลจากหลายแหล่ง", "AddedFromSources"));
    return [
      "let",
      tr("    // แหล่งข้อมูลเรียงตามลำดับ ค้นจากบนลงล่าง เจอแหล่งแรกแล้วหยุด",
         "    // Sources in priority order, searched top to bottom, stopping at the first hit"),
      "    Sources =",
      "    {",
      srcBlocks.join(",\n\n"),
      "    },",
      `    ${stepName} = fnMultiSourceFallbackLookup(${mId(main.query)}, ${mStr(main.codeColumn)}, Sources${optArg})`,
      "in",
      `    ${stepName}`,
    ].join("\n");
  }

  /* ‼️ 3 อย่างที่ทำให้คิวรีพังหรือได้ผลผิดแบบเงียบ จับให้เห็นตั้งแต่ตอนนี้
   * ① ชื่อผลลัพธ์ซ้ำกัน จะเหลือแค่อันสุดท้าย M ไม่เตือนอะไรเลย
   * ② แหล่งที่ไม่มี key เลย จะค้นอะไรไม่ได้
   * ③ ชื่อผลลัพธ์ที่ไม่มีแหล่งไหนกรอกชื่อคอลัมน์ให้เลย จะไม่มีคอลัมน์นั้นออกมา */
  function warnings() {
    const msgs = [];
    const outs = payload.map((r) => r.out.trim()).filter(Boolean);
    const dup = outs.filter((n, i) => outs.indexOf(n) !== i);
    if (dup.length) {
      msgs.push(tr(
        `ชื่อคอลัมน์ผลลัพธ์ซ้ำกัน: ${[...new Set(dup)].join(", ")} จะเหลือแค่อันสุดท้ายอันเดียว`,
        `Duplicate output column names: ${[...new Set(dup)].join(", ")}, only the last one survives`
      ));
    }
    const noKeys = sources.filter((s) => !s.keys.length).map((s) => s.name || "?");
    if (noKeys.length) {
      msgs.push(tr(`แหล่งที่ยังไม่ได้ใส่คอลัมน์ key: ${noKeys.join(", ")}`, `Sources with no key column yet: ${noKeys.join(", ")}`));
    }
    const orphan = payload.filter((r) => r.out.trim() && !r.from.some((f) => (f || "").trim())).map((r) => r.out.trim());
    if (orphan.length) {
      msgs.push(tr(
        `ยังไม่ได้บอกว่า ${orphan.join(", ")} มาจากคอลัมน์ไหนสักแหล่ง จะไม่มีคอลัมน์นี้ออกมา`,
        `No source column given for ${orphan.join(", ")} yet, so that column will not appear`
      ));
    }
    const noTable = sources.filter((s) => !s.table.trim()).map((s) => s.name || "?");
    if (noTable.length) {
      msgs.push(tr(`แหล่งที่ยังไม่ได้ใส่ชื่อคิวรีตาราง: ${noTable.join(", ")}`, `Sources with no query name yet: ${noTable.join(", ")}`));
    }
    return msgs;
  }

  function render() {
    state.save();
    if (view === "fn") return;
    codeEl.textContent = buildQuery();
    const msgs = warnings();
    warnEl.hidden = msgs.length === 0;
    warnEl.textContent = msgs.join("  ");
  }

  async function setView(v) {
    view = v;
    tabQuery.classList.toggle("ghost", v !== "query");
    tabFn.classList.toggle("ghost", v !== "fn");
    if (v === "query") { render(); return; }
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
    codeEl.textContent = fnText;
  }

  /* ── ปุ่มล่าง ─────────────────────────────────────────────────────── */
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      st.ok(view === "fn"
        ? tr("คัดลอกตัวฟังก์ชันแล้ว สร้างคิวรีชื่อ fnMultiSourceFallbackLookup แล้ววางได้เลย", "Function copied, make a query named fnMultiSourceFallbackLookup and paste it")
        : tr("คัดลอกแล้ว วางใน Advanced Editor ได้เลย", "Copied, paste it into the Advanced Editor"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    const name = view === "fn" ? "fnMultiSourceFallbackLookup.pq" : "multisource-lookup.pq";
    download(new Blob([codeEl.textContent], { type: "text/plain;charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }

  /* ชุดพร้อมใช้ของเครื่องนี้เปลี่ยนโครง Sources ทั้งชุด จึงสร้างจาก SEED ใหม่ทุกครั้ง
     แล้วต่อเติมตามรูปแบบที่เลือก ไม่ใช่แก้ของเดิมทับ */
  function applyPreset(kind) {
    const fresh = SEED();
    main.query = fresh.main.query;
    main.codeColumn = fresh.main.codeColumn;
    sources = fresh.sources;
    payload = fresh.payload;
    Object.assign(options, DEFAULTS, { keepPerSource: false });

    if (kind === "three") {
      sources.push({ name: tr("แหล่งสำรอง", "Backup source"), table: "BACKUP_TABLE",
                     keys: [main.codeColumn], label: "" });
      for (const row of payload) row.from.push("");
    } else if (kind === "multikey") {
      const first = sources[0];
      first.keys = [tr("รหัสหลัก", "MainCode"), tr("รหัสเดิม", "OldCode"), tr("รหัสสำรอง", "AltCode")];
      sources = [first];
      for (const row of payload) row.from = [row.from[0]];
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
    main.query = fresh.main.query;
    main.codeColumn = fresh.main.codeColumn;
    sources = fresh.sources;
    payload = fresh.payload;
    Object.assign(options, DEFAULTS, { keepPerSource: false });
    rebuildAll();
    state.forget();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Reset to defaults"));
  }

  // ‼️ ช่องกรอกผูกค่าตอนสร้าง จึงต้องสร้างใหม่ทั้งแผงเมื่อคืนค่า ไม่งั้นตัวเลขในจอไม่ตรงกับข้างใน
  function rebuildAll() {
    leftBody.replaceChild(field(tr("ชื่อคิวรีตารางหลัก", "Main query name"), textInput(main, "query")), leftBody.firstChild);
    leftBody.replaceChild(
      field(tr("คอลัมน์ที่ใช้ค้น (ในตารางหลัก)", "Lookup column in the main table"), textInput(main, "codeColumn"),
        tr("ช่องเดียวใส่หลายรหัสคั่นด้วยตัวคั่นได้", "One cell may hold several codes separated by the separator")),
      leftBody.children[1]
    );
    // ‼️ แผงขวาถูกสร้างใหม่ทั้งก้อนตอนคืนค่า แถบชุดต้องถูกใส่กลับด้วย
    // ไม่งั้นกดชุดแรกแล้วแถบหายทั้งแถบ (บทเรียนจากเครื่องมืออีเมล 11/09/2026)
    if (!rightBody.contains(presets.node)) rightBody.prepend(presets.node);
    buildSources(); buildGrid(); buildOptions();
    setView("query");
  }
}
