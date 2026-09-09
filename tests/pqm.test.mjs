/* ตรวจตัวสร้างโค้ด Power Query (M)
 *
 * ทำไมต้องมี: โค้ดที่เราสร้างให้ผู้ใช้เอาไปวางใน Power Query Editor ถ้าผิดไวยากรณ์แม้แต่จุดเดียว
 * มันจะพังทั้ง query และผู้ใช้จะไม่รู้ว่าพังเพราะอะไร ตัวที่พลาดง่ายที่สุดคือกฎ escape
 * โดยเฉพาะข้อความที่มี #( อยู่จริง ซึ่ง M อ่านเป็นคำสั่ง escape
 *
 * ไวยากรณ์อ้างอิงจากเอกสารทางการ Microsoft (Power Query M language specification)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ‼️ โหลดไฟล์จริงตรง ๆ ไม่ใช่ผ่าน data: URL แล้วตัด import ทิ้ง
// ตัวสร้างโค้ดต้องใช้ตัวอ่านวันที่ตัวเดียวกับตัวเดาชนิด (src/thai.js) ถ้าเทสตัด import ออก
// เทสจะผ่านทั้งที่ของจริงพัง (เคยพลาดมาแล้ว: วันที่ที่เป็นข้อความกลายเป็น null ทั้งคอลัมน์)
const mod = await import(pathToFileURL(join(ROOT, "src/pqm.js")).href);
const { escapeMText, quoteName, mLiteral, buildTableCode, wrapAsQuery, PQ_TYPES } = mod;

let pass = 0;
const fail = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};

console.log("\n━━ ① กฎ escape ของข้อความ ━━");
ck("ข้อความธรรมดาไม่ถูกแตะ", escapeMText("Somchai"), "Somchai");
ck("ภาษาไทยใส่ตรง ๆ ได้ ไม่ต้องแปลง", escapeMText("สมชาย ใจดี"), "สมชาย ใจดี");
ck('เครื่องหมายคำพูดต้องซ้อนเป็นสองตัว', escapeMText('เขาบอกว่า "ได้"'), 'เขาบอกว่า ""ได้""');
ck("ขึ้นบรรทัดใหม่แบบวินโดวส์", escapeMText("บรรทัดหนึ่ง\r\nบรรทัดสอง"), "บรรทัดหนึ่ง#(cr,lf)บรรทัดสอง");
ck("ขึ้นบรรทัดใหม่แบบยูนิกซ์", escapeMText("ก\nข"), "ก#(lf)ข");
ck("แท็บ", escapeMText("ก\tข"), "ก#(tab)ข");
// ‼️ ข้อที่คนลืมบ่อยที่สุด ถ้าไม่ทำ M จะอ่าน #( เป็นคำสั่ง escape แล้วพังทั้ง query
ck("ข้อความที่มี #( อยู่จริง ต้อง escape ตัว # ก่อน", escapeMText("ราคา #(ไม่รวมภาษี)"), "ราคา #(#)(ไม่รวมภาษี)");
ck("escape ตัว # ต้องมาก่อนกฎอื่น ไม่งั้นซ้อนกันมั่ว", escapeMText('#("x")'), '#(#)(""x"")');

console.log("\n━━ ② ชื่อคอลัมน์ ━━");
ck("ครอบด้วย #\"...\" เสมอ", quoteName("ID"), '#"ID"');
ck("ชื่อมีช่องว่าง", quoteName("Start Date"), '#"Start Date"');
ck("ชื่อภาษาไทย", quoteName("วันที่เริ่ม"), '#"วันที่เริ่ม"');
ck("ชื่อที่ตรงกับคำสงวนก็ปลอดภัย", quoteName("type"), '#"type"');
ck("ชื่อที่มีเครื่องหมายคำพูด", quoteName('ชื่อ "เล่น"'), '#"ชื่อ ""เล่น"""');

console.log("\n━━ ③ ค่า literal แต่ละชนิด ━━");
ck("ข้อความ", mLiteral("Open", "text"), '"Open"');
ck("ข้อความว่างถือเป็น null", mLiteral("", "text"), "null");
ck("ค่าว่างถือเป็น null", mLiteral(null, "int64"), "null");
ck("จำนวนเต็ม", mLiteral(1001, "int64"), "1001");
ck("จำนวนเต็มจากข้อความมีคอมมา", mLiteral("1,250", "int64"), "1250");
ck("จำนวนเต็มจากเลขไทย", mLiteral("๑๒๓", "int64"), "123");
ck("ทศนิยม", mLiteral(12500.5, "number"), "12500.5");
ck("จำนวนเงิน", mLiteral("12,500.50", "currency"), "12500.5");
ck("เปอร์เซ็นต์จากเลขสัดส่วน", mLiteral(0.875, "percentage"), "0.875");
// ‼️ Percentage ใน M เก็บเป็นสัดส่วน 87.5% ต้องกลายเป็น 0.875 ไม่ใช่ 87.5
ck("เปอร์เซ็นต์จากข้อความมีเครื่องหมาย %", mLiteral("87.5%", "percentage"), "0.875");
ck("จริง", mLiteral(true, "logical"), "true");
ck("เท็จจากข้อความไทย", mLiteral("ไม่ใช่", "logical"), "false");
ck("จริงจากข้อความอังกฤษ", mLiteral("TRUE", "logical"), "true");
ck("ค่าที่ตีความเป็นจริงเท็จไม่ได้ ต้องเป็น null ไม่ใช่เดา", mLiteral("อาจจะ", "logical"), "null");

const d = new Date(2026, 8, 1, 8, 30, 0);       // เดือนใน JS เริ่มที่ 0 กันยายนคือ 8
ck("วันที่", mLiteral(d, "date"), "#date(2026,9,1)");
ck("วันที่และเวลา", mLiteral(d, "datetime"), "#datetime(2026,9,1,8,30,0)");
ck("วันที่ เวลา โซนเวลา ตั้งต้นเป็นเวลาไทย +07:00",
   mLiteral(d, "datetimezone"), "#datetimezone(2026,9,1,8,30,0,7,0)");
ck("โซนเวลาสั่งเองได้", mLiteral(d, "datetimezone", { tzHours: 0, tzMinutes: 0 }),
   "#datetimezone(2026,9,1,8,30,0,0,0)");
ck("เวลาจาก Date", mLiteral(d, "time"), "#time(8,30,0)");
ck("เวลาจากข้อความ", mLiteral("09:15", "time"), "#time(9,15,0)");
ck("ช่วงเวลาแบบมีวัน", mLiteral("2.05:30:00", "duration"), "#duration(2,5,30,0)");
ck("ช่วงเวลาแบบไม่มีวัน", mLiteral("05:30:00", "duration"), "#duration(0,5,30,0)");
ck("วันที่ที่แปลงไม่ได้ต้องเป็น null ไม่ใช่ค่ามั่ว", mLiteral("ไม่ทราบ", "date"), "null");

/* ‼️ วันที่ที่มาเป็น "ข้อความ" คือกรณีปกติของงานไทย (ไฟล์ที่ export มาจากระบบส่วนใหญ่เป็นข้อความ)
 * ตัวเดาชนิดอ่านออกและประกาศว่าเป็น date อยู่แล้ว ตัวสร้างโค้ดจึงต้องอ่านออกด้วย
 * ไม่งั้นได้ตารางที่หัวบอกว่า date แต่ค่าว่างทั้งคอลัมน์ = ข้อมูลหายเงียบ ๆ
 * (วัดจริง 09/09/2026 บนเว็บจริง: ทั้ง 4 รูปแบบข้างล่างคืน null หมด) */
