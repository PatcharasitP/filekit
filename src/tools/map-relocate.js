import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, dropzone, download } from "../ui.js";
import { tr, pl, IS_EN } from "../i18n.js";
import { readWorkbook, sheetToTable, tablesToBlob } from "../sheetpick.js";
import {
  buildPairs, summarize, compass, fitProjection, boundsOf,
  sheetPAIR, sheetMAPSHAPES, sheetPATH, sheetRADIUS,
} from "../geokit.js";

/* ‼️ ทำไมต้องมีเครื่องมือนี้
 * งานย้ายสถานีถามคำถามเดิมทุกครั้ง: ย้ายไปไกลแค่ไหน คู่ไหนไกลสุด กระจุกอยู่จังหวัดไหน
 * ต้นแบบที่ทำไว้ใน Power BI (Icon Map Pro) ตอบได้ แต่กว่าจะถึงตรงนั้นต้องเตรียมชีตหลายแบบด้วยมือ
 * และแก้หน้าตาทีต้องเปิด Desktop ทุกครั้ง หน้านี้จึงทำสองอย่าง
 *   ① เห็นแผนที่ทันทีจากไฟล์พิกัดดิบ ปรับสี ขนาด ป้าย วงรัศมี ได้สด ๆ แล้วบันทึกเป็นภาพไปใส่สไลด์
 *   ② ปั๊มชีตที่ Icon Map Pro กินได้ครบชุด (MAPSHAPES, PAIR, PATH, RADIUS_WKT) ไปใส่ Power BI ต่อ
 *
 * ‼️ ทำไมวาดด้วย canvas ไม่ใช่ SVG
 *   ข้อมูลจริงของงานนี้มี 2,418 คู่ ถ้าวาดเป็น SVG จะมีโหนดเกินหมื่น แล้วหน้าอืดตั้งแต่เลื่อนเมาส์
 *   canvas วาดครั้งเดียวจบ และบันทึกเป็น PNG ได้ตรง ๆ โดยไม่ต้องฝังฟอนต์ไทยเข้าไปในไฟล์
 *
 * ‼️ แผนที่ประเทศไทยเป็นไฟล์ในเครื่องเรา (assets/thailand-map.json 57 KB)
 *   ไม่ได้ดึงแผ่นแผนที่จากเซิร์ฟเวอร์ใคร พิกัดของผู้ใช้จึงไม่ถูกส่งออกไปไหนเลย และใช้ออฟไลน์ได้
 */

const STYLE = `
.mr-src{display:flex;flex-direction:column;gap:10px}
.mr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.mr-chip{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--bg-soft);
  border:1px solid var(--line);color:var(--text-mute);white-space:nowrap;max-width:100%}
.mr-chip b{color:var(--text);font-weight:700}
.mr-chip.warn{border-color:var(--warn,#c98a00);color:var(--text);white-space:normal;line-height:1.5}

.mr-group-title{margin:18px 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
.mr-group-title:first-child{margin-top:0}
.mr-hint{display:block;font-size:12px;color:var(--text-mute);line-height:1.6;margin:-2px 0 6px}
.mr-num{width:100%;min-height:36px;padding:8px 11px;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-soft);color:var(--text);font-size:14px}
.mr-color{width:100%;height:36px;padding:2px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--bg-soft);cursor:pointer}
.mr-two{display:flex;gap:10px}
.mr-two > *{flex:1;min-width:0}

.mr-switch-field{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:13px;color:var(--text);padding:5px 0;min-height:36px}
.mr-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.mr-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.mr-track{position:absolute;inset:0;background:var(--line);border-radius:999px;transition:background .15s ease}
.mr-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s ease}
.mr-switch input:checked + .mr-track{background:var(--g-powerbi,var(--brand))}
.mr-switch input:checked + .mr-track::after{transform:translateX(18px)}
.mr-switch input:focus-visible + .mr-track{outline:2px solid var(--brand);outline-offset:2px}
@media (pointer:coarse){ .mr-switch{height:36px} .mr-track{top:6px;bottom:6px} }

.mr-stage{position:relative;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;
  background:var(--bg-soft)}
.mr-canvas{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair}
.mr-tip{position:absolute;pointer-events:none;z-index:2;background:var(--card,var(--bg));
  border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 10px;font-size:12.5px;
  line-height:1.65;color:var(--text);box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:260px}
.mr-tip b{font-weight:700}
.mr-tip .mut{color:var(--text-mute)}
.mr-legend{display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:12.5px;
  color:var(--text-mute);margin:8px 2px 0}
.mr-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.mr-legend .ln{display:inline-block;width:18px;height:0;border-top:2px solid var(--text-mute);
  margin-right:6px;vertical-align:4px}
.mr-help{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 2px 0}

.mr-table{width:100%;border-collapse:collapse;font-size:13px}
.mr-table th,.mr-table td{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;white-space:nowrap}
.mr-table th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mute);font-weight:700;
  position:sticky;top:0;background:var(--bg);cursor:pointer}
.mr-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.mr-table tbody tr{cursor:pointer}
.mr-table tbody tr:hover{background:var(--bg-soft)}
.mr-table tbody tr.on{background:var(--bg-soft);box-shadow:inset 3px 0 0 var(--g-powerbi,var(--brand))}
.mr-bar{display:block;height:8px;border-radius:999px;background:var(--g-powerbi,var(--brand));opacity:.45;min-width:2px}
.mr-scroll{overflow:auto;max-height:min(56vh,540px)}
.mr-note{font-size:12.5px;color:var(--text-mute);line-height:1.7}
.mr-sel{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--text);
  border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);padding:8px 12px;margin-bottom:10px}
.mr-sel b{font-weight:700}
`;

