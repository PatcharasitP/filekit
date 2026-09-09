/* ตรวจว่า accepts ในทะเบียน "ตรงกับของจริง" ที่เครื่องมือแต่ละตัวประกาศไว้ใน expect
 *
 * ทำไมต้องมี: หน้าแรกใช้ accepts เป็นตัวคัดว่า "ไฟล์ที่ลากมานี้ใช้กับเครื่องมือไหนได้บ้าง"
 * โดยไม่ต้องเปิดเครื่องมือ — ถ้าใครไปแก้ expect ในไฟล์เครื่องมือแล้วลืมแก้ทะเบียน
 * หน้าแรกจะเสนอเครื่องมือผิด (หรือไม่เสนอทั้งที่ใช้ได้) แบบเงียบ ๆ ไม่มีอะไรฟ้อง
 *
 * ตรวจแบบอ่านไฟล์ตรง ๆ ไม่ import — ทะเบียนพึ่ง localStorage ของเบราว์เซอร์อยู่ */
import { readFileSync, readdirSync } from "node:fs";
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
function middotsInStrings(txt) {
  const hits = [];
  let line = 1, mode = "code", quote = "", depth = 0;
  const stack = [];                       // ชั้นของ template ที่ซ้อนกันผ่าน ${...}
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i], n = txt[i + 1];
    if (c === "\n") line++;
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

console.log(`\nผ่าน ${pass} · ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
