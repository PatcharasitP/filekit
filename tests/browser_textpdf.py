# ตรวจเครื่องมือ "ข้อความเป็น PDF"
#
# ‼️ คำถามหลัก 3 ข้อ ที่ต้องพิสูจน์จากไฟล์จริง ไม่ใช่จากข้อความบนหน้าจอ
#    ① ได้ **ชั้นข้อความจริง** ที่ค้นหาและคัดลอกได้ ไม่ใช่ภาพของตัวอักษร
#    ② วรรณยุกต์ไทยไม่หาย (บทเรียน word-to-pdf: "ที่นี่" เคยออกมาเป็น "ทีนี")
#    ③ ตัดบรรทัดแล้ว **ไม่ฉีกคำไทย** วัดด้วยการค้นคำเต็มในไฟล์ที่ได้
#       ถ้าคำถูกฉีกคนละบรรทัด ค้นหาในไฟล์จะไม่เจอ ซึ่งคือความเสียหายจริงที่ผู้ใช้เจอ
#
# ‼️ และข้อ ⑦ เป็น regression ของบั๊กที่จับได้ 21/09/2026: ตัวแยกชนิดไฟล์ไม่รู้จัก .txt
#    ทำให้เครื่องมือที่เขียนเองว่ารับ .txt กลับปฏิเสธไฟล์ .txt ที่ผู้ใช้ลากมาวาง

import sys, os, io, pathlib, tempfile, shutil, traceback
import fitz
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_txtpdf_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

TONE = "ที่นี่ ค่ำ พี่ชาย เสื้อ หนึ่ง ผึ้ง"
LONG_WORDS = ["ค่าใช้จ่าย", "สำนักงาน", "ผู้รับผิดชอบ", "งบประมาณ", "ประจำปี"]
PARA = ("รายงานสรุป" + "".join(LONG_WORDS) * 3 +
        " ของหน่วยงานในรอบเดือนที่ผ่านมา พร้อมรายละเอียดประกอบการพิจารณาอนุมัติ")

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


# ── ตัวตรวจ: อ่านจากไฟล์ PDF จริง ────────────────────────────────────────────
def text_of(path):
    d = fitz.open(str(path))
    t = "".join(p.get_text() for p in d)
    d.close()
    return t


def findable(path, words):
    """คำไหน 'ค้นหาเจอในไฟล์' บ้าง — คำที่ถูกฉีกคนละบรรทัดจะหาไม่เจอ"""
    d = fitz.open(str(path))
    found = []
    for w in words:
        if any(p.search_for(w) for p in d): found.append(w)
    d.close()
    return found


def shape(path):
    d = fitz.open(str(path))
    n, r = d.page_count, d[0].rect
    d.close()
    return n, (round(r.width), round(r.height))


# ── หน้าเว็บ ────────────────────────────────────────────────────────────────
def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def open_tool(pg):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/text-to-pdf", wait_until="networkidle")
    pg.wait_for_selector(".tp-ta", state="visible")


