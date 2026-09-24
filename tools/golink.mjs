#!/usr/bin/env node
// ตัวจัดการลิงก์ย่อฝั่งเครื่อง (24/09/2026) ใช้แกนเดียวกับหน้าเว็บ (go/core.js) รันจากโฟลเดอร์ FileKit
//   node tools/golink.mjs add <ชื่อ> <ลิงก์เต็ม>   สร้างหรือแก้ลิงก์ แล้ว commit + push รีโป golinks
//   node tools/golink.mjs rm <ชื่อ>                ลบลิงก์
//   node tools/golink.mjs list                     ดูลิงก์ที่สร้างจากเครื่องนี้ (อ่านจาก go/links.local.json)
//   node tools/golink.mjs check [--live]           ถอดรหัสทุกไฟล์เทียบรายการ ตรวจว่าไม่มีปลายทางหลุดในรีโป
//                                                  (--live ยิง raw จริง และตรวจกติกาของรีโป golinks บน GitHub ด้วย)
// รีโปข้อมูลอยู่ข้าง FileKit ที่ ../GoLinksData (ตั้ง GOLINKS_DIR เปลี่ยนได้)
// ‼️ go/links.local.json เก็บชื่อกับปลายทางแบบอ่านออก ห้ามขึ้นรีโปไหนทั้งนั้น (.gitignore ของ FileKit กันไว้)
// ‼️ ลิงก์ที่พี่ปอนด์สร้างจากหน้าเว็บ go/new/ ไม่อยู่ในรายการนี้ (หน้าเว็บเขียนลงเครื่องพี่ไม่ได้) check จึงนับแค่ลิงก์ในรายการ
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALID, SITE, DATA, OWNER, REPO, BRANCH, seal, open, derive, isHttps } from '../go/core.js';

const FK = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.GOLINKS_DIR || join(FK, '..', 'GoLinksData');
const REG = join(FK, 'go', 'links.local.json');

