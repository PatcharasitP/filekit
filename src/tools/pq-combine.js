import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, download } from "../ui.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { tr } from "../i18n.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { stateKit } from "../statekit.js";
import {
  parseQueries, mergeQueries, suggestInline, findRefs, detectSources,
  buildFromSources, buildWarnings, joinQueries,
} from "../pqcombine.js";

/* ‼️ เครื่องนี้เกิดจากโจทย์จริง 26/09/2026 ไฟล์ค่าไฟที่ดึง SQL สองเครื่องคนละ IP
 * แล้วมี query พักสองตัวต่อกันเป็นตัวที่สาม คนถามว่า "ทำให้เหลือ 1 query ได้ไหม"
 * คำตอบที่พิสูจน์แล้ว (ตรรกะทั้งหมดอยู่ใน src/pqcombine.js พร้อมเทส)
 *   ① ได้ ย้าย query พักเข้าไปเป็นบล็อก let ซ้อนแบบคัดลอกตรงตัว ข้อความ SQL เหมือนเดิมทุกตัวอักษร
 *   ② query อื่นที่อ้างตัวพักอยู่ต้องได้บล็อกคัดลอกเข้าไปด้วย ถ้าชี้ไป query หลักแทน ผลเปลี่ยนเงียบได้
 *   ③ รวมแล้วไม่ได้ดึงข้อมูลน้อยลง ที่ประหยัดจริงคือปิด Enable load ของ query พัก เครื่องนี้จึงบอกทุกครั้ง
 * อีกแท็บคือสร้าง query ใหม่ที่ต่อยอดได้ มีแหล่งเพิ่มก็แค่เพิ่มแถว และสลับ server ด้วย parameter ได้
 *
 * ‼️ ความเป็นส่วนตัว โค้ด query ของคนทำงานมักมีชื่อ server ภายใน
 *    จึงไม่จำแหล่งข้อมูลและโค้ดที่วางไว้ในเบราว์เซอร์ (จำแค่ตัวเลือก) และไม่มีปุ่มแชร์ลิงก์
 *    เพราะลิงก์แชร์เอาค่าไปใส่ใน URL ซึ่งไปโผล่ในประวัติและ log ของเซิร์ฟเวอร์
 */

