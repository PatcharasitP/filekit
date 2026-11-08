"""แก้ไข PDF: กดบันทึกแล้วข้อความผลต้องค้างอยู่ ทั้งตอนสำเร็จและตอนล้ม
ที่มา 08/11/2026 รีวิวโค้ด v219 ถึง v224: commit 8031724 เปลี่ยนท้าย save() เป็น syncButtons()
ซึ่งเขียนสถานะ "แก้ไว้ N จุด" ทับทุกครั้ง ตอนสำเร็จข้อความ บันทึกแล้ว หาย
ตอนล้มหนักกว่า ข้อความแดง บันทึกไม่ได้ หายไปด้วย จอเหลือ แก้ไว้ 1 จุด และไม่มีไฟล์ ผู้ใช้ไม่รู้ว่าพลาด
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_pdfedit_save_status.py"""
import os, sys, tempfile, pathlib
from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

src = pathlib.Path(tempfile.mkdtemp(prefix="fk_pes_")) / "one.pdf"
c = rl_canvas.Canvas(str(src), pagesize=A4); c.drawString(100, 750, "08/11/2026"); c.showPage(); c.save()

STATUS = "() => [...document.querySelectorAll('#tool .status.show')].map(s => ({cls: s.className, txt: s.textContent.trim()}))"

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for fail in (False, True):
        p = b.new_page(viewport={"width": 1440, "height": 1000}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000); p.wait_for_timeout(1500)
        p.set_input_files(".dz input[type=file]", [str(src)])
        p.wait_for_selector(".pe-stage:not([hidden])", timeout=60000); p.wait_for_timeout(1200)
        box = p.locator(".pe-layer").bounding_box()
        x0, y0 = box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.10
        p.mouse.move(x0, y0); p.mouse.down(); p.mouse.move(x0 + 200, y0 + 40, steps=8); p.mouse.up(); p.wait_for_timeout(400)
        if fail:  # ทำให้ขั้นวาดลงไฟล์ล้มจริง แทนการเดาว่าโค้ดจัดการ error ถูก
            p.evaluate("() => { PDFLib.PDFPage.prototype.drawRectangle = function () { throw new Error('จำลองล้ม'); }; }")
        save = p.locator("#tool button", has_text="บันทึก").first
        save.click()
        p.wait_for_function("() => !document.querySelector('#tool .ws-busy, #tool [aria-busy=true]')", timeout=30000)
        p.wait_for_timeout(1500)
        sts = p.evaluate(STATUS); res = p.locator("#tool .result").count()
        txt = " ".join(s["txt"] for s in sts); cls = " ".join(s["cls"] for s in sts)
        if not fail:
            check("ประชากร: บันทึกสำเร็จได้แถวผลลัพธ์ 1 แถว", res == 1, res)
            check("บันทึกสำเร็จ ข้อความ บันทึกแล้ว ยังอยู่บนจอ ไม่ถูก แก้ไว้ N จุด ทับ", "บันทึกแล้ว" in txt, sts)
            check("ปุ่มบันทึกกดได้อีกหลังบันทึกเสร็จ (ยังมีจุดที่แก้)", not save.is_disabled())
        else:
            check("ประชากร: ล้มจริง ไม่มีแถวผลลัพธ์", res == 0, res)
            check("บันทึกล้ม ข้อความแดง บันทึกไม่ได้ ยังอยู่บนจอ", "บันทึกไม่ได้" in txt and "err" in cls, sts)
            check("บันทึกล้ม ปุ่มบันทึกกลับมากดได้ ให้ลองใหม่", not save.is_disabled())
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print("BAD", bad)
sys.exit(1 if bad else 0)
