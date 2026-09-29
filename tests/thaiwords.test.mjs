import { segmentWords, countText, countGraphemes } from "../src/thaiwords.js";

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};
const words = (s) => segmentWords(s).filter((p) => p.word).map((p) => p.text).join("|");

console.log("\n━━ ① คำทับศัพท์ที่ตัวตัดคำฉีกเป็นเศษ ต้องรวมกลับ ━━");
/* ‼️ ค่าดิบที่วัดใน Chrome 148 และ Node 29/09/2026:
     ทีม|ดาต้า|ทำ|แด|ช|บอร์ด|พา|ว|เวอร์|บี|ไอ|และ|อัปเดต|เม|เชอ|ร์|ใหม่|ใน|โมเดล (19 ชิ้น)
     เศษ ช, ว, ร์ ไม่ใช่คำ ต้องต่อเข้าคำก่อนหน้า */
ck("แดชบอร์ด พาวเวอร์ เมเชอร์ ไม่เหลือเศษ",
   words("ทีมดาต้าทำแดชบอร์ดพาวเวอร์บีไอและอัปเดตเมเชอร์ใหม่ในโมเดล"),
   "ทีม|ดาต้า|ทำ|แดช|บอร์ด|พาว|เวอร์|บี|ไอ|และ|อัปเดต|เม|เชอร์|ใหม่|ใน|โมเดล");

console.log("\n━━ ② คำจริงที่เป็นพยัญชนะตัวเดียว ห้ามถูกรวม ━━");
ck("‘ณ’ ติดคำหน้าโดยไม่เว้นวรรค ยังเป็นคำของตัวเอง", words("ประชุมณห้องใหญ่"), "ประ|ชุม|ณ|ห้อง|ใหญ่");
ck("‘ณ ที่นี้’", words("ณ ที่นี้"), "ณ|ที่|นี้");
ck("‘ธ สถิตในดวงใจ’", words("ธ สถิตในดวงใจ"), "ธ|สถิต|ใน|ดวงใจ");

console.log("\n━━ ③ ต่อชิ้นกลับแล้วต้องได้ข้อความเดิมทุกตัวอักษร ━━");
for (const s of ["ทีมดาต้าทำแดชบอร์ดพาวเวอร์บีไอ", "สวัสดีครับ\nวันนี้ประชุม 3 โมง\n\nขอบคุณ Power BI", "  เว้นหน้า เว้นหลัง  "]) {
  ck(`ต่อกลับได้เหมือนเดิม: ${JSON.stringify(s.slice(0, 18))}`, segmentWords(s).map((p) => p.text).join(""), s);
}

console.log("\n━━ ④ ตัวนับ ━━");
ck("ข้อความผสม ไทย อังกฤษ ตัวเลข หลายย่อหน้า",
   countText("สวัสดีครับ\nวันนี้ประชุม 3 โมง\n\nขอบคุณ Power BI"),
   { words: 10, thaiWords: 7, otherWords: 3, graphemes: 31, codeUnits: 46, lines: 4, paragraphs: 2 });
ck("ข้อความว่าง ทุกช่องเป็น 0", countText(""),
   { words: 0, thaiWords: 0, otherWords: 0, graphemes: 0, codeUnits: 0, lines: 0, paragraphs: 0 });
ck("สระกับวรรณยุกต์ที่ซ้อนกัน นับเป็นตัวเดียวกับพยัญชนะ (ที่นี่ = 2)", countGraphemes("ที่นี่"), 2);
ck("แต่นับแบบ Excel LEN ได้ 6", countText("ที่นี่").codeUnits, 6);
/* ‼️ ข้อจำกัดที่ยอมรับ: ราย|งา|นพาว ไม่ใช่เศษพยัญชนะเดี่ยว จึงไม่ถูกรวม ล็อกค่าไว้ให้รู้ตัวถ้าเบราว์เซอร์เปลี่ยน */
ck("ประโยคที่ wordcounter.net ได้ 5 คำ ที่นี่ได้ 14 (ค่าประมาณ)",
   countText("ฉันชอบทำรายงานพาวเวอร์บีไอมาก I love Power BI").words, 14);

console.log("\n" + "━".repeat(52));
console.log(`ผ่าน ${pass} ตก ${F.length}`);
if (F.length) { console.log("\nรายการที่ตก:"); F.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); process.exit(1); }
