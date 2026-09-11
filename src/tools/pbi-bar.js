import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { tr, IS_EN } from "../i18n.js";
import { colorPicker, SWATCHES, COLORKIT_CSS } from "../colorkit.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { configSearch, CFGSEARCH_CSS } from "../cfgsearch.js";
import { stateKit, SHARE_MSG } from "../statekit.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, sheetToTable, cellText } from "../sheetpick.js";

/* ‼️ รายชื่อตัวปรับที่ผู้ใช้แตะได้ เป็น "ผู้สมัคร" ไม่ใช่รายการตายตัว
   ตัวไหนไม่มีอยู่จริงใน spec.params ที่โหลดมา ปุ่มของตัวนั้นจะไม่ถูกสร้างเลย
   (สเปกกับหน้าเว็บถูกแก้คนละรอบกันได้ ไฟล์นี้จึงต้องทนต่อสเปกที่ยังไม่มีตัวใหม่) */
const EDITABLE_PARAMS = [
  "sortMode", "customOrder", "maxBars", "otherLabel", "barThickness", "cornerRadius",
  "valueLabel", "showPercent", "palette", "colorOverrides", "otherColor",
  "targetMode", "targetColorOver", "targetColorUnder", "axisMode",
  "fontScale", "labelFontScale", "nameFontScale",
];

// คีย์ของชุดข้อมูลที่ผู้ใช้อัปโหลดเอง ไม่ชนกับคีย์ในไฟล์ตัวอย่างแน่นอน
const OWN_KEY = "__own__";
// ค่านี้แปลว่า "ไม่ใช้คอลัมน์เป้าหมาย" ในช่องเลือกคอลัมน์ของข้อมูลผู้ใช้
const NO_COL = "__none__";

/* ป้ายทูลทิปฉบับอังกฤษ เทียบด้วยชื่อ field ไม่ใช่ข้อความไทย (ดู localizeSpec)
   ‼️ ต้องอยู่ระดับบนสุด ไม่ใช่ใน mount() เพราะ mount เรียก init() ก่อนถึงบรรทัด const
   ที่อยู่ใต้มัน แล้วจะได้ ReferenceError จาก temporal dead zone (เจอจริง 4 ครั้ง 11/09/2026) */
const TOOLTIP_EN = {
  __groupKey: "Category", __valueText: "Value", __pctText: "Share",
  __targetTooltipText: "Target",
};

// ชุดสีธีมมาตรฐาน Power BI ใช้แทน pbiColor() ที่มีจริงเฉพาะใน Power BI เท่านั้น
const PBI_COLORS = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550", "#197278", "#8AB833"];

const SPEC_URL = "samples/powerbi/bar.vl.json";
const DATASETS_URL = "samples/powerbi/bar-datasets.json";

