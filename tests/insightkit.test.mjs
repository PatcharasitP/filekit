/* เทสตัวคิดประโยคสรุปจากข้อมูล (src/insightkit.js)
 *
 * ที่มา: ไอเดียกล่อง "สรุปจากข้อมูลนี้" ของ dash-man.com (ศึกษา 27/10/2026)
 * ค่าที่คาดทุกตัวคำนวณด้วย python ก่อนเขียน ไม่ได้คิดในหัว
 * ‼️ ข้อ ⑦ อ่านชุดตัวอย่างจริงของ pbi-bar ทั้ง 4 ชุด ต้องอ่านได้มากกว่า 0 ชุด ไม่งั้นตก
 */
import { readFileSync } from "node:fs";
import { summarize, sentences, headline, details, fmtNum, fmtPct } from "../src/insightkit.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };
const eq = (a, b, msg) => ck(JSON.stringify(a) === JSON.stringify(b), `${msg} ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`);
const near = (a, b, msg) => ck(typeof a === "number" && Math.abs(a - b) < 1e-9, `${msg} ได้ ${a} ควรเป็น ${b}`);
const rows = (pairs) => pairs.map(([Category, Value, Target]) => (Target === undefined ? { Category, Value } : { Category, Value, Target }));
const BANNED = /[·—]/;          // กฎหน้าจอ ห้ามจุดกลางและขีดยาวในข้อความที่ผู้ใช้เห็น
const THAI = /[฀-๿]/;

console.log("\n① ไม่มีข้อมูลที่ใช้ได้ = ไม่สรุป");
eq(summarize([]), null, "แถวว่าง");
eq(summarize(rows([["ก", NaN], ["ข", null]])), null, "ค่าไม่ใช่ตัวเลขทุกแถว");

console.log("\n② กระจุกตัว A50 B30 C10 D6 E4");
const s2 = summarize(rows([["C", 10], ["A", 50], ["E", 4], ["B", 30], ["D", 6]]));
eq(s2 && s2.n, 5, "นับกลุ่ม");
eq(s2 && s2.total, 100, "ยอดรวม");
eq(s2 && s2.top.name, "A", "อันดับ 1 หาเจอแม้แถวไม่เรียง");
near(s2 && s2.top.share, 0.5, "สัดส่วนอันดับ 1");
eq(s2 && s2.second.name, "B", "อันดับ 2");
near(s2 && s2.top.leadPct, 2 / 3, "นำอันดับ 2 อยู่ (50-30)/30");
eq(s2 && s2.bottom.name, "E", "ต่ำสุด");
near(s2 && s2.bottom.vsTop, 0.08, "ต่ำสุดเท่ากับกี่ส่วนของอันดับ 1");
eq(s2 && [s2.pareto.k, s2.pareto.n], [2, 5], "Pareto 2 จาก 5 กลุ่มทำ 80% (ขอบพอดี 0.8 ต้องนับว่าถึง)");
eq(s2 && s2.pareto.concentrated, true, "2 จาก 5 = กระจุก");

console.log("\n③ เท่ากันทุกกลุ่ม");
const s3 = summarize(rows([["A", 20], ["B", 20], ["C", 20], ["D", 20], ["E", 20]]));
eq(s3 && s3.top.tie, 5, "อันดับ 1 เสมอกัน 5 กลุ่ม");
eq(s3 && s3.second, null, "เสมอกันหมด ไม่มีอันดับ 2 ให้เทียบ");
eq(s3 && s3.pareto.concentrated, false, "เท่ากันหมด = ไม่กระจุก");
const t3 = s3 ? sentences(s3).join("\n") : "";
ck(!/นำอันดับ 2/.test(t3), "เสมอกันต้องไม่มีประโยค นำอันดับ 2");
ck(/เท่ากัน/.test(t3), "เสมอกันต้องบอกว่าเท่ากัน");

console.log("\n④ มีค่าติดลบ ห้ามคิดสัดส่วน");
const s4 = summarize(rows([["ก", 120000], ["ข", 80000], ["ค", -20000], ["ง", -45000]]));
eq(s4 && s4.negatives, 2, "นับกลุ่มติดลบ");
eq(s4 && s4.top.share, null, "สัดส่วนอันดับ 1 = null");
eq(s4 && s4.pareto, null, "Pareto = null");
const t4 = s4 ? sentences(s4).join("\n") : "";
ck(!/ของทั้งหมด|กระจุก|กระจาย/.test(t4), "ไม่มีประโยคสัดส่วนของทั้งหมดหรือ Pareto (นำอันดับ 2 กี่ % ยังพูดได้ เพราะเทียบสองค่าบวก)");
ck(/ติดลบ 2 กลุ่ม/.test(t4), "บอกว่าติดลบกี่กลุ่ม");

console.log("\n⑤ เป้าหมาย ค่าเท่าเป้านับว่าถึง");
const s5 = summarize(rows([["หน้าร้าน", 4820000, 4500000], ["ออนไลน์", 3150000, 3800000], ["ตัวแทนขาย", 1740000, 1740000], ["ขายส่ง", 890000, 1200000]]));
eq(s5 && [s5.target.hit, s5.target.count], [2, 4], "ถึงเป้า 2 จาก 4 (ตัวแทนขายเท่าเป้าพอดี)");
near(s5 && s5.target.achieved, 10600000 / 11240000, "รวมทำได้กี่ส่วนของเป้า");
eq(s5 && s5.target.gap, -640000, "ขาดรวม 640,000");
eq(s5 && s5.target.worst.name, "ขายส่ง", "กลุ่มที่ห่างเป้ามากสุดตามสัดส่วน (890/1200)");
eq(summarize(rows([["A", 1], ["B", 2]])).target, null, "ไม่มีคอลัมน์เป้า = target null");

