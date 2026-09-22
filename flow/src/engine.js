// ─────────────────────────────────────────────────────────────────────────────
// สะพานไป draw.io ตัวฝัง (แผน D3) คุยด้วย postMessage อย่างเดียว ไม่แก้โค้ดของเขาสักบรรทัด
//
// ท่อหนึ่งรอบ (ยิงจริง 22/09/2026 หลักฐาน .claude/evidence/flowkit-build-2026-09-22/engine_probe*.py)
//   1. load Mermaid → event load ส่ง xml กลับมาด้วยเลย และแปลงเสร็จแล้วจริง
//      (ส่งออกทันทีกับรอ 2.2 วินาทีได้กล่อง เส้น และขนาดภาพเท่ากันทุกตัวเลข)
//   2. เปลี่ยนฟอนต์ใน xml เป็น Sarabun กับสีกรอบกลุ่มเป็นขาวเทา แล้ว load กลับ (เฟส 0 ข้อ จ: configure ไม่มีผลกับผังจาก Mermaid)
//   3. export xmlpng = PNG ที่ฝัง XML ไว้ ไฟล์เดียววางสไลด์ได้ และเปิดแก้ต่อใน draw.io ได้ (D4)
//   ใช้ iframe เดิมซ้ำได้ ผังเก่าหายหมด · เปิดครั้งแรก ~2 วินาที รอบถัดไป 65 ถึง 150 ms
//
// ‼️ Mermaid ที่พังบางแบบ draw.io ยังตอบ load พร้อมผังที่ขาดกล่อง บางแบบเงียบไปเลย
//    จึงนับกล่องใน xml เทียบกับที่สั่ง และทุกขั้นมีเพดานเวลา
// ‼️ draw.io ส่งคำขอของเรากลับมาในช่อง message ของ event จึงติดเลขลำดับไว้ให้ event ตอบคำขอถูกตัว
//    แต่ load ที่ส่ง xml ไป ไม่มีช่องนี้กลับมา (จับ event จริง 22/09/2026 เคยรอจนหมดเวลาเพราะเทียบเลขอย่างเดียว)
//    event ที่ไม่มีเลขจึงรับได้ ส่วนกันของค้างจากคำขอเก่า ใช้วิธีทิ้ง iframe ทั้งตัวทุกครั้งที่หมดเวลาแทน
// ─────────────────────────────────────────────────────────────────────────────

/* ‼️ W1 (พี่ปอนด์เคาะ 22/09/2026) ใช้ของเขาก่อน สลับเป็นวางเองได้ที่บรรทัดนี้บรรทัดเดียว
 *    วางเอง = "../vendor/drawio/" แล้วแก้ CSP ใน flow/index.html จาก frame-src https://embed.diagrams.net เป็น 'self'
 * ‼️ ห้ามรับที่อยู่นี้จาก URL (?drawio=) ใครส่งลิงก์ที่ชี้ไปเว็บอื่นมา ข้อความที่พิมพ์จะถูกส่งไปให้เว็บนั้น */
export const DRAWIO = "https://embed.diagrams.net/";
const ORIGIN = new URL(DRAWIO, location.href).origin;
const PARAMS = "?embed=1&proto=json&spin=1&ui=min&noSaveBtn=1&noExitBtn=1";
const FONT_SOURCE = encodeURIComponent("https://fonts.googleapis.com/css?family=Sarabun");
/* ‼️ เวลาตัดสินว่า "ต่อไม่ได้" มาจากการวัดจริง 22/09/2026 (engine_probe4.py)
 *    เน็ตปกติ: iframe โหลดเสร็จที่ 0.4 ถึง 0.7 วินาที แล้ว draw.io ส่ง init ตามมาอีก 0.7 ถึง 1 วินาที
 *    โดเมนถูกบล็อก: iframe "โหลดเสร็จ" ใน 0.1 วินาที (เป็นหน้า error) แล้วไม่มี init มาเลย
 *    เน็ต 3G ช้า 400 kbps: 20 วินาทียังไม่โหลดเสร็จทั้งคู่ (draw.io หนักราว 10 MB)
 *    จึงนับเวลาจากตอน iframe โหลดเสร็จ ไม่ใช่จากตอนเริ่ม เน็ตช้าจะไม่ถูกตัดสินว่าต่อไม่ได้ทั้งที่กำลังโหลดอยู่
 *    และถึงจะบอกผู้ใช้ไปแล้วว่าต่อไม่ได้ ถ้า init มาทีหลังก็ยังรับ ผังขึ้นเองโดยไม่ต้องกดอะไร */
