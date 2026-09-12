/* ของแจกต้องตรงกับของจริงเสมอ
 *
 * ‼️ ปัญหาที่เทสนี้กัน: ไฟล์ธีมที่แจกถูกสร้างจากโค้ดของเครื่องมือ ถ้าวันหนึ่งมีคน
 *    แก้ชุดสีในเครื่องมือแล้วลืมสร้างไฟล์แจกใหม่ คนที่โหลดไปจะได้ของคนละชุดกับ
 *    ที่เห็นบนหน้าจอ โดยไม่มีอะไรฟ้อง เทสนี้เทียบไบต์ต่อไบต์
 *
 * ‼️ และธีมที่แจกต้องผ่านเกณฑ์เดียวกับที่เครื่องมือใช้ตรวจ ไม่ใช่แจกของที่
 *    เครื่องมือของเราเองจะขึ้นเตือนถ้าเอาไปใส่
 *
 * รัน: node tests/freebies.test.mjs */
import fs from "fs";
import { buildTheme, derive, PALETTES } from "../src/tools/pbi-theme.js";
import { checkPalette } from "../src/cvd.js";
import { contrast } from "../src/colorkit.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const NAME = { terra: "FileKit Terracotta", jewel: "FileKit Jewel", night: "FileKit Dark Canvas" };
const src = fs.readFileSync("src/tools/freebies.js", "utf8");

console.log("\n① ไฟล์ธีมที่แจก ต้องตรงกับที่เครื่องมือสร้างทุกไบต์");
for (const p of PALETTES()) {
  if (p.kind !== "neutral") continue;
  const file = `samples/powerbi/theme-${p.id}.json`;
  ck(fs.existsSync(file), `${file} มีอยู่จริง`);
  if (!fs.existsSync(file)) continue;
  const s = derive({ name: NAME[p.id], w: 1920, h: 1080, font: "Segoe UI",
    colors: p.colors.slice(), bg: p.bg, fg: p.fg,
    good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F" });
  const want = JSON.stringify(buildTheme(s), null, 2) + "\n";
  const got = fs.readFileSync(file, "utf8");
  ck(got === want, `${file} ตรงกับที่เครื่องมือสร้างทุกไบต์ (ถ้าแดง ให้สร้างไฟล์ใหม่)`);
}

console.log("\n② ธีมที่แจก ต้องผ่านเกณฑ์เดียวกับที่เครื่องมือใช้ตรวจ");
for (const p of PALETTES()) {
  if (p.kind !== "neutral") continue;
  const t = JSON.parse(fs.readFileSync(`samples/powerbi/theme-${p.id}.json`, "utf8"));
  const low = t.dataColors.filter((c) => contrast(c, t.background) < 3);
  ck(low.length === 0, `${t.name}: ทุกสีอ่านออกบนพื้นหลังของตัวเอง (ต่ำกว่าเกณฑ์ ${low.length})`);
  ck(checkPalette(t.dataColors).maxSafe === t.dataColors.length,
     `${t.name}: คนตาบอดสีแยกออกครบ ${t.dataColors.length} สี`);
  ck(!t.dataColors.includes(t.tableAccent), `${t.name}: tableAccent ไม่ใช่สีแบรนด์ (TH1)`);
}

console.log("\n③ ‼️ ไม่มีธีมขององค์กรใดหลุดเข้าไปในของแจก");
{
  /* พี่ปอนด์เคาะให้ใส่ธีม TRUE ในเครื่องมือได้ แต่ของแจกเป็นไฟล์ที่คนโหลดไปทั้งก้อน
     จึงจำกัดไว้ที่ชุดของกลางเท่านั้น ถ้าวันหนึ่งมีคนเผลอเพิ่ม ข้อนี้จะแดง */
  const brandIds = PALETTES().filter((p) => p.kind === "brand").map((p) => p.id);
  ck(brandIds.length > 0, `มีชุดของแบรนด์ในเครื่องมือจริง ${brandIds.length} ชุด (ประชากรต้องไม่เป็นศูนย์)`);
  const leaked = brandIds.filter((id) => src.includes(`theme-${id}.json`));
  ck(leaked.length === 0, `ไม่มีธีมของแบรนด์อยู่ในหน้าแจก (เจอ ${leaked.join(", ") || "ไม่มี"})`);
  ck(!fs.existsSync("samples/powerbi/theme-true.json"), "ไม่มีไฟล์ธีมของแบรนด์วางไว้ในโฟลเดอร์ตัวอย่าง");
}

console.log("\n④ ของแจกทุกชิ้นที่ประกาศไว้ ต้องมีไฟล์จริง");
{
  const files = [...src.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
  ck(files.length >= 7, `ประกาศไว้ ${files.length} ชิ้น`);
  const missing = files.filter((f) => !fs.existsSync(f));
  ck(missing.length === 0, `ทุกชิ้นมีไฟล์จริง (ขาด ${missing.join(", ") || "ไม่มี"})`);
  const empty = files.filter((f) => fs.existsSync(f) && fs.statSync(f).size < 200);
  ck(empty.length === 0, `ไม่มีไฟล์ที่เล็กจนน่าสงสัยว่าว่างเปล่า (${empty.join(", ") || "ไม่มี"})`);
  /* ‼️ ทุกชิ้นต้องบอกด้วยว่าพิสูจน์มายังไง อย่างน้อยของที่เพิ่มใหม่ */
  const proofs = [...src.matchAll(/proof:/g)].length;
  ck(proofs >= 4, `มีบรรทัดหลักฐานอย่างน้อย 4 ชิ้น (มี ${proofs})`);
}

console.log("\n⑤ ตัวควบคุมเชิงลบ เทียบไบต์ต้องจับความต่างได้จริง");
{
  const f = "samples/powerbi/theme-terra.json";
  const real = fs.readFileSync(f, "utf8");
  const tampered = real.replace('"#DD7755"', '"#DD7756"');
  ck(tampered !== real, "แก้สีไป 1 ตัวอักษร ข้อความเปลี่ยนจริง (ตัวทดสอบใช้ได้)");
  const p = PALETTES().find((x) => x.id === "terra");
  const s = derive({ name: NAME.terra, w: 1920, h: 1080, font: "Segoe UI",
    colors: p.colors.slice(), bg: p.bg, fg: p.fg, good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F" });
  ck(tampered !== JSON.stringify(buildTheme(s), null, 2) + "\n",
     "ไฟล์ที่ถูกแก้ 1 ตัวอักษร ถูกจับได้ว่าไม่ตรงกับที่เครื่องมือสร้าง");
}

console.log(`\nผ่าน ${pass} ตก ${fail.length}`);
if (fail.length) { for (const f of fail) console.log("  ❌ " + f); process.exit(1); }