console.log("\n⑥ ข้อความ ไทยกับอังกฤษ");
for (const [name, s] of [["กระจุก", s2], ["เสมอ", s3], ["ติดลบ", s4], ["เป้า", s5]]) {
  const th = s ? sentences(s, false) : [], en = s ? sentences(s, true) : [];
  ck(th.length >= 2, `${name} ไทยได้อย่างน้อย 2 ประโยค (${th.length})`);
  ck(en.length === th.length, `${name} อังกฤษจำนวนประโยคเท่าไทย`);
  ck(![...th, ...en].some((x) => BANNED.test(x)), `${name} ไม่มีจุดกลางหรือขีดยาว`);
  const enNoNames = en.join(" ").replace(/หน้าร้าน|ออนไลน์|ตัวแทนขาย|ขายส่ง|[กขคง]/g, "");
  ck(!THAI.test(enNoNames), `${name} อังกฤษไม่มีคำไทยหลุด นอกจากชื่อกลุ่ม`);
  const h = s ? headline(s, false) : "";
  ck(h.length > 0 && h.length <= 80 && !BANNED.test(h), `${name} หัวกราฟ 1 บรรทัดไม่เกิน 80 ตัว "${h}"`);
}
ck(s5 && /ถึงเป้า 2 จาก 4/.test(headline(s5)), "มีเป้า หัวกราฟพูดเรื่องเป้า");
ck(s2 && /^สูงสุดคือ A /.test(headline(s2)) && /50%/.test(headline(s2)), "ไม่มีเป้า หัวกราฟพูดถึงอันดับ 1 และบอก %");
ck(s2 && sentences(s2).some((x) => /2 จาก 5 กลุ่ม/.test(x)), "ประโยค Pareto บอก 2 จาก 5 กลุ่ม");

/* ‼️ หัวกราฟต้องเป็นประโยคหนึ่งใน sentences() เป๊ะทุกกรณี แล้ว details ตัดออกพอดี 1
   เคยผ่านแค่ชุดมีเป้า ชุดไม่มีเป้า (โดนัท) หัวกราฟกับประโยคแรกพูด 45.5% ซ้ำกัน เห็นบนจอจริง 28/10 */
console.log("\n⑥ข ประโยครองไม่พูดซ้ำหัวกราฟ (เห็นซ้ำบนจอจริง 27/10 และ 28/10)");
for (const [name, s] of [["กระจุก", s2], ["เสมอ", s3], ["ติดลบ", s4], ["เป้า", s5]]) for (const en of [false, true]) {
  const h = s ? headline(s, en) : "", d = s ? details(s, en) : [], all = s ? sentences(s, en) : [];
  ck(d.length > 0 && !d.includes(h), `${name} ${en ? "อังกฤษ" : "ไทย"} ประโยครองไม่มีหัวกราฟซ้ำ`);
  ck(all.includes(h) && d.length === all.length - 1, `${name} ${en ? "อังกฤษ" : "ไทย"} หัวกราฟคือหนึ่งประโยค ตัดออกพอดี 1`);
}

console.log("\n⑦ ชุดตัวอย่างจริงของ pbi-bar (เทียบกับตัวคำนวณดิบคนละวิธี)");
const ds = JSON.parse(readFileSync(new URL("../samples/powerbi/bar-datasets.json", import.meta.url), "utf8"));
const keys = Object.keys(ds);
ck(keys.length >= 4, `ประชากร อ่านชุดตัวอย่างได้ ${keys.length} ชุด`);
const PY = { sales_channel: 3, dept_headcount: 3, branch_profit: null, top_products: 4 };  // จาก python 27/10
for (const k of keys) {
  const r = ds[k].rows, s = summarize(r);
  ck(s !== null, `${k} สรุปได้`);
  if (!s) continue;
  const raw = r.reduce((a, x) => a + x.Value, 0);
  near(s.total, raw, `${k} ยอดรวมตรงตัวบวกดิบ`);
  if (k in PY) eq(s.pareto ? s.pareto.k : null, PY[k], `${k} Pareto k ตรงกับ python`);
  ck(sentences(s).length >= 2, `${k} มีประโยค`);
}

console.log("\n⑧ รูปตัวเลข");
eq(fmtNum(15553368), "15.55 ล้าน", "หลักล้านไทย");
eq(fmtNum(15553368, true), "15.55M", "หลักล้านอังกฤษ");
eq(fmtNum(29910), "29,910", "หลักพัน");
eq(fmtNum(-640000), "-640,000", "ติดลบ");
eq(fmtNum(2000000), "2 ล้าน", "ล้านพอดีไม่มีทศนิยมห้อย");
eq(fmtPct(0.5), "50%", "ร้อยละเต็ม");
eq(fmtPct(1 / 6), "16.7%", "ทศนิยม 1 ตำแหน่ง");

console.log(`\nผ่าน ${pass} ไม่ผ่าน ${fail.length}`);
if (fail.length) process.exit(1);
