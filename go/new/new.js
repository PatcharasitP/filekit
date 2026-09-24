// หน้าสร้างลิงก์ย่อ (24/09/2026) เจ้าของใช้คนเดียว วางลิงก์ยาว กดปุ่มเดียว ได้ลิงก์สั้นทันที
// เข้ารหัสในเบราว์เซอร์ด้วย core.js แล้วเขียนไฟล์ลงรีโป golinks ผ่าน GitHub API ด้วย fine-grained token ของเจ้าของ
// กติกาจากรีวิวพี่ปริม 24/09/2026 (.claude/agent-progress/golink-selfserve-security.md)
// ‼️ token อยู่ในตัวแปรของหน้านี้อย่างเดียว ห้ามลง localStorage sessionStorage IndexedDB cookie
//    origin patcharasitp.github.io ใช้ร่วมกับเว็บอื่นของพี่ปอนด์ ของใน storage เว็บอื่นอ่านได้ (พิสูจน์แล้ว)
// ‼️ ประวัติลิงก์ก็ห้ามลง storage ชื่อลิงก์คือกุญแจถอดรหัส เก็บชื่อก็เท่ากับเก็บปลายทาง
// ‼️ ข้อความ commit ห้ามมีชื่อลิงก์หรือปลายทาง รีโปเป็นสาธารณะ
// ‼️ token ส่งไปที่ api.github.com ที่เดียว
import { VALID, BRANCH, OWNER, REPO, API, DATA, SITE, seal, randomSlug, checkUrl, toB64 } from '../core.js';

const $ = (s) => document.querySelector(s);
const GH = 'https://api.github.com';
const IDLE_MS = 15 * 60 * 1000;
let tok = '';
let idle = 0;
const hist = [];

function forget() { tok = ''; clearTimeout(idle); }
function touch() { clearTimeout(idle); idle = setTimeout(() => { forget(); view('หมดเวลา 15 นาที ลบ token ออกแล้ว วางใหม่เมื่อจะใช้'); }, IDLE_MS); }
addEventListener('pagehide', forget);

function gh(url, opts = {}) {
  const headers = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...opts, headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
}
const put = (url, message, text, sha) => gh(url, { method: 'PUT', body: JSON.stringify({ message, branch: BRANCH, content: toB64(new TextEncoder().encode(text)), ...(sha ? { sha } : {}) }) });

function msg(el, text, kind = '') { el.textContent = text; el.className = 'msg' + (kind ? ' ' + kind : ''); }

function renderHistory() {
  const ul = $('#histList'); ul.textContent = '';
  $('#history').hidden = hist.length === 0;
  for (const it of hist) {
    const li = document.createElement('li');
    const t = document.createElement('div'); t.className = 't';
    t.textContent = SITE + '?' + it.slug;
    const small = document.createElement('small'); small.textContent = it.url; t.appendChild(small);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'quiet'; b.textContent = 'คัดลอก';
    b.addEventListener('click', () => copy(SITE + '?' + it.slug, b));
    li.append(t, b); ul.appendChild(li);
  }
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'คัดลอกแล้ว'; }
  catch (e) { btn.textContent = 'คัดลอกเองได้จากข้อความ'; }
  setTimeout(() => { btn.textContent = 'คัดลอก'; }, 1600);
}

function view(note) {
  const has = !!tok;
  $('#setup').hidden = has; $('#maker').hidden = !has; $('#footer').hidden = !has;
  if (note) msg($('#setupMsg'), note);
  renderHistory();
  (has ? $('#url') : $('#token')).focus();
}

// ตรวจว่า token แคบพอทุกครั้งที่วาง: เขียนรีโป filekit ไม่ได้ และเขียน workflow ใน golinks ไม่ได้ (ต้องมีข้อ 5 ของพี่ปริม)
// ถ้าเขียนได้จริง ลบไฟล์ที่เพิ่งสร้างทันที แล้วไม่ใช้ token นี้
async function tooWide() {
  const probes = [`${GH}/repos/${OWNER}/filekit/contents/go/.scope-probe`, `${GH}/repos/${OWNER}/${REPO}/contents/.github/workflows/scope-probe.yml`];
  for (const url of probes) {
    const r = await put(url, 'ตรวจสิทธิ์ token', 'probe\n');
    if (r.ok) {
      const sha = (await r.json())?.content?.sha;
      if (sha) await gh(url, { method: 'DELETE', body: JSON.stringify({ message: 'ลบไฟล์ตรวจสิทธิ์', sha, branch: BRANCH }) });
      return true;
    }
  }
  return false;
}