console.log("\n━━ ⑤ วันที่ที่มาเป็นข้อความ (ต้องไม่หายเงียบ) ━━");
ck("วันที่ไทยเต็ม พ.ศ.", mLiteral("1 ตุลาคม 2569", "date"), "#date(2026,10,1)");
ck("วันที่ไทยย่อ ปี 2 หลัก", mLiteral("15 พ.ย. 69", "date"), "#date(2026,11,15)");
ck("วัน/เดือน/ปี พ.ศ.", mLiteral("01/10/2569", "date"), "#date(2026,10,1)");
ck("รูปแบบสากล ค.ศ.", mLiteral("2026-10-01", "date"), "#date(2026,10,1)");
ck("เลขวันที่ของ Excel", mLiteral(46296, "date"), "#date(2026,10,1)");
ck("เลขไทยในวันที่", mLiteral("๑๕ ม.ค. ๒๕๖๙", "date"), "#date(2026,1,15)");
ck("วันที่และเวลาที่เป็นข้อความ", mLiteral("2026-10-01 13:45", "datetime"), "#datetime(2026,10,1,13,45,0)");
ck("มีแค่ปี สร้างวันที่ไม่ได้ ต้องเป็น null", mLiteral("2569", "date"), "null");
ck("ข้อความมั่ว ๆ ยังต้องเป็น null", mLiteral("ไม่ระบุ", "date"), "null");

