import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { tr, IS_EN } from "../i18n.js";
import { colorPicker, SWATCHES, COLORKIT_CSS } from "../colorkit.js";
import { loadLibs } from "../loader.js";
import { readWorkbook, sheetToTable, cellText } from "../sheetpick.js";

// ‼️ รายชื่อตัวปรับที่ผู้ใช้แตะได้ — เป็น "ผู้สมัคร" ไม่ใช่รายการตายตัว
// ตัวไหนไม่มีอยู่จริงใน spec.params ที่โหลดมา ปุ่มของตัวนั้นจะไม่ถูกสร้างเลย
// (สเปกกับหน้าเว็บถูกแก้คนละรอบกันได้ ไฟล์นี้จึงต้องทนต่อสเปกที่ยังไม่มีตัวใหม่)
// ส่วนตัวคำนวณภายใน (legendWCeiling, zoneGap, ringMargin, maxRByHeight,
// roughMaxRByWidth, roughOuterR, fontCeilingFromDiameter) มี expr ไม่มี value ห้ามโชว์
// เป็นชื่อคีย์ภายใน (ไม่ใช่ข้อความที่ต้องแปล) จึงอยู่เป็น const ระดับบนสุดได้ปลอดภัย
const EDITABLE_PARAMS = [
  "centerMode", "centerCaption", "centerText", "maxSlices", "sortMode", "customOrder",
  "palette", "colorOverrides", "otherColor", "donutThickness", "donutScale", "showPercent",
  "legendLayout", "legendPosition", "cornerRadius", "padAngle", "showSliceLabels",
  "fontScale", "centerFontScale", "legendFontScale", "sliceLabelFontScale",
];

// คีย์ของชุดข้อมูลที่ผู้ใช้อัปโหลดเอง — ไม่ชนกับคีย์ในไฟล์ตัวอย่างแน่นอน
const OWN_KEY = "__own__";

// ป้ายทูลทิปฉบับอังกฤษ เทียบด้วยชื่อ field ไม่ใช่ข้อความไทย (ดู localizeSpec)
// ‼️ ต้องอยู่ระดับบนสุด ไม่ใช่ใน mount() เพราะ mount เรียก init() ก่อนถึงบรรทัด const
// ที่อยู่ใต้มัน แล้วจะได้ ReferenceError จาก temporal dead zone (เจอจริง 11/09/2026)
// เป็นชื่อคีย์ภายในกับคำอังกฤษล้วน ไม่ใช่ข้อความที่ต้องแปล จึงแช่ไว้ตรงนี้ได้ปลอดภัย
const TOOLTIP_EN = { __groupKey: "Category", __countText: "Value", __pctText: "Share" };

// ชุดสีธีมมาตรฐาน Power BI — ใช้แทน pbiColor() ที่มีจริงเฉพาะใน Power BI เท่านั้น (พิสูจน์แล้วใน POC)
const PBI_COLORS = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550", "#197278", "#8AB833"];

const SPEC_URL = "samples/powerbi/donut.vl.json";
const DATASETS_URL = "samples/powerbi/datasets.json";
const XLSX_SAMPLE_URL = "samples/powerbi/pbi-donut-samples.xlsx";
const XLSX_SAMPLE_NAME = "pbi-donut-samples.xlsx";
const PBIX_SAMPLE_URL = "samples/powerbi/pbi-donut-samples.pbix";
const PBIX_SAMPLE_NAME = "pbi-donut-samples.pbix";

