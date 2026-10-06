// ─────────────────────────────────────────────────────────────────────────────
// แก้ "เฉพาะบางช่อง" ในไฟล์ .xlsx โดยไม่แตะส่วนอื่นเลย (สูตร ฟิลเตอร์ สไตล์ ความกว้างคอลัมน์ ชีตอื่น)
//
// ‼️ ทำไมไม่ใช้ SheetJS เขียนไฟล์กลับ
//    SheetJS ฉบับที่เรามีอ่านค่าเข้ามาเป็นตาราง แล้วเขียนออกเป็นไฟล์ใหม่ทั้งไฟล์ สไตล์และสูตรหายหมด
//    (ไฟล์ Pending VAT ของพี่ปอนด์มีคอลัมน์ Mapping เป็นสูตร =A479&F479 เขียนกลับจะกลายเป็นตัวเลขตายตัว)
//    เขียนทับไฟล์จริงของบริษัทด้วยวิธีนั้นไม่ได้ จึงแก้ตรงที่ XML ของชีตนั้นชีตเดียวแทน
//    ไฟล์อื่นใน zip ไม่ถูกแตะเลย และแถวที่ไม่มีการแก้ก็ไม่ถูกแตะ ทั้งหมดเก็บไบต์เดิม
//
// ‼️ ทำด้วยการตัดสตริง ไม่ใช้ DOMParser + XMLSerializer เพราะตัวหลังเขียน namespace
//    (x14ac, mc:Ignorable) ใหม่ได้ และ Excel จะฟ้อง "พบเนื้อหาที่มีปัญหา" ตอนเปิดไฟล์
// ─────────────────────────────────────────────────────────────────────────────
import { colLetter } from "./lookupkit.js";

const lettersToCol = (s) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// อักขระควบคุมที่ XML 1.0 ห้ามมี ถ้าหลุดเข้าไป Excel จะปฏิเสธไฟล์ทั้งไฟล์
const ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unesc(m[1]) : null;
};
const rmAttr = (tag, name) => tag.replace(new RegExp(`\\s${name}="[^"]*"`), "");

/** เลขซีเรียลของ Excel จากวันที่ (ใช้ส่วนวัน/เวลาตามเครื่องผู้ใช้ เหมือนที่เห็นบนหน้าจอ) */
export function serialOf(d, date1904 = false) {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (ms - epoch) / 86400000;
}

/** สไตล์ที่เป็นรูปแบบวันที่หรือยัง */
function isDateFormat(id, code) {
  if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
  if (!code) return false;
  const c = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(c) && !/^general$/i.test(c.trim());
}

/** ตารางสไตล์: รู้ว่า xf ลำดับไหนเป็นวันที่ และเพิ่ม xf วันที่ใหม่ได้ (โคลนจากของเดิม) */
function styleBook(xml) {
  const custom = new Map();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = +attr(m[0], "numFmtId");
    custom.set(id, attr(m[0], "formatCode"));
  }
  const a = xml.indexOf("<cellXfs");
  if (a < 0) return null;
  const aEnd = xml.indexOf(">", a);
  const b = xml.indexOf("</cellXfs>", aEnd);
  if (aEnd < 0 || b < 0) return null;
  const inner = xml.slice(aEnd + 1, b);
  const xfs = [];
  for (let i = 0; i < inner.length;) {
    const s = inner.indexOf("<xf", i);
    if (s < 0) break;
    const tagEnd = inner.indexOf(">", s);
    const selfClosed = inner[tagEnd - 1] === "/";
    const end = selfClosed ? tagEnd + 1 : inner.indexOf("</xf>", tagEnd) + 5;
    xfs.push(inner.slice(s, end));
    i = end;
  }
  const added = new Map();      // s เดิม → s ใหม่ที่เป็นวันที่
  return {
    isDate: (s) => {
      const x = xfs[s];
      if (!x) return false;
      const id = +(attr(x, "numFmtId") || 0);
      return isDateFormat(id, custom.get(id));
    },
    dateStyleFor(s) {
      if (added.has(s)) return added.get(s);
      let base = xfs[s] || xfs[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
      base = base.replace(/\snumFmtId="[^"]*"/, "").replace(/\sapplyNumberFormat="[^"]*"/, "")
        .replace(/^<xf/, '<xf numFmtId="14" applyNumberFormat="1"');
      xfs.push(base);
      added.set(s, xfs.length - 1);
      return xfs.length - 1;
    },
    render() {
      if (!added.size) return xml;
      const head = xml.slice(0, aEnd + 1).replace(/(<cellXfs\b[^>]*?\scount=")\d+(")/, `$1${xfs.length}$2`);
      return head + xfs.join("") + xml.slice(b);
    },
  };
}

