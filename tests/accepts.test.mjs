/* ตรวจว่า accepts ในทะเบียน "ตรงกับของจริง" ที่เครื่องมือแต่ละตัวประกาศไว้ใน expect
 *
 * ทำไมต้องมี: หน้าแรกใช้ accepts เป็นตัวคัดว่า "ไฟล์ที่ลากมานี้ใช้กับเครื่องมือไหนได้บ้าง"
 * โดยไม่ต้องเปิดเครื่องมือ — ถ้าใครไปแก้ expect ในไฟล์เครื่องมือแล้วลืมแก้ทะเบียน
 * หน้าแรกจะเสนอเครื่องมือผิด (หรือไม่เสนอทั้งที่ใช้ได้) แบบเงียบ ๆ ไม่มีอะไรฟ้อง
 *
 * ตรวจแบบอ่านไฟล์ตรง ๆ ไม่ import — ทะเบียนพึ่ง localStorage ของเบราว์เซอร์อยู่ */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const list = (s) => s.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

// ตัดทะเบียนเป็นก้อน ๆ ที่ขึ้นต้นด้วย id:"..." แล้วอ่าน accepts ในก้อนนั้น
// (regex ก้อนเดียวยาว ๆ เคยกินข้ามรายการจนตกตัวแรกไป — ตัดตามตำแหน่ง id ชัวร์กว่า)
const reg = readFileSync(join(ROOT, "src/registry.js"), "utf8");
const marks = [...reg.matchAll(/\bid:\s*"([^"]+)"/g)];
const inRegistry = new Map();
marks.forEach((m, i) => {
  const chunk = reg.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : reg.length);
  const a = chunk.match(/accepts:\s*\[([^\]]*)\]/);
  inRegistry.set(m[1], a ? list(a[1]) : null);
});

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const toolFiles = readdirSync(join(ROOT, "src/tools")).filter((f) => f.endsWith(".js"));
ck(toolFiles.length > 0, `หาไฟล์เครื่องมือเจอ (${toolFiles.length} ไฟล์ — ประชากรต้องไม่เป็นศูนย์)`);

for (const f of toolFiles.sort()) {
  const id = f.slice(0, -3);
  const src = readFileSync(join(ROOT, "src/tools", f), "utf8");
  const m = src.match(/expect:\s*\[([^\]]*)\]/);
  const real = m ? list(m[1]) : null;
  const declared = inRegistry.get(id);

  if (!inRegistry.has(id)) { ck(false, `${id} — มีไฟล์เครื่องมือแต่ไม่มีในทะเบียน`); continue; }
  if (!real) { ck(declared === null, `${id} — ไม่ได้ประกาศ expect จึงต้องไม่มี accepts ในทะเบียน`); continue; }
  ck(declared !== null, `${id} — มี expect แล้วต้องมี accepts ในทะเบียนด้วย`);
  if (declared) {
    ck(JSON.stringify(declared) === JSON.stringify(real),
       `${id} — accepts ตรงกับ expect จริง (ทะเบียน ${JSON.stringify(declared)} · จริง ${JSON.stringify(real)})`);
  }
}

