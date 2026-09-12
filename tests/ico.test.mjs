/* ตรวจตัวประกอบไฟล์ .ico ของเครื่องมือแปลงชนิดไฟล์รูป
 *
 * ‼️ ที่มา: รายการค้างในคิวบอกว่า "เราแปลงได้ 3 ฟอร์แมต Squoosh ได้ 10"
 *    วัดจริง 12/09/2026 บนเบราว์เซอร์จริงแล้วพบว่า **เบราว์เซอร์เขียนได้แค่ 3 ฟอร์แมตจริง ๆ**
 *    (PNG, JPEG, WEBP · Firefox ได้ BMP เพิ่มมาอีกตัว) ส่วน AVIF, TIFF, GIF, HEIC เขียนไม่ได้เลย
 *    เว็บที่ได้ 10 ฟอร์แมตขนตัวเข้ารหัส WASM มาเป็นเมกะไบต์ ซึ่งขัดกับหลักโหลดเท่าที่ใช้
 *    แต่ .ico เพิ่มได้ฟรี เพราะมันคือหัวไฟล์ครอบ PNG ที่เบราว์เซอร์ทำให้อยู่แล้ว
 *
 * เทสนี้ตรวจโครงไบต์ให้ตรงสเปกทุกช่อง เพราะไฟล์ไอคอนที่หัวผิดจะเปิดไม่ขึ้นแบบเงียบ ๆ
 * ‼️ มีตัวควบคุมเชิงลบ ทำหัวให้ผิดแล้วตัวตรวจต้องจับได้
 *
 * รัน: node tests/ico.test.mjs */
import { buildIco } from "../src/tools/image-convert.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

/** อ่านไฟล์ ico กลับมาเป็นโครงสร้าง โดยไม่ใช้โค้ดของ buildIco เลย */
function parseIco(buf) {
  const dv = new DataView(buf);
  const out = { reserved: dv.getUint16(0, true), type: dv.getUint16(2, true), count: dv.getUint16(4, true), entries: [] };
  for (let i = 0; i < out.count; i++) {
    const b = 6 + i * 16;
    out.entries.push({
      w: new Uint8Array(buf)[b], h: new Uint8Array(buf)[b + 1],
      colors: new Uint8Array(buf)[b + 2], res: new Uint8Array(buf)[b + 3],
      planes: dv.getUint16(b + 4, true), bits: dv.getUint16(b + 6, true),
      bytes: dv.getUint32(b + 8, true), offset: dv.getUint32(b + 12, true),
    });
  }
  return out;
}
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const fakePng = (n) => {
  const u = new Uint8Array(n);
  u.set(PNG_SIG, 0);
  for (let i = 8; i < n; i++) u[i] = i % 251;
  return u.buffer;
};

console.log("\n① โครงไฟล์ตรงสเปก ICO");
const sizes = [16, 32, 48, 64];
const imgs = sizes.map((s, i) => ({ size: s, data: fakePng(100 + i * 37) }));
const blob = buildIco(imgs);
const buf = await blob.arrayBuffer();
const ico = parseIco(buf);

ck(blob.type === "image/x-icon", `ชนิดของ blob เป็น image/x-icon (ได้ ${blob.type})`);
ck(ico.reserved === 0, "ช่องสงวนไว้ 2 ไบต์แรกเป็น 0");
ck(ico.type === 1, `ประเภทเป็น 1 คือไอคอน ไม่ใช่ 2 ที่เป็นเคอร์เซอร์ (ได้ ${ico.type})`);
ck(ico.count === 4, `บอกจำนวนรูปข้างในถูกต้อง 4 รูป (ได้ ${ico.count})`);
ck(ico.entries.every((e, i) => e.w === sizes[i] && e.h === sizes[i]),
   "ขนาดกว้างและสูงของทุกรายการตรงกับที่สั่ง");
