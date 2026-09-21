# ตรวจเครื่องมือ "ดึงรูปออกจาก PDF"
#
# ‼️ คำถามหลักคือ **ได้รูปตามความละเอียดจริงที่ฝังในไฟล์ ไม่ใช่ภาพหน้าจอ**
#    ไฟล์ทดสอบจึงฝังรูป 320x200 แล้ววางในหน้าให้เล็กกว่านั้น
#    ถ้าเครื่องมือไปจับภาพจากหน้า จะได้ขนาดตามที่วาง ไม่ใช่ 320x200
# ‼️ และต้องได้ทั้งรูป JPEG กับ PNG (pdf-lib ดึง PNG ไม่ได้ จึงต้องใช้ pdf.js)

import sys, os, io, pathlib, tempfile, shutil, traceback
import fitz
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_ximg_"))
FIX, DL = ROOT / "fix", ROOT / "dl"
BIG = (320, 200)
TINY = (24, 24)

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def pic(color, fmt, size):
    im = Image.new("RGB", size, color)
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, size[0] // 3, size[1] // 3], fill="white")
    buf = io.BytesIO(); im.save(buf, fmt, quality=92)
    return buf.getvalue()


def make(path):
    """ฝังรูป 3 ใบ: JPEG ใหญ่, PNG ใหญ่, และไอคอนจิ๋ว
       ‼️ วางรูปในหน้าให้เล็กกว่าขนาดจริง เพื่อพิสูจน์ว่าเครื่องมือไม่ได้จับภาพจากหน้า"""
    d = fitz.open()
    p = d.new_page(width=595, height=842)
    p.insert_image(fitz.Rect(50, 60, 200, 154), stream=pic((180, 69, 31), "JPEG", BIG))   # วาง 150x94
    p.insert_image(fitz.Rect(50, 200, 200, 294), stream=pic((31, 100, 180), "PNG", BIG))
    p.insert_image(fitz.Rect(50, 340, 62, 352), stream=pic((20, 160, 90), "PNG", TINY))
    p.insert_text((50, 420), "three images above", fontname="helv", fontsize=13)
    d.save(str(path)); d.close()
    return path


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def extract(pg, src, min_size=None):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-extract-images", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(1800)
    if min_size is not None:
        pg.locator(".s2-side-bd select").first.select_option(min_size)
        pg.wait_for_timeout(400)
    act(pg, "ดึงรูปทั้งหมด")
    pg.wait_for_timeout(4000)
    return pg.evaluate("""() => ({
        cards: [...document.querySelectorAll('.xi-card')].map(c => c.querySelector('.xi-cap').textContent.trim()),
        bar: document.querySelector('.xi-bar')?.textContent.trim() || '',
        status: document.querySelector('.status')?.textContent.trim() || '',
        empty: document.querySelector('.xi-empty')?.textContent.trim() || '',
      })""")


def sizes_from(caps):
    out = []
    import re
    for c in caps:
        m = re.search(r"(\d+)x(\d+)", c)
        if m: out.append((int(m.group(1)), int(m.group(2))))
    return out


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    src = make(FIX / "with-images.pdf")

    if SELFTEST:
        # ‼️ พิสูจน์ว่าไฟล์ทดสอบมีรูปครบ 3 ใบจริง และวางในหน้าเล็กกว่าขนาดจริง
        print("ตรวจตัวตรวจเอง")
        d = fitz.open(str(src))
        imgs = d[0].get_images(full=True)
        ok1 = ck("ไฟล์ทดสอบต้องมีรูปฝังอยู่ 3 ใบ", len(imgs), 3)
        rects = [d[0].get_image_rects(i[0]) for i in imgs]
        placed_w = round(rects[0][0].width) if rects and rects[0] else 0
        ok2 = ck("รูปต้องถูกวางในหน้าเล็กกว่าขนาดจริง (พิสูจน์ว่าไม่ใช่ภาพหน้าจอ)",
                 placed_w < BIG[0], True, f"วางกว้าง {placed_w} จุด ขณะที่รูปจริงกว้าง {BIG[0]} พิกเซล")
        d.close()
        # ตัวอ่านขนาดต้องอ่านจากคำบรรยายได้จริง
        ok3 = ck("ตัวอ่านขนาดต้องอ่านค่าจากคำบรรยายได้", sizes_from(["หน้า 1, 320x200, 12 KB"]), [(320, 200)])
        good = all([ok1, ok2, ok3])
        print("\n" + ("✅ ไฟล์ทดสอบและตัวอ่านใช้ได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① ดึงทุกขนาด ต้องได้ครบ 3 ใบ")
        r = extract(pg, src, "0")
        sizes = sizes_from(r["cards"])
        ck("ต้องได้การ์ดรูปครบ 3 ใบ", len(r["cards"]), 3, f"bar: {r['bar']!r} · status: {r['status']!r}")
        ck("ต้องได้รูปใหญ่ตามความละเอียดจริง ไม่ใช่ขนาดที่วางในหน้า",
           sorted(s for s in sizes if s[0] > 100), [BIG, BIG],
           "ถ้าได้ขนาดเล็กกว่านี้ แปลว่าไปจับภาพจากหน้าแทนที่จะดึงรูปที่ฝังไว้")
        ck("ต้องได้ไอคอนจิ๋วด้วยเมื่อเลือกทุกขนาด", TINY in sizes, True, f"ขนาดที่ได้ {sizes}")

        print("\n── ② ข้ามรูปเล็ก ต้องได้เฉพาะรูปใหญ่")
        r2 = extract(pg, src, "64")
        s2 = sizes_from(r2["cards"])
        ck("ต้องเหลือ 2 ใบ", len(r2["cards"]), 2)
        ck("ต้องไม่มีไอคอนจิ๋วปนมา", TINY in s2, False)

        print("\n── ③ ไฟล์ที่ไม่มีรูป ต้องบอกผู้ใช้ ไม่ใช่เงียบ")
        plain = FIX / "plain.pdf"
        d = fitz.open(); d.new_page(width=595, height=842).insert_text((60, 100), "text only", fontname="helv", fontsize=14)
        d.save(str(plain)); d.close()
        r3 = extract(pg, plain, "0")
        ck("ต้องไม่มีการ์ดรูป", len(r3["cards"]), 0)
        ck("ต้องขึ้นข้อความบอกว่าไม่พบรูป", "ไม่พบรูป" in (r3["empty"] + r3["status"]), True,
           f"ข้อความที่ขึ้น {r3['empty'][:60]!r}")

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ดึงรูปได้ครบทุกชนิด ตามความละเอียดจริง และกรองขนาดได้")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
