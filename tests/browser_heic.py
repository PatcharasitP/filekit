#!/usr/bin/env python3
"""รูป HEIC จาก iPhone ต้องใช้กับเครื่องมือรูปภาพได้จริง

‼️ ที่มา 20/09/2026 พี่ปอนด์ลองแปลงรูปจากมือถือ ไฟล์ชื่อ 1000051522.heic
   เว็บขึ้นว่า "แปลงไม่สำเร็จ: แปลงไม่สำเร็จ ตรวจว่าเป็นรูปจริง"
   ① ข้อความซ้ำสองรอบ  ② โทษผู้ใช้ว่าไฟล์ไม่ใช่รูป ทั้งที่เป็นรูปจริงทุกประการ
   ③ .heic อยู่ในรายการชนิดไฟล์ที่เรารับอยู่แล้ว = รับเข้ามาแล้วทำไม่ได้ แย่กว่าไม่รับตั้งแต่แรก

‼️ ทำไมเบราว์เซอร์อ่านไม่ได้: HEIC ใช้ตัวบีบอัด HEVC ที่ติดสิทธิบัตร
   Chrome/Firefox จึงไม่ใส่มาให้ ส่วน Safari อ่านได้เพราะ Apple จ่ายค่าสิทธิ์อยู่แล้ว

‼️ สองข้อที่ห้ามหลุดเด็ดขาด และเป็นเหตุผลหลักที่เทสนี้มีอยู่
   ① ‼️ หน้าเว็บหลักต้องไม่มี 'unsafe-eval' ตลอดไป
      ตัวถอด HEIC ต้องการมันจริง แต่เราขังมันไว้ใน iframe ที่มี CSP ของตัวเอง
      ถ้าวันหลังมีคนแก้ให้ง่ายด้วยการเปิด unsafe-eval ทั้งเว็บ ข้อนี้ต้องแดงทันที
   ② ‼️ ไฟล์รูปธรรมดาต้องไม่ไปโหลดตัวถอด 877 KB
      ทั้งเว็บนี้สร้างบนหลัก "โหลดเท่าที่ใช้" ถ้าคนแปลง JPG แล้วโดนดูดเน็ต 877 KB ฟรี คือทำลายหลักนั้น

รันปกติ:   ../.venv/bin/python tests/browser_heic.py
รันพิสูจน์: ../.venv/bin/python tests/browser_heic.py --selftest
"""
import math
import os
import pathlib
import random
import sys
import tempfile

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
ok = fail = 0
reds = []
MUST_FAIL = {"แปลง HEIC เป็น JPG ได้ภาพตรงกับต้นฉบับ"}

try:
    from PIL import Image, ImageDraw
    import numpy as np
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    print("  ⚠️  ข้ามเทสนี้ ต้องมี Pillow, numpy และ pillow-heif")
    sys.exit(0)


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def make_heic(path):
    """ไฟล์ HEIC จริง หน้าตาเหมือนรูปถ่าย ไม่ใช่สีเรียบ ๆ ที่อัลกอริทึมห่วย ๆ ก็ผ่าน"""
    random.seed(11)
    im = Image.new("RGB", (900, 640), (248, 244, 236))
    d = ImageDraw.Draw(im)
    for _ in range(50):
        x, y = random.randint(0, 900), random.randint(0, 640)
        d.ellipse([x, y, x + random.randint(40, 180), y + random.randint(40, 180)],
                  fill=(random.randint(50, 235), random.randint(50, 235), random.randint(50, 235)))
    d.rectangle([330, 250, 580, 420], fill=(18, 28, 56))
    im.save(path, format="HEIF", quality=82)


