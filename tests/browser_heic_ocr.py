#!/usr/bin/env python3
"""เครื่องมือที่อ่านตัวหนังสือจากรูป (pdf-ocr, excel-to-pq) ต้องรับรูป HEIC จากไอโฟนได้จริง

‼️ ที่มา 09/11/2026 ไล่มุมไอโฟนแล้วจับค่าจริงได้สองจุดที่ "รับไฟล์เข้ามาแล้วทำไม่ได้"
   ① pdf-ocr: accept="image/*" รับ .heic เข้ามา แต่ส่งไฟล์ดิบให้ Tesseract ซึ่งอ่าน HEIC ไม่ได้
      ขึ้น "อ่านไม่สำเร็จ: undefined" (ข้อความไม่บอกอะไรเลย)
   ② excel-to-pq: dropzone รับ .heic ผ่านชนิด "image" แต่ตัวแยกชนิดของเครื่องมือไม่รู้จัก .heic
      จึงเอาไฟล์รูปไปอ่านเป็นสเปรดชีต ได้ขยะ "สร้างโค้ดแล้ว 48 แถว" โดยขึ้นว่าสำเร็จ แย่กว่าพังเสียงดัง
   ภาพทดสอบเป็นตาราง 3 บรรทัด (NAME QTY / APPLE 12 / BANANA 30) ค่าจริงของ PNG ต้นฉบับที่วัดไว้ก่อน:
      pdf-ocr ได้ข้อความมี NAME APPLE BANANA, excel-to-pq ได้ "2 แถว 2 คอลัมน์" หัวคอลัมน์ NAME กับ QTY

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_heic_ocr.py"""
import os
import pathlib
import sys
import tempfile

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0

try:
    from PIL import Image, ImageDraw, ImageFont
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    print("  ⚠️  ข้ามเทสนี้ ต้องมี Pillow และ pillow-heif")
    sys.exit(0)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""), flush=True)
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""), flush=True)


def make_files(tmp):
    im = Image.new("RGB", (900, 420), (255, 255, 255))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 64)
    for i, line in enumerate(["NAME        QTY", "APPLE       12", "BANANA      30"]):
        d.text((40, 30 + i * 120), line, fill=(0, 0, 0), font=f)
    heic, png = tmp / "ตารางจากไอโฟน.heic", tmp / "ตาราง.png"
    im.save(heic, format="HEIF", quality=90)
    im.save(png)
    return heic, png


def fresh(ctx, tool):
    pg = ctx.new_page()
    pg.goto(f"{BASE}/#{tool}", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2000)
    return pg


def main():
    if not os.path.exists(FONT):
        print("  ⚠️  ข้ามเทสนี้ ไม่มีฟอนต์ DejaVu สำหรับวาดภาพทดสอบ")
        return 0
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk-heic-ocr-"))
    heic, png = make_files(tmp)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, service_workers="block")
        for label, f in (("PNG", png), ("HEIC", heic)):
            # ── pdf-ocr ──────────────────────────────────────────────────────
            pg = fresh(ctx, "pdf-ocr")
            pg.set_input_files(".dz input[type=file]", [str(f)])
            pg.wait_for_timeout(1500)
            pg.get_by_role("radio", name="อังกฤษ").first.check()
            pg.get_by_role("button", name="เริ่มอ่าน").filter(visible=True).first.click()
            try:
                pg.wait_for_function(
                    "() => /อ่านสำเร็จ|อ่านไม่สำเร็จ|ไม่พบตัวอักษร/.test("
                    "[...document.querySelectorAll('.status')].map(s => s.innerText).join(' '))", timeout=90000)
            except Exception:
                pass
            st = pg.locator(".status").last.inner_text().replace("\n", " ")
            text = pg.locator(".preview-text").inner_text() if pg.locator(".preview-text:visible").count() else ""
            ck(f"[pdf-ocr] อ่านรูป {label} สำเร็จ", st.startswith("อ่านสำเร็จ"), st[:70])
            ck(f"[pdf-ocr] {label}: ข้อความที่อ่านได้มี APPLE และ BANANA",
               "APPLE" in text and "BANANA" in text, repr(text[:60]))
            pg.close()
            # ── excel-to-pq ──────────────────────────────────────────────────
            pg = fresh(ctx, "excel-to-pq")
            pg.set_input_files(".dz input[type=file]", [str(f)])
            try:
                pg.wait_for_function(
                    "() => /สร้างโค้ดแล้ว|ไม่พบ|อ่านไม่|ไม่ได้/.test("
                    "[...document.querySelectorAll('.status')].map(s => s.innerText).join(' '))", timeout=90000)
            except Exception:
                pass
            pg.wait_for_timeout(800)
            body = pg.locator("#tool").inner_text().replace("\n", " | ")
            ck(f"[excel-to-pq] รูป {label}: ได้ตาราง 2 แถว 2 คอลัมน์ ไม่ใช่ขยะ",
               "อ่านได้ 2 แถว 2 คอลัมน์" in body, body[body.find("อ่านได้"):][:60] if "อ่านได้" in body else body[:80])
            ck(f"[excel-to-pq] {label}: หัวคอลัมน์คือ NAME กับ QTY", "NAME" in body and "QTY" in body)
            pg.close()
        ctx.close()
        b.close()
    print(f"\nผ่าน {ok} ตก {fail}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
