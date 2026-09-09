# ตัวดูรูปเต็มจอ (dialog.pv) — ปิดยังไงก็ต้องไม่พาผู้ใช้หลุดออกจากงานที่ทำค้างไว้
#
# ‼️ บั๊กจริงที่เทสนี้เกิดมาเพื่อกัน (พบ 09/09/2026):
#    กด Esc ตอนเปิดดูรูปเต็มจอ = กล่องปิด "และ" เด้งออกจากเครื่องมือกลับหน้าแรกพร้อมกัน
#    ไฟล์ที่เลือกไว้ทั้งหมดหายเกลี้ยง ต้องลากเข้ามาใหม่ (วัดจริง: แถวไฟล์เหลือ 0)
#    ต้นเหตุอยู่ที่ src/app.js ตัวรับ keydown ระดับ document ไม่ใช่ที่ src/preview.js
#    (อาการโผล่ที่กล่องรูป แต่ต้นเหตุอยู่คนละไฟล์ — ห้ามแก้ตรงที่อาการโผล่)
#
# รัน: python3 -m http.server 8921 &  แล้ว  ../.venv/bin/python tests/browser_viewer.py
import os, sys, pathlib, tempfile, shutil
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8921")
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_viewer_"))

P, F = 0, []
def ck(name, got, want):
    global P
    if got == want: P += 1
    else: F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if got == want else '❌'} {name}")

def active(pg):
    return pg.evaluate("() => (document.activeElement||{}).className || '(ไม่มี)'")

def make_docs():
    """สร้าง .xlsx (มีชีทซ่อน) และ .docx ไว้ทดสอบการเปิดดูเนื้อไฟล์"""
    import openpyxl, docx
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "ข้อมูล"
    ws.append(["ชื่อคอลัมน์แรก", "คอลัมน์สอง"])
    ws.append(["ค่าทดสอบหนึ่ง", "0812345678"])          # เลขศูนย์นำหน้าต้องไม่หาย
    hid = wb.create_sheet("ชีทที่ซ่อนไว้"); hid.append(["ข้อมูลลับ-ห้ามโผล่", 1]); hid.sheet_state = "hidden"
    wb.save(TMP / "ตารางทดสอบ.xlsx")
    d = docx.Document(); d.add_heading("หัวข้อในไฟล์เวิร์ด", level=1)
    d.add_paragraph("ย่อหน้าทดสอบการเปิดดูเนื้อไฟล์")
    t = d.add_table(rows=1, cols=2); t.cell(0,0).text = "ช่องซ้ายในตาราง"; t.cell(0,1).text = "ช่องขวา"
    d.save(TMP / "เอกสารทดสอบ.docx")
    return str(TMP / "ตารางทดสอบ.xlsx"), str(TMP / "เอกสารทดสอบ.docx")


def make_images():
    for i, color in enumerate([(200, 60, 60), (60, 120, 200)], 1):
        Image.new("RGB", (400, 300), color).save(TMP / f"รูปทดสอบ{i}.png")
    return [str(TMP / f"รูปทดสอบ{i}.png") for i in (1, 2)]