const BOOT_SLOW_MS = 8000;         // ยังไม่พร้อม บอกผู้ใช้ว่าครั้งแรกต้องโหลดตัววาดผังก่อน
const AFTER_LOAD_MS = 10000;       // iframe โหลดเสร็จแล้วยังไม่มี init = น่าจะถูกบล็อกหรือเว็บเขาล่ม
const STEP_MAX_MS = 15000;         // Mermaid ที่ draw.io อ่านไม่ออกเลยจะเงียบ ไม่มี event ใดกลับมา

export class EngineError extends Error {
  /** @param {"timeout"|"incomplete"|"bad-png"|"reset"} kind */
  constructor(kind, detail = "") { super(detail || kind); this.kind = kind; }
}

/** ฟอนต์ของทุกกล่องและเส้นเป็น Sarabun
 *  แก้เฉพาะในแอตทริบิวต์ style กับ mermaidBaseStyle (ข้อความที่ผู้ใช้พิมพ์ว่า fontFamily=... ต้องไม่ถูกแตะ)
 *  ‼️ mermaidBaseStyle คือสไตล์ตั้งต้นที่ draw.io จำไว้ตอนแปลงจาก Mermaid (เจอจากการแกะ PNG จริง 22/09/2026)
 *     ไม่แก้ตรงนี้ด้วย แก้กล่องใน draw.io ทีหลังแล้วฟอนต์อาจเด้งกลับเป็น Trebuchet */
export function restyleFont(xml) {
  const font = `fontFamily=Sarabun;fontSource=${FONT_SOURCE}`;
  return String(xml).replace(/(\s(?:style|mermaidBaseStyle))="([^"]*)"/g, (_, attr, s) =>
    `${attr}="${/fontFamily=/.test(s) ? s.replace(/fontFamily=[^;]*/g, font) : `${s}${s && !s.endsWith(";") ? ";" : ""}${font};`}"`);
}

/* ‼️ กรอบกลุ่ม (subgraph) ได้สีเหลืองตั้งต้นของ Mermaid มาเสมอ (#ffffde ขอบ #aaaa33 เห็นจาก contact sheet 22/09/2026)
 *    สั่งสีผ่าน Mermaid ไม่ได้ เพราะ draw.io ข้ามคำสั่ง style กับ class (engine_probe5) จึงแก้ใน xml แทน
 *    ใช้สีขาวเทาชุดเดียวกับหน้าเว็บ (W3) และคงรูป light-dark() ไว้ให้ draw.io สลับเองตอนเปิดแก้ในธีมมืด
 *    ‼️ จำกลุ่มได้จาก mermaidId="n:g<เลข>" ซึ่งเป็น id ของเราเอง (กล่องเป็น n<เลข> กลุ่มเป็น g<เลข> ใน to-mermaid.js) */
