/* ── รวมหลาย query ของ Power Query ให้เหลือตัวเดียว และสร้าง query ที่ต่อยอดได้ ─────────
 * ไฟล์นี้เป็นตรรกะล้วน ไม่แตะ DOM เทสด้วย node ได้ (tests/pqcombine.test.mjs)
 * ทุกโค้ดที่ไฟล์นี้สร้าง เทสเอาไปผ่านตัวตรวจไวยากรณ์ M ของ Microsoft (@microsoft/powerquery-parser)
 *
 * ‼️ สิ่งที่พิสูจน์กับไฟล์งานจริงแล้วก่อนเขียนไฟล์นี้ (26/09/2026)
 *   ① ย้าย query เข้าไปเป็นบล็อก let ซ้อน โดยคัดลอกตรงตัว ความหมายไม่เปลี่ยน
 *      เพราะตั้งชื่อบล็อกให้ตรงกับชื่อ query เดิม ขั้นที่เหลือจึงอ้างชื่อเดิมได้ทุกบรรทัดโดยไม่ต้องแก้
 *   ② บรรทัดที่เริ่มอยู่กลางสตริง (SQL ที่เขียนหลายบรรทัด) ห้ามเยื้อง ไม่งั้นข้อความ SQL เปลี่ยน
 *   ③ query อื่นที่อ้างตัวที่ถูกยุบ ถ้าให้ไปชี้ query หลักแทน ผลเปลี่ยนเงียบได้
 *      เคสจริง: ตารางที่ต้องใช้ SITE_ID แบบดิบ แต่ query หลักตัดช่องว่างและทำตัวใหญ่ไปแล้ว 1,422 ค่า
 *      ค่าเริ่มต้นจึงเป็น คัดลอกบล็อกเข้าไปในตัวมันเอง ผลเท่าเดิมทุกแถว
 *   ④ รวมเป็นตัวเดียวไม่ได้ทำให้ดึง SQL น้อยลง (เอกสาร Microsoft: ทุกตารางที่โหลดรันสายของมันเอง)
 *      ที่ประหยัดจริงคือปิด Enable load ของ query พัก เครื่องมือจึงบอกเรื่องนี้ทุกครั้ง
 */

// ‼️ คำสงวนของ M ชื่อที่ตรงกับพวกนี้ต้องครอบ #"..." เสมอ
const M_KEYWORDS = new Set([
  "and", "as", "each", "else", "error", "false", "if", "in", "is", "let", "meta",
  "not", "otherwise", "or", "section", "shared", "then", "true", "try", "type",
]);

/** ชื่อที่ใช้เป็นตัวระบุได้ตรง ๆ คืนเดิม นอกนั้นครอบ #"..." */
export function mId(name) {
  const s = String(name ?? "");
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !M_KEYWORDS.has(s) ? s : `#"${s.replace(/"/g, '""')}"`;
}

/** ข้อความในโค้ด M ต้องทำครบ 3 ข้อ ไม่งั้นโค้ดพังทันทีที่ SQL มีอักขระพิเศษ
 *  ① " เขียนซ้อนเป็น ""  ② #( ที่มีอยู่จริงต้องเป็น #(#)(  ③ ขึ้นบรรทัดและ tab เป็น #(lf) #(cr) #(tab)
 *  (ลำดับสำคัญ ต้องแปลง #( ก่อน ไม่งั้น #(lf) ที่เพิ่งใส่จะโดนแปลงซ้ำ) */
