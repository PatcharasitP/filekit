// เทสลิงก์ย่อของ FileKit รัน: node tests/golink.test.mjs (ทุกข้อต้องแดงเป็นเมื่อของเสีย ไม่ใช่เขียวอย่างเดียว)
// ใช้ go/core.js ตัวเดียวกับที่หน้าเว็บโหลด (Node 20 มี crypto.subtle atob btoa ครบ)
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seal, open, derive, randomSlug, isHttps, checkUrl, trusted, VALID } from '../go/core.js';
import { leaks, repoGuards } from '../tools/golink.mjs';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra); } };
const throws = async (f) => { try { await f(); return false; } catch { return true; } };

// ① ถอดกลับได้ตรง และไฟล์ไม่มีของอ่านออก
const url = 'https://example.com/path?x=1&y=ไทย';
const s = await seal('demo', url);
ok('ถอดกลับได้ตรงทุกตัวอักษร', (await open('demo', s.entry)) === url);
ok('ชื่อไฟล์เป็นเลขฐานสิบหก 24 ตัว ไม่มีชื่อลิงก์ในนั้น', /^[0-9a-f]{24}$/.test(s.id) && !s.id.includes('demo'));
ok('ไฟล์ข้อมูลไม่มีปลายทางแบบอ่านออก', !JSON.stringify(s.entry).includes('example.com'));

// ② ลิงก์เดิมที่สร้างก่อนย้ายมาใช้ core.js ยังได้ชื่อไฟล์เดิม (ลิงก์ที่แจกไปแล้วต้องไม่ตาย)
ok('portfolio กับ filekit ยังได้ไฟล์เดิมที่ขึ้นเว็บไปแล้ว (ค่าจากรายการจริง 24/09)', (await derive('portfolio', 'decrypt')).id === '7a98a15bdf9bcc27459caf96' && (await derive('filekit', 'decrypt')).id === 'a8c487d6c00b29c8aae8d543');

// ③ ชื่อผิดเปิดไม่ได้ และไฟล์ถูกแก้แม้ 1 บิตถอดไม่ได้
ok('ชื่อต่างกันได้ไฟล์คนละชื่อ', (await derive('demo2', 'decrypt')).id !== s.id);
ok('ใช้ชื่อผิดถอดรหัสไม่ได้', await throws(() => open('demo2', s.entry)));
const c = Buffer.from(s.entry.c, 'base64'); c[0] ^= 1;
ok('ไฟล์ถูกแก้ 1 บิตถอดไม่ได้', await throws(() => open('demo', { i: s.entry.i, c: c.toString('base64') })));

// ④ บันทึกซ้ำ ชื่อไฟล์เดิม แต่ข้อมูลเข้ารหัสไม่ซ้ำ (iv สุ่มใหม่)
const s2 = await seal('demo', url);
ok('บันทึกซ้ำได้ชื่อไฟล์เดิม', s2.id === s.id);
ok('บันทึกซ้ำได้ข้อมูลเข้ารหัสไม่ซ้ำ', s2.entry.c !== s.entry.c);

// ⑤ ชื่อสุ่ม: ยาว 8 ตัว (รีวิวพี่ปริม 6 ตัวไล่เดาครบ 8.7 วัน) ผ่านกติกาชื่อ ไม่มีตัวที่อ่านสับสน และไม่ซ้ำกันง่าย
const many = Array.from({ length: 2000 }, () => randomSlug());
ok('ชื่อสุ่มยาว 8 และผ่านกติกาชื่อทุกตัว', many.every((x) => x.length === 8 && VALID.test(x)));
ok('ชื่อสุ่มไม่มี 0 o 1 l i', many.every((x) => !/[01oli]/.test(x)));
ok('ชื่อสุ่ม 2000 ตัวไม่ซ้ำกัน', new Set(many).size === many.length);

// ⑥ ปลายทางต้องเป็น https เท่านั้น
ok('https ผ่าน', isHttps('https://example.com/a?b=1'));
ok('javascript: http: data: มีช่องว่าง และมีชื่อผู้ใช้ในลิงก์ ไม่ผ่าน', ['javascript:alert(1)', 'http://example.com', 'data:text/html,x', 'https://exa mple.com', '', 'https://example.com@evil.example/', 'https://u:p@example.com/'].every((u) => !isHttps(u)));