/* ‼️ ชนิดไฟล์ที่เครื่องมือ "ประกาศว่ารับ" ต้องเป็นชนิดที่ตัวแยกชนิดไฟล์รู้จักจริง
 *
 * บทเรียนแพง 21/09/2026 (จับได้ด้วยเบราว์เซอร์จริงตอนทำเครื่องมือข้อความเป็น PDF):
 *   เครื่องมือ 7 ตัวเขียน expect เป็น ["xlsx","xls","xlsm","csv","txt"] และ
 *   ["csv","txt","tsv","json","sql","log","md"] ซึ่งดูสมเหตุสมผลมาก
 *   แต่ detectType() ใน filetype.js รู้จักแค่ 9 ชนิด ไม่มี txt/tsv/json/sql/log/md/xlsm เลย
 *   ผลคือกล่องรับไฟล์เขียนบนหน้าจอเองว่ารับ ".txt" แล้วพอผู้ใช้ลากมาวางจริง
 *   ขึ้นว่า "ไฟล์นี้ไม่ใช่ชนิดที่รองรับ" — พังเงียบบนเว็บจริงโดยไม่มีอะไรฟ้องเลย
 *   (ชื่อชนิดที่ไม่มีจริงไม่ทำให้ error มันแค่ไม่เคย match อะไรเท่านั้น)
 *
 * ‼️ และตรวจย้อนอีกทาง: นามสกุลทุกตัวใน accept ของกล่อง (ตัวที่โชว์ในหน้าต่างเลือกไฟล์)
 *    ต้องเดินไปจบที่ชนิดที่อยู่ใน expect ได้จริง ไม่งั้นก็เป็นบั๊กหน้าตาเดียวกัน
 *    คือ "เลือกได้จากหน้าต่าง แต่พอเลือกแล้วโดนปฏิเสธ" */
{
  const ft = readFileSync(join(ROOT, "src/filetype.js"), "utf8");
  const typesBlock = ft.match(/export const TYPES\s*=\s*\{([\s\S]*?)\n\};/);
  ck(!!typesBlock, "อ่านตาราง TYPES จาก filetype.js ได้");
  const extOf = new Map();          // kind -> [".ext", ...]
  if (typesBlock) {
    for (const m of typesBlock[1].matchAll(/^\s*(\w+):\s*\{[^}]*ext:\s*\[([^\]]*)\]/gm)) {
      extOf.set(m[1], list(m[2]));
    }
  }
  const knownKinds = new Set([...extOf.keys()]);
  ck(knownKinds.size >= 9, `อ่านชนิดไฟล์จาก TYPES ได้ (${knownKinds.size} ชนิด — ประชากรต้องไม่เป็นศูนย์)`);
  // ชนิดที่ detectType เดาจาก MIME ได้เองแม้นามสกุลไม่ตรง
  const extToKind = new Map();
  for (const [kind, exts] of extOf) for (const e of exts) if (!extToKind.has(e)) extToKind.set(e, kind);

  const badKind = [], badAccept = [];
  for (const f of toolFiles.sort()) {
    const src = readFileSync(join(ROOT, "src/tools", f), "utf8");
    for (const dz of src.matchAll(/expect:\s*\[([^\]]*)\]/g)) {
      for (const k of list(dz[1])) if (!knownKinds.has(k)) badKind.push(`${f}: "${k}"`);
    }
    /* จับคู่ accept กับ expect ภายใน "ก้อน dropzone({...}) เดียวกัน" เท่านั้น
       ‼️ ครั้งแรกเขียนเป็น accept แล้วมองหา expect ตัวถัดไปในระยะ 400 ตัวอักษร
          ได้ผลบวกลวงทันทีที่ word-mailmerge ซึ่งมีสองกล่องติดกันและเขียน expect
          ไว้ "ก่อน" accept กล่องนั้นจึงไปจับคู่กับ expect ของกล่องถัดไปแทน
          ต้องนับวงเล็บปีกกาเอาขอบเขตก้อนจริง ไม่ใช่เดาจากระยะห่าง */
    for (const d of src.matchAll(/dropzone\(\{/g)) {
      let i = d.index + d[0].length - 1, depth = 0, end = i;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") { depth--; if (!depth) { end = i; break; } }
      }
      const blk = src.slice(d.index, end);
      const acc = blk.match(/accept:\s*"([^"]*)"/), exp = blk.match(/expect:\s*\[([^\]]*)\]/);
      if (!acc || !exp) continue;
      const want = new Set(list(exp[1]));
      for (const raw of acc[1].split(",").map((x) => x.trim().toLowerCase())) {
        if (!raw.startsWith(".")) continue;          // MIME เช่น application/pdf ข้ามไป
        const kind = extToKind.get(raw);
        if (!kind || !want.has(kind)) badAccept.push(`${f}: accept มี "${raw}" แต่ expect รับไม่ถึง`);
      }
    }
  }
  ck(badKind.length === 0,
     `ชนิดใน expect ต้องมีอยู่จริงใน TYPES ของ filetype.js (ผิด ${badKind.length})` +
     (badKind.length ? "\n      " + badKind.slice(0, 8).join("\n      ") : ""));
  ck(badAccept.length === 0,
     `นามสกุลใน accept ของกล่องต้องเดินไปจบที่ชนิดใน expect ได้ (ผิด ${badAccept.length})` +
     (badAccept.length ? "\n      " + badAccept.slice(0, 8).join("\n      ") : ""));
  // ‼️ พิสูจน์ว่าเครื่องตรวจจับได้จริง ไม่ใช่ผ่านเพราะหาไม่เจอ
  ck(!knownKinds.has("tsv") && !knownKinds.has("xlsm"),
     "เครื่องตรวจอ่านรายชื่อชนิดจากไฟล์จริง (ชื่อที่ไม่มีในตารางต้องไม่ถูกนับว่ามี)");
  ck(extToKind.get(".xlsm") === "xlsx" && extToKind.get(".txt") === "txt",
     `ตารางนามสกุลต้องชี้ถูกชนิด (.xlsm -> ${extToKind.get(".xlsm")} · .txt -> ${extToKind.get(".txt")})`);
}

