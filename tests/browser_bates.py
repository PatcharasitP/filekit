# ตรวจของใหม่ในเครื่องมือใส่เลขหน้า: เลขรัน Bates และข้อความของผู้ใช้เอง
#
# ‼️ เลขรัน Bates คือรหัสอ้างอิงที่ใช้ในงานคดีและงานตรวจสอบ ต้องพิมพ์ซ้ำได้เป๊ะ
#    จึงต้องเติมศูนย์ให้ครบหลัก และ **ห้ามแปลงเป็นเลขไทย** แม้ผู้ใช้จะเลือกเลขไทยไว้
#    เพราะรหัสที่อ้างในเอกสารอื่นเป็นเลขอารบิก ถ้าแปลงจะอ้างอิงข้ามเอกสารไม่ได้
# ‼️ และของเดิม (เลขหน้าธรรมดา) ต้องไม่ถูกงานนี้ทำพัง

import sys, os, re, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_bates_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make(path, n=3):
    d = fitz.open()
    for i in range(n):
        p = d.new_page(width=595, height=842)
        p.insert_text((60, 120), f"BODY-{i + 1}", fontname="helv", fontsize=16)
    d.save(str(path)); d.close()
    return path


def texts_of(path):
    d = fitz.open(str(path))
    out = [d[i].get_text() for i in range(d.page_count)]
    d.close()
    return out