const STYLE = `
.pqc-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(62vh,640px)}
/* ‼️ ห้ามลากแนวนอน (กติกาเดียวกับเครื่องมือ Power Query ตัวอื่น tests/browser_pqgen.py)
   แต่ SQL ของผู้ใช้ยาวบรรทัดเดียวได้หลายพันตัวอักษร หักบรรทัดในโค้ดไม่ได้ จึงหักแค่ตอนแสดง
   ปุ่มคัดลอกใช้ข้อความต้นฉบับ ไม่ได้อ่านจากกล่องนี้ */
.pqc-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere}
.pqc-mode{margin-bottom:14px}
.pqc-src{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  padding:11px 12px;margin-bottom:10px}
.pqc-src-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.pqc-src-no{font-size:11.5px;font-weight:700;letter-spacing:.04em;color:var(--text-mute)}
.pqc-src-btns{display:flex;gap:4px}
.pqc-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px}
.pqc-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pqc-mini:disabled{opacity:.35;cursor:default}
.pqc-mini.danger:hover:not(:disabled){border-color:var(--err);color:var(--err)}
/* ‼️ นิ้วแตะต้องการ 36x36px ปุ่มไอคอน 26px ตกเกณฑ์ (บทเรียนเดียวกับเครื่องค้นข้ามหลายแหล่ง) */
@media (pointer:coarse){ .pqc-mini{width:36px;height:36px} }
.pqc-sql,.pqc-paste{width:100%;box-sizing:border-box;font-family:var(--mono,ui-monospace,Consolas,monospace);
  font-size:12.5px;line-height:1.6;resize:vertical}
.pqc-sql{min-height:84px}
.pqc-paste{min-height:260px}
.pqc-hint{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 0 0}
.pqc-add{margin-top:4px}
.pqc-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.pqc-note{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.75;margin:12px 0}
.pqc-note.warn{margin:0 0 12px}
.pqc-note p{margin:0 0 4px}
.pqc-note p:last-child{margin:0}
.pqc-note.warn{border-left-color:var(--warn,#c98a12);margin:0 0 12px}
.pqc-sub{margin:16px 0 8px;font-size:13px;font-weight:700;color:var(--text-mute)}
.pqc-checks{display:flex;flex-direction:column;gap:6px}
.pqc-check{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.5}
.pqc-check input{margin-top:3px}
.pqc-check small{display:block;color:var(--text-mute);font-size:11.5px}
.pqc-empty{font-size:12.5px;color:var(--text-mute);margin:0}
.pqc-group-title{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--text-mute)}
.pqc-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pqc-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pqc-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pqc-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pqc-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pqc-switch input:checked + .pqc-switch-track{background:var(--g-powerbi,var(--brand))}
.pqc-switch input:checked + .pqc-switch-track::after{transform:translateX(18px)}
.pqc-switch input:focus-visible + .pqc-switch-track{outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){
  .pqc-switch{height:36px}
  .pqc-switch-track{top:6px;bottom:6px}
}
${PRESETS_CSS}
` + CODE_TOKEN_CSS;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  // ตัวเลือกที่จำไว้ได้ (ไม่มีชื่อ server หรือโค้ดของผู้ใช้อยู่ในนี้)
  const DEF = {
    mode: "build", pattern: "blocks", params: false,
    labelColumn: "Source", keys: "", dependents: "copy",
  };
  const SEED = () => [
    { label: tr("ขายไทย", "Sales TH"), server: "server-a", database: "SalesDB",
      sql: "SELECT Code, Amount, SaleDate\nFROM dbo.Sales" },
    { label: tr("ขายเวียดนาม", "Sales VN"), server: "10.0.0.5", database: "SalesVN",
      sql: "SELECT Code, Amount, SaleDate\nFROM dbo.Sales" },
  ];
  const options = { ...DEF };
  let sources = SEED();
  // แท็บรวม query: อยู่ในหน่วยความจำอย่างเดียว ปิดหน้าแล้วหาย (ตั้งใจ)
  let pasteText = "";
  let parsed = { format: "single", queries: [] };
  let mainName = "";
  let chosen = new Set();
  let lastOut = { text: "", file: "combined.pq" };

  const PRESETS = [
    { id: "two", name: tr("สอง server", "Two servers"),
      desc: tr("ข้อมูลชุดเดียวกันอยู่สองเครื่อง ต่อเป็นตารางเดียว", "The same data on two machines, stacked into one table"), values: "two" },
    { id: "three", name: tr("สาม server", "Three servers"),
      desc: tr("มีเครื่องที่สามเพิ่ม แค่เพิ่มแถว โค้ดเดิมไม่ต้องรื้อ", "A third machine joins, just one more row"), values: "three" },
    { id: "onedb", name: tr("เครื่องเดียวสองฐาน", "One server, two databases"),
      desc: tr("ฐานปัจจุบันกับฐานเก่าบนเครื่องเดียวกัน ยังนับเป็นสองแหล่ง", "Current and archive databases on one server still count as two sources"), values: "onedb" },
  ];
  const presets = presetBar(PRESETS, applyPreset);
  const state = stateKit(tool.id, {
    defaults: { ...DEF },
    collect: () => ({ ...options }),
    apply: (v) => { for (const k of Object.keys(DEF)) if (v && k in v) options[k] = v[k]; },
  });

  // ── ผืนกลาง ────────────────────────────────────────────────────────────
  const noteEl = el("div", { class: "pqc-note", hidden: true });
  const warnEl = el("div", { class: "pqc-note warn", hidden: true });
  const codeEl = el("code", {});
  const paramTitle = el("h3", { class: "pqc-sub", hidden: true },
    tr("parameter ที่ต้องมีในไฟล์ก่อน", "Parameters the file needs first"));
  const paramHint = el("p", { class: "pqc-hint", hidden: true }, tr(
    "สร้างด้วย Manage Parameters ตามชื่อนี้ แก้ค่าทีหลังได้โดยไม่แตะโค้ด",
    "Create them with Manage Parameters using these names, then change values without touching the code"));
  const paramCode = el("code", {});
  const paramPre = el("pre", { class: "pqc-code", hidden: true }, [paramCode]);
  // คำเตือนที่ต้องแก้อยู่เหนือโค้ด ส่วนเรื่องที่ควรรู้อยู่ใต้โค้ด ให้โค้ดขึ้นมาเป็นอย่างแรกที่เห็น
  const centerNode = el("div", {}, [warnEl, el("pre", { class: "pqc-code" }, [codeEl]), paramTitle, paramHint, paramPre, noteEl]);

  // ── แท็บเลือกงาน ───────────────────────────────────────────────────────
  const modeSel = segmented([
    ["build", tr("สร้างใหม่", "Build new")],
    ["merge", tr("รวม query ที่มีอยู่", "Merge existing")],
  ], options.mode);
  modeSel.classList.add("pqc-mode");
  modeSel.onchange = () => { options.mode = modeSel.value; showMode(); render(); };

  // ── แผงซ้าย: สร้างใหม่ ─────────────────────────────────────────────────
  const srcListEl = el("div", {});
  const addSrcBtn = button(tr("เพิ่มแหล่ง", "Add a source"), { icon: "plus", ghost: true, onclick: addSource });
  const buildLeft = el("div", {}, [
    el("p", { class: "pqc-hint", style: "margin:0 0 10px" }, tr(
      "หนึ่งแถวต่อหนึ่งแหล่ง มีเครื่องใหม่เพิ่มก็แค่กดเพิ่มแหล่ง แล้วเอาโค้ดไปวางทับของเดิม",
      "One row per source. When a new machine joins, add a row and paste the code over the old one")),
    srcListEl,
    el("div", { class: "pqc-add" }, [addSrcBtn]),
  ]);

  // ── แผงซ้าย: รวม query ที่มีอยู่ ──────────────────────────────────────
  const pasteEl = el("textarea", {
    class: "pqc-paste", spellcheck: "false", "aria-label": tr("โค้ดของหลาย query", "Code of several queries"),
    placeholder: tr("// ชื่อ query\nlet\n    Source = ...\nin\n    Source\n\n// ชื่อ query ถัดไป\nlet ...",
                    "// first query name\nlet\n    Source = ...\nin\n    Source\n\n// second query name\nlet\n    ..."),
  });
  pasteEl.addEventListener("input", () => { pasteText = pasteEl.value; reparse(); render(); });
  const sampleBtn = button(tr("ลองกับตัวอย่าง", "Try the example"), { ghost: true, onclick: loadSample });
  const clearBtn = button(tr("ล้าง", "Clear"), { ghost: true, onclick: () => { pasteEl.value = ""; pasteText = ""; reparse(); render(); } });
  const parsedEl = el("p", { class: "pqc-hint" });
  const mergeLeft = el("div", {}, [
    el("p", { class: "pqc-hint", style: "margin:0 0 10px" }, tr(
      "ใน Power Query Editor คลิก query แรก กด Shift คลิกตัวท้าย แล้ว Ctrl+C มาวางที่นี่ได้เลย",
      "In Power Query Editor click the first query, Shift click the last, press Ctrl+C and paste here")),
    pasteEl,
    el("div", { class: "pqc-row" }, [sampleBtn, clearBtn]),
    parsedEl,
    el("p", { class: "pqc-hint" }, tr(
      "โค้ดที่วางอยู่ในหน้านี้อย่างเดียว ไม่ถูกส่งไปไหนและไม่ถูกจำไว้",
      "The code stays on this page only, it is never sent anywhere or remembered")),
  ]);

  const leftBody = el("div", {}, [modeSel, buildLeft, mergeLeft]);

  // ── แผงขวา ────────────────────────────────────────────────────────────
  const buildRight = el("div", {});
  const mergeRight = el("div", {});
  const rightBody = el("div", {}, [buildRight, mergeRight]);

  const copyBtn = button(tr("คัดลอกโค้ด", "Copy code"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .pq", "Download .pq"), { icon: "download", ghost: true, onclick: onDownload });
  const resetBtn = button(tr("คืนค่าเริ่มต้น", "Reset to defaults"), { icon: "undo", ghost: true, onclick: onReset });

  const ws = workspace(tool, {
    left: {
      title: tr("แหล่งข้อมูล", "Sources"), node: leftBody,
      hint: tr("ใช้ชื่อ server ฐานข้อมูล และชื่อ query ตรงตามไฟล์จริงของคุณ", "Use the server, database and query names exactly as in your file"),
    },
    center: { title: tr("โค้ด Power Query", "Power Query code"), node: centerNode },
    right: { title: tr("ตัวเลือก", "Options"), node: rightBody },
    footer: [copyBtn, dlBtn, resetBtn, st.node],
    note: tr(
      "วางใน Advanced Editor ของ query ที่ต้องการ ทุกอย่างทำในเบราว์เซอร์นี้ ไม่มีอะไรถูกส่งออกไป",
      "Paste into the Advanced Editor of the query you want. Everything runs in this browser and nothing is sent out"),
  });
  ws.wrap.prepend(styleEl);
  ws.showCanvas(true);

  const restored = state.restore();
  modeSel.value = options.mode;
  buildSources();
  buildOptions();
  reparse();
  showMode();
  render();
  if (restored) st.ok(tr("ใช้ตัวเลือกที่คุณตั้งไว้ครั้งก่อน", "Using the options you had last time"));
  return ws.wrap;

  /* ── ตัวช่วยสร้างช่อง ─────────────────────────────────────────────── */
  function textInput(obj, key, attrs = {}) {
    const input = el("input", { type: "text", spellcheck: "false", ...attrs });
    input.value = obj[key] ?? "";
    input.addEventListener("input", () => { obj[key] = input.value; presets.clearActive(); render(); });
    return input;
  }
  function sw(label, get, set, hint) {
    const box = el("input", { type: "checkbox" });
    box.checked = !!get();
    box.addEventListener("change", () => { set(box.checked); presets.clearActive(); render(); });
    return el("div", {}, [
      el("div", { class: "field pqc-switch-field" }, [
        el("span", {}, label),
        el("label", { class: "pqc-switch" }, [box, el("span", { class: "pqc-switch-track" })]),
      ]),
      hint ? el("p", { class: "pqc-hint", style: "margin:-4px 0 10px" }, hint) : null,
    ]);
  }
  function miniBtn(text, label, onclick, danger) {
    return el("button", { class: "pqc-mini" + (danger ? " danger" : ""), type: "button", title: label, "aria-label": label, onclick }, text);
  }

  /* ── สร้างใหม่: การ์ดของแต่ละแหล่ง ──────────────────────────────────── */
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
    const sql = el("textarea", { class: "pqc-sql", spellcheck: "false", rows: "4" });
    sql.value = s.sql ?? "";
    sql.addEventListener("input", () => { s.sql = sql.value; presets.clearActive(); render(); });
    return el("div", { class: "pqc-src" }, [
      el("div", { class: "pqc-src-head" }, [
        el("span", { class: "pqc-src-no" }, tr(`แหล่งที่ ${i + 1}`, `Source ${i + 1}`)),
        el("div", { class: "pqc-src-btns" }, [up, down, del]),
      ]),
      field(tr("ชื่อแหล่ง", "Source name"), textInput(s, "label"),
        tr("ใช้เป็นชื่อบล็อก และเป็นค่าในคอลัมน์บอกแหล่ง", "Used as the block name and as the value in the source column")),
      field(tr("server หรือ IP", "Server or IP"), textInput(s, "server")),
      field(tr("ฐานข้อมูล", "Database"), textInput(s, "database")),
      field(tr("คำสั่ง SQL ของแหล่งนี้", "SQL for this source"), sql,
        tr("แต่ละแหล่งมี SELECT ของตัวเอง ตั้งชื่อคอลัมน์ให้ตรงกันด้วย AS เพราะการต่อตารางจับคู่คอลัมน์ด้วยชื่อ",
           "Each source keeps its own SELECT. Use AS to give matching column names, stacking pairs columns by name")),
    ]);
  }
  function moveSource(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= sources.length) return;
    [sources[i], sources[j]] = [sources[j], sources[i]];
    presets.clearActive();
    buildSources(); render();
  }
  function removeSource(i) {
    if (sources.length <= 1) return;
    sources.splice(i, 1);
    presets.clearActive();
    buildSources(); render();
  }
  function addSource() {
    const n = sources.length + 1;
    sources.push({ label: tr(`แหล่งที่ ${n}`, `Source ${n}`), server: "", database: "", sql: "" });
    presets.clearActive();
    buildSources(); render();
    const cards = srcListEl.querySelectorAll(".pqc-src");
    cards[cards.length - 1]?.querySelector("input")?.focus();
  }

  /* ── แผงขวา: ตัวเลือกทั้งสองแท็บ ────────────────────────────────────── */
  function buildOptions() {
    buildRight.innerHTML = "";
    const pat = segmented([
      ["blocks", tr("บล็อกในตัว", "Blocks")],
      ["function", tr("ฟังก์ชัน", "Function")],
    ], options.pattern);
    const patHint = el("p", { class: "pqc-hint", style: "margin:6px 0 12px" });
    const paintPat = () => {
      patHint.textContent = options.pattern === "function"
        ? tr("แก้ต่อด้วยมือง่ายสุด แต่ Power BI มองไม่เห็นแหล่ง จึง refresh บน Service ไม่ได้",
             "Easiest to extend by hand, but Power BI cannot see the sources (dynamic) so it will not refresh on the Service")
        : tr("บล็อกละแหล่ง ต่อ SQL แบบเดียวกับ query ปกติ ใช้ได้ทั้งใน Desktop และบน Service",
             "One block per source, the same SQL connection a normal query uses, fine in Desktop and on the Service");
    };
    paintPat();
    pat.onchange = () => { options.pattern = pat.value; paintPat(); presets.clearActive(); render(); };

    buildRight.append(
      presets.node,
      el("h3", { class: "pqc-group-title" }, tr("รูปแบบโค้ด", "Code style")),
      pat, patHint,
      sw(tr("ใช้ parameter แทนชื่อ server", "Use parameters for the servers"), () => options.params, (v) => { options.params = v; },
        tr("สลับ server หรือฐานได้โดยไม่แก้โค้ด ทั้งใน Desktop และบน Service",
           "Switch servers or databases without editing code, in Desktop and on the Service")),
      field(tr("คอลัมน์บอกแหล่ง", "Source column"), textInput(options, "labelColumn"),
        tr("ว่างไว้ถ้าไม่อยากได้คอลัมน์นี้", "Leave empty to skip this column")),
      field(tr("คอลัมน์ key ที่ต้องตัดช่องว่างและทำตัวใหญ่", "Key columns to trim and upper case"), textInput(options, "keys", { placeholder: tr("เช่น Code, StoreId", "e.g. Code, StoreId") }),
        tr("คั่นด้วยจุลภาค รหัสจากต่างเครื่องมักพิมพ์ไม่เหมือนกัน ทำให้จับคู่ไม่ติด", "Comma separated. Codes typed differently on each machine stop matching")),
    );
    buildMergeOptions();
  }

  function buildMergeOptions() {
    mergeRight.innerHTML = "";
    const qs = parsed.queries.filter((q) => q.name);
    if (qs.length < 2) {
      mergeRight.append(el("p", { class: "pqc-empty" }, tr(
        "วางโค้ดอย่างน้อยสอง query ก่อน แล้วตัวเลือกจะขึ้นตรงนี้",
        "Paste at least two queries first and the options show up here")));
      return;
    }
    const names = qs.map((q) => q.name);
    const mainSel = select(names.map((n) => [n, n]), mainName);
    mainSel.addEventListener("change", () => {
      mainName = mainSel.value;
      chosen = new Set(suggestInline(qs, mainName));
      buildMergeOptions(); render();
    });
    const refs = [...findRefs(qs.find((q) => q.name === mainName).code, names.filter((n) => n !== mainName))];
    const checks = refs.length
      ? el("div", { class: "pqc-checks" }, refs.map((n) => {
        const box = el("input", { type: "checkbox" });
        box.checked = chosen.has(n);
        box.addEventListener("change", () => { box.checked ? chosen.add(n) : chosen.delete(n); render(); });
        const srcs = detectSources(qs.find((q) => q.name === n).code);
        const why = srcs.length
          ? tr(`ดึงเองจาก ${srcs.map((s) => s.args.join(" ") || s.fn).join(", ")}`, `pulls from ${srcs.map((s) => s.args.join(" ") || s.fn).join(", ")}`)
          : tr("ไม่ได้ดึงแหล่งเอง", "does not pull from a source itself");
        return el("label", { class: "pqc-check" }, [box, el("span", {}, [n, el("small", {}, why)])]);
      }))
      : el("p", { class: "pqc-empty" }, tr("query นี้ไม่ได้อ้าง query อื่นเลย", "This query does not use any other query"));
    const dep = segmented([
      ["copy", tr("คัดลอกบล็อกเข้าไป", "Copy the blocks in")],
      ["keep", tr("ไม่แตะ", "Leave them")],
    ], options.dependents);
    dep.onchange = () => { options.dependents = dep.value; render(); };
    mergeRight.append(
      field(tr("query หลัก (ตัวที่จะเหลือ)", "Main query (the one that stays)"), mainSel),
      el("h3", { class: "pqc-group-title", style: "margin:14px 0 8px" }, tr("ยุบตัวไหนเข้าไปบ้าง", "Which ones to fold in")),
      checks,
      el("h3", { class: "pqc-group-title", style: "margin:16px 0 8px" }, tr("query อื่นที่อ้างตัวที่ถูกยุบ", "Other queries that use the folded ones")),
      dep,
      el("p", { class: "pqc-hint" }, tr(
        "คัดลอกบล็อกเข้าไปผลเท่าเดิม ถ้าชี้ไป query หลักแทน ผลอาจเปลี่ยนเงียบ ๆ เพราะมันล้างค่าไปแล้ว",
        "Copying keeps every row the same. Pointing them at the main query can change results silently")),
    );
  }

  /* ── อ่านโค้ดที่วาง ──────────────────────────────────────────────── */
  function reparse() {
    parsed = parseQueries(pasteText);
    const qs = parsed.queries.filter((q) => q.name);
    const noName = parsed.queries.filter((q) => !q.name).length;
    if (!pasteText.trim()) parsedEl.textContent = "";
    else if (parsed.format === "single") {
      parsedEl.textContent = tr("ยังไม่เจอหัวบรรทัด // ชื่อ query เลย ใส่ชื่อไว้บรรทัดบนของแต่ละก้อน",
        "No // query name line found yet, put the name on the first line of each piece");
    } else {
      parsedEl.textContent = tr(`อ่านได้ ${qs.length} query: ${qs.map((q) => q.name).join(", ")}`,
        `Read ${qs.length} ${qs.length === 1 ? "query" : "queries"}: ${qs.map((q) => q.name).join(", ")}`) +
        (noName ? tr(" (มีโค้ดที่ไม่มีชื่อ ไม่ได้นับ)", " (some code had no name and was skipped)") : "");
    }
    if (!qs.some((q) => q.name === mainName)) {
      // เดา query หลัก: ตัวที่ยุบได้มากที่สุด เท่ากันเอาตัวที่อยู่หลังสุด (มักเป็นตัวปลายทาง)
      let best = qs[qs.length - 1]?.name || "";
      let bestN = -1;
      for (const q of qs) {
        const n = suggestInline(qs, q.name).length;
        if (n >= bestN && n > 0) { best = q.name; bestN = n; }
      }
      mainName = best;
      chosen = new Set(mainName ? suggestInline(qs, mainName) : []);
    } else {
      const names = new Set(qs.map((q) => q.name));
      chosen = new Set([...chosen].filter((n) => names.has(n)));
    }
    buildMergeOptions();
  }

  function loadSample() {
    pasteEl.value = SAMPLE;
    pasteText = SAMPLE;
    mainName = "";
    reparse();
    render();
    st.ok(tr("ใส่ตัวอย่างแล้ว ลองติ๊กหรือเปลี่ยนตัวเลือกของการรวมดู", "Example loaded, try changing the merge options"));
  }

  /* ── วาดผล ──────────────────────────────────────────────────────── */
  function showMode() {
    const merge = options.mode === "merge";
    buildLeft.hidden = merge;
    mergeLeft.hidden = !merge;
    buildRight.hidden = merge;
    mergeRight.hidden = !merge;
  }

  function setNotes(box, lines) {
    box.innerHTML = "";
    box.hidden = !lines.length;
    for (const l of lines) box.appendChild(el("p", {}, l));
  }

  function render() {
    state.save();
    if (options.mode === "merge") return renderMerge();
    return renderBuild();
  }

  function renderBuild() {
    const keys = String(options.keys || "").split(",").map((k) => k.trim()).filter(Boolean);
    const out = buildFromSources({
      sources, pattern: options.pattern, params: options.params,
      labelColumn: options.labelColumn, keyColumns: keys,
      text: {
        source: (i, label) => tr(`// แหล่งที่ ${i}: ${label}`, `// source ${i}: ${label}`),
        fn: tr("// ฟังก์ชันดึงหนึ่งแหล่ง เพิ่มแหล่งใหม่ = เพิ่มหนึ่งบรรทัดข้างล่าง", "// one source per call, adding a source means adding one line below"),
        combine: tr("// ต่อทุกแหล่งเป็นตารางเดียว คอลัมน์จับคู่กันด้วยชื่อ", "// stack every source into one table, columns are matched by name"),
        clean: tr("// ตัดช่องว่างและทำตัวใหญ่ให้คอลัมน์ key จะได้จับคู่ติด", "// trim spaces and upper case the key columns so matches line up"),
      },
    });
    codeEl.innerHTML = paintCode(out.code, "m");
    const hasParams = options.params && out.params.length > 0;
    paramTitle.hidden = paramHint.hidden = paramPre.hidden = !hasParams;
    const paramText = hasParams ? joinQueries(out.params) : "";
    if (hasParams) paramCode.innerHTML = paintCode(paramText, "m");

    const warns = [];
    for (const w of buildWarnings(sources)) {
      const n = w.i + 1;
      if (w.code === "noServer") warns.push(tr(`แหล่งที่ ${n} ยังไม่ได้ใส่ server`, `Source ${n} has no server yet`));
      if (w.code === "noDatabase") warns.push(tr(`แหล่งที่ ${n} ยังไม่ได้ใส่ฐานข้อมูล`, `Source ${n} has no database yet`));
      if (w.code === "noSql") warns.push(tr(`แหล่งที่ ${n} ยังไม่มีคำสั่ง SQL`, `Source ${n} has no SQL yet`));
    }
    // ‼️ พิสูจน์ใน Desktop 2.157 (26/09/2026): Sql.Database ที่ห่อในฟังก์ชันที่เขียนเอง ไม่โผล่ใน Data source settings
    //    และขึ้น Some data sources may not be listed because of hand-authored queries = dynamic data source
    if (options.pattern === "function") {
      warns.push(tr("แบบฟังก์ชัน refresh บน Service ไม่ได้ ถ้าจะตั้ง refresh บน Service ให้ใช้แบบบล็อก",
        "The function style will not refresh on the Service, use Blocks if you need that"));
    }
    setNotes(warnEl, warns);
    const pairs = buildWarnings(sources).find((w) => w.code === "privacy");
    // ‼️ คำว่า วางใน Advanced Editor อยู่ท้ายหน้าแล้ว ไม่พูดซ้ำตรงนี้ บอกเฉพาะเรื่องที่ขึ้นกับค่าที่ตั้ง
    const notes = keys.length ? [tr(
      "คอลัมน์ key ที่บางแหล่งไม่มี ขั้นล้างค่าจะข้ามให้เอง ไม่ error",
      "Key columns missing from a source are skipped, not an error")] : [];
    if (pairs) {
      notes.push(// ‼️ จับค่าจริง 26/09 (Excel engine): ยังไม่ตั้ง privacy level จะถูกขอก่อน refresh ไม่ใช่ Formula.Firewall
      // Formula.Firewall เกิดเมื่อตั้งแล้วแต่เข้ากันไม่ได้ เช่น Private (ตามเอกสาร Microsoft)
      tr(
        `ดึง ${pairs.n} แหล่งในตัวเดียว ต้องตั้ง privacy level ทุกแหล่ง แนะนำ Organizational ทั้งหมด`,
        `Reads ${pairs.n} sources at once. Every source needs a privacy level, Organizational for all is the safe choice`));
      notes.push(tr(
        `refresh บน Service ต้องเพิ่ม data source ใน gateway ครบ ${pairs.n} คู่ ชื่อตรงตามโค้ด`,
        `On the Service, add all ${pairs.n} server and database pairs to the gateway, spelled as in the code`));
    }
    setNotes(noteEl, notes);
    const code = hasParams ? `${paramText}\n// ${tr("ข้อมูลรวม", "Combined")}\n${out.code}\n` : `${out.code}\n`;
    lastOut = { text: code, file: "combine-sources.pq", copy: out.code };
  }

  function renderMerge() {
    paramTitle.hidden = paramHint.hidden = paramPre.hidden = true;
    const qs = parsed.queries.filter((q) => q.name);
    if (qs.length < 2 || !mainName) {
      codeEl.textContent = tr("// วางโค้ดหลาย query ในช่องวางโค้ด หรือกด ลองกับตัวอย่าง", "// Paste several queries into the code box, or press Try the example");
      setNotes(noteEl, []);
      setNotes(warnEl, []);
      lastOut = { text: "", file: "merged.pq", copy: "" };
      return;
    }
    const r = mergeQueries(qs, {
      main: mainName, inline: [...chosen], dependents: options.dependents,
      note: (name) => tr(`// ย้ายมาจาก query ${name} คัดลอกตรงตัว`, `// moved in from query ${name}, verbatim`),
    });
    if (r.error) {
      const msg = {
        empty: tr("ยังไม่ได้เลือกตัวที่จะยุบเข้าไป ติ๊กอย่างน้อยหนึ่งตัว", "Nothing chosen to fold in yet, tick at least one"),
        cycle: tr(`ยุบไม่ได้ เพราะ ${(r.names || []).join(", ")} อ้าง query หลักกลับ จะวนเป็นวงกลม`, `Can't fold ${(r.names || []).join(", ")} in, it uses the main query back and would loop`),
        main: tr("เลือก query หลักก่อน", "Pick the main query first"),
      }[r.error];
      codeEl.textContent = `// ${msg}`;
      setNotes(warnEl, [msg]);
      setNotes(noteEl, []);
      lastOut = { text: "", file: "merged.pq", copy: "" };
      return;
    }
    const outList = [r.main, ...r.changed];
    const text = joinQueries(outList);
    codeEl.innerHTML = paintCode(text, "m");
    const notes = [tr(
      `query ${r.main.name} ตอนนี้มีบล็อกข้างใน ${r.moved.length} ก้อน (${r.moved.join(", ")}) คัดลอกตรงตัว ข้อความ SQL เหมือนเดิมทุกตัวอักษร`,
      `${r.main.name} now holds ${r.moved.length} block${r.moved.length === 1 ? "" : "s"} (${r.moved.join(", ")}), copied verbatim with every SQL text unchanged`)];
    if (r.changed.length) {
      notes.push(tr(
        `แก้ query ที่อ้างตัวที่ถูกยุบ ${r.changed.length} ตัว: ${r.changed.map((c) => c.name).join(", ")} ได้บล็อกคัดลอกเข้าไปในตัวเอง ผลเท่าเดิม`,
        `Updated ${r.changed.length} other ${r.changed.length === 1 ? "query" : "queries"} that used them: ${r.changed.map((c) => c.name).join(", ")}, each got its own copy of the blocks so results stay the same`));
    }
    if (r.deletable.length) {
      notes.push(tr(`วางโค้ดใหม่แล้วลบ query เหล่านี้ได้: ${r.deletable.join(", ")}`,
        `After pasting the new code you can delete: ${r.deletable.join(", ")}`));
    }
    if (r.mustKeep.length) {
      notes.push(tr(`ยังลบไม่ได้: ${r.mustKeep.join(", ")} มีตัวอื่นอ้างอยู่ ปิด Enable load ไว้แทน`,
        `Keep these for now: ${r.mustKeep.join(", ")}, other queries still use them, turn off Enable load instead`));
    }
    notes.push(tr(
      "รวมแล้วไม่ได้ดึงข้อมูลน้อยลง ถ้าอยากให้ไฟล์เล็กลงจริง ให้ปิด Enable load ของ query พักแทน",
      "Merging does not read the sources fewer times. To really shrink the file, turn off Enable load on the staging queries"));
    setNotes(noteEl, notes);
    const warns = [];
    if (r.sourceCount >= 2) {
      warns.push(tr(
        `query หลักดึง ${r.sourceCount} แหล่งในตัวเดียว ต้องตั้ง privacy level ทุกแหล่ง แนะนำ Organizational ทั้งหมด`,
        `The main query reads ${r.sourceCount} sources at once. Every source needs a privacy level, Organizational for all is the safe choice`));
    }
    if (r.unused.length) {
      warns.push(tr(`query หลักไม่ได้ใช้ ${r.unused.join(", ")} เลยไม่ได้ยุบเข้าไป`, `The main query does not use ${r.unused.join(", ")}, so it was not folded in`));
    }
    setNotes(warnEl, warns);
    lastOut = { text, file: "merged-queries.pq", copy: text };
  }

  /* ── ปุ่มล่าง ─────────────────────────────────────────────────────── */
  async function onCopy() {
    if (!lastOut.copy) { st.err(tr("ยังไม่มีโค้ดให้คัดลอก", "No code to copy yet")); return; }
    try {
      await navigator.clipboard.writeText(lastOut.copy);
      st.ok(options.mode === "merge"
        ? tr("คัดลอกแล้ว แต่ละ query เริ่มที่บรรทัด // ชื่อ วางทับใน Advanced Editor ทีละตัว", "Copied, each query starts at its // name line, paste each one over its Advanced Editor")
        : tr("คัดลอกแล้ว วางใน Advanced Editor ได้เลย", "Copied, paste it into the Advanced Editor"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    if (!lastOut.text) { st.err(tr("ยังไม่มีโค้ดให้ดาวน์โหลด", "Nothing to download yet")); return; }
    download(new Blob([lastOut.text], { type: "text/plain;charset=utf-8" }), lastOut.file);
    st.ok(tr(`ดาวน์โหลด ${lastOut.file} แล้ว`, `Downloaded ${lastOut.file}`));
  }

  function applyPreset(kind) {
    sources = SEED();
    if (kind === "three") {
      sources.push({ label: tr("ขายกัมพูชา", "Sales KH"), server: "server-c", database: "SalesKH",
        sql: "SELECT Code, Amount, SaleDate\nFROM dbo.Sales" });
    } else if (kind === "onedb") {
      sources = [
        { label: tr("ปีนี้", "This year"), server: "server-a", database: "SalesDB", sql: "SELECT Code, Amount, SaleDate\nFROM dbo.Sales" },
        { label: tr("ย้อนหลัง", "Archive"), server: "server-a", database: "SalesArchive", sql: "SELECT Code, Amount, SaleDate\nFROM dbo.Sales" },
      ];
    }
    buildSources(); render();
    st.ok(tr("ใช้ชุดที่เลือกแล้ว ปรับต่อได้ตามใจ", "Applied, tweak it from here"));
  }

  function onReset() {
    Object.assign(options, DEF);
    sources = SEED();
    pasteEl.value = ""; pasteText = ""; mainName = "";
    modeSel.value = options.mode;
    presets.clearActive();
    buildSources(); buildOptions(); reparse(); showMode(); render();
    state.forget();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Reset to defaults"));
  }
}

// ตัวอย่างรูปเดียวกับเคสจริง (ชื่อสมมติทั้งหมด) สอง query ดึงคนละเครื่อง ตัวที่สามต่อกัน
// และมีตารางหนึ่งที่ต้องใช้รหัสแบบดิบจากเครื่องแรก ซึ่งห้ามชี้ไป query ที่ล้างค่าแล้ว
const SAMPLE = `// sales_th
let
    Source = Sql.Database("server-a", "SalesDB", [Query="SELECT Code, Store, Amount, SaleDate#(lf)FROM dbo.Sales"]),
    Labeled = Table.AddColumn(Source, "Src", each "TH", type text)
in
    Labeled

// sales_vn
let
    Source = Sql.Database("10.0.0.5", "SalesVN", [Query="SELECT Code, Store, Amount, SaleDate#(lf)FROM dbo.Sales"]),
    Labeled = Table.AddColumn(Source, "Src", each "VN", type text)
in
    Labeled

// sales_all
let
    Source = Table.Combine({sales_th, sales_vn}),
    #"Cleaned IDs" = Table.TransformColumns(Source, {{"Code", each Text.Upper(Text.Trim(_)), type text}})
in
    #"Cleaned IDs"

// dim_store
let
    Source = sales_th,
    Stores = Table.Distinct(Table.SelectColumns(Source, {"Code", "Store"}), {"Code"})
in
    Stores

// last_sale
let
    Source = sales_all,
    Grouped = Table.Group(Source, {"Code"}, {{"LastSale", each List.Max([SaleDate]), type nullable date}})
in
    Grouped
`;