/** หาไฟล์ XML ของชีตที่ชื่อนี้ผ่าน workbook.xml + rels (ไม่เดาจากเลขลำดับ เพราะชีตที่ถูกลบ/สลับที่ทำให้เลขไม่ตรง)
 *  คืน path ของชีต พร้อมลำดับชีต (localSheetId ของชื่อช่วงที่ผูกกับชีตนี้) */
async function sheetPathOf(zip, sheetName) {
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  let rid = null, index = -1, n = 0;
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    if (attr(m[0], "name") === sheetName) { rid = (m[0].match(/\s[\w]*:?id="([^"]*)"/g) || []).map((x) => x.match(/"([^"]*)"/)[1]); index = n; break; }
    n++;
  }
  if (!rid) throw new Error(`ไม่พบชีต “${sheetName}” ในไฟล์`);
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (rid.includes(attr(m[0], "Id"))) {
      const t = attr(m[0], "Target");
      return { path: resolvePart("xl/workbook.xml", t), index };
    }
  }
  throw new Error("หาไฟล์ของชีตไม่เจอ");
}

/** path เต็มใน zip ของเป้าหมายใน rels (เทียบกับโฟลเดอร์ของไฟล์ที่อ้าง รองรับ ../ และ path ที่ขึ้นต้นด้วย /) */
function resolvePart(from, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const parseRef = (ref) => {
  const m = String(ref).replace(/\$/g, "").match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  return m ? { c0: m[1], r0: +m[2], c1: m[3] || m[1], r1: +(m[4] || m[2]) } : null;
};

/** ขยายช่วง (ฟิลเตอร์ ตาราง) ให้ครอบแถวใหม่ เฉพาะช่วงที่เดิมจบตรงแถวข้อมูลสุดท้ายหรือเลยไปแล้ว
 *  ช่วงที่จบก่อนนั้น (ตารางย่อยกลางชีต) ไม่ใช่ของตารางนี้ ไม่แตะ */
function grownRef(ref, lastOld, newLast) {
  const p = parseRef(ref);
  if (!p || p.r1 < lastOld || p.r1 >= newLast) return null;
  return `${p.c0}${p.r0}:${p.c1}${newLast}`;
}

function parseRows(xml, from, to) {
  const rows = [];
  const re = /<row\b[^>]*>/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(xml)) && m.index < to) {
    const open = m[0];
    const num = +attr(open, "r");
    if (open.endsWith("/>")) { rows.push({ num, open, cells: null, raw: open }); re.lastIndex = m.index + open.length; continue; }
    const close = xml.indexOf("</row>", m.index);
    rows.push({ num, open, inner: xml.slice(m.index + open.length, close), raw: xml.slice(m.index, close + 6) });
    re.lastIndex = close + 6;
  }
  return rows;
}

function parseCells(inner) {
  const cells = [];
  const re = /<c\b[^>]*>/g;
  let m;
  while ((m = re.exec(inner))) {
    const open = m[0];
    const ref = attr(open, "r") || "";
    const col = lettersToCol(ref.replace(/\d+/g, ""));
    let end;
    if (open.endsWith("/>")) end = m.index + open.length;
    else end = inner.indexOf("</c>", m.index) + 4;
    cells.push({ col, open, xml: inner.slice(m.index, end) });
    re.lastIndex = end;
  }
  return cells;
}

/**
 * edits = [{ r: แถว (เริ่ม 1 ตามเลขแถวใน Excel), c: คอลัมน์ (เริ่ม 0), v: ค่า }]
 * คืน { bytes, stat: { written, skippedFormula, dateStyles }, applied: [{r,c,v}], skipped: [{r,c}] }
 *   ช่องที่มีสูตรอยู่ ไม่ถูกทับเด็ดขาด (นับใน skippedFormula) เพราะช่องที่ "ดูว่าง" แต่ในสูตรคืนค่าว่างมีของอยู่จริง
 * opts.appendFrom = แถวแรกที่เป็นแถวต่อท้ายใหม่ (เพิ่มแถว Addon) opts.styleRow = แถวต้นแบบ (แถวข้อมูลสุดท้าย)
 *   แถวใหม่ได้สไตล์ทุกช่องจากแถวต้นแบบ (ไม่ลอกค่า ไม่ลอกสูตร ไม่ลอกการซ่อน)
 *   และขยายช่วงฟิลเตอร์ ชื่อช่วงฟิลเตอร์ที่ Excel ซ่อนไว้ กับตาราง Excel ให้ครอบแถวใหม่
 *   ‼️ ไม่ขยายช่วงพวกนี้ แถวใหม่จะหลุดจากฟิลเตอร์ กดกรองแล้วไม่ถูกกรอง (Excel กรองเฉพาะในช่วง ref)
 */
