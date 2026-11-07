"""เครื่องมือที่ต้องใช้สองไฟล์ กด "ลองด้วยไฟล์ตัวอย่าง" บนหน้าแรกของเครื่องมือครั้งเดียว ต้องได้ไฟล์ครบทุกกล่องและลองต่อได้ทันที
ที่มา 07/11/2026 ฟ้าไล่กดทุกเครื่องมือแบบคนใช้ครั้งแรก จดหมายเวียนได้แค่เทมเพลต ปุ่มสร้างเอกสารจางค้าง
ดึงข้อมูลจากอีกไฟล์ได้แค่ไฟล์หลัก หน้ากลางบอกให้เปิดไฟล์รอง คนที่แค่อยากลองต้องไปหาไฟล์ที่สองเอง
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_sample_pairs.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

NAMES = """() => [...document.querySelectorAll('#tool .dz-wrap')].map(d => [...d.querySelectorAll('button[aria-label^="เอา "]')].map(b => b.getAttribute('aria-label').replace(/^เอา /, '').replace(/ ออก$/, '')))"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for tid, cta in (("word-mailmerge", "สร้างเอกสารทั้งชุด"), ("excel-lookup", None), ("map-coverage", None)):
        p = b.new_page(viewport={"width": 1280, "height": 800}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/{tid}"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(600)
        p.locator("button.s2-link", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
        names = []
        for _ in range(30):
            p.wait_for_timeout(500); names = p.evaluate(NAMES)
            if names and all(names): break
        check(f"{tid}: ทุกกล่องรับไฟล์มีไฟล์ตัวอย่าง ({len(names)} กล่อง)", len(names) >= 2 and all(names), names)
        flat = [n for g in names for n in g]
        check(f"{tid}: ไฟล์ในแต่ละกล่องไม่ใช่ไฟล์เดียวกัน", len(set(flat)) == len(flat) and len(flat) >= 2, flat)
        if cta:
            btn = p.locator("button.s2-cta:visible")
            check(f"{tid}: ปุ่ม {cta} กดได้ทันทีหลังลองตัวอย่าง", btn.count() > 0 and btn.first.is_enabled(), btn.first.inner_text() if btn.count() else "")
        if tid == "excel-lookup":
            p.wait_for_timeout(1500)
            mid = p.inner_text("#tool")
            check("excel-lookup: หน้ากลางไม่ค้างที่ เปิดไฟล์หลักและไฟล์รอง", "เปิดไฟล์หลักและไฟล์รอง" not in mid, mid[:160])
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_sample_pairs: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