const MAP_URL = new URL("../../assets/thailand-map.json", import.meta.url).href;
let mapDataPromise = null;
const loadMap = () => (mapDataPromise ||= fetch(MAP_URL).then((r) => r.json()));

const GUESS = {
  latOld: [/lat.*old/i, /old.*lat/i, /lat.*เดิม/, /เดิม.*lat/, /^lat$/i, /latitude/i],
  lonOld: [/lon.*old/i, /old.*lon/i, /lng.*old/i, /lon.*เดิม/, /^lon$/i, /longitude/i],
  latNew: [/lat.*new/i, /new.*lat/i, /lat.*ใหม่/, /ใหม่.*lat/],
  lonNew: [/lon.*new/i, /new.*lon/i, /lng.*new/i, /lon.*ใหม่/],
  codeOld: [/code.*old/i, /old.*code/i, /site.*old/i, /รหัส.*เดิม/],
  codeNew: [/code.*new/i, /new.*code/i, /site.*new/i, /รหัส.*ใหม่/],
  province: [/province/i, /จังหวัด/],
  pairId: [/pair/i, /^id$/i, /คู่/],
};

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  let wb = null, sheetNames = [], table = null;
  let pairs = [], skipped = [], sum = null;
  let mapData = null;
  let selected = null;          // คู่ที่ถูกเลือก (คลิกจากตารางหรือแผนที่)
  let hover = null;
  let view = null;              // { project, w, h } ของภาพล่าสุด ใช้ทำ hit-test
  let sortKey = "distanceKm", sortDir = -1;
  let lastHiddenLabels = 0;        // ป้ายที่ต้องซ่อนเพราะจะไปทับป้ายอื่น
  let radiusTooSmall = false;      // วงรัศมีเล็กกว่าที่ตาเห็นในมาตราส่วนนี้

  // ── แผงซ้าย ───────────────────────────────────────────────────────────
  const sheetSel = select([["0", "-"]], "0");
  const sheetField = field(tr("ชีต", "Sheet"), sheetSel);
  sheetField.hidden = true;
  const colSels = {};
  const colFields = [];
  const mkCol = (key, labelTh, labelEn, required) => {
    const s = select([["-1", tr("ไม่ใช้", "None")]], "-1");
    colSels[key] = s;
    const f = field(labelTh + (required ? " *" : ""), s);
    f.hidden = true;
    colFields.push(f);
    s.onchange = () => recompute();
    return f;
  };
  const mapFields = el("div", {}, [
    el("h3", { class: "mr-group-title" }, tr("จุดเดิม", "Old site")),
    mkCol("codeOld", tr("รหัสสถานีเดิม", "Old site code"), "", false),
    mkCol("latOld", tr("ละติจูดเดิม", "Old latitude"), "", true),
    mkCol("lonOld", tr("ลองจิจูดเดิม", "Old longitude"), "", true),
    el("h3", { class: "mr-group-title" }, tr("จุดใหม่", "New site")),
    mkCol("codeNew", tr("รหัสสถานีใหม่", "New site code"), "", false),
    mkCol("latNew", tr("ละติจูดใหม่", "New latitude"), "", true),
    mkCol("lonNew", tr("ลองจิจูดใหม่", "New longitude"), "", true),
    el("h3", { class: "mr-group-title" }, tr("อื่น ๆ", "Other")),
    mkCol("province", tr("จังหวัด", "Province"), "", false),
  ]);
  mapFields.hidden = true;

  const chips = el("div", { class: "mr-chips" });
  const dz = dropzone({
    accept: ".xlsx,.xlsm,.xls,.csv,.txt", multiple: false,
    expect: ["xlsx", "xls", "xlsm", "csv", "txt"],
    expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("ไฟล์ที่มีพิกัดจุดเดิมและจุดใหม่อยู่ในแถวเดียวกัน", "A file with the old and the new coordinates on the same row"),
    samples: [["samples/ตัวอย่าง-ย้ายที่ตั้งสถานี.xlsx",
               "ตัวอย่างการย้ายที่ตั้งสถานี 12 คู่ (Excel)", "Sample of 12 site moves (Excel)"]],
    onChange: onFiles,
  });
  const leftBody = el("div", { class: "mr-src" }, [dz.container, sheetField, mapFields, chips]);
  sheetSel.onchange = () => pickSheet(+sheetSel.value);

  // ── แผงขวา ────────────────────────────────────────────────────────────
  const colorOld = el("input", { class: "mr-color", type: "color", value: "#e8763c" });
  const colorNew = el("input", { class: "mr-color", type: "color", value: "#2e6db4" });
  const dotSize = select([["3", tr("เล็ก", "Small")], ["4.5", tr("กลาง", "Medium")], ["6", tr("ใหญ่", "Large")]], "4.5");
  const lineMode = select([
    ["byDistance", tr("หนาตามระยะทาง", "Thicker for longer moves")],
    ["fixed", tr("หนาเท่ากันหมด", "All the same")],
  ], "byDistance");
  const labelMode = select([
    ["top", tr("เฉพาะอันดับที่ไกลสุด", "Only the farthest moves")],
    ["all", tr("ทุกคู่", "Every pair")],
    ["none", tr("ไม่แสดง", "None")],
    ["selected", tr("เฉพาะคู่ที่เลือก", "Only the selected pair")],
  ], "top");
  const labelTop = select([3, 5, 10, 20].map((n) => [String(n), String(n)]), "10");
  const radiusSw = sw(tr("วาดวงรัศมีรอบจุด", "Draw a radius ring"), false);
  const radiusKm = el("input", { class: "mr-num", type: "text", inputmode: "decimal", value: "3" });
  const provSw = sw(tr("เส้นแบ่งจังหวัด", "Province borders"), true);
  const extentSel = select([
    ["country", tr("ทั้งประเทศ", "Whole country")],
    ["data", tr("ซูมพอดีกับข้อมูล", "Zoom to the data")],
  ], "country");
  const minKmIn = el("input", { class: "mr-num", type: "text", inputmode: "decimal", placeholder: tr("ไม่กรอง", "no filter") });
  const unitIn = el("input", { class: "mr-num", type: "text", value: tr(" กม.", " km") });

  [colorOld, colorNew].forEach((c) => c.addEventListener("input", () => draw()));
  [dotSize, lineMode, labelMode, labelTop, extentSel].forEach((s) => (s.onchange = () => draw()));
  radiusSw.input.addEventListener("change", () => draw());
  provSw.input.addEventListener("change", () => draw());
  radiusKm.addEventListener("input", () => draw());
  unitIn.addEventListener("input", () => draw());
  minKmIn.addEventListener("change", () => { selected = null; draw(); renderTable(); renderChips(); });

  const rightBody = el("div", {}, [
    el("h3", { class: "mr-group-title" }, tr("สีและขนาด", "Colour and size")),
    el("div", { class: "mr-two" }, [field(tr("จุดเดิม", "Old"), colorOld), field(tr("จุดใหม่", "New"), colorNew)]),
    field(tr("ขนาดจุด", "Dot size"), dotSize),
    field(tr("เส้นเชื่อม", "Connecting line"), lineMode),
    el("h3", { class: "mr-group-title" }, tr("ป้ายระยะทาง", "Distance labels")),
    field(tr("แสดงป้าย", "Show labels"), labelMode),
    field(tr("กี่อันดับ", "How many"), labelTop),
    field(tr("หน่วย", "Unit"), unitIn),
    el("h3", { class: "mr-group-title" }, tr("ขอบเขตแผนที่", "Map extent")),
    field(tr("แสดงแค่ไหน", "How wide"), extentSel),
    el("small", { class: "mr-hint" }, tr(
      "ย้ายกันแค่ไม่กี่กิโลเมตร ถ้าดูทั้งประเทศจะเห็นแค่จุด ให้เลือกซูมพอดีข้อมูลเพื่อเห็นเส้นเชื่อม",
      "Moves of a few kilometres look like single dots at country scale. Zoom to the data to see the joining lines")),
    el("h3", { class: "mr-group-title" }, tr("ชั้นข้อมูลเพิ่ม", "Extra layers")),
    radiusSw.wrap,
    field(tr("รัศมีกี่กิโลเมตร", "Radius in km"), radiusKm),
    provSw.wrap,
    el("h3", { class: "mr-group-title" }, tr("กรองข้อมูล", "Filter")),
    field(tr("เอาเฉพาะที่ย้ายไกลกว่า (กม.)", "Only moves longer than (km)"), minKmIn),
  ]);

  // ── ตรงกลาง ───────────────────────────────────────────────────────────
  const viewTabs = segmented([
    ["map", tr("แผนที่", "Map")],
    ["table", tr("ตาราง", "Table")],
    ["prov", tr("สรุปรายจังหวัด", "By province")],
  ], "map");
  const canvas = el("canvas", { class: "mr-canvas" });
  const tip = el("div", { class: "mr-tip", hidden: true });
  const stage = el("div", { class: "mr-stage" }, [canvas, tip]);
  const legend = el("div", { class: "mr-legend" });
  const selBar = el("div", { class: "mr-sel", hidden: true });
  const mapBox = el("div", {}, [selBar, stage, legend,
    el("p", { class: "mr-help" }, tr(
      "ชี้ที่จุดหรือเส้นเพื่อดูรายละเอียด, คลิกเพื่อเลือกคู่นั้นแล้วแผนที่จะซูมให้, คลิกที่ว่างเพื่อกลับมาดูทั้งประเทศ",
      "Hover a dot or a line for details, click to select that pair and zoom in, click empty space to go back to the whole country"))]);
  const tableBox = el("div", { class: "mr-scroll" });
  tableBox.hidden = true;
  const provBox = el("div", { class: "mr-scroll" });
  provBox.hidden = true;
  viewTabs.onchange = () => {
    const v = viewTabs.value;
    mapBox.hidden = v !== "map";
    tableBox.hidden = v !== "table";
    provBox.hidden = v !== "prov";
    if (v === "map") draw();
  };
  const centerNode = el("div", {}, [viewTabs, mapBox, tableBox, provBox]);
  centerNode.hidden = true;

  // ── แถบล่าง ───────────────────────────────────────────────────────────
  const goPng = button(tr("บันทึกภาพ PNG", "Save as PNG"), { icon: "download", onclick: savePng });
  const goXlsx = button(tr("ไฟล์สำหรับ Power BI", "File for Power BI"), { icon: "download", onclick: saveXlsx, ghost: true });
  const goCsv = button(tr("CSV ตารางคู่ย้าย", "CSV of the pairs"), { icon: "download", onclick: saveCsv, ghost: true });
  [goPng, goXlsx, goCsv].forEach((b) => (b.disabled = true));

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์พิกัด", "Coordinate file"), node: leftBody },
    center: { node: centerNode, empty: tr("เปิดไฟล์ที่มีพิกัดจุดเดิมและจุดใหม่ แล้วจะเห็นแผนที่ทันที", "Open a file with the old and new coordinates to see the map") },
    right: { title: tr("ปรับแต่ง", "Adjust"), node: rightBody },
    footer: [goPng, goXlsx, goCsv, st.node],
  });
  ws.body.prepend(styleEl);

  loadMap().then((d) => { mapData = d; if (pairs.length) draw(); })
    .catch(() => st.err(tr("โหลดรูปแผนที่ประเทศไทยไม่สำเร็จ จุดยังวาดได้ตามปกติ", "Could not load the Thailand outline. The dots still draw fine")));

  // ── อ่านไฟล์ ──────────────────────────────────────────────────────────
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
    for (const [key, s] of Object.entries(colSels)) {
      s.innerHTML = "";
      s.appendChild(el("option", { value: "-1" }, tr("ไม่ใช้", "None")));
      table.header.forEach((h, c) => s.appendChild(el("option", { value: String(c) }, h || `#${c + 1}`)));
      const guess = table.header.findIndex((h) => GUESS[key].some((re) => re.test(String(h || ""))));
      s.value = String(guess);
    }
    // ถ้าเดาไม่ออกว่าอันไหนคู่เดิม-คู่ใหม่ ลองใช้ลำดับคอลัมน์ที่เป็นพิกัดทั้งสี่ตัวแรก
    const need = ["latOld", "lonOld", "latNew", "lonNew"];
    if (need.some((k) => colSels[k].value === "-1")) {
      const coordCols = table.header.map((h, c) => {
        const vals = table.rows.slice(0, 40).map((r) => Number(String(r[c] ?? "").replace(/,/g, "")));
        const good = vals.filter((v) => Number.isFinite(v) && Math.abs(v) <= 180 && v !== 0);
        return { c, ok: good.length > vals.length * 0.6, mag: Math.abs(good[0] ?? 0) };
      }).filter((x) => x.ok);
      if (coordCols.length >= 4) need.forEach((k, i) => { if (colSels[k].value === "-1") colSels[k].value = String(coordCols[i].c); });
    }
    mapFields.hidden = false;
    colFields.forEach((f) => (f.hidden = false));
    recompute();
  }

  function recompute() {
    if (!table) return;
    const idx = (k) => +colSels[k].value;
    const need = ["latOld", "lonOld", "latNew", "lonNew"];
    if (need.some((k) => idx(k) < 0)) {
      st.err(tr("เลือกคอลัมน์พิกัดให้ครบทั้งสี่ช่องก่อน (ละติจูดและลองจิจูด ของจุดเดิมและจุดใหม่)",
                "Pick all four coordinate columns first, latitude and longitude for both the old and the new site"));
      centerNode.hidden = true; ws.showCanvas(false);
      return;
    }
    st.clear();
    const get = {};
    for (const k of Object.keys(colSels)) {
      const c = idx(k);
      get[k] = c >= 0 ? (r) => r[c] : null;
    }
    if (!get.pairId) get.pairId = (r, i) => null;
    const built = buildPairs(table.rows, {
      pairId: (r) => null,
      codeOld: get.codeOld || ((r) => ""),
      codeNew: get.codeNew || ((r) => ""),
      latOld: get.latOld, lonOld: get.lonOld, latNew: get.latNew, lonNew: get.lonNew,
      province: get.province || ((r) => ""),
    });
    pairs = built.pairs;
    skipped = built.skipped;
    // ใส่รหัสคู่ที่อ่านง่ายถ้าไฟล์ไม่มีให้
    pairs.forEach((p, i) => { if (!p.pairId || p.pairId === "null") p.pairId = p.codeOld || `RLC${String(i + 1).padStart(3, "0")}`; });
    selected = null;
    sum = summarize(shown());
    centerNode.hidden = !pairs.length;
    ws.showCanvas(!!pairs.length);
    [goPng, goXlsx, goCsv].forEach((b) => (b.disabled = !pairs.length));
    renderChips();
    if (pairs.length) { draw(); renderTable(); renderProv(); }
  }

  /** คู่ที่ผ่านตัวกรองระยะขั้นต่ำ */
  function shown() {
    const min = Number(String(minKmIn.value).replace(/,/g, ""));
    return Number.isFinite(min) && min > 0 ? pairs.filter((p) => p.distanceKm >= min) : pairs;
  }

  function renderChips() {
    chips.innerHTML = "";
    const list = shown();
    sum = summarize(list);
    const add = (html, warn) => chips.appendChild(el("span", { class: "mr-chip" + (warn ? " warn" : ""), html }));
    if (!pairs.length) { add(tr("ยังไม่มีคู่ย้ายที่อ่านได้", "No pairs read yet")); return; }
    add(tr(`คู่ย้าย <b>${list.length.toLocaleString()}</b> คู่`, `<b>${list.length.toLocaleString()}</b> ${pl(list.length, "pair", "pairs")}`));
    add(tr(`ไกลสุด <b>${sum.maxKm.toFixed(2)}</b> กม.`, `longest <b>${sum.maxKm.toFixed(2)}</b> km`));
    add(tr(`เฉลี่ย <b>${sum.avgKm.toFixed(2)}</b> กม.`, `average <b>${sum.avgKm.toFixed(2)}</b> km`));
    add(tr(`กลาง <b>${sum.medianKm.toFixed(2)}</b> กม.`, `median <b>${sum.medianKm.toFixed(2)}</b> km`));
    if (list.length !== pairs.length) {
      add(tr(`กรองออกไป ${(pairs.length - list.length).toLocaleString()} คู่`, `${(pairs.length - list.length).toLocaleString()} filtered out`));
    }
    if (skipped.length) {
      add(tr(`ข้าม <b>${skipped.length.toLocaleString()}</b> แถวเพราะพิกัดไม่ครบหรืออ่านไม่ออก`,
             `skipped <b>${skipped.length.toLocaleString()}</b> ${pl(skipped.length, "row", "rows")} with missing or unreadable coordinates`), true);
    }
  }

  // ── วาดแผนที่ ─────────────────────────────────────────────────────────
  function cssVar(name, fallback) {
    const v = getComputedStyle(ws.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  /** ขอบเขตที่จะวาดตามที่ผู้ใช้เลือก — คืนเป็นจุดมุมสองจุด */
  function extentPoints(list) {
    if (selected) {
      const b = boundsOf([{ lat: selected.latOld, lon: selected.lonOld }, { lat: selected.latNew, lon: selected.lonNew }], 0.9);
      return [{ lat: b.minLat, lon: b.minLon }, { lat: b.maxLat, lon: b.maxLon }];
    }
    const pts = list.flatMap((p) => [{ lat: p.latOld, lon: p.lonOld }, { lat: p.latNew, lon: p.lonNew }]);
    if (extentSel.value === "data") {
      const b = boundsOf(pts, 0.12);
      return [{ lat: b.minLat, lon: b.minLon }, { lat: b.maxLat, lon: b.maxLon }];
    }
    return pts.concat([{ lat: 5.6, lon: 97.3 }, { lat: 20.5, lon: 105.6 }]);   // กรอบประเทศไทย
  }

  /** สัดส่วนความสูงต่อความกว้างของกรอบที่จะวาด เพื่อไม่ให้เหลือพื้นที่ว่างสองข้าง */
  function frameRatio() {
    const list = shown();
    if (!list.length) return 0.72;
    const pts = extentPoints(list);
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
    }
    const dLat = Math.max(1e-6, maxLat - minLat), dLon = Math.max(1e-6, maxLon - minLon);
    const ratio = (dLat / dLon) * 1.03;                 // 1.03 = การยืดของ Mercator แถบละติจูดไทย
    return Math.max(0.5, Math.min(1.5, ratio));
  }

  function draw() {
    const list = shown();
    if (!list.length) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const W = Math.max(360, Math.round(stage.clientWidth || 900));
    const maxH = Math.max(320, Math.round((window.innerHeight || 900) * 0.62));
    const H = Math.round(Math.min(760, maxH, Math.max(320, W * frameRatio())));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const ink = cssVar("--text", "#1a1a1a");
    const mute = cssVar("--text-mute", "#6b7280");
    const line = cssVar("--line", "#e5e7eb");
    const soft = cssVar("--bg-soft", "#f6f6f4");
    ctx.fillStyle = soft;
    ctx.fillRect(0, 0, W, H);

    // ขอบเขตที่จะวาด (ทั้งประเทศ, ซูมพอดีข้อมูล หรือซูมคู่ที่เลือก)
    const pts = extentPoints(list);
    const pr = fitProjection(pts, W, H, 18);
    view = { pr, W, H };

    // ชั้นแผนที่ประเทศ
    if (mapData) {
      ctx.lineJoin = "round";
      ctx.fillStyle = cssVar("--bg", "#fff");
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (const poly of mapData.outline.coordinates) {
        for (const ring of poly) {
          ctx.beginPath();
          ring.forEach(([lon, lat], i) => {
            const q = pr.project(lat, lon);
            if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      if (provSw.input.checked) {
        ctx.strokeStyle = line;
        ctx.lineWidth = 0.6;
        ctx.globalAlpha = 0.85;
        for (const seg of mapData.provinces.coordinates) {
          ctx.beginPath();
          seg.forEach(([lon, lat], i) => {
            const q = pr.project(lat, lon);
            if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
          });
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    const maxKm = Math.max(1, ...list.map((p) => p.distanceKm));
    const r = Number(dotSize.value);
    const cOld = colorOld.value, cNew = colorNew.value;

    // วงรัศมี วาดก่อนเพื่ออยู่ใต้ทุกอย่าง
    radiusTooSmall = false;
    if (radiusSw.input.checked) {
      const km = Math.max(0.1, Number(radiusKm.value) || 3);
      ctx.globalAlpha = 0.13;
      for (const p of list) {
        for (const [lat, lon, col] of [[p.latOld, p.lonOld, cOld], [p.latNew, p.lonNew, cNew]]) {
          const a = pr.project(lat, lon);
          const edge = pr.project(lat + km / 110.574, lon);
          const rad = Math.abs(a.y - edge.y);
          if (rad < 2) { radiusTooSmall = true; continue; }
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(a.x, a.y, rad, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // เส้นเชื่อม
    for (const p of list) {
      const a = pr.project(p.latOld, p.lonOld), b = pr.project(p.latNew, p.lonNew);
      const isSel = selected && selected === p;
      ctx.strokeStyle = isSel ? ink : mute;
      ctx.globalAlpha = selected ? (isSel ? 1 : 0.18) : 0.55;
      ctx.lineWidth = lineMode.value === "fixed" ? 1.4 : 0.8 + (p.distanceKm / maxKm) * 2.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // จุด
    for (const p of list) {
      const dim = selected && selected !== p;
      ctx.globalAlpha = dim ? 0.2 : 1;
      for (const [lat, lon, col] of [[p.latOld, p.lonOld, cOld], [p.latNew, p.lonNew, cNew]]) {
        const q = pr.project(lat, lon);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = cssVar("--bg", "#fff");
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // ป้ายระยะทาง
    const unit = unitIn.value || "";
    let labelled = [];
    if (labelMode.value === "all") labelled = list;
    else if (labelMode.value === "top") labelled = [...list].sort((x, y) => y.distanceKm - x.distanceKm).slice(0, +labelTop.value);
    else if (labelMode.value === "selected" && selected) labelled = [selected];
    if (selected && labelMode.value !== "none") labelled = [selected];
    ctx.font = "600 12px ui-sans-serif, system-ui, 'Sarabun', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // ‼️ ป้ายทับกันคือสิ่งแรกที่พี่ปอนด์ทักตอนดูต้นแบบใน Power BI
    //    ที่นี่จึงวางจากคู่ไกลสุดก่อน แล้วข้ามป้ายที่จะไปทับของที่วางแล้ว และบอกด้วยว่าซ่อนไปกี่ป้าย
    const placed = [];
    let hidden = 0;
    for (const p of [...labelled].sort((x, y) => y.distanceKm - x.distanceKm)) {
      const m = pr.project(p.midLat, p.midLon);
      const txt = `${p.distanceKm.toFixed(2)}${unit}`;
      const w = ctx.measureText(txt).width + 8;
      const box = { x1: m.x - w / 2, y1: m.y - 9, x2: m.x + w / 2, y2: m.y + 9 };
      const clash = placed.some((q) => !(box.x2 < q.x1 - 2 || box.x1 > q.x2 + 2 || box.y2 < q.y1 - 2 || box.y1 > q.y2 + 2));
      if (clash && labelled.length > 1) { hidden++; continue; }
      placed.push(box);
      ctx.fillStyle = cssVar("--bg", "#fff");
      ctx.globalAlpha = 0.86;
      ctx.fillRect(box.x1, box.y1, w, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillText(txt, m.x, m.y);
    }
    lastHiddenLabels = hidden;

    renderLegend(list, maxKm);
    renderSelBar();
  }

  function renderLegend(list, maxKm) {
    legend.innerHTML = "";
    const item = (html) => legend.appendChild(el("span", { html }));
    item(`<i style="background:${colorOld.value}"></i>${tr("จุดเดิม", "Old site")}`);
    item(`<i style="background:${colorNew.value}"></i>${tr("จุดใหม่", "New site")}`);
    item(`<span class="ln"></span>${lineMode.value === "fixed"
      ? tr("เส้นเชื่อมคู่เดียวกัน", "Line joins the pair")
      : tr(`เส้นยิ่งหนา ยิ่งย้ายไกล (ไกลสุด ${maxKm.toFixed(2)} กม.)`, `Thicker means a longer move (longest ${maxKm.toFixed(2)} km)`)}`);
    if (radiusSw.input.checked) {
      item(radiusTooSmall
        ? tr(`รัศมี ${Number(radiusKm.value) || 3} กม. เล็กเกินกว่าจะเห็นในมาตราส่วนนี้ ลองเลือกซูมพอดีข้อมูล หรือคลิกเลือกทีละคู่`,
             `A ${Number(radiusKm.value) || 3} km radius is too small to see at this scale. Zoom to the data or click a single pair`)
        : tr(`วงจาง = รัศมี ${Number(radiusKm.value) || 3} กม.`, `Faded ring = ${Number(radiusKm.value) || 3} km radius`));
    }
    if (lastHiddenLabels) item(tr(`ซ่อนป้ายที่ทับกัน ${lastHiddenLabels} ป้าย`, `${lastHiddenLabels} overlapping ${pl(lastHiddenLabels, "label", "labels")} hidden`));
  }

  function renderSelBar() {
    if (!selected) { selBar.hidden = true; return; }
    selBar.hidden = false;
    selBar.innerHTML = "";
    selBar.append(
      el("b", {}, `${selected.codeOld || selected.pairId} → ${selected.codeNew || ""}`),
      el("span", {}, tr(`ย้ายไป ${selected.distanceKm.toFixed(2)} กม. ทาง${compass(selected.bearing)}`,
                        `moved ${selected.distanceKm.toFixed(2)} km ${compass(selected.bearing, "en")}`)),
      selected.province ? el("span", { class: "mut" }, selected.province) : null,
      button(tr("ดูทั้งประเทศ", "Show the whole country"), { ghost: true, onclick: () => { selected = null; draw(); renderTable(); } }),
    );
  }

  // ── ชี้และคลิกบนแผนที่ ────────────────────────────────────────────────
  function atPoint(ev) {
    if (!view) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (view.W / rect.width);
    const y = (ev.clientY - rect.top) * (view.H / rect.height);
    const list = shown();
    let best = null, bestD = 14;
    for (const p of list) {
      for (const [lat, lon, kind] of [[p.latOld, p.lonOld, "old"], [p.latNew, p.lonNew, "new"]]) {
        const q = view.pr.project(lat, lon);
        const d = Math.hypot(q.x - x, q.y - y);
        if (d < bestD) { bestD = d; best = { pair: p, kind, x: q.x, y: q.y }; }
      }
    }
    if (best) return best;
    // ไม่โดนจุด ลองดูว่าโดนเส้นไหม
    for (const p of list) {
      const a = view.pr.project(p.latOld, p.lonOld), b = view.pr.project(p.latNew, p.lonNew);
      const dd = distToSegment(x, y, a.x, a.y, b.x, b.y);
      if (dd < 6) return { pair: p, kind: "line", x, y };
    }
    return null;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (!dx && !dy) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  canvas.addEventListener("pointermove", (ev) => {
    const hit = atPoint(ev);
    hover = hit;
    if (!hit) { tip.hidden = true; return; }
    const p = hit.pair;
    const what = hit.kind === "old" ? tr("จุดเดิม", "Old site") : hit.kind === "new" ? tr("จุดใหม่", "New site") : tr("เส้นเชื่อม", "Connecting line");
    tip.innerHTML = "";
    tip.append(
      el("div", {}, [el("b", {}, `${p.codeOld || p.pairId}${p.codeNew ? " → " + p.codeNew : ""}`)]),
      el("div", { class: "mut" }, what),
      el("div", {}, tr(`ย้ายไป ${p.distanceKm.toFixed(2)} กม. ทาง${compass(p.bearing)}`,
                       `moved ${p.distanceKm.toFixed(2)} km ${compass(p.bearing, "en")}`)),
      p.province ? el("div", { class: "mut" }, p.province) : null,
    );
    tip.hidden = false;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / view.W;
    tip.style.left = Math.min(rect.width - 170, hit.x * scale + 12) + "px";
    tip.style.top = Math.max(4, hit.y * scale - 10) + "px";
  });
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; hover = null; });
  canvas.addEventListener("click", (ev) => {
    const hit = atPoint(ev);
    selected = hit ? hit.pair : null;
    draw();
    renderTable();
  });

  // ── ตารางคู่ย้าย ──────────────────────────────────────────────────────
  function renderTable() {
    const list = [...shown()].sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
    const maxKm = Math.max(1, ...list.map((p) => p.distanceKm));
    tableBox.innerHTML = "";
    const th = (key, label, cls) => {
      const h = el("th", { class: cls || "" }, label + (sortKey === key ? (sortDir > 0 ? " ▲" : " ▼") : ""));
      h.onclick = () => { if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = -1; } renderTable(); };
      return h;
    };
    tableBox.appendChild(el("table", { class: "mr-table mr-pairs" }, [
      el("thead", {}, [el("tr", {}, [
        th("codeOld", tr("สถานีเดิม", "Old site")),
        th("codeNew", tr("สถานีใหม่", "New site")),
        th("province", tr("จังหวัด", "Province")),
        th("distanceKm", tr("ระยะทาง (กม.)", "Distance (km)"), "num"),
        el("th", {}, ""),
        th("bearing", tr("ทิศ", "Direction")),
      ])]),
      el("tbody", {}, list.map((p) => {
        const trow = el("tr", { class: selected === p ? "on" : "" }, [
          el("td", {}, p.codeOld || p.pairId),
          el("td", {}, p.codeNew || ""),
          el("td", {}, p.province || ""),
          el("td", { class: "num" }, p.distanceKm.toFixed(2)),
          el("td", { style: "width:26%" }, [el("span", { class: "mr-bar", style: `width:${(p.distanceKm / maxKm) * 100}%` })]),
          el("td", {}, compass(p.bearing, IS_EN ? "en" : "th")),
        ]);
        trow.onclick = () => { selected = selected === p ? null : p; renderTable(); if (viewTabs.value !== "map") { viewTabs.value = "map"; viewTabs.onchange(); } else draw(); };
        return trow;
      })),
    ]));
  }

  function renderProv() {
    provBox.innerHTML = "";
    const s = summarize(shown());
    if (!s.provinces || !s.provinces.length || (s.provinces.length === 1 && !s.provinces[0].province)) {
      provBox.appendChild(el("p", { class: "mr-note" }, tr(
        "ไฟล์นี้ไม่มีคอลัมน์จังหวัด เลือกคอลัมน์จังหวัดในแผงซ้ายแล้วจะสรุปให้",
        "This file has no province column. Pick one on the left and the summary appears")));
      return;
    }
    const maxN = Math.max(...s.provinces.map((p) => p.n));
    provBox.appendChild(el("table", { class: "mr-table mr-provs" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("จังหวัด", "Province")),
        el("th", { class: "num" }, tr("กี่คู่", "Pairs")),
        el("th", {}, ""),
        el("th", { class: "num" }, tr("เฉลี่ย (กม.)", "Average (km)")),
        el("th", { class: "num" }, tr("รวม (กม.)", "Total (km)")),
      ])]),
      el("tbody", {}, s.provinces.map((p) => el("tr", {}, [
        el("td", {}, p.province || tr("ไม่ระบุ", "Not given")),
        el("td", { class: "num" }, String(p.n)),
        el("td", { style: "width:30%" }, [el("span", { class: "mr-bar", style: `width:${(p.n / maxN) * 100}%` })]),
        el("td", { class: "num" }, p.avg.toFixed(2)),
        el("td", { class: "num" }, p.total.toFixed(2)),
      ]))),
    ]));
  }

  // ── บันทึกผลลัพธ์ ─────────────────────────────────────────────────────
  function savePng() {
    draw();
    canvas.toBlob((blob) => {
      if (!blob) { st.err(tr("บันทึกภาพไม่สำเร็จ", "Could not save the image")); return; }
      download(blob, tr("แผนที่การกระจัด", "relocation-map") + ".png");
      st.ok(tr("บันทึกภาพแล้ว ขนาดเท่ากับที่เห็นบนจอ", "Image saved at the size you see on screen"));
    }, "image/png");
  }

  function saveXlsx() {
    const list = shown();
    const opt = {
      colorOld: colorOld.value, colorNew: colorNew.value,
      unit: unitIn.value || " กม.", withLabel: labelMode.value !== "none",
    };
    const sheets = [
      [tr("MAPSHAPES", "MAPSHAPES"), sheetMAPSHAPES(list, opt)],
      [tr("PAIR", "PAIR"), sheetPAIR(list)],
      [tr("PATH_UNPIVOT", "PATH_UNPIVOT"), sheetPATH(list)],
    ];
    if (radiusSw.input.checked) sheets.push(["RADIUS_WKT", sheetRADIUS(list, Math.max(0.1, Number(radiusKm.value) || 3), opt)]);
    // เขียนทีละชีตด้วยตัวช่วยกลางของโปรเจกต์ แล้วรวมเป็นสมุดเดียว
    const blob = tablesToBlob(sheets);
    download(blob, tr("แผนที่การกระจัด-สำหรับ-PowerBI", "relocation-for-powerbi") + ".xlsx");
    st.ok(tr(`บันทึกแล้ว ${sheets.length} ชีต พร้อมใส่ Icon Map Pro ได้เลย`,
             `Saved ${sheets.length} sheets, ready for Icon Map Pro`));
  }

  function saveCsv() {
    const t = sheetPAIR(shown());
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = "﻿" + [t.header, ...t.rows].map((r) => r.map(esc).join(",")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), tr("คู่ย้ายสถานี", "relocation-pairs") + ".csv");
    st.ok(tr(`บันทึกแล้ว ${t.rows.length.toLocaleString()} คู่`, `Saved ${pl(t.rows.length.toLocaleString(), "pair", "pairs")}`));
  }

  function sw(labelText, checked, hint) {
    const input = el("input", { type: "checkbox", checked: checked || null });
    const row = el("div", { class: "mr-switch-field" }, [
      el("span", {}, labelText),
      el("span", { class: "mr-switch" }, [input, el("span", { class: "mr-track" })]),
    ]);
    const wrap = el("div", {}, [row, hint ? el("small", { class: "mr-hint" }, hint) : null]);
    return { wrap, input };
  }

  // ‼️ ผืนภาพเป็น canvas จึงไม่เปลี่ยนสีตามธีมเองเหมือน CSS ต้องวาดใหม่เมื่อธีมเปลี่ยน
  //    ทั้งกรณีผู้ใช้กดปุ่มธีม (data-theme บน :root) และกรณีเครื่องสลับโหมดมืดเอง
  const redrawOnTheme = () => { if (pairs.length) requestAnimationFrame(() => draw()); };
  if (typeof MutationObserver === "function") {
    new MutationObserver(redrawOnTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", redrawOnTheme);
  }

  if (typeof ResizeObserver === "function") {
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      const w = Math.round(stage.clientWidth || 0);
      if (!pairs.length || !w || Math.abs(w - lastW) < 24) return;
      lastW = w;
      draw();
    });
    ro.observe(stage);
  }

  return ws.wrap;
}