/* ‼️ ตัวเลขจำนวนเครื่องมือที่เขียนค้างไว้ในหน้า HTML
   เพิ่มเครื่องมือจาก 27 เป็น 29 แล้วลืมแก้ในหน้า → ผู้ใช้เห็น "27" แวบหนึ่งก่อน JS แก้เป็น 29
   และ meta ตอนแชร์ลิงก์ (og:description / JSON-LD) ยังโฆษณาเลขเก่าค้างอยู่
   (พี่ปอนด์เห็นเองตอน Ctrl+Shift+R 08/09/2026) */
const html = readFileSync(join(ROOT, "index.html"), "utf8");
// ‼️ นับจากไฟล์เครื่องมือจริง ไม่ใช่ regex id: ในทะเบียน — ทะเบียนมี id ของ "หมวด" ปนอยู่ด้วย
//    (เขียนครั้งแรกด้วย regex แล้วได้ 37 = 29 เครื่องมือ + 8 หมวด → เทสฟ้องผิดจุด)
const toolCount = toolFiles.length;
ck(toolCount > 0, `นับเครื่องมือได้ (${toolCount} ตัว — ประชากรต้องไม่เป็นศูนย์)`);

const factN = html.match(/id="fact-n"[^>]*>(\d+)</);
ck(!!factN && +factN[1] === toolCount,
   `ตัวเลขบนฉากเปิด (id="fact-n") ต้องเท่ากับจำนวนเครื่องมือจริง (หน้าเขียน ${factN ? factN[1] : "ไม่เจอ"} · จริง ${toolCount})`);

