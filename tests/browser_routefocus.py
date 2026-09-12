"""เปลี่ยนหน้าแล้วห้ามรื้อกล่องเครื่องมือที่วางอยู่ถูกที่แล้ว

‼️ ที่มา: `tests/browser_a11y.py` ข้อ "กล่องลากไฟล์รับโฟกัสได้ด้วยคีย์บอร์ด" แดงซ้ำ ๆ
   บนเว็บจริงแต่เขียวบนเครื่อง เคยสรุปว่าเป็นเทสชนกันเอง วัดจริง 12/09/2026 แล้วพบว่า
   เป็นบั๊กจริง: go() ถูกเรียก 2 รอบต่อการเปลี่ยนหน้า 1 ครั้งเสมอ (โค้ดรู้และกันเรื่อง
   mount ซ้ำไว้แล้ว แต่ไม่ได้กันเรื่อง DOM) รอบสองล้าง toolBox ทิ้งแล้วต่อก้อนเดิม
   กลับเข้าไปใหม่ ทำให้โฟกัสของคนที่ใช้คีย์บอร์ดหลุดกลับไปที่ body กลางคัน

‼️ เทสนี้ไม่ได้วัด "โฟกัสหลุดไหม" ตรง ๆ เพราะอาการนั้นขึ้นกับจังหวะ วัดได้บ้างไม่ได้บ้าง
   แต่วัด "ก้อนถูกถอดออกจาก DOM กี่ครั้ง" ซึ่งเป็นต้นเหตุ และเป็นศูนย์หรือไม่เป็นศูนย์ชัดเจน

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_routefocus.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label)

WATCH = """() => {
  window.__rm = 0;
  const dz = document.querySelector('.dz');
  window.__dz = dz;
  new MutationObserver(ms => { for (const m of ms) for (const n of m.removedNodes)
    if (n.nodeType === 1 && (n === window.__dz || n.contains?.(window.__dz))) window.__rm++;
  }).observe(document.body, { childList: true, subtree: true });
  return true;
}"""

with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={"width": 1280, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.wait_for_timeout(600)
    pg.evaluate(WATCH)

    print("\n① เปลี่ยนหน้ามาที่เครื่องมือเดิมซ้ำ ต้องไม่รื้อ DOM ของมันทิ้ง")
    # ‼️ จำลองรอบที่สองของ go() ให้ตรงกับที่เกิดจริง คือ hashchange มาที่ id เดิม
    for i in range(3):
        pg.evaluate("window.dispatchEvent(new HashChangeEvent('hashchange'))")
        pg.wait_for_timeout(400)
    rm = pg.evaluate("window.__rm")
    ck(f"เปลี่ยนหน้าซ้ำ 3 ครั้ง แล้วก้อนเครื่องมือไม่ถูกถอดออกเลย (ถอดไป {rm} ครั้ง)", rm == 0, rm)

    print("\n② โฟกัสที่คนใช้คีย์บอร์ดตั้งไว้ ต้องอยู่ครบหลังเปลี่ยนหน้าซ้ำ")
    pg.locator(".dz").focus()
    before = pg.evaluate("document.activeElement.className || document.activeElement.tagName")
    pg.evaluate("window.dispatchEvent(new HashChangeEvent('hashchange'))")
    pg.wait_for_timeout(600)
    after = pg.evaluate("document.activeElement.className || document.activeElement.tagName")
    ck(f"โฟกัสยังอยู่ที่กล่องลากไฟล์ (ก่อน '{before}' หลัง '{after}')", "dz" in (after or ""), after)

    print("\n③ สลับไปเครื่องมืออื่นแล้วกลับมา ต้องยังใช้งานได้ปกติ")
    pg.goto(BASE + "/#/pdf-merge", wait_until="networkidle")
    pg.wait_for_selector(".dz"); pg.wait_for_timeout(400)
    ck("ไปเครื่องมืออื่นแล้วมีกล่องลากไฟล์ใบเดียว", pg.locator(".dz").count() == 1, pg.locator(".dz").count())
    pg.goto(BASE + "/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz"); pg.wait_for_timeout(400)
    ck("กลับมาที่เดิมแล้วมีกล่องลากไฟล์ใบเดียว", pg.locator(".dz").count() == 1, pg.locator(".dz").count())
    ck("กลับมาแล้วปุ่มลงมือทำยังอยู่", pg.locator(".actions button.btn, .ws-footer button.btn").count() >= 1)
    ck("ไม่มี error หลุดออกมาเลย", not errs, errs)
    br.close()

print(f"\nตก {len(fails)} ข้อ")
if fails:
    sys.exit(1)
print("✅ ผ่านหมด")
