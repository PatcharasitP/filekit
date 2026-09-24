# -*- coding: utf-8 -*-
"""ลบพื้นหลังรูปภาพ — วัดผลกับรูปที่ "มีเฉลย" ไม่ใช่ดูแล้วรู้สึกว่าใช้ได้

‼️ ทำไมต้องสร้างรูปพร้อมเฉลยเอง
   วาดหมึกลงชั้นโปร่งใสก่อน เก็บช่องอัลฟาไว้เป็นเฉลย แล้วค่อยเอาไปทับบนกระดาษที่แสงไม่เท่ากัน
   จึงให้คะแนนได้เป็นตัวเลขว่า "พื้นหลังยังค้างเท่าไหร่" และ "เนื้อหายไปเท่าไหร่"
   ถ้าวัดด้วย IoU อย่างเดียวจะถูกหลอก — เคยได้ IoU 100% ทั้งที่พื้นหลังยังทึบค้าง 33/255
   ซึ่งเวลาเอาไปวางทับพื้นอื่นจะเห็นเป็นฝ้าเทาทั้งกรอบ

‼️ บทเรียนที่ทำให้ต้องมีเทสนี้ (19/09/2026)
   ครั้งแรกประมาณพื้นหลังด้วยค่าเฉลี่ยในละแวก พิสูจน์กับรูปหมึกบาง 2 รูปแล้วเหมาว่าใช้ได้หมด
   พอเจอโลโก้ที่กินพื้นที่ 16% ค่าเฉลี่ยกลายเป็นสีของโลโก้เอง -> โลโก้หายทั้งอัน (เนื้อหาย 84.7)
   แก้เป็นค่าสว่างสูงสุดในละแวกถึงรอด เทสนี้จึงต้องมีรูปที่วัตถุใหญ่อยู่ด้วยเสมอ
"""
import pathlib
import sys
import tempfile

from playwright.sync_api import sync_playwright

# ‼️ ต้องเคารพ FK_BASE เสมอ ไม่งั้นตัวรันกลางยิงพอร์ตหนึ่ง เทสไปยิงอีกพอร์ตหนึ่ง
#    แล้วขึ้น ERR_CONNECTION_REFUSED โดยที่ของจริงไม่ได้พังเลย (เจอ 21/09/2026)
import os
BASE = (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http")
        else os.environ.get("FK_BASE", "http://127.0.0.1:8899"))
ok, bad = [], []
def check(name, cond, got=""):
    (ok if cond else bad).append(name)
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  ({got})" if got else ""))

try:
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np
except ImportError:
    print("  ⚠️  ข้ามเทสนี้ ต้องมี Pillow กับ numpy")
    sys.exit(0)

DIR = pathlib.Path(tempfile.gettempdir()) / "filekit-bgremove"
DIR.mkdir(exist_ok=True)
import math, random
random.seed(7)

def paper(w, h, base, dark=0.28):
    """กระดาษที่แสงไม่เท่ากันทั้งแผ่น + เกรนกล้อง เหมือนถ่ายด้วยมือถือจริง
       ‼️ ถ้าใช้พื้นขาวเรียบ อัลกอริทึมห่วย ๆ ก็ผ่าน เทสจะไม่จับอะไรเลย"""
    im = Image.new("RGB", (w, h), base); px = im.load()
    cx, cy = w * 0.35, h * 0.3
    for y in range(h):
        for x in range(w):
            k = 1.0 - dark * (math.hypot(x - cx, y - cy) / math.hypot(w, h))
            n = random.randint(-4, 4)
            px[x, y] = tuple(max(0, min(255, int(c * k) + n)) for c in base)
    return im

def compose(name, w, h, base, draw_ink, dark=0.28, blur=0.7):
    ink = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_ink(ImageDraw.Draw(ink))
    ink = ink.filter(ImageFilter.GaussianBlur(blur))
    out = paper(w, h, base, dark).convert("RGBA")
    out.alpha_composite(ink)
    out.convert("RGB").save(DIR / f"{name}.png")
    ink.split()[3].save(DIR / f"{name}-truth.png")

def sig(d):
    pts = [(120, 330)]
    for i in range(1, 60):
        t = i / 59
        pts.append((120 + t * 640, 330 - 130 * math.sin(t * math.pi * 2.3) * (1 - t * 0.35) + random.randint(-4, 4)))
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i+1]], fill=(28, 32, 60, 255), width=9 if i % 7 else 13)
    d.line([(150, 400), (700, 392)], fill=(30, 34, 62, 255), width=5)

def logo(d):
    d.ellipse([120, 120, 480, 480], outline=(214, 84, 30, 255), width=36)
    d.polygon([(300, 190), (400, 410), (200, 410)], fill=(30, 48, 90, 255))

