import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { tr, IS_EN, pl } from "../i18n.js";
import { colorPicker, SWATCHES, COLORKIT_CSS } from "../colorkit.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { configSearch, CFGSEARCH_CSS } from "../cfgsearch.js";
import { dirtyMarks, DIRTYMARK_CSS } from "../dirtymark.js";
import { codeView, CODEVIEW_CSS } from "../codeview.js";
import { stateKit, SHARE_MSG } from "../statekit.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, sheetToTable } from "../sheetpick.js";
import { guessGanttColumns, buildGanttRows } from "../ganttkit.js";
import { formatDate, toBE } from "../thai.js";

/* ‼️ ตัวปรับที่ผู้ใช้แตะได้ เป็น "ผู้สมัคร" เหมือน pbi-bar: ตัวไหนไม่มีใน spec.params จริง จะไม่ถูกสร้างปุ่ม
   (สเปกกับหน้าเว็บถูกแก้คนละรอบได้ ไฟล์นี้จึงต้องทนสเปกที่ยังไม่ครบ) */
const EDITABLE_PARAMS = [
  "sortMode", "showToday", "todayDate", "showProgress", "buddhistYear",
  "palette", "barThickness", "cornerRadius", "fontScale", "labelFontScale",
];

const OWN_KEY = "__own__";
const NO_COL = "__none__";
// งานที่ใส่ในกราฟได้ต่อครั้ง เกินนี้ตัดท้ายและบอกผู้ใช้ตรง ๆ (แท่งหลายร้อยแถวอ่านไม่ออกและ Deneb ใน Power BI ก็ไม่ไหว)
const MAX_ROWS = 120;
const ROW_H = 30;

const PBI_COLORS = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550", "#197278", "#8AB833"];
const SPEC_URL = "samples/powerbi/gantt.vl.json";
const DATASETS_URL = "samples/powerbi/gantt-datasets.json";
/* ‼️ ไฟล์ Excel ตัวอย่างสร้างจาก gantt-datasets.json ตัวเดียวกับที่หน้านี้อ่าน ถ้าแก้ชุดตัวอย่างต้องสร้างไฟล์ใหม่ด้วย
   เทส tests/browser_gantt.py เทียบค่าในไฟล์กับ JSON ทุกแถว ไม่ตรง = แดง */
const XLSX_SAMPLE_URL = "samples/powerbi/pbi-gantt-samples.xlsx";
const XLSX_SAMPLE_NAME = "pbi-gantt-samples.xlsx";

// ป้ายในสเปกที่เป็นไทย: ค่าใน param กับหัว tooltip ต้องเปลี่ยนตามภาษาหน้าเว็บ (เทียบด้วยชื่อ param และ field ไม่ใช่ข้อความไทย)
const PARAM_EN = { todayLabel: "Today", groupLabel: "Group", unknownLabel: "Not specified" };
const TOOLTIP_EN = { Task: "Task", __group: "Group", __startText: "Start", __endText: "End", __progressText: "Progress" };

const REASON = {
  "no-task": () => tr("ไม่มีชื่องาน", "no task name"),
  "bad-start": () => tr("วันเริ่มอ่านไม่ได้", "start date unreadable"),
  "bad-end": () => tr("วันจบอ่านไม่ได้", "end date unreadable"),
  "end-before-start": () => tr("วันจบมาก่อนวันเริ่ม", "end is before start"),
};

