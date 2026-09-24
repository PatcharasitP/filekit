// เทสลิงก์ย่อของ FileKit รัน: node tests/golink.test.mjs (ทุกข้อต้องแดงเป็นเมื่อของเสีย ไม่ใช่เขียวอย่างเดียว)
import { readFileSync } from 'node:fs';
import { seal, open, derive, leaks, VALID, SALT, ITER } from '../tools/golink.mjs';

let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } };
const throws = async (f) => { try { await f(); return false; } catch { return true; } };

// ① ถอดกลับได้ตรง
const url = 'https://example.com/path?x=1&y=ไทย';
const s = await seal('demo', url);
ok('ถอดกลับได้ตรงทุกตัวอักษร', (await open('demo', s.entry)) === url);
ok('ชื่อไฟล์เป็นเลขฐานสิบหก 24 ตัว ไม่มีชื่อลิงก์ในนั้น', /^[0-9a-f]{24}$/.test(s.id) && !s.id.includes('demo'));
ok('ไฟล์ข้อมูลไม่มีปลายทางแบบอ่านออก', !JSON.stringify(s.entry).includes('example.com'));

// ② ชื่อผิดเปิดไม่ได้ และได้คนละไฟล์
const other = await derive('demo2', 'decrypt');
ok('ชื่อต่างกันได้ไฟล์คนละชื่อ', other.id !== s.id);
ok('ใช้ชื่อผิดถอดรหัสไม่ได้', await throws(() => open('demo2', s.entry)));

// ③ ไฟล์ถูกแก้แม้ตัวเดียวต้องถอดไม่ได้ (ของเสียต้องแดง)
const c = Buffer.from(s.entry.c, 'base64'); c[0] ^= 1;
ok('ไฟล์ถูกแก้ 1 บิตถอดไม่ได้', await throws(() => open('demo', { i: s.entry.i, c: c.toString('base64') })));

// ④ สุ่ม iv ใหม่ทุกครั้ง ลิงก์เดิมบันทึกซ้ำได้ข้อมูลไม่ซ้ำ แต่ชื่อไฟล์เดิม
const s2 = await seal('demo', url);
ok('บันทึกซ้ำได้ชื่อไฟล์เดิม', s2.id === s.id);
ok('บันทึกซ้ำได้ข้อมูลเข้ารหัสไม่ซ้ำ', s2.entry.c !== s.entry.c);

// ⑤ ตัวหาปลายทางหลุด ต้องจับของที่ใส่ไว้ได้ และไม่จับของสะอาด
const company = 'https://org0000test.crm5.dynamics.com/main.aspx?appid=1234';
ok('จับปลายทางเต็มที่หลุด', leaks([['a.txt', 'ลิงก์ ' + company]], [company]).length === 1);
ok('จับชื่อโฮสต์บริษัทที่หลุด', leaks([['b.txt', 'org0000test.crm5.dynamics.com']], [company]).length === 1);
ok('ไม่จับไฟล์สะอาด', leaks([['c.txt', 'ไม่มีอะไร']], [company]).length === 0);
ok('ไม่จับเว็บสาธารณะของเราเองบน github.io', leaks([['d.txt', 'https://patcharasitp.github.io/filekit/']], ['https://patcharasitp.github.io/filekit/']).length === 0);

// ⑥ กติกาชื่อลิงก์
ok('ชื่อที่ใช้ได้ผ่าน', ['sa', 'sa-2026', 'r1', 'x'].every((v) => VALID.test(v)));
ok('ชื่อที่ใช้ไม่ได้ตก', ['-sa', 'a b', 'ไทย', 'SA', '', 'a'.repeat(33)].every((v) => !VALID.test(v)));

// ⑦ ค่าคงที่ฝั่งหน้าเว็บต้องตรงกับฝั่งสร้าง ไม่งั้นลิงก์ที่สร้างไว้เปิดไม่ได้ทั้งหมด
const js = readFileSync(new URL('../go/go.js', import.meta.url), 'utf8');
ok('SALT ตรงกันสองฝั่ง', js.includes(`const SALT = '${SALT}';`));
ok('ITER ตรงกันสองฝั่ง', js.includes(`const ITER = ${ITER};`));
ok('กติกาชื่อตรงกันสองฝั่ง', js.includes(`const VALID = ${VALID};`));

console.log(fail ? `❌ ตก ${fail} ผ่าน ${pass}` : `✅ ผ่านครบ ${pass} ข้อ`);
process.exitCode = fail ? 1 : 0;
