import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, segmented, dropzone, download } from "../ui.js";
import { tr, IS_EN } from "../i18n.js";
import { readWorkbook, sheetToTable, tablesToBlob } from "../sheetpick.js";
import {
  distanceKm, circleWKT, toCoord, buildGrid, withinKm, nearestOf, coverageOf,
  mercator, fitProjection, boundsOf,
} from "../geokit.js";

/* ‼️ ทำไมต้องมีเครื่องมือนี้
 * งานที่ตั้งต้นคือ คอลเซ็นเตอร์รับสายแล้วได้พิกัดของลูกค้ามา อยากรู้ว่ารอบจุดนั้นมีอะไรอยู่บ้าง
 * คำถามที่ต้องตอบซ้ำทุกครั้ง: ในรัศมีเท่านี้มีสถานีกี่แห่ง อันไหนใกล้ที่สุด จุดไหนไม่มีอะไรอยู่ใกล้เลย
 * ทำใน Power BI ได้ แต่กว่าจะเห็นภาพต้องเตรียมชีตหลายแบบก่อน และแก้รัศมีทีต้องคำนวณใหม่ทั้งชุด
 * หน้านี้ให้ลากไฟล์เข้ามาแล้วเห็นทันที เลื่อนแถบรัศมีแล้วภาพกับตัวเลขขยับตาม แล้วค่อยส่งออกไป Power BI
 *
 * ‼️ ทำไมต้องใช้ตารางกริดในการค้น ไม่วนเทียบทุกคู่
 *   หน้านี้คำนวณใหม่ทุกครั้งที่ลากแถบรัศมี ถ้าวนทุกคู่จะกระตุกทันทีเมื่อข้อมูลโต
 *   วัดจริงแล้วที่ 200 จุดศูนย์กลาง กับ 50,000 จุดบริวาร วนทุกคู่ใช้ 259 มิลลิวินาที กริดใช้ 13.8
 *   และมีเทสเทียบผลกริดกับการวนทุกคู่ทุกกรณี ต้องตรงกันเป๊ะ (tests/geokit-area.test.mjs)
 *
 * ‼️ ทำไมวงวาดแค่เส้นขอบ ไม่เติมสีพื้น (พี่ปอนด์ทักเอง 18/09/2026)
 *   จุดที่แจ้งที่อยู่ใกล้กันไม่ถึง 1 กิโลเมตร วงรัศมี 3 กิโลเมตรจะทับกันเกือบสนิท
 *   ถ้าเติมพื้น ตรงที่ทับกันจะเข้มขึ้นเรื่อย ๆ จนกลายเป็นก้อนเดียว นับวงไม่ได้
 *   เติมพื้นเฉพาะวงที่ไม่ทับใครเลย
 *
 * ‼️ สีสามชุดผ่านการตรวจภาวะตาบอดสีแล้ว ไม่ได้เลือกตามชอบ
 *   ดำ ส้ม น้ำเงิน มีระยะห่างต่ำสุด 32.1 ในทุกภาวะ
 *   ส่วนม่วงกับเขียวที่ดูน่าใช้ คนตาบอดสีเขียวเห็นเป็นสีเดียวกับน้ำเงิน เหลือ 3.9 และ 2.5
 */

const STYLE = `
.mc-src{display:flex;flex-direction:column;gap:10px}
.mc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.mc-chip{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--bg-soft);
  border:1px solid var(--line);color:var(--text-mute);white-space:nowrap;max-width:100%}
.mc-chip b{color:var(--text);font-weight:700}
.mc-canvas-wrap{position:relative;width:100%;background:var(--card);border:1px solid var(--line);
  border-radius:12px;overflow:hidden}
.mc-canvas-wrap canvas{display:block;width:100%;touch-action:none;cursor:grab}
.mc-canvas-wrap canvas.drag{cursor:grabbing}
.mc-zoom{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:4px}
.mc-zoom button{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);
  background:var(--card);color:var(--text);font-size:15px;font-weight:600;line-height:1;cursor:pointer}
.mc-zoom button:hover{background:var(--bg-soft)}
.mc-stat{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin-top:10px}
.mc-stat div{background:var(--bg-soft);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.mc-stat b{display:block;font-size:19px;color:var(--text)}
.mc-stat span{font-size:12px;color:var(--text-mute)}
.mc-tbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
.mc-tbl th,.mc-tbl td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
.mc-tbl th{color:var(--text-mute);font-weight:600;position:sticky;top:0;background:var(--card)}
.mc-tbl tr.warn td{background:color-mix(in srgb,var(--warn,#e8a33c) 12%,transparent)}
.mc-tblwrap{max-height:330px;overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:10px}
.mc-row{display:flex;gap:8px;align-items:center}
.mc-row input[type=range]{flex:1}
.mc-num{min-width:74px;text-align:right;font-variant-numeric:tabular-nums;color:var(--text)}
`;