// ⑥.5 โฮสต์ที่พาไปทันที ต้องตรงทั้งชื่อ ไม่ใช่แค่ขึ้นต้นหรือลงท้ายเหมือน
ok('example.com อยู่ในรายการ', await trusted(checkUrl('https://example.com/x')));
ok('evil.example ไม่อยู่ในรายการ', !(await trusted(checkUrl('https://evil.example/'))));
ok('example.com.evil.example ไม่นับว่าอยู่ในรายการ', !(await trusted(checkUrl('https://example.com.evil.example/'))));
ok('ตัวพิมพ์ใหญ่ของโฮสต์เดิมยังนับ', await trusted(checkUrl('https://EXAMPLE.com/')));

// ⑦ กติกาชื่อลิงก์
ok('ชื่อที่ใช้ได้ผ่าน', ['sa', 'sa-2026', 'r1', 'x'].every((v) => VALID.test(v)));
ok('ชื่อที่ใช้ไม่ได้ตก', ['-sa', 'a b', 'ไทย', 'SA', '', 'a'.repeat(33)].every((v) => !VALID.test(v)));

// ⑧ ตัวหาปลายทางหลุด ต้องจับของที่ใส่ไว้ได้ และไม่จับของสะอาด
const company = 'https://org0000test.crm5.dynamics.com/main.aspx?appid=1234';
ok('จับปลายทางเต็มที่หลุด', leaks([['a.txt', 'ลิงก์ ' + company]], [company]).length === 1);
ok('จับชื่อโฮสต์บริษัทที่หลุด', leaks([['b.txt', 'org0000test.crm5.dynamics.com']], [company]).length === 1);
ok('ไม่จับไฟล์สะอาด', leaks([['c.txt', 'ไม่มีอะไร']], [company]).length === 0);
ok('ไม่จับเว็บสาธารณะของเราเองบน github.io', leaks([['d.txt', 'https://patcharasitp.github.io/filekit/']], ['https://patcharasitp.github.io/filekit/']).length === 0);
ok('ไม่จับ example.com ที่สงวนไว้ใช้ในเทส', leaks([['e.txt', 'https://example.com/filekit-go-selftest']], ['https://example.com/filekit-go-selftest']).length === 0);
ok('ชื่อที่หน้าตาคล้าย example.com.evil.example ยังถูกจับ', leaks([['f.txt', 'example.com.evil.example/path']], ['https://example.com.evil.example/path']).length === 1);