for (const [what, re] of [
  ["og:description", /property="og:description"[^>]*content="(\d+)/],
  ["og:image:alt", /property="og:image:alt"[^>]*content="[^"]*?(\d+) เครื่องมือ/],
  ["JSON-LD description", /"description":"(\d+) เครื่องมือ/],
]) {
  const m = html.match(re);
  ck(!!m && +m[1] === toolCount, `${what} ต้องบอกจำนวนเครื่องมือให้ตรง (หน้าเขียน ${m ? m[1] : "ไม่เจอ"} · จริง ${toolCount})`);
}

/* ‼️ กฎถาวรของโปรเจกต์: ห้ามใช้จุดกลาง (·) ในข้อความที่ผู้ใช้เห็น
   เจ้าของเว็บบอกซ้ำ 3 ครั้งแล้วยังหลุดกลับมาทุกรอบ — กฎที่ไม่มีเครื่องบังคับก็ลืมเสมอ
   (บทเรียนเดียวกับ W41: สิ่งที่กันได้จริงคือเครื่องจับ ไม่ใช่ความตั้งใจ)
   ตรวจเฉพาะ "ข้อความในเครื่องหมายคำพูด" — คอมเมนต์ในโค้ดใช้ได้ตามสบาย */
/* ‼️ รุ่นแรกจับด้วย regex "ข้อความในเครื่องหมายคำพูด" ทีละบรรทัด — พลาดของจริงมาแล้ว
   `ล้างเสร็จ ${n} ไฟล์${k ? ` · ข้าม ${k}` : ""}` (word-clean.js) มี backtick ซ้อนใน ${...}
   regex จับคู่ผิดคู่ ทำให้จุดกลางไปตกอยู่ "นอกคู่ที่จับได้" แล้วรอดสายตาไปเฉย ๆ
   จึงเปลี่ยนมาเดินอ่านทีละตัวอักษรและจำสถานะจริง (อยู่ในสตริง/คอมเมนต์/ข้างนอก)
   ซึ่งรองรับ template ซ้อนชั้นได้ถูกต้อง — บทเรียน "พิสูจน์เครื่องมือตรวจก่อนเชื่อผล" */
const prevOf = (txt, i) => { let k = i - 1; while (k >= 0 && /\s/.test(txt[k])) k--; return k >= 0 ? txt[k] : ""; };

function middotsInStrings(txt) {
  const hits = [];
  let line = 1, mode = "code", quote = "", depth = 0;
  const stack = [];                       // ชั้นของ template ที่ซ้อนกันผ่าน ${...}
  let prev = "";                          // อักขระที่มีความหมายตัวก่อนหน้า ใช้แยก regex ออกจากการหาร
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i], n = txt[i + 1];
    if (c === "\n") line++;
    if (mode === "code" && !/\s/.test(c) && !(c === "/" && (n === "/" || n === "*"))) {
      if (i > 0) prev = prevOf(txt, i);
    }
    if (mode === "line") { if (c === "\n") mode = "code"; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i++; } continue; }
    if (mode === "str") {
      if (c === "\\") { i++; continue; }
      if (c === quote) { mode = "code"; continue; }
      if (quote === "`" && c === "$" && n === "{") { stack.push({ quote, depth }); mode = "code"; depth = 1; i++; continue; }
      if (c === "\u00b7") hits.push(line);
      continue;
    }
    // mode === "code"
    if (c === "/" && n === "/") { mode = "line"; i++; continue; }
    if (c === "/" && n === "*") { mode = "block"; i++; continue; }
    /* ‼️ ต้องข้าม regex literal ให้เป็น ไม่งั้นเครื่องตรวจตัวนี้เชื่อไม่ได้ทั้งไฟล์
       ของจริงที่ทำพัง: .replace(/"/g, '""') ใน src/pqm.js — เครื่องหมายคำพูดข้างใน regex
       ถูกนับเป็น "เปิดสตริง" สถานะจึงสลับผิดตั้งแต่จุดนั้นไปจนจบไฟล์ ผลคือทั้งฟ้องคอมเมนต์
       ที่ไม่ผิด และ (อันตรายกว่า) ปล่อยจุดกลางในสตริงจริงที่อยู่หลังจุดนั้นผ่านไปได้
       แยก regex จากเครื่องหมายหารด้วยตัวอักษรที่มีความหมายตัวก่อนหน้า ซึ่งพอสำหรับโค้ดชุดนี้ */
    if (c === "/" && !"})]".includes(prev) && !/[\w$]/.test(prev)) {
      let j = i + 1, cls = false;
      for (; j < txt.length; j++) {
        const r = txt[j];
        if (r === "\\") { j++; continue; }
        if (r === "\n") break;                 // ขึ้นบรรทัดใหม่แปลว่าไม่ใช่ regex จริง
        if (r === "[") cls = true;
        else if (r === "]") cls = false;
        else if (r === "/" && !cls) { for (let k = 0; k < (j - i); k++) if (txt[i + k] === "\n") line++; i = j; break; }
      }
      if (i === j) continue;                    // ข้ามทั้งก้อน regex แล้ว
    }
    if (c === '"' || c === "'" || c === "`") { mode = "str"; quote = c; continue; }
    if (stack.length) {
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { const top = stack.pop(); quote = top.quote; depth = top.depth; mode = "str"; }
    }
  }
  return hits;
}
const middotHits = [];
for (const f of [...toolFiles.map((n) => join("src/tools", n)),
                 ...readdirSync(join(ROOT, "src")).filter((n) => n.endsWith(".js")).map((n) => join("src", n))]) {
  const txt = readFileSync(join(ROOT, f), "utf8");
  const lines = txt.split("\n");
  for (const ln of middotsInStrings(txt)) middotHits.push(`${f}:${ln} ${lines[ln - 1].trim().slice(0, 46)}`);
}
/* พิสูจน์ว่าเครื่องตรวจจับของจริงได้ ไม่ใช่ผ่านเพราะมองไม่เห็น (ประชากรต้อง > 0) */
{
  const bait = 'const a = `x ${n} y${k ? ` \u00b7 z ${k}` : ""}`;  // \u00b7 ในคอมเมนต์ต้องไม่โดนจับ\nconst b = "ปกติ";';
  ck(middotsInStrings(bait).length === 1, "เครื่องตรวจจุดกลางจับ template ซ้อนชั้นได้ และไม่จับจุดกลางในคอมเมนต์");
}
/* ‼️ กับดักของจริงที่เคยทำให้เครื่องตรวจตัวนี้ตาบอดทั้งไฟล์ (เจอ 09/09/2026 ใน src/pqm.js)
   regex ที่มีเครื่องหมายคำพูดอยู่ข้างใน ถ้าเครื่องตรวจไม่รู้จัก regex จะนับว่าเป็นการเปิดสตริง
   สถานะสลับผิดตั้งแต่จุดนั้น แล้วจุดกลางในสตริงจริงที่อยู่ถัดไปจะรอดสายตาไปเงียบ ๆ */
{
  const bait = 'const f = (s) => String(s).replace(/"/g, \'""\').replace(/\'/g, "");\n'
             + 'const msg = "เสร็จ \u00b7 ข้าม 2 ไฟล์";\n'
             + '/* \u00b7 ในคอมเมนต์ต้องไม่โดนจับ */';
  const hit = middotsInStrings(bait);
  ck(hit.length === 1 && hit[0] === 2, "เครื่องตรวจยังจับจุดกลางในสตริงที่อยู่หลัง regex ที่มีเครื่องหมายคำพูดได้");
}
const htmlBody = html.slice(html.indexOf("<body"));
const htmlMiddot = (htmlBody.match(/>[^<]*\u00b7[^<]*</g) || []).map((x) => "index.html " + x.slice(0, 46));
ck(middotHits.length + htmlMiddot.length === 0,
   `ห้ามมีจุดกลาง (·) ในข้อความที่ผู้ใช้เห็น (พบ ${middotHits.length + htmlMiddot.length})` +
   (middotHits.length + htmlMiddot.length ? "\n      " + [...middotHits, ...htmlMiddot].slice(0, 6).join("\n      ") : ""));

