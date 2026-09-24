// หน้าพาไปของลิงก์ย่อ (24/09/2026) เปิดด้วย https://patcharasitp.github.io/filekit/go/?ชื่อ หรือ #ชื่อ
// อ่านไฟล์ข้อมูลที่เข้ารหัสจากรีโป golinks ผ่าน raw.githubusercontent.com ลิงก์ที่สร้างใหม่จึงใช้ได้ทันทีโดยไม่ต้องรอ FileKit ขึ้นเว็บใหม่
import { VALID, DATA, derive, open, checkUrl, trusted } from './core.js';

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
    const { id } = await derive(slug, 'decrypt');
    const r = await fetch(DATA + id + '.json', { cache: 'no-store', credentials: 'omit' });
    if (r.status === 404) return show('notfound', slug);
    if (!r.ok) return show('error', slug);
    const url = checkUrl(await open(slug, await r.json()));
    if (!url) return show('error', slug);
    if (await trusted(url)) return location.replace(url.href);
    // โดเมนนอกรายการ โชว์ชื่อโดเมนก่อน ให้คนกดเอง (กันลิงก์ phishing ถ้า token ของหน้าสร้างลิงก์รั่ว)
    document.getElementById('host').textContent = url.hostname;
    document.getElementById('goOn').href = url.href;
    show('confirm', slug);
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