$('#save').addEventListener('click', async () => {
  const t = $('#token').value.trim(); const m = $('#setupMsg');
  $('#token').value = '';
  if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(t)) return msg(m, 'ใช้ได้เฉพาะ fine-grained token ที่ขึ้นต้นด้วย github_pat_', 'bad');
  msg(m, 'กำลังตรวจกับ GitHub...');
  tok = t;
  try {
    const r = await gh(`${GH}/user`);
    if (r.status === 401) { forget(); return msg(m, 'GitHub ไม่รับ token นี้ ตรวจว่าคัดลอกครบหรือยังไม่หมดอายุ', 'bad'); }
    const u = r.ok ? await r.json() : null;
    if (!u || u.login !== OWNER) { forget(); return msg(m, 'token นี้ไม่ใช่ของบัญชี ' + OWNER, 'bad'); }
    if ((r.headers.get('x-oauth-scopes') || '').trim()) { forget(); return msg(m, 'นี่เป็น token แบบเก่า ใช้ได้เฉพาะ fine-grained', 'bad'); }
    msg(m, 'กำลังตรวจว่า token แคบพอ...');
    if (await tooWide()) { forget(); return msg(m, 'token นี้เขียนได้กว้างเกินไป ให้สร้างใหม่แบบเลือกรีโป golinks รีโปเดียว และเปิดแค่ Contents', 'bad'); }
  } catch (e) { forget(); return msg(m, 'เชื่อมต่อ GitHub ไม่ได้ ลองใหม่อีกครั้ง', 'bad'); }
  msg(m, ''); touch(); view();
});

// ลิงก์ที่มีกุญแจในตัว (แชร์แบบใครมีลิงก์ก็เปิดได้) คนที่เดาชื่อลิงก์ย่อได้จะเปิดไฟล์ได้ด้วย เตือนก่อน 1 ครั้ง
const SECRETISH = /sharepoint\.com\/:[a-z]:\/[a-z]\/|[?&](e|sig|token|code|key|access_token|auth|password)=/i;
let armed = null;   // ต้องกดซ้ำเมื่อ ชื่อชนของเดิม หรือ ลิงก์มีกุญแจในตัว
$('#make').addEventListener('click', async () => {
  const m = $('#makeMsg'); const btn = $('#make');
  if (!tok) return view();
  const url = $('#url').value.trim();
  let slug = $('#slug').value.trim().toLowerCase();
  if (!checkUrl(url)) return msg(m, 'ลิงก์ยาวต้องขึ้นต้นด้วย https:// ไม่มีช่องว่าง และไม่มีชื่อผู้ใช้หรือรหัสผ่านในลิงก์', 'bad');
  if (slug && !VALID.test(slug)) return msg(m, 'ชื่อใช้ได้แค่ a ถึง z ตัวเลข และขีด ขึ้นต้นด้วยตัวอักษรหรือตัวเลข ยาวไม่เกิน 32 ตัว', 'bad');
  const auto = !slug;
  touch();
  if (SECRETISH.test(url) && !(armed && armed.why === 'secret' && armed.url === url && armed.slug === slug)) {
    armed = { why: 'secret', url, slug };
    return msg(m, 'ลิงก์นี้มีกุญแจในตัว ใครเดาชื่อลิงก์ย่อได้จะเปิดไฟล์ได้ด้วย ถ้ายังต้องการ กด ย่อลิงก์ อีกครั้ง (แนะนำไม่ใส่ชื่อ ให้ระบบสุ่ม)', 'bad');
  }
  btn.disabled = true; msg(m, 'กำลังย่อ...'); $('#result').hidden = true;
  try {
    let id, entry, sha = null;
    for (let tries = 0; ; tries++) {
      if (auto) slug = randomSlug();
      ({ id, entry } = await seal(slug, url));
      const r = await gh(API + id + '.json?ref=' + BRANCH);
      if (r.status === 404) break;
      if (r.status === 401) throw new Error('token');
      if (!r.ok) throw new Error('net');
      if (auto) { if (tries < 5) continue; throw new Error('net'); }
      if (!(armed && armed.why === 'taken' && armed.slug === slug && armed.url === url)) {
        armed = { why: 'taken', slug, url };
        return msg(m, 'ชื่อ ' + slug + ' มีอยู่แล้ว กด ย่อลิงก์ อีกครั้งถ้าต้องการให้ชื่อนี้ไปที่ลิงก์ใหม่แทน', 'bad');
      }
      sha = (await r.json()).sha; break;
    }
    armed = null;
    const res = await put(API + id + '.json', sha ? 'แก้ลิงก์' : 'เพิ่มลิงก์', JSON.stringify(entry) + '\n', sha);
    if (res.status === 401) throw new Error('token');
    if (res.status === 403 || res.status === 404) throw new Error('write');
    if (res.status === 409 || res.status === 422) throw new Error('conflict');
    if (!res.ok) throw new Error('net');
    const short = SITE + '?' + slug;
    $('#shortUrl').textContent = short; $('#openLink').href = short; $('#result').hidden = false;
    msg(m, sha ? 'แทนที่ลิงก์เดิมแล้ว' : 'ย่อเสร็จแล้ว', 'ok');
    const i = hist.findIndex((h) => h.slug === slug); if (i >= 0) hist.splice(i, 1);
    hist.unshift({ slug, url }); renderHistory();
    waitReady(id, entry.c, !!sha);
  } catch (e) {
    if (e.message === 'token') { forget(); view('token ใช้ไม่ได้แล้ว วางใหม่อีกครั้ง'); }
    const t = { token: 'token ใช้ไม่ได้แล้ว วางใหม่อีกครั้ง',
      write: 'token นี้เขียนรีโป golinks ไม่ได้ ตรวจว่าเลือกรีโป golinks และ Contents เป็น Read and write',
      conflict: 'มีการแก้ลิงก์นี้พร้อมกัน ลองกดอีกครั้ง' }[e.message] || 'เชื่อมต่อ GitHub ไม่ได้ ลองใหม่อีกครั้ง';
    msg(m, t, 'bad');
  } finally { btn.disabled = false; }
});