/* ‼️ กำแพงความปลอดภัย 2 ชั้นที่ "พังเงียบ" ได้ง่ายมากถ้าไม่มีเครื่องจับ
   ① SRI: ลายนิ้วมือไฟล์ไลบรารีบน CDN ใน src/loader.js — ถ้าใครขยับเลขเวอร์ชันแล้วลืมคำนวณใหม่
      ตาข่ายรองรับ (ตอน vendor/ พัง) จะโหลดไม่ได้เลย และจะรู้ตัวก็ต่อเมื่อผู้ใช้เจอของจริง
   ② CSP: หน้าเว็บมีสคริปต์สั้น ๆ ฝังอยู่ 2 ก้อน (ตั้งธีม/ภาษาก่อนวาดจอ) ที่ต้องมี sha256 อยู่ใน
      Content-Security-Policy — แก้สคริปต์นั้นแม้แต่ตัวอักษรเดียวโดยไม่อัปเดตค่า = หน้าเว็บพังทั้งหน้า
   ทั้งสองข้อคำนวณเองแล้วเทียบ ไม่ใช่จำค่าไว้ในเทส (ค่าที่จำไว้เฉย ๆ ก็ลืมอัปเดตได้เหมือนกัน) */
{
  const loader = readFileSync(join(ROOT, "src/loader.js"), "utf8");
  const cdnUrls = [...loader.matchAll(/cdn:\s*"([^"]+)"/g)].map((m) => m[1]);
  const sriBlock = loader.slice(loader.indexOf("const SRI = {"), loader.indexOf("function injectScript"));
  ck(cdnUrls.length > 0, `หา CDN ใน loader.js เจอ (${cdnUrls.length} ตัว — ประชากรต้องไม่เป็นศูนย์)`);
  const missing = cdnUrls.filter((u) => !sriBlock.includes(`"${u}"`));
  ck(missing.length === 0,
     `ทุกไลบรารีที่ตกไปโหลดจาก CDN ต้องมีลายนิ้วมือ SRI กำกับ (ขาด ${missing.length})` +
     (missing.length ? "\n      " + missing.slice(0, 3).join("\n      ") : ""));

  const hosts = [...new Set(cdnUrls.map((u) => new URL(u).origin))];
  const csp = (html.match(/http-equiv="Content-Security-Policy"[^>]*content="([\s\S]*?)"/) || [])[1] || "";
  ck(!!csp, "หน้าเว็บประกาศ Content-Security-Policy ไว้");
  const hostMissing = hosts.filter((h) => !csp.includes(h));
  ck(hostMissing.length === 0,
     `โดเมน CDN ทุกตัวต้องอยู่ใน CSP ด้วย ไม่งั้นตาข่ายรองรับถูกบล็อกเอง (ขาด ${hostMissing.join(", ") || "ไม่มี"})`);

  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  ck(inline.length > 0, `หาสคริปต์ฝังในหน้าเจอ (${inline.length} ก้อน — ประชากรต้องไม่เป็นศูนย์)`);
  const hashMissing = inline
    .map((body) => "sha256-" + createHash("sha256").update(body, "utf8").digest("base64"))
    .filter((h) => !csp.includes(h));
  ck(hashMissing.length === 0,
     `สคริปต์ฝังในหน้าทุกก้อนต้องมี sha256 อยู่ใน CSP (ขาด ${hashMissing.length})` +
     (hashMissing.length ? "\n      ค่าที่ควรใส่: " + hashMissing.join(" ") : ""));
}