// ⑨ ทุกหน้าใช้แกนเดียว ห้ามประกาศค่าคงที่ซ้ำ (เคยต้องมีเทสเทียบสองฝั่ง ตอนนี้บังคับให้มีที่เดียว)
for (const f of ['../go/go.js', '../go/new/new.js', '../tools/golink.mjs']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  ok(`${f.replace('../', '')} ใช้ core.js ไม่ประกาศ SALT หรือ ITER เอง`, /from '\.\.?\/?(go\/)?(\.\.\/)?core\.js'|from '\.\.\/core\.js'|from '\.\/core\.js'|from '\.\.\/go\/core\.js'/.test(src) && !/const (SALT|ITER)\s*=/.test(src));
}
// ⑩ ข้อความ commit ในหน้าสร้างลิงก์ต้องไม่ใส่ชื่อลิงก์หรือปลายทาง (รีโปเป็นสาธารณะ)
const nj = readFileSync(new URL('../go/new/new.js', import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   // ตัดคอมเมนต์ก่อนตรวจ คอมเมนต์พูดถึงคำต้องห้ามได้
const puts = [...code(nj).matchAll(/put\(([^,]+),\s*([^,]+),/g)].map((m) => m[2].trim());
ok(`ข้อความ commit ทุกจุดเป็นคำคงที่ (${puts.length} จุด)`, puts.length >= 2 && puts.every((a) => /^'[^']*'$/.test(a) || a === "sha ? 'แก้ลิงก์' : 'เพิ่มลิงก์'"), puts.join(' | '));

// ⑪ ข้อบังคับจากรีวิวพี่ปริม ตรวจจากโค้ดตรง ๆ
const hNew = readFileSync(new URL('../go/new/index.html', import.meta.url), 'utf8');
const hGo = readFileSync(new URL('../go/index.html', import.meta.url), 'utf8');
const csp = (h) => (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1];
ok('CSP หน้าพาไปตรงตัว', csp(hGo) === "default-src 'none'; script-src 'self'; connect-src https://raw.githubusercontent.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
ok('CSP หน้าสร้างลิงก์ตรงตัว', csp(hNew) === "default-src 'none'; script-src 'self'; connect-src https://api.github.com https://raw.githubusercontent.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
const goSrc = ['../go/go.js', '../go/core.js', '../go/new/new.js'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
ok('โค้ด go/ ไม่เขียน HTML ลงหน้า (innerHTML outerHTML insertAdjacentHTML document.write)', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(goSrc));
ok('หน้าสร้างลิงก์ไม่แตะ storage ใด ๆ (ไม่นับคอมเมนต์)', !/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(code(nj)));
ok('หน้าสร้างลิงก์รับเฉพาะ github_pat_', nj.includes("/^github_pat_[A-Za-z0-9_]{20,}$/") && !nj.includes('ghp_'));

// ⑫ กติกาของรีโป golinks (ข้อ 6 ของพี่ปริม) ตัวตรวจต้องจับได้ทุกข้อ ป้อนคำตอบปลอมแทน GitHub
const good = {
  'https://api.github.com/repos/PatcharasitP/golinks': { has_pages: false },
  'https://patcharasitp.github.io/golinks/': 404,
  'https://api.github.com/repos/PatcharasitP/golinks/actions/workflows': { total_count: 0 },
  'https://api.github.com/repos/PatcharasitP/golinks/rules/branches/main': [{ type: 'deletion' }, { type: 'non_fast_forward' }],
  'https://api.github.com/repos/PatcharasitP/golinks/git/trees/main?recursive=1': { truncated: false, tree: [{ path: 'README.md', type: 'blob' }, { path: 'l', type: 'tree' }, { path: 'l/c42f8ce3da8cfddf9c667baa.json', type: 'blob' }] },
};
const fake = (over = {}) => async (u) => {
  const v = u in over ? over[u] : good[u];
  if (v === undefined) return { ok: false, status: 404, json: async () => ({}) };
  if (typeof v === 'number') return { ok: v < 400, status: v, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => v };
};
ok('รีโปตั้งถูกทุกข้อ ไม่เจออะไร', (await repoGuards(fake())).length === 0);
const R = 'https://api.github.com/repos/PatcharasitP/golinks';
const cases = [
  ['เปิด Pages', { [R]: { has_pages: true } }, 'Pages'],
  ['หน้า Pages ตอบ 200', { 'https://patcharasitp.github.io/golinks/': 200 }, 'ตอบ 200'],
  ['มี workflow', { [R + '/actions/workflows']: { total_count: 1 } }, 'workflow'],
  ['ruleset ไม่กัน force push', { [R + '/rules/branches/main']: [{ type: 'deletion' }] }, 'non_fast_forward'],
  ['ไม่มี ruleset เลย', { [R + '/rules/branches/main']: [] }, 'deletion'],
  ['มีไฟล์ workflow ในรีโป', { [R + '/git/trees/main?recursive=1']: { truncated: false, tree: [{ path: '.github/workflows/x.yml', type: 'blob' }] } }, '.github/workflows/x.yml'],
  ['มีไฟล์ html ในรีโป', { [R + '/git/trees/main?recursive=1']: { truncated: false, tree: [{ path: 'index.html', type: 'blob' }] } }, 'index.html'],
  ['GitHub ตอบไม่ได้', { [R]: 503 }, 'ตรวจกติกา'],
];
for (const [label, over, word] of cases) {
  const bad = await repoGuards(fake(over));
  ok(`ตัวตรวจรีโปจับ ${label}`, bad.length >= 1 && bad.some((b) => b.includes(word)), bad.join(' | '));
}

// ⑬ check --live ต้องยิงของจริงทุกครั้ง (เดิม --live ตกไปอยู่ช่องชื่อลิงก์ การตรวจ live ไม่เคยรันเลยตั้งแต่ v164 เจอ 24/09/2026)
//     แทน fetch ด้วยตัวที่ตอบ 599 ทุกครั้ง ถ้าการตรวจ live รันจริงต้องเห็นข้อความตรวจรีโปไม่ได้ และจบด้วยรหัส 1
if (existsSync(new URL('../../GoLinksData/.git', import.meta.url))) {
  const stub = 'data:text/javascript,globalThis.fetch=async()=>({ok:false,status:599,json:async()=>({})})';
  const r = spawnSync(process.execPath, ['--import', stub, fileURLToPath(new URL('../tools/golink.mjs', import.meta.url)), 'check', '--live'], { encoding: 'utf8' });
  ok('check --live ยิงของจริงทุกครั้ง', r.status === 1 && r.stdout.includes('ตรวจกติกาของรีโป golinks ไม่ได้'), (r.stdout + r.stderr).slice(-300));
} else console.log('  ⏭️ ข้าม check --live เพราะไม่มีรีโป GoLinksData ข้าง FileKit');

console.log(fail ? `❌ ตก ${fail} ผ่าน ${pass}` : `✅ ผ่านครบ ${pass} ข้อ`);
process.exitCode = fail ? 1 : 0;
