// แกนกลางของลิงก์ย่อ (24/09/2026) ใช้ร่วมกันทั้งหน้าพาไป (go.js) หน้าสร้างลิงก์ (new/new.js) และสคริปต์ฝั่งเครื่อง (tools/golink.mjs บน Node 20)
// ทุกฝั่งเรียกไฟล์นี้ไฟล์เดียว ค่าคงที่จึงเพี้ยนกันไม่ได้
// ชื่อลิงก์ผ่าน PBKDF2 ได้ 44 ไบต์ 12 ไบต์แรกเป็นชื่อไฟล์ข้อมูล 32 ไบต์ถัดไปเป็นกุญแจ AES-GCM
// ในรีโปข้อมูลจึงไม่มีทั้งชื่อลิงก์และปลายทางแบบอ่านออก ‼️ เปลี่ยน SALT หรือ ITER = ลิงก์เดิมเปิดไม่ได้ทั้งหมด
export const SALT = 'pond-go-v1';
export const ITER = 60000;
export const VALID = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const OWNER = 'PatcharasitP';
export const REPO = 'golinks';
export const BRANCH = 'main';
export const DATA = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/l/`;
export const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/l/`;
export const SITE = 'https://patcharasitp.github.io/filekit/go/';

const enc = new TextEncoder();
export const toB64 = (u) => btoa(String.fromCharCode(...u));
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');

export async function derive(slug, usage) {
  const base = await crypto.subtle.importKey('raw', enc.encode(slug), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITER, hash: 'SHA-256' }, base, 44 * 8));
  const key = await crypto.subtle.importKey('raw', bits.slice(12, 44), 'AES-GCM', false, [usage]);
  return { id: hex(bits.slice(0, 12)), key };
}

export async function seal(slug, url) {
  const { id, key } = await derive(slug, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(url)));
  return { id, entry: { i: toB64(iv), c: toB64(c) } };
}

export async function open(slug, entry) {
  const { key } = await derive(slug, 'decrypt');
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(entry.i) }, key, fromB64(entry.c));
  return new TextDecoder().decode(p);
}

// ชื่อสุ่มตัดตัวที่อ่านสับสน (0 o 1 l i) ออก สุ่มแบบตัดค่าที่เกินทิ้งจะได้ไม่เอียงไปทางตัวต้น ๆ
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomSlug(n = 8) {   // 8 ตัว ไล่เดาครบบนแล็ปท็อปราว 23 ปี (6 ตัวแค่ 8.7 วัน วัดโดยพี่ปริม 24/09)
  let out = '';
  while (out.length < n) {
    for (const x of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (x < 248 && out.length < n) out += ALPHA[x % ALPHA.length];   // 248 = 31 x 8
    }
  }
  return out;
}

// ปลายทางที่ยอมพาไป: https เท่านั้น ห้ามมีชื่อผู้ใช้หรือรหัสใน URL (กัน https://ของจริง@ของปลอม)
export function checkUrl(u) {
  if (typeof u !== 'string' || /\s/.test(u)) return null;
  let x; try { x = new URL(u); } catch (e) { return null; }
  return x.protocol === 'https:' && !x.username && !x.password ? x : null;
}
export const isHttps = (u) => !!checkUrl(u);

// โฮสต์ที่พาไปได้ทันที เก็บเป็นแฮชเพื่อไม่ให้ชื่อโฮสต์บริษัทโผล่ในรีโปสาธารณะ (ต้องมีข้อ 4 ของพี่ปริม 24/09/2026)
// ปลายทางอื่นทุกอันต้องโชว์ชื่อโดเมนให้คนกดเองก่อน ลิงก์ phishing ที่คนถือ token ที่รั่วสร้างจึงไม่พาไปเงียบ ๆ
// ‼️ ใส่เฉพาะโฮสต์ที่คนนอกสร้างเนื้อหาไม่ได้ ห้ามใส่ *.github.io ทั้งหมด forms.office.com docs.google.com หรือ SharePoint ของ tenant อื่น
// ‼️ ห้ามย้ายรายการนี้ไปไว้ในรีโป golinks (token ของหน้าสร้างลิงก์เขียนรีโปนั้นได้)
// รายการตอนนี้ 3 โฮสต์: example.com (ใช้ในเทส), เว็บ GitHub Pages ของพี่ปอนด์เอง, environment Dynamics ของบริษัท 1 ตัว
export const TRUSTED = [
  '00dbd1b292f6bf571074fe5b646405420e37b58946c5231190ba11c6cb7692c1',
  'b184fae5c04001c79a22020ec7e12713c54890e475a9890c752d86ff7a31f926',
  'b2fc70b45e16bc23fd7c3c28cda097a0f5ea18613b0a625f736e3a817e4c311a',
];
export async function hostHash(host) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('pond-go-host:' + host.toLowerCase()))));
}
export async function trusted(url) { return TRUSTED.includes(await hostHash(url.hostname)); }