/* ‼️ เพิ่มเครื่องมือใหม่แล้วลืมใส่คำแปลอังกฤษ = ชื่อกับคำอธิบายเป็นไทยค้างอยู่ในโหมดอังกฤษ
   เดิมจับได้ด้วย tests/browser_lang.py เท่านั้น ซึ่งต้องเปิดเบราว์เซอร์และรอเป็นนาที
   (พลาดจริงตอนเพิ่มเครื่องมือ 3 ตัว 09/09/2026) · เช็คจากไฟล์ตรง ๆ รู้ผลในเสี้ยววินาที */
{
  const reg = readFileSync(join(ROOT, "src/registry.js"), "utf8");
  const ids = [...reg.matchAll(/\{ id:"([\w-]+)"/g)].map((m) => m[1]);
  const enBlock = reg.slice(reg.indexOf("TOOL_EN") >= 0 ? reg.indexOf("TOOL_EN") : 0);
  const translated = new Set([...reg.matchAll(/^ {2}"([\w-]+)":\s+\[/gm)].map((m) => m[1]));
  ck(ids.length === toolCount,
     `ทะเบียนมีเครื่องมือครบเท่าไฟล์จริง (ทะเบียน ${ids.length} · ไฟล์ ${toolCount})`);
  /* ‼️ ไอคอนก็เหมือนคำแปล — เพิ่มเครื่องมือแล้วลืมวาดไอคอน ระบบจะตกกลับไปใช้อีโมจิใน
     ทะเบียนแทน ซึ่งผิดหลักหน้าตาของเว็บนี้ทั้งเว็บ (ไอคอนเส้นวาดเองทั้งหมด ไม่ใช้อีโมจิ)
     เดิมจับได้ด้วย tests/browser_noemoji.py ซึ่งต้องเปิดทุกหน้าเครื่องมือรอเป็นนาที */
  const icons = readFileSync(join(ROOT, "src/icons.js"), "utf8");
  const drawn = new Set([...icons.matchAll(/^ {2}"([\w-]+)":\s*`/gm)].map((m) => m[1]));
  const noIcon = ids.filter((i) => !drawn.has(i));
  ck(noIcon.length === 0,
     `เครื่องมือทุกตัวต้องมีไอคอนเส้นวาดเองใน icons.js (ขาด ${noIcon.length})` +
     (noIcon.length ? "\n      " + noIcon.join(", ") : ""));

  const noEn = ids.filter((i) => !translated.has(i));
  ck(noEn.length === 0,
     `เครื่องมือทุกตัวต้องมีคำแปลอังกฤษในทะเบียน (ขาด ${noEn.length})` +
     (noEn.length ? "\n      " + noEn.join(", ") : ""));
  void enBlock;
}

/* ‼️ Safari รู้จัก backdrop-filter แบบไม่มี prefix ตั้งแต่รุ่น 18 เท่านั้น (ปลายปี 2024)
   คนที่ยังใช้รุ่นเก่ากว่านั้นจะไม่ได้เบลอเลย ซึ่งไม่ใช่แค่สวยน้อยลง — พื้นหลังโปร่ง 12-18%
   ที่ไม่ถูกเบลอทำให้ตัวหนังสือทับกับภาพข้างหลังจนอ่านไม่ออก
   เครื่องนี้ทดสอบ WebKit จริงไม่ได้ (ลง system library ไม่ได้เพราะต้องใช้ sudo)
   จึงต้องกันด้วยการตรวจโค้ดแทน — ทุกจุดที่ใช้ต้องมีคู่ -webkit- เสมอ */
{
  const cssFiles = ["index.html", "assets/css/tool.css",
    ...toolFiles.map((n) => join("src/tools", n)),
    ...readdirSync(join(ROOT, "src")).filter((n) => n.endsWith(".js")).map((n) => join("src", n))];
  const missing = [];
  let found = 0;
  for (const f of cssFiles) {
    const txt = readFileSync(join(ROOT, f), "utf8");
    const lines = txt.split("\n");
    lines.forEach((ln, i) => {
      const t = ln.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (!/(?<!-webkit-)backdrop-filter\s*:/.test(ln)) return;
      found++;
      const nearby = lines.slice(i, i + 2).join("\n");
      if (!nearby.includes("-webkit-backdrop-filter")) missing.push(`${f}:${i + 1}`);
    });
  }
  ck(found > 0, `หา backdrop-filter เจอ (${found} จุด — ประชากรต้องไม่เป็นศูนย์)`);
  ck(missing.length === 0,
     `backdrop-filter ทุกจุดต้องมีคู่ -webkit- ให้ Safari รุ่นก่อน 18 (ขาด ${missing.length})` +
     (missing.length ? "\n      " + missing.join(", ") : ""));
}

/* ‼️ CSP ของหน้าเว็บไม่มี 'unsafe-eval' (โดยเจตนา) — Playwright จะไปใช้ eval() ในหน้าเว็บ
   ทันทีที่ wait_for_function ได้รับ "นิพจน์เปล่า" แทน "ฟังก์ชันลูกศร" ผลคือเทสตายทั้งไฟล์
   ด้วย EvalError ซึ่งอ่านแล้วดูเหมือนเว็บพัง ทั้งที่เว็บปกติ (เจอจริง 09/09/2026)
   กันไว้ด้วยเครื่องตรวจ เพราะกฎที่ต้องจำจะลืมตอนเขียนเทสใหม่แน่นอน */
{
  const pyFiles = readdirSync(join(ROOT, "tests")).filter((n) => n.endsWith(".py"));
  const bare = [];
  for (const f of pyFiles) {
    const txt = readFileSync(join(ROOT, "tests", f), "utf8");
    // จับอาร์กิวเมนต์ตัวแรกที่เป็นสตริง หลัง wait_for_function( (รองรับขึ้นบรรทัดใหม่และ f-string)
    for (const m of txt.matchAll(/wait_for_function\(\s*(?:#[^\n]*\n\s*)*f?["']([^"']{0,40})/g)) {
      const head = m[1].trimStart();
      if (!head.startsWith("() =>") && !head.startsWith("()=>") && !/^\([\w\s,]*\)\s*=>/.test(head))
        bare.push(`${f}: ${m[1].slice(0, 30)}`);
    }
  }
  ck(pyFiles.length > 0, `หาไฟล์เทสเบราว์เซอร์เจอ (${pyFiles.length} ไฟล์ — ประชากรต้องไม่เป็นศูนย์)`);
  ck(bare.length === 0,
     `wait_for_function ทุกจุดต้องส่งฟังก์ชันลูกศร ไม่ใช่นิพจน์เปล่า (CSP บล็อก eval) พบผิด ${bare.length}` +
     (bare.length ? "\n      " + bare.slice(0, 5).join("\n      ") : ""));
}

/* ‼️ [hidden] ของเบราว์เซอร์เป็นกฎระดับ user-agent ซึ่งแพ้ display ที่เราเขียนเองเสมอ
   ผลคือ el.hidden = true ไม่ซ่อนอะไรเลยบน .field (display:grid) และ .actions (display:flex)
   วัดจริง 09/09/2026 เจอปุ่มลงมือทำของ excel-split, excel-merge, sheetpick โผล่ทั้งที่สั่งซ่อน
   กติกา: ต้องมีกฎกลาง [hidden]{display:none !important} และห้ามมีใครเขียน display อื่นทับ */
{
  const shell = readFileSync(join(ROOT, "index.html"), "utf8");
  ck(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(shell),
     "index.html ต้องมีกฎกลาง [hidden]{display:none !important} (กัน display ของเราทับกฎซ่อนของเบราว์เซอร์)");

  const scan = ["index.html", "assets/css/tool.css",
    ...toolFiles.map((n) => join("src/tools", n)),
    ...readdirSync(join(ROOT, "src")).filter((n) => n.endsWith(".js")).map((n) => join("src", n))];
  const bad = [];
  for (const f of scan) {
    // ตัดคอมเมนต์ทิ้งก่อน ไม่งั้นคำอธิบายที่พูดถึง [hidden] จะถูกจับเป็นกฎ CSS (เจอจริงตอนเขียนเทสนี้)
    const txt = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of txt.matchAll(/\[hidden\][^{}]*\{([^}]*)\}/g)) {
      const decl = m[1];
      const d = /display\s*:\s*([^;!}]+)/.exec(decl);
      if (d && d[1].trim() !== "none") bad.push(`${f}: display:${d[1].trim()}`);
    }
  }
  ck(bad.length === 0,
     `ห้ามมีกฎไหนตั้ง display ให้ [hidden] เป็นอย่างอื่นนอกจาก none (พบ ${bad.length})` +
     (bad.length ? "\n      " + bad.join("\n      ") : ""));
}

/* ‼️ ไวยากรณ์พังในโมดูลใดโมดูลหนึ่ง = ทั้งเว็บพังตอนโหลด แต่เทสที่อ่านไฟล์เป็นข้อความจับไม่ได้เลย
   (11/09/2026 แทรกชื่อไฟล์ด้วย one-liner แล้วจุลภาคหาย เทสข้อความยังเขียวครบ
    กว่าจะรู้ตัวคือตอนเทสออฟไลน์แดง 9 ข้อ ซึ่งใช้เวลาเป็นนาที)
   ‼️ `node --check` ใช้ไม่ได้ ลองแล้วมันปล่อยผ่านไฟล์ที่มีสองสตริงติดกันในอาร์เรย์
      (พิสูจน์แล้ว exit 0 ทั้งที่ไฟล์พังจริง) ต้อง parse เป็น ES module จริงเท่านั้นถึงจับได้
   จึงยิงลูกที่มี flag ให้ตรวจทีเดียวทุกไฟล์ ตัวเทสเองยังเรียกด้วย `node tests/accepts.test.mjs` ตามปกติ */
{
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".js")) files.push(rel);
    }
  };
  walk("src");
  ck(files.length > 0, `หาโมดูลใน src/ เจอ (${files.length} ไฟล์ — ประชากรต้องไม่เป็นศูนย์)`);

  const child = `
    const { readFileSync } = await import("node:fs");
    const { SourceTextModule } = await import("node:vm");
    const bad = [];
    for (const f of ${JSON.stringify(files)}) {
      try { new SourceTextModule(readFileSync(${JSON.stringify(ROOT)} + "/" + f, "utf8")); }
      catch (e) { bad.push(f + ": " + e.message); }
    }
    console.log(JSON.stringify(bad));
  `;
  const r = spawnSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", child],
                      { encoding: "utf8" });
  let broken = null;
  try { broken = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch { /* ตัวตรวจเองพัง */ }
  ck(Array.isArray(broken), "ตัวตรวจไวยากรณ์ทำงานได้ (ถ้าข้อนี้แดง แปลว่าเครื่องตรวจพัง ไม่ใช่โค้ดพัง)");
  if (Array.isArray(broken)) {
    ck(broken.length === 0,
       `ทุกโมดูลใน src/ ต้อง parse ผ่าน (พัง ${broken.length})` +
       (broken.length ? "\n      " + broken.slice(0, 4).join("\n      ") : ""));
  }
}

/* ── วงเล็บปีกกาในไฟล์ CSS ต้องสมดุล ─────────────────────────────────────────
   ‼️ ที่มา 20/09/2026 เจอ } เกินมาหนึ่งตัวใน tool.css ซึ่งมีมาก่อนหน้านั้นนานแล้ว
   CSS ไม่พังทั้งไฟล์เวลาเจอ error มันกู้คืนด้วยการ "กลืนจนถึง } ตัวถัดไป"
   ผลคือกฎที่อยู่ถัดจากจุดผิดหายไปเงียบ ๆ ทั้งอัน ไม่มี error ไม่มีอะไรเตือน
   ของจริงที่หายคือ .ws-grid.no-left{grid-template-columns:...} ตายสนิทมานาน
   ไม่มีใครเห็น เพราะเครื่องมือที่ไม่มีแผงซ้ายส่วนใหญ่ก็ไม่มีแผงขวาด้วย
   จึงตกไปโดนกฎ .no-left.no-right ที่อยู่ถัดลงไปและยังดีอยู่
   ‼️ ตรวจนับหลังตัดคอมเมนต์และสตริงออกแล้ว ไม่งั้นปีกกาในคอมเมนต์จะทำให้เพี้ยน */
{
  const strip = (css) => css
    .replace(/\/\*[\s\S]*?\*\//g, "")      // คอมเมนต์
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')   // สตริงคู่
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");  // สตริงเดี่ยว
  const files = readdirSync("assets/css").filter((f) => f.endsWith(".css"));
  ck(files.length > 0, `มีไฟล์ CSS ให้ตรวจจริง (พบ ${files.length})`);
  for (const f of files) {
    const t = strip(readFileSync(`assets/css/${f}`, "utf8"));
    let d = 0, badLine = 0, line = 1;
    for (const ch of t) {
      if (ch === "\n") line++;
      else if (ch === "{") d++;
      else if (ch === "}") { d--; if (d < 0 && !badLine) badLine = line; }
    }
    ck(d === 0 && !badLine,
       `${f} วงเล็บปีกกาสมดุล (ค้าง ${d}${badLine ? `, เกินครั้งแรกบรรทัด ${badLine}` : ""})`);
  }
  /* พิสูจน์ว่าตัวตรวจจับได้จริง ไม่ใช่ผ่านเพราะมองไม่เห็น */
  const probe = (css) => { const t = strip(css); let d = 0;
    for (const ch of t) { if (ch === "{") d++; else if (ch === "}") d--; } return d; };
  ck(probe("a{b:c}}") === -1, "ตัวตรวจจับ } เกินได้จริง");
  ck(probe("a{b:c} /* } */") === 0, "ตัวตรวจไม่นับปีกกาที่อยู่ในคอมเมนต์");
}

console.log(`\nผ่าน ${pass} · ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
