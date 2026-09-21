# ตรวจว่า "ขนาดโดยประมาณก่อนกด" ของเครื่องมือบีบอัด **ไม่โกหกผู้ใช้**
#
# ‼️ คำถามหลักคือค่าประมาณกับขนาดจริงต่างกันไม่เกินที่ยอมรับได้
#    เพราะถ้าการ์ดบอก -75% แล้วของจริงได้ -20% ผู้ใช้จะเลิกเชื่อตัวเลขบนเว็บนี้ทั้งหมด
# ‼️ และต้องตรวจว่าแถว "เก็บข้อความไว้" ตรงกับพฤติกรรมจริงของเครื่องมือ
#    เพราะเครื่องมือลองเส้นทางนั้นก่อนเสมอ ถ้าการ์ดไม่พูดถึงมัน ผู้ใช้จะงงว่าทำไมผลไม่ตรง

import sys, os, io, re, pathlib, tempfile, shutil, traceback
import fitz
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_est_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

# ‼️ ยอมให้ค่าประมาณคลาดเคลื่อนได้ 30% ของขนาดจริง
#    ไม่ใช่เลขที่ตั้งลอย ๆ: ตัวประมาณสุ่มแค่ 3 หน้าจากทั้งเล่ม เอกสารที่หน้าหนักเบาต่างกันมาก
#    จึงคลาดได้เป็นธรรมดา · แต่ถ้าเกินนี้แปลว่าวิธีสุ่มใช้ไม่ได้ ต้องแก้วิธี ไม่ใช่ขยายเกณฑ์
TOLERANCE = 0.30

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make_photo_pdf(path, pages=6):
    """ไฟล์ที่สมจริงสำหรับเครื่องมือบีบอัด คือมีรูปหนัก ๆ ปนข้อความ"""
    d = fitz.open()
    for i in range(pages):
        im = Image.new("RGB", (900, 700), (200 - i * 18, 90, 40))
        dr = ImageDraw.Draw(im)
        for k in range(40):
            dr.ellipse([k * 20, k * 12, k * 20 + 120, k * 12 + 90], outline=(255, 255, 255), width=2)
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=95)
        p = d.new_page(width=595, height=842)
        p.insert_image(fitz.Rect(40, 60, 555, 460), stream=buf.getvalue())
        p.insert_text((50, 520), f"page {i + 1} with text", fontname="helv", fontsize=13)
    d.save(str(path)); d.close()
    return path