ck(ico.entries.every((e) => e.planes === 1 && e.bits === 32), "ทุกรายการประกาศ 1 plane และ 32 bit ต่อพิกเซล");
ck(ico.entries.every((e) => e.colors === 0 && e.res === 0), "ช่องตารางสีและช่องสงวนเป็น 0 ทุกรายการ");
ck(ico.entries.every((e, i) => e.bytes === imgs[i].data.byteLength), "ความยาวของแต่ละรูปตรงกับของจริง");

console.log("\n② ตำแหน่งที่ชี้ไว้ ต้องชี้ไปที่ PNG จริง");
const u8 = new Uint8Array(buf);
ck(ico.entries[0].offset === 6 + 16 * 4, `รูปแรกเริ่มหลังหัวไฟล์พอดี ที่ไบต์ ${6 + 16 * 4} (ได้ ${ico.entries[0].offset})`);
ck(ico.entries.every((e) => PNG_SIG.every((b, k) => u8[e.offset + k] === b)),
   "ทุกตำแหน่งที่ชี้ไว้ เจอลายเซ็น PNG จริง ไม่ได้ชี้หลุด");
ck(ico.entries.every((e, i) => i === 0 || e.offset === ico.entries[i - 1].offset + ico.entries[i - 1].bytes),
   "รูปเรียงต่อกันไม่มีช่องว่างและไม่ทับกัน");
const last = ico.entries[ico.entries.length - 1];
ck(last.offset + last.bytes === buf.byteLength, `ไฟล์จบพอดีที่รูปสุดท้าย ไม่มีไบต์เกิน (${buf.byteLength})`);
ck(buf.byteLength === 6 + 16 * 4 + imgs.reduce((a, x) => a + x.data.byteLength, 0),
   "ขนาดไฟล์รวมเท่ากับหัวบวกรูปทั้งหมดพอดี");

console.log("\n③ กรณีพิเศษที่สเปกกำหนดไว้");
{
  /* ‼️ ช่องกว้างกับสูงมีแค่ 1 ไบต์ สเปกจึงกำหนดว่า 0 หมายถึง 256
     ถ้าเขียน 256 ลงไปตรง ๆ จะล้นกลายเป็น 0 พอดี ซึ่งบังเอิญถูก แต่ต้องตั้งใจให้ถูก */
  const big = parseIco(await buildIco([{ size: 256, data: fakePng(64) }]).arrayBuffer());
  ck(big.entries[0].w === 0 && big.entries[0].h === 0, "ขนาด 256 ถูกเขียนเป็น 0 ตามที่สเปกกำหนด");
}
{
  const one = parseIco(await buildIco([{ size: 32, data: fakePng(80) }]).arrayBuffer());
  ck(one.count === 1 && one.entries[0].offset === 22, "ไฟล์ที่มีรูปเดียว หัวยาว 22 ไบต์พอดี");
}

console.log("\n④ ตัวควบคุมเชิงลบ ตัวตรวจต้องจับของผิดได้");
{
  const bad = new Uint8Array(buf.slice(0));
  bad[2] = 2;                                   // เปลี่ยนประเภทเป็นเคอร์เซอร์
  ck(parseIco(bad.buffer).type !== 1, "ตัวอ่านจับได้ถ้าประเภทไม่ใช่ไอคอน");
  const bad2 = new Uint8Array(buf.slice(0));
  new DataView(bad2.buffer).setUint32(6 + 12, 9999, true);   // ชี้ตำแหน่งหลุดไฟล์
  const e = parseIco(bad2.buffer).entries[0];
  ck(!PNG_SIG.every((b, k) => bad2[e.offset + k] === b), "ตัวอ่านจับได้ถ้าตำแหน่งชี้ไปที่ไม่ใช่ PNG");
}

console.log(`\nผ่าน ${pass} ตก ${fail.length}`);
if (fail.length) { for (const f of fail) console.log("  ❌ " + f); process.exit(1); }