export function mText(value) {
  const s = String(value ?? "")
    .replace(/#\(/g, "#(#)(")
    .replace(/"/g, '""')
    .replace(/\r\n/g, "#(cr,lf)")
    .replace(/\n/g, "#(lf)")
    .replace(/\r/g, "#(cr)")
    .replace(/\t/g, "#(tab)");
  return `"${s}"`;
}

/* ── ตัวแบ่งโค้ด M เป็นช่วง ─────────────────────────────────────────────
 * code = โค้ดจริง · str = สตริง "..." · qid = ชื่อในรูป #"..." · lc = // ถึงท้ายบรรทัด · bc = /* ... *\/
 * ต่อทุกช่วงกลับเข้าหากันต้องได้ต้นฉบับเป๊ะ (เทสยืนยัน) */
export function scanM(src) {
  const s = String(src ?? "");
  const out = [];
  const n = s.length;
  let i = 0;
  let codeStart = 0;
  const push = (type, a, b) => { if (b > a) out.push({ type, start: a, end: b }); };
  while (i < n) {
    const c = s[i];
    if (c === '"' || (c === "#" && s[i + 1] === '"')) {
      push("code", codeStart, i);
      const a = i;
      i += c === "#" ? 2 : 1;
      while (i < n) {
        if (s[i] === '"') {
          if (s[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      push(c === "#" ? "qid" : "str", a, i);
      codeStart = i;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      push("code", codeStart, i);
      const a = i;
      const j = s.indexOf("\n", i);
      i = j < 0 ? n : j;
      push("lc", a, i);
      codeStart = i;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      push("code", codeStart, i);
      const a = i;
      const j = s.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      push("bc", a, i);
      codeStart = i;
      continue;
    }
    i++;
  }
  push("code", codeStart, n);
  return out;
}

/** สำเนาที่ความยาวเท่าเดิม ช่วงที่ไม่ใช่โค้ดถูกแทนด้วยช่องว่าง (เก็บ \n ไว้) ใช้ค้นแบบ regex ได้ปลอดภัย
 *  keep = ชนิดช่วงที่ให้คงไว้นอกจาก code */
function maskOf(src, segs, keep = []) {
  let out = "";
  for (const g of segs) {
    const t = src.slice(g.start, g.end);
    out += g.type === "code" || keep.includes(g.type) ? t : t.replace(/[^\n]/g, " ");
  }
  return out;
}

/** แต่ละบรรทัดเริ่มอยู่กลางสตริง ชื่อ #"..." หรือคอมเมนต์บล็อกหรือเปล่า (บรรทัดแรกไม่มีทาง) */
export function linesStartInside(src) {
  const s = String(src ?? "");
  const segs = scanM(s).filter((g) => g.type === "str" || g.type === "qid" || g.type === "bc");
  const flags = [false];
  let k = 0;
  for (let p = s.indexOf("\n"); p >= 0; p = s.indexOf("\n", p + 1)) {
    const at = p + 1;
    while (k < segs.length && segs[k].end <= at) k++;
    flags.push(k < segs.length && segs[k].start < at && at < segs[k].end);
  }
  return flags;
}

/** เยื้องทุกบรรทัดที่มีตัวอักษร ยกเว้นบรรทัดที่เริ่มกลางสตริง (ข้อความ SQL จึงเหมือนเดิมทุกตัวอักษร) */
export function indentM(src, pad) {
  const s = String(src ?? "");
  const flags = linesStartInside(s);
  return s.split("\n").map((l, i) => (flags[i] || l === "" ? l : pad + l)).join("\n");
}

/** ถอยกลับของ indentM ใช้พิสูจน์ว่าบล็อกที่ย้ายเข้าไปยังเหมือนต้นฉบับทุกตัวอักษร */
export function dedentM(src, pad) {
  const s = String(src ?? "");
  const flags = linesStartInside(s);
  return s.split("\n").map((l, i) => {
    if (flags[i] || l === "") return l;
    if (!l.startsWith(pad)) throw new Error(`dedent: line ${i + 1} is not indented`);
    return l.slice(pad.length);
  }).join("\n");
}

/* ── ตัวอ่านโทเคนระดับโค้ด ────────────────────────────────────────────
 * ไม่ได้ parse เต็มภาษา ทำแค่พอแยก 4 อย่างที่ต้องใช้
 *   อ้างชื่อ query จริง · ชื่อขั้นใน let · ชื่อฟิลด์ใน record · การอ่านฟิลด์ [ชื่อ] */
const ID_RE = /[\p{L}_][\p{L}\p{N}\p{Mn}\p{Mc}_.]*/uy;

function tokenize(src) {
  const s = String(src ?? "");
  const segs = scanM(s);
  const toks = [];
  for (const g of segs) {
    if (g.type === "qid") {
      const raw = s.slice(g.start + 2, g.end - 1).replace(/""/g, '"');
      toks.push({ k: "id", v: raw, start: g.start, end: g.end, quoted: true });
      continue;
    }
    if (g.type !== "code") continue;
    let i = g.start;
    while (i < g.end) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      ID_RE.lastIndex = i;
      const m = ID_RE.exec(s);
      if (m && m.index === i && i + m[0].length <= g.end) {
        let v = m[0].replace(/\.+$/, "");
        toks.push({ k: "id", v, start: i, end: i + v.length });
        i += v.length;
        continue;
      }
      if (c === "=" && s[i + 1] === ">") { toks.push({ k: "p", v: "=>", start: i, end: i + 2 }); i += 2; continue; }
      if (c === "<" && s[i + 1] === ">") { toks.push({ k: "p", v: "<>", start: i, end: i + 2 }); i += 2; continue; }
      if (c === "<" && s[i + 1] === "=") { toks.push({ k: "p", v: "<=", start: i, end: i + 2 }); i += 2; continue; }
      if (c === ">" && s[i + 1] === "=") { toks.push({ k: "p", v: ">=", start: i, end: i + 2 }); i += 2; continue; }
      toks.push({ k: "p", v: c, start: i, end: i + 1 });
      i++;
    }
  }
  return toks;
}

/** อ่านโครงของโค้ด: ชื่อที่ถูกอ้าง ชื่อขั้น/ชื่อฟิลด์ที่ถูกนิยาม และจุดของ let ตัวนอกสุด */
function analyze(src) {
  const toks = tokenize(src);
  const stack = [];
  const used = [];
  const bound = new Set();
  let firstLet = -1;
  let firstCodeTok = null;
  for (let t = 0; t < toks.length; t++) {
    const tk = toks[t];
    const prev = toks[t - 1];
    const next = toks[t + 1];
    if (!firstCodeTok) firstCodeTok = tk;
    if (tk.k === "p") {
      if ("[({".includes(tk.v)) stack.push(tk.v);
      else if ("])}".includes(tk.v)) stack.pop();
      continue;
    }
    if (!tk.quoted && tk.v === "let") {
      if (firstLet < 0 && stack.length === 0) firstLet = t;
      stack.push("let");
      continue;
    }
    if (!tk.quoted && tk.v === "in") {
      while (stack.length && stack[stack.length - 1] !== "let") stack.pop();
      stack.pop();
      continue;
    }
    if (!tk.quoted && M_KEYWORDS.has(tk.v)) continue;
    const top = stack[stack.length - 1];
    const nextIsEq = next && next.k === "p" && next.v === "=";
    const prevOpens = !prev || (prev.k === "p" && (prev.v === "[" || prev.v === ",")) ||
      (prev.k === "id" && !prev.quoted && prev.v === "let");
    if (nextIsEq && prevOpens && (top === "let" || top === "[")) {
      if (top === "let") bound.add(tk.v);
      continue; // ชื่อขั้นใน let หรือชื่อฟิลด์ใน record ไม่ใช่การอ้าง
    }
    const fieldAccess = prev && prev.k === "p" && prev.v === "[" && next && next.k === "p" && next.v === "]";
    if (fieldAccess) continue; // [ชื่อ] คืออ่านฟิลด์ของแถว ไม่ใช่อ้าง query
    used.push(tk.v);
  }
  return { toks, used, bound, firstLet, firstCodeTok };
}

/** ชื่อ query (จาก names) ที่โค้ดนี้อ้างจริง ไม่นับที่อยู่ในสตริง คอมเมนต์ ชื่อฟิลด์ หรือถูกบังด้วยชื่อขั้นของตัวเอง */
export function findRefs(code, names) {
  const want = new Set(names);
  const { used, bound } = analyze(code);
  const out = new Set();
  for (const v of used) if (want.has(v) && !bound.has(v)) out.add(v);
  return out;
}

/* ── ตรวจว่าโค้ดดึงข้อมูลจากแหล่งภายนอกตรง ๆ หรือเปล่า และแหล่งไหน ────── */
const SOURCE_FN = /\b(Sql\.Databases?|Oracle\.Database|PostgreSQL\.Database|MySQL\.Database|Odbc\.(?:DataSource|Query)|OleDb\.(?:DataSource|Query)|SharePoint\.(?:Files|Contents|Tables)|Web\.(?:Contents|Page|BrowserContents)|File\.Contents|Folder\.(?:Files|Contents)|OData\.Feed|CommonDataService\.Database|Dataverse\.Contents|AnalysisServices\.Databases?|Snowflake\.Databases|GoogleBigQuery\.Database|AzureStorage\.\w+|PowerPlatform\.Dataflows|PowerBI\.Dataflows|Excel\.CurrentWorkbook)\s*\(/g;

/** คืนรายการแหล่ง เช่น [{ fn:"Sql.Database", key:"Sql.Database srv-a;SalesDB" }] (อ่านอาร์กิวเมนต์ที่เป็นข้อความตรง ๆ ได้) */
export function detectSources(code) {
  const s = String(code ?? "");
  const segs = scanM(s);
  const codeOnly = maskOf(s, segs); // หาเฉพาะในโค้ดจริง ข้อความใน SQL ที่บังเอิญมีคำว่า File.Contents( ไม่นับ
  const found = [];
  const re = new RegExp(SOURCE_FN.source, "g");
  let m;
  while ((m = re.exec(codeOnly))) {
    const fn = m[1];
    // อาร์กิวเมนต์อ่านจากต้นฉบับตำแหน่งเดียวกัน (สำเนาที่ปิดสตริงยาวเท่าต้นฉบับทุกตัวอักษร)
    let rest = s.slice(m.index + m[0].length);
    const args = [];
    const arg = /^\s*"((?:[^"]|"")*)"\s*(,|\))/;
    for (let k = 0; k < 2; k++) {
      const a = arg.exec(rest);
      if (!a) break;
      args.push(a[1].replace(/""/g, '"'));
      if (a[2] === ")") break;
      rest = rest.slice(a[0].length);
    }
    found.push({ fn, args, key: `${fn} ${args.join(";")}`.trim() });
  }
  return found;
}

/* ── อ่านโค้ดหลาย query ที่วางมา ──────────────────────────────────────
 * รับ 3 แบบ
 *   ① หัวบรรทัด // ชื่อ ตามด้วยโค้ด (แบบที่ได้ตอนคัดลอกหลาย query จาก Power Query Editor)
 *   ② section document: section X; shared ชื่อ = ...;
 *   ③ query เดียวไม่มีชื่อ
 * ‼️ บรรทัด // ที่อยู่ข้างใน let (ยังไม่ปิดด้วย in) ไม่ใช่หัว query แค่เป็นคอมเมนต์ธรรมดา */
export function parseQueries(text) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n");
  const segs = scanM(src);
  const codeOnly = maskOf(src, segs);
  // ‼️ ตอนอ่าน section ต้องเก็บชื่อ #"..." ไว้ ถ้าปิดเป็นช่องว่าง regex shared\s+ จะกลืนชื่อทิ้ง (เทสจับได้ 26/09)
  if (/^\s*section\s+[^;]*;/.test(codeOnly)) return parseSection(src, maskOf(src, segs, ["qid"]));

  // หาหัวบรรทัด // ที่อยู่นอก let ทุกชั้น
  const depthAt = letDepthMap(src);
  const lines = src.split("\n");
  const heads = [];
  let off = 0;
  const inside = linesStartInside(src);
  lines.forEach((line, i) => {
    const m = /^\/\/[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (m && !inside[i] && depthAt(off) === 0) heads.push({ line: i, name: m[1], off });
    off += line.length + 1;
  });
  if (!heads.length) {
    const code = src.trim();
    return { format: "single", queries: code ? [{ name: "", code }] : [] };
  }
  // หัวที่ไม่มีโค้ดคั่นก่อนหัวถัดไป = คอมเมนต์บรรทัดแรกของ query เดียวกัน ไม่ใช่ query ใหม่
  const real = [];
  for (let h = 0; h < heads.length; h++) {
    const cur = heads[h];
    const prev = real[real.length - 1];
    if (prev) {
      const between = lines.slice(prev.line + 1, cur.line).join("\n");
      if (!hasCode(between)) continue;
    }
    real.push(cur);
  }
  const queries = [];
  const pre = lines.slice(0, real[0].line).join("\n").trim();
  if (pre && hasCode(pre)) queries.push({ name: "", code: pre });
  real.forEach((h, k) => {
    const end = k + 1 < real.length ? real[k + 1].line : lines.length;
    const code = lines.slice(h.line + 1, end).join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
    queries.push({ name: h.name.replace(/^#"(.*)"$/, "$1").replace(/""/g, '"'), code });
  });
  return { format: "headers", queries };
}

function hasCode(text) {
  const segs = scanM(text);
  return /\S/.test(maskOf(text, segs));
}

/** คืนฟังก์ชันบอกความลึกของ let (เปิด let แล้วยังไม่เจอ in) ณ ตำแหน่งใด ๆ */
function letDepthMap(src) {
  const toks = tokenize(src);
  const marks = [];
  let d = 0;
  for (const t of toks) {
    if (t.k !== "id" || t.quoted) continue;
    if (t.v === "let") { d++; marks.push([t.start, d]); }
    else if (t.v === "in") { d = Math.max(0, d - 1); marks.push([t.start, d]); }
  }
  return (pos) => {
    let cur = 0;
    for (const [p, v] of marks) { if (p < pos) cur = v; else break; }
    return cur;
  };
}

function parseSection(src, codeOnly) {
  const queries = [];
  const head = /^\s*section\s+[^;]*;/.exec(codeOnly);
  let pos = head[0].length;
  while (pos < src.length) {
    const semi = codeOnly.indexOf(";", pos);
    const end = semi < 0 ? src.length : semi;
    const chunk = src.slice(pos, end);
    const chunkCode = codeOnly.slice(pos, end);
    pos = end + 1;
    const m = /^\s*(?:\[[^\]]*\]\s*)?(?:shared\s+)?/.exec(chunkCode);
    if (!/\S/.test(chunkCode)) continue;
    let rest = chunk.slice(m[0].length);
    let name;
    const q = /^#"((?:[^"]|"")*)"/.exec(rest);
    if (q) { name = q[1].replace(/""/g, '"'); rest = rest.slice(q[0].length); }
    else {
      const id = /^[\p{L}_][\p{L}\p{N}\p{Mn}\p{Mc}_.]*/u.exec(rest);
      if (!id) continue;
      name = id[0];
      rest = rest.slice(id[0].length);
    }
    const eq = /^\s*=/.exec(rest);
    if (!eq) continue;
    queries.push({ name, code: rest.slice(eq[0].length).trim() });
  }
  return { format: "section", queries };
}

/* ── ยุบ query ที่เลือกเข้าไปเป็นบล็อกใน query หลัก ─────────────────── */
const PAD = "    ";

/** ใส่บล็อกไว้บนสุดของ let ตัวนอกสุด ถ้า query ไม่ได้ขึ้นต้นด้วย let จะครอบ let ให้ */
export function insertBlocks(code, blocks, opts = {}) {
  const src = String(code ?? "");
  if (!blocks.length) return src;
  const note = opts.note || ((name) => `// from query ${name}`);
  const text = blocks.map((b) =>
    `${PAD}${note(b.name)}\n${PAD}${mId(b.name)} =\n${indentM(b.code, PAD + PAD)}`).join(",\n\n");
  const a = analyze(src);
  if (a.firstLet >= 0 && a.firstCodeTok === a.toks[a.firstLet]) {
    const at = a.toks[a.firstLet].end;
    return `${src.slice(0, at)}\n${text},\n${src.slice(at)}`;
  }
  // query ที่ไม่ใช่ let (เช่นฟังก์ชัน หรือนิพจน์เดียว) ครอบ let ให้ ชื่อผลลัพธ์ต้องไม่ชนชื่อบล็อก
  let out = "Result";
  const taken = new Set([...blocks.map((b) => b.name), ...a.bound]);
  for (let k = 2; taken.has(out); k++) out = `Result${k}`;
  return `let\n${text},\n\n${PAD}${out} =\n${indentM(src, PAD + PAD)}\nin\n${PAD}${out}`;
}

/**
 * queries: [{ name, code }] · main: ชื่อ query หลัก · inline: ชื่อที่จะยุบเข้าไป
 * dependents: "copy" = query อื่นที่อ้างตัวที่ถูกยุบ ได้บล็อกคัดลอกเข้าไปในตัวเอง (ผลเท่าเดิม)
 *             "keep" = ไม่แตะ แต่ query ที่มันอ้างต้องเก็บไว้ (ลบไม่ได้)
 * คืน { main, changed:[{name, code, why}], deletable, mustKeep, notes, error }
 */
export function mergeQueries(queries, opts) {
  const { main, inline = [], dependents = "copy", note } = opts || {};
  const byName = new Map(queries.map((q) => [q.name, q]));
  const names = queries.map((q) => q.name);
  if (!byName.has(main)) return { error: "main" };
  const pick = inline.filter((n) => n !== main && byName.has(n));
  if (!pick.length) return { error: "empty" };
  const refs = new Map(queries.map((q) => [q.name, findRefs(q.code, names.filter((n) => n !== q.name))]));

  // ตัวที่ถูกยุบห้ามอ้าง query หลัก (วนกลับเป็นวงกลม)
  const reachMain = (n, seen = new Set()) => {
    if (seen.has(n)) return false;
    seen.add(n);
    for (const r of refs.get(n) || []) if (r === main || (pick.includes(r) && reachMain(r, seen))) return true;
    return false;
  };
  const cyc = pick.filter((n) => reachMain(n));
  if (cyc.length) return { error: "cycle", names: cyc };

  // บล็อกที่ query หนึ่งต้องมี = ตัวที่ยุบซึ่งมันอ้าง บวกตัวที่ยุบซึ่งตัวนั้นอ้างต่อ เรียงตัวถูกอ้างขึ้นก่อน
  const need = (roots) => {
    const out = [];
    const seen = new Set();
    const visit = (n) => {
      if (seen.has(n)) return;
      seen.add(n);
      for (const r of refs.get(n) || []) if (pick.includes(r)) visit(r);
      out.push(n);
    };
    roots.forEach(visit);
    return out;
  };
  const block = (n) => ({ name: n, code: byName.get(n).code });

  const mainRoots = pick.filter((n) => refs.get(main).has(n));
  const mainNeed = need(mainRoots);
  const unused = pick.filter((n) => !mainNeed.includes(n));
  const mainCode = insertBlocks(byName.get(main).code, mainNeed.map(block), { note });

  const changed = [];
  const stillUsed = new Set();
  for (const q of queries) {
    if (q.name === main || pick.includes(q.name)) continue;
    const hits = pick.filter((n) => refs.get(q.name).has(n));
    if (!hits.length) continue;
    if (dependents === "copy") {
      changed.push({ name: q.name, code: insertBlocks(q.code, need(hits).map(block), { note }), uses: hits });
    } else {
      hits.forEach((n) => stillUsed.add(n));
      need(hits).forEach((n) => stillUsed.add(n));
    }
  }
  const mustKeep = pick.filter((n) => stillUsed.has(n) || unused.includes(n));
  const deletable = pick.filter((n) => !mustKeep.includes(n));
  const sources = new Set(detectSources(mainCode).map((s) => s.key));
  return {
    main: { name: main, code: mainCode },
    moved: mainNeed,
    changed,
    deletable,
    mustKeep,
    unused,
    sourceCount: sources.size,
  };
}

/** ผู้สมัครเริ่มต้นให้ยุบ: ตัวที่ query หลักอ้างตรง ๆ และตัวมันดึงจากแหล่งภายนอกเอง */
export function suggestInline(queries, main) {
  const names = queries.map((q) => q.name);
  const q = queries.find((x) => x.name === main);
  if (!q) return [];
  const refs = findRefs(q.code, names.filter((n) => n !== main));
  return queries.filter((x) => refs.has(x.name) && detectSources(x.code).length > 0).map((x) => x.name);
}

/** รวมผลเป็นข้อความเดียวรูป // ชื่อ (วางกลับเข้าเครื่องมือนี้ได้ และอ่านง่ายเวลาไล่แก้ทีละ query) */
export function joinQueries(list) {
  return list.map((q) => `// ${q.name}\n${q.code}`).join("\n\n") + "\n";
}

/* ── สร้าง query ใหม่จากรายการแหล่ง (ต่อยอดได้) ─────────────────────────
 * pattern "blocks"   = let ซ้อนหนึ่งบล็อกต่อแหล่ง ใส่ server กับ database ตรง ๆ แบบ query ปกติ (ค่าเริ่มต้น)
 * pattern "function" = ฟังก์ชันดึงหนึ่งแหล่งอยู่ในตัว query แล้วเรียกบรรทัดละแหล่ง แก้ต่อด้วยมือง่ายสุด
 * params = server กับ database เป็น parameter แก้ค่าได้ทั้งใน Desktop และบน Service โดยไม่แตะโค้ด
 */
export function buildFromSources(cfg) {
  const {
    sources = [], pattern = "blocks", labelColumn = "Source", params = false,
    keyColumns = [], text = {},
  } = cfg || {};
  const t = {
    source: (i, label) => `// source ${i}: ${label}`,
    fn: "// one source per call, adding a source means adding one line below",
    combine: "// stack every source into one table (columns are matched by name)",
    clean: "// trim spaces and upper case the key columns so matches line up",
    ...text,
  };
  const labels = uniqueLabels(sources.map((s, i) => String(s.label ?? "").trim() || `Source ${i + 1}`));
  const paramList = [];
  const serverArg = (s, i) => {
    if (!params) return [mText(s.server), mText(s.database)];
    const sv = `Server_${i + 1}`;
    const db = `Database_${i + 1}`;
    paramList.push({ name: sv, code: paramCode(s.server) }, { name: db, code: paramCode(s.database) });
    return [sv, db];
  };
  const lc = String(labelColumn ?? "").trim();
  const lines = ["let"];
  const steps = [];

  if (pattern === "function") {
    lines.push(`${PAD}${t.fn}`);
    lines.push(`${PAD}LoadSql = (server as text, database as text, sql as text, label as text) as table =>`);
    lines.push(`${PAD}${PAD}let`);
    lines.push(`${PAD}${PAD}${PAD}Source = Sql.Database(server, database, [Query = sql])${lc ? "," : ""}`);
    if (lc) lines.push(`${PAD}${PAD}${PAD}Labeled = Table.AddColumn(Source, ${mText(lc)}, each label, type text)`);
    lines.push(`${PAD}${PAD}in`);
    lines.push(`${PAD}${PAD}${PAD}${lc ? "Labeled" : "Source"},`);
    lines.push("");
    sources.forEach((s, i) => {
      const [sv, db] = serverArg(s, i);
      steps.push(`${PAD}${mId(labels[i])} = LoadSql(${sv}, ${db}, ${mText(s.sql)}, ${mText(labels[i])}),`);
    });
    lines.push(...steps, "");
  } else {
    sources.forEach((s, i) => {
      const [sv, db] = serverArg(s, i);
      lines.push(`${PAD}${t.source(i + 1, labels[i])}`);
      lines.push(`${PAD}${mId(labels[i])} =`);
      lines.push(`${PAD}${PAD}let`);
      lines.push(`${PAD}${PAD}${PAD}Source = Sql.Database(${sv}, ${db}, [Query = ${mText(s.sql)}])${lc ? "," : ""}`);
      if (lc) lines.push(`${PAD}${PAD}${PAD}Labeled = Table.AddColumn(Source, ${mText(lc)}, each ${mText(labels[i])}, type text)`);
      lines.push(`${PAD}${PAD}in`);
      lines.push(`${PAD}${PAD}${PAD}${lc ? "Labeled" : "Source"},`);
      lines.push("");
    });
  }

  const keys = keyColumns.map((k) => String(k).trim()).filter(Boolean);
  lines.push(`${PAD}${t.combine}`);
  lines.push(`${PAD}Combined = Table.Combine({${labels.map(mId).join(", ")}})${keys.length ? "," : ""}`);
  let last = "Combined";
  if (keys.length) {
    const ops = keys.map((k) => `{${mText(k)}, each if _ = null then null else Text.Upper(Text.Trim(Text.From(_))), type nullable text}`);
    lines.push(`${PAD}${t.clean}`);
    lines.push(`${PAD}Cleaned = Table.TransformColumns(Combined, {${ops.join(", ")}}, null, MissingField.Ignore)`);
    last = "Cleaned";
  }
  lines.push("in", `${PAD}${last}`);
  return { code: lines.join("\n"), params: paramList, labels };
}

function paramCode(value) {
  return `${mText(value)} meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]`;
}

function uniqueLabels(list) {
  const used = new Set();
  return list.map((base) => {
    let name = base;
    for (let k = 2; used.has(name); k++) name = `${base} ${k}`;
    used.add(name);
    return name;
  });
}

/** เรื่องที่ต้องบอกผู้ใช้ก่อนเอาไปวาง คืนเป็นรหัส ให้หน้าเครื่องมือแปลเป็นข้อความสองภาษาเอง */
export function buildWarnings(sources) {
  const out = [];
  sources.forEach((s, i) => {
    if (!String(s.server ?? "").trim()) out.push({ code: "noServer", i });
    if (!String(s.database ?? "").trim()) out.push({ code: "noDatabase", i });
    if (!String(s.sql ?? "").trim()) out.push({ code: "noSql", i });
  });
  const keys = new Set(sources.map((s) => `${String(s.server ?? "").trim().toLowerCase()};${String(s.database ?? "").trim().toLowerCase()}`));
  if (sources.length > 1 && keys.size > 1) out.push({ code: "privacy", n: keys.size });
  return out;
}
