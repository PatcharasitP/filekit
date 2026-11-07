"""เลือกไฟล์เดิมซ้ำ ตัวรับไฟล์ตัดแถวซ้ำทิ้ง (ตั้งใจ กันผลลัพธ์ออกซ้ำสองชุด) แต่ต้องบอกคนใช้ ไม่ตัดเงียบ
ที่มา 07/11/2026 ฟ้าลองกดเองในรวมไฟล์ PDF เลือก sample-3pages.pdf สองครั้ง จอขึ้น 1 ไฟล์ ไม่มีข้อความอะไรเลย
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_dupe_note.py"""
import os, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
FX = pathlib.Path(__file__).parent / "fixtures"
A, B = str(FX / "sample-3pages.pdf"), str(FX / "pdfmd-word.pdf")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:160]}]" if not ok else ""), flush=True)

NOTE = "() => { const n = document.querySelector('#tool .dupe-note'); return n && n.offsetParent ? n.innerText.trim() : ''; }"
ROWS = "() => (document.querySelector('#tool .file-list, #tool [class*=files]') || document.body).querySelectorAll('.file-row, .frow, li').length"
with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page(viewport={"width": 1280, "height": 800}); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(BASE + "/#/pdf-merge"); p.wait_for_selector("input[type=file]", state="attached", timeout=20000); p.wait_for_timeout(800)
    inp = p.locator("#tool input[type=file]").first
    inp.set_input_files([A]); p.wait_for_timeout(800)
    check("ใส่ไฟล์แรก ไม่มีข้อความไฟล์ซ้ำ", p.evaluate(NOTE) == "", p.evaluate(NOTE))
    inp.set_input_files([A, B]); p.wait_for_timeout(1000)
    note = p.evaluate(NOTE)
    check("ใส่ไฟล์เดิมปนไฟล์ใหม่ บอกชื่อไฟล์ที่ไม่ได้เพิ่มซ้ำ", "sample-3pages.pdf" in note and "ซ้ำ" in note, note)
    check("ไฟล์ใหม่ถูกเพิ่ม ไฟล์เดิมไม่ซ้ำ (2 ไฟล์)", "2 ไฟล์" in p.inner_text("#tool"), p.inner_text("#tool")[:120])
    inp.set_input_files([A]); p.wait_for_timeout(800)
    note = p.evaluate(NOTE)
    check("ใส่แต่ไฟล์เดิมทั้งหมด ก็ยังบอก ไม่เงียบ", "sample-3pages.pdf" in note, note)
    p.locator("#tool button[aria-label='เอา sample-3pages.pdf ออก']").first.click(); p.wait_for_timeout(500)
    check("ลบไฟล์ที่ข้อความพูดถึง ข้อความไฟล์ซ้ำหายทันที (ไม่จริงแล้ว)", p.evaluate(NOTE) == "", p.evaluate(NOTE))
    inp.set_input_files([A]); p.wait_for_timeout(800)
    check("ลบไฟล์ออกแล้วใส่กลับ ไม่ใช่ไฟล์ซ้ำ ข้อความหายไป", p.evaluate(NOTE) == "" or "sample-3pages.pdf" not in p.evaluate(NOTE), p.evaluate(NOTE))
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_dupe_note: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