def main():
    files = make_images()
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ‼️ reduced_motion="no-preference" บังคับไว้เสมอ — ค่าปริยายของ Playwright คือ "reduce"
        #    ซึ่งข้ามเส้นทางแอนิเมชันที่ผู้ใช้จริง 99% เจอ (เคยทำให้เทสเขียวหลอกมาแล้ว)
        pg = b.new_page(viewport={"width": 1280, "height": 950}, reduced_motion="no-preference")
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator("input[type=file]").set_input_files(files)
        pg.wait_for_timeout(1200)
        ck("ใส่รูป 2 ใบแล้วมีภาพย่อกดดูได้ 2 อัน", pg.locator("button.thumb").count(), 2)

        print("\n── ปิดด้วย Esc ──")
        pg.locator("button.thumb").first.click()
        pg.wait_for_selector("dialog.pv[open]", timeout=5000)
        ck("กดภาพย่อแล้วกล่องดูรูปเปิดขึ้นจริง", pg.locator("dialog.pv[open]").count(), 1)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(500)
        ck("Esc ปิดกล่องดูรูป", pg.locator("dialog.pv[open]").count(), 0)
        ck("‼️ Esc แล้วยังอยู่ในเครื่องมือเดิม ไม่เด้งกลับหน้าแรก",
           pg.evaluate("() => document.body.classList.contains('tool')"), True)
        ck("‼️ Esc แล้วไฟล์ที่เลือกไว้ยังอยู่ครบ ไม่ถูกล้างทิ้ง", pg.locator(".file-row").count(), 2)
        ck("Esc แล้วโฟกัสกลับไปที่ภาพย่อที่กดเปิด (ไม่ตกไปที่ body)", active(pg), "thumb")

        print("\n── ปิดด้วยปุ่มกากบาท ──")
        pg.locator("button.thumb").nth(1).click()
        pg.wait_for_selector("dialog.pv[open]", timeout=5000)
        pg.locator("dialog.pv .pv-x").click()
        pg.wait_for_timeout(500)
        ck("ปุ่มกากบาทปิดกล่องได้", pg.locator("dialog.pv[open]").count(), 0)
        ck("ปุ่มกากบาทแล้วไฟล์ยังอยู่ครบ", pg.locator(".file-row").count(), 2)
        ck("ปุ่มกากบาทแล้วโฟกัสกลับไปที่ภาพย่อ", active(pg), "thumb")

        print("\n── Esc ตอนไม่มีกล่องเปิด ยังต้องพากลับหน้าแรกเหมือนเดิม ──")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(600)
        ck("Esc บนหน้าเครื่องมือ (ไม่มีกล่องเปิด) พากลับหน้าแรก",
           pg.evaluate("() => document.body.classList.contains('tool')"), False)

        # ── เปิดดูเนื้อไฟล์ Excel และ Word จากแถวไฟล์ (พี่ปอนด์ขอเอง 09/09/2026) ──
        # ‼️ เดิมกดดูได้แค่รูปกับ PDF ส่วน Excel/Word กดแล้วเงียบสนิท
        xlsx_path, docx_path = make_docs()

        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/excel-csv", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator("input[type=file]").set_input_files([xlsx_path])
        pg.wait_for_timeout(600)
        ck("แถวไฟล์ Excel กดดูได้", pg.locator(".file-row .f-open").count(), 1)
        pg.locator(".file-row .f-open").first.click()
        pg.wait_for_selector(".pv-sheet", timeout=15000)
        sheet_text = pg.locator(".pv-doc").inner_text()
        ck("เห็นหัวคอลัมน์จริงในตาราง", "ชื่อคอลัมน์แรก" in sheet_text, True)
        ck("เลขศูนย์นำหน้าไม่หายในตัวดูไฟล์", "0812345678" in sheet_text, True)
        # ชีทที่ผู้ใช้ซ่อนไว้ต้องไม่โผล่ในตัวดูไฟล์เหมือนกัน (กฎเดียวกับเครื่องมือแปลงไฟล์)
        ck("ชีทที่ซ่อนไว้ไม่โผล่ในตัวดูไฟล์", "ข้อมูลลับ-ห้ามโผล่" in sheet_text, False)
        # ‼️ ตัวหนังสือต้องอ่านออกจริง เคยพลาดมาแล้ว: กล่องพื้นขาวแต่ตัวอักษรรับสีอ่อนจากฉากมืด
        colors = pg.evaluate("""() => { const td = document.querySelector('.pv-sheet td');
            return { fg: getComputedStyle(td).color,
                     bg: getComputedStyle(document.querySelector('.pv-doc')).backgroundColor }; }""")
        def lum(rgb):
            v = [int(x) / 255 for x in rgb[rgb.index("(") + 1:rgb.index(")")].split(",")[:3]]
            v = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in v]
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
        l1, l2 = sorted([lum(colors["fg"]), lum(colors["bg"])], reverse=True)
        ratio = (l1 + 0.05) / (l2 + 0.05)
        ck(f"ตัวอักษรในตารางอ่านออกจริง คอนทราสต์ {ratio:.1f}:1 (ต้อง >= 4.5)", ratio >= 4.5, True)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)
        ck("ปิดแผงแล้วไฟล์ยังอยู่ครบ", pg.locator(".file-row").count(), 1)

        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/word-to-pdf", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator("input[type=file]").set_input_files([docx_path])
        pg.wait_for_timeout(600)
        pg.locator(".file-row .f-open").first.click()
        pg.wait_for_selector(".pv-doc", timeout=15000)
        doc_text = pg.locator(".pv-doc").inner_text()
        ck("เห็นหัวข้อในไฟล์ Word", "หัวข้อในไฟล์เวิร์ด" in doc_text, True)
        ck("เห็นย่อหน้าในไฟล์ Word", "ย่อหน้าทดสอบการเปิดดูเนื้อไฟล์" in doc_text, True)
        ck("เห็นเนื้อในตารางของไฟล์ Word", "ช่องซ้ายในตาราง" in doc_text, True)

        ck("ไม่มี page error ตลอดทั้งชุด", errs, [])
        b.close()

if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(f"\nผ่าน {P}, ตก {len(F)}")
    for i, x in enumerate(F, 1): print(f"  {i}. {x}")
    sys.exit(1 if F else 0)