// ‼️ ฝัง <style> ในโมดูลนี้ตรง ๆ ห้ามแก้ assets/css/tool.css
const STYLE = `
.pbig-ds-list{display:flex;flex-direction:column;gap:8px}
.pbig-ds-card{position:relative;display:block;padding:10px 12px;border:1.5px solid var(--line);
  border-radius:var(--r-sm);cursor:pointer;background:var(--bg-soft);
  transition:border-color .12s var(--ease-snap,ease),background .12s var(--ease-snap,ease)}
.pbig-ds-card input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.pbig-ds-card:hover{border-color:color-mix(in srgb,var(--g-powerbi,var(--brand)) 45%,var(--line))}
.pbig-ds-card:has(input:checked){border-color:var(--g-powerbi,var(--brand));
  background:color-mix(in srgb,var(--g-powerbi,var(--brand)) 12%,var(--bg-soft))}
.pbig-ds-card input:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.pbig-ds-title{font-weight:700;font-size:13.5px;color:var(--text)}
.pbig-ds-meta{font-size:12px;color:var(--text-mute);margin-top:2px}
.pbig-ds-note{font-size:12px;color:var(--text-mute);margin-top:5px;line-height:1.6;
  padding-left:9px;border-left:2px solid color-mix(in srgb,var(--g-powerbi,var(--brand)) 55%,var(--line))}

/* ผืนพรีวิวเป็นสีขาวเสมอ ไม่ตามธีมเว็บ เพราะสเปก Deneb ฝังสีตัวอักษรสำหรับผืนรายงาน Power BI ที่เป็นสีขาว
   (เหตุผลเดียวกับ pbi-bar แก้ 20/09/2026) */
.pbig-chart-box{position:relative;width:100%;min-height:300px;background:#fff;border-radius:var(--r-sm);box-shadow:inset 0 0 0 1px color-mix(in srgb,#252423 10%,transparent)}
.pbig-chart{width:100%;height:100%}
.pbig-chart .vega-embed{width:100%;height:100%}
.pbig-note{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-top:10px}
.pbig-chart-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--text-mute);font-size:13.5px;text-align:center;padding:20px;line-height:1.7}

.pbig-right{display:flex;flex-direction:column;gap:18px}
.pbig-group{display:flex;flex-direction:column;gap:10px}
.pbig-group-title{margin:0;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--text-mute)}
.pbig-range-row{display:flex;align-items:center;gap:10px}
.pbig-range-row input[type=range]{flex:1;accent-color:var(--g-powerbi,var(--brand))}
.pbig-rangeval{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;min-width:46px;text-align:right;color:var(--text)}

.pbig-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pbig-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pbig-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pbig-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pbig-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pbig-switch input:checked + .pbig-switch-track{background:var(--g-powerbi,var(--brand))}
.pbig-switch input:checked + .pbig-switch-track::after{transform:translateX(18px)}
.pbig-switch input:focus-visible + .pbig-switch-track{outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){
  .pbig-switch{height:36px}
  .pbig-switch-track{top:6px;bottom:6px}
}
${COLORKIT_CSS}
${PRESETS_CSS}
${CFGSEARCH_CSS}
${DIRTYMARK_CSS}
${CODEVIEW_CSS}

.pbig-own{margin-top:16px;padding-top:14px;border-top:1px dashed var(--line)}
.pbig-own-title{margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.01em;color:var(--text-mute)}
.pbig-own-hint{font-size:12px;color:var(--text-mute);line-height:1.65;margin:0 0 10px}
.pbig-own input[type=file]{width:100%;font-size:12.5px;color:var(--text)}
.pbig-own-pick{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.pbig-own-note{font-size:12px;color:var(--text-mute);line-height:1.65}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  let originalSpec = null;   // สเปกต้นฉบับที่ยังไม่ถูกแตะ ใช้เป็นฐานทุกครั้งที่คัดลอกหรือดาวน์โหลด
  let datasets = null;
  let datasetKeys = [];
  let currentKey = "";
  let paramValues = {};
  let defaults = {};
  let view = null;
  let rafHandle = null;
  let state = null;
  let exprInterpreter = null;
  let editable = [];
  let ownBook = null;
  let ownInfo = "";          // ข้อความหลังใช้ข้อมูลตัวเอง: แถวที่ข้าม, ปีที่เดา, งานที่ถูกตัดท้าย
  /* ‼️ ประกาศรวมไว้บนสุด ห้ามไปประกาศคาไว้ข้างฟังก์ชันที่ใช้ เพราะ init() ถูกเรียกตั้งแต่ต้น
     แล้วจะไปแตะตัวแปร let ที่ยังไม่ถึงบรรทัด (temporal dead zone พังทั้งเครื่องมือ เจอมาแล้ว 5 ครั้งใน pbi-bar) */
  let boxH = 0;

  const controls = {};
  const noteEl = el("div", { class: "pbig-note", hidden: true });
  const chartEl = el("div", { class: "pbig-chart", id: "pbig-chart" });
  const chartMsg = el("div", { class: "pbig-chart-msg" }, tr("กำลังเตรียมกราฟ…", "Preparing the chart…"));
  const chartBox = el("div", { class: "pbig-chart-box" }, [chartMsg, chartEl]);
  const centerWrap = el("div", {}, [chartBox, noteEl]);

  /* ชุดพร้อมใช้เขียนเฉพาะค่าที่ต่างจากค่าเริ่มต้น ตัวไหนสเปกไม่มีจะถูกข้ามเอง */
  const PRESETS = [
    { id: "default", name: tr("ค่าเริ่มต้น", "Default"),
      desc: tr("เรียงตามวันเริ่ม มีเส้นวันนี้และแถบความคืบหน้า", "Sorted by start date, with the today line and progress fill"),
      values: {} },
    { id: "plain", name: tr("แผนล้วน", "Plan only"),
      desc: tr("ไม่มีเส้นวันนี้และความคืบหน้า เหมาะกับแผนที่ยังไม่เริ่ม", "No today line or progress, for a plan that hasn't started"),
      values: { showToday: false, showProgress: false } },
    { id: "present", name: tr("ขึ้นจอนำเสนอ", "For presenting"),
      desc: tr("ตัวอักษรใหญ่ขึ้น แท่งหนาขึ้น เห็นชัดจากท้ายห้อง", "Larger text and thicker bars so it reads from the back of the room"),
      values: { fontScale: 1.3, barThickness: 0.75 } },
  ];
  const presets = presetBar(PRESETS, applyPreset);
  let cfgSearch = null;
  let specView = null;
  let dirty = null;

  /* ห่อช่องด้วยกล่องที่ติดป้ายว่าคุมพารามิเตอร์ตัวไหน (เหตุผลเดียวกับ pbi-bar: ห้ามติดบน field ที่เป็น <label> ครอบช่องกรอก) */
  function mark(node, name) {
    const wrap = el("div", { class: "dm-field" }, [node]);
    wrap.dataset.param = name;
    return wrap;
  }
  const dsListEl = el("div", { class: "pbig-ds-list" });
  const rightBody = el("div", { class: "pbig-right" });

  const fileInput = el("input", { type: "file", accept: ".xlsx,.xlsm,.xls,.csv,.txt" });
  const ownPick = el("div", { class: "pbig-own-pick", hidden: true });
  const ownBlock = el("div", { class: "pbig-own" }, [
    el("h3", { class: "pbig-own-title" }, tr("ใช้ข้อมูลของคุณเอง", "Use your own data")),
    el("p", { class: "pbig-own-hint" }, tr(
      "เปิดไฟล์ Excel หรือ CSV เลือกคอลัมน์ชื่องาน วันเริ่ม วันจบ อ่านวันที่ พ.ศ. ได้ วันจบนับรวมวันนั้น",
      "Open an Excel or CSV file, then pick the task, start and end columns. Group and progress are optional. Buddhist Era dates are read too, and the end date counts as a full day"
    )),
    fileInput, ownPick,
  ]);
  const leftBody = el("div", {}, [dsListEl, ownBlock]);

  const copyBtn = button(tr("คัดลอกสเปก", "Copy spec"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .json", "Download .json"), { icon: "download", ghost: true, onclick: onDownload });
  const dlCsvBtn = button(tr("ดาวน์โหลดข้อมูลชุดนี้ .csv", "Download this data as .csv"),
    { icon: "download", ghost: true, onclick: onDownloadCsv });
  const dlXlsxBtn = button(tr("ดาวน์โหลด .xlsx ตัวอย่าง", "Download sample .xlsx"),
    { icon: "download", ghost: true, onclick: onDownloadSample });
  const shareBtn = button(tr("คัดลอกลิงก์ค่านี้", "Copy a link to these settings"), { icon: "copy", ghost: true, onclick: onShare });
  const resetBtn = button(tr("คืนค่าเริ่มต้น", "Reset to defaults"), { icon: "undo", ghost: true, onclick: onReset });

  const ws = workspace(tool, {
    left: {
      title: tr("ข้อมูล", "Data"), node: leftBody,
      hint: tr("เลือกชุดตัวอย่าง หรือเปิดไฟล์ของคุณเอง", "Pick a sample set, or open your own file"),
    },
    center: {
      title: tr("กราฟสด", "Live chart"), node: centerWrap,
      empty: tr("กำลังเตรียมกราฟ…", "Preparing the chart…"),
    },
    right: { title: tr("ปรับแต่ง", "Customize"), node: rightBody },
    footer: [copyBtn, dlBtn, dlCsvBtn, dlXlsxBtn, shareBtn, resetBtn, st.node],
    note: tr(
      "ใน Deneb ลาก field เข้า well แล้วเปลี่ยนชื่อเป็น Task, Start, End, Group, Progress แล้ววางสเปกทับ",
      "In Deneb drag fields into the wells, rename them Task, Start, End, Group, Progress, then paste the spec over the old one"
    ),
  });
  ws.wrap.prepend(styleEl);
  ws.showCanvas(true);

  init();
  return ws.wrap;

  /* ── เตรียมข้อมูลและฝังกราฟครั้งแรก ──────────────────────────────── */
  async function init() {
    try {
      const [spec, ds] = await Promise.all([fetchJson(SPEC_URL), fetchJson(DATASETS_URL)]);
      originalSpec = spec;
      datasets = ds;
      datasetKeys = Object.keys(ds);
      currentKey = datasetKeys[0];

      /* !! ต้องแปลสเปกก่อนเก็บค่าเริ่มต้น ไม่ใช่หลัง (บทเรียน pbi-bar: ค่าไทยจะค้างใน paramValues แล้วทับกลับตอนวาด) */
      localizeSpec(originalSpec);
      defaults = {};
      for (const p of spec.params) {
        if (EDITABLE_PARAMS.includes(p.name)) defaults[p.name] = clone(p.value);
      }
      paramValues = clone(defaults);
      editable = EDITABLE_PARAMS.filter((n) => n in defaults);

      if (!window.vega || !window.vegaEmbed) {
        throw new Error(tr("ไลบรารีกราฟยังไม่พร้อม", "The chart library isn't ready"));
      }
      registerExpressions(window.vega);
      // ‼️ ต้อง import หลัง window.vega พร้อมเท่านั้น (vega-util-shim.js ส่งต่อจาก bundle ตัวนั้น)
      ({ expressionInterpreter: exprInterpreter } = await import("../../vendor/vega-interpreter.esm.js"));

      /* ‼️ ต้องสร้างหลังรู้ค่าเริ่มต้นจากสเปกจริง และกู้ค่าก่อน buildRightPanel เพื่อให้ช่องกรอกวาดด้วยค่าที่กู้มา */
      state = stateKit(tool.id, {
        defaults,
        collect: () => paramValues,
        apply: (vals) => {
          for (const [k, v] of Object.entries(vals)) if (k in defaults) paramValues[k] = v;
        },
      });
      const restored = state.restore();

      renderDatasetList();
      buildRightPanel();
      specView = codeView({
        lang: "json",
        title: tr("สเปกที่จะคัดลอก", "The spec you will copy"),
        getCode: () => (originalSpec ? JSON.stringify(buildExportSpec(), null, 2) : ""),
      });
      centerWrap.appendChild(specView.node);
      wireOwnData();
      syncChartHeight();
      await embedChart();

      if (restored) {
        st.ok(state.hasLink()
          ? tr("เปิดด้วยค่าที่มากับลิงก์", "Opened with the settings from the link")
          : tr("ใช้ค่าที่คุณตั้งไว้ครั้งก่อน", "Using the settings you had last time"));
        state.dropLinkParam();
      }
      chartMsg.hidden = true;
    } catch (e) {
      console.error(e);
      chartMsg.hidden = false;
      chartMsg.textContent = tr("เตรียมกราฟไม่สำเร็จ: ", "Couldn't prepare the chart: ") + e.message;
      st.err(tr("เตรียมเครื่องมือไม่สำเร็จ: ", "Couldn't prepare the tool: ") + e.message);
    }
  }

  /* ป้ายที่สเปกเขียนเป็นไทยต้องเปลี่ยนตามภาษาหน้าเว็บ และต้องเปลี่ยนที่ originalSpec ก่อนใช้งานใด ๆ
     เพื่อให้สิ่งที่เห็นในพรีวิวกับสิ่งที่คัดลอกไปเป็นอันเดียวกัน (สเปกให้ป้ายผ่าน param จึงเซ็ตค่าตรง ๆ ได้) */
  function localizeSpec(spec) {
    if (!IS_EN) return;
    for (const p of spec.params) if (p.name in PARAM_EN) p.value = PARAM_EN[p.name];
    // หัว tooltip ผูก param ไม่ได้ (ลุงเอทดสอบแล้ว: ได้ [object Object]) เลยเปลี่ยนตามชื่อ field เหมือน pbi-bar
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (Array.isArray(node.tooltip)) {
        for (const t of node.tooltip) if (t && TOOLTIP_EN[t.field]) t.title = TOOLTIP_EN[t.field];
      }
      Object.values(node).forEach(walk);
    };
    walk(spec);
  }

  function fetchJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
  }

  /* ‼️ Gantt สูงตามจำนวนงาน ตรึงความสูงไว้ค่าเดียวไม่ได้ (14 งานกับ 100 งานต้องการที่ไม่เท่ากัน) */
  function syncChartHeight() {
    const n = datasets?.[currentKey]?.rows?.length || 0;
    const h = Math.max(300, Math.min(ROW_H * MAX_ROWS + 110, n * ROW_H + 110));
    if (h === boxH) return;
    boxH = h;
    chartBox.style.height = `${h}px`;
    /* ‼️ กราฟที่ฝังแบบ container อ่านขนาดตอนฝังครั้งเดียว ต้องบอกความสูงใหม่กับวิวตรง ๆ (บทเรียน pbi-bar 11/09/2026)
       ‼️ ส่งความสูงทั้งกล่องเลย ไม่หักขอบ: สเปกนี้ตั้ง autosize fit แบบรวมขอบ (contains padding) และขอบบนกินที่ 112px
       ให้คำอธิบายสี pbi-bar หักขอบได้เพราะขอบมันแค่ 8px แต่ของนี้หักแล้วพื้นที่พล็อตเหลือ 0
       เจอจริงตอนเปิดเว็บจริงหลังใส่ไฟล์ 3 งาน: แท่งสูง 0px ทั้งที่ DOM มีแท่งครบ (เทสวัดแค่ความกว้างจึงไม่เห็น) */
    if (view) {
      try { view.height(h).run(); } catch { /* ยังฝังไม่เสร็จ */ }
    }
  }

  async function embedChart() {
    await new Promise((r) => requestAnimationFrame(r));   // ให้เบราว์เซอร์วาดเฟรมหนึ่งก่อน กัน container ยังไม่มีขนาด

    const rows = withRuntimeFields(datasets[currentKey].rows);
    const spec = clone(originalSpec);
    const dataNode = findDatasetNode(spec);
    if (!dataNode) throw new Error(tr("หา placeholder ข้อมูลในสเปกไม่เจอ", "Could not find the data placeholder in the spec"));
    dataNode.values = rows;
    applyParamsInto(spec, paramValues);
    setSpecParam(spec, "todayDate", effToday());
    spec.width = "container";
    spec.height = "container";

    /* ‼️ ast + expr = หัวใจที่ทำให้กราฟขึ้นได้บนเว็บนี้ (CSP ไม่มี unsafe-eval จงใจ ดูอธิบายเต็มใน pbi-bar.js) */
    const result = await window.vegaEmbed(chartEl, spec, {
      actions: false, renderer: "svg", ast: true, expr: exprInterpreter,
    });
    view = result.view;
    updateNote();
  }

  /* ‼️ วันนี้ที่กราฟใช้จริง: ผู้ใช้กำหนดเองชนะเสมอ ไม่งั้นชุดตัวอย่างใช้ demoToday ของชุดนั้น
     เพราะตัวอย่างมีวันที่ตายตัวในอดีต ถ้าใช้วันจริงของเครื่อง เส้นวันนี้จะอยู่นอกแผนและแถบความคืบหน้าไม่มีความหมาย
     ‼️ ใช้เฉพาะตอนวาดพรีวิว สเปกที่คัดลอกไปยังเก็บ todayDate ตามที่ผู้ใช้ตั้งจริง (ว่าง = ใช้วันจริงของเครื่อง) */
  function effToday() {
    const own = String(paramValues.todayDate || "").trim();
    if (own) return own;
    return (currentKey !== OWN_KEY && datasets?.[currentKey]?.demoToday) || "";
  }
  function setSpecParam(spec, name, value) {
    const p = spec.params.find((q) => q.name === name);
    if (p) p.value = value;
  }
  // ค่าที่ต้องส่งเข้ากราฟจริงของตัวปรับแต่ละตัว (todayDate เป็นตัวเดียวที่ไม่เท่าค่าในช่อง)
  function sigValue(name) {
    return name === "todayDate" ? effToday() : paramValues[name];
  }

  /* ‼️ ต้องเป็น function ไม่ใช่ const ลูกศร: ฟังก์ชันเหล่านี้อยู่ใต้บรรทัด return ws.wrap แต่ init() เรียกใช้ตั้งแต่ต้น
     const จะยังไม่ถูกกำหนดค่า (temporal dead zone) แล้วพังเงียบใน catch ของ init (พลาดจริงรอบแรก 30/09/2026 หมายเหตุไม่ขึ้น) */
  function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function showDay(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return IS_EN ? iso : formatDate({ y: toBE(y), m, d }, "thabbr");
  }

  /* บอกผู้ใช้ตรง ๆ เมื่อเส้นวันนี้ไม่อยู่บนกราฟ หรือเมื่อวันนี้ในพรีวิวไม่ใช่วันจริง (สเปกไม่วาดเส้นที่อยู่นอกช่วงแผน) */
  function todayNote() {
    if (!datasets || !("showToday" in defaults) || !paramValues.showToday) return "";
    const own = String(paramValues.todayDate || "").trim();
    if (own && !/^\d{4}-\d{2}-\d{2}$/.test(own)) return tr(
      "ช่อง กำหนดวันนี้เอง อ่านไม่ได้ ใช้รูปแบบ ปปปป-ดด-วว เช่น 2026-03-22 (ปี ค.ศ.)",
      "Couldn't read the day you set, use yyyy-mm-dd, for example 2026-03-22");
    const eff = effToday() || isoToday();
    const rows = datasets[currentKey]?.rows || [];
    if (!rows.length) return "";
    const lo = rows.reduce((a, r) => (r.Start < a ? r.Start : a), rows[0].Start);
    const hi = rows.reduce((a, r) => (r.End > a ? r.End : a), rows[0].End);
    if (eff < lo || eff > hi) return tr(
      `วันนี้ (${showDay(eff)}) อยู่นอกช่วงของแผนนี้ (${showDay(lo)} ถึง ${showDay(hi)}) จึงไม่ขีดเส้นวันนี้ ตั้งวันเองได้ในช่อง กำหนดวันนี้เอง`,
      `Today (${showDay(eff)}) falls outside this plan (${showDay(lo)} to ${showDay(hi)}), so the today line is left out. Set a day yourself in the "Set today yourself" box`);
    if (!own && effToday()) return tr(
      `ตัวอย่างนี้ตั้งวันนี้เป็น ${showDay(eff)} เพื่อให้เห็นความคืบหน้า ข้อมูลของคุณใช้วันที่เครื่อง หรือตั้งเองได้`,
      `This sample sets today to ${showDay(eff)} so the progress makes sense. Your own data uses the device date, or set a day in the "Set today yourself" box`);
    return "";
  }

  function updateNote() {
    const text = [todayNote(), ownInfo].filter(Boolean).join(" ");
    noteEl.hidden = !text;
    noteEl.textContent = text;
  }

  /* ── ตัวช่วยข้อมูล ────────────────────────────────────────────────── */
  function clone(v) {
    return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  }
  function findDatasetNode(node) {
    if (!node || typeof node !== "object") return null;
    if (!Array.isArray(node) && node.name === "dataset") return node;
    for (const v of Object.values(node)) {
      const found = findDatasetNode(v);
      if (found) return found;
    }
    return null;
  }
  /* ทุกแถวต้องมี __row__ และ __selected__ ที่ Deneb ใส่ให้เองตอนรัน
     ‼️ Group กับ Progress ใส่เฉพาะแถวที่มีจริง ถ้ายัดค่าว่างลงไปสเปกจะนับเป็นกลุ่มว่างหรือความคืบหน้า 0 */
  function withRuntimeFields(rows) {
    return rows.map((r, i) => {
      const out = { Task: (IS_EN && r.Task_en) || r.Task, Start: r.Start, End: r.End, __row__: i, __selected__: "neutral" };
      const grp = (IS_EN && r.Group_en) || r.Group;
      if (grp) out.Group = grp;
      if (typeof r.Progress === "number" && Number.isFinite(r.Progress)) out.Progress = r.Progress;
      return out;
    });
  }
  function applyParamsInto(spec, values) {
    for (const p of spec.params) {
      if (Object.prototype.hasOwnProperty.call(values, p.name)) p.value = clone(values[p.name]);
    }
  }
  function registerExpressions(vega) {
    try { vega.expressionFunction("pbiColor", (i) => PBI_COLORS[((i % 10) + 10) % 10]); } catch { /* ลงทะเบียนแล้ว */ }
    try { vega.expressionFunction("pbiFormat", (v) => String(v)); } catch { /* ลงทะเบียนแล้ว */ }
  }

  /* ── ปรับค่าแล้วอัปเดตกราฟทันทีผ่าน view.signal() ── */
  function setParam(name, value) {
    presets.clearActive();
    paramValues[name] = value;
    state?.save();
    dirty?.refresh();
    specView?.refresh();
    if (!view) return;
    view.signal(name, sigValue(name));
    scheduleRun();
  }
  function scheduleRun() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      try { view.run(); updateNote(); } catch (e) { console.error(e); }
    });
  }

  function switchDataset(key) {
    currentKey = key;
    if (key !== OWN_KEY) ownInfo = "";
    syncChartHeight();
    if (!view) return;
    const rows = withRuntimeFields(datasets[key].rows);
    const cs = window.vega.changeset().remove(() => true).insert(rows);
    view.signal("todayDate", effToday()).change("dataset", cs).run();
    updateNote();
  }

  /* ── แผงซ้าย: เลือกชุดข้อมูล ─────────────────────────────────────── */
  function renderDatasetList() {
    dsListEl.innerHTML = "";
    for (const key of datasetKeys) dsListEl.appendChild(datasetCard(key, datasets[key]));
  }
  function datasetCard(key, info) {
    const input = el("input", { type: "radio", name: "pbig-ds", value: key });
    input.checked = key === currentKey;
    const title = IS_EN && info.title_en ? info.title_en : info.title;
    const groups = new Set(info.rows.map((r) => r.Group).filter(Boolean)).size;
    const meta = tr(
      `${info.rows.length} งาน${groups ? `, ${groups} กลุ่ม` : ""}`,
      `${pl(info.rows.length, "task", "tasks")}${groups ? `, ${pl(groups, "group", "groups")}` : ""}`
    );
    const body = [
      el("div", { class: "pbig-ds-title" }, title),
      el("div", { class: "pbig-ds-meta" }, meta),
    ];
    const note = IS_EN ? info.note_en : info.note;
    if (note) body.push(el("div", { class: "pbig-ds-note" }, note));
    const card = el("label", { class: "pbig-ds-card" }, [input, el("div", {}, body)]);
    input.addEventListener("change", () => switchDataset(key));
    return card;
  }

  /* ── แผงขวา: ตัวปรับทั้งหมด จัดเป็นกลุ่ม ─────────────────────────── */
  function buildRightPanel() {
    rightBody.innerHTML = "";

    const flowGroup = groupBox(tr("ลำดับและเส้นวันนี้", "Order & today line"), [
      ...maybe("sortMode", () => selectField(tr("การเรียงงาน", "Task order"), "sortMode", [
        ["start", tr("ตามวันเริ่ม", "By start date")],
        ["end", tr("ตามวันจบ", "By end date")],
        ["asGiven", tr("ตามลำดับในข้อมูล", "As in the data")],
      ])),
      ...maybe("showToday", () => switchField(tr("เส้นวันนี้", "Today line"), "showToday")),
      ...maybe("todayDate", () => textField(tr("กำหนดวันนี้เอง (ปปปป-ดด-วว)", "Set today yourself (yyyy-mm-dd)"), "todayDate",
        tr("เว้นว่างไว้ = ใช้วันจริงของเครื่อง ใช้เมื่ออยากดูสถานะ ณ วันอื่น", "Leave empty to use the real date, or set one to see the plan as of another day"))),
      ...maybe("showProgress", () => switchField(tr("แถบความคืบหน้า", "Progress fill"), "showProgress")),
      ...maybe("buddhistYear", () => switchField(tr("แกนวันที่เป็นปี พ.ศ.", "Buddhist Era years on the axis"), "buddhistYear")),
    ]);

    const colorGroup = groupBox(tr("สี", "Color"), [
      ...maybe("palette", () => paletteField(tr("ชุดสีของแต่ละกลุ่ม", "Palette for the groups"), "palette",
        tr("คั่นด้วยจุลภาค เช่น #118DFF, #E66C37 (ว่าง = ใช้สีธีม Power BI)",
           "Comma separated, e.g. #118DFF, #E66C37 (empty = use the Power BI theme)"))),
    ]);

    const shapeGroup = groupBox(tr("ขนาดและรูปทรง", "Size & shape"), [
      ...maybe("barThickness", () => rangeField(tr("ความหนาแท่ง", "Bar thickness"), "barThickness",
        { min: 0.3, max: 1.0, step: 0.02, fmt: (v) => v.toFixed(2) })),
      ...maybe("cornerRadius", () => rangeField(tr("มุมโค้งปลายแท่ง", "Corner radius"), "cornerRadius",
        { min: 0, max: 8, step: 1, fmt: (v) => String(Math.round(v)) })),
      ...maybe("fontScale", () => rangeField(tr("ขนาดตัวอักษรรวม", "Overall text size"), "fontScale",
        { min: 0.6, max: 1.6, step: 0.05, fmt: (v) => v.toFixed(2) },
        tr("คูณตัวอักษรทุกก้อนพร้อมกัน", "Scales every piece of text at once"))),
      ...maybe("labelFontScale", () => rangeField(tr("ชื่องานและป้าย", "Task names and labels"), "labelFontScale",
        { min: 0.5, max: 2.0, step: 0.05, fmt: (v) => v.toFixed(2) })),
    ]);

    rightBody.append(presets.node, ...[flowGroup, colorGroup, shapeGroup].filter((g) => g.childNodes.length > 1));

    /* ‼️ ต้องสร้างหลังกลุ่มทั้งหมดอยู่ใน rightBody แล้ว เพราะอ่านโครงตอนสร้าง (สร้างก่อน = index ได้ศูนย์รายการ) */
    cfgSearch = configSearch({ scope: rightBody, groupSel: ".pbig-group", keep: [presets.node] });
    dirty = dirtyMarks({
      scope: rightBody, defaults,
      values: () => paramValues,
      onReset: (name) => resetOneParam(name),
    });
    rightBody.prepend(dirty.node, cfgSearch.node);
    dirty.refresh();
  }

  function resetOneParam(name) {
    if (!(name in defaults)) return;
    paramValues[name] = clone(defaults[name]);
    controls[name]?.setUI(paramValues[name]);
    presets.clearActive();
    if (view) { view.signal(name, sigValue(name)); scheduleRun(); }
    state?.save();
    dirty?.refresh();
    specView?.refresh();
  }

  // สร้างช่องปรับเฉพาะตอนสเปกมีตัวปรับชื่อนั้นจริง (สเปกเก่าไม่มี = ไม่ขึ้นปุ่ม ไม่พัง)
  function maybe(name, make) {
    return name in defaults ? [make()] : [];
  }
  function groupBox(title, nodes) {
    return el("div", { class: "pbig-group" }, [el("h3", { class: "pbig-group-title" }, title), ...nodes]);
  }

  /* ── ตัวสร้างช่องปรับแต่ละชนิด ───────────────────────────────────── */
  function rangeField(labelText, name, { min, max, step, fmt = (v) => String(v) }, hint) {
    const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) });
    input.value = String(paramValues[name]);
    const out = el("span", { class: "pbig-rangeval" }, fmt(paramValues[name]));
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      setParam(name, v);
    });
    controls[name] = { setUI: (v) => { input.value = String(v); out.textContent = fmt(v); } };
    return mark(field(labelText, el("div", { class: "pbig-range-row" }, [input, out]), hint), name);
  }
  function selectField(labelText, name, options, hint) {
    const s = select(options, paramValues[name]);
    s.addEventListener("change", () => setParam(name, s.value));
    controls[name] = { setUI: (v) => { s.value = v; } };
    return mark(field(labelText, s, hint), name);
  }
  function textField(labelText, name, hint) {
    const input = el("input", { type: "text" });
    input.value = paramValues[name] ?? "";
    input.addEventListener("input", () => setParam(name, input.value.trim()));
    controls[name] = { setUI: (v) => { input.value = v ?? ""; } };
    return mark(field(labelText, input, hint), name);
  }
  function switchField(labelText, name) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!paramValues[name];
    const track = el("span", { class: "pbig-switch-track" });
    const sw = el("label", { class: "pbig-switch" }, [input, track]);
    input.setAttribute("aria-label", labelText);   // ป้ายอยู่ใน <span> ข้าง ๆ ไม่ได้ครอบช่อง โปรแกรมอ่านหน้าจอจึงไม่รู้ชื่อสวิตช์ถ้าไม่ใส่
    input.addEventListener("change", () => setParam(name, input.checked));
    controls[name] = { setUI: (v) => { input.checked = !!v; } };
    return mark(el("div", { class: "field pbig-switch-field" }, [el("span", {}, labelText), sw]), name);
  }
  function paletteField(labelText, name, hint) {
    const input = el("input", { type: "text" });
    input.value = (paramValues[name] || []).join(", ");
    input.addEventListener("input", () => setParam(name, input.value.split(",").map((s) => s.trim()).filter(Boolean)));
    controls[name] = { setUI: (v) => { input.value = (v || []).join(", "); } };
    return mark(field(labelText, input, hint), name);
  }

  /* ── ข้อมูลของผู้ใช้เอง: อ่านไฟล์ เลือกคอลัมน์ แล้วป้อนเข้ากราฟ ────── */
  // ไลบรารีอ่าน Excel หนักเกือบ 1MB จึงโหลดตอนผู้ใช้เลือกไฟล์จริงเท่านั้น
  function wireOwnData() {
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      ownPick.hidden = true;
      ownPick.innerHTML = "";
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      try {
        await loadLibs("xlsx");
        const { wb, encNote } = await readWorkbook(f);
        const names = (wb.SheetNames || []).filter((n) => wb.Sheets[n]);
        if (!names.length) throw new Error(tr("ไฟล์นี้ไม่มีชีตที่อ่านได้", "This file has no readable sheet"));
        ownBook = { file: f, wb, names, table: null };
        buildOwnPicker();
        st.ok(encNote || tr("อ่านไฟล์แล้ว เลือกคอลัมน์ที่จะใช้", "File loaded, now pick the columns"));
      } catch (e) {
        console.error(e);
        ownBook = null;
        st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Couldn't read the file: ") + e.message);
      }
    });
  }

  function buildOwnPicker() {
    const sheetSel = select(ownBook.names.map((n) => [n, n]), ownBook.names[0]);
    const sel = { task: select([], ""), start: select([], ""), end: select([], ""), group: select([], ""), progress: select([], "") };
    const pickNote = el("div", { class: "pbig-own-note" });
    const useBtn = button(tr("ใช้ข้อมูลนี้", "Use this data"), { onclick: applyOwnData });

    ownPick.innerHTML = "";
    if (ownBook.names.length > 1) ownPick.appendChild(field(tr("ชีต", "Sheet"), sheetSel));
    ownPick.append(
      field(tr("คอลัมน์ชื่องาน", "Task column"), sel.task),
      field(tr("คอลัมน์วันเริ่ม", "Start date column"), sel.start),
      field(tr("คอลัมน์วันจบ", "End date column"), sel.end),
      field(tr("คอลัมน์กลุ่ม (ไม่บังคับ)", "Group column (optional)"), sel.group),
      field(tr("คอลัมน์ความคืบหน้า (ไม่บังคับ)", "Progress column (optional)"), sel.progress),
      pickNote, useBtn
    );
    ownPick.hidden = false;
    sheetSel.addEventListener("change", loadSheet);
    loadSheet();

    function loadSheet() {
      const table = sheetToTable(ownBook.wb.Sheets[sheetSel.value]);
      ownBook.table = table;
      const opts = table.header.map((h, i) => [String(i), h || tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`)]);
      fillSelect(sel.task, opts);
      fillSelect(sel.start, opts);
      fillSelect(sel.end, opts);
      fillSelect(sel.group, [[NO_COL, tr("ไม่ใช้", "Not used")], ...opts]);
      fillSelect(sel.progress, [[NO_COL, tr("ไม่ใช้", "Not used")], ...opts]);
      const g = guessGanttColumns(table.header, table.rows);
      const w = table.header.length;
      // เดาไม่ได้ก็ให้ค่าที่ไม่ซ้ำกันไปก่อน ผู้ใช้เปลี่ยนเองได้
      sel.task.value = String(g.task ?? 0);
      sel.start.value = String(g.start ?? Math.min(1, w - 1));
      sel.end.value = String(g.end ?? Math.min(2, w - 1));
      sel.group.value = g.group == null ? NO_COL : String(g.group);
      sel.progress.value = g.progress == null ? NO_COL : String(g.progress);
      pickNote.textContent = tr(`อ่านได้ ${table.rows.length} แถว`, `${pl(table.rows.length, "row", "rows")} read`);
    }

    function applyOwnData() {
      const table = ownBook && ownBook.table;
      if (!table) return;
      const idx = (s) => (s.value === NO_COL ? null : Number(s.value));
      const out = buildGanttRows(table, {
        task: idx(sel.task), start: idx(sel.start), end: idx(sel.end), group: idx(sel.group), progress: idx(sel.progress),
      });
      if (!out.rows.length) {
        st.err(tr(
          "ไม่พบแถวที่ใช้ได้ ตรวจว่าเลือกคอลัมน์วันเริ่มกับวันจบถูก และวันที่เป็นวัน/เดือน/ปีครบ",
          "No usable rows, check the start and end columns and that the dates carry day, month and year"
        ));
        ownInfo = skippedText(out);
        updateNote();
        return;
      }
      const cut = out.rows.length > MAX_ROWS;
      const rows = cut ? out.rows.slice(0, MAX_ROWS) : out.rows;
      datasets[OWN_KEY] = { title: ownBook.file.name, title_en: ownBook.file.name, rows };
      if (!datasetKeys.includes(OWN_KEY)) datasetKeys.push(OWN_KEY);
      const notes = [skippedText(out)];
      if (out.guessed) notes.push(tr(
        `${out.guessed} แถวมีปี 2 หลัก เดาเป็นปี พ.ศ. 25xx ตรวจก่อนใช้จริง`,
        `${pl(out.guessed, "row has", "rows have")} a 2-digit year, read as Buddhist Era 25xx, please check`));
      if (cut) notes.push(tr(
        `แสดง ${MAX_ROWS} งานแรกจากทั้งหมด ${out.rows.length} งาน`,
        `Showing the first ${MAX_ROWS} of ${out.rows.length} tasks`));
      switchDataset(OWN_KEY);
      ownInfo = notes.filter(Boolean).join(" ");
      updateNote();
      renderDatasetList();
      st.ok(tr(`ใช้ข้อมูลของคุณแล้ว ${rows.length} งาน`, `Now using your data, ${pl(rows.length, "task", "tasks")}`));
    }
  }

  // บอกแถวที่ข้ามพร้อมเลขบรรทัดในไฟล์ (หัวตาราง = บรรทัด 1) ให้ผู้ใช้ไปแก้ต้นทางได้ ไม่ใช่หายเงียบ
  function skippedText(out) {
    if (!out.skipped.length) return "";
    const list = out.skipped.slice(0, 5).map((s) => tr(`บรรทัด ${s.line} ${REASON[s.reason]()}`, `line ${s.line} ${REASON[s.reason]()}`));
    const more = out.skipped.length > 5 ? tr(` และอีก ${out.skipped.length - 5} แถว`, ` and ${out.skipped.length - 5} more`) : "";
    return tr(`ข้าม ${out.skipped.length} แถว: `, `Skipped ${pl(out.skipped.length, "row", "rows")}: `) + list.join(", ") + more + ".";
  }

  function fillSelect(sel, options) {
    sel.innerHTML = "";
    for (const [value, label] of options) sel.appendChild(el("option", { value }, label));
  }

  /* ── แถบล่าง: คัดลอก ดาวน์โหลด คืนค่าเริ่มต้น ─────────────────────── */
  /* สเปกที่คัดลอกหรือดาวน์โหลดต้องมาจาก originalSpec เสมอ (ไม่เคยถูกฉีดข้อมูลตัวอย่าง) แก้แค่ value ของตัวปรับ */
  function buildExportSpec() {
    const spec = clone(originalSpec);
    applyParamsInto(spec, paramValues);
    return spec;
  }

  async function onCopy() {
    if (!originalSpec) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildExportSpec(), null, 2));
      st.ok(tr("คัดลอกสเปกลงคลิปบอร์ดแล้ว วางใน Deneb ได้เลย", "Spec copied. Paste it straight into Deneb"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    if (!originalSpec) return;
    const json = JSON.stringify(buildExportSpec(), null, 2);
    download(new Blob([json], { type: "application/json;charset=utf-8" }), "gantt-spec.json");
    st.ok(tr("ดาวน์โหลดสเปกแล้ว", "Spec downloaded"));
  }

  /** โหลดไฟล์ Excel ตัวอย่างทั้งชุด (ทุกชุดข้อมูลเป็นชีตละชุด) ไว้ลองใช้ช่อง "ข้อมูลของคุณเอง" หรือเปิดใน Power BI ต่อ */
  async function onDownloadSample() {
    try {
      const res = await fetch(XLSX_SAMPLE_URL);
      if (!res.ok) throw new Error(`${XLSX_SAMPLE_URL}: HTTP ${res.status}`);
      download(await res.blob(), XLSX_SAMPLE_NAME);
      st.ok(tr("ดาวน์โหลดไฟล์ตัวอย่างแล้ว", "Sample file downloaded"));
    } catch (e) {
      st.err(tr("โหลดไฟล์ตัวอย่างไม่สำเร็จ: ", "Could not download the sample: ") + e.message);
    }
  }

  /* ‼️ ไฟล์ .csv ต้องมี BOM ไม่งั้น Excel บนวินโดวส์อ่านภาษาไทยเป็นตัวประหลาด (กฎประจำโปรเจกต์) */
  function onDownloadCsv() {
    const info = datasets?.[currentKey];
    if (!info) return;
    const useGroup = info.rows.some((r) => r.Group);
    const useProg = info.rows.some((r) => typeof r.Progress === "number");
    const head = ["Task", "Start", "End", ...(useGroup ? ["Group"] : []), ...(useProg ? ["Progress"] : [])];
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(",")];
    for (const r of info.rows) {
      const cells = [(IS_EN && r.Task_en) || r.Task, r.Start, r.End];
      if (useGroup) cells.push((IS_EN && r.Group_en) || r.Group || "");
      if (useProg) cells.push(r.Progress ?? "");
      lines.push(cells.map(esc).join(","));
    }
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${currentKey}.csv`);
    st.ok(tr("ดาวน์โหลดข้อมูลชุดนี้แล้ว เปิดใน Excel หรือ Power BI ได้เลย", "Data downloaded, open it in Excel or Power BI"));
  }

  /* เริ่มจากค่าเริ่มต้นก่อนเสมอแล้วทับด้วยค่าของชุด ไม่งั้นค่าจากชุดก่อนจะค้างมาปน */
  function applyPreset(values) {
    paramValues = clone(defaults);
    for (const [k, v] of Object.entries(values)) {
      if (k in defaults) paramValues[k] = v;   // สเปกไม่มีตัวนี้ = ข้ามไป ไม่พัง
    }
    pushAllParams();
    st.ok(tr("ใช้ชุดที่เลือกแล้ว ปรับต่อได้ตามใจ", "Applied, tweak it from here"));
  }

  // ยัดค่าปัจจุบันทั้งชุดกลับเข้าทั้งหน้าจอและกราฟ ใช้ร่วมกันระหว่างชุดพร้อมใช้กับการคืนค่าเริ่มต้น
  function pushAllParams() {
    for (const name of editable) controls[name]?.setUI(paramValues[name]);
    dirty?.refresh();
    specView?.refresh();
    state?.save();
    if (view) {
      let v = view;
      for (const name of editable) v = v.signal(name, sigValue(name));
      v.run();
      updateNote();
    }
  }

  async function onShare() {
    const link = state?.shareLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      st.ok(link.includes("?s=") ? SHARE_MSG.ok() : SHARE_MSG.plain());
    } catch { st.err(SHARE_MSG.fail()); }
  }

  function onReset() {
    if (!originalSpec) return;
    paramValues = clone(defaults);
    pushAllParams();
    presets.clearActive();
    state?.forget();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Reset to defaults"));
  }
}
