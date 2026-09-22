// README ต้องตรงกับทะเบียนเครื่องมือจริงเสมอ (จำนวน, รายชื่อ, กลุ่ม)
//
// ‼️ ที่มา 23/09/2026: README เขียนว่า 49 เครื่องมือ และตารางยังเป็นกลุ่มเก่า
//    ขณะที่ของจริงมี 64 ตัว คนที่เปิด repo มาอ่านจึงเห็นภาพผิดตั้งแต่บรรทัดแรก
//    วิธีกันไม่ให้เกิดซ้ำคือ "อย่าให้คนต้องจำ" — สร้างตารางจากทะเบียนแล้วเทียบกับไฟล์
//    ตกแล้วพิมพ์ก้อนที่ถูกออกมาให้เลย ก็อปวางทับได้ทันที
//
// รัน: node tests/readme.test.mjs   ·   --fix เขียนทับ README ให้ตรงเลย
// --selftest: แกล้งแก้ตัวเลขในสำเนา แล้วตัวตรวจต้องจับได้

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const START = "<!-- TOOLS:START -->";
const END = "<!-- TOOLS:END -->";
let pass = 0;
const fails = [];

const ck = (ok, name, detail = "") => {
  if (ok) pass++;
  else fails.push(name + (detail ? `\n      ${detail}` : ""));
  console.log(`  ${ok ? "✅" : "❌"} ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
  return ok;
};

const { TOOLS, GROUPS, SUBS } = await import(pathToFileURL(join(ROOT, "src/registry.js")).href);

/** ตารางเครื่องมือที่ถูกต้อง สร้างจากทะเบียน (กลุ่มใหญ่แตกเป็นกลุ่มย่อยถ้ามี) */
function tableFromRegistry() {
  const rows = [];
  for (const g of GROUPS) {
    const list = TOOLS.filter((t) => t.group === g.id);
    if (!list.length) continue;
    const subs = SUBS[g.id];
    if (subs) {
      for (const s of subs) {
        const items = list.filter((t) => t.sub === s.id);
        if (items.length) rows.push([s.label, items]);
      }
    } else rows.push([g.label, list]);
  }
  return ["| กลุ่ม | เครื่องมือ |", "|---|---|",
    ...rows.map(([head, items]) => `| ${head} | ${items.map((t) => t.title).join(", ")} |`)].join("\n");
}

const want = `${START}\n\n## เครื่องมือทั้งหมด (${TOOLS.length})\n\n${tableFromRegistry()}\n\n${END}`;
const raw = readFileSync(README, "utf8");

if (process.argv.includes("--fix")) {
  const i = raw.indexOf(START), j = raw.indexOf(END);
  if (i < 0 || j < 0) throw new Error("ไม่มีป้าย TOOLS:START / TOOLS:END ใน README");
  writeFileSync(README, raw.slice(0, i) + want + raw.slice(j + END.length), "utf8");
  console.log("เขียนทับ README แล้ว");
  process.exit(0);
}

const selftest = process.argv.includes("--selftest");
const text = selftest ? raw.replace(`## เครื่องมือทั้งหมด (${TOOLS.length})`, "## เครื่องมือทั้งหมด (49)") : raw;

console.log("━━ README กับทะเบียนเครื่องมือ ━━");
const has = text.includes(START) && text.includes(END);
ck(has, "README มีช่วงตารางเครื่องมือที่สร้างอัตโนมัติ (TOOLS:START / TOOLS:END)");
if (has) {
  const got = text.slice(text.indexOf(START), text.indexOf(END) + END.length);
  const ok = got.trim() === want.trim();
  if (selftest) {
    ck(!ok, "ตัวตรวจจับได้ว่าจำนวนเครื่องมือใน README ไม่ตรงกับทะเบียน",
       "แก้เลขเป็น 49 แล้วตัวตรวจยังบอกว่าตรง = เชื่อไม่ได้");
  } else {
    ck(ok, `ตารางเครื่องมือตรงกับทะเบียน (${TOOLS.length} ตัว)`,
       ok ? "" : "แก้ให้ตรงด้วย: node tests/readme.test.mjs --fix");
  }
}
// ‼️ คำโฆษณาบนหน้าแรกก็ต้องเป็นเลขจริง (เคยเขียน 99 ชุดค้างไว้ตอนมี 126 ชุด)
//    นับชุดเทสแบบเดียวกับ tests/runp.sh all: browser_*.py + css_contract + *.test.mjs + contract
{
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(join(ROOT, "tests"));
  const suites = files.filter((f) => f.startsWith("browser_") && f.endsWith(".py")).length
    + files.filter((f) => f.endsWith(".test.mjs")).length + 2;
  const home = readFileSync(join(ROOT, "index.html"), "utf8");
  const said = [...home.matchAll(/ชุดทดสอบอัตโนมัติ (\d+) ชุด/g)].map((m) => +m[1]);
  const saidEn = [...home.matchAll(/(\d+) automated test suites/g)].map((m) => +m[1]);
  ck(said.length > 0 && said.every((n) => n === suites) && saidEn.every((n) => n === suites),
     `หน้าแรกบอกจำนวนชุดเทสตรงกับของจริง (${suites} ชุด)`, `ไทยบอก ${said.join(",")} อังกฤษบอก ${saidEn.join(",")}`);
}

// ตัวเลขที่เขียนลอย ๆ ในเนื้อ README ก็ต้องไม่ขัดกับของจริง
const claims = [...text.matchAll(/\*\*(\d+) เครื่องมือ\*\*/g)].map((m) => +m[1]);
ck(claims.every((n) => n === TOOLS.length),
   `ตัวเลข "N เครื่องมือ" ในเนื้อหาตรงกับของจริงทุกจุด (${TOOLS.length})`, `เจอ ${claims.join(", ")}`);

console.log("\n" + "━".repeat(56));
console.log(`ผ่าน ${pass} ข้อ, ตก ${fails.length} ข้อ`);
if (fails.length) { fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); process.exit(1); }
console.log("✅ README ตรงกับของจริง");