// ‼️ ฝัง <style> ในโมดูลนี้ตรง ๆ — ห้ามแก้ assets/css/tool.css
const STYLE = `
.pbid-ds-list{display:flex;flex-direction:column;gap:8px}
.pbid-ds-card{position:relative;display:block;padding:10px 12px;border:1.5px solid var(--line);
  border-radius:var(--r-sm);cursor:pointer;background:var(--bg-soft);
  transition:border-color .12s var(--ease-snap,ease),background .12s var(--ease-snap,ease)}
.pbid-ds-card input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.pbid-ds-card:hover{border-color:color-mix(in srgb,var(--g-powerbi,var(--brand)) 45%,var(--line))}
.pbid-ds-card:has(input:checked){border-color:var(--g-powerbi,var(--brand));
  background:color-mix(in srgb,var(--g-powerbi,var(--brand)) 12%,var(--bg-soft))}
.pbid-ds-card input:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.pbid-ds-title{font-weight:700;font-size:13.5px;color:var(--text)}
.pbid-ds-meta{font-size:12px;color:var(--text-mute);margin-top:2px}

.pbid-chart-box{position:relative;width:100%;min-height:380px;height:56vh;max-height:640px}
.pbid-chart{width:100%;height:100%}
.pbid-chart .vega-embed{width:100%;height:100%}
.pbid-collapse{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-top:10px}
.pbid-chart-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--text-mute);font-size:13.5px;text-align:center;padding:20px;line-height:1.7}

.pbid-right{display:flex;flex-direction:column;gap:18px}
.pbid-group{display:flex;flex-direction:column;gap:10px}
.pbid-group-title{margin:0;font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--text-mute)}

.pbid-range-row{display:flex;align-items:center;gap:10px}
.pbid-range-row input[type=range]{flex:1;accent-color:var(--g-powerbi,var(--brand))}
.pbid-rangeval{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;min-width:46px;text-align:right;color:var(--text)}

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
${COLORKIT_CSS}

.pbid-own{margin-top:16px;padding-top:14px;border-top:1px dashed var(--line)}
.pbid-own-title{margin:0 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
.pbid-own-hint{font-size:12px;color:var(--text-mute);line-height:1.65;margin:0 0 10px}
.pbid-own input[type=file]{width:100%;font-size:12.5px;color:var(--text)}
.pbid-own-pick{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.pbid-own-note{font-size:12px;color:var(--text-mute);line-height:1.65}

.pbid-learn{margin-top:16px;border:1.5px solid var(--line);border-radius:var(--r-sm);
  background:var(--bg-soft);overflow:hidden}
.pbid-learn>summary{cursor:pointer;padding:13px 15px;font-weight:700;font-size:13.5px;
  color:var(--text);list-style:none}
.pbid-learn>summary::-webkit-details-marker{display:none}
.pbid-learn>summary::before{content:"\\25B8";display:inline-block;width:14px;
  transition:transform .15s var(--ease-snap,ease)}
.pbid-learn[open]>summary::before{transform:rotate(90deg)}
.pbid-learn-body{padding:0 15px 15px;display:flex;flex-direction:column;gap:12px}
.pbid-learn-lead{font-size:13px;color:var(--text-mute);line-height:1.75;margin:0}
.pbid-m{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--card);padding:11px 13px}
.pbid-m-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pbid-m-name{font-weight:700;font-size:13px;color:var(--text)}
.pbid-m-why{font-size:12.5px;color:var(--text-mute);margin:5px 0 9px;line-height:1.7}
.pbid-m pre{margin:0;overflow-x:auto;background:var(--bg-soft);border-radius:6px;padding:9px 11px}
.pbid-m code{font-size:12.5px;line-height:1.65;color:var(--text);white-space:pre}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  let originalSpec = null;   // สเปกต้นฉบับที่ยังไม่ถูกแตะ — ใช้เป็นฐานทุกครั้งที่ export/embed
  let datasets = null;
  let datasetKeys = [];
  let currentKey = "";
  let paramValues = {};      // ค่าปัจจุบันของ 16 ตัวปรับ (คีย์ตรงกับ EDITABLE_PARAMS)
  let defaults = {};         // ค่าตั้งต้นจาก spec.params (ไว้ใช้ตอนคืนค่าเริ่มต้น)
  let view = null;           // instance ของ vega view ที่กำลังรันอยู่ (ตั้งค่าได้ทันทีผ่าน .signal())
  let rafHandle = null;
  let exprInterpreter = null;  // ตัวแปลนิพจน์ของ Vega แบบไม่ใช้ eval (ดูเหตุผลใน embedChart)
  // ‼️ กราฟยุบคำอธิบายเองเมื่อที่ไม่พอ ซึ่งถูกตามดีไซน์ แต่ผู้ใช้เห็นแค่ว่าเปิดสวิตช์แล้วไม่มีอะไรเกิดขึ้น
  // (เจอกับตาบนเว็บจริง 11/09/2026 กล่องสูงกว่าตอนทดสอบ ฟอนต์เลยใหญ่ตาม แล้วยุบตัดเปอร์เซ็นต์ทิ้ง)
  // กล่องนี้บอกให้รู้ว่าเกิดอะไรขึ้นและต้องทำยังไงถึงจะได้กลับมา
  const collapseNote = el("div", { class: "pbid-collapse", hidden: true });
  const controls = {};       // name -> { setUI(value) } ใช้ sync UI ตอนสลับชุดข้อมูล/คืนค่าเริ่มต้น
  let editable = [];         // ตัวปรับที่ "มีอยู่จริง" ในสเปกที่โหลดมา (ผู้สมัคร ∩ spec.params)
  let ownBook = null;        // สมุดงานของผู้ใช้ที่เพิ่งอ่านเข้ามา (ยังไม่ได้เลือกคอลัมน์)
  let supportsTokens = false;  // สเปกที่โหลดมารู้จักตัวยึด {total} ในข้อความกลางวงหรือยัง

  const chartEl = el("div", { class: "pbid-chart", id: "pbid-chart" });
  const chartMsg = el("div", { class: "pbid-chart-msg" }, tr("กำลังเตรียมกราฟ…", "Preparing the chart…"));
  const chartBox = el("div", { class: "pbid-chart-box" }, [chartMsg, chartEl]);
  const centerWrap = el("div", {}, [chartBox, collapseNote]);

  const dsListEl = el("div", { class: "pbid-ds-list" });
  const rightBody = el("div", { class: "pbid-right" });

  // กล่อง "ใช้ข้อมูลของคุณเอง" — อ่าน .xlsx/.csv แล้วให้เลือกชีตกับคอลัมน์เอง
  const fileInput = el("input", { type: "file", accept: ".xlsx,.xlsm,.xls,.csv,.txt" });
  const ownPick = el("div", { class: "pbid-own-pick", hidden: true });
  const ownBlock = el("div", { class: "pbid-own" }, [
    el("h4", { class: "pbid-own-title" }, tr("ใช้ข้อมูลของคุณเอง", "Use your own data")),
    el("p", { class: "pbid-own-hint" }, tr(
      "เปิดไฟล์ Excel หรือ CSV แล้วเลือกว่าคอลัมน์ไหนคือชื่อกลุ่ม คอลัมน์ไหนคือค่า ชื่อกลุ่มที่ซ้ำกันจะถูกรวมยอดให้เอง",
      "Open an Excel or CSV file, then pick which column is the category and which is the value. Repeated categories are summed for you"
    )),
    fileInput, ownPick,
  ]);
  const leftBody = el("div", {}, [dsListEl, ownBlock]);

  let centerTextWrap = null;
  let customOrderWrap = null;

  const copyBtn = button(tr("คัดลอกสเปก", "Copy spec"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด .json", "Download .json"), { icon: "download", ghost: true, onclick: onDownload });
  const dlXlsxBtn = button(tr("ดาวน์โหลด .xlsx ตัวอย่าง", "Download sample .xlsx"),
    { icon: "download", ghost: true, onclick: () => onDownloadSample(XLSX_SAMPLE_URL, XLSX_SAMPLE_NAME) });
  const dlPbixBtn = button(tr("ดาวน์โหลด .pbix ตัวอย่าง", "Download sample .pbix"),
    { icon: "download", ghost: true, onclick: () => onDownloadSample(PBIX_SAMPLE_URL, PBIX_SAMPLE_NAME) });
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
    footer: [copyBtn, dlBtn, dlXlsxBtn, dlPbixBtn, resetBtn, st.node],
    note: tr(
      "นำไปใช้ใน Deneb: ลากคอลัมน์หรือ measure ที่ต้องการเข้า field well แล้ว Rename for this visual เป็น Category กับ Value จากนั้นวางสเปกที่คัดลอกไว้ทับของเดิม",
      "To use in Deneb: drag the columns or measure you want into the field wells, Rename for this visual to Category and Value, then paste the copied spec over the existing one"
    ),
  });
  ws.wrap.prepend(styleEl);
  // เครื่องมือนี้ไม่มีสถานะ "ยังไม่มีไฟล์" กราฟพร้อมทำงานทันทีที่เข้าเครื่องมือ
  ws.showCanvas(true);

  init();
  return ws.wrap;

  /* ── เตรียมข้อมูล + ฝังกราฟครั้งแรก ──────────────────────────────────── */
  async function init() {
    try {
      const [spec, ds] = await Promise.all([fetchJson(SPEC_URL), fetchJson(DATASETS_URL)]);
      originalSpec = spec;
      datasets = ds;
      datasetKeys = Object.keys(ds);
      currentKey = datasetKeys[0];

      defaults = {};
      for (const p of spec.params) {
        if (EDITABLE_PARAMS.includes(p.name)) defaults[p.name] = clone(p.value);
      }
      paramValues = clone(defaults);
      // ‼️ ปุ่มปรับสร้างจากตัวที่มีจริงในสเปกเท่านั้น สเปกเก่า/ใหม่จึงใช้ไฟล์นี้ได้ทั้งคู่
      editable = EDITABLE_PARAMS.filter((n) => n in defaults);
      // ‼️ ถามสเปกตรง ๆ ว่ารองรับตัวยึดหรือยัง แทนที่จะเดาจากเลขเวอร์ชัน
      // มองหาชื่อ field ที่สเปกสร้างขึ้นตอนแทนตัวยึด ไม่ใช่มองหาคำว่า {total} ตรง ๆ
      // เพราะในไฟล์มันถูกเขียนเป็น regex ที่ escape ไว้ (\{total\}) จึงหาแบบตรงตัวไม่เจอ
      supportsTokens = JSON.stringify(spec).includes("__centerTextPass");
      localizeSpec(originalSpec);
      // ‼️ เปลี่ยนชุดข้อมูลแล้ว centerCaption ต้องเปลี่ยนตามชุดนั้นเสมอ (รวมถึงตอนโหลดครั้งแรก)
      paramValues.centerCaption = captionOf(currentKey);

      if (!window.vega || !window.vegaEmbed) {
        throw new Error(tr("ไลบรารีกราฟยังไม่พร้อม", "The chart library isn't ready"));
      }
      registerExpressions(window.vega);
      // ‼️ ต้อง import หลังจาก window.vega พร้อมแล้วเท่านั้น (vega-util-shim.js ส่งต่อจาก bundle ตัวนั้น)
      ({ expressionInterpreter: exprInterpreter } = await import("../../vendor/vega-interpreter.esm.js"));

      renderDatasetList();
      buildRightPanel();
      buildLearnBlock();
      wireOwnData();
      await embedChart();

      chartMsg.hidden = true;
    } catch (e) {
      console.error(e);
      chartMsg.hidden = false;
      chartMsg.textContent = tr("เตรียมกราฟไม่สำเร็จ: ", "Couldn't prepare the chart: ") + e.message;
      st.err(tr("เตรียมเครื่องมือไม่สำเร็จ: ", "Couldn't prepare the tool: ") + e.message);
    }
  }

  /* ‼️ ป้ายในทูลทิปของสเปกเขียนเป็นไทยไว้ (คนใช้ Deneb ส่วนใหญ่ของพี่ปอนด์อ่านไทย)
   * โหมดอังกฤษต้องเปลี่ยนตาม และต้องเปลี่ยนที่ originalSpec ก่อนใช้งานใด ๆ
   * เพื่อให้ "สิ่งที่เห็นในพรีวิว" กับ "สิ่งที่กดคัดลอกไปใช้" เป็นอันเดียวกันเสมอ
   * เทียบด้วย field ไม่ใช่ข้อความไทย เพราะข้อความเปลี่ยนได้แต่ field เป็นสัญญาภายในสเปก */
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
  }

  function fetchJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
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
       ปกติ Vega คอมไพล์นิพจน์ในสเปก (datum.x > 0 ฯลฯ) ด้วย new Function() ซึ่ง CSP ของ FileKit
       บล็อกทิ้ง เพราะจงใจไม่ใส่ 'unsafe-eval' (มีเทสกันไว้ ห้ามผ่อน) · ทางแก้ที่ทีม Vega ออกแบบมา
       สำหรับกรณีนี้โดยเฉพาะคือสั่ง ast:true ให้คอมไพเลอร์ส่ง syntax tree มาแทนโค้ด แล้วให้
       vega-interpreter เดินต้นไม้นั้นตีความเอง ไม่แตะ eval สักจุด (พิสูจน์แล้วใต้ CSP ชุดเดียวกัน) */
    const result = await window.vegaEmbed(chartEl, spec, {
      actions: false, renderer: "svg", ast: true, expr: exprInterpreter,
    });
    view = result.view;
    updateCollapseNote();
  }

  /* ── บอกผู้ใช้เมื่อกราฟยุบคำอธิบายเองเพราะที่ไม่พอ ─────────────────
   * ‼️ ไม่เดาจากขนาดกล่อง แต่อ่าน __legendTier ที่สเปกคำนวณไว้จริง
   * ไล่หา data source ที่มี field นี้เพราะชื่อหลังคอมไพล์ Vega-Lite เดาไม่ได้ */
  // ‼️ ต้องใช้ view.data(ชื่อ) ไม่ใช่ getState() เพราะ getState คืน mark ที่วาดแล้ว ไม่ใช่แถวข้อมูล
  // ชื่อ data source หลังคอมไพล์ Vega-Lite เป็น data_0, data_2, data_3 ซึ่งเดาไม่ได้ จึงไล่ทุกชื่อ
  // (พิสูจน์ด้วยการส่องของจริง 11/09/2026 เจอ __legendTier ที่ data_3)
  function readLegendTier() {
    if (!view) return null;
    try {
      const names = Object.keys(view.getState({ data: () => true, signals: () => false, recurse: false }).data || {});
      for (const n of names) {
        const rows = view.data(n);
        if (Array.isArray(rows) && rows.length && rows[0] && "__legendTier" in rows[0]) return rows[0].__legendTier;
      }
    } catch { /* อ่านไม่ได้ = เงียบไว้ ดีกว่าเตือนผิด */ }
    return null;
  }

  function updateCollapseNote() {
    const tier = readLegendTier();
    const hidePos = paramValues.legendPosition === "none";
    let msg = "";
    if (!hidePos && tier === 2 && paramValues.showPercent) {
      msg = tr("พื้นที่คำอธิบายไม่พอ กราฟจึงซ่อนเปอร์เซ็นต์ให้เอง ถ้าอยากให้กลับมา ลองย่อขนาดวง ลดขนาดตัวอักษรคำอธิบาย หรือทำให้วิชวลกว้างขึ้น",
                "The legend ran out of room so the chart hid the percentages for you. To get them back, shrink the ring, reduce the legend text size, or make the visual wider");
    } else if (!hidePos && tier === 3) {
      msg = tr("พื้นที่คำอธิบายไม่พอ กราฟจึงเหลือไว้แค่ชื่อกลุ่ม ตัวเลขกับเปอร์เซ็นต์ถูกซ่อนให้เอง ลองย่อขนาดวงหรือทำให้วิชวลกว้างขึ้น",
                "The legend ran out of room so only the group names are left, the numbers and percentages were hidden for you. Try shrinking the ring or widening the visual");
    } else if (!hidePos && tier === 4) {
      msg = tr("พื้นที่ไม่พอสำหรับคำอธิบายเลย กราฟจึงซ่อนทั้งก้อนแล้วย้ายไปแสดงเปอร์เซ็นต์บนชิ้นโดนัทแทน",
                "There was no room for the legend at all, so it was hidden and the percentages moved onto the slices instead");
    }
    collapseNote.hidden = !msg;
    collapseNote.textContent = msg;
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
  // ทุกแถวต้องมี __row__ (index 0-based) และ __selected__ ที่ Deneb ใส่ให้เองตอนรัน
  // ‼️ ชุดตัวอย่างมีชื่อกลุ่มสองภาษา โหมดอังกฤษต้องใช้ Category_en ไม่งั้นกราฟเป็นไทยค้าง
  // ทั้งหน้า (เทส browser_lang.py จับเจอจริง 11/09/2026) ส่วนข้อมูลที่ผู้ใช้เปิดเองไม่มีคำแปล
  // ก็ใช้ชื่อเดิมของเขาไปตามนั้น
  function withRuntimeFields(rows) {
    return rows.map((r, i) => ({
      Category: (IS_EN && r.Category_en) || r.Category,
      Value: r.Value,
      __row__: i, __selected__: "neutral",
    }));
  }
  function captionOf(key) {
    const info = datasets[key];
    return (IS_EN && info.caption_en) || info.caption;
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

  /* ── ปรับค่า + อัปเดตกราฟทันทีผ่าน view.signal() (เร็วกว่า re-embed สเปก 31KB มาก) ── */
  function setParam(name, value) {
    paramValues[name] = value;
    if (!view) return;
    view.signal(name, value);
    scheduleRun();
  }
  function scheduleRun() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      try { view.run(); updateCollapseNote(); } catch (e) { console.error(e); }
    });
  }

  function switchDataset(key) {
    currentKey = key;
    paramValues.centerCaption = captionOf(key);
    controls.centerCaption?.setUI(paramValues.centerCaption);
    if (!view) return;
    const rows = withRuntimeFields(datasets[key].rows);
    const cs = window.vega.changeset().remove(() => true).insert(rows);
    view.change("dataset", cs).signal("centerCaption", paramValues.centerCaption).run();
    updateCollapseNote();
  }

  /* ── แผงซ้าย: เลือกชุดข้อมูล ─────────────────────────────────────── */
  function renderDatasetList() {
    dsListEl.innerHTML = "";
    for (const key of datasetKeys) dsListEl.appendChild(datasetCard(key, datasets[key]));
  }
  function datasetCard(key, info) {
    const total = info.rows.reduce((s, r) => s + (Number(r.Value) || 0), 0);
    const input = el("input", { type: "radio", name: "pbid-ds", value: key });
    input.checked = key === currentKey;
    const title = IS_EN && info.title_en ? info.title_en : info.title;
    const meta = tr(
      `${info.rows.length} กลุ่ม, รวม ${total.toLocaleString("th-TH")}`,
      `${info.rows.length} groups, total ${total.toLocaleString("en-US")}`
    );
    const card = el("label", { class: "pbid-ds-card" }, [
      input,
      el("div", { class: "pbid-ds-body" }, [
        el("div", { class: "pbid-ds-title" }, title),
        el("div", { class: "pbid-ds-meta" }, meta),
      ]),
    ]);
    input.addEventListener("change", () => switchDataset(key));
    return card;
  }

  /* ── แผงขวา: 16 ปุ่มปรับ จัดเป็น 4 กลุ่ม ─────────────────────────── */
  function buildRightPanel() {
    rightBody.innerHTML = "";

    const textGroup = groupBox(tr("ข้อความ", "Text"), [
      selectField(tr("เลขกลางวง", "Center number"), "centerMode", [
        ["sum", tr("ผลรวม", "Sum")],
        ["none", tr("ซ่อน", "Hidden")],
        ["custom", tr("ข้อความเอง", "Custom text")],
      ], updateConditionalVisibility),
      textField(tr("คำใต้เลขกลาง", "Caption under the number"), "centerCaption"),
      (centerTextWrap = textField(tr("ข้อความกลางวง (กำหนดเอง)", "Custom center text"), "centerText",
        supportsTokens
          ? tr(
              "แทรกตัวเลขอัตโนมัติได้ด้วย {total} ผลรวม, {count} จำนวนกลุ่ม, {avg} ค่าเฉลี่ย, {max} ค่าสูงสุด, {maxName} ชื่อกลุ่มที่มากที่สุด เช่นพิมพ์ว่า ยอดรวม {total}",
              "You can drop numbers in with {total}, {count}, {avg}, {max} and {maxName}, for example type: Total {total}"
            )
          : tr("ใช้เมื่อเลือกเลขกลางวง = ข้อความเอง", "Used when the center number is set to custom text"))),
      switchField(tr("แสดง %", "Show %"), "showPercent"),
    ]);

    const sortGroup = groupBox(tr("การเรียงและการยุบ", "Sort & collapse"), [
      rangeField(tr("จำนวนกลุ่มสูงสุด", "Max slices"), "maxSlices",
        { min: 3, max: 12, step: 1, fmt: (v) => String(Math.round(v)) },
        tr("เกินนี้ยุบรวมเป็น “อื่น ๆ”", "Beyond this, extra groups collapse into “Other”")),
      selectField(tr("การเรียงลำดับ", "Sort order"), "sortMode", [
        ["valueDesc", tr("ค่ามาก ไป น้อย", "Value high to low")],
        ["valueAsc", tr("ค่าน้อย ไป มาก", "Value low to high")],
        ["nameAsc", tr("ชื่อ ก ไป ฮ", "Name A to Z")],
        ["custom", tr("กำหนดเอง", "Custom order")],
      ], updateConditionalVisibility),
      (customOrderWrap = listTextareaField(tr("ลำดับที่กำหนดเอง (บรรทัดละ 1 ชื่อ)", "Custom order (one name per line)"), "customOrder",
        tr("ใช้ชื่อกลุ่มเดียวกับข้อมูล ใช้เมื่อเลือกการเรียงลำดับ = กำหนดเอง", "Use the same category names as the data. Used when sort order is set to custom"))),
    ]);

    const colorGroup = groupBox(tr("สี", "Color"), [
      paletteField(tr("ชุดสี", "Palette"), "palette",
        tr("คั่นด้วยจุลภาค เช่น #118DFF, #E66C37 (ว่าง = ใช้สีธีม Power BI)", "Comma separated, e.g. #118DFF, #E66C37 (empty = use the Power BI theme)")),
      objectTextareaField(tr("จับคู่ชื่อ → สี", "Name to color overrides"), "colorOverrides",
        tr("บรรทัดละ 1 คู่ รูปแบบ ชื่อกลุ่ม = #เลขสี เช่น Fiber = #12239E (ชนะสีอื่นทุกชั้น)", "One pair per line, e.g. Fiber = #12239E (wins over every other color rule)")),
      colorField(tr("สีของกลุ่ม “อื่น ๆ”", "Color for “Other”"), "otherColor"),
    ]);

    const shapeGroup = groupBox(tr("ขนาดและรูปทรง", "Size & shape"), [
      rangeField(tr("ความหนาวง", "Ring thickness"), "donutThickness", { min: 0.15, max: 0.45, step: 0.01, fmt: (v) => v.toFixed(2) }),
      rangeField(tr("ขนาดวง", "Ring scale"), "donutScale", { min: 0.4, max: 1.0, step: 0.01, fmt: (v) => v.toFixed(2) }),
      ...maybe("legendPosition", () => selectField(tr("ตำแหน่งคำอธิบาย", "Legend position"), "legendPosition", [
        ["right", tr("ขวา", "Right")],
        ["left", tr("ซ้าย", "Left")],
        ["top", tr("บน", "Top")],
        ["bottom", tr("ล่าง", "Bottom")],
        ["none", tr("ซ่อน", "Hidden")],
      ], undefined, tr("ซ่อนแล้วจะเปิดป้าย % บนชิ้นให้เอง", "Hiding it turns on the on-slice % labels"))),
      selectField(tr("จัดวางคำอธิบาย", "Legend layout"), "legendLayout", [
        ["inline", tr("แถวเดียว", "Inline")],
        ["columns", tr("แยกคอลัมน์", "Columns")],
      ]),
      rangeField(tr("มุมโค้งปลายชิ้น", "Corner radius"), "cornerRadius",
        { min: 0, max: 4, step: 1, fmt: (v) => String(Math.round(v)) },
        tr("เกิน 4 ชิ้นเล็กจะเพี้ยน", "Beyond 4, small slices start to look off")),
      rangeField(tr("ช่องไฟระหว่างชิ้น", "Slice padding"), "padAngle",
        { min: 0, max: 0.02, step: 0.001, fmt: (v) => v.toFixed(3) },
        tr("เกิน 0.02 ชิ้นเล็กจะหาย", "Beyond 0.02, small slices start to disappear")),
      switchField(tr("ป้าย % บนชิ้น", "On-slice % labels"), "showSliceLabels"),
    ]);

    // กลุ่มขนาดตัวอักษร โผล่เฉพาะตอนสเปกมีตัวคูณพวกนี้จริง
    const fontFields = [
      ...maybe("fontScale", () => rangeField(tr("ขนาดตัวอักษรรวม", "Overall text size"), "fontScale",
        { min: 0.6, max: 1.6, step: 0.05, fmt: (v) => v.toFixed(2) },
        tr("คูณตัวอักษรทุกก้อนพร้อมกัน", "Scales every piece of text at once"))),
      ...maybe("centerFontScale", () => rangeField(tr("เลขกลางวง", "Center number"), "centerFontScale",
        { min: 0.5, max: 2.0, step: 0.05, fmt: (v) => v.toFixed(2) })),
      ...maybe("legendFontScale", () => rangeField(tr("ตัวอักษรคำอธิบาย", "Legend text"), "legendFontScale",
        { min: 0.5, max: 2.0, step: 0.05, fmt: (v) => v.toFixed(2) })),
      ...maybe("sliceLabelFontScale", () => rangeField(tr("ป้าย % บนชิ้น", "On-slice labels"), "sliceLabelFontScale",
        { min: 0.5, max: 2.0, step: 0.05, fmt: (v) => v.toFixed(2) })),
    ];
    rightBody.append(textGroup, sortGroup, colorGroup, shapeGroup);
    if (fontFields.length) rightBody.appendChild(groupBox(tr("ขนาดตัวอักษร", "Text size"), fontFields));
    updateConditionalVisibility();
  }

  // สร้างช่องปรับเฉพาะตอนสเปกมีตัวปรับชื่อนั้นจริง (สเปกเก่าไม่มี = ไม่ขึ้นปุ่ม ไม่พัง)
  function maybe(name, make) {
    return name in defaults ? [make()] : [];
  }

  function groupBox(title, nodes) {
    return el("div", { class: "pbid-group" }, [el("h3", { class: "pbid-group-title" }, title), ...nodes]);
  }
  function updateConditionalVisibility() {
    if (centerTextWrap) centerTextWrap.hidden = paramValues.centerMode !== "custom";
    if (customOrderWrap) customOrderWrap.hidden = paramValues.sortMode !== "custom";
  }

  /* ── ตัวสร้างช่องปรับแต่ละชนิด ───────────────────────────────────── */
  function rangeField(labelText, name, { min, max, step, fmt = (v) => String(v) }, hint) {
    const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) });
    input.value = String(paramValues[name]);
    const out = el("span", { class: "pbid-rangeval" }, fmt(paramValues[name]));
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      setParam(name, v);
    });
    controls[name] = { setUI: (v) => { input.value = String(v); out.textContent = fmt(v); } };
    return field(labelText, el("div", { class: "pbid-range-row" }, [input, out]), hint);
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
  // เพราะคนที่มาทำกราฟ Deneb มักอยากได้สีที่ตรงกับรายงานของตัวเองอยู่แล้ว
  function colorField(labelText, name, hint) {
    const p = colorPicker(paramValues[name] || "#000000", (hex) => setParam(name, hex),
      { swatches: SWATCHES.powerbi, label: labelText });
    controls[name] = { setUI: (v) => p.setUI(v || "#000000") };
    return field(labelText, p.node, hint);
  }

  function switchField(labelText, name) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!paramValues[name];
    const track = el("span", { class: "pbid-switch-track" });
    const sw = el("label", { class: "pbid-switch" }, [input, track]);
    input.addEventListener("change", () => setParam(name, input.checked));
    controls[name] = { setUI: (v) => { input.checked = !!v; } };
    return el("div", { class: "field pbid-switch-field" }, [el("span", {}, labelText), sw]);
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
  // ไม่ใช่ตอนเปิดเครื่องมือ (คนที่มาดูกราฟเฉย ๆ ไม่ต้องจ่ายค่าโหลดก้อนนี้)
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
    const noteEl = el("div", { class: "pbid-own-note" });
    const useBtn = button(tr("ใช้ข้อมูลนี้", "Use this data"), { onclick: applyOwnData });

    ownPick.innerHTML = "";
    if (ownBook.names.length > 1) ownPick.appendChild(field(tr("ชีต", "Sheet"), sheetSel));
    ownPick.append(
      field(tr("คอลัมน์ชื่อกลุ่ม", "Category column"), catSel),
      field(tr("คอลัมน์ค่า", "Value column"), valSel),
      noteEl, useBtn
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
      const g = guessColumns(table);
      catSel.value = String(g.catIdx);
      valSel.value = String(g.valIdx);
      noteEl.textContent = tr(`อ่านได้ ${table.rows.length} แถว`, `${table.rows.length} rows read`);
    }

    function applyOwnData() {
      const table = ownBook && ownBook.table;
      if (!table) return;
      const valIdx = Number(valSel.value);
      const rows = aggregateRows(table, Number(catSel.value), valIdx);
      if (!rows.length) {
        st.err(tr(
          "ไม่พบแถวที่ใช้ได้ ลองเลือกคอลัมน์ค่าให้เป็นคอลัมน์ที่เป็นตัวเลข",
          "No usable rows, try picking a numeric column as the value"
        ));
        return;
      }
      datasets[OWN_KEY] = {
        title: ownBook.file.name,
        title_en: ownBook.file.name,
        caption: table.header[valIdx] || tr("รวมทั้งหมด", "Total"),
        rows,
      };
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
    const t = cellText(v).replace(/[,\s ]/g, "").replace(/%$/, "");
    if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  // ชื่อกลุ่มซ้ำกันให้รวมยอด เหมือนที่ Power BI ทำให้เองตอนลากคอลัมน์เข้า field well
  function aggregateRows(table, catIdx, valIdx) {
    const sums = new Map();
    for (const r of table.rows) {
      const name = cellText(r[catIdx]).trim();
      const v = toNumber(r[valIdx]);
      if (!name || v === null) continue;
      sums.set(name, (sums.get(name) || 0) + v);
    }
    return [...sums].map(([Category, Value]) => ({ Category, Value }));
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

  /* ── ตัวอย่าง measure สำหรับช่อง Value ────────────────────────────── */
  function buildLearnBlock() {
    const items = [
      {
        name: tr("นับจำนวนแถว", "Row count"),
        why: tr("ใช้เมื่อ 1 แถวคือ 1 ชิ้นงาน เช่นนับไซต์ นับใบงาน นับเคส",
                "Use it when one row means one item, such as counting sites, jobs or cases"),
        dax: "จำนวนไซต์ = COUNTROWS('Sites')",
      },
      {
        name: tr("นับแบบไม่ซ้ำ", "Distinct count"),
        why: tr("ตารางมีหลายแถวต่อหนึ่งไซต์ แต่อยากได้จำนวนไซต์ ไม่ใช่จำนวนแถว",
                "The table holds several rows per site but you want the number of sites, not rows"),
        dax: "จำนวนไซต์ไม่ซ้ำ = DISTINCTCOUNT('Sites'[SiteID])",
      },
      {
        name: tr("ผลรวม", "Sum"),
        why: tr("ค่าที่บวกกันได้ตรง ๆ เช่นยอดขาย จำนวนเงิน ปริมาณ",
                "Values that add up directly, such as sales, amounts or quantities"),
        dax: "ยอดขายรวม = SUM('Sales'[Amount])",
      },
      {
        name: tr("ค่าเฉลี่ย", "Average"),
        why: tr("ค่าที่บวกกันแล้วไม่มีความหมาย เช่นเปอร์เซ็นต์ความคืบหน้า คะแนน",
                "Values that make no sense when added, such as progress percentages or scores"),
        dax: "ความคืบหน้าเฉลี่ย = AVERAGE('Sites'[Progress])",
      },
      {
        name: tr("สัดส่วนของทั้งหมด", "Percent of total"),
        why: tr("กราฟคิด % ให้เองอยู่แล้ว ตัวนี้ไว้ใช้ที่อื่น เช่นการ์ดหรือตาราง",
                "The chart already works out its own percentages, this one is for elsewhere such as a card or a table"),
        dax: "% ของทั้งหมด =\nDIVIDE(\n    [ยอดขายรวม],\n    CALCULATE([ยอดขายรวม], REMOVEFILTERS('Sales'[Channel]))\n)",
      },
      {
        name: tr("สลับวิธีนับด้วยตัวเลือกเดียว", "Switch how it counts from one picker"),
        why: tr("สร้างตารางตัวเลือกไว้ 1 ตาราง แล้วให้คนอ่านเลือกเองว่าจะดูแบบนับ ผลรวม หรือเฉลี่ย โดยใช้กราฟตัวเดิม",
                "Make one picker table, then let readers choose count, sum or average themselves while the chart stays the same"),
        dax: "Value =\nSWITCH(\n    SELECTEDVALUE('วิธีนับ'[ชื่อ], \"นับไซต์\"),\n    \"นับไซต์\",   [จำนวนไซต์],\n    \"นับไม่ซ้ำ\", [จำนวนไซต์ไม่ซ้ำ],\n    \"ผลรวม\",    [ยอดขายรวม],\n    \"เฉลี่ย\",    [ความคืบหน้าเฉลี่ย]\n)",
      },
    ];

    const card = (m) => el("div", { class: "pbid-m" }, [
      el("div", { class: "pbid-m-head" }, [
        el("span", { class: "pbid-m-name" }, m.name),
        button(tr("คัดลอก", "Copy"), { icon: "copy", ghost: true, onclick: () => copyText(m.dax) }),
      ]),
      el("p", { class: "pbid-m-why" }, m.why),
      el("pre", {}, [el("code", {}, m.dax)]),
    ]);

    ws.body.appendChild(el("details", { class: "pbid-learn" }, [
      el("summary", {}, tr("ตัวอย่างการเขียน measure สำหรับช่อง Value", "Measure examples for the Value field")),
      el("div", { class: "pbid-learn-body" }, [
        el("p", { class: "pbid-learn-lead" }, tr(
          "กราฟรับแค่ 2 ช่องคือ Category กับ Value ช่อง Value จะใส่คอลัมน์หรือ measure อะไรก็ได้ แล้วกราฟจะคิดเปอร์เซ็นต์กับเลขกลางวงให้เองจากค่าที่ได้ ไม่ต้องสร้าง measure เปอร์เซ็นต์แยก",
          "The chart takes only two fields, Category and Value. Value accepts any column or measure, and the chart works out the percentages and the centre number from it, so no separate percentage measure is needed"
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

  /* ── แถบล่าง: คัดลอก / ดาวน์โหลด / คืนค่าเริ่มต้น ─────────────────── */
  // สเปกที่คัดลอก/ดาวน์โหลดต้องมาจาก originalSpec เสมอ (ไม่เคยถูกฉีดข้อมูลตัวอย่าง)
  // แก้แค่ value ของ 16 พารามิเตอร์ที่ปรับได้ — data ยังเป็น {"name":"dataset"} เดิม, width/height ยังเป็น container เดิม
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
    download(new Blob([json], { type: "application/json;charset=utf-8" }), "donut-spec.json");
    st.ok(tr("ดาวน์โหลดสเปกแล้ว", "Spec downloaded"));
  }

  // ‼️ ไฟล์ตัวอย่าง .xlsx/.pbix เป็น static asset (สร้างไว้ล่วงหน้าใน samples/powerbi/)
  // ไม่ได้ประกอบขึ้นตอนรัน — ปุ่มแค่ fetch มาเป็น blob แล้วส่งต่อให้ download() เดิม
  // (announceResult ของ download() ยังทำงานเหมือนเดิม พาไฟล์ไปเครื่องมือถัดไปได้)
  async function onDownloadSample(url, filename) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const blob = await res.blob();
      download(blob, filename);
      st.ok(tr(`ดาวน์โหลด ${filename} แล้ว`, `Downloaded ${filename}`));
    } catch (e) {
      console.error(e);
      st.err(tr(`ดาวน์โหลด ${filename} ไม่สำเร็จ: `, `Couldn't download ${filename}: `) + e.message);
    }
  }

  function onReset() {
    if (!originalSpec) return;
    paramValues = clone(defaults);
    paramValues.centerCaption = captionOf(currentKey);
    for (const name of editable) controls[name]?.setUI(paramValues[name]);
    updateConditionalVisibility();
    if (view) {
      let v = view;
      for (const name of editable) v = v.signal(name, paramValues[name]);
      v.run();
    }
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Reset to defaults"));
  }
}