def make(pg, text=None, upload=None, paper=None, size=None, numbers=None, out="out.pdf"):
    open_tool(pg)
    if upload is not None:
        pg.locator(".dz input[type=file]").set_input_files(str(upload))
        pg.wait_for_timeout(1500)
    if text is not None:
        pg.locator(".tp-ta").fill(text)
        pg.wait_for_timeout(300)
    sels = pg.locator(".s2-side-bd select")
    if paper is not None:  sels.nth(0).select_option(paper)
    if size is not None:   sels.nth(1).select_option(size)
    if numbers is not None: sels.nth(3).select_option(numbers)
    pg.wait_for_timeout(300)
    act(pg, "สร้างไฟล์ PDF")
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=60000)
    except Exception:
        loc = pg.locator(".results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=60000)
    with pg.expect_download() as dl:
        loc.first.click()
    p = DL / out
    dl.value.save_as(str(p))
    return p


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)

    if SELFTEST:
        # ‼️ พิสูจน์ว่าตัวตรวจทั้งสามแยก "ของถูก" ออกจาก "ของผิด" ได้จริง
        print("ตรวจตัวตรวจเอง")
        # ① ข้อความที่เป็นภาพ ต้องอ่านเป็นข้อความไม่ได้
        im = Image.new("RGB", (400, 120), "white")
        ImageDraw.Draw(im).text((10, 40), "PICTURE ONLY", fill="black")
        buf = io.BytesIO(); im.save(buf, "PNG")
        d = fitz.open(); pg1 = d.new_page(width=400, height=200)
        pg1.insert_image(fitz.Rect(0, 0, 400, 120), stream=buf.getvalue())
        img_pdf = FIX / "image-only.pdf"; d.save(str(img_pdf)); d.close()
        ok1 = ck("ไฟล์ที่ข้อความเป็นภาพ ต้องอ่านชั้นข้อความไม่ได้", text_of(img_pdf).strip(), "",
                 "ถ้าข้อนี้ไม่ว่าง แปลว่าตัวตรวจแยกภาพกับข้อความจริงไม่ออก")

        # ② คำที่ถูกฉีกคนละบรรทัด ต้องค้นหาไม่เจอ แต่คำที่อยู่ครบต้องเจอ
        d = fitz.open(); pg2 = d.new_page(width=400, height=200)
        pg2.insert_text((20, 50), "PART", fontname="helv", fontsize=14)
        pg2.insert_text((20, 80), "IAL", fontname="helv", fontsize=14)
        pg2.insert_text((20, 120), "WHOLE", fontname="helv", fontsize=14)
        split_pdf = FIX / "split-word.pdf"; d.save(str(split_pdf)); d.close()
        ok2 = ck("คำที่ถูกฉีกคนละบรรทัด ต้องค้นหาไม่เจอ", findable(split_pdf, ["PARTIAL"]), [])
        ok3 = ck("คำที่อยู่ครบ ต้องค้นหาเจอ (ประชากรต้องไม่เป็นศูนย์)", findable(split_pdf, ["WHOLE"]), ["WHOLE"])

        # ③ ตัวอ่านขนาดหน้าต้องแยก A4 กับ A5 ออก
        d = fitz.open(); d.new_page(width=419.53, height=595.28)
        a5 = FIX / "a5.pdf"; d.save(str(a5)); d.close()
        ok4 = ck("ตัวอ่านขนาดหน้าต้องได้ A5 ไม่ใช่ A4", shape(a5)[1], (420, 595))

        good = all([ok1, ok2, ok3, ok4])
        print("\n" + ("✅ ตัวตรวจแยกของจริงกับของปลอมได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① พิมพ์เองแล้วได้ชั้นข้อความจริง ไม่ใช่ภาพ")
        p1 = make(pg, text=TONE, numbers="off", out="tone.pdf")
        t1 = text_of(p1)
        ck("ต้องอ่านข้อความจากไฟล์ได้ (คัดลอก/ค้นหาได้)", len(t1.strip()) > 0, True,
           f"อ่านได้ {len(t1.strip())} ตัวอักษร, ถ้าเป็นศูนย์แปลว่าไปวาดเป็นภาพ")

        print("\n── ② วรรณยุกต์ไทยต้องไม่หาย")
        for w in ["ที่นี่", "ค่ำ", "พี่ชาย", "เสื้อ", "หนึ่ง", "ผึ้ง"]:
            ck(f"ต้องค้นคำว่า {w} ในไฟล์เจอ", findable(p1, [w]), [w],
               f"ข้อความที่อ่านได้จริง: {t1.strip()[:80]!r}")

        print("\n── ③ ตัดบรรทัดต้องไม่ฉีกคำไทย")
        p2 = make(pg, text=PARA, numbers="off", out="wrap.pdf")
        got = findable(p2, LONG_WORDS)
        ck("ทุกคำยาวต้องยังค้นหาเจอหลังตัดบรรทัด", sorted(got), sorted(LONG_WORDS),
           "คำที่หายไปคือคำที่ถูกฉีกคนละบรรทัด")

        print("\n── ④ ข้อความยาวต้องขึ้นหน้าใหม่เอง")
        p3 = make(pg, text=(PARA + "\n") * 12, numbers="off", out="many.pdf")
        n3, _ = shape(p3)
        ck("ต้องได้มากกว่า 1 หน้า", n3 > 1, True, f"ได้ {n3} หน้า")

        print("\n── ⑤ เลขหน้า เปิดแล้วต้องมี ปิดแล้วต้องไม่มี")
        p4 = make(pg, text=(PARA + "\n") * 12, numbers="on", out="num.pdf")
        d = fitz.open(str(p4))
        last = d.page_count
        hit = bool(d[last - 1].search_for(str(last)))
        d.close()
        ck("เปิดเลขหน้า ต้องเจอเลขหน้าสุดท้ายบนหน้าสุดท้าย", hit, True, f"ไฟล์มี {last} หน้า")
        d = fitz.open(str(p3))
        tail = d[d.page_count - 1].get_text().strip().splitlines()
        d.close()
        ck("ปิดเลขหน้า ต้องไม่มีบรรทัดที่เป็นตัวเลขล้วนท้ายหน้า",
           bool(tail) and tail[-1].strip().isdigit(), False, f"บรรทัดท้าย {tail[-1:]!r}")

        print("\n── ⑥ ขนาดกระดาษต้องตรงกับที่เลือก")
        p5 = make(pg, text=TONE, paper="a5", numbers="off", out="a5.pdf")
        ck("เลือก A5 ต้องได้หน้าขนาด A5", shape(p5)[1], (420, 595))

        print("\n── ⑦ ลากไฟล์ .txt มาวางต้องรับจริง (บั๊กชนิดไฟล์ 21/09/2026)")
        f_txt = FIX / "บันทึกข้อความ.txt"
        f_txt.write_text("เรียน ผู้อำนวยการสำนักงาน\nเรื่อง ขออนุมัติค่าใช้จ่าย\n", encoding="utf-8")
        open_tool(pg)
        pg.locator(".dz input[type=file]").set_input_files(str(f_txt))
        pg.wait_for_timeout(2000)
        box = pg.evaluate("() => document.querySelector('.tp-ta').value")
        warn = pg.evaluate("() => document.querySelector('.dz')?.parentElement?.textContent || ''")
        ck("ไฟล์ .txt ต้องไม่ถูกปฏิเสธ", "ใช้กับเครื่องมือนี้ไม่ได้" in warn, False)
        ck("เนื้อไฟล์ต้องถูกเทลงช่องข้อความให้เลย", "ขออนุมัติค่าใช้จ่าย" in box, True,
           f"ในช่องตอนนี้ {box[:60]!r}")

        print("\n── ⑧ ไฟล์ไทยรหัสเก่า (windows-874) ต้องไม่กลายเป็นภาษาต่างดาว")
        f_874 = FIX / "เอกสารเก่า.txt"
        f_874.write_bytes("เรียน หัวหน้าฝ่ายบัญชี\n".encode("cp874"))
        p6 = make(pg, upload=f_874, numbers="off", out="old.pdf")
        ck("ต้องอ่านคำไทยจากไฟล์รหัสเก่าได้", findable(p6, ["หัวหน้าฝ่ายบัญชี"]), ["หัวหน้าฝ่ายบัญชี"],
           f"ข้อความที่ได้ {text_of(p6).strip()[:60]!r}")

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ได้ PDF ที่ค้นหาได้จริง วรรณยุกต์ครบ ไม่ฉีกคำ และรับไฟล์ .txt ได้")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
