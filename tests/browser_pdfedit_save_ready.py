"""แก้ไข PDF: ปุ่ม บันทึก กดได้เฉพาะเมื่อมีของให้บันทึก ยังไม่แก้อะไรต้องปิดไว้และบอกเหตุผล
ที่มา 07/11/2026 ไล่กดทุกปุ่มบนเว็บจริงแบบมือถือไทย (.claude/evidence/2026-11-07-filekit-sweep-mobile-en/mobile_th_1.json)
เปิดไฟล์แล้วกด บันทึก ทันที ได้ข้อความแดง ยังไม่ได้แก้อะไรเลย ปุ่มเปิดตั้งแต่โหลดไฟล์เสร็จ ทั้งที่ยังไม่มีอะไรจะบันทึก
และ ย้อนล่าสุด กับ ล้างหน้านี้ ไม่ปรับปุ่มตาม ย้อนจนหมดแล้วปุ่มยังเปิดค้าง
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_pdfedit_save_ready.py"""
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

src = pathlib.Path(tempfile.mkdtemp(prefix="fk_pe_")) / "one.pdf"
c = rl_canvas.Canvas(str(src), pagesize=A4); c.drawString(100, 750, "07/11/2026"); c.showPage(); c.save()

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for vw, vh in ((1440, 1000), (390, 844)):
        p = b.new_page(viewport={"width": vw, "height": vh}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000); p.wait_for_timeout(1500)
        p.set_input_files(".dz input[type=file]", [str(src)])
        p.wait_for_selector(".pe-stage:not([hidden])", timeout=60000); p.wait_for_timeout(1200)
        save = p.locator("#tool button", has_text="บันทึก").first
        st = lambda: {"disabled": save.is_disabled(), "why": save.get_attribute("data-why") or ""}
        s0 = st()
        check(f"{vw}: เปิดไฟล์แล้วยังไม่แก้ ปุ่มบันทึกปิดและบอกเหตุผล", s0["disabled"] and s0["why"], s0)
        box = p.locator(".pe-layer").bounding_box()
        x0, y0 = box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.10
        p.mouse.move(x0, y0); p.mouse.down(); p.mouse.move(x0 + box["width"] * 0.35, y0 + box["height"] * 0.035, steps=8); p.mouse.up()
        p.wait_for_timeout(400)
        n = p.eval_on_selector_all(".pe-box.cover", "n => n.length")
        check(f"{vw}: ประชากร: ลากแล้วได้กล่องปิดทับ 1 กล่อง", n == 1, n)
        s1 = st()
        check(f"{vw}: มีของแก้แล้ว ปุ่มบันทึกกดได้ ไม่มีเหตุผลค้าง", not s1["disabled"] and not s1["why"], s1)
        p.locator("#tool button", has_text="ย้อนล่าสุด").first.click(); p.wait_for_timeout(300)
        s2 = st()
        check(f"{vw}: ย้อนจนไม่เหลือของแก้ ปุ่มบันทึกปิดกลับ", s2["disabled"] and s2["why"], s2)
        undo = p.locator("#tool button", has_text="ย้อนล่าสุด").first
        check(f"{vw}: ย้อนจนหมดแล้ว ปุ่มย้อนล่าสุดปิดด้วย", undo.is_disabled())
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_pdfedit_save_ready: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
