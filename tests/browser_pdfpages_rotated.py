#!/usr/bin/env python3
"""จัดการหน้า PDF: ครอบขอบขาวบนหน้าที่ไฟล์ต้นฉบับหมุนไว้ หรือ CropBox ไม่ตรง MediaBox ต้องได้ตรงกับการ์ด

ที่มา 19/11/2026 แผนรวมตัวแก้ไขเข้าเครื่องมือจัดการหน้า (.claude/plans/2026-11-18-merge-edit-into-pages.md เฟส 0 ข้อ U1 U10)
อ่านโค้ดแล้วพบว่า save() คิดกรอบครอบจาก MediaBox ก่อนหมุน ทั้งโหมดพอดีเนื้อหา (setCropBox) และหน้าเท่ากัน (embedPage)
แต่กรอบครอบคิดจากภาพย่อที่ pdf.js หมุนและครอบให้แล้ว ถ้าไม่แก้ ของที่จะวางในเฟส 2 ก็จะคลาดตามไปด้วย

วัดยังไง
  กรอบครอบ อ่านจากสไตล์ของภาพบนการ์ด (ค่าที่เครื่องมือเก็บจริง)
  ตำแหน่งสี่เหลี่ยมน้ำเงินบนหน้าต้นฉบับ อ่านจากภาพที่ PyMuPDF วาด (คิด /Rotate และ CropBox แบบเดียวกับ pdf.js)
  คิดตำแหน่งที่ควรได้หลังครอบ แล้วเทียบกับภาพที่ PyMuPDF วาดหน้าผลลัพธ์ เกณฑ์คลาดไม่เกิน 1% ของหน้า
  ข้อหน้าว่าง: หมุนหน้าว่างแล้วบันทึก หน้าในไฟล์ต้องหมุนจริง (U10)

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfpages_rotated.py
     --selftest ตรวจตัววัดกรอบน้ำเงินกับไฟล์ที่รู้คำตอบ
"""
import os
import re
import sys
import tempfile
from pathlib import Path

try:
    import fitz
    from PIL import Image
except ImportError:
    print("ข้าม: ต้องมี PyMuPDF กับ Pillow")
    sys.exit(0)

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
TOL = 0.01
ok = fail = 0


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  [{detail}]" if detail else ""))


def blue_box(page, zoom=2):
    """กรอบพิกเซลน้ำเงินจัด เป็นสัดส่วนของหน้าที่เห็น (x0, y0, x1, y1) ไม่เจอคืน None"""
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    px = img.load()
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for y in range(pix.height):
        for x in range(pix.width):
            r, g, b = px[x, y]
            if b > 180 and r < 80 and g < 80:
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    if x1 < 0:
        return None
    return x0 / pix.width, y0 / pix.height, (x1 + 1) / pix.width, (y1 + 1) / pix.height


CASES = [("ไม่หมุน", 0, None), ("หมุน 90", 90, None), ("หมุน 180", 180, None), ("หมุน 270", 270, None),
         ("CropBox [30 40 560 800]", 0, "[30 40 560 800]"), ("หมุน 90 กับ CropBox", 90, "[30 40 560 800]")]


def make_src(path):
    """หน้าขาว มีสี่เหลี่ยมน้ำเงินมุมบนซ้ายของหน้าดิบ ครอบอัตโนมัติจึงเหลือแค่สี่เหลี่ยมนั้นกับขอบรอบ ๆ"""
    d = fitz.open()
    for name, rot, crop in CASES:
        p = d.new_page(width=595, height=842)
        p.draw_rect(fitz.Rect(90, 100, 300, 260), color=None, fill=(0, 0, 1))
        if rot:
            p.set_rotation(rot)
        if crop:
            d.xref_set_key(p.xref, "CropBox", crop)
    d.save(path, garbage=0, deflate=False)
    d.close()


def selftest():
    d = fitz.open()
    p = d.new_page(width=595, height=842)
    p.draw_rect(fitz.Rect(119, 168.4, 238, 336.8), color=None, fill=(0, 0, 1))   # 0.2 0.2 0.4 0.4
    got = blue_box(p)
    good = got and all(abs(a - b) < 0.004 for a, b in zip(got, (0.2, 0.2, 0.4, 0.4)))
    p.set_rotation(90)          # หมุนตามเข็ม 90 กรอบ (x0,y0,x1,y1) ไป (1-y1, x0, 1-y0, x1)
    got2 = blue_box(p)
    good2 = got2 and all(abs(a - b) < 0.004 for a, b in zip(got2, (0.6, 0.2, 0.8, 0.4)))
    print(("  ✅" if good and good2 else "  ❌") + f" selftest ตัววัดกรอบน้ำเงิน ได้ {got} {got2}")
    sys.exit(0 if good and good2 else 1)


def crop_of(style):
    """กรอบครอบ {x,y,w,h} จากสไตล์ภาพบนการ์ด width=100/w% height=100/h% inset-inline-start=-(x/w)*100% top=-(y/h)*100%"""
    num = lambda k: float(re.search(rf"(?:^|;)\s*{k}:\s*(-?[\d.e+-]+)%", style).group(1))
    w = 100 / num("width"); h = 100 / num("height")
    return {"x": -num("inset-inline-start") / 100 * w, "y": -num("top") / 100 * h, "w": w, "h": h}


