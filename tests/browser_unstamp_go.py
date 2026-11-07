"""pdf-unstamp ปุ่มบันทึกไฟล์ต้องจางพร้อมบอกเหตุผล จนกว่าจะติ๊กชั้นออกอย่างน้อยหนึ่งชั้น
ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218 ปุ่มบันทึกกดได้ทันทีหลังเปิดไฟล์ กดแล้วได้ข้อความ
"ยังไม่ได้ติ๊กชั้นไหนออก ไฟล์เหมือนเดิมทุกอย่าง" คือปุ่มชวนกดแต่กดแล้วไม่ได้อะไร (ตรงกับปุ่มหลักที่ยังทำไม่ได้ต้องปิดไว้ v218)
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_unstamp_go.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

GO = """() => { const b = [...document.querySelectorAll('#tool button')].find(x => x.textContent.trim() === 'บันทึกไฟล์' && x.offsetParent);
  const w = document.querySelector('.s2-cta-why');
  return b ? { dis: b.disabled, why: b.dataset.why || '', shown: w && !w.hidden ? w.textContent.trim() : '' } : null; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    p = b.new_page(viewport={"width": 1280, "height": 900}); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/pdf-unstamp"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(500)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
    # ‼️ รอข้อความสรุปชั้น ไม่ใช่แค่ช่องติ๊ก ช่องติ๊กขึ้นก่อนวาดตัวอย่างเสร็จ ปุ่มยังจางจากตอนเริ่มโหลด
    #    รอบแรกรอแค่ช่องติ๊ก ข้อ ปุ่มจาง ผ่านหลอกบนเว็บจริงรุ่นที่ยังมีบั๊ก (red_unstamp_go_2.log 07/11)
    p.wait_for_function("() => /พบชั้นที่ถอดออกได้/.test(document.querySelector('#tool').innerText)", timeout=30000)
    p.wait_for_timeout(300)
    s = p.evaluate(GO)
    check("มีปุ่มบันทึกไฟล์", s is not None)
    check("เปิดไฟล์แล้วยังไม่ติ๊กออก ปุ่มบันทึกจาง", s and s["dis"] is True, s)
    check("ปุ่มที่จางบอกเหตุผลใต้ปุ่มให้เห็น", s and "ติ๊ก" in s["shown"], s)
    p.locator("#tool input[type=checkbox]").first.uncheck(); p.wait_for_timeout(800)
    s = p.evaluate(GO)
    check("ติ๊กออกหนึ่งชั้นแล้ว ปุ่มบันทึกกดได้ และเหตุผลหายไป", s and s["dis"] is False and not s["shown"], s)
    p.locator("#tool input[type=checkbox]").first.check(); p.wait_for_timeout(800)
    s = p.evaluate(GO)
    check("ติ๊กกลับครบ ปุ่มบันทึกจางอีกครั้ง", s and s["dis"] is True, s)
    p.locator("#tool input[type=checkbox]").first.uncheck(); p.wait_for_timeout(500)
    with p.expect_download(timeout=20000) as dl:
        p.locator("#tool button:visible", has_text="บันทึกไฟล์").first.click()
        p.wait_for_selector("#tool .result button", timeout=20000)
        p.locator("#tool .result button").first.click()
    check("บันทึกแล้วได้ไฟล์ดาวน์โหลด", dl.value.suggested_filename.endswith(".pdf"), dl.value.suggested_filename)
    # หลังบันทึกหน้าเปลี่ยนเป็น เสร็จแล้ว ปุ่มบันทึกซ่อนตามแบบ (ดูภาพจอ 07/11) กด กลับไปแก้ แล้วปุ่มต้องตรงกับที่ติ๊กไว้
    p.locator("#tool button:visible", has_text="กลับไปแก้").first.click(); p.wait_for_timeout(600)
    s = p.evaluate(GO)
    check("กลับไปแก้หลังบันทึก ปุ่มยังกดได้ตามที่ติ๊กไว้", s and s["dis"] is False, s)
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_unstamp_go: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
