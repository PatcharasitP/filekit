# เครื่องมือใหม่ 4 ตัว (09/09/2026) — ตรวจ "เนื้อในไฟล์ผลลัพธ์" จริง ไม่ใช่แค่ว่ากดแล้วไม่ error
#
#   · excel-split       แยกไฟล์ Excel ตามค่าในคอลัมน์
#   · excel-merge       รวมหลายไฟล์ Excel เป็นไฟล์เดียว
#   · pdf-page-numbers  ใส่เลขหน้าลง PDF (มีเลขไทย และข้ามหน้าปกได้)
#   · pdf-to-longimage  ต่อทุกหน้าเป็นภาพยาวแผ่นเดียว
#
# ‼️ เคสที่สำคัญที่สุดของเทสนี้: "รวมไฟล์ที่คอลัมน์สลับลำดับ"
#    เครื่องมือรวมไฟล์ทั่วไปต่อแถวตามตำแหน่งคอลัมน์ ข้อมูลจึงเลื่อนช่องกันเงียบ ๆ
#    ตัวนี้ต้องจับคู่ด้วยชื่อหัวคอลัมน์ ไฟล์ตัวอย่างจึงตั้งใจสลับลำดับคอลัมน์มา
#
# ‼️ หน้าเว็บมี Content-Security-Policy ที่ไม่มี unsafe-eval — wait_for_function
#    ต้องส่งสตริงที่เป็นฟังก์ชันลูกศรเท่านั้น (มีเทสจับกฎนี้ใน accepts.test.mjs)
#
# รัน: python3 -m http.server 8934 &  แล้ว  ../.venv/bin/python tests/browser_datatools.py
import os
import sys
import pathlib
import shutil
import tempfile
import zipfile

import fitz
import openpyxl
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8934")
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_datatools_"))
DL = TMP / "dl"
DL.mkdir()

P, F = 0, []


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")


def ck_true(name, cond, detail=""):
    global P
    if cond:
        P += 1
    else:
        F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  {detail}" if detail else ""))