export async function patchXlsx(JSZip, buf, sheetName, edits, opts = {}) {
  const zip = await JSZip.loadAsync(buf);
  const { path, index: sheetIndex } = await sheetPathOf(zip, sheetName);
  const xml = await zip.file(path).async("string");
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(wbXml);

  let sdOpen = xml.search(/<sheetData\b/);
  if (sdOpen < 0) throw new Error("โครงสร้างชีตที่ไม่รู้จัก (ไม่มี sheetData)");
  let head, tail, rowsFrom, rowsTo;
  const sdTagEnd = xml.indexOf(">", sdOpen);
  if (xml[sdTagEnd - 1] === "/") {                    // <sheetData/> ชีตว่าง
    head = xml.slice(0, sdOpen) + "<sheetData>"; tail = "</sheetData>" + xml.slice(sdTagEnd + 1);
    rowsFrom = rowsTo = 0;
  } else {
    const sdClose = xml.indexOf("</sheetData>");
    head = xml.slice(0, sdTagEnd + 1); tail = xml.slice(sdClose);
    rowsFrom = sdTagEnd + 1; rowsTo = sdClose;
  }
  const rows = rowsTo ? parseRows(xml, rowsFrom, rowsTo) : [];

  const stylesPath = "xl/styles.xml";
  const styles = edits.some((e) => e.v instanceof Date) && zip.file(stylesPath)
    ? styleBook(await zip.file(stylesPath).async("string")) : null;

  const byRow = new Map();
  for (const e of edits) {
    if (!byRow.has(e.r)) byRow.set(e.r, []);
    byRow.get(e.r).push(e);
  }
  const stat = { written: 0, skippedFormula: 0, dateStyles: 0 };
  const applied = [], skipped = [];
  let maxR = 0, maxC = 0;

  const rowMap = new Map(rows.map((r) => [r.num, r]));
  const { appendFrom = 0, styleRow = 0 } = opts;
  const tpl = appendFrom && styleRow && rowMap.get(styleRow)
    ? parseCells(rowMap.get(styleRow).inner || "").map((c) => ({ col: c.col, s: attr(c.open, "s") })).filter((c) => c.s != null)
    : [];
  let lastNew = 0;
  for (const [num, list] of byRow) {
    let row = rowMap.get(num);
    const fresh = !row;
    if (!row) { row = { num, open: `<row r="${num}">`, inner: "", raw: null, isNew: true }; rowMap.set(num, row); }
    const cells = parseCells(row.inner || "");
    if (fresh && appendFrom && num >= appendFrom) {
      // แถวใหม่ท้ายตาราง: ช่องว่างที่มีสไตล์ตามแถวต้นแบบ แล้วช่องที่เขียนจะคงสไตล์นั้นต่อเอง (เหมือนช่องที่มีอยู่แล้ว)
      for (const t of tpl) cells.push({ col: t.col, open: `<c s="${t.s}"/>`, xml: `<c r="${colLetter(t.col)}${num}" s="${t.s}"/>` });
      maxR = Math.max(maxR, num);
      if (tpl.length) maxC = Math.max(maxC, ...tpl.map((t) => t.col));
    }
    // ‼️ นับแถวต่อท้ายทุกแถว ไม่ใช่เฉพาะแถวที่สร้างใหม่ ไฟล์จริงมักมีแถวว่างที่จัดรูปแบบรอไว้ใต้ตาราง
    //    แถวใหม่ไปตกบนแถวพวกนั้น ถ้าไม่นับ ฟิลเตอร์จะไม่ขยาย
    if (appendFrom && num >= appendFrom) lastNew = Math.max(lastNew, num);
    for (const e of list) {
      const ref = `${colLetter(e.c)}${num}`;
      const old = cells.find((x) => x.col === e.c);
      if (old && /<f[\s>\/]/.test(old.xml)) { stat.skippedFormula++; skipped.push({ r: num, c: e.c }); continue; }
      let s = old ? attr(old.open, "s") : null;
      let body;
      const v = e.v;
      if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) continue;
        if (styles) {
          if (s == null || !styles.isDate(+s)) { s = String(styles.dateStyleFor(s == null ? 0 : +s)); stat.dateStyles++; }
        }
        body = `<c r="${ref}"${s != null ? ` s="${s}"` : ""}><v>${serialOf(v, date1904)}</v></c>`;
      } else if (typeof v === "number") {
        if (!Number.isFinite(v)) continue;
        body = `<c r="${ref}"${s != null ? ` s="${s}"` : ""}><v>${v}</v></c>`;
      } else if (typeof v === "boolean") {
        body = `<c r="${ref}"${s != null ? ` s="${s}"` : ""} t="b"><v>${v ? 1 : 0}</v></c>`;
      } else {
        const t = esc(String(v ?? "").replace(ILLEGAL, ""));
        body = `<c r="${ref}"${s != null ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`;
      }
      if (old) old.xml = body; else cells.push({ col: e.c, open: "", xml: body });
      stat.written++; applied.push({ r: num, c: e.c, v: e.v });
      maxR = Math.max(maxR, num); maxC = Math.max(maxC, e.c);
    }
    cells.sort((a, b) => a.col - b.col);
    // ‼️ spans เป็นแค่คำใบ้ความกว้างแถว ถ้าเราเติมคอลัมน์เกินช่วงนี้ ให้ทิ้งไปเลยดีกว่าปล่อยให้ผิด
    let open = rmAttr(row.open.replace(/\/>$/, ">"), "spans");
    row.raw = open + cells.map((c) => c.xml).join("") + "</row>";
  }

  const ordered = [...rowMap.values()].sort((a, b) => a.num - b.num);
  let out = head + ordered.map((r) => r.raw).join("") + tail;

  // ขอบเขตข้อมูลในชีต ถ้าเราเติมเกินขอบเดิมให้ขยาย (Excel ทนได้ถ้าไม่ตรง แต่เครื่องมืออื่นบางตัวใช้ค่านี้)
  const dim = out.match(/<dimension\b[^>]*\sref="([^"]*)"/);
  if (dim && maxR) {
    const m = dim[1].match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (m) {
      const c0 = m[1], r0 = +m[2];
      const c1 = lettersToCol(m[3] || m[1]), r1 = +(m[4] || m[2]);
      const nc = Math.max(c1, maxC), nr = Math.max(r1, maxR);
      if (nc !== c1 || nr !== r1) out = out.replace(dim[0], dim[0].replace(dim[1], `${c0}${r0}:${colLetter(nc)}${nr}`));
    }
  }

  // ขยายฟิลเตอร์ ชื่อช่วงฟิลเตอร์ และตาราง Excel ให้ครอบแถวใหม่
  if (lastNew) {
    const lastOld = appendFrom - 1;
    out = out.replace(/<autoFilter\b[^>]*\sref="([^"]*)"/, (m, ref) => {
      const g = grownRef(ref, lastOld, lastNew);
      return g ? m.replace(`ref="${ref}"`, `ref="${g}"`) : m;
    });
    const wbPath = "xl/workbook.xml";
    const wbx = await zip.file(wbPath).async("string");
    const wbNew = wbx.replace(/(<definedName\b[^>]*name="_xlnm\._FilterDatabase"[^>]*>)([^<]*)(<\/definedName>)/g, (m, open, body, close) => {
      if (+attr(open, "localSheetId") !== sheetIndex) return m;
      const bang = body.lastIndexOf("!");
      if (bang < 0) return m;
      const g = grownRef(body.slice(bang + 1), lastOld, lastNew);
      if (!g) return m;
      const abs = g.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
      return open + body.slice(0, bang + 1) + abs + close;
    });
    if (wbNew !== wbx) zip.file(wbPath, wbNew, { createFolders: false });
    const relsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const rels = await relsFile.async("string");
      for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
        if (!/\/table"?$/.test(attr(m[0], "Type") || "")) continue;
        const tPath = resolvePart(path, attr(m[0], "Target"));
        const tf = zip.file(tPath);
        if (!tf) continue;
        const tx = await tf.async("string");
        const open = (tx.match(/<table\b[^>]*>/) || [])[0];
        // ตารางที่มีแถวผลรวมท้ายตาราง ต่อแถวหลังแถวผลรวมไม่ได้ ไม่แตะ
        if (!open || +(attr(open, "totalsRowCount") || 0) > 0) continue;
        const g = grownRef(attr(open, "ref"), lastOld, lastNew);
        if (!g) continue;
        const old = attr(open, "ref");
        const tNew = tx.replace(open, open.replace(`ref="${old}"`, `ref="${g}"`))
          .replace(/(<autoFilter\b[^>]*\sref=")([^"]*)(")/, (mm, a, ref, b) => a + (grownRef(ref, lastOld, lastNew) || ref) + b);
        zip.file(tPath, tNew, { createFolders: false });
      }
    }
  }

  zip.file(path, out, { createFolders: false });
  if (styles && stat.dateStyles) zip.file(stylesPath, styles.render(), { createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { bytes, stat, applied, skipped };
}