console.log("\n━━ ④ ประกอบเป็นตารางเต็ม ━━");
{
  const cols = [{ name: "ID", type: "int64" }, { name: "ชื่อ", type: "text" },
                { name: "วันที่", type: "date" }];
  const rows = [[1001, "สมชาย", d], [1002, 'เขาบอก "ดี"', null]];
  const code = buildTableCode(cols, rows, { nullable: true });
  ck("มีหัวว่า #table", code.startsWith("#table("), true);
  ck("ประกาศชนิดครบทุกคอลัมน์",
     ['#"ID" = Int64.Type', '#"ชื่อ" = text'].every((x) => code.includes(x)), true);
  // คอลัมน์ที่มีช่องว่างจริงเท่านั้นที่ควรได้ nullable จะได้ไม่รกโดยไม่จำเป็น
  ck("คอลัมน์ที่มีค่าว่างได้ nullable", code.includes('#"วันที่" = nullable date'), true);
  ck("คอลัมน์ที่ไม่มีค่าว่าง ไม่ต้องมี nullable", code.includes('#"ID" = nullable'), false);
  ck("แถวข้อมูลครบ", (code.match(/\{1001,/g) || []).length, 1);
  ck("ค่าว่างในแถวเขียนเป็น null", code.includes(", null}"), true);
  ck("escape ข้อความในแถวถูกต้อง", code.includes('"เขาบอก ""ดี"""'), true);
  ck("วงเล็บเปิดปิดเท่ากัน",
     (code.match(/\(/g) || []).length, (code.match(/\)/g) || []).length);
  ck("ปีกกาเปิดปิดเท่ากัน",
     (code.match(/\{/g) || []).length, (code.match(/\}/g) || []).length);

  const q = wrapAsQuery(code);
  ck("ห่อเป็น query ได้", q.startsWith("let\n") && q.trimEnd().endsWith("Source"), true);
}

console.log("\n━━ ⑤ เมนูชนิดข้อมูล ━━");
ck("มีชนิดข้อมูลครบตามที่ Power Query ใช้จริง", PQ_TYPES.length, 11);
ck("ทุกชนิดมี mType ที่เขียนลง type table ได้", PQ_TYPES.every((t) => typeof t.mType === "string" && t.mType), true);
ck("ไม่มี id ซ้ำ", new Set(PQ_TYPES.map((t) => t.id)).size, PQ_TYPES.length);

console.log(`\nผ่าน ${pass} · ตก ${fail.length}`);
fail.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(fail.length ? 1 : 0);