def make_jpg(path):
    Image.new("RGB", (400, 300), (200, 120, 80)).save(path, quality=85)


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk-heic-"))
    heic, jpg = tmp / "ภาพจากไอโฟน.heic", tmp / "ธรรมดา.jpg"
    make_heic(heic)
    make_jpg(jpg)

    # ── ① หน้าเว็บหลักต้องไม่มี unsafe-eval ─────────────────────────────────
    root = pathlib.Path(__file__).resolve().parent.parent
    main_csp = (root / "index.html").read_text(encoding="utf-8")
    i = main_csp.find("Content-Security-Policy")
    head = main_csp[i:i + 900] if i >= 0 else ""
    ck("‼️ หน้าเว็บหลักต้องไม่มี 'unsafe-eval'", "'unsafe-eval'" not in head)
    box = (root / "vendor" / "heic-sandbox.html").read_text(encoding="utf-8")
    ck("ห้องขังตัวถอดต้องมี CSP ของตัวเอง และต่อเน็ตไม่ได้",
       "default-src 'none'" in box and "'unsafe-eval'" in box)

    with sync_playwright() as p:
        b = p.chromium.launch()

        # ── ② ไฟล์รูปธรรมดาต้องไม่ไปโหลดตัวถอด HEIC ────────────────────────
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        hits = []
        pg.on("request", lambda r: hits.append(r.url) if "libheif" in r.url else None)
        pg.goto(f"{BASE}/#image-convert", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.locator("input[type=file]").first.set_input_files(str(jpg))
        pg.wait_for_timeout(2200)
        pg.get_by_role("button", name="แปลงไฟล์").filter(visible=True).first.click()
        pg.wait_for_timeout(5000)
        ck("‼️ แปลงไฟล์ JPG ธรรมดา ต้องไม่โหลดตัวถอด HEIC สักไบต์", not hits, str(hits[:1]))
        ctx.close()

        # ── ③ แปลง HEIC เป็น JPG แล้วภาพต้องตรงกับต้นฉบับ ──────────────────
        # ‼️ โหมดพิสูจน์ต้องปิด service worker ด้วย ไม่งั้นมันเสิร์ฟห้องขังจากแคช
        #    แล้วการบล็อกของเทสไม่มีผลเลย (เจอเองรอบแรก เทสเขียวทั้งที่ควรแดง)
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True,
                            service_workers="block" if SELFTEST else "allow")
        pg = ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text[:130]) if m.type == "error" else None)
        if SELFTEST:
            # โหมดพิสูจน์: ปิดห้องขังไม่ให้โหลด = ต้องถอดไม่ได้ และเทสต้องแดง
            pg.route("**/heic-sandbox.html", lambda r: r.abort())
        pg.goto(f"{BASE}/#image-convert", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.locator("input[type=file]").first.set_input_files(str(heic))
        pg.wait_for_timeout(2500)
        pg.get_by_role("button", name="แปลงไฟล์").filter(visible=True).first.click()
        pg.wait_for_timeout(12000)
        status = pg.locator(".status").inner_text().replace("\n", " ")
        got = None
        try:
            with pg.expect_download(timeout=12000) as dl:
                pg.get_by_role("button", name="ดาวน์โหลด").filter(visible=True).first.click()
            got = tmp / "out.jpg"
            dl.value.save_as(str(got))
        except Exception:
            got = None
        diff = None
        if got and got.exists():
            a = np.asarray(Image.open(heic).convert("RGB"), float)
            c = np.asarray(Image.open(got).convert("RGB"), float)
            diff = float(np.abs(a - c).mean()) if a.shape == c.shape else None
        ck("แปลง HEIC เป็น JPG ได้ภาพตรงกับต้นฉบับ",
           diff is not None and diff < 6, f"ต่าง {diff}" if diff is not None else status[:60])
        ck("ข้อความสถานะต้องไม่พูดซ้ำสองรอบ",
           status.count("แปลงไม่สำเร็จ") <= 1, status[:70])
        ck("ข้อความตอนพังต้องไม่โทษผู้ใช้ว่าไฟล์ไม่ใช่รูป",
           "ตรวจว่าเป็นรูปจริง" not in status, status[:70])
        ck("ไม่มี error หลุดออกมา", not [e for e in errs if "CSP" not in e], errs[:1])
        ctx.close()

        # ── ④ เครื่องมือรูปตัวอื่นต้องรับ HEIC ได้เหมือนกัน ────────────────
        if not SELFTEST:
            for tool, btn, want in [("image-resize", "ย่อและบีบอัด", "เสร็จ"),
                                    ("images-to-pdf", "สร้างไฟล์ PDF", "เรียบร้อย"),
                                    ("image-bg-remove", "ลบพื้นหลัง", "เสร็จ")]:
                ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
                pg = ctx.new_page()
                pg.goto(f"{BASE}/#{tool}", wait_until="load", timeout=60000)
                pg.wait_for_timeout(2400)
                pg.locator("input[type=file]").first.set_input_files(str(heic))
                pg.wait_for_timeout(4500)
                try:
                    pg.get_by_role("button", name=btn).filter(visible=True).first.click()
                    pg.wait_for_timeout(11000)
                    st = pg.locator(".status").inner_text().replace("\n", " ")
                except Exception as e:
                    st = "กดปุ่มไม่ได้: " + str(e).splitlines()[0][:40]
                ck(f"[{tool}] รับไฟล์ HEIC ได้", want in st, st[:55])
                ctx.close()
        b.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    if SELFTEST:
        good = set(reds) == MUST_FAIL
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงข้อที่ควรจับ" if good else
              f"❌ จับไม่ตรง ขาด {MUST_FAIL - set(reds)} เกิน {set(reds) - MUST_FAIL}")
        return 0 if good else 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