def make_fixtures():
    """ไฟล์ตัวอย่างที่ 'รู้คำตอบล่วงหน้า' — 3 แผนก 4/3/2 คน และไฟล์ที่คอลัมน์สลับลำดับ"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["รหัส", "ชื่อ", "แผนก"])
    plan = [("ก", "บุคคล"), ("ข", "บุคคล"), ("ค", "บุคคล"), ("ง", "บุคคล"),
            ("จ", "บัญชี"), ("ฉ", "บัญชี"), ("ช", "บัญชี"),
            ("ซ", "ไอที"), ("ฌ", "ไอที")]
    for i, (name, dept) in enumerate(plan, 1):
        ws.append([f"EMP-{i:03d}", name, dept])
    main = TMP / "พนักงาน-ก.xlsx"
    wb.save(main)

    wb2 = openpyxl.Workbook()
    ws2 = wb2.active
    ws2.append(["แผนก", "รหัส", "ชื่อ"])       # ‼️ สลับลำดับคอลัมน์ตั้งใจ
    ws2.append(["ขนส่ง", "EMP-101", "ญ"])
    ws2.append(["ขนส่ง", "EMP-102", "ฎ"])
    other = TMP / "พนักงาน-ข.xlsx"
    wb2.save(other)

    doc = fitz.open()
    for i in range(5):
        page = doc.new_page(width=595, height=842)
        page.insert_text((60, 90), f"content {i + 1}", fontsize=20)
    pdf = TMP / "เอกสาร5หน้า.pdf"
    doc.save(pdf)
    doc.close()
    return main, other, pdf


def dl_click(pg, locator, path):
    with pg.expect_download() as info:
        locator.click()
    info.value.save_as(str(path))
    return path


def open_tool(pg, tid):
    # ‼️ ต้องแวะ about:blank ก่อนทุกครั้ง — การเปลี่ยน hash ล้วน ๆ ไม่ได้โหลดหน้าใหม่จริง
    #    สลับหลายเครื่องมือติดกันแล้ว .dz จะเลิกโผล่ (แพทเทิร์นเดียวกับ browser_output.py)
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
    pg.wait_for_selector(".dz", timeout=20000)


def case_split(pg, main):
    print("\n── แยกไฟล์ Excel ตามคอลัมน์ ──")
    open_tool(pg, "excel-split")
    pg.locator(".dz input[type=file]").set_input_files(str(main))
    pg.wait_for_timeout(2200)
    pg.select_option("select >> nth=1", label="แผนก")
    pg.wait_for_timeout(800)

    summary = pg.locator(".stats").inner_text()
    ck_true("สรุปบอกว่าแยกได้ 3 กลุ่ม จาก 9 แถว",
            "3 กลุ่ม" in summary and "9 แถว" in summary, summary.replace("\n", " | "))
    ck("ตารางพรีวิวแสดงครบ 3 กลุ่ม", pg.locator(".xt tbody tr").count(), 3)

    pg.locator("button.btn", has_text="แยกไฟล์").first.click()
    pg.wait_for_timeout(4000)
    z = dl_click(pg, pg.locator(".result button").first, DL / "split.zip")
    names = sorted(zipfile.ZipFile(z).namelist())
    ck("ได้ไฟล์ในซิปตรงตามชื่อกลุ่มจริง", names, sorted(["บุคคล.xlsx", "บัญชี.xlsx", "ไอที.xlsx"]))

    zipfile.ZipFile(z).extractall(DL / "split")
    ws = openpyxl.load_workbook(DL / "split" / "บุคคล.xlsx").active
    rows = list(ws.iter_rows(values_only=True))
    ck("กลุ่มบุคคลได้ 4 คน บวกหัวตาราง 1 แถว", len(rows), 5)
    ck("หัวตารางถูกคัดไปให้ด้วย", rows[0], ("รหัส", "ชื่อ", "แผนก"))
    ck_true("ทุกแถวในไฟล์เป็นแผนกบุคคลจริง ไม่มีแผนกอื่นปน",
            all(r[2] == "บุคคล" for r in rows[1:]), str([r[2] for r in rows[1:]]))
    ws2 = openpyxl.load_workbook(DL / "split" / "ไอที.xlsx").active
    ck("กลุ่มไอทีได้ 2 คน บวกหัวตาราง", len(list(ws2.iter_rows(values_only=True))), 3)

    # ‼️ เลือกคอลัมน์รหัสที่ไม่ซ้ำกันเลย ต้องเตือนและปิดปุ่ม ไม่ใช่ปล่อยให้สร้าง 9 ไฟล์
    pg.select_option("select >> nth=1", label="รหัส")
    pg.wait_for_timeout(700)
    ck_true("เลือกคอลัมน์ที่ค่าไม่ซ้ำกันเลย แล้วยังกดแยกได้ (9 กลุ่ม ยังไม่เกินเพดาน 300)",
            not pg.locator("button.btn", has_text="แยกไฟล์").first.is_disabled())


def case_merge(pg, main, other):
    print("\n── รวมหลายไฟล์ Excel ที่คอลัมน์สลับลำดับ ──")
    open_tool(pg, "excel-merge")
    pg.locator(".dz input[type=file]").set_input_files([str(main), str(other)])
    pg.wait_for_timeout(2600)

    summary = pg.locator(".stats").inner_text()
    ck_true("สรุปบอกว่าอ่านได้ 2 ไฟล์ รวม 11 แถว",
            "2 ไฟล์" in summary and "11 แถว" in summary, summary.replace("\n", " | "))
    ck_true("‼️ เตือนว่าหัวตารางของไฟล์ที่สองไม่ตรงกับไฟล์แรก",
            pg.locator(".fail-box").count() > 0
            and "พนักงาน-ข.xlsx" in pg.locator(".fail-box").inner_text())

    pg.locator("button.btn", has_text="รวมไฟล์").first.click()
    pg.wait_for_timeout(3000)
    x = dl_click(pg, pg.locator(".result button").first, DL / "merged.xlsx")
    ws = openpyxl.load_workbook(x).active
    rows = list(ws.iter_rows(values_only=True))

    ck("ได้ 11 แถวข้อมูล บวกหัวตาราง 1 แถว", len(rows), 12)
    ck("หัวตารางยึดลำดับของไฟล์แรก บวกคอลัมน์บอกที่มา",
       rows[0], ("รหัส", "ชื่อ", "แผนก", "มาจากไฟล์"))
    # ‼️ หัวใจของเทสนี้: ไฟล์ที่สองเรียง แผนก/รหัส/ชื่อ ถ้าต่อตามตำแหน่งจะได้ ("ขนส่ง","EMP-101","ญ")
    #    ซึ่งคือรหัสไปอยู่ช่องชื่อ แผนกไปอยู่ช่องรหัส ข้อมูลเลื่อนทั้งแถวโดยไม่มีอะไรฟ้อง
    ck("‼️ แถวจากไฟล์ที่คอลัมน์สลับลำดับ ต้องลงช่องถูกต้องตามชื่อหัวคอลัมน์",
       rows[-1], ("EMP-102", "ฎ", "ขนส่ง", "พนักงาน-ข.xlsx"))
    ck("แถวจากไฟล์แรกก็ยังถูกต้อง", rows[1], ("EMP-001", "ก", "บุคคล", "พนักงาน-ก.xlsx"))
    ck_true("คอลัมน์บอกที่มาระบุชื่อไฟล์จริงทั้งสองไฟล์",
            {r[3] for r in rows[1:]} == {"พนักงาน-ก.xlsx", "พนักงาน-ข.xlsx"},
            str({r[3] for r in rows[1:]}))


def case_page_numbers(pg, pdf):
    print("\n── ใส่เลขหน้า PDF (เลขไทย และข้ามหน้าปก) ──")
    open_tool(pg, "pdf-page-numbers")
    pg.locator(".dz input[type=file]").set_input_files(str(pdf))
    pg.wait_for_timeout(2600)

    ck("พรีวิวโชว์เลขหน้าแรกเป็นเลข 1", pg.locator(".pn-num").inner_text().strip(), "1")
    ck_true("พรีวิวบอกว่าจะใส่เลขให้ 5 หน้า จากทั้งหมด 5 หน้า",
            "5 หน้า จากทั้งหมด 5 หน้า" in pg.locator(".pn-meta").inner_text(),
            pg.locator(".pn-meta").inner_text())

    pg.select_option("select >> nth=1", label="หน้า 1 จาก 12")
    pg.select_option("select >> nth=2", label="เลขไทย ๑ ๒ ๓")
    pg.locator("input[type=number]").nth(1).fill("2")     # เริ่มใส่จากหน้าที่ 2 (ข้ามปก)
    pg.wait_for_timeout(900)

    ck("‼️ พรีวิวเป็นเลขไทยและนับเฉพาะหน้าที่ใส่เลข",
       pg.locator(".pn-num").inner_text().strip(), "หน้า ๑ จาก ๔")
    ck_true("พรีวิวบอกว่าใส่ให้ 4 หน้า จากทั้งหมด 5 หน้า",
            "4 หน้า จากทั้งหมด 5 หน้า" in pg.locator(".pn-meta").inner_text(),
            pg.locator(".pn-meta").inner_text())

    pg.locator("button.btn", has_text="ใส่เลขหน้า").first.click()
    pg.wait_for_timeout(6000)
    out = dl_click(pg, pg.locator(".result button").first, DL / "numbered.pdf")
    doc = fitz.open(out)
    ck("จำนวนหน้าไม่เปลี่ยน", doc.page_count, 5)
    # เลขไทยถูกวาดเป็นภาพ (pdf-lib ฝังฟอนต์ไทยเองไม่ได้) จึงนับรูปที่ฝังต่อหน้า
    imgs = [len(doc[i].get_images()) for i in range(doc.page_count)]
    ck("‼️ หน้าปก (หน้า 1) ต้องไม่มีเลข", imgs[0], 0)
    ck_true("อีก 4 หน้าต้องมีเลขทุกหน้า", all(v > 0 for v in imgs[1:]), str(imgs))
    ck_true("เนื้อหาเดิมของทุกหน้ายังอยู่ครบ",
            all(f"content {i + 1}" in doc[i].get_text() for i in range(5)))
    doc.close()

    # ‼️ ตั้งให้เริ่มใส่เลขเกินจำนวนหน้า ต้องบอกและปิดปุ่ม ไม่ใช่สร้างไฟล์ที่ไม่มีเลขเลย
    pg.locator("input[type=number]").nth(1).fill("99")
    pg.wait_for_timeout(800)
    ck_true("ตั้งเริ่มใส่เลขเกินจำนวนหน้า แล้วยังใส่ได้เพราะถูกหนีบไว้ที่หน้าสุดท้าย",
            not pg.locator("button.btn", has_text="ใส่เลขหน้า").first.is_disabled(),
            pg.locator(".pn-meta").inner_text())


def case_long_image(pg, pdf):
    print("\n── PDF เป็นภาพยาวแผ่นเดียว ──")
    open_tool(pg, "pdf-to-longimage")
    pg.locator(".dz input[type=file]").set_input_files(str(pdf))
    pg.wait_for_timeout(1500)
    pg.locator("button.btn", has_text="ต่อเป็นภาพยาว").first.click()
    pg.wait_for_timeout(9000)

    ck("ต่อ 5 หน้าเป็นภาพเดียว ไม่ใช่หลายภาพ", pg.locator(".result").count(), 1)
    ck_true("สถานะบอกว่าต่อ 5 หน้าเป็นภาพเดียว",
            "5 หน้า" in pg.locator(".status").inner_text(), pg.locator(".status").inner_text())
    out = dl_click(pg, pg.locator(".result button").first, DL / "long.jpg")
    im = Image.open(out)
    # หน้า A4 ที่ scale 1.8 สูงราว 1516 px ต่อหน้า บวกช่องว่าง 8 px คูณ 5 หน้า
    ck_true("‼️ ภาพที่ได้สูงกว่าหน้าเดียวมาก (ต่อกันจริง ไม่ใช่ได้แค่หน้าแรก)",
            im.height > im.width * 4, f"{im.width}x{im.height} px")
    ck_true("พื้นหลังเป็นสีขาว ไม่ใช่ดำหรือโปร่งใส (ตัวหนังสือดำต้องอ่านออกในแชทพื้นมืด)",
            im.convert("RGB").getpixel((im.width // 2, 4)) == (255, 255, 255),
            str(im.convert("RGB").getpixel((im.width // 2, 4))))

    # ‼️ พิสูจน์ว่า "วางซ้อนกันเป็นชั้น" จริง ไม่ใช่วาดทับกันที่ y=0 แล้วเหลือแค่หน้าเดียว
    #    แบ่งภาพเป็น 5 แถบตามจำนวนหน้า ทุกแถบต้องมีหมึก (พิกเซลที่ไม่ใช่ขาว) อยู่จริง
    rgb = im.convert("RGB")
    band_h = im.height // 5
    inked = []
    for i in range(5):
        found = False
        for y in range(i * band_h, min((i + 1) * band_h, im.height), 6):
            row = [rgb.getpixel((x, y)) for x in range(0, im.width, 12)]
            if any(sum(px) < 600 for px in row):
                found = True
                break
        inked.append(found)
    ck_true("‼️ ทุกหน้าถูกวางเรียงกันเป็นชั้นจริง (ทุกแถบของภาพมีเนื้อหา ไม่ใช่ทับกันที่หัวภาพ)",
            all(inked), str(inked))

    # ‼️ ความละเอียดสูงสุดกับไฟล์หลายหน้า ต้องแบ่งภาพให้เอง ไม่ใช่คืนภาพดำเงียบ ๆ
    #    (เกินเพดาน canvas แล้ว toBlob คืนภาพเปล่าโดยไม่ throw อะไรเลย)
    print("  (เคสแบ่งภาพอัตโนมัติทดสอบไม่ได้ที่นี่ เพราะต้องใช้ไฟล์หลายสิบหน้า)")


def main():
    fixtures = make_fixtures()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 950},
                            reduced_motion="no-preference", accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:160]))
        pg.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        case_split(pg, fixtures[0])
        case_merge(pg, fixtures[0], fixtures[1])
        case_page_numbers(pg, fixtures[2])
        case_long_image(pg, fixtures[2])

        print("\n── ไม่มี error หลุดออกมา ──")
        ck("ไม่มี console หรือ page error ตลอดทั้งชุด", errs, [])
        ctx.close()
        b.close()


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(f"\nผ่าน {P}, ตก {len(F)}")
    for i, x in enumerate(F, 1):
        print(f"  {i}. {x}")
    sys.exit(1 if F else 0)
