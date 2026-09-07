import sys, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("FK_BASE", "http://localhost:8899")
CASES = [("pdf-watermark", 3), ("word-to-pdf", 5), ("images-to-pdf", 2),
         ("powerpoint-to-pdf", 2), ("pdf-ocr", 3)]
P, F = 0, []
def ck(n, g, w):
    global P
    if g == w: P += 1
    else: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if g==w else '❌'} {n}")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1280,"height":950})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    for tid, n_items in CASES:
        pg.goto("about:blank"); pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle"); pg.wait_for_timeout(700)
        ck(f"{tid} · ช่องย่อยรวมทุกกลุ่มครบ {n_items}", pg.locator(".seg .seg-item").count(), n_items)
        items = pg.locator(".seg").first.locator(".seg-item")
        before = pg.evaluate("document.querySelector('.seg').value")
        items.nth(items.count() - 1).click(); pg.wait_for_timeout(200)
        after = pg.evaluate("document.querySelector('.seg').value")
        ck(f"{tid} · กดแล้วค่าเปลี่ยนจริง ({before} → {after})", after != before, True)
        ck(f"{tid} · เลือกได้ทีละช่องในกลุ่มเดียวกัน",
           pg.evaluate("document.querySelector('.seg').querySelectorAll('input:checked').length"), 1)
        pg.evaluate("document.querySelector('.seg input:checked').focus()")
        pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(220)
        ck(f"{tid} · ลูกศรซ้ายเลื่อนตัวเลือกได้ (คีย์บอร์ดใช้ได้)",
           pg.evaluate("document.querySelector('.seg').value") != after, True)
    ck("ไม่มี error ใน console", len([e for e in errs if "favicon" not in e.lower()]), 0)
    b.close()
print(f"\nผ่าน {P} · ตก {len(F)}")
for i, x in enumerate(F, 1): print(f"  {i}. {x}")
sys.exit(1 if F else 0)
