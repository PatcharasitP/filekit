import { scoreTool, searchTools, enToThai, highlightRange } from "../src/search.js";
import { TOOLS } from "../src/registry.js";

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};
const top = (q, n = 1) => searchTools(TOOLS, q).slice(0, n).map((r) => r.t.id);

console.log("\n━━ ① แป้นเกษมณี (ลืมสลับแป้น) ━━");
ck("wmp → ไทย", enToThai("wmp"), "ไทย");
ck("i;, → รวม", enToThai("i;,"), "รวม");
ck("g'bo → เงิน", enToThai("g'bo"), "เงิน");
ck("pdf ที่ตั้งใจพิมพ์อังกฤษจริง ๆ ก็ยังแปลง (จึงต้องให้คะแนนน้อยกว่า)", enToThai("pdf"), "ยกด");
ck("ตัวเดียวไม่แปลง (สั้นไปเดาไม่ได้)", enToThai("p"), null);

console.log("\n━━ ② ค้นด้วยคำไทยตรง ๆ ━━");
ck("‘รวม’ → รวมไฟล์ PDF มาก่อน", top("รวม"), ["pdf-merge"]);
ck("‘บาทถ้วน’ → ตัวเลข→บาทถ้วน", top("บาทถ้วน"), ["thai-number"]);
ck("‘ไทยเพี้ยน’ → ซ่อมไฟล์ไทยเพี้ยน", top("ไทยเพี้ยน"), ["thai-encoding"]);
ck("‘จดหมายเวียน’ → จดหมายเวียน", top("จดหมายเวียน"), ["word-mailmerge"]);
ck("‘บัตรประชาชน’ (อยู่ในคำค้น ไม่ใช่ชื่อ)", top("บัตรประชาชน"), ["thai-id"]);
ck("‘ลายน้ำ’ → ใส่ลายน้ำ PDF", top("ลายน้ำ"), ["pdf-watermark"]);

console.log("\n━━ ③ ค้นแบบพิมพ์ครึ่ง ๆ / ข้ามตัวอักษร ━━");
ck("‘รวมpdf’ (ไทยปนอังกฤษ ไม่มีเว้นวรรค)", top("รวมpdf"), ["pdf-merge"]);
ck("‘ocr’", top("ocr"), ["pdf-ocr"]);
ck("‘พศ’ (ไม่ใส่จุด)", top("พศ"), ["thai-date"]);
ck("‘เซ็น’ → เซ็นชื่อบน PDF", top("เซ็น"), ["pdf-sign"]);
ck("‘เซน’ (ไม่ใส่ไม้ไต่คู้) ก็ต้องเจอ", top("เซน"), ["pdf-sign"]);

console.log("\n━━ ④ พิมพ์อังกฤษแต่ตั้งใจพิมพ์ไทย ━━");
ck("‘i;,’ = ‘รวม’ → เจอรวมไฟล์", top("i;,"), ["pdf-merge"]);
ck("‘hkpdib’ ไม่ควรเจออะไรมั่ว ๆ", searchTools(TOOLS, "hkpdib").length, 0);

console.log("\n━━ ⑤ ไม่เจอ / ขอบเขต ━━");
ck("คำที่ไม่มีจริง → ไม่คืนอะไร", searchTools(TOOLS, "zzzxxqq").length, 0);
ck("ช่องว่าง → คืนทุกตัว", searchTools(TOOLS, "").length, TOOLS.length);
ck("‘pdf’ ต้องเจอหลายตัว", searchTools(TOOLS, "pdf").length > 8, true);

console.log("\n━━ ⑥ ไฮไลต์ต้องคร่อมตัวอักษรถูกตำแหน่ง ━━");
{
  const t = "รวมไฟล์ PDF";
  const r = highlightRange(t, "ไฟล์");
  ck("ตำแหน่งไฮไลต์ ‘ไฟล์’", r && t.slice(r[0], r[1]), "ไฟล์");
  const r2 = highlightRange("เซ็นชื่อบน PDF", "ชื่อ");
  ck("ไฮไลต์ในชื่อที่มีไม้ไต่คู้ (ห้ามเลื่อนตำแหน่ง)", r2 && "เซ็นชื่อบน PDF".slice(r2[0], r2[1]), "ชื่อ");
  ck("ไม่ตรง → ไม่ไฮไลต์", highlightRange("รวมไฟล์ PDF", "xyz"), null);
}

console.log("\n" + "━".repeat(52));
console.log(`ผ่าน ${pass} · ตก ${F.length}`);
if (F.length) { console.log("\nรายการที่ตก:"); F.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); process.exit(1); }
