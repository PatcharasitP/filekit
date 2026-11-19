#!/usr/bin/env python3
"""แก้ไขและเซ็นบน PDF: วางของบนหน้าที่ไฟล์ต้นฉบับหมุนไว้ หรือมี CropBox ไม่ตรง MediaBox ต้องได้ตรงที่เห็น

ที่มา 19/11/2026 แผนรวมตัวแก้ไขเข้าเครื่องมือจัดการหน้า (.claude/plans/2026-11-18-merge-edit-into-pages.md เฟส 0 ข้อ U2)
อ่านโค้ดแล้วพบว่า save() ของ pdf-edit ใช้ page.getSize() คือ MediaBox ก่อนหมุน ไม่คิด /Rotate และไม่คิดจุดเริ่มของ CropBox
ขณะที่ภาพบนจอมาจาก pdf.js ซึ่งหมุนและครอบให้แล้ว ไฟล์สแกนจากมือถือหมุนหน้าบ่อยมาก จึงต้องวัดของจริง

วัดสองฝั่งแล้วลบกัน (บทเรียนคลัง: ตาเปล่ามองไม่ออกว่าเพี้ยน)
  บนจอ  = กึ่งกลางของรูปที่วาง (getBoundingClientRect) เป็นสัดส่วนของชั้นวาดทับ
  ในไฟล์ = กึ่งกลางพิกเซลสีแดงในภาพที่ PyMuPDF วาดหน้าผลลัพธ์ (PyMuPDF คิด /Rotate และ CropBox ให้เองแบบโปรแกรมดู PDF)
เกณฑ์ คลาดไม่เกิน 0.5% ของหน้าทั้งสองแกน

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfedit_rotated.py
     --selftest ตรวจว่าตัววัดพิกเซลแดงอ่านไฟล์ที่รู้คำตอบได้ตรงก่อน
"""
import os
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
TOL = 0.005
ok = fail = 0


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  [{detail}]" if detail else ""))


def red_center(page, zoom=2):
    """กึ่งกลางพิกเซลสีแดงจัด เป็นสัดส่วนของหน้าที่เห็น (หลังหมุนหลังครอบ) ไม่เจอคืน None"""
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    px = img.load()
    sx = sy = n = 0
    for y in range(0, pix.height, 2):
        for x in range(0, pix.width, 2):
            r, g, b = px[x, y]
            if r > 200 and g < 70 and b < 70:
                sx += x; sy += y; n += 1
    if not n:
        return None
    return (sx / n + 0.5) / pix.width, (sy / n + 0.5) / pix.height


CASES = [("ไม่หมุน", 0, None), ("หมุน 90", 90, None), ("หมุน 180", 180, None), ("หมุน 270", 270, None),
         ("CropBox [30 40 560 800]", 0, "[30 40 560 800]"), ("หมุน 90 กับ CropBox", 90, "[30 40 560 800]")]
SPOTS = [(0.25, 0.30), (0.70, 0.22), (0.30, 0.75), (0.62, 0.68), (0.20, 0.20), (0.75, 0.80)]


def make_src(path):
    d = fitz.open()
    for i, (name, rot, crop) in enumerate(CASES):
        p = d.new_page(width=595, height=842)
        p.insert_text((60, 80), f"Page {i + 1}", fontsize=22, color=(0.3, 0.3, 0.3))
        p.draw_rect(fitz.Rect(40, 40, 555, 802), color=(0.2, 0.2, 0.6), width=1)
        if rot:
            p.set_rotation(rot)
        if crop:
            d.xref_set_key(p.xref, "CropBox", crop)
    d.save(path, garbage=0, deflate=False)
    d.close()


def make_red(path):
    Image.new("RGB", (80, 40), (255, 0, 0)).save(path)