const PALETTE = { center: "#222222", old: "#e8763c", neu: "#2e6db4" };
const num = (v) => (v == null || v === "" ? null : Number(String(v).replace(/,/g, "")));

export function mount(tool) {
  const st = statusBar();
  const styleEl = el("style", {}, STYLE);

  let wbC = null, wbS = null;               // สมุดงานสองไฟล์
  let centers = [], points = [];            // ข้อมูลที่แปลงแล้ว
  let grid = null, cov = null;
  let mapData = null;
  let view = { k: 1, x: 0, y: 0 };          // สถานะซูมและเลื่อน
  let hover = null;

  // ── แผงซ้าย รับไฟล์และเลือกคอลัมน์ ────────────────────────────────
  const dzC = dropzone({ accept: ".xlsx,.xls,.csv,.txt", multiple: false, thumbs: false,
    expect: ["xlsx", "xls", "csv", "txt"],
    hint: tr("ไฟล์จุดศูนย์กลาง เช่น สายที่ลูกค้าแจ้ง", "Centre points file, for example customer calls"),
    samples: [["samples/ตัวอย่าง-จุดที่ลูกค้าแจ้ง.xlsx",
               "ตัวอย่างจุดที่ลูกค้าแจ้ง 8 จุด (Excel)", "Sample of 8 customer calls (Excel)"]],
    onChange: () => readC() });
  const dzS = dropzone({ accept: ".xlsx,.xls,.csv,.txt", multiple: false, thumbs: false,
    expect: ["xlsx", "xls", "csv", "txt"],
    hint: tr("ไฟล์จุดบริวาร เช่น สถานีที่มีสัญญา", "Surrounding points file, for example contracted sites"),
    samples: [["samples/ตัวอย่าง-สถานีรอบจุด.xlsx",
               "ตัวอย่างสถานี 60 แห่ง มีทั้งในวงและนอกวง (Excel)",
               "Sample of 60 sites, some inside and some outside (Excel)"]],
    onChange: () => readS() });

  const shC = select([], ""), latC = select([], ""), lonC = select([], ""), idC = select([], "");
  const shS = select([], ""), latS = select([], ""), lonS = select([], "");
  const lat2S = select([], ""), lon2S = select([], ""), idS = select([], "");
  const chipsC = el("div", { class: "mc-chips" });
  const chipsS = el("div", { class: "mc-chips" });

  const leftBody = el("div", { class: "mc-src" }, [
    el("h3", { style: "margin:2px 0 0;font-size:13px;color:var(--text-mute)" },
      tr("1. จุดศูนย์กลาง", "1. Centre points")),
    dzC.container, chipsC,
    field(tr("ชีต", "Sheet"), shC),
    field(tr("รหัส", "Id"), idC),
    field(tr("ละติจูด", "Latitude"), latC),
    field(tr("ลองจิจูด", "Longitude"), lonC),
    el("hr", { style: "border:0;border-top:1px solid var(--line);margin:6px 0" }),
    el("h3", { style: "margin:2px 0 0;font-size:13px;color:var(--text-mute)" },
      tr("2. จุดบริวาร", "2. Surrounding points")),
    dzS.container, chipsS,
    field(tr("ชีต", "Sheet"), shS),
    field(tr("รหัส", "Id"), idS),
    field(tr("ละติจูดเดิม", "Latitude, original"), latS),
    field(tr("ลองจิจูดเดิม", "Longitude, original"), lonS),
    field(tr("ละติจูดใหม่ (ถ้ามี)", "Latitude, new (optional)"), lat2S),
    field(tr("ลองจิจูดใหม่ (ถ้ามี)", "Longitude, new (optional)"), lon2S),
  ]);

  // ── แผงขวา ปรับแต่ง ──────────────────────────────────────────────
  const radius = el("input", { type: "range", min: "0.2", max: "25", step: "0.1", value: "3" });
  // ‼️ ค่าเริ่มต้นต้องแปลภาษาด้วย เดิมเขียน "3.0 กม." ตายตัว
  //    อีกสองที่ที่อัปเดตค่านี้ใช้ IS_EN ถูกแล้ว แต่ค่าตั้งต้นตกหล่น
  //    ผลคือคนเปิดภาษาอังกฤษเห็น "กม." จนกว่าจะขยับแถบเลื่อน
  const radiusNum = el("span", { class: "mc-num" }, IS_EN ? "3.0 km" : "3.0 กม.");
  const dotSize = el("input", { type: "range", min: "1", max: "9", step: "0.5", value: "4" });
  const onOff = () => [["on", tr("แสดง", "Show")], ["off", tr("ซ่อน", "Hide")]];
  const showOut = segmented([["dim", tr("จาง", "Dim")], ["hide", tr("ซ่อน", "Hide")],
                             ["full", tr("เต็ม", "Full")]], "dim");
  const showNew = segmented(onOff(), "on");
  const showLink = segmented(onOff(), "on");
  const showCount = segmented(onOff(), "on");
  const cCenter = el("input", { type: "color", value: PALETTE.center });
  const cOld = el("input", { type: "color", value: PALETTE.old });
  const cNew = el("input", { type: "color", value: PALETTE.neu });

  const rightBody = el("div", {}, [
    field(tr("รัศมี", "Radius"), el("div", { class: "mc-row" }, [radius, radiusNum])),
    field(tr("ขนาดจุด", "Dot size"), dotSize),
    field(tr("จุดที่อยู่นอกวง", "Points outside"), showOut),
    field(tr("จุดใหม่", "New points"), showNew),
    field(tr("เส้นเชื่อมเดิมกับใหม่", "Link old to new"), showLink),
    field(tr("ตัวเลขจำนวนข้างวง", "Count label"), showCount),
    field(tr("สีจุดศูนย์กลาง", "Centre colour"), cCenter),
    field(tr("สีจุดเดิม", "Original colour"), cOld),
    field(tr("สีจุดใหม่", "New colour"), cNew),
  ]);

  // ── กลาง แผนที่กับตาราง ──────────────────────────────────────────
  const canvas = el("canvas");
  const zoomBox = el("div", { class: "mc-zoom" }, [
    button("+", { label: tr("ซูมเข้า", "Zoom in"), onclick: () => zoomBy(1.35) }),
    button("-", { label: tr("ซูมออก", "Zoom out"), onclick: () => zoomBy(1 / 1.35) }),
    button("1:1", { label: tr("กลับไปขนาดเต็ม", "Reset zoom"), onclick: () => { view = { k: 1, x: 0, y: 0 }; draw(); } }),
  ]);
  const statBox = el("div", { class: "mc-stat" });
  const tblWrap = el("div", { class: "mc-tblwrap" });
  const centerNode = el("div", {}, [
    el("div", { class: "mc-canvas-wrap" }, [canvas, zoomBox]), statBox, tblWrap,
  ]);

  const goPng = button(tr("บันทึกภาพ", "Save image"), { icon: "image", onclick: savePng });
  const goXlsx = button(tr("ไฟล์สำหรับ Power BI", "File for Power BI"), { icon: "download", onclick: saveXlsx, ghost: true });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์พิกัด", "Coordinate files"), node: leftBody },
    center: { node: centerNode, empty: tr("เปิดไฟล์จุดศูนย์กลางและจุดบริวาร แล้วจะเห็นแผนที่ทันที",
                                          "Open both files to see the map") },
    right: { title: tr("ปรับแต่ง", "Adjust"), node: rightBody },
    footer: [goPng, goXlsx, st.node],
  });
  ws.body.prepend(styleEl);

  fetch(new URL("../../assets/thailand-map.json", import.meta.url))
    .then((r) => r.json()).then((d) => { mapData = d; if (centers.length) draw(); }).catch(() => {});

  [radius, dotSize].forEach((r) => r.addEventListener("input", () => {
    radiusNum.textContent = Number(radius.value).toFixed(1) + (IS_EN ? " km" : " กม.");
    recompute();
  }));
  [showOut, showNew, showLink, showCount].forEach((s) => s.addEventListener("change", draw));
  [cCenter, cOld, cNew].forEach((c) => c.addEventListener("input", draw));
  [shC, idC, latC, lonC].forEach((s) => s.addEventListener("change", () => { if (shC.value) parseC(); }));
  [shS, idS, latS, lonS, lat2S, lon2S].forEach((s) => s.addEventListener("change", () => { if (shS.value) parseS(); }));

  // ── อ่านไฟล์ ─────────────────────────────────────────────────────
  async function readC() {
    const f = dzC.files[0]; if (!f) return;
    try {
      ({ wb: wbC } = await readWorkbook(f));
      fillSheets(wbC, shC); parseC();
    } catch (e) { st.err(tr("อ่านไฟล์จุดศูนย์กลางไม่สำเร็จ", "Could not read the centre file") + ": " + e.message); }
  }
  async function readS() {
    const f = dzS.files[0]; if (!f) return;
    try {
      ({ wb: wbS } = await readWorkbook(f));
      fillSheets(wbS, shS); parseS();
    } catch (e) { st.err(tr("อ่านไฟล์จุดบริวารไม่สำเร็จ", "Could not read the points file") + ": " + e.message); }
  }
  function fillSheets(wb, sel) {
    sel.innerHTML = "";
    wb.SheetNames.forEach((n) => sel.append(el("option", { value: n }, n)));
    sel.value = wb.SheetNames[0];
  }
  function fillCols(header, sels, guesses) {
    sels.forEach((sel, i) => {
      const keep = sel.value;
      sel.innerHTML = "";
      sel.append(el("option", { value: "" }, tr("— ไม่ใช้ —", "— none —")));
      header.forEach((h, j) => sel.append(el("option", { value: String(j) }, h || `#${j + 1}`)));
      const g = guesses[i];
      sel.value = keep && header[+keep] !== undefined ? keep : (g >= 0 ? String(g) : "");
    });
  }
  const findCol = (header, res) => {
    for (const re of res) { const i = header.findIndex((h) => re.test(String(h || ""))); if (i >= 0) return i; }
    return -1;
  };

  function parseC() {
    if (!wbC || !shC.value) return;
    const { header, rows } = sheetToTable(wbC.Sheets[shC.value]);
    fillCols(header, [idC, latC, lonC], [
      findCol(header, [/รหัส|id|code|สาย/i]),
      findCol(header, [/ละติจูด|lat/i]),
      findCol(header, [/ลองจิจูด|long?/i]),
    ]);
    const li = +latC.value, oi = +lonC.value, ii = +idC.value;
    if (latC.value === "" || lonC.value === "") { st.info(tr("เลือกคอลัมน์พิกัดของจุดศูนย์กลาง", "Pick the centre coordinates")); return; }
    centers = rows.map((r, n) => ({
      id: ii >= 0 && idC.value !== "" ? String(r[ii] ?? n + 1) : String(n + 1),
      lat: toCoord(r[li]), lon: toCoord(r[oi]), raw: r,
    })).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
    chipsC.innerHTML = "";
    chipsC.append(el("span", { class: "mc-chip" }, [tr("จุดศูนย์กลาง ", "Centres "), el("b", {}, String(centers.length))]));
    recompute();
  }

  function parseS() {
    if (!wbS || !shS.value) return;
    const { header, rows } = sheetToTable(wbS.Sheets[shS.value]);
    fillCols(header, [idS, latS, lonS, lat2S, lon2S], [
      findCol(header, [/รหัส|id|code|สถานี/i]),
      findCol(header, [/ละติจูดเดิม|lat.*old|old.*lat/i, /ละติจูด|lat/i]),
      findCol(header, [/ลองจิจูดเดิม|lon.*old|old.*lon/i, /ลองจิจูด|long?/i]),
      findCol(header, [/ละติจูดใหม่|lat.*new|new.*lat/i]),
      findCol(header, [/ลองจิจูดใหม่|lon.*new|new.*lon/i]),
    ]);
    if (latS.value === "" || lonS.value === "") { st.info(tr("เลือกคอลัมน์พิกัดของจุดบริวาร", "Pick the point coordinates")); return; }
    const li = +latS.value, oi = +lonS.value, ii = +idS.value;
    const l2 = lat2S.value === "" ? -1 : +lat2S.value, o2 = lon2S.value === "" ? -1 : +lon2S.value;
    points = [];
    rows.forEach((r, n) => {
      const id = ii >= 0 && idS.value !== "" ? String(r[ii] ?? n + 1) : String(n + 1);
      const a = toCoord(r[li]), b = toCoord(r[oi]);
      if (Number.isFinite(a) && Number.isFinite(b)) points.push({ id, lat: a, lon: b, kind: "old", raw: r });
      if (l2 >= 0 && o2 >= 0) {
        const c = toCoord(r[l2]), d2 = toCoord(r[o2]);
        if (Number.isFinite(c) && Number.isFinite(d2)) {
          points.push({ id, lat: c, lon: d2, kind: "new", raw: r, from: { lat: a, lon: b } });
        }
      }
    });
    chipsS.innerHTML = "";
    const nOld = points.filter((p) => p.kind === "old").length;
    const nNew = points.length - nOld;
    chipsS.append(el("span", { class: "mc-chip" }, [tr("จุดเดิม ", "Original "), el("b", {}, String(nOld))]));
    if (nNew) chipsS.append(el("span", { class: "mc-chip" }, [tr("จุดใหม่ ", "New "), el("b", {}, String(nNew))]));
    recompute();
  }

  // ── คำนวณ ────────────────────────────────────────────────────────
  function recompute() {
    radiusNum.textContent = Number(radius.value).toFixed(1) + (IS_EN ? " km" : " กม.");
    if (!centers.length || !points.length) { ws.showCanvas(false); draw(); return; }
    const km = Number(radius.value);
    const t0 = performance.now();
    grid = buildGrid(points, km);
    cov = coverageOf(centers, grid, km);
    const ms = performance.now() - t0;
    st.ok(tr(`คำนวณ ${centers.length} วง กับ ${points.length} จุด ใน ${ms.toFixed(0)} มิลลิวินาที`,
             `${centers.length} circles against ${points.length} points in ${ms.toFixed(0)} ms`));
    // มีข้อมูลแล้ว ข้อความชวนเปิดไฟล์ต้องหายไป ไม่งั้นค้างอยู่เหนือแผนที่
    ws.showCanvas(true);
    draw(); renderStat(); renderTable();
  }

  // ── วาด ──────────────────────────────────────────────────────────
  function zoomBy(f) { view.k = Math.max(1, Math.min(60, view.k * f)); draw(); }

  function project() {
    const pts = centers.map((c) => [c.lat, c.lon]).concat(points.map((p) => [p.lat, p.lon]));
    if (!pts.length) return null;
    const W = canvas.width, H = canvas.height;
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    for (const [a, o] of pts) { la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, o); lo1 = Math.max(lo1, o); }
    const pad = 0.06;
    const dla = (la1 - la0) * pad || 0.2, dlo = (lo1 - lo0) * pad || 0.2;
    la0 -= dla; la1 += dla; lo0 -= dlo; lo1 += dlo;
    const s = Math.min(W / (lo1 - lo0), H / (la1 - la0)) * view.k;
    const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
    return (lat, lon) => [W / 2 + (lon - cx) * s + view.x, H / 2 - (lat - cy) * s + view.y];
  }

  function draw() {
    /* ‼️ ตอนวาดครั้งแรก กล่องยังไม่มีความกว้างจริง เพราะยังไม่ถูกวางในหน้า
     *    ถ้าใช้ค่านั้นเลย แผนที่จะเล็กติดอยู่กลางกรอบตลอด แม้หน้าต่างจะกว้าง
     *    จึงถอยไปดูความกว้างของกล่องกลางแทน และวาดซ้ำเมื่อขนาดเปลี่ยนจริง */
    const wrap = canvas.parentElement;
    const cssW = Math.max(320, wrap.clientWidth || centerNode.clientWidth
                               || (centerNode.parentElement && centerNode.parentElement.clientWidth) || 900);
    const cssH = Math.round(cssW * 0.72);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.height = cssH + "px";
    const g = canvas.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = getComputedStyle(document.body).getPropertyValue("--card") || "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (!centers.length || !points.length) return;
    const P = project(); if (!P) return;
    const R = Number(radius.value), sz = Number(dotSize.value) * dpr;

    if (mapData) {
      g.strokeStyle = "rgba(150,150,150,.32)"; g.lineWidth = 1 * dpr;
      for (const line of mapData.provinces.coordinates) {
        g.beginPath();
        line.forEach((p, i) => { const [x, y] = P(p[1], p[0]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      }
      g.strokeStyle = "rgba(120,120,120,.55)"; g.lineWidth = 1.6 * dpr;
      for (const poly of mapData.outline.coordinates) for (const ring of poly) {
        g.beginPath();
        ring.forEach((p, i) => { const [x, y] = P(p[1], p[0]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      }
    }

    // วงรัศมี วาดเส้นขอบเสมอ เติมพื้นเฉพาะวงที่ไม่ทับใคร
    const lonely = new Set();
    for (const c of centers) {
      if (!centers.some((o) => o !== c && distanceKm(c.lat, c.lon, o.lat, o.lon) <= 2 * R)) lonely.add(c.id);
    }
    const cc = cCenter.value;
    for (const c of centers) {
      const pts = [];
      for (let i = 0; i <= 72; i++) {
        const t = (i / 72) * 2 * Math.PI;
        pts.push(P(c.lat + (R / 110.574) * Math.cos(t),
                   c.lon + (R / (111.320 * Math.cos(c.lat * Math.PI / 180))) * Math.sin(t)));
      }
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (lonely.has(c.id)) { g.fillStyle = hexA(cc, 0.07); g.fill(); }
      g.strokeStyle = hexA(cc, 0.78); g.lineWidth = 1.6 * dpr; g.stroke();
    }

    const inside = cov ? cov.covered : new Set();
    const mode = showOut.value, wantNew = showNew.value === "on";
    if (showLink.value === "on") {
      g.strokeStyle = "rgba(130,130,130,.5)"; g.lineWidth = 1 * dpr;
      points.forEach((p, i) => {
        if (p.kind !== "new" || !p.from || !inside.has(i)) return;
        const [x1, y1] = P(p.from.lat, p.from.lon), [x2, y2] = P(p.lat, p.lon);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      });
    }
    points.forEach((p, i) => {
      if (p.kind === "new" && !wantNew) return;
      const hit = inside.has(i);
      if (!hit && mode === "hide") return;
      const [x, y] = P(p.lat, p.lon);
      g.fillStyle = hexA(p.kind === "new" ? cNew.value : cOld.value,
                         hit || mode === "full" ? 1 : 0.38);
      g.beginPath(); g.arc(x, y, hit ? sz : sz * 0.72, 0, 2 * Math.PI); g.fill();
    });

    for (const c of centers) {
      const [x, y] = P(c.lat, c.lon);
      g.fillStyle = cc; g.beginPath(); g.arc(x, y, sz * 1.45, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = 2 * dpr; g.stroke();
    }
    if (showCount.value === "on" && cov) {
      g.font = `700 ${12 * dpr}px system-ui, sans-serif`;
      for (const row of cov.rows) {
        if (!row.count) continue;
        const [x, y] = P(row.center.lat, row.center.lon);
        const t = String(row.count), w = g.measureText(t).width;
        g.fillStyle = "rgba(255,255,255,.92)";
        g.beginPath(); g.roundRect(x + 9 * dpr, y - 22 * dpr, w + 11 * dpr, 18 * dpr, 5 * dpr); g.fill();
        g.strokeStyle = hexA(cc, 0.45); g.lineWidth = 1 * dpr; g.stroke();
        g.fillStyle = cc; g.fillText(t, x + 14 * dpr, y - 9 * dpr);
      }
    }
  }

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return `rgba(0,0,0,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function renderStat() {
    if (!cov) { statBox.innerHTML = ""; return; }
    const nOld = points.filter((p) => p.kind === "old").length;
    const covOld = [...cov.covered].filter((i) => points[i].kind === "old").length;
    const covNew = cov.covered.size - covOld;
    statBox.innerHTML = "";
    const add = (v, l) => statBox.append(el("div", {}, [el("b", {}, String(v)), el("span", {}, l)]));
    add(centers.length, tr("จุดศูนย์กลาง", "Centres"));
    add(cov.covered.size, tr("จุดที่อยู่ในวง", "Points inside"));
    add(points.length - cov.covered.size, tr("จุดนอกวงทั้งหมด", "Points outside"));
    add(covOld, tr("จุดเดิมในวง", "Original inside"));
    if (points.length > nOld) add(covNew, tr("จุดใหม่ในวง", "New inside"));
    add(cov.emptyCenters, tr("วงที่ไม่มีจุดเลย", "Empty circles"));
  }

  function renderTable() {
    if (!cov) { tblWrap.innerHTML = ""; return; }
    const rows = cov.rows.slice().sort((a, b) => b.count - a.count);
    const t = el("table", { class: "mc-tbl" });
    t.append(el("thead", {}, el("tr", {}, [
      el("th", {}, tr("รหัส", "Id")), el("th", {}, tr("ในวง", "Inside")),
      el("th", {}, tr("เดิม", "Original")), el("th", {}, tr("ใหม่", "New")),
      el("th", {}, tr("ใกล้ที่สุด", "Nearest")), el("th", {}, tr("ห่าง (ม.)", "Distance (m)")),
    ])));
    const tb = el("tbody");
    for (const r of rows) {
      const near = r.nearest || nearestOf(grid, r.center.lat, r.center.lon, Number(radius.value));
      tb.append(el("tr", { class: r.count ? "" : "warn" }, [
        el("td", {}, r.center.id),
        el("td", {}, String(r.count)),
        el("td", {}, String(r.byKind.old || 0)),
        el("td", {}, String(r.byKind.new || 0)),
        el("td", {}, near ? points[near.index].id : "—"),
        el("td", {}, near ? Math.round(near.km * 1000).toLocaleString() : "—"),
      ]));
    }
    t.append(tb);
    tblWrap.innerHTML = ""; tblWrap.append(t);
  }

  // ── ลากและซูมด้วยเมาส์ ───────────────────────────────────────────
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    canvas.classList.add("drag"); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.x = drag.vx + (e.clientX - drag.x) * dpr;
    view.y = drag.vy + (e.clientY - drag.y) * dpr;
    draw();
  });
  canvas.addEventListener("pointerup", () => { drag = null; canvas.classList.remove("drag"); });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); },
                          { passive: false });
  window.addEventListener("resize", () => draw());
  // ‼️ หน้านี้อยู่ในแผงสามคอลัมน์ที่ยืดหดได้ ต้องเฝ้าขนาดกล่องเอง
  //    ไม่งั้นย่อขยายหน้าต่างแล้วแผนที่ค้างขนาดเดิมจนดูเหมือนเพี้ยน
  if (window.ResizeObserver) {
    let last = 0;
    new ResizeObserver(() => {
      const w = canvas.parentElement.clientWidth;
      if (w && Math.abs(w - last) > 8) { last = w; draw(); }
    }).observe(canvas.parentElement);
  }

  // ── ส่งออก ───────────────────────────────────────────────────────
  function savePng() {
    canvas.toBlob((b) => download(b, tr("แผนที่พื้นที่รอบจุด", "coverage-map") + ".png"), "image/png");
  }

  function saveXlsx() {
    if (!cov) { st.err(tr("ยังไม่มีข้อมูล", "No data yet")); return; }
    try { saveXlsxInner(); }
    catch (e) { st.err(tr("สร้างไฟล์ไม่สำเร็จ", "Could not build the file") + ": " + e.message); }
  }

  function saveXlsxInner() {
    const km = Number(radius.value);
    const RADII = [...new Set([1, 2, 3, 5, 10, km])].sort((a, b) => a - b);
    /* ‼️ tablesToBlob รับ "อาร์เรย์ของคู่ [ชื่อชีต, ตาราง]" ไม่ใช่ออบเจ็กต์
       เคยส่งเป็นออบเจ็กต์แล้วพังด้วย sheets is not iterable ซึ่งไม่ขึ้นบนหน้าจอเลย
       ปุ่มกดแล้วเงียบ ไม่มีไฟล์ออกมา และไม่มีอะไรบอกว่าเกิดอะไรขึ้น */
    const sheets = [];
    sheets.push(["CENTERS", { header: ["ID", "LAT", "LON"], rows: centers.map((c) => [c.id, c.lat, c.lon]) }]);
    sheets.push(["POINTS", { header: ["ID", "KIND", "LAT", "LON"],
      rows: points.map((p) => [p.id, p.kind === "new" ? "NEW" : "OLD", p.lat, p.lon]) }]);
    // ‼️ ตาราง PAIRS คือหัวใจที่ทำให้ slicer ปรับรัศมีใน Power BI ได้
    //    เก็บทุกคู่พร้อมระยะ แล้วให้ slicer กรองด้วยระยะ ไม่ใช่เก็บผลของรัศมีเดียว
    const maxKm = Math.max(...RADII) * 1.2;
    const pairs = [];
    const gAll = buildGrid(points, maxKm);
    for (const c of centers) {
      const hit = withinKm(gAll, c.lat, c.lon, maxKm);
      hit.forEach((h, i) => pairs.push([c.id, points[h.index].id,
        points[h.index].kind === "new" ? "NEW" : "OLD",
        +h.km.toFixed(4), Math.round(h.km * 1000), i + 1, i === 0 ? "YES" : "NO"]));
    }
    sheets.push(["PAIRS", { header: ["CENTER_ID", "POINT_ID", "KIND", "DIST_KM", "DIST_M", "RANK", "IS_NEAREST"], rows: pairs }]);
    sheets.push(["RADIUS_WKT", { header: ["CENTER_ID", "RADIUS_KM", "WKT"],
      rows: centers.flatMap((c) => RADII.map((r) => [c.id, r, circleWKT(c.lat, c.lon, r, 64)])) }]);
    sheets.push(["RADIUS_SLICER", { header: ["RADIUS_KM", "LABEL"], rows: RADII.map((r) => [r, `${r} km`]) }]);
    sheets.push(["SUMMARY", { header: ["CENTER_ID", "RADIUS_KM", "IN_TOTAL", "IN_OLD", "IN_NEW", "NEAREST_ID", "NEAREST_M"],
      rows: cov.rows.map((r) => {
        const n = r.nearest || nearestOf(grid, r.center.lat, r.center.lon, km);
        return [r.center.id, km, r.count, r.byKind.old || 0, r.byKind.new || 0,
                n ? points[n.index].id : "", n ? Math.round(n.km * 1000) : ""];
      }) }]);
    const blob = tablesToBlob(sheets);
    download(blob, tr("พื้นที่รอบจุด-สำหรับ-PowerBI", "coverage-for-powerbi") + ".xlsx");
    st.ok(tr(`ได้ไฟล์แล้ว คู่ทั้งหมด ${pairs.length.toLocaleString()} แถว`,
             `File ready, ${pairs.length.toLocaleString()} pair rows`));
  }

  // ‼️ ต้องคืน element ให้ระบบเอาไปวางในหน้า ถ้าไม่คืนจะขึ้นคำว่า undefined แทนเครื่องมือ
  return ws.wrap;
}