def product(d):
    d.rounded_rectangle([250, 150, 470, 390], 26, fill=(58, 92, 170, 255))
    # ‼️ หน้าขาวเกือบเท่าพื้นหลัง — จุดนี้คือตัวจับว่าเลือกโหมดถูกไหม
    d.rounded_rectangle([282, 182, 438, 300], 14, fill=(240, 244, 252, 255))

compose("sig", 900, 500, (246, 243, 236), sig)                     # หมึกบาง 2% ของภาพ
compose("logo", 600, 600, (255, 255, 255), logo, dark=0.0, blur=0.4)  # วัตถุใหญ่ 16%
compose("product", 700, 520, (232, 232, 234), product, blur=0.6)   # มีส่วนสว่างเท่าพื้นหลัง

def score(alpha_png, truth_png):
    # ‼️ แปลงเป็น RGBA ก่อนอ่านความใส (24/09/2026): OxiPNG เก็บรูปที่มีไม่เกิน 256 สีเป็น PNG แบบจานสี + tRNS (โหมด P)
    #    ไม่เสียอะไรเลย แต่โหมด P ไม่มีช่อง A ให้ getchannel ตรง ๆ เทสเคยระเบิด "The image has no channel A"
    a = np.asarray(Image.open(alpha_png).convert("RGBA").getchannel("A"), float)
    t = np.asarray(Image.open(truth_png), float)
    return a[t < 20].mean(), (255 - a[t > 200]).mean(), ((a > 128) == (t > 128)).mean() * 100

with sync_playwright() as p:
    b = p.chromium.launch()
    try:
        for name, want_min in [("sig", 99.0), ("logo", 99.0), ("product", 99.0)]:
            ctx = b.new_context(viewport={"width": 1440, "height": 960}, accept_downloads=True)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
            pg.goto(f"{BASE}/#image-bg-remove", wait_until="load", timeout=45000)
            pg.wait_for_timeout(2200)
            if name == "sig":
                check("หน้าเครื่องมือมีผืนพื้นหมากรุกให้เห็นความโปร่งใส",
                      pg.locator(".bgr-stage").count() == 1)
            pg.locator("input[type=file]").first.set_input_files(str(DIR / f"{name}.png"))
            pg.wait_for_timeout(2400)
            mode = pg.evaluate("() => document.querySelector('input[name^=seg]:checked').value")
            pg.get_by_role("button", name="ลบพื้นหลัง").first.click()
            pg.wait_for_timeout(3000)
            with pg.expect_download() as dl:
                pg.get_by_role("button", name="ดาวน์โหลด").first.click()
            got = DIR / f"{name}-out.png"
            dl.value.save_as(str(got))
            leak, loss, agree = score(got, DIR / f"{name}-truth.png")
            check(f"[{name}] ผลลัพธ์ตรงกับเฉลยอย่างน้อย {want_min}%", agree >= want_min,
                  f"ตรง {agree:.1f}%  เดาโหมด {mode}")
            check(f"[{name}] พื้นหลังใสจริง ไม่เหลือฝ้า", leak <= 3.0, f"ค้าง {leak:.2f}/255")
            check(f"[{name}] เนื้อที่ต้องเก็บไม่หายไป", loss <= 12.0, f"หาย {loss:.2f}/255")
            if errs:
                check(f"[{name}] ไม่มี error หลุดออกมา", False, errs[0])
            ctx.close()

        # ‼️ ข้อนี้มาจากบั๊กจริง: วัตถุใหญ่เคยหายทั้งอันเพราะประมาณพื้นหลังด้วยค่าเฉลี่ย
        #    เก็บไว้เป็นข้อเฉพาะ เพราะถ้ามีคนเปลี่ยนกลับไปใช้ค่าเฉลี่ย เทสต้องแดงทันที
        leak, loss, agree = score(DIR / "logo-out.png", DIR / "logo-truth.png")
        check("วัตถุใหญ่ที่กินพื้นที่ 16% ต้องไม่หายไปทั้งอัน", loss <= 12.0, f"หาย {loss:.2f}/255")

        # ‼️ และข้อนี้มาจากบั๊กที่สอง: รูปที่มีส่วนสว่างเท่าพื้นหลัง ต้องไม่ถูกเจาะรู
        leak, loss, agree = score(DIR / "product-out.png", DIR / "product-truth.png")
        check("ของที่มีส่วนสว่างเท่าพื้นหลัง ต้องไม่ถูกเจาะรูกลางวัตถุ", loss <= 12.0, f"หาย {loss:.2f}/255")
    except Exception as e:
        bad.append(f"เทสระเบิดกลางทาง: {str(e).splitlines()[0][:90]}")
        print(f"  ❌ เทสระเบิดกลางทาง {str(e).splitlines()[0][:90]}")
    b.close()

print(f"\nผ่าน {len(ok)} ตก {len(bad)}")
for x in bad:
    print(f"   ❌ {x}")
sys.exit(1 if bad else 0)
