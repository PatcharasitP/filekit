"""
กันอีโมจิกลับเข้ามาในหน้าเว็บ

พี่ปอนด์ทัก 07/09/2026: "ไม่ใช้พวกนี้ มันดูเหมือน AI ทำ" โดยชี้ที่ 🔍 ในช่องค้นหา
อีโมจิคือสัญญาณ "งานที่ไม่มีคนคุมดีไซน์" ที่แรงที่สุด เพราะแต่ละตัวมาคนละสไตล์
คนละน้ำหนัก คนละสี และเปลี่ยนหน้าตาไปตามระบบปฏิบัติการที่เปิด
→ ทุกสัญลักษณ์ต้องเป็นไอคอน SVG ที่เราวาดเองใน src/icons.js
"""
import sys, os, json, subprocess, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOLS = json.loads(subprocess.run(["node", "--input-type=module", "-e",
    'import {TOOLS} from "./src/registry.js"; console.log(JSON.stringify(TOOLS.map(t=>t.id)))'],
    cwd=str(ROOT), capture_output=True, text=True, check=True).stdout)

GRAB = r"""() => {
  const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest("script,style")) continue;
    const m = n.textContent.match(re);
    if (m) out.push({ chars: [...new Set(m)].join(""), where: (el.className || el.tagName) + "" ,
                      text: n.textContent.trim().slice(0, 46) });
  }
  return out;
}"""

TITLES = """() => [...document.querySelectorAll('[title]')]
  .map(e => (e.tagName + '.' + (e.className || '')).slice(0, 34) + ' :: ' + e.getAttribute('title').slice(0, 30))"""

found = {}
tips = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1280, "height": 950})
    for h in [""] + [f"#/{t}" for t in TOOLS]:
        pg.goto("about:blank"); pg.goto(f"{BASE}/{h}", wait_until="networkidle"); pg.wait_for_timeout(300)
        for hit in pg.evaluate(GRAB):
            found.setdefault(hit["chars"], []).append(f'{h or "หน้าแรก"} · “{hit["text"]}”')
        # ‼️ เว็บนี้ไม่ใช้ tooltip ของเบราว์เซอร์เลยสักจุด ของที่กดได้ใช้ aria-label แทน
        for t in pg.evaluate(TITLES):
            tips.append(f'{h or "หน้าแรก"} · {t}')
    b.close()

print(f"ตรวจ {len(TOOLS)+1} หน้า")
bad = False
if found:
    bad = True
    print(f"❌ พบอีโมจิ {len(found)} แบบ — ให้เปลี่ยนเป็นไอคอน SVG ใน src/icons.js:")
    for ch, where in found.items():
        print(f'   {ch}   {where[0]}' + (f'  (และอีก {len(where)-1} จุด)' if len(where) > 1 else ""))
else:
    print("✅ ไม่มีอีโมจิบนหน้าเว็บเลย — ใช้ไอคอนที่วาดเองทั้งหมด")

if tips:
    bad = True
    print(f"❌ พบ tooltip ของเบราว์เซอร์ {len(tips)} จุด — ให้ใช้ aria-label แทน (el() ถอด title ให้อยู่แล้ว")
    print("   ถ้ายังโผล่ แปลว่ามีที่ไหนตั้ง .title ลง element ตรง ๆ โดยไม่ผ่าน el()):")
    for t in tips[:8]:
        print(f'   {t}')
else:
    print("✅ ไม่มี tooltip ของเบราว์เซอร์เลยสักจุด")
sys.exit(1 if bad else 0)