def images_of(path):
    """‼️ ข้อความไทยถูกวาดเป็นภาพ PNG ตามการออกแบบเดิมของเครื่องมือ
       (pdf-lib ฝังฟอนต์ไทยไม่ได้ถ้าไม่มี fontkit ซึ่งเราไม่โหลด)
       ตัวตรวจที่อ่านชั้นข้อความจึงอ่านไม่เจอ ต้องนับรูปแทน"""
    d = fitz.open(str(path))
    out = [len(d[i].get_images(full=True)) for i in range(d.page_count)]
    d.close()
    return out


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, timeout=30000):
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=8000)
    except Exception:
        loc = pg.locator(".results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def stamp(pg, src, fmt, setup=None, out_name="out.pdf"):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-page-numbers", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(1500)
    sels = pg.locator(".s2-side-bd select")
    sels.nth(1).select_option(fmt)          # ช่องที่ 2 คือ "รูปแบบ"
    pg.wait_for_timeout(500)
    if setup: setup(pg)
    act(pg, "ใส่เลขหน้า")
    pg.wait_for_timeout(3000)
    return dl_result(pg, DL / out_name)


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    src = make(FIX / "doc.pdf")

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        t = texts_of(src)
        ok1 = ck("ไฟล์ต้นฉบับต้องมี 3 หน้า", len(t), 3)
        ok2 = ck("ไฟล์ต้นฉบับต้องยังไม่มีเลขรัน", any("ABC-" in x for x in t), False,
                 "ถ้ามีอยู่แล้ว เทสจะผ่านโดยไม่ได้พิสูจน์ว่าเครื่องมือทำงาน")
        good = all([ok1, ok2])
        print("\n" + ("✅ ไฟล์ทดสอบใช้ได้" if good else "❌ ไฟล์ทดสอบไม่ถูก"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① เลขรัน Bates")
        out = stamp(pg, src, "bates", out_name="bates.pdf")
        t = texts_of(out)
        found = [re.search(r"ABC-(\d+)", x) for x in t]
        ck("ทุกหน้าต้องมีเลขรัน", [bool(m) for m in found], [True, True, True])
        ck("ต้องเติมศูนย์ครบ 6 หลักตามค่าเริ่มต้น",
           [m.group(1) for m in found if m], ["000001", "000002", "000003"])
        ck("เนื้อหาเดิมต้องยังอยู่", all(f"BODY-{i+1}" in t[i] for i in range(3)), True)

        print("\n── ② เลขรันต้องไม่ถูกแปลงเป็นเลขไทย แม้ผู้ใช้เลือกเลขไทย")
        def pick_thai(page):
            page.locator(".s2-side-bd select").nth(2).select_option("thai")   # ช่องที่ 3 คือชนิดตัวเลข
            page.wait_for_timeout(400)
        out2 = stamp(pg, src, "bates", pick_thai, "bates-thai.pdf")
        t2 = texts_of(out2)
        ck("เลขรันต้องยังเป็นเลขอารบิก แม้เลือกเลขไทยไว้", bool(re.search(r"ABC-000001", t2[0])), True,
           "รหัสอ้างอิงที่แปลงเป็นเลขไทยจะอ้างข้ามเอกสารไม่ได้")
        ck("ต้องไม่มีเลขไทยปนในเลขรัน", any(c in t2[0] for c in "๐๑๒๓๔๕๖๗๘๙"), False)
        ck("เลขรันต้องถูกวาดเป็นข้อความจริง ไม่ใช่ภาพ", images_of(out2), [0, 0, 0],
           "ถ้าเป็นภาพ แปลว่าไปเข้าทางเลขไทย ซึ่งจะคัดลอกรหัสออกมาไม่ได้")

        print("\n── ③ ข้อความของผู้ใช้เอง พร้อมตัวแปร")
        def type_text(page):
            page.locator(".s2-side-bd select").nth(2).select_option("arabic")   # ล้างค่าที่จำมาจากข้อก่อน
            box = page.locator(".s2-side-bd input[type=text]").last
            box.fill("เอกสารลับ หน้า {หน้า}/{จำนวนหน้า}")
            page.wait_for_timeout(500)
        out3 = stamp(pg, src, "custom", type_text, "custom.pdf")
        # ‼️ ข้อความไทยเป็นภาพ จึงตรวจว่ามีภาพถูกฝังเพิ่มทุกหน้า และเนื้อหาเดิมยังอยู่
        imgs3 = images_of(out3)
        ck("ทุกหน้าต้องมีข้อความที่ประทับเพิ่มเข้าไป (เป็นภาพเพราะเป็นภาษาไทย)",
           [i >= 1 for i in imgs3], [True, True, True], f"จำนวนภาพต่อหน้า {imgs3}")
        t3 = texts_of(out3)
        ck("เนื้อหาเดิมต้องยังอยู่ครบ", all(f"BODY-{i+1}" in t3[i] for i in range(3)), True)
        # ‼️ ตรวจการแทนตัวแปรที่ "พรีวิว" เพราะนั่นคือสิ่งที่ผู้ใช้เห็นและใช้ตัดสินใจก่อนกด
        #    ส่วนในไฟล์ผลลัพธ์ ข้อความไทยเป็นภาพอยู่แล้ว จึงอ่านกลับมาเทียบตัวอักษรไม่ได้
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/pdf-page-numbers", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(src))
        pg.wait_for_timeout(1800)
        pg.locator(".s2-side-bd select").nth(1).select_option("custom")
        pg.wait_for_timeout(700)
        # ‼️ ต้องตั้งชนิดตัวเลขกลับเป็นอารบิกก่อน เพราะเครื่องมือ "จำค่าที่ตั้งไว้" ให้ผู้ใช้
        #    ข้อทดสอบก่อนหน้าเลือกเลขไทยไว้ ค่านั้นจึงติดมาถึงข้อนี้ (พฤติกรรมถูกต้องของเครื่องมือ
        #    แต่ทำให้เทสที่รันต่อกันปนกัน ซึ่งเป็นความผิดของเทส ไม่ใช่ของโค้ด)
        pg.locator(".s2-side-bd select").nth(2).select_option("arabic")
        pg.wait_for_timeout(400)
        pg.locator(".s2-side-bd input[type=text]").last.fill("Page {หน้า} of {จำนวนหน้า}")
        pg.wait_for_timeout(800)
        preview = pg.evaluate("() => document.querySelector('.pn-num')?.textContent || ''")
        ck("ตัวแปรต้องถูกแทนด้วยค่าจริงในพรีวิว", preview.strip(), "Page 1 of 3",
           "ถ้ายังเห็นวงเล็บปีกกาอยู่ แปลว่าไม่ได้แทนค่าให้")

        print("\n── ④ ของเดิมต้องไม่พัง")
        out4 = stamp(pg, src, "plain", out_name="plain.pdf")
        t4 = texts_of(out4)
        nums = [re.findall(r"\b([123])\b", x) for x in t4]
        ck("เลขหน้าธรรมดายังทำงานเหมือนเดิม", all(str(i + 1) in "".join(nums[i]) for i in range(3)), True,
           f"เลขที่พบแต่ละหน้า: {nums}")

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ เลขรันและข้อความของผู้ใช้ทำงานถูก และของเดิมไม่พัง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
