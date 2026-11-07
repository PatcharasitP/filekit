// ตัวแยกที่อยู่ไทย (src/tools/thai-address.js parseAddress) กับฐานข้อมูลจริง vendor/th-address.json
// ที่มา 07/11/2026 ไล่กดเว็บจริง ที่อยู่ที่มีคำนำหน้าแค่จังหวัด (จ. , จังหวัด , กรุงเทพฯ , กทม) แต่ไม่มี ต./อ./แขวง/เขต
// แยกไม่ได้ทุกแบบ ("ในเมือง เมืองขอนแก่น จ.ขอนแก่น" ได้ หาอำเภอ/เขตไม่เจอ) ทั้งที่หน้าเครื่องมือบอกว่าไม่มีคำนำหน้าก็อ่านได้
// เพราะคำนำหน้าจังหวัดทำให้ไม่เข้าทางเดาจากลำดับคำ แต่ช่องตำบลกับอำเภอไม่มีคำนำหน้าให้ยึด
// ใช้: node tests/thai_address.test.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.localStorage = { getItem: () => null, setItem() {} };
const ROOT = process.env.FK_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const { buildGeo, parseAddress } = await import(join(ROOT, "src/tools/thai-address.js"));
const geo = buildGeo(JSON.parse(readFileSync(join(ROOT, "vendor/th-address.json"), "utf8")));

let pass = 0; const fail = [];
const ck = (ok, name, got) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail.push(name); console.log("  ❌ " + name + "  [" + JSON.stringify(got).slice(0, 160) + "]"); } };
const same = (r, want) => r.ok && JSON.stringify(r.value) === JSON.stringify(want);

// ── คำนำหน้าแค่จังหวัด (เคสที่พัง) ──
const ONLY_PROV = [
  ["ในเมือง เมืองขอนแก่น จ.ขอนแก่น 40000", ["ในเมือง", "เมืองขอนแก่น", "ขอนแก่น", "40000"]],
  ["ในเมือง เมืองขอนแก่น จังหวัดขอนแก่น", ["ในเมือง", "เมืองขอนแก่น", "ขอนแก่น", "40000"]],
  ["ช้างเผือก เมืองเชียงใหม่ จ.เชียงใหม่", ["ช้างเผือก", "เมืองเชียงใหม่", "เชียงใหม่", "50300"]],
  ["55/7 ซ.สุขุมวิท 21 คลองเตยเหนือ วัฒนา กรุงเทพฯ", ["คลองเตยเหนือ", "วัฒนา", "กรุงเทพมหานคร", "10110"]],
  ["คลองเตยเหนือ วัฒนา กทม 10110", ["คลองเตยเหนือ", "วัฒนา", "กรุงเทพมหานคร", "10110"]],
];
for (const [a, want] of ONLY_PROV) {
  const r = parseAddress(a, geo);
  ck(same(r, want), `คำนำหน้าแค่จังหวัดก็แยกได้: ${a}`, r);
  ck(r.warn === true, `เดาจากลำดับคำต้องติดธงให้ตรวจซ้ำ: ${a}`, r);
}

// ── ของเดิมที่ต้องยังถูก (กันแก้แล้วพังที่อื่น) ──
const KEEP = [
  ["99/12 หมู่ 3 ถ.มิตรภาพ ต.ในเมือง อ.เมืองขอนแก่น จ.ขอนแก่น 40000", ["ในเมือง", "เมืองขอนแก่น", "ขอนแก่น", "40000"], false],
  ["1234 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร 10400", ["สามเสนใน", "พญาไท", "กรุงเทพมหานคร", "10400"], false],
  ["ในเมือง เมืองขอนแก่น ขอนแก่น", ["ในเมือง", "เมืองขอนแก่น", "ขอนแก่น", "40000"], true],
  ["55/7 ซ.สุขุมวิท 21 แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพฯ", ["คลองเตยเหนือ", "วัฒนา", "กรุงเทพมหานคร", "10110"], false],
];
for (const [a, want, w] of KEEP) {
  const r = parseAddress(a, geo);
  ck(same(r, want) && r.warn === w, `ยังแยกเหมือนเดิม: ${a}`, r);
}
// ── ของที่ต้องยังบอกว่าแยกไม่ได้ ไม่เดามั่ว ──
for (const a of ["ส่งที่ร้านหน้าปากซอย", "123 ซอยสุขุมวิท 21 กรุงเทพฯ", "จ.ขอนแก่น"]) {
  const r = parseAddress(a, geo);
  ck(!r.ok, `ข้อมูลไม่พอ ต้องบอกว่าแยกไม่ได้: ${a}`, r);
}

console.log(`\nผ่าน ${pass} , ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
