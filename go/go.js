// ลิงก์ย่อของพี่ปอนด์ อยู่ใต้ FileKit (24/09/2026) เปิดด้วย https://patcharasitp.github.io/filekit/go/?ชื่อ
// ชื่อลิงก์ผ่าน PBKDF2 ได้ทั้งชื่อไฟล์ข้อมูลและกุญแจถอดรหัส ในรีโปจึงไม่มีทั้งชื่อลิงก์และปลายทางแบบอ่านออก
// ค่าคงที่สามตัวข้างล่างต้องตรงกับ tools/golink.mjs ทุกตัว ไม่งั้นลิงก์ที่สร้างไว้เปิดไม่ได้ทั้งหมด
// ทุก path เป็นแบบสัมพัทธ์ หน้าเดียวกันใช้ได้ทั้งบนเว็บจริง (/filekit/go/) และตอนเทสในเครื่อง (/go/)
const SALT = 'pond-go-v1';
const ITER = 60000;
const VALID = /^[a-z0-9][a-z0-9-]{0,31}$/;

const enc = new TextEncoder();
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');

async function derive(slug) {
  const base = await crypto.subtle.importKey('raw', enc.encode(slug), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITER, hash: 'SHA-256' }, base, 44 * 8));
  const key = await crypto.subtle.importKey('raw', bits.slice(12, 44), 'AES-GCM', false, ['decrypt']);
  return { id: hex(bits.slice(0, 12)), key };
}

// รับสองแบบ ?ชื่อ กับ #ชื่อ (FileKit ไม่มีหน้า 404 ของตัวเอง จึงไม่รับแบบ /go/ชื่อ)
function slugFromLocation() {
  const q = location.search.slice(1).split('&')[0];
  const h = location.hash.slice(1);
  try { return decodeURIComponent(q || h).trim().toLowerCase(); } catch (e) { return ''; }
}

function show(id, slug) {
  document.body.dataset.state = id;
  document.querySelectorAll('[data-view]').forEach((el) => { el.hidden = el.dataset.view !== id; });
  if (slug) document.querySelectorAll('[data-slug]').forEach((el) => { el.textContent = slug; });
  if (id !== 'wait') { const f = document.getElementById('name'); if (f) f.focus(); }
}

async function go() {
  const slug = slugFromLocation();
  if (!slug) return show('home');
  if (!VALID.test(slug)) return show('notfound', slug);
  show('wait', slug);
  try {
    const { id, key } = await derive(slug);
    const r = await fetch('l/' + id + '.json', { cache: 'no-store' });
    if (!r.ok) return show('notfound', slug);
    const e = await r.json();
    const url = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(e.i) }, key, b64(e.c)));
    if (!/^https:\/\//i.test(url)) return show('error', slug);
    location.replace(url);
  } catch (err) {
    show('error', slug);
  }
}

document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = document.getElementById('name').value.trim().toLowerCase();
  if (v) location.href = '?' + encodeURIComponent(v);
});
window.addEventListener('hashchange', go);
go();
