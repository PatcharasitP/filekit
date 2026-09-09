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