def selftest():
    """ตัววัดต้องอ่านกึ่งกลางของสี่เหลี่ยมแดงที่รู้ตำแหน่งได้ตรง ทั้งหน้าไม่หมุนและหน้าหมุน 90"""
    d = fitz.open()
    p = d.new_page(width=595, height=842)
    p.draw_rect(fitz.Rect(100, 200, 160, 240), color=None, fill=(1, 0, 0))   # กึ่งกลาง 130,220 จากบนซ้าย
    want = (130 / 595, 220 / 842)
    got = red_center(p)
    good = got and abs(got[0] - want[0]) < 0.003 and abs(got[1] - want[1]) < 0.003
    p2 = d.new_page(width=595, height=842)
    p2.draw_rect(fitz.Rect(100, 200, 160, 240), color=None, fill=(1, 0, 0))
    p2.set_rotation(90)
    # หมุนตามเข็ม 90: จุด (x,y) จากบนซ้ายของหน้าดิบ ไปอยู่ (H - y, x) ของหน้าที่เห็นกว้าง H สูง W
    want2 = ((842 - 220) / 842, 130 / 595)
    got2 = red_center(p2)
    good2 = got2 and abs(got2[0] - want2[0]) < 0.003 and abs(got2[1] - want2[1]) < 0.003
    print(("  ✅" if good and good2 else "  ❌") + f" selftest ตัววัดพิกเซลแดง ได้ {got} {got2} ควรได้ {want} {want2}")
    sys.exit(0 if good and good2 else 1)


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_perot_"))
    src, red, out = tmp / "rotated.pdf", tmp / "red.png", tmp / "out.pdf"
    make_src(src)
    make_red(red)
    screen = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1700}, accept_downloads=True)  # หน้าทั้งหน้าต้องอยู่ในจอ คลิกนอกจอไม่โดน
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)
        pg.set_input_files(".dz input[type=file]", [str(src)])
        pg.wait_for_selector(".pe-stage:not([hidden])", timeout=60000)
        pg.wait_for_timeout(1000)
        # รอบ 6 (19/11/2026) รูปกับลายเซ็นรวมเป็นเครื่องมือเดียว data-mode=sign มีช่องอัปโหลดช่องเดียว (ตัวสุดท้าย)
        pg.click(".pe-right button[data-mode=sign]")
        pg.locator(".pe-right input[type=file]").last.set_input_files(str(red))
        pg.wait_for_timeout(800)
        for i, (name, _, _) in enumerate(CASES):
            pg.locator(".pe-thumb").nth(i).click()
            pg.wait_for_timeout(900)
            box = pg.query_selector(".pe-layer").bounding_box()
            fx, fy = SPOTS[i]
            pg.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
            pg.wait_for_timeout(300)
            c = pg.evaluate("""() => { const L = document.querySelector('.pe-layer').getBoundingClientRect();
              const s = [...document.querySelectorAll('.pe-box.stamp')].pop().getBoundingClientRect();
              return [(s.left + s.width / 2 - L.left) / L.width, (s.top + s.height / 2 - L.top) / L.height]; }""")
            screen.append(c)
        with pg.expect_download(timeout=60000) as dl:
            pg.locator("button.s2-cta:visible, .ws-footer button").filter(has_text="บันทึก").first.click()
            pg.wait_for_timeout(2500)
            pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
        dl.value.save_as(str(out))
        ck(not errs, "ไม่มี error ในหน้าเว็บ", "; ".join(errs[:2]))
        b.close()

    doc = fitz.open(str(out))
    for i, (name, _, _) in enumerate(CASES):
        sx, sy = screen[i]
        f = red_center(doc[i])
        if f is None:
            ck(False, f"{name}: เจอรูปแดงบนหน้าผลลัพธ์", "ไม่เจอเลย รูปหลุดนอกหน้า")
            continue
        dx, dy = f[0] - sx, f[1] - sy
        print(f"      {name}: บนจอ ({sx:.4f}, {sy:.4f}) ในไฟล์ ({f[0]:.4f}, {f[1]:.4f}) คลาด ({dx:+.4f}, {dy:+.4f})")
        ck(abs(dx) <= TOL and abs(dy) <= TOL, f"{name}: กึ่งกลางในไฟล์ตรงกับบนจอ ไม่เกิน 0.5%",
           f"คลาด {dx:+.4f}, {dy:+.4f}")
    doc.close()
    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else main()
