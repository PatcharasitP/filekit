"""ปุ่มหลักที่จางหลังใส่ไฟล์แล้ว ต้องมีบรรทัดบอกเหตุผลใต้ปุ่ม และบรรทัดนั้นต้องหายเองเมื่อทำครบ
ที่มา 07/11/2026 ฟ้าไล่กดทุกเครื่องมือแบบคนใช้ครั้งแรก word-replace ใส่ไฟล์ตัวอย่างแล้วปุ่มดูตัวอย่างจางค้าง
ไม่มีอะไรบอกว่าต้องพิมพ์คำที่จะค้นหาก่อน ช่อง .s2-cta-why สร้างไว้ตั้งแต่แกนหน้าเครื่องมือ v2 แต่ไม่เคยต่อสาย
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_cta_why.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

WHY = """() => { const w = document.querySelector('#tool .s2-cta-why'); const b = document.querySelector('#tool button.s2-cta');
  return { shown: !!w && !w.hidden && w.offsetParent !== null, text: w ? w.textContent.trim() : null, off: b ? b.disabled : null }; }"""

def open_tool(b, tid, errs):
    p = b.new_page(viewport={"width": 1280, "height": 800}); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/{tid}"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(600)
    return p

def after_sample(p):
    p.locator("button.s2-link", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
    for _ in range(30):
        p.wait_for_timeout(300)
        if p.locator('#tool button[aria-label^="เอา "]').count(): break
    p.wait_for_timeout(400)

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []

    p = open_tool(b, "word-replace", errs)
    w = p.evaluate(WHY)
    check("word-replace: ยังไม่มีไฟล์ ไม่ขึ้นเหตุผล (หน้าว่างบอกเองอยู่แล้ว)", not w["shown"], w)
    after_sample(p)
    w = p.evaluate(WHY)
    check("word-replace: ใส่ไฟล์แล้วปุ่มยังจาง", w["off"] is True, w)
    check("word-replace: ใต้ปุ่มบอกให้พิมพ์คำที่จะค้นหา", w["shown"] and "ค้นหา" in (w["text"] or ""), w)
    p.locator('#tool input[placeholder="ค้นหาคำนี้"]').first.fill("วันที่"); p.wait_for_timeout(300)
    w = p.evaluate(WHY)
    check("word-replace: พิมพ์คำแล้ว ปุ่มกดได้และเหตุผลหาย", w["off"] is False and not w["shown"], w)
    p.locator('#tool input[placeholder="ค้นหาคำนี้"]').first.fill(""); p.wait_for_timeout(300)
    w = p.evaluate(WHY)
    check("word-replace: ลบคำออก เหตุผลกลับมา", w["off"] is True and w["shown"], w)
    p.close()

    p = open_tool(b, "pdf-protect", errs)
    after_sample(p)
    w = p.evaluate(WHY)
    check("pdf-protect: ใส่ไฟล์แล้วยังไม่มีรหัส ใต้ปุ่มบอกให้พิมพ์รหัส", w["off"] is True and w["shown"] and "รหัส" in (w["text"] or ""), w)
    p.locator('#tool input[type="password"]').first.fill("1234"); p.wait_for_timeout(300)
    w = p.evaluate(WHY)
    check("pdf-protect: พิมพ์รหัสแล้ว ปุ่มกดได้และเหตุผลหาย", w["off"] is False and not w["shown"], w)
    p.close()

    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_cta_why: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
