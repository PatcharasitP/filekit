"""จัดการหน้า PDF: เลือกแบบหน้ากระดาษหลังครอบเป็นรายหน้าได้

‼️ ที่มา 18/11/2026 ค่ำ พี่ปอนด์ดูแผงขวา "ครอบแล้วเอาหน้ากระดาษแบบไหน" ที่บังคับเลือกอย่างเดียวทั้งไฟล์
   "บางคนเขาอาจจะอยากได้แบบแปลก ๆ ก็ได้ไง ... อันนี้เหมือนมาจัดการเขา เขาควรอิสระได้สิ"
   (ภาพหน้า 1 เต็มกระดาษ หน้า 2 หดพอดีเนื้อหา ในไฟล์เดียวกัน)

กติกาใหม่: เลือกหน้าไว้แล้วกดปุ่มโหมด = ใช้กับหน้าที่เลือกเท่านั้น , ไม่ได้เลือก = ใช้ทุกหน้า
เทสนี้เปิดไฟล์ผลลัพธ์อ่านขนาดหน้าจริง ไม่เชื่อแค่หน้าจอ

รัน: FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_pdfpages_cropmix.py
"""
import os
import sys
import tempfile
from playwright.sync_api import sync_playwright
import fitz

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}  ({detail})" if detail else f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}  ({detail})")


def make_src(path):
    """สองหน้าที่เนื้อหาอยู่ครึ่งบน ครอบแล้วเหลือแค่ครึ่งบนทั้งคู่"""
    d = fitz.open()
    for i in range(2):
        p = d.new_page(width=595, height=842)
        p.draw_rect(fitz.Rect(40, 40, 555, 400), color=(0, 0, 0), width=1)
        p.insert_text((60, 80), f"Short scan {i + 1}", fontsize=20)
    d.save(path)
    d.close()


def sizes(path):
    doc = fitz.open(path)
    s = [(round(p.rect.width), round(p.rect.height)) for p in doc]
    doc.close()
    return s


print(f"\n━━ โหมดครอบเลือกรายหน้า ({BASE}) ━━")
with tempfile.TemporaryDirectory() as td:
    src = os.path.join(td, "scan2.pdf")
    make_src(src)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [src])
        pg.wait_for_timeout(5000)
        bar = pg.locator(".s2-tbar button:visible, .s2-canvas button:visible, .ws-toolbar button, .ws-canvas button")
        bar.filter(has_text="ครอบทุกหน้า").first.click()
        pg.wait_for_timeout(3000)
        ck("ครอบทุกหน้าแล้วทั้งสองหน้าติดป้ายครอบ", pg.locator(".pg-cropped").count() == 2, str(pg.locator(".pg-cropped").count()))

        def mode_btn(name):
            return pg.locator("button:visible").filter(has_text=name).first

        def save(name):
            out = os.path.join(td, name)
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible, .ws-footer button, .actions button").filter(has_text="บันทึก").first.click()
                pg.wait_for_timeout(3000)
                pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
            dl.value.save_as(out)
            return out

        ck("ข้อความใต้ปุ่มบอกว่าเลือกหน้าก่อนได้", pg.evaluate("""() => [...document.querySelectorAll('small')]
            .some(n => n.textContent.includes('เลือกหน้า') && n.checkVisibility())"""))
        # เลือกหน้า 2 อย่างเดียว แล้วกด พอดีเนื้อหา
        pg.locator(".pg").nth(1).click()
        pg.wait_for_timeout(300)
        mode_btn("ตัดหน้าให้พอดีเนื้อหา").click()
        pg.wait_for_timeout(500)
        ck("กดตอนเลือกหน้า 2 ไว้ หน้า 2 ยังถูกเลือกอยู่", pg.locator(".pg.selected").count() == 1)
        r = pg.evaluate("""() => [...document.querySelectorAll('.pg .pg-page')].map(n => {
            const b = n.getBoundingClientRect(); return +(b.height / b.width).toFixed(2); })""")
        ck("บนจอ หน้า 2 หดพอดีเนื้อหา หน้า 1 ยังเต็มกระดาษ", len(r) == 2 and r[1] < r[0] * 0.8, str(r))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        s1 = sizes(save("mix.pdf"))
        ck("ไฟล์จริง หน้า 1 เต็ม A4 หน้า 2 หดพอดีเนื้อหา (ผสมกันได้)",
           len(s1) == 2 and s1[0] == (595, 842) and s1[1][1] < 600, str(s1))

        # ไม่เลือกอะไรแล้วกด หน้าเท่ากันทุกหน้า = ใช้ทุกหน้า ล้างที่ตั้งรายหน้าทิ้ง
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [src])
        pg.wait_for_timeout(5000)
        bar.filter(has_text="ครอบทุกหน้า").first.click()
        pg.wait_for_timeout(3000)
        pg.locator(".pg").nth(0).click(); pg.wait_for_timeout(200)
        mode_btn("ตัดหน้าให้พอดีเนื้อหา").click(); pg.wait_for_timeout(300)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        mode_btn("ตัดหน้าให้พอดีเนื้อหา").click(); pg.wait_for_timeout(300)
        s2 = sizes(save("all_tight.pdf"))
        ck("ไม่เลือกหน้าแล้วกด พอดีเนื้อหา ใช้ทุกหน้า", len(s2) == 2 and all(h < 600 for _, h in s2), str(s2))
        # หลังบันทึก แผงขวาเปลี่ยนเป็นผลลัพธ์ เปิดเครื่องมือใหม่ แล้วตั้งรายหน้าไว้ก่อน ค่อยกดแบบทุกหน้าทับ
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [src])
        pg.wait_for_timeout(5000)
        bar.filter(has_text="ครอบทุกหน้า").first.click()
        pg.wait_for_timeout(3000)
        pg.locator(".pg").nth(1).click(); pg.wait_for_timeout(200)
        mode_btn("ตัดหน้าให้พอดีเนื้อหา").click(); pg.wait_for_timeout(300)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        ck("กด Esc แล้วยังอยู่ในเครื่องมือ", "pdf-pages" in pg.evaluate("() => location.hash") and pg.locator(".pg").count() == 2)
        mode_btn("หน้าเท่ากันทุกหน้า").click(); pg.wait_for_timeout(300)
        s3 = sizes(save("all_same.pdf"))
        ck("ไม่เลือกหน้าแล้วกด หน้าเท่ากันทุกหน้า ล้างที่ตั้งรายหน้า กลับเป็น A4 ทุกหน้า", s3 == [(595, 842), (595, 842)], str(s3))
        ck("ไม่มี error หลุดออกมา", not errs, str(errs[:1]))
        b.close()

print(f"\nผ่าน {ok} , ตก {fail}")
sys.exit(1 if fail else 0)
