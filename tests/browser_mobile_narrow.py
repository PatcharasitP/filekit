"""มือถือจอแคบสุด (iPhone SE 320x568 บน WebKit เครื่องยนต์จริงของ iPhone) ไล่ทุกเครื่องมือ ตรวจ 2 ข้อที่ browser_mobile (390px Chromium) มองไม่เห็น

① ชื่อไฟล์ในแถวไฟล์ต้องกว้างอย่างน้อย 100px
   ไล่หลายรุ่น 09/11/2026 เจอ excel-merge บน 320px ชื่อไฟล์เหลือกว้าง 6px อ่านได้แค่ "ตั"
   เพราะป้ายสถานะกับปุ่มขึ้นลงลบ 3 ปุ่มเบียดอยู่บรรทัดเดียว (390px ยังพอ จึงไม่เคยตก)
② ช่องพิมพ์ ตัวเลือก กล่องข้อความ ต้องตัวอักษร 16px ขึ้นไป
   ต่ำกว่า 16px แตะแล้ว Safari บน iPhone ซูมทั้งหน้า ต้องถ่างนิ้วกลับเอง (ไล่เจอ 31 เครื่องมือ)

ใช้: FK_BASE=http://127.0.0.1:PORT python3 tests/browser_mobile_narrow.py   (NARROW_ONLY=a,b ไล่เฉพาะบางตัว)
แดงก่อนเขียว: รันกับ v225 ก่อนแก้ ตกทั้งสองข้อ (หลักฐาน .claude/evidence/2026-11-09-fk-v225/narrow_red.log)
"""
import os, re, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8971").rstrip("/")
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
TOOLS = [m.group(1) for m in re.finditer(r'\{\s*id:"([\w-]+)",\s*group:', reg)]
if os.environ.get("NARROW_ONLY"):
    TOOLS = [t for t in TOOLS if t in os.environ["NARROW_ONLY"].split(",")]
MIN_NAME = 100
MIN_FONT = 16

MEASURE = """() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' };
  const names = [...document.querySelectorAll('.file-row .f-meta')].filter(vis)
    .map((e) => ({ w: Math.round(e.getBoundingClientRect().width), t: (e.textContent || '').trim().slice(0, 24) }));
  const small = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=range]):not([type=color]), select, textarea')]
    .filter(vis).filter((e) => parseFloat(getComputedStyle(e).fontSize) < %d)
    .map((e) => (e.id || e.getAttribute('aria-label') || e.placeholder || e.tagName).toString().slice(0, 24) + ' ' + getComputedStyle(e).fontSize);
  return { names, small };
}""" % MIN_FONT

fails = []
with sync_playwright() as p:
    dev = p.devices["iPhone SE"]
    b = p.webkit.launch()
    ctx = b.new_context(**dev)
    ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
    pg = ctx.new_page()
    for tid in TOOLS:
        try:
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle", timeout=30000)
            pg.wait_for_timeout(400)
            had = pg.evaluate("""() => { const b = [...document.querySelectorAll('button')]
                .find((e) => e.offsetParent && /ลองด้วยไฟล์ตัวอย่าง/.test(e.textContent)); if (b) b.click(); return !!b }""")
            if had:
                try: pg.wait_for_selector(".file-row", timeout=6000)
                except Exception: pass
                pg.wait_for_timeout(600)
            m = pg.evaluate(MEASURE)
        except Exception as e:
            fails.append(f"{tid}: เปิดไม่ได้ {str(e).splitlines()[0][:80]}")
            continue
        thin = [n for n in m["names"] if n["w"] < MIN_NAME]
        if thin:
            fails.append(f"{tid}: ① ชื่อไฟล์กว้าง {thin[0]['w']}px ({thin[0]['t']!r}) ต้อง ≥{MIN_NAME}px")
        if m["small"]:
            fails.append(f"{tid}: ② ช่องพิมพ์เล็กกว่า {MIN_FONT}px {m['small'][:3]}")
    b.close()

for f in fails:
    print("❌", f)
print(f"browser_mobile_narrow: {len(TOOLS)} เครื่องมือ, ตก {len(fails)} ข้อ")
sys.exit(1 if fails else 0)