// ‼️ ฝัง <style> ในโมดูลนี้ตรง ๆ ห้ามแก้ assets/css/tool.css
const STYLE = `
.pbib-ds-list{display:flex;flex-direction:column;gap:8px}
.pbib-ds-card{position:relative;display:block;padding:10px 12px;border:1.5px solid var(--line);
  border-radius:var(--r-sm);cursor:pointer;background:var(--bg-soft);
  transition:border-color .12s var(--ease-snap,ease),background .12s var(--ease-snap,ease)}
.pbib-ds-card input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.pbib-ds-card:hover{border-color:color-mix(in srgb,var(--g-powerbi,var(--brand)) 45%,var(--line))}
.pbib-ds-card:has(input:checked){border-color:var(--g-powerbi,var(--brand));
  background:color-mix(in srgb,var(--g-powerbi,var(--brand)) 12%,var(--bg-soft))}
.pbib-ds-card input:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.pbib-ds-title{font-weight:700;font-size:13.5px;color:var(--text)}
.pbib-ds-meta{font-size:12px;color:var(--text-mute);margin-top:2px}
.pbib-ds-note{font-size:12px;color:var(--text-mute);margin-top:5px;line-height:1.6;
  padding-left:9px;border-left:2px solid color-mix(in srgb,var(--g-powerbi,var(--brand)) 55%,var(--line))}

.pbib-chart-box{position:relative;width:100%;min-height:300px}
.pbib-chart{width:100%;height:100%}
.pbib-chart .vega-embed{width:100%;height:100%}
.pbib-note{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-top:10px}
.pbib-chart-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--text-mute);font-size:13.5px;text-align:center;padding:20px;line-height:1.7}

.pbib-right{display:flex;flex-direction:column;gap:18px}
.pbib-group{display:flex;flex-direction:column;gap:10px}
.pbib-group-title{margin:0;font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--text-mute)}

.pbib-range-row{display:flex;align-items:center;gap:10px}
.pbib-range-row input[type=range]{flex:1;accent-color:var(--g-powerbi,var(--brand))}
.pbib-rangeval{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;min-width:46px;text-align:right;color:var(--text)}

.pbib-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pbib-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pbib-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pbib-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pbib-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pbib-switch input:checked + .pbib-switch-track{background:var(--g-powerbi,var(--brand))}
.pbib-switch input:checked + .pbib-switch-track::after{transform:translateX(18px)}
.pbib-switch input:focus-visible + .pbib-switch-track{outline:2px solid var(--brand);outline-offset:2px}
/* ‼️ จอสัมผัสต้องกดโดน ยืดกรอบสวิตช์ให้สูง 36px แต่ตัวแถบยังสูง 24px เท่าเดิม
   ระยะเลื่อนปุ่มกลมไม่ต้องแก้ เพราะความกว้างกับตำแหน่งในแถบยังเหมือนเดิมทุกอย่าง */
@media (pointer:coarse){
  .pbib-switch{height:36px}
  .pbib-switch-track{top:6px;bottom:6px}
}
${COLORKIT_CSS}
${PRESETS_CSS}
${CFGSEARCH_CSS}

.pbib-own{margin-top:16px;padding-top:14px;border-top:1px dashed var(--line)}
.pbib-own-title{margin:0 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
.pbib-own-hint{font-size:12px;color:var(--text-mute);line-height:1.65;margin:0 0 10px}
.pbib-own input[type=file]{width:100%;font-size:12.5px;color:var(--text)}
.pbib-own-pick{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.pbib-own-note{font-size:12px;color:var(--text-mute);line-height:1.65}

.pbib-learn{margin-top:16px;border:1.5px solid var(--line);border-radius:var(--r-sm);
  background:var(--bg-soft);overflow:hidden}
.pbib-learn>summary{cursor:pointer;padding:13px 15px;font-weight:700;font-size:13.5px;
  color:var(--text);list-style:none}
.pbib-learn>summary::-webkit-details-marker{display:none}
.pbib-learn>summary::before{content:"\\25B8";display:inline-block;width:14px;
  transition:transform .15s var(--ease-snap,ease)}
.pbib-learn[open]>summary::before{transform:rotate(90deg)}
.pbib-learn-body{padding:0 15px 15px;display:flex;flex-direction:column;gap:12px}
.pbib-learn-lead{font-size:13px;color:var(--text-mute);line-height:1.75;margin:0}
.pbib-m{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--card);padding:11px 13px}
.pbib-m-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pbib-m-name{font-weight:700;font-size:13px;color:var(--text)}
.pbib-m-why{font-size:12.5px;color:var(--text-mute);margin:5px 0 9px;line-height:1.7}
.pbib-m pre{margin:0;overflow-x:auto;background:var(--bg-soft);border-radius:6px;padding:9px 11px}
.pbib-m code{font-size:12.5px;line-height:1.65;color:var(--text);white-space:pre}
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
  let hasTargetCol = false;  // ชุดข้อมูลที่เลือกอยู่มีคอลัมน์ Target จริงไหม
  /* ‼️ ต้องประกาศรวมไว้บนสุดกับตัวอื่น ห้ามไปประกาศคาไว้ข้างฟังก์ชันที่ใช้มัน
     เพราะ mount เรียก init() ตั้งแต่ต้น แล้ว init เรียก syncChartHeight ต่อทันที
     ซึ่งจะไปแตะตัวแปรที่ let ยังไม่ถึงบรรทัด แล้วพังทั้งเครื่องมือ (โดนมาแล้ว 5 ครั้ง) */
  let boxH = 0;              // ความสูงกล่องกราฟล่าสุด กันสั่งยืดซ้ำค่าเดิม

  const controls = {};
  const noteEl = el("div", { class: "pbib-note", hidden: true });
  const chartEl = el("div", { class: "pbib-chart", id: "pbib-chart" });
  const chartMsg = el("div", { class: "pbib-chart-msg" }, tr("กำลังเตรียมกราฟ…", "Preparing the chart…"));
  const chartBox = el("div", { class: "pbib-chart-box" }, [chartMsg, chartEl]);
  const centerWrap = el("div", {}, [chartBox, noteEl]);

  /* ชุดพร้อมใช้เขียนเฉพาะค่าที่ต่างจากค่าเริ่มต้น ตัวไหนที่สเปกไม่มีจะถูกข้ามเอง */
  const PRESETS = [
    { id: "default", name: tr("ค่าเริ่มต้น", "Default"),
      desc: tr("ป้ายตัวเลขอยู่นอกปลายแท่ง เรียงมากไปน้อย", "Value labels outside the bars, sorted high to low"),
      values: {} },
    { id: "target", name: tr("เทียบเป้าหมาย", "Against target"),
      desc: tr("ขีดเส้นเป้าหมายบนแท่ง ใช้ได้เมื่อข้อมูลมีคอลัมน์ Target",
               "Draws the target line on each bar, for data that carries a Target column"),
      values: { targetMode: "line", axisMode: "auto" } },
    { id: "tight", name: tr("ช่องแคบ", "Narrow slot"),
      desc: tr("แท่งหนาขึ้น ป้ายเข้าไปอยู่ในแท่ง ตัวอักษรเล็กลง เหมาะกับช่องแคบในหน้ารายงาน",
               "Thicker bars with labels tucked inside and smaller text, for a narrow slot in a report"),
      values: { barThickness: 0.86, cornerRadius: 0, valueLabel: "inside", fontScale: 0.9 } },
    { id: "present", name: tr("ขึ้นจอนำเสนอ", "For presenting"),
      desc: tr("ตัวอักษรใหญ่ขึ้นทั้งหมด แท่งบางลงให้หายใจ เห็นชัดจากท้ายห้อง",
               "Larger text all round with slimmer bars, so it reads from the back of the room"),
      values: { fontScale: 1.35, barThickness: 0.6, cornerRadius: 4, maxBars: 8 } },
    { id: "ranking", name: tr("จัดอันดับ", "Ranking"),
      desc: tr("โชว์เยอะแท่ง แสดงสัดส่วนต่อท้ายตัวเลข แกนพอดีค่าจริง",
               "More bars, share shown after each number, axis fitted to the real values"),
      values: { maxBars: 15, showPercent: true, axisMode: "zero", barThickness: 0.8 } },
  ];

  const presets = presetBar(PRESETS, applyPreset);
  let cfgSearch = null;   // ช่องค้นหาในแผงตั้งค่า สร้างหลังแผงมีเนื้อหาแล้ว
  const dsListEl = el("div", { class: "pbib-ds-list" });
  const rightBody = el("div", { class: "pbib-right" });

  // กล่อง "ใช้ข้อมูลของคุณเอง" อ่าน .xlsx/.csv แล้วให้เลือกคอลัมน์เอง
  const fileInput = el("input", { type: "file", accept: ".xlsx,.xlsm,.xls,.csv,.txt" });
  const ownPick = el("div", { class: "pbib-own-pick", hidden: true });
  const ownBlock = el("div", { class: "pbib-own" }, [
    el("h3", { class: "pbib-own-title" }, tr("ใช้ข้อมูลของคุณเอง", "Use your own data")),
    el("p", { class: "pbib-own-hint" }, tr(
      "เปิดไฟล์ Excel หรือ CSV แล้วเลือกคอลัมน์ชื่อกลุ่มกับค่า มีเป้าหมายเลือกเพิ่มได้ ชื่อซ้ำรวมยอดให้เอง",
      "Open an Excel or CSV file, then pick which column is the category and which is the value. Add a target column if you have one. Repeated categories are summed for you"
    )),
    fileInput, ownPick,
  ]);
  const leftBody = el("div", {}, [dsListEl, ownBlock]);

  let customOrderWrap = null;
  let targetColorWrap = null;

  const copyBtn = button(tr("คัดลอกสเปก", "Copy spec"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .json", "Download .json"), { icon: "download", ghost: true, onclick: onDownload });
  const dlCsvBtn = button(tr("ดาวน์โหลดข้อมูลชุดนี้ .csv", "Download this data as .csv"),
    { icon: "download", ghost: true, onclick: onDownloadCsv });
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
    footer: [copyBtn, dlBtn, dlCsvBtn, shareBtn, resetBtn, st.node],
    note: tr(
      "ใน Deneb ลาก field เข้า well แล้ว Rename เป็น Category, Value, Target จากนั้นวางสเปกทับของเดิม",
      "In Deneb drag fields into the wells, rename them Category, Value, Target, then paste the spec over the old one"
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

      /* !! ต้องแปลสเปกก่อนเก็บค่าเริ่มต้น ไม่ใช่หลัง
         เพราะชื่อแท่งที่ยุบรวมเป็นค่าที่ถูกแปลตามภาษาหน้าเว็บ ถ้าเก็บค่าเริ่มต้นไว้ก่อน
         ค่าไทยจะค้างอยู่ใน paramValues แล้วถูกยัดกลับทับตอนวาด ทำให้โหมดอังกฤษ
         เห็นแท่งชื่อไทยโผล่กลางกราฟ (เห็นเฉพาะชุดที่มีการยุบรวมเท่านั้น จึงหลุดง่ายมาก) */
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
      // ‼️ ต้อง import หลังจาก window.vega พร้อมแล้วเท่านั้น (vega-util-shim.js ส่งต่อจาก bundle ตัวนั้น)
      ({ expressionInterpreter: exprInterpreter } = await import("../../vendor/vega-interpreter.esm.js"));

      /* ‼️ ต้องสร้างหลังรู้ค่าเริ่มต้นจากสเปกจริงแล้วเท่านั้น ไม่งั้นเทียบ diff ไม่ได้
         และต้องกู้ค่าก่อน buildRightPanel เพื่อให้ช่องกรอกวาดด้วยค่าที่กู้มาเลย */
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
      buildLearnBlock();
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

  /* ‼️ ป้ายในทูลทิปของสเปกเขียนเป็นไทยไว้ โหมดอังกฤษต้องเปลี่ยนตาม และต้องเปลี่ยนที่
     originalSpec ก่อนใช้งานใด ๆ เพื่อให้ "สิ่งที่เห็นในพรีวิว" กับ "สิ่งที่กดคัดลอกไปใช้"
     เป็นอันเดียวกันเสมอ เทียบด้วย field ไม่ใช่ข้อความไทย เพราะข้อความเปลี่ยนได้แต่ field
     เป็นสัญญาภายในสเปก */
  function localizeSpec(spec) {
    if (!IS_EN) return;
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (Array.isArray(node.tooltip)) {
        for (const t of node.tooltip) {
          const en = TOOLTIP_EN[t && t.field];
          if (en) t.title = en;
        }
      }
      Object.values(node).forEach(walk);
    };
    walk(spec);
    // ชื่อกลุ่มที่ยุบรวมก็ต้องเป็นอังกฤษด้วย ไม่งั้นแท่งท้ายสุดโผล่เป็นไทยกลางกราฟอังกฤษ
    for (const p of spec.params) if (p.name === "otherLabel") p.value = "Other";
  }

  function fetchJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
  }

  /* ‼️ กราฟแท่งต่างจากโดนัทตรงที่ "จำนวนแท่ง" กำหนดความสูงที่เหมาะสม
     ถ้าตรึงความสูงไว้ค่าเดียว ชุด 15 แท่งจะบางจนอ่านชื่อไม่ออก ส่วนชุด 4 แท่งจะอ้วนจนดูแปลก
     จึงคิดความสูงจากจำนวนแท่งที่จะแสดงจริง (นับการยุบรวมด้วย) แล้วคุมเพดานไว้ */
  function syncChartHeight() {
    const rows = datasets?.[currentKey]?.rows || [];
    const cap = Number(paramValues.maxBars) || 10;
    const shown = Math.min(rows.length, cap) + (rows.length > cap ? 1 : 0);
    const h = Math.max(300, Math.min(620, shown * 46 + 60));
    if (h === boxH) return;
    boxH = h;
    chartBox.style.height = `${h}px`;
    /* ‼️ ยืดกล่องอย่างเดียวไม่พอ กราฟที่ฝังแบบ container อ่านขนาดตอนฝังครั้งเดียว
       แล้วไม่ขยับตามกล่องอีกเลย (เห็นกับตา 11/09/2026 สลับไปชุด 15 แท่งแล้วแท่งกองอยู่
       ครึ่งบน เหลือที่ว่างครึ่งล่าง) ต้องบอกความสูงใหม่ให้วิวตรง ๆ
       หักระยะขอบออกก่อน เพราะสเปกตั้ง autosize แบบนับขอบรวมอยู่ในความสูงแล้ว */
    if (view) {
      const pad = originalSpec?.padding || {};
      try { view.height(Math.max(80, h - (pad.top || 0) - (pad.bottom || 0))).run(); } catch { /* ยังฝังไม่เสร็จ */ }
    }
  }

  async function embedChart() {
    // ให้เบราว์เซอร์วาดเฟรมหนึ่งก่อน กันเคส container ยังไม่มีขนาดจริงตอนเรียก vegaEmbed
    await new Promise((r) => requestAnimationFrame(r));

    const rows = withRuntimeFields(datasets[currentKey].rows);
    const spec = clone(originalSpec);
    const dataNode = findDatasetNode(spec);
    if (!dataNode) throw new Error(tr("หา placeholder ข้อมูลในสเปกไม่เจอ", "Could not find the data placeholder in the spec"));
    dataNode.values = rows;
    applyParamsInto(spec, paramValues);
    spec.width = "container";
    spec.height = "container";

    /* ‼️ ast + expr = หัวใจที่ทำให้กราฟขึ้นได้บนเว็บนี้
       ปกติ Vega คอมไพล์นิพจน์ในสเปกด้วย new Function() ซึ่ง CSP ของ FileKit บล็อกทิ้ง
       เพราะจงใจไม่ใส่ 'unsafe-eval' (มีเทสกันไว้ ห้ามผ่อน) ทางแก้ที่ทีม Vega ออกแบบมา
       สำหรับกรณีนี้โดยเฉพาะคือสั่ง ast:true ให้คอมไพเลอร์ส่ง syntax tree มาแทนโค้ด
       แล้วให้ vega-interpreter เดินต้นไม้นั้นตีความเอง ไม่แตะ eval สักจุด */
    const result = await window.vegaEmbed(chartEl, spec, {
      actions: false, renderer: "svg", ast: true, expr: exprInterpreter,
    });
    view = result.view;
    updateNote();
  }

  /* ── บอกผู้ใช้เมื่อกราฟตัดสินใจเองแทน ──────────────────────────────
   * ‼️ ไม่เดาจากขนาดกล่อง แต่อ่านค่าที่สเปกคำนวณไว้จริงจากแถวข้อมูลในวิว
   * ต้องใช้ view.data(ชื่อ) ไม่ใช่ getState() เพราะ getState คืน mark ที่วาดแล้ว ไม่ใช่แถวข้อมูล
   * ชื่อ data source หลังคอมไพล์ Vega-Lite เป็น data_0, data_2, data_3 ซึ่งเดาไม่ได้ จึงไล่ทุกชื่อ */
  function readRowField(fieldName) {
    if (!view) return null;
    try {
      const names = Object.keys(view.getState({ data: () => true, signals: () => false, recurse: false }).data || {});
      for (const n of names) {
        const rows = view.data(n);
        if (Array.isArray(rows) && rows.length && rows[0] && fieldName in rows[0]) return rows[0][fieldName];
      }
    } catch { /* อ่านไม่ได้ = เงียบไว้ ดีกว่าเตือนผิด */ }
    return null;
  }

  function updateNote() {
    const msgs = [];
    const eff = readRowField("__effLabelMode");
    if (paramValues.valueLabel === "outside" && eff === "inside") {
      msgs.push(tr(
        "ที่ทางขวาไม่พอ กราฟจึงย้ายป้ายเข้าไปในแท่งให้เอง ลองทำให้วิชวลกว้างขึ้นหรือลดขนาดตัวอักษรป้าย",
        "There wasn't room on the right for the value labels, so the chart moved them inside the bars. To bring them back out, widen the visual or reduce the label text size"
      ));
    }
    if (paramValues.targetMode !== "none" && !hasTargetCol) {
      msgs.push(tr(
        "ชุดนี้ไม่มีคอลัมน์ Target เส้นและสีเป้าหมายจึงยังไม่แสดง ลองชุดยอดขายตามช่องทางดู",
        "No Target column in this data, so the line and colors have nothing to draw. Try the sales by channel set"
      ));
    }
    noteEl.hidden = msgs.length === 0;
    noteEl.textContent = msgs.join(" ");
  }

  /* ── ตัวช่วยข้อมูล ────────────────────────────────────────────────── */
  function clone(v) {
    return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  }
  // เดินทั้ง object tree หา node ที่ name === "dataset" (placeholder ข้อมูลของ Deneb)
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
     ‼️ ชุดตัวอย่างมีชื่อกลุ่มสองภาษา โหมดอังกฤษต้องใช้ Category_en ไม่งั้นกราฟเป็นไทยค้าง
     ส่วน Target ใส่เฉพาะแถวที่มีจริง ถ้ายัดค่าว่างลงไปสเปกจะนับว่าเป้าหมายเป็น 0 */
  function withRuntimeFields(rows) {
    hasTargetCol = rows.some((r) => typeof r.Target === "number" && Number.isFinite(r.Target));
    return rows.map((r, i) => {
      const out = {
        Category: (IS_EN && r.Category_en) || r.Category,
        Value: r.Value,
        __row__: i, __selected__: "neutral",
      };
      if (typeof r.Target === "number" && Number.isFinite(r.Target)) out.Target = r.Target;
      return out;
    });
  }
  function applyParamsInto(spec, values) {
    for (const p of spec.params) {
      if (Object.prototype.hasOwnProperty.call(values, p.name)) p.value = clone(values[p.name]);
    }
  }
  function registerExpressions(vega) {
    // ลงทะเบียนซ้ำได้ไม่เป็นไร (เครื่องมือถูก sleep/wake หรือ retry ได้ในหน้าเดียวกัน)
    try { vega.expressionFunction("pbiColor", (i) => PBI_COLORS[((i % 10) + 10) % 10]); } catch { /* ลงทะเบียนแล้ว */ }
    try { vega.expressionFunction("pbiFormat", (v) => String(v)); } catch { /* ลงทะเบียนแล้ว */ }
  }

  /* ── ปรับค่าแล้วอัปเดตกราฟทันทีผ่าน view.signal() (เร็วกว่าฝังสเปกใหม่ทั้งก้อนมาก) ── */
  function setParam(name, value) {
    presets.clearActive();
    paramValues[name] = value;
    state?.save();
    if (name === "maxBars") syncChartHeight();
    if (!view) return;
    view.signal(name, value);
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
    syncChartHeight();
    if (!view) return;
    const rows = withRuntimeFields(datasets[key].rows);
    const cs = window.vega.changeset().remove(() => true).insert(rows);
    view.change("dataset", cs).run();
    updateNote();
  }

  /* ── แผงซ้าย: เลือกชุดข้อมูล ─────────────────────────────────────── */
  function renderDatasetList() {
    dsListEl.innerHTML = "";
    for (const key of datasetKeys) dsListEl.appendChild(datasetCard(key, datasets[key]));
  }
  function datasetCard(key, info) {
    const total = info.rows.reduce((s, r) => s + (Number(r.Value) || 0), 0);
    const input = el("input", { type: "radio", name: "pbib-ds", value: key });
    input.checked = key === currentKey;
    const title = IS_EN && info.title_en ? info.title_en : info.title;
    const meta = tr(
      `${info.rows.length} กลุ่ม, รวม ${total.toLocaleString("th-TH")}`,
      `${info.rows.length} groups, total ${total.toLocaleString("en-US")}`
    );
    const body = [
      el("div", { class: "pbib-ds-title" }, title),
      el("div", { class: "pbib-ds-meta" }, meta),
    ];
    const note = IS_EN ? info.note_en : info.note;
    if (note) body.push(el("div", { class: "pbib-ds-note" }, note));
    const card = el("label", { class: "pbib-ds-card" }, [input, el("div", {}, body)]);
    input.addEventListener("change", () => switchDataset(key));
    return card;
  }

  /* ── แผงขวา: ตัวปรับทั้งหมด จัดเป็นกลุ่ม ─────────────────────────── */
  function buildRightPanel() {
    rightBody.innerHTML = "";

    const labelGroup = groupBox(tr("ป้ายตัวเลข", "Value labels"), [
      selectField(tr("ตำแหน่งป้าย", "Label position"), "valueLabel", [
        ["outside", tr("นอกปลายแท่ง", "Outside the bar")],
        ["inside", tr("ในปลายแท่ง", "Inside the bar")],
        ["none", tr("ซ่อน", "Hidden")],
      ], undefined, tr("เลือกนอกปลายแท่งแล้วที่ไม่พอ กราฟจะย้ายเข้าในแท่งให้เอง",
                       "If outside doesn't fit, the chart moves the labels inside for you")),
      switchField(tr("ต่อท้ายด้วยสัดส่วน", "Add the share"), "showPercent"),
    ]);

    const sortGroup = groupBox(tr("การเรียงและการยุบ", "Sort & collapse"), [
      rangeField(tr("จำนวนแท่งสูงสุด", "Max bars"), "maxBars",
        { min: 3, max: 20, step: 1, fmt: (v) => String(Math.round(v)) },
        tr("เกินนี้ยุบรวมเป็นแท่งเดียวปักท้ายสุด", "Beyond this, the rest collapse into one bar pinned to the bottom")),
      selectField(tr("การเรียงลำดับ", "Sort order"), "sortMode", [
        ["valueDesc", tr("ค่ามาก ไป น้อย", "Value high to low")],
        ["valueAsc", tr("ค่าน้อย ไป มาก", "Value low to high")],
        ["nameAsc", tr("ชื่อ ก ไป ฮ", "Name A to Z")],
        ["custom", tr("กำหนดเอง", "Custom order")],
      ], updateConditionalVisibility),
      (customOrderWrap = listTextareaField(tr("ลำดับที่กำหนดเอง (บรรทัดละ 1 ชื่อ)", "Custom order (one name per line)"), "customOrder",
        tr("ใช้ชื่อกลุ่มเดียวกับข้อมูล ใช้เมื่อเลือกการเรียงลำดับ = กำหนดเอง",
           "Use the same category names as the data. Used when sort order is set to custom"))),
      textField(tr("ชื่อแท่งที่ยุบรวม", "Name for the collapsed bar"), "otherLabel"),
    ]);

    const targetGroup = groupBox(tr("เป้าหมาย", "Target"), [
      selectField(tr("ใช้คอลัมน์ Target ยังไง", "How to use the Target column"), "targetMode", [
        ["none", tr("ไม่ใช้", "Don't use it")],
        ["line", tr("ขีดเส้นเป้าหมาย", "Draw a target line")],
        ["color", tr("ระบายสีตามถึงเป้าหรือไม่ถึง", "Color by hit or miss")],
      ], () => { updateConditionalVisibility(); updateNote(); },
        tr("ข้อมูลต้องมีคอลัมน์ชื่อ Target ถึงจะเห็นผล", "Your data needs a column named Target for this to show")),
      (targetColorWrap = el("div", { class: "pbib-group" }, [
        colorField(tr("สีเมื่อถึงเป้า", "Color when the target is met"), "targetColorOver"),
        colorField(tr("สีเมื่อไม่ถึงเป้า", "Color when it isn't"), "targetColorUnder"),
      ])),
    ]);

    const colorGroup = groupBox(tr("สี", "Color"), [
      paletteField(tr("ชุดสี", "Palette"), "palette",
        tr("คั่นด้วยจุลภาค เช่น #118DFF, #E66C37 (ว่าง = ใช้สีธีม Power BI)",
           "Comma separated, e.g. #118DFF, #E66C37 (empty = use the Power BI theme)")),
      objectTextareaField(tr("จับคู่ชื่อ → สี", "Name to color overrides"), "colorOverrides",
        tr("บรรทัดละ 1 คู่ รูปแบบ ชื่อกลุ่ม = #เลขสี เช่น ออนไลน์ = #12239E (ชนะสีอื่นทุกชั้น)",
           "One pair per line, e.g. Online = #12239E (wins over every other color rule)")),
      colorField(tr("สีของแท่งที่ยุบรวม", "Color for the collapsed bar"), "otherColor"),
    ]);

    const shapeGroup = groupBox(tr("ขนาดและรูปทรง", "Size & shape"), [
      rangeField(tr("ความหนาแท่ง", "Bar thickness"), "barThickness",
        { min: 0.3, max: 1.0, step: 0.02, fmt: (v) => v.toFixed(2) },
        tr("ที่เหลือเป็นช่องว่างระหว่างแท่ง", "The rest becomes the gap between bars")),
      rangeField(tr("มุมโค้งปลายแท่ง", "Corner radius"), "cornerRadius",
        { min: 0, max: 8, step: 1, fmt: (v) => String(Math.round(v)) }),
      selectField(tr("แกนค่า", "Value axis"), "axisMode", [
        ["auto", tr("เผื่อที่ปลายแกน", "Leave room at the end")],
        ["zero", tr("พอดีค่าจริง", "Fit the real values")],
        ["hide", tr("ซ่อนแกน", "Hide the axis")],
      ], undefined, tr("ไม่ว่าเลือกแบบไหน ความยาวแท่งยังตรงสัดส่วนค่าจริงเสมอ เพราะเส้นฐานศูนย์ไม่ขยับ",
                       "Whichever you pick, bar length still matches the real values, because the zero line never moves")),
    ]);

    const fontFields = [
      ...maybe("fontScale", () => rangeField(tr("ขนาดตัวอักษรรวม", "Overall text size"), "fontScale",
        { min: 0.6, max: 1.6, step: 0.05, fmt: (v) => v.toFixed(2) },
        tr("คูณตัวอักษรทุกก้อนพร้อมกัน", "Scales every piece of text at once"))),
      ...maybe("labelFontScale", () => rangeField(tr("ป้ายตัวเลข", "Value labels"), "labelFontScale",
        { min: 0.5, max: 2.0, step: 0.05, fmt: (v) => v.toFixed(2) })),
      ...maybe("nameFontScale", () => rangeField(tr("ชื่อกลุ่ม", "Category names"), "nameFontScale",
        { min: 0.5, max: 2.0, step: 0.05, fmt: (v) => v.toFixed(2) })),
    ];

    rightBody.append(presets.node, labelGroup, sortGroup, targetGroup, colorGroup, shapeGroup);
    if (fontFields.length) rightBody.appendChild(groupBox(tr("ขนาดตัวอักษร", "Text size"), fontFields));
    updateConditionalVisibility();

    /* ‼️ ต้องสร้างหลังกลุ่มทั้งหมดอยู่ใน rightBody แล้ว เพราะมันอ่านโครงตอนสร้าง
       ถ้าสร้างก่อนจะ index ได้ศูนย์รายการแล้วค้นอะไรก็ไม่เจอ */
    cfgSearch = configSearch({
      scope: rightBody,
      groupSel: ".pbib-group",
      keep: [presets.node],
    });
    rightBody.prepend(cfgSearch.node);
  }

  // สร้างช่องปรับเฉพาะตอนสเปกมีตัวปรับชื่อนั้นจริง (สเปกเก่าไม่มี = ไม่ขึ้นปุ่ม ไม่พัง)
  function maybe(name, make) {
    return name in defaults ? [make()] : [];
  }

  function groupBox(title, nodes) {
    return el("div", { class: "pbib-group" }, [el("h3", { class: "pbib-group-title" }, title), ...nodes]);
  }
  function updateConditionalVisibility() {
    if (customOrderWrap) customOrderWrap.hidden = paramValues.sortMode !== "custom";
    if (targetColorWrap) targetColorWrap.hidden = paramValues.targetMode !== "color";
  }

  /* ── ตัวสร้างช่องปรับแต่ละชนิด ───────────────────────────────────── */
  function rangeField(labelText, name, { min, max, step, fmt = (v) => String(v) }, hint) {
    const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) });
    input.value = String(paramValues[name]);
    const out = el("span", { class: "pbib-rangeval" }, fmt(paramValues[name]));
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      setParam(name, v);
    });
    controls[name] = { setUI: (v) => { input.value = String(v); out.textContent = fmt(v); } };
    return field(labelText, el("div", { class: "pbib-range-row" }, [input, out]), hint);
  }

  function selectField(labelText, name, options, onChange, hint) {
    const s = select(options, paramValues[name]);
    s.addEventListener("change", () => {
      setParam(name, s.value);
      if (onChange) onChange();
    });
    controls[name] = { setUI: (v) => { s.value = v; } };
    return field(labelText, s, hint);
  }

  function textField(labelText, name, hint) {
    const input = el("input", { type: "text" });
    input.value = paramValues[name] ?? "";
    input.addEventListener("input", () => setParam(name, input.value));
    controls[name] = { setUI: (v) => { input.value = v ?? ""; } };
    return field(labelText, input, hint);
  }

  // ‼️ ใช้ตัวเลือกสีกลางจาก colorkit.js เหมือนทุกเครื่องมือ จานสีเป็นชุดธีม Power BI
  function colorField(labelText, name, hint) {
    const p = colorPicker(paramValues[name] || "#000000", (hex) => setParam(name, hex),
      { swatches: SWATCHES.powerbi, label: labelText });
    controls[name] = { setUI: (v) => p.setUI(v || "#000000") };
    return field(labelText, p.node, hint);
  }

  function switchField(labelText, name) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!paramValues[name];
    const track = el("span", { class: "pbib-switch-track" });
    const sw = el("label", { class: "pbib-switch" }, [input, track]);
    input.addEventListener("change", () => setParam(name, input.checked));
    controls[name] = { setUI: (v) => { input.checked = !!v; } };
    return el("div", { class: "field pbib-switch-field" }, [el("span", {}, labelText), sw]);
  }

  function paletteField(labelText, name, hint) {
    const input = el("input", { type: "text" });
    input.value = (paramValues[name] || []).join(", ");
    input.addEventListener("input", () => {
      const arr = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      setParam(name, arr);
    });
    controls[name] = { setUI: (v) => { input.value = (v || []).join(", "); } };
    return field(labelText, input, hint);
  }

  function listTextareaField(labelText, name, hint) {
    const ta = el("textarea", { rows: "4" });
    ta.value = (paramValues[name] || []).join("\n");
    ta.addEventListener("input", () => {
      const arr = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
      setParam(name, arr);
    });
    controls[name] = { setUI: (v) => { ta.value = (v || []).join("\n"); } };
    return field(labelText, ta, hint);
  }

  function objectTextareaField(labelText, name, hint) {
    const ta = el("textarea", { rows: "4" });
    ta.value = objToLines(paramValues[name] || {});
    ta.addEventListener("input", () => setParam(name, linesToObj(ta.value)));
    controls[name] = { setUI: (v) => { ta.value = objToLines(v || {}); } };
    return field(labelText, ta, hint);
  }
  function objToLines(obj) {
    return Object.entries(obj).map(([k, v]) => `${k} = ${v}`).join("\n");
  }
  function linesToObj(text) {
    const out = {};
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const idx = line.indexOf("=");
      if (idx < 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
    return out;
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
    const catSel = select([], "");
    const valSel = select([], "");
    const tgtSel = select([], "");
    const pickNote = el("div", { class: "pbib-own-note" });
    const useBtn = button(tr("ใช้ข้อมูลนี้", "Use this data"), { onclick: applyOwnData });

    ownPick.innerHTML = "";
    if (ownBook.names.length > 1) ownPick.appendChild(field(tr("ชีต", "Sheet"), sheetSel));
    ownPick.append(
      field(tr("คอลัมน์ชื่อกลุ่ม", "Category column"), catSel),
      field(tr("คอลัมน์ค่า", "Value column"), valSel),
      field(tr("คอลัมน์เป้าหมาย (ไม่บังคับ)", "Target column (optional)"), tgtSel),
      pickNote, useBtn
    );
    ownPick.hidden = false;
    sheetSel.addEventListener("change", loadSheet);
    loadSheet();

    function loadSheet() {
      const table = sheetToTable(ownBook.wb.Sheets[sheetSel.value]);
      ownBook.table = table;
      const opts = table.header.map((h, i) => [String(i), h || tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`)]);
      fillSelect(catSel, opts);
      fillSelect(valSel, opts);
      fillSelect(tgtSel, [[NO_COL, tr("ไม่ใช้", "Not used")], ...opts]);
      const g = guessColumns(table);
      catSel.value = String(g.catIdx);
      valSel.value = String(g.valIdx);
      tgtSel.value = NO_COL;
      pickNote.textContent = tr(`อ่านได้ ${table.rows.length} แถว`, `${table.rows.length} rows read`);
    }

    function applyOwnData() {
      const table = ownBook && ownBook.table;
      if (!table) return;
      const valIdx = Number(valSel.value);
      const tgtIdx = tgtSel.value === NO_COL ? null : Number(tgtSel.value);
      const rows = aggregateRows(table, Number(catSel.value), valIdx, tgtIdx);
      if (!rows.length) {
        st.err(tr(
          "ไม่พบแถวที่ใช้ได้ ลองเลือกคอลัมน์ค่าให้เป็นคอลัมน์ที่เป็นตัวเลข",
          "No usable rows, try picking a numeric column as the value"
        ));
        return;
      }
      datasets[OWN_KEY] = { title: ownBook.file.name, title_en: ownBook.file.name, rows };
      if (!datasetKeys.includes(OWN_KEY)) datasetKeys.push(OWN_KEY);
      switchDataset(OWN_KEY);
      renderDatasetList();
      st.ok(tr(`ใช้ข้อมูลของคุณแล้ว ${rows.length} กลุ่ม`, `Now using your data, ${rows.length} groups`));
    }
  }

  function fillSelect(sel, options) {
    sel.innerHTML = "";
    for (const [value, label] of options) sel.appendChild(el("option", { value }, label));
  }

  // "12,345" "1 234" "45.5%" ให้เป็นตัวเลขได้หมด ที่เหลือคืน null แล้วข้ามแถวนั้นไป
  function toNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const t = cellText(v).replace(/[,\s ]/g, "").replace(/%$/, "");
    if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /* ชื่อกลุ่มซ้ำกันให้รวมยอด เหมือนที่ Power BI ทำให้เองตอนลากคอลัมน์เข้า field well
     ‼️ เป้าหมายก็รวมยอดด้วยวิธีเดียวกัน ไม่ใช่หยิบค่าแรกที่เจอ ไม่งั้นพอสองแถวรวมกัน
     ค่าจะโตขึ้นแต่เป้าหมายเท่าเดิม กราฟจะบอกว่าถึงเป้าทั้งที่ไม่จริง */
  function aggregateRows(table, catIdx, valIdx, tgtIdx) {
    const sums = new Map();
    for (const r of table.rows) {
      const name = cellText(r[catIdx]).trim();
      const v = toNumber(r[valIdx]);
      if (!name || v === null) continue;
      const cur = sums.get(name) || { Value: 0, Target: null };
      cur.Value += v;
      if (tgtIdx !== null) {
        const t = toNumber(r[tgtIdx]);
        if (t !== null) cur.Target = (cur.Target || 0) + t;
      }
      sums.set(name, cur);
    }
    return [...sums].map(([Category, v]) => (
      v.Target === null ? { Category, Value: v.Value } : { Category, Value: v.Value, Target: v.Target }
    ));
  }

  // เดาให้ก่อนว่าคอลัมน์ไหนน่าจะเป็นค่า (ตัวเลขเยอะสุด) ไหนน่าจะเป็นชื่อกลุ่ม (ตัวเลขน้อยสุด)
  function guessColumns(table) {
    const w = table.header.length;
    if (w < 2) return { catIdx: 0, valIdx: 0 };
    const score = [];
    for (let i = 0; i < w; i++) {
      let n = 0;
      for (const r of table.rows) if (toNumber(r[i]) !== null) n++;
      score.push(n);
    }
    let valIdx = 0;
    for (let i = 1; i < w; i++) if (score[i] > score[valIdx]) valIdx = i;
    let catIdx = valIdx === 0 ? 1 : 0;
    for (let i = 0; i < w; i++) if (i !== valIdx && score[i] < score[catIdx]) catIdx = i;
    return { catIdx, valIdx };
  }

  /* ── ตัวอย่าง measure สำหรับช่อง Value และ Target ─────────────────── */
  function buildLearnBlock() {
    const items = [
      {
        name: tr("ผลรวม", "Sum"),
        why: tr("ค่าที่บวกกันได้ตรง ๆ เช่นยอดขาย จำนวนเงิน ปริมาณ",
                "Values that add up directly, such as sales, amounts or quantities"),
        dax: "ยอดขายรวม = SUM('Sales'[Amount])",
      },
      {
        name: tr("นับแบบไม่ซ้ำ", "Distinct count"),
        why: tr("ตารางมีหลายแถวต่อหนึ่งลูกค้า แต่อยากได้จำนวนลูกค้า ไม่ใช่จำนวนแถว",
                "The table holds several rows per customer but you want the number of customers, not rows"),
        dax: "จำนวนลูกค้า = DISTINCTCOUNT('Sales'[CustomerID])",
      },
      {
        name: tr("เป้าหมายสำหรับช่อง Target", "A target for the Target field"),
        why: tr("ลาก measure นี้เข้า field well อีกช่องแล้วตั้งชื่อว่า Target กราฟจะขีดเส้นหรือระบายสีให้เอง",
                "Drag this into one more field well and name it Target, then the chart draws the line or colors the bars for you"),
        dax: "เป้าหมายยอดขาย = SUM('Targets'[Amount])",
      },
      {
        name: tr("ส่วนต่างจากเป้า", "Gap to target"),
        why: tr("อยากรู้ว่าขาดอยู่เท่าไร ใช้เป็นตัวเลขในการ์ดหรือคอลัมน์ในตารางก็ได้",
                "Shows how far off you are, useful in a card or a table column"),
        dax: "ส่วนต่างจากเป้า = [ยอดขายรวม] - [เป้าหมายยอดขาย]",
      },
      {
        name: tr("จัดอันดับ N อันดับแรก", "Top N"),
        why: tr("กราฟยุบกลุ่มที่เกินให้เองอยู่แล้วด้วยจำนวนแท่งสูงสุด ตัวนี้ไว้ใช้ตอนอยากคุมจากฝั่งโมเดลแทน",
                "The chart already collapses the extras through the max bars setting, this one is for when you want the model to decide instead"),
        dax: "ยอดขาย 5 อันดับแรก =\nIF(\n    RANKX(ALLSELECTED('Sales'[Product]), [ยอดขายรวม]) <= 5,\n    [ยอดขายรวม]\n)",
      },
      {
        name: tr("สลับวิธีนับด้วยตัวเลือกเดียว", "Switch how it counts from one picker"),
        why: tr("สร้างตารางตัวเลือกไว้ 1 ตาราง แล้วให้คนอ่านเลือกเองว่าจะดูแบบผลรวม นับ หรือเฉลี่ย โดยใช้กราฟตัวเดิม",
                "Make one picker table, then let readers choose sum, count or average themselves while the chart stays the same"),
        dax: "Value =\nSWITCH(\n    SELECTEDVALUE('วิธีนับ'[ชื่อ], \"ผลรวม\"),\n    \"ผลรวม\",  [ยอดขายรวม],\n    \"นับ\",     [จำนวนลูกค้า],\n    \"เฉลี่ย\",  AVERAGE('Sales'[Amount])\n)",
      },
    ];

    const card = (m) => el("div", { class: "pbib-m" }, [
      el("div", { class: "pbib-m-head" }, [
        el("span", { class: "pbib-m-name" }, m.name),
        button(tr("คัดลอก", "Copy"), { icon: "copy", ghost: true, onclick: () => copyText(m.dax) }),
      ]),
      el("p", { class: "pbib-m-why" }, m.why),
      el("pre", {}, [el("code", {}, m.dax)]),
    ]);

    ws.body.appendChild(el("details", { class: "pbib-learn" }, [
      el("summary", {}, tr("ตัวอย่างการเขียน measure สำหรับช่อง Value และ Target",
                           "Measure examples for the Value and Target fields")),
      el("div", { class: "pbib-learn-body" }, [
        el("p", { class: "pbib-learn-lead" }, tr(
          "กราฟรับ Category กับ Value เป็นช่องบังคับ Target ไม่บังคับ ช่อง Value ใส่คอลัมน์หรือ measure ก็ได้",
          "The chart takes two required fields, Category and Value, plus an optional Target. Value accepts any column or measure, and the chart works out the shares and the collapsing from it"
        )),
        ...items.map(card),
      ]),
    ]));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      st.ok(tr("คัดลอกแล้ว", "Copied"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง", "Couldn't copy, select the text and copy it yourself"));
    }
  }

  /* ── แถบล่าง: คัดลอก ดาวน์โหลด คืนค่าเริ่มต้น ─────────────────────── */
  /* สเปกที่คัดลอกหรือดาวน์โหลดต้องมาจาก originalSpec เสมอ (ไม่เคยถูกฉีดข้อมูลตัวอย่าง)
     แก้แค่ value ของตัวปรับที่ปรับได้ data ยังเป็น {"name":"dataset"} เดิม
     width/height ยังเป็น container เดิม */
  function buildExportSpec() {
    const spec = clone(originalSpec);
    applyParamsInto(spec, paramValues);
    return spec;
  }

  async function onCopy() {
    if (!originalSpec) return;
    try {
      const json = JSON.stringify(buildExportSpec(), null, 2);
      await navigator.clipboard.writeText(json);
      st.ok(tr("คัดลอกสเปกลงคลิปบอร์ดแล้ว วางใน Deneb ได้เลย", "Spec copied. Paste it straight into Deneb"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    if (!originalSpec) return;
    const json = JSON.stringify(buildExportSpec(), null, 2);
    download(new Blob([json], { type: "application/json;charset=utf-8" }), "bar-spec.json");
    st.ok(tr("ดาวน์โหลดสเปกแล้ว", "Spec downloaded"));
  }

  /* ‼️ ไฟล์ .csv ต้องมี BOM ไม่งั้น Excel บนวินโดวส์อ่านภาษาไทยเป็นตัวประหลาด
     (เจอซ้ำหลายรอบจนเป็นกฎประจำโปรเจกต์) */
  function onDownloadCsv() {
    const info = datasets?.[currentKey];
    if (!info) return;
    const useTarget = info.rows.some((r) => typeof r.Target === "number");
    const head = useTarget ? ["Category", "Value", "Target"] : ["Category", "Value"];
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(",")];
    for (const r of info.rows) {
      const cat = (IS_EN && r.Category_en) || r.Category;
      const cells = useTarget ? [cat, r.Value, r.Target ?? ""] : [cat, r.Value];
      lines.push(cells.map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    download(blob, `${currentKey}.csv`);
    st.ok(tr("ดาวน์โหลดข้อมูลชุดนี้แล้ว เปิดใน Excel หรือ Power BI ได้เลย",
             "Data downloaded, open it in Excel or Power BI"));
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
    updateConditionalVisibility();
    syncChartHeight();
    if (view) {
      let v = view;
      for (const name of editable) v = v.signal(name, paramValues[name]);
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
