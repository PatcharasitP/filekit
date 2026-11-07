"""กดชื่อไฟล์ในรายการไฟล์ (ปุ่ม ดูข้อมูลใน ...) ต้องเปิดกล่องแสดงตัวอย่างทุกครั้ง รวมเครื่องมือ PDF ที่ไม่ได้โหลดตัวอ่าน PDF ไว้ก่อน
ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218: pdf-split pdf-protect pdf-resize pdf-nup pdf-clean pdf-unlock pdf-watermark pdf-page-numbers
กดชื่อไฟล์ PDF แล้วไม่มีอะไรเกิดขึ้น ทั้งที่ชื่อขีดเส้นใต้แบบลิงก์ และบอกว่า กดเพื่อดูข้อมูลในไฟล์ เพราะ preview.js canView
ยอมเปิด PDF เฉพาะตอนมี window.pdfjsLib แล้ว เครื่องมือที่ไม่มีภาพย่อหน้าไม่ได้โหลดไว้ viewFile จึงคืน false เงียบ ๆ
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_preview_open.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

OPEN = "() => !!document.querySelector('dialog.pv[open]')"
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for tid in ("pdf-split", "pdf-protect", "pdf-watermark", "pdf-merge", "excel-lookup"):
        ctx = b.new_context(viewport={"width": 1280, "height": 800}); p = ctx.new_page(); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/{tid}"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(600)
        p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
        btn = p.locator('#tool button[aria-label^="ดูข้อมูลใน"]').first
        btn.wait_for(state="visible", timeout=15000); p.wait_for_timeout(500)
        btn.click()
        opened = False
        for _ in range(60):
            if p.evaluate(OPEN): opened = True; break
            p.wait_for_timeout(100)
        # PDF วาดหน้าหลังกล่องเปิด รอเนื้อไฟล์อีกไม่เกิน 6 วินาที (canvas ต้องมีขนาดจริง ไม่ใช่กรอบเปล่า)
        has_canvas = False
        for _ in range(60 if opened else 0):
            has_canvas = p.evaluate("""() => [...document.querySelectorAll('dialog.pv[open] canvas, dialog.pv[open] img, dialog.pv[open] table')]
              .some(e => e.getBoundingClientRect().width > 50 && e.getBoundingClientRect().height > 50)""")
            if has_canvas: break
            p.wait_for_timeout(100)
        check(f"{tid}: กดชื่อไฟล์แล้วกล่องแสดงตัวอย่างเปิดภายใน 6 วินาที", opened)
        check(f"{tid}: กล่องมีเนื้อไฟล์ให้ดู", has_canvas)
        if tid == "pdf-split" and os.environ.get("FK_SHOT"): p.screenshot(path=os.environ["FK_SHOT"])
        ctx.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_preview_open: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