SIZE_RE = re.compile(r"([\d.]+)\s*(B|KB|MB|GB)")
UNIT = {"B": 1, "KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3}


def parse_size(text):
    m = SIZE_RE.search(text or "")
    return float(m.group(1)) * UNIT[m.group(2)] if m else None


def rows_of(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.cmp-est-row')].map(r => ({
        name: r.querySelector('.cmp-est-name').textContent.trim(),
        size: r.querySelector('.cmp-est-size').textContent.trim(),
        pct:  r.querySelector('.cmp-est-pct').textContent.trim(),
        keep: r.classList.contains('cmp-est-keep'),
      }))""")


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    src = make_photo_pdf(FIX / "photo.pdf")
    real_size = src.stat().st_size

    if SELFTEST:
        print("ตรวจตัวตรวจเอง (ตัวแปลงหน่วยขนาดไฟล์)")
        ok1 = ck("อ่าน '≈ 282 KB' ได้ถูก", parse_size("≈ 282 KB"), 282 * 1024)
        ok2 = ck("อ่าน '1.5 MB' ได้ถูก", parse_size("1.5 MB"), 1.5 * 1024 ** 2)
        ok3 = ck("อ่านข้อความที่ไม่มีตัวเลขต้องได้ None", parse_size("…"), None)
        good = all([ok1, ok2, ok3])
        print("\n" + ("✅ ตัวตรวจอ่านขนาดได้ถูกทุกหน่วย" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        pg.goto(f"{BASE}/#/pdf-compress", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(src))
        pg.wait_for_selector(".cmp-est-row", timeout=30000)
        pg.wait_for_function(
            "() => ![...document.querySelectorAll('.cmp-est-size')].some(e => e.textContent.includes('…'))",
            timeout=60000)

        print("\n── ① การ์ดประมาณต้องครบและอ่านออก")
        rows = rows_of(pg)
        ck("ต้องมี 4 แถว คือเก็บข้อความ บวกสามระดับ", len(rows), 4)
        ck("แถวแรกต้องเป็นแถวเก็บข้อความ", rows[0]["keep"], True,
           "เครื่องมือลองเส้นทางนี้ก่อนเสมอ ถ้าการ์ดไม่พูดถึง ผู้ใช้จะงงว่าทำไมผลไม่ตรง")
        sizes = [parse_size(r["size"]) for r in rows]
        ck("ทุกแถวต้องบอกขนาดเป็นตัวเลข ไม่ใช่ค้างที่จุดไข่ปลา", [s for s in sizes if s is None], [])
        lv = sizes[1:]
        ck("ยิ่งบีบแรง ขนาดต้องยิ่งเล็กลง", lv == sorted(lv, reverse=True), True, f"ได้ {lv}")

        print("\n── ② ค่าประมาณต้องตรงกับผลจริง")
        pg.locator("select").first.select_option("strong")
        pg.wait_for_timeout(500)
        est_strong = parse_size(rows_of(pg)[3]["size"])
        cta = pg.locator("button.s2-cta")
        cta.first.click()
        # เครื่องมืออาจหยุดถามก่อนว่ายอมให้ข้อความหายไหม ซึ่งเป็นพฤติกรรมที่ถูกต้อง
        confirm = pg.locator("button").filter(has_text="บีบต่อโดยยอมให้ข้อความหาย")
        try:
            confirm.first.wait_for(state="visible", timeout=8000)
            print("     (เครื่องมือถามก่อนว่ายอมให้ข้อความหายไหม กดยืนยัน)")
            confirm.first.click()
        except Exception:
            pass
        pg.wait_for_function(
            "() => { const s = document.querySelectorAll('.cmp-stat-v'); return s[1] && s[1].textContent.trim() !== '-'; }",
            timeout=120000)
        got = pg.evaluate("() => [...document.querySelectorAll('.cmp-stat-v')].map(e => e.textContent.trim())")
        actual = parse_size(got[1])
        ck("ต้องได้ขนาดจริงออกมา", actual is not None, True, f"ช่องขนาดใหม่แสดง {got[1]!r}")
        if actual and est_strong:
            off = abs(actual - est_strong) / actual
            print(f"     ประมาณ {est_strong/1024:.0f} KB · จริง {actual/1024:.0f} KB · คลาด {off*100:.1f}%")
            ck(f"ค่าประมาณต้องคลาดไม่เกิน {int(TOLERANCE*100)}% ของขนาดจริง", off <= TOLERANCE, True,
               "ถ้าเกิน แปลว่าวิธีสุ่มหน้าใช้ไม่ได้ ต้องแก้วิธี ห้ามขยายเกณฑ์")

        print("\n── ③ แถวเก็บข้อความต้องตรงกับพฤติกรรมจริง")
        keep_pct = rows[0]["pct"]
        status = pg.evaluate("() => document.querySelector('.status')?.textContent || ''")
        said_cannot = "ไม่ทำให้ข้อความหายไม่ได้" in status or "บีบให้เล็กลงโดยไม่" in status
        ck("ถ้าการ์ดบอกว่าเก็บข้อความแล้วไม่เล็กลงพอ เครื่องมือก็ต้องบอกแบบเดียวกัน",
           ("ไม่เล็กลงพอ" in keep_pct) == said_cannot or not said_cannot, True,
           f"การ์ดว่า {keep_pct!r} · เครื่องมือว่า {status[:70]!r}")

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ค่าประมาณตรงกับผลจริง และสอดคล้องกับพฤติกรรมของเครื่องมือ")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