// รอจนหน้าพาไปอ่านไฟล์ใหม่ได้จริงจาก raw ก่อนบอกว่าพร้อมใช้ (ลิงก์ที่แก้ทับ raw เก็บของเดิมไว้ได้ถึง 5 นาที)
async function waitReady(id, c, replaced) {
  const r = $('#readyMsg'); msg(r, 'รอ GitHub อัปเดต...');
  const end = Date.now() + (replaced ? 330000 : 60000);
  while (Date.now() < end) {
    try {
      const res = await fetch(DATA + id + '.json', { cache: 'no-store', credentials: 'omit' });
      if (res.ok && (await res.json()).c === c) return msg(r, 'พร้อมใช้แล้ว', 'ok');
    } catch (e) { /* ลองใหม่รอบหน้า */ }
    await new Promise((ok) => setTimeout(ok, 2500));
  }
  msg(r, replaced ? 'ลิงก์ที่แก้อาจใช้เวลาอีกไม่กี่นาทีก่อนพาไปที่ใหม่' : 'GitHub ยังไม่อัปเดต ลองเปิดอีกครั้งในอีกสักครู่', 'bad');
}

$('#copy').addEventListener('click', (ev) => copy($('#shortUrl').textContent, ev.currentTarget));
$('#clearHist').addEventListener('click', () => { hist.length = 0; renderHistory(); });
$('#forget').addEventListener('click', () => { forget(); view('ลบ token ออกจากหน้านี้แล้ว'); });
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#make').click(); });
$('#slug').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#make').click(); });
$('#token').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#save').click(); });

// ถูกฝังในกรอบของเว็บอื่น ไม่แสดงฟอร์ม (GitHub Pages ส่ง X-Frame-Options ไม่ได้)
if (window.top !== window.self) {
  document.querySelector('main').textContent = 'เปิดหน้านี้ตรง ๆ ไม่ผ่านกรอบของเว็บอื่น';
} else {
  view();
}