const GROUP_LOOK = { fillColor: "light-dark(#f6f5f3,#1b1d22)", strokeColor: "light-dark(#cfccc5,#4a505c)", fontColor: "light-dark(#585d68,#a8adb8)" };
export function restyleGroups(xml) {
  return String(xml).replace(/<UserObject\b[^>]*\bmermaidId="n:g\d+"[^>]*>\s*<mxCell\b[^>]*>/g, (block) =>
    block.replace(/\b(fillColor|strokeColor|fontColor)=[^;"]*/g, (_, k) => `${k}=${GROUP_LOOK[k]}`));
}

/* ‼️ ยืดผังหลังนำเข้า (พี่ปอนด์ทัก 22/09/2026: ผังระบบป้ายเส้นทับกัน)
 *    draw.io ไม่รับค่าระยะห่างของ Mermaid ทั้ง %%{init}%% และ frontmatter (ยิงจริง engine_probe8 ขนาดภาพเท่าเดิมทุกตัว)
 *    จึงคูณตำแหน่งของกล่องกับจุดหักเส้นใน XML แทน
 *    ‼️ ยืดแนวตั้งอย่างเดียวไม่พอ (v149 บนเว็บจริงยังเบียด) เส้นที่ออกจากกล่องเดียวกันไปแถวเดียวกัน ป้ายอยู่กลางเส้นระดับเดียวกันหมด
 *       ต้องยืดแนวนอนด้วยให้เส้นแยกห่างกัน วัดด้วยฟอนต์ Sarabun จริงแล้ว x 1.35 กับ y 1.45 ป้ายทั้ง 4 แยกกันชัด (engine_probe10 , shots/labels10-sheet.png)
 *    ‼️ กรอบกลุ่มต้องยืดกว้างกับสูงตามด้วย ไม่งั้นกล่องข้างในล้นกรอบ , ตำแหน่งแบบ relative (ป้ายบนเส้น) ไม่แตะ */
export function stretchXY(xml, kx = 1, ky = 1) {
  if (kx === 1 && ky === 1) return String(xml);
  const s = (v, k) => String(Math.round(parseFloat(v) * k * 10) / 10);
  const xy = (tag) => tag.replace(/(\sx=")(-?[\d.]+)(")/, (_, a, v, b) => a + s(v, kx) + b).replace(/(\sy=")(-?[\d.]+)(")/, (_, a, v, b) => a + s(v, ky) + b);
  /* ‼️ draw.io เขียน height ก่อน width และตัด y ที่เป็น 0 ทิ้ง ห้ามเดาลำดับแอตทริบิวต์ แก้ทีละตัว (เคยจับกรอบไม่เจอ กล่องล้นกรอบ) */
  const size = (geo) => geo.replace(/(\swidth=")([\d.]+)(")/, (_, a, v, b) => a + s(v, kx) + b).replace(/(\sheight=")([\d.]+)(")/, (_, a, v, b) => a + s(v, ky) + b);
  return String(xml)
    .replace(/(<UserObject\b[^>]*\bmermaidId="n:g\d+"[^>]*>\s*<mxCell\b[^>]*>\s*)(<mxGeometry\b[^>]*>)/g, (_, pre, geo) => pre + size(geo))
    .replace(/<mxGeometry\b[^>]*>/g, (tag) => (/\srelative="1"/.test(tag) ? tag : xy(tag)))
    .replace(/<mxPoint\b[^>]*>/g, (tag) => (/\sas="offset"/.test(tag) ? tag : xy(tag)));
}

/* ‼️ กรอบกลุ่มซ้อนกัน draw.io คำนวณจุดเสียบเส้นเพี้ยน (จับค่าจริง 22/09/2026 engine_probe12 , engine_probe13)
 *    เส้น Compose → Send mail ในกรอบวนที่อยู่ในกรอบ Try ได้ entryY=1 คือเสียบก้นกล่องปลายทางทั้งที่กล่องอยู่ข้างล่าง เส้นจึงทะลุกล่อง
 *    และเส้นจากกรอบชั้นแรกดิ่งเข้ากล่องในกรอบชั้นที่สามก็โดนแบบเดียวกัน (ผัง nested3)
 *    กรอบชั้นเดียวได้ค่าถูกทุกเส้น (ผังที่พิมพ์ทุกชนิดมีกรอบชั้นเดียว ไม่โดนฟังก์ชันนี้) , ผังซ้อนมีแค่ผังจาก Power Automate
 *    จึงล้างจุดเสียบของเส้นที่แตะของในกรอบซ้อน (อยู่ในกรอบซ้อน หรือต้นทางปลายทางอยู่ลึกตั้งแต่ชั้นสอง) ให้ draw.io ลากจากขอบถึงขอบเอง */
export function fixNestedEdges(xml) {
  const s = String(xml);
  const attr = (tag, a) => { const m = tag.match(new RegExp(`\\s${a}="([^"]*)"`)); return m ? m[1] : null; };
  const parentOf = new Map(), groups = new Set();
  for (const m of s.matchAll(/(<UserObject\b[^>]*>)\s*(<mxCell\b[^>]*>)|<mxCell\b[^>]*>/g)) {
    const uo = m[1] || "", cell = m[2] || m[0];
    const id = attr(uo || cell, "id");
    parentOf.set(id, attr(cell, "parent"));
    if (/\bmermaidId="n:g\d+"/.test(uo)) groups.add(id);
  }
  /** จำนวนกรอบที่ครอบกล่องนี้อยู่ */
  const depth = (id) => { let n = 0; for (let p = parentOf.get(id); p && groups.has(p); p = parentOf.get(p)) n++; return n; };
  if (![...groups].some((g) => depth(g) > 0)) return s;
  const touchesNested = (tag) => { const p = attr(tag, "parent");
    return (groups.has(p) && depth(p) > 0) || depth(attr(tag, "source")) > 1 || depth(attr(tag, "target")) > 1; };
  return s.replace(/<mxCell\b[^>]*\bedge="1"[^>]*>/g, (tag) => (touchesNested(tag)
    ? tag.replace(/(\sstyle=")([^"]*)(")/, (_, a, st, b) => a + st.replace(/(^|;)(?:exit|entry)(?:X|Y|Dx|Dy|Perimeter)=[^;]*/g, "").replace(/^;+/, "") + b)
    : tag));
}

/* ผังองค์กรเส้นหักฉาก (พี่ปอนด์เลือกแบบ ค) มุมมน 22/09/2026 ภาพเทียบ .claude/evidence/flowkit-drawio-study-2026-09-22/org-sheet.png)
 *    เส้นโค้งจาก Mermaid ออกจากหลายจุดของกล่องหัวหน้า บางเส้นออกข้างกล่อง , หักฉากออกกลางก้นกล่อง ลงแนวนอนร่วมกัน แล้วลงกลางหัวกล่อง
 *    เปลี่ยนแค่สไตล์เส้นกับจุดหัก ตำแหน่งกล่องไม่แตะ ขนาดภาพจึงเท่าเดิม
 *    ‼️ จุดหักเดิมของ Mermaid ต้องล้าง (ถ้าเหลือไว้ เส้นหักฉากจะอ้อมไปตามจุดเก่า) แล้วใส่จุดใหม่จุดเดียวที่ทุกเส้นจากหัวหน้าคนเดียวกันใช้ร่วม
 *       ไม่งั้นลูกน้องที่กล่องสูงไม่เท่ากัน (ชื่อ | ตำแหน่ง สองบรรทัด) ได้เส้นแนวนอนคนละระดับ ดูเป็นขั้นบันได (เห็นจากภาพจริง bus-mixed.png)
 *    dir: "v" บนลงล่าง , "h" ซ้ายไปขวา (ดู edgeElbow ใน to-mermaid.js) ค่าอื่นคืน xml เดิม */
export function elbowEdges(xml, dir) {
  if (dir !== "v" && dir !== "h") return String(xml);
  const s = String(xml), v = dir === "v";
  const port = v ? "exitX=0.5;exitY=1;entryX=0.5;entryY=0" : "exitX=1;exitY=0.5;entryX=0;entryY=0.5";
  const look = `edgeStyle=elbowEdgeStyle;elbow=${v ? "vertical" : "horizontal"};rounded=1;${port};`;
  const drop = /(^|;)(?:curved|edgeStyle|elbow|rounded|noEdgeStyle|orthogonal|(?:exit|entry)(?:X|Y|Dx|Dy|Perimeter))=[^;]*/g;
  const attr = (tag, a) => { const m = tag.match(new RegExp(`\\s${a}="([^"]*)"`)); return m ? m[1] : null; };
  /* กล่องทุกกล่อง (ผังองค์กรไม่มีกรอบกลุ่ม ตำแหน่งจึงเป็นค่าบนผืนผังจริง , x y ที่เป็น 0 draw.io ไม่เขียน) */
  const box = new Map();
  for (const m of s.matchAll(/(?:<UserObject\b([^>]*)>\s*)?<mxCell\b([^>]*)>\s*<mxGeometry\b([^>]*)>/g)) {
    if (!/\svertex="1"/.test(m[2])) continue;
    const g = (a) => parseFloat(attr(m[3], a) || "0");
    box.set(attr(m[1] || m[2], "id"), { x: g("x"), y: g("y"), w: g("width"), h: g("height") });
  }
  /* จุดหักร่วมของหัวหน้าแต่ละคน: กึ่งกลางช่องว่างระหว่างขอบหัวหน้ากับลูกน้องที่อยู่ใกล้ที่สุด */
  const kids = new Map();
  for (const m of s.matchAll(/<mxCell\b[^>]*\bedge="1"[^>]*>/g)) {
    const p = box.get(attr(m[0], "source")), c = box.get(attr(m[0], "target"));
    if (p && c) kids.set(attr(m[0], "source"), [...(kids.get(attr(m[0], "source")) || []), c]);
  }
  const bend = (src) => {
    const p = box.get(src), cs = kids.get(src);
    if (!p || !cs) return "";
    const r = (n) => Math.round(n * 10) / 10;
    const pt = v ? { x: p.x + p.w / 2, y: (p.y + p.h + Math.min(...cs.map((c) => c.y))) / 2 }
                 : { x: (p.x + p.w + Math.min(...cs.map((c) => c.x))) / 2, y: p.y + p.h / 2 };
    return `<Array as="points"><mxPoint x="${r(pt.x)}" y="${r(pt.y)}"/></Array>`;
  };
  /* ‼️ เส้นแบบปิดในแท็กเดียว (/>) ห้ามกินเลยไปถึง </mxCell> ของกล่องถัดไป จึงเช็คด้วย lookbehind ก่อน */
  return s.replace(/<mxCell\b[^>]*\bedge="1"[^>]*>(?:(?<=\/>)|[\s\S]*?<\/mxCell>)/g, (cell) => {
    const pts = bend(attr(cell, "source"));
    return cell
      .replace(/(\sstyle=")([^"]*)(")/, (_, a, st, b) => { const rest = st.replace(drop, "").replace(/^;+|;+$/g, ""); return a + (rest ? rest + ";" : "") + look + b; })
      .replace(/<Array as="points">[\s\S]*?<\/Array>|<Array as="points"\s*\/>/g, "")
      .replace(/<mxGeometry\b([^>]*?)\s*\/>|<mxGeometry\b[^>]*>/, (tag, a) => (!pts ? tag : a !== undefined ? `<mxGeometry${a}>${pts}</mxGeometry>` : tag + pts));
  });
}

/** จำนวนกล่อง (รวมกรอบกลุ่ม) ใน xml ของ draw.io */
export const countVertices = (xml) => (String(xml).match(/vertex="1"/g) || []).length;

/** data URI ของ SVG (base64 หรือเข้ารหัส URL) เป็น Blob */
function svgBlob(uri) {
  const s = String(uri);
  if (!s.startsWith("data:image/svg+xml")) throw new EngineError("bad-png", "svg");
  const body = s.slice(s.indexOf(",") + 1);
  const text = /;base64,/.test(s.slice(0, 40)) ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0))) : decodeURIComponent(body);
  return new Blob([text], { type: "image/svg+xml" });
}

export function pngBlob(uri) {
  const head = "data:image/png;base64,";
  if (typeof uri !== "string" || !uri.startsWith(head)) throw new EngineError("bad-png");
  const bin = atob(uri.slice(head.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/**
 * @param {{ onState?: (s: "booting"|"slow"|"ready"|"unreachable"|"offline") => void }} opts
 * @returns {{ render, renderXml, relayout, exportSvg, retry(): void, boot(): Promise<void> }}
 */
export function createEngine({ onState = () => {} } = {}) {
  let frame = null, boot$ = null, ready = false, seq = 0;
  let running = false;                        // วาดทีละใบ (ดูคิวข้างล่าง)
  const waiters = new Set();
  /* ‼️ draw.io ดึงโฟกัสเข้าตัวเองทุกครั้งที่โหลดผัง (จับค่าจริง 22/09/2026: หลังวาดเสร็จ activeElement กลายเป็น iframe ตัววาด
     พิมพ์ต่อแล้วตัวอักษรหายหมด , เลือกเทมเพลตด้วยคีย์บอร์ดแล้วโฟกัสหาย) f.inert กันไม่อยู่เพราะเขาเรียก focus เองจากข้างใน
     ตัววาดตัวนี้ไม่มีวันให้ผู้ใช้โฟกัส จึงเด้งโฟกัสกลับไปที่เดิมทันทีที่มันได้โฟกัส ก่อนปุ่มถัดไปที่ผู้ใช้กดจะไปถึง
     ‼️ ฟังที่ blur ของหน้า ไม่ใช่ focus ของ iframe: โฟกัสที่เข้า iframe ต่างโดเมนจากข้างใน ไม่ยิง focus ที่ตัว iframe เลย
        (จับ event จริง: ได้แค่ focusout ของช่องพิมพ์ที่ relatedTarget เป็น null ตามด้วย blur ของหน้า) */
  let lastFocus = null;
  document.addEventListener("focusin", (e) => { if (e.target !== frame) lastFocus = e.target; });
  window.addEventListener("blur", () => setTimeout(() => {
    if (!frame || document.activeElement !== frame) return;   // สลับไปแอปอื่น หรือเข้าห้องแก้ไข (คนละ iframe) ไม่เกี่ยว
    if (lastFocus && lastFocus.isConnected && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
    else frame.blur();
  }, 0));

  window.addEventListener("message", (ev) => {
    if (!frame || ev.source !== frame.contentWindow || ev.origin !== ORIGIN || typeof ev.data !== "string") return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (!m || typeof m.event !== "string") return;
    const tag = m.message && m.message.fk;
    for (const w of waiters) if (w.event === m.event && (w.tag == null || tag == null || w.tag === tag)) { waiters.delete(w); w.done(m); }
  });

  /** รอ event ชื่อนี้ (ms = 0 คือรอได้เรื่อย ๆ จนกว่าจะ reset) */
  function wait(event, tag, ms) {
    return new Promise((resolve, reject) => {
      const w = { event, tag, done: (m) => { clearTimeout(t); resolve(m); }, fail: (e) => { clearTimeout(t); reject(e); } };
      const t = ms ? setTimeout(() => { waiters.delete(w); reject(new EngineError("timeout", event)); }, ms) : 0;
      waiters.add(w);
    });
  }
  function call(msg, event) {
    const tag = ++seq;
    const p = wait(event, tag, STEP_MAX_MS);
    frame.contentWindow.postMessage(JSON.stringify({ ...msg, fk: tag }), ORIGIN);
    return p;
  }

  function boot() {
    if (boot$) return boot$;
    const f = document.createElement("iframe");
    frame = f; ready = false;
    f.className = "fk-engine";
    f.title = "draw.io";
    f.tabIndex = -1;
    f.inert = true;                            // ‼️ ซ่อนแบบยังวาดอยู่ ไม่ใช่ display:none (Chrome หน่วง iframe ต่างโดเมนที่ถูกซ่อน)
    f.setAttribute("aria-hidden", "true");
    onState(navigator.onLine === false ? "offline" : "booting");
    const alive = () => frame === f && !ready;
    const slow = setTimeout(() => { if (alive() && navigator.onLine !== false) onState("slow"); }, BOOT_SLOW_MS);
    let dead = 0;
    f.addEventListener("load", () => {
      clearTimeout(dead);
      dead = setTimeout(() => { if (alive()) onState(navigator.onLine === false ? "offline" : "unreachable"); }, AFTER_LOAD_MS);
    });
    boot$ = wait("init", null, 0).then(() => {
      clearTimeout(slow); clearTimeout(dead);
      ready = true; onState("ready");
    });
    boot$.catch(() => {});                     // คนรอจริงคือ drawOnce ตัวนี้แค่กันเตือน unhandled
    f.src = DRAWIO + PARAMS;
    document.body.appendChild(f);
    return boot$;
  }

  /** ทิ้ง iframe ทั้งตัว คำขอที่ค้างอยู่ทุกตัวจบด้วย reset (event ค้างจาก iframe เก่าถูกกรองทิ้งเองเพราะ ev.source ไม่ตรง) */
  function reset() {
    if (frame) frame.remove();
    frame = null; boot$ = null; ready = false;
    for (const w of [...waiters]) { waiters.delete(w); w.fail(new EngineError("reset")); }
  }

  const PNG_OUT = { action: "export", format: "xmlpng", scale: 2, border: 16, background: "#ffffff" };

  /** งานหนึ่งชิ้น: วาดจาก Mermaid , วาด xml เดิม , จัดวางใหม่ , หรือส่งออก SVG */
  async function drawOnce(job) {
    await boot();
    if (job.xml) {
      /* ผังที่แก้ด้วยมือแล้ว วาดตามที่เป็น ไม่แตะฟอนต์หรือสีของผู้ใช้ */
      await call({ action: "load", autosave: 0, xml: job.xml }, "load");
      if (job.svg) {
        /* ‼️ xmlsvg ไม่ใช่ svg: แบบหลังไม่ฝังผังไว้ในไฟล์ เปิดกลับมาแก้ไม่ได้ (ยิงจริง engine_probe11 ไม่มี content=)
           embedFonts ฝัง Sarabun ในไฟล์ เปิดเครื่องที่ไม่มีฟอนต์แล้วไทยไม่เพี้ยน (เฟส 0 ข้อ จ) */
        const o = await call({ action: "export", format: "xmlsvg", embedImages: true, embedFonts: true, border: 16, background: "#ffffff" }, "export");
        return { svg: svgBlob(o.data) };
      }
      if (job.layout) {
        /* ‼️ จัดวางใหม่ด้วย mxHierarchicalLayout ของ draw.io ใช้ได้กับผังที่ไม่มีกรอบกลุ่มเท่านั้น
           ผังมีกลุ่มแล้วกล่องกระจายหลุดกรอบ เส้นตัดกันมั่ว (ยิงจริง engine_probe11 ภาพ shots/relayout-sheet.png) app.js เป็นคนกัน */
        await call({ action: "layout", layouts: [{ layout: "mxHierarchicalLayout", config: { orientation: "north", intraCellSpacing: 40, interRankCellSpacing: 60 } }] }, "layout");
        /* ‼️ ผังองค์กรเส้นหักฉาก: ตัวจัดวางเติม noEdgeStyle=1 กับจุดหักของมันเอง เส้นกลายเป็นเส้นเฉียง (ภาพจริง 22/09/2026
           .claude/evidence/flowkit-v156-2026-09-22/relayout-sheet.png) จึงเอา xml หลังจัดวางมาใส่เส้นหักฉากใหม่
           ทิศบนลงล่างเสมอ เพราะตัวจัดวางวางจากบนลงล่าง (orientation north) แม้ผังเดิมจะซ้ายไปขวา */
        if (/edgeStyle=elbowEdgeStyle/.test(job.xml)) {
          const laid = await call(PNG_OUT, "export");
          if (laid.xml) await call({ action: "load", autosave: 0, xml: elbowEdges(laid.xml, "v") }, "load");
        }
      }
      const o = await call(PNG_OUT, "export");
      return { png: pngBlob(o.data), xml: o.xml || job.xml };
    }
    const first = await call({ action: "load", autosave: 0, descriptor: { format: "mermaid", data: job.mermaid } }, "load");
    const got = countVertices(first.xml);
    if (job.expectBoxes && got < job.expectBoxes) throw new EngineError("incomplete", `${got}/${job.expectBoxes}`);
    const stretch = job.stretch || {};
    const xml = elbowEdges(stretchXY(fixNestedEdges(restyleGroups(restyleFont(first.xml))), stretch.x, stretch.y), job.elbow);
    await call({ action: "load", autosave: 0, xml }, "load");
    const out = await call(PNG_OUT, "export");
    return { png: pngBlob(out.data), xml: out.xml || xml };
  }

  /* ‼️ คิว: งานพรีวิว (พิมพ์รัว ๆ) เก็บแค่ใบล่าสุด แต่งานที่ผู้ใช้กดเอง (จัดวางใหม่ , โหลด SVG) ห้ามถูกทิ้ง
     ไม่งั้นกดแล้วเงียบเพราะพิมพ์ต่อพอดี */
  const queue = [];
  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift();
      try { job.resolve(await drawOnce(job)); }
      catch (e) { if (e && e.kind === "timeout") reset(); job.reject(e); }
    }
    running = false;
  }
  function enqueue(job, coalesce) {
    return new Promise((resolve, reject) => {
      if (coalesce) {
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].preview) { queue[i].resolve({ stale: true }); queue.splice(i, 1); }
      }
      queue.push({ ...job, preview: coalesce, resolve, reject });
      pump();
    });
  }

  return {
    /** elbow: "v" | "h" = เส้นหักฉากแบบผังองค์กร (edgeElbow ใน to-mermaid.js) , null = เส้นโค้งของ Mermaid */
    render(mermaid, expectBoxes = 0, stretch = {}, elbow = null) { return enqueue({ mermaid, expectBoxes, stretch, elbow }, true); },
    /** วาด xml ของ draw.io ที่มีอยู่แล้วเป็น PNG (ผังที่แก้ด้วยมือ กู้คืนหลังโหลดหน้าใหม่) */
    renderXml(xml) { return enqueue({ xml }, true); },
    /** จัดวางกล่องใหม่ทั้งผัง (ผังที่แก้ด้วยมือจนเละ) คืน PNG กับ xml ใหม่ */
    relayout(xml) { return enqueue({ xml, layout: true }, false); },
    /** ส่งออกเป็น SVG ที่ฝังทั้งฟอนต์และผัง (เปิดกลับมาแก้ใน draw.io ได้) */
    exportSvg(xml) { return enqueue({ xml, svg: true }, false); },
    /** เริ่มใหม่ทั้งตัว (ปุ่มลองใหม่ หรือเน็ตกลับมา) งานที่ค้างรอ iframe ตัวเก่าจบด้วย reset ไม่ค้างคิว */
    retry() { reset(); boot(); },
    boot,
  };
}
