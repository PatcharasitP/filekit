#!/usr/bin/env python3
"""pdf-edit ปุ่ม "เลือกไฟล์รูป" ต้องรับรูป HEIC จากไอโฟนได้ ทั้ง Chromium และ WebKit

‼️ ที่มา 09/11/2026 ไล่มุมไอโฟนทีละเครื่องมือ พบว่า pdf-edit เป็นตัวเดียวในเครื่องมือรูปที่ยังเรียก
   createImageBitmap ตรง ๆ ไม่ผ่านตัวถอด decodeImage (เครื่องมือรูปอื่นกับลายเซ็นผ่านหมดแล้ว)
   ค่าจริงที่จับได้ก่อนแก้: Chromium ขึ้น "อ่านรูปไม่ได้: The source image could not be decoded."
   WebKit ของ Playwright ขึ้น "อ่านรูปไม่ได้: Cannot decode the data in the argument to createImageBitmap"
   (Safari ไอโฟนอ่าน HEIC เองได้ แต่ Chrome/Android/เดสก์ท็อปอ่านไม่ได้ จึงต้องตกมาใช้ตัวถอดของเรา)

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_pdfedit_heic.py"""
import os
import pathlib
import random
import sys
import tempfile

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0

try:
    from PIL import Image, ImageDraw
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    print("  ⚠️  ข้ามเทสนี้ ต้องมี Pillow และ pillow-heif")
    sys.exit(0)

W, H = 900, 640


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""), flush=True)
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""), flush=True)


def make_files(tmp):
    random.seed(11)
    im = Image.new("RGB", (W, H), (248, 244, 236))
    d = ImageDraw.Draw(im)
    for _ in range(40):
        x, y = random.randint(0, W), random.randint(0, H)
        d.ellipse([x, y, x + 90, y + 90], fill=tuple(random.randint(50, 235) for _ in range(3)))
    heic, png = tmp / "ภาพจากไอโฟน.heic", tmp / "ธรรมดา.png"
    im.save(heic, format="HEIF", quality=82)
    im.save(png)
    return heic, png


def choose_image(pg, path):
    """เปิด pdf-edit ด้วยไฟล์ตัวอย่าง สลับเป็นโหมดรูป แล้วเลือกไฟล์ผ่านช่องรูปตัวที่สอง (ตัวสุดท้ายในหน้า)"""
    pg.goto(f"{BASE}/#pdf-edit", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2500)
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").filter(visible=True).first.click()
    pg.wait_for_selector(".pe-stage:not([hidden])", timeout=60000)
    pg.get_by_role("button", name="รูป", exact=True).filter(visible=True).first.click()
    pg.wait_for_timeout(500)
    inputs = pg.locator("input[type=file]")
    n = inputs.count()
    inputs.nth(n - 1).set_input_files(str(path))
    pg.wait_for_function(
        "() => { const s = document.querySelector('.status.show, .status'); "
        "return s && /เลือกรูปแล้ว|อ่านรูปไม่ได้/.test(s.innerText); }", timeout=40000)
    status = pg.locator(".status").last.inner_text().replace("\n", " ")
    prev = pg.evaluate("() => { const i = document.querySelector('.pe-saved figure.on img');"
                       " return i ? { w: i.naturalWidth, h: i.naturalHeight } : null; }")
    return status, prev


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk-pe-heic-"))
    heic, png = make_files(tmp)
    with sync_playwright() as p:
        for name in ("chromium", "webkit"):
            b = getattr(p, name).launch()
            # ‼️ ปิด service worker ไม่ให้แคชเก่าบังโค้ดที่กำลังทดสอบ
            for label, f in (("ธรรมดา PNG", png), ("HEIC จากไอโฟน", heic)):
                ctx = b.new_context(viewport={"width": 1440, "height": 950}, service_workers="block")
                pg = ctx.new_page()
                try:
                    status, prev = choose_image(pg, f)
                except Exception as e:
                    status, prev = "รอสถานะไม่ทัน: " + str(e).splitlines()[0][:60], None
                ck(f"[{name}] pdf-edit รับรูป {label} ได้", status.startswith("เลือกรูปแล้ว"), status[:80])
                ck(f"[{name}] {label}: พรีวิวรูปขึ้นและขนาดตรงต้นฉบับ {W}x{H}",
                   bool(prev) and (prev["w"], prev["h"]) == (W, H), str(prev))
                ctx.close()
            b.close()
    print(f"\nผ่าน {ok} ตก {fail}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
