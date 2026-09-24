#!/usr/bin/env node
// ตัวจัดการลิงก์ย่อของ FileKit (24/09/2026) รันจากโฟลเดอร์ FileKit ข้อมูลอยู่ที่ go/
//   node tools/golink.mjs add <ชื่อ> <ลิงก์เต็ม>   สร้างหรือแก้ลิงก์
//   node tools/golink.mjs rm <ชื่อ>                ลบลิงก์
//   node tools/golink.mjs list                     ดูลิงก์ทั้งหมด (อ่านจาก links.local.json ที่อยู่ในเครื่องเท่านั้น)
//   node tools/golink.mjs check                    ถอดรหัสทุกไฟล์เทียบกับรายการ และตรวจว่าไม่มีปลายทางหลุดในไฟล์ที่ขึ้นรีโป
// ‼️ links.local.json เก็บชื่อกับปลายทางแบบอ่านออก ห้ามขึ้นรีโป (.gitignore กันไว้แล้ว)
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SALT = 'pond-go-v1';   // ต้องตรงกับ go.js
export const ITER = 60000;          // ต้องตรงกับ go.js
export const VALID = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const SITE = 'https://patcharasitp.github.io/filekit/go/';
const FK = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(FK, 'go');
const REG = join(ROOT, 'links.local.json');
const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const hex = (u) => Buffer.from(u).toString('hex');

export async function derive(slug, usage) {
  const base = await subtle.importKey('raw', enc.encode(slug), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITER, hash: 'SHA-256' }, base, 44 * 8));
  const key = await subtle.importKey('raw', bits.slice(12, 44), 'AES-GCM', false, [usage]);
  return { id: hex(bits.slice(0, 12)), key };
}

export async function seal(slug, url) {
  const { id, key } = await derive(slug, 'encrypt');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(url)));
  return { id, entry: { i: Buffer.from(iv).toString('base64'), c: Buffer.from(c).toString('base64') } };
}

export async function open(slug, entry) {
  const { key } = await derive(slug, 'decrypt');
  const p = await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(entry.i, 'base64') }, key, Buffer.from(entry.c, 'base64'));
  return new TextDecoder().decode(p);
}

// หาปลายทางที่หลุดในข้อความ ใช้ทั้งกับไฟล์จริงในรีโปและกับเคสทดสอบที่ใส่ของเสียไว้
export function leaks(texts, urls) {
  const found = [];
  for (const [name, text] of texts) {
    for (const u of urls) {
      const host = new URL(u).host;
      if (/(^|\.)github\.io$/.test(host)) continue;   // เว็บสาธารณะของเราเอง ตั้งใจเปิดเผยอยู่แล้ว
      const bare = u.replace(/^https:\/\//i, '');
      if (text.includes(bare) || (host.length > 8 && text.includes(host))) found.push(`${name}: ${bare.slice(0, 60)}`);
    }
  }
  return found;
}

const loadReg = () => (existsSync(REG) ? JSON.parse(readFileSync(REG, 'utf8')) : {});
const saveReg = (r) => writeFileSync(REG, JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');

async function main([cmd, slug, url]) {
  const reg = loadReg();
  if (cmd === 'add') {
    slug = (slug || '').trim().toLowerCase();
    if (!VALID.test(slug)) throw new Error('ชื่อลิงก์ใช้ได้แค่ a ถึง z ตัวเลข และ - ยาวไม่เกิน 32 ตัว ขึ้นต้นด้วยตัวอักษรหรือตัวเลข');
    if (!/^https:\/\/\S+$/i.test(url || '')) throw new Error('ลิงก์เต็มต้องขึ้นต้นด้วย https:// และไม่มีช่องว่าง');
    const { id, entry } = await seal(slug, url);
    writeFileSync(join(ROOT, 'l', id + '.json'), JSON.stringify(entry) + '\n');
    if (await open(slug, entry) !== url) throw new Error('ถอดรหัสกลับไม่ตรง ไม่บันทึก');
    reg[slug] = { url, id, added: new Date().toISOString().slice(0, 10) };
    saveReg(reg);
    console.log(`${SITE}?${slug}  ->  ${url}`);
  } else if (cmd === 'rm') {
    const e = reg[slug];
    if (!e) throw new Error(`ไม่มีลิงก์ชื่อ ${slug}`);
    const f = join(ROOT, 'l', e.id + '.json');
    if (existsSync(f)) unlinkSync(f);
    delete reg[slug]; saveReg(reg);
    console.log(`ลบ ${slug} แล้ว`);
  } else if (cmd === 'list') {
    for (const [s, e] of Object.entries(reg).sort()) console.log(`${SITE}?${s}  ->  ${e.url}`);
  } else if (cmd === 'check') {
    const bad = [];
    const files = new Set(readdirSync(join(ROOT, 'l')).filter((f) => f.endsWith('.json')));
    for (const [s, e] of Object.entries(reg)) {
      const { id } = await derive(s, 'decrypt');
      if (id !== e.id) bad.push(`${s}: id ในรายการไม่ตรงกับที่คำนวณได้`);
      if (!files.has(id + '.json')) { bad.push(`${s}: ไม่มีไฟล์ l/${id}.json`); continue; }
      files.delete(id + '.json');
      try { if (await open(s, JSON.parse(readFileSync(join(ROOT, 'l', id + '.json'), 'utf8'))) !== e.url) bad.push(`${s}: ถอดแล้วไม่ตรงปลายทาง`); }
      catch { bad.push(`${s}: ถอดรหัสไม่ได้`); }
    }
    for (const f of files) bad.push(`l/${f}: ไม่มีในรายการ (ไฟล์กำพร้า)`);
    // ตรวจเฉพาะไฟล์ที่เกี่ยวกับลิงก์ย่อ (FileKit ทั้งรีโปมีไลบรารีหลายเมกะไบต์ ไม่จำเป็น)
    const tracked = execFileSync('git', ['ls-files', 'go', 'README.md', 'tools/golink.mjs', 'tests/golink.test.mjs'], { cwd: FK, encoding: 'utf8' }).split('\n').filter(Boolean);
    if (tracked.includes('go/links.local.json')) bad.push('go/links.local.json ถูกเพิ่มเข้ารีโป');
    const texts = tracked.filter((f) => existsSync(join(FK, f))).map((f) => [f, readFileSync(join(FK, f), 'utf8')]);
    bad.push(...leaks(texts, Object.values(reg).map((e) => e.url)).map((x) => 'ปลายทางหลุด ' + x));
    console.log(`ตรวจ ${Object.keys(reg).length} ลิงก์ ${tracked.length} ไฟล์ในรีโป`);
    for (const b of bad) console.log('  ❌', b);
    console.log(bad.length ? `❌ เจอ ${bad.length} จุด` : '✅ ถอดได้ครบ ไม่มีปลายทางหลุดในรีโป');
    process.exitCode = bad.length ? 1 : 0;
  } else {
    console.log('ใช้: node tools/golink.mjs add <ชื่อ> <ลิงก์เต็ม> | rm <ชื่อ> | list | check');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error('❌ ' + e.message); process.exitCode = 1; });
}