// หาปลายทางที่หลุดในข้อความ ใช้ทั้งกับไฟล์จริงในรีโปและกับเคสทดสอบที่ใส่ของเสียไว้
export function leaks(texts, urls) {
  const found = [];
  for (const [name, text] of texts) {
    for (const u of urls) {
      const host = new URL(u).host;
      if (/(^|\.)(github\.io|example\.com)$/.test(host)) continue;   // เว็บสาธารณะของเราเอง กับ example.com ที่สงวนไว้ใช้ในเทส ตั้งใจเปิดเผยอยู่แล้ว
      const bare = u.replace(/^https:\/\//i, '');
      if (text.includes(bare) || (host.length > 8 && text.includes(host))) found.push(`${name}: ${bare.slice(0, 60)}`);
    }
  }
  return found;
}

// ไฟล์ที่รีโป golinks มีได้ นอกจากนี้ถือว่าแปลก (เช่น token ที่รั่วถูกใช้วางไฟล์อื่น)
const OK_PATH = /^(README\.md|\.gitignore|l\/[0-9a-f]{24}\.json)$/;

// กติกาของรีโป golinks ที่ token ของหน้าสร้างลิงก์เปลี่ยนเองไม่ได้ ตรวจผ่าน endpoint สาธารณะ ไม่ต้องใช้ token (ข้อ 6 ของพี่ปริม 24/09/2026)
// ข้อใดหลุด token ที่รั่วอาจวางโค้ดบนโดเมนเดียวกับเว็บอื่นของพี่ปอนด์ หรือล้างประวัติ commit ได้
// ‼️ ปิด Actions อ่านจากภายนอกไม่ได้ (ต้องใช้สิทธิ์เจ้าของ) จึงตรวจแทนด้วย workflow ต้องเป็น 0 และห้ามมีไฟล์นอก OK_PATH
export async function repoGuards(get = fetch) {
  const R = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const j = async (u) => { const r = await get(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`${u} ตอบ ${r.status}`); return r.json(); };
  const bad = [];
  try {
    if ((await j(R)).has_pages !== false) bad.push('รีโป golinks เปิด GitHub Pages อยู่');
    const pg = await get(`https://${OWNER.toLowerCase()}.github.io/${REPO}/`, { cache: 'no-store', redirect: 'manual' });
    if (pg.status !== 404) bad.push(`หน้า Pages ของ golinks ตอบ ${pg.status} ต้องเป็น 404`);
    const wf = await j(`${R}/actions/workflows`);
    if (wf.total_count !== 0) bad.push(`รีโป golinks มี workflow ${wf.total_count} ตัว`);
    const rules = (await j(`${R}/rules/branches/${BRANCH}`)).map((x) => x.type);
    for (const t of ['deletion', 'non_fast_forward']) if (!rules.includes(t)) bad.push(`ruleset บน ${BRANCH} ไม่มีกฎ ${t}`);
    const tree = await j(`${R}/git/trees/${BRANCH}?recursive=1`);
    for (const x of tree.tree) if (x.type === 'blob' && !OK_PATH.test(x.path)) bad.push(`รีโป golinks บน GitHub มีไฟล์แปลก ${x.path}`);
    if (tree.truncated) bad.push('รายการไฟล์ของ golinks ยาวเกินจะตรวจครบ');
  } catch (e) { bad.push('ตรวจกติกาของรีโป golinks ไม่ได้ ' + e.message); }
  return bad;
}

const loadReg = () => (existsSync(REG) ? JSON.parse(readFileSync(REG, 'utf8')) : {});
const saveReg = (r) => writeFileSync(REG, JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
const git = (...a) => execFileSync('git', ['-C', DATA_DIR, ...a], { encoding: 'utf8' });
// ลิงก์ที่สร้างจากหน้าเว็บเข้ารีโปบน GitHub ตรง ต้องดึงของใหม่ก่อนแก้ ไม่งั้น push ชน
const sync = () => git('-c', 'credential.helper=store', 'pull', '-q', '--ff-only', 'origin', BRANCH);
function publish(msg) {
  git('add', '-A', 'l');
  if (!git('status', '--porcelain', 'l').trim()) return console.log('ไม่มีอะไรเปลี่ยน');
  git('-c', 'user.name=pond', '-c', 'user.email=pond300zx@gmail.com', 'commit', '-q', '-m', msg);   // ‼️ ห้ามใส่ชื่อลิงก์หรือปลายทางในข้อความ commit
  git('-c', 'credential.helper=store', 'push', '-q', 'origin', BRANCH);
}

async function main([cmd, slug, url, flag]) {
  const reg = loadReg();
  if (cmd === 'add') {
    slug = (slug || '').trim().toLowerCase();
    if (!VALID.test(slug)) throw new Error('ชื่อลิงก์ใช้ได้แค่ a ถึง z ตัวเลข และ - ยาวไม่เกิน 32 ตัว ขึ้นต้นด้วยตัวอักษรหรือตัวเลข');
    if (!isHttps(url || '')) throw new Error('ลิงก์เต็มต้องขึ้นต้นด้วย https:// และไม่มีช่องว่าง');
    const { id, entry } = await seal(slug, url);
    if (await open(slug, entry) !== url) throw new Error('ถอดรหัสกลับไม่ตรง ไม่บันทึก');
    sync();
    const existed = existsSync(join(DATA_DIR, 'l', id + '.json'));
    writeFileSync(join(DATA_DIR, 'l', id + '.json'), JSON.stringify(entry) + '\n');
    reg[slug] = { url, id, added: new Date().toISOString().slice(0, 10) };
    saveReg(reg);
    publish(existed ? 'แก้ลิงก์' : 'เพิ่มลิงก์');
    console.log(`${SITE}?${slug}  ->  ${url}`);
  } else if (cmd === 'rm') {
    const e = reg[slug];
    if (!e) throw new Error(`ไม่มีลิงก์ชื่อ ${slug} ในรายการของเครื่องนี้`);
    sync();
    const f = join(DATA_DIR, 'l', e.id + '.json');
    if (existsSync(f)) unlinkSync(f);
    delete reg[slug]; saveReg(reg);
    publish('ลบลิงก์');
    console.log(`ลบ ${slug} แล้ว`);
  } else if (cmd === 'list') {
    for (const [s, e] of Object.entries(reg).sort()) console.log(`${SITE}?${s}  ->  ${e.url}`);
  } else if (cmd === 'check') {
    // ‼️ check --live มาถึงที่นี่ในช่อง slug ไม่ใช่ flag เดิมเช็คแค่ flag กับ url การตรวจ live จึงไม่เคยรัน (เจอ 24/09/2026)
    const live = [slug, url, flag].includes('--live');
    const bad = []; let rawHits = 0;
    for (const [s, e] of Object.entries(reg)) {
      const { id } = await derive(s, 'decrypt');
      if (id !== e.id) bad.push(`${s}: id ในรายการไม่ตรงกับที่คำนวณได้`);
      const f = join(DATA_DIR, 'l', id + '.json');
      if (!existsSync(f)) { bad.push(`${s}: ไม่มีไฟล์ l/${id}.json ในรีโป golinks`); continue; }
      try { if (await open(s, JSON.parse(readFileSync(f, 'utf8'))) !== e.url) bad.push(`${s}: ถอดแล้วไม่ตรงปลายทาง`); }
      catch { bad.push(`${s}: ถอดรหัสไม่ได้`); }
      if (live) {
        const r = await fetch(DATA + id + '.json', { cache: 'no-store' }); rawHits++;
        if (!r.ok) bad.push(`${s}: raw ตอบ ${r.status}`);
        else if (await open(s, await r.json()) !== e.url) bad.push(`${s}: raw ถอดแล้วไม่ตรง`);
      }
    }
    const tracked = git('ls-files').split('\n').filter(Boolean);
    const texts = tracked.filter((f) => existsSync(join(DATA_DIR, f))).map((f) => [f, readFileSync(join(DATA_DIR, f), 'utf8')]);
    const fk = execFileSync('git', ['-C', FK, 'ls-files', 'go', 'README.md', 'tools/golink.mjs', 'tests'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (fk.includes('go/links.local.json')) bad.push('go/links.local.json ถูกเพิ่มเข้ารีโป FileKit');
    texts.push(...fk.filter((f) => existsSync(join(FK, f)) && !/\.(png|jpe?g|pdf|xlsx|docx|zip|woff2?)$/i.test(f)).map((f) => ['FileKit/' + f, readFileSync(join(FK, f), 'utf8')]));
    for (const f of tracked.filter((x) => !OK_PATH.test(x))) bad.push(`รีโป golinks มีไฟล์แปลก ${f}`);
    if (live) bad.push(...await repoGuards());
    bad.push(...leaks(texts, Object.values(reg).map((e) => e.url)).map((x) => 'ปลายทางหลุด ' + x));
    console.log(`ตรวจ ${Object.keys(reg).length} ลิงก์ในรายการ ไฟล์ข้อมูล ${readdirSync(join(DATA_DIR, 'l')).length} ไฟล์`);
    for (const b of bad) console.log('  ❌', b);
    if (live) console.log(`ยิง raw จริง ${rawHits} ลิงก์ และตรวจกติการีโป golinks บน GitHub แล้ว`);
    console.log(bad.length ? `❌ เจอ ${bad.length} จุด` : '✅ ถอดได้ครบ ไม่มีปลายทางหลุด');
    process.exitCode = bad.length ? 1 : 0;
  } else {
    console.log('ใช้: node tools/golink.mjs add <ชื่อ> <ลิงก์เต็ม> | rm <ชื่อ> | list | check [--live]');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error('❌ ' + e.message); process.exitCode = 1; });
}
