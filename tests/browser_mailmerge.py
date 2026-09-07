import sys, pathlib
from playwright.sync_api import sync_playwright
S = pathlib.Path("/mnt/c/Users/USER/Desktop/Claude Code/FileKit/samples")
P,F = 0,[]
def ck(n,g,w):
    global P
    if g==w: P+=1
    else: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if g==w else '❌'} {n}")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":950})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8899/#/word-mailmerge", wait_until="networkidle")
    pg.wait_for_selector(".mm-step")
    ck("ตอนเริ่ม ขั้นที่ 3 ล็อกอยู่", pg.locator('.mm-step').nth(2).get_attribute("data-locked"), "1")
    ck("ตอนเริ่ม ขั้นที่ 4 ล็อกอยู่", pg.locator('.mm-step').nth(3).get_attribute("data-locked"), "1")
    ck("บอกว่ารออะไรอยู่", "รอไฟล์จากขั้นที่ 1" in pg.locator(".step-wait").first.inner_text(), True)
    pg.locator('input[type=file]').nth(0).set_input_files(str(S/"ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx")); pg.wait_for_timeout(900)
    pg.locator('input[type=file]').nth(1).set_input_files(str(S/"ตัวอย่าง-ข้อมูลพนักงาน.xlsx")); pg.wait_for_timeout(1500)
    ck("ใส่ครบ 2 ไฟล์ → ขั้นที่ 3 ปลดล็อก", pg.locator('.mm-step').nth(2).get_attribute("data-locked"), "0")
    ck("ใส่ครบ 2 ไฟล์ → ขั้นที่ 4 ปลดล็อก", pg.locator('.mm-step').nth(3).get_attribute("data-locked"), "0")
    ck("ข้อความ 'รอ...' ถูกซ่อนไปแล้ว", pg.locator(".step-wait:visible").count(), 0)
    ck("ปุ่มสร้างกดได้แล้ว", pg.locator("button.btn", has_text="สร้างเอกสารทั้งชุด").is_disabled(), False)
    # ฟอร์มต้องเรียงตรงแนวกัน (ช่องกรอกทุกช่องอยู่ระดับเดียวกัน)
    # ‼️ ต้องนับเฉพาะช่องที่ "มองเห็นจริง" — ช่องที่ซ่อนอยู่คืน top=0 ทำให้อ่านผลผิดว่าเพี้ยน
    tops = pg.evaluate("""() => [...document.querySelectorAll('.mm-step .row .field')]
        .filter(f => f.offsetParent !== null)
        .map(f => f.querySelector('select,input'))
        .filter(Boolean)
        .map(e => Math.round(e.getBoundingClientRect().top))""")
    ck(f"ช่องกรอกในฟอร์มเรียงตรงแนวเดียวกัน {tops}", len(set(tops)) <= 1, True)
    ck("ไม่มี error", len([e for e in errs if 'favicon' not in e.lower()]), 0)
    b.close()
print(f"\nผ่าน {P} · ตก {len(F)}")
for i,x in enumerate(F,1): print(f"  {i}. {x}")
sys.exit(1 if F else 0)