def expect(sb, c, mode):
    """ตำแหน่งสี่เหลี่ยมน้ำเงินในหน้าผลลัพธ์ ถ้าเครื่องมือทำตรงกับการ์ด"""
    if mode == "tight":
        k, ox, oy = 1, 0, 0
        fx = lambda v: (v - c["x"]) / c["w"]
        fy = lambda v: (v - c["y"]) / c["h"]
        return fx(sb[0]), fy(sb[1]), fx(sb[2]), fy(sb[3])
    # หน้าเท่ากัน: เนื้อหาที่ครอบขยายรักษาสัดส่วนให้เต็มด้านที่ตึงกว่า แล้วจัดกลาง (เป็นสัดส่วนของหน้า)
    k = min(1 / c["w"], 1 / c["h"])
    ox, oy = (1 - c["w"] * k) / 2, (1 - c["h"] * k) / 2
    return (ox + (sb[0] - c["x"]) * k, oy + (sb[1] - c["y"]) * k,
            ox + (sb[2] - c["x"]) * k, oy + (sb[3] - c["y"]) * k)


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_pprot_"))
    src = tmp / "rotated.pdf"
    make_src(src)
    sdoc = fitz.open(str(src))
    sbox = [blue_box(p) for p in sdoc]
    sdoc.close()
    outs = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [str(src)])
        pg.wait_for_selector(".pg", timeout=60000)
        pg.wait_for_timeout(2500)
        bar = pg.locator(".s2-tbar button:visible, .s2-canvas button:visible, .ws-toolbar button, .ws-canvas button")
        bar.filter(has_text="ครอบทุกหน้า").first.click()
        pg.wait_for_timeout(3000)
        ck(pg.locator(".pg-cropped").count() == len(CASES), "ครอบทุกหน้าแล้วติดป้ายครอบครบทุกหน้า",
           str(pg.locator(".pg-cropped").count()))
        styles = pg.evaluate("() => [...document.querySelectorAll('.pg .pg-crop img')].map(i => i.getAttribute('style'))")
        crops = [crop_of(s) for s in styles]
        # หน้าว่างต่อท้าย แล้วหมุน 90 (U10)
        # ‼️ ห้ามกด Escape ตอนไม่ได้เลือกหน้า เครื่องมือถือว่าออกจากหน้า กลับหน้าแรกของเว็บ (เจอ 19/11/2026)
        bar.filter(has_text="หน้าว่าง").first.click()
        pg.wait_for_timeout(800)
        pg.locator(".pg").last.click()
        pg.wait_for_timeout(300)
        if not pg.locator(".pg.selected").count():
            pg.locator(".pg").last.click()
            pg.wait_for_timeout(300)
        pg.keyboard.press("]")
        pg.wait_for_timeout(500)

        def save(name):
            out = tmp / name
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible, .ws-footer button, .actions button").filter(has_text="บันทึก").first.click()
                pg.wait_for_timeout(3000)
                pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
            dl.value.save_as(str(out))
            return out

        outs["same"] = save("same.pdf")
        # โหมดพอดีเนื้อหา ทุกหน้า: ล้างที่เลือกก่อนแล้วกด (ไม่เลือก = ใช้ทุกหน้า)
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [str(src)])
        pg.wait_for_selector(".pg", timeout=60000)
        pg.wait_for_timeout(2500)
        bar.filter(has_text="ครอบทุกหน้า").first.click()
        pg.wait_for_timeout(3000)
        pg.locator("button:visible").filter(has_text="ตัดหน้าให้พอดีเนื้อหา").first.click()
        pg.wait_for_timeout(500)
        styles2 = pg.evaluate("() => [...document.querySelectorAll('.pg .pg-crop img')].map(i => i.getAttribute('style'))")
        ck([crop_of(s) for s in styles2] == crops, "ครอบรอบสองได้กรอบเท่ารอบแรก (ใช้กรอบเดียวกันคิดทั้งสองโหมด)")
        outs["tight"] = save("tight.pdf")
        ck(not errs, "ไม่มี error ในหน้าเว็บ", "; ".join(errs[:2]))
        b.close()

    for mode, path in outs.items():
        doc = fitz.open(str(path))
        label = "หน้าเท่ากัน" if mode == "same" else "พอดีเนื้อหา"
        for i, (name, _, _) in enumerate(CASES):
            want = expect(sbox[i], crops[i], mode)
            got = blue_box(doc[i])
            if got is None:
                ck(False, f"{label} {name}: เห็นสี่เหลี่ยมน้ำเงินในหน้าผลลัพธ์", "ไม่เจอเลย ครอบผิดที่")
                continue
            d = max(abs(a - b) for a, b in zip(got, want))
            print(f"      {label} {name}: ควรได้ {tuple(round(v, 4) for v in want)} ได้ {tuple(round(v, 4) for v in got)} คลาดสุด {d:.4f}")
            ck(d <= TOL, f"{label} {name}: เนื้อหาที่ครอบในไฟล์ตรงกับการ์ด ไม่เกิน 1%", f"คลาด {d:.4f}")
        if mode == "same":
            last = doc[doc.page_count - 1]
            ck(last.rotation == 90, f"หน้าว่างที่กดหมุน 90 ในไฟล์ต้องหมุนจริง (ได้ {last.rotation})", str(last.rotation))
        doc.close()
    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else main()
