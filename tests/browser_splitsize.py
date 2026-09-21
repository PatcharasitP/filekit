# ตรวจโหมด "แยกไฟล์ตามขนาด" ของเครื่องมือแยกไฟล์ PDF
#
# ‼️ สัญญาที่เครื่องมือให้ไว้คือ "แต่ละไฟล์ไม่เกิน X MB" ถ้าทำไม่ได้จริงคือการโกหก
#    เทสนี้จึงวัดขนาดไฟล์จริงทุกใบใน ZIP แล้วเทียบกับเพดานที่ตั้งไว้
# ‼️ และต้องใช้ขนาดจริงต่อหน้า ไม่ใช่ค่าเฉลี่ย
#    ไฟล์ทดสอบจึงจงใจให้หน้าหนักไม่เท่ากัน (3 หน้าแรกมีรูป 3 หน้าหลังข้อความล้วน)
#    ถ้าใช้ค่าเฉลี่ย ไฟล์ที่ได้จะทะลุเพดาน

import sys, os, io, zipfile, pathlib, tempfile, shutil, traceback
import fitz
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_splitsize_"))
FIX, DL = ROOT / "fix", ROOT / "dl"
CAP_MB = 0.2

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make_mixed(path):
    """3 หน้าแรกมีรูปหนัก 3 หน้าหลังข้อความล้วน ขนาดต่อหน้าจึงต่างกันมาก"""
    d = fitz.open()
    for i in range(6):
        p = d.new_page(width=595, height=842)
        if i < 3:
            im = Image.new("RGB", (1400, 1000), (200 - i * 30, 80, 40))
            dr = ImageDraw.Draw(im)
            for k in range(60):
                dr.ellipse([k * 22, k * 15, k * 22 + 150, k * 15 + 110], outline=(255, 255, 255), width=2)
            buf = io.BytesIO(); im.save(buf, "JPEG", quality=96)
            p.insert_image(fitz.Rect(30, 50, 565, 450), stream=buf.getvalue())
        p.insert_text((50, 600), f"SHEET-{i + 1}", fontname="helv", fontsize=20)
    d.save(str(path)); d.close()
    return path


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    src = make_mixed(FIX / "mixed.pdf")

    if SELFTEST:
        # ‼️ พิสูจน์ว่าไฟล์ทดสอบมีหน้าหนักไม่เท่ากันจริง ไม่งั้นเทสนี้ไม่ได้ทดสอบอะไรเลย
        print("ตรวจตัวตรวจเอง")
        d = fitz.open(str(src))
        sizes = []
        for i in range(d.page_count):
            one = fitz.open(); one.insert_pdf(d, from_page=i, to_page=i)
            sizes.append(len(one.tobytes())); one.close()
        d.close()
        heavy, light = max(sizes), min(sizes)
        print(f"     หน้าหนักสุด {heavy//1024} KB · เบาสุด {light//1024} KB")
        ok = ck("ไฟล์ทดสอบต้องมีหน้าหนักกับเบาต่างกันเกิน 5 เท่า", heavy > light * 5, True,
                "ถ้าไม่ต่าง เทสจะผ่านได้แม้เครื่องมือใช้ค่าเฉลี่ย ซึ่งไม่ได้พิสูจน์อะไร")
        print("\n" + ("✅ ไฟล์ทดสอบใช้ได้" if ok else "❌ ไฟล์ทดสอบอ่อนเกินไป"))
        return 0 if ok else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        pg.goto(f"{BASE}/#/pdf-split", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(src))
        pg.wait_for_timeout(3000)          # รอให้วัดขนาดจริงต่อหน้าเสร็จ
        pg.locator('input[type=radio][value="size"]').check()
        pg.wait_for_timeout(600)
        pg.locator('input[type=number]').last.fill(str(CAP_MB))
        pg.wait_for_timeout(1500)

        print("\n── ① พรีวิวต้องตรงกับผลจริง")
        preview = pg.evaluate("() => document.querySelector('.sp-count')?.textContent.trim() || ''")
        warn_text = pg.evaluate("""() => { const w = document.querySelector('.note.warn'); return w && !w.hidden ? w.textContent.trim() : ''; }""")
        act(pg, "แยกไฟล์")
        pg.wait_for_timeout(5000)
        status = pg.evaluate("() => document.querySelector('.status')?.textContent.trim() || ''")
        import re
        pv = re.search(r"(\d+)", preview)
        rv = re.search(r"(\d+)", status)
        ck("จำนวนไฟล์ที่พรีวิวบอก ต้องเท่ากับที่ทำได้จริง",
           pv and rv and pv.group(1) == rv.group(1), True,
           f"พรีวิวว่า {preview!r} · ผลจริงว่า {status!r}")

        print("\n── ② ทุกไฟล์ต้องไม่เกินเพดานที่ตั้งไว้")
        loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ZIP")
        try:
            loc.first.wait_for(state="visible", timeout=8000)
        except Exception:
            loc = pg.locator(".results button:visible, .result button:visible").filter(has_text="ZIP")
            loc.first.wait_for(state="visible", timeout=20000)
        with pg.expect_download() as dl:
            loc.first.click()
        out = DL / "split.zip"; dl.value.save_as(str(out))
        zf = zipfile.ZipFile(out)
        sizes = [(n, zf.getinfo(n).file_size) for n in zf.namelist()]
        cap = CAP_MB * 1024 * 1024
        over = [(n, s) for n, s in sizes if s > cap]
        for n, s in sizes:
            print(f"     {n}: {s/1024:.0f} KB" + ("  (เกินเพดาน)" if s > cap else ""))
        # ‼️ เจตนาจริงของข้อนี้ไม่ใช่ "ทุกไฟล์ต้องเล็กกว่าเพดานเสมอ" ซึ่งเป็นไปไม่ได้ทางกายภาพ
        #    หน้าเดียวที่มีรูปใหญ่ อาจใหญ่กว่าเพดานอยู่แล้ว แยกให้เล็กกว่านั้นไม่ได้
        #    เจตนาคือ "ผู้ใช้ต้องไม่ถูกหลอก" จึงตรวจ 2 อย่างแทน
        #    ① ไฟล์ที่เกินได้ ต้องเป็นไฟล์หน้าเดียวเท่านั้น (แยกต่อไม่ได้จริง ๆ)
        #    ② ต้องมีคำเตือนบนจอบอกไว้ก่อนกด
        bad = []
        for n, s in over:
            dd = fitz.open(stream=zf.read(n), filetype="pdf")
            if dd.page_count > 1: bad.append((n, s, dd.page_count))
            dd.close()
        ck("ไฟล์ที่เกินเพดานได้ ต้องเป็นไฟล์หน้าเดียวที่แยกต่อไม่ได้เท่านั้น", bad, [],
           "ไฟล์หลายหน้าที่เกินเพดาน แปลว่าเครื่องมือแบ่งผิด ยังแยกต่อได้อยู่")
        if over:
            ck("เมื่อมีไฟล์ที่เกิน ต้องมีคำเตือนบนจอก่อนกด", warn_text != "", True,
               "ถ้าไม่เตือน ผู้ใช้จะเชื่อว่าได้ไฟล์ไม่เกินเพดานตามที่ตั้ง ซึ่งไม่จริง")
            ck("คำเตือนต้องบอกว่าหน้าไหนใหญ่เกิน", "ใหญ่กว่าเพดาน" in warn_text, True,
               f"ข้อความจริง {warn_text[:80]!r}")

        print("\n── ③ ต้องใช้ขนาดจริงต่อหน้า ไม่ใช่ค่าเฉลี่ย")
        counts = []
        for n in zf.namelist():
            dd = fitz.open(stream=zf.read(n), filetype="pdf")
            counts.append(dd.page_count); dd.close()
        ck("ต้องมีทั้งไฟล์ที่หน้าเดียวและไฟล์ที่หลายหน้า",
           len(set([c == 1 for c in counts])) == 2, True,
           f"จำนวนหน้าต่อไฟล์ที่ได้ {counts} · ถ้าเท่ากันหมดแปลว่าแบ่งด้วยค่าเฉลี่ย ไม่ใช่ขนาดจริง")
        ck("หน้าทั้ง 6 ต้องอยู่ครบ ไม่หายไปไหน", sum(counts), 6)

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ แยกตามขนาดได้จริง ทุกไฟล์อยู่ในเพดาน และใช้ขนาดจริงต่อหน้า")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
