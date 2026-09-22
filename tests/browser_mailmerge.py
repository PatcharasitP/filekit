import sys, pathlib, re, zipfile
from playwright.sync_api import sync_playwright
import os
# รับ FK_BASE เหมือนไฟล์เทสอื่น เพื่อยิงใส่เว็บจริง/พอร์ตอื่นได้
BASE = os.environ.get("FK_BASE", "http://localhost:8899")

S = pathlib.Path("/mnt/c/Users/USER/Desktop/Claude Code/FileKit/samples")
P,F = 0,[]
def ck(n,g,w):
    global P
    if g==w: P+=1
    else: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if g==w else '❌'} {n}")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":950}, accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/word-mailmerge", wait_until="networkidle")
    pg.wait_for_selector(".mm-step")
    ck("ตอนเริ่ม ขั้นที่ 3 ล็อกอยู่", pg.locator('.mm-step').nth(2).get_attribute("data-locked"), "1")
    ck("ตอนเริ่ม ขั้นที่ 4 ล็อกอยู่", pg.locator('.mm-step').nth(3).get_attribute("data-locked"), "1")
    ck("บอกว่ารออะไรอยู่", "รอไฟล์จากขั้นที่ 1" in pg.locator(".step-wait").first.inner_text(), True)
    pg.locator('input[type=file]').nth(0).set_input_files(str(S/"ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx")); pg.wait_for_timeout(900)
    pg.locator('input[type=file]').nth(1).set_input_files(str(S/"ตัวอย่าง-ข้อมูลพนักงาน.xlsx")); pg.wait_for_timeout(1500)
    ck("ใส่ครบ 2 ไฟล์ → ขั้นที่ 3 ปลดล็อก", pg.locator('.mm-step').nth(2).get_attribute("data-locked"), "0")
    ck("ใส่ครบ 2 ไฟล์ → ขั้นที่ 4 ปลดล็อก", pg.locator('.mm-step').nth(3).get_attribute("data-locked"), "0")
    ck("ข้อความ 'รอ...' ถูกซ่อนไปแล้ว", pg.locator(".step-wait:visible").count(), 0)
    ck("ปุ่มสร้างกดได้แล้ว", pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").is_disabled(), False)
    # ฟอร์มต้องเรียงตรงแนวกัน (ช่องกรอกทุกช่องอยู่ระดับเดียวกัน)
    # ‼️ ต้องนับเฉพาะช่องที่ "มองเห็นจริง" — ช่องที่ซ่อนอยู่คืน top=0 ทำให้อ่านผลผิดว่าเพี้ยน
    tops = pg.evaluate("""() => [...document.querySelectorAll('.mm-step .row .field')]
        .filter(f => f.offsetParent !== null)
        .map(f => f.querySelector('select,input'))
        .filter(Boolean)
        .map(e => Math.round(e.getBoundingClientRect().top))""")
    ck(f"ช่องกรอกในฟอร์มเรียงตรงแนวเดียวกัน {tops}", len(set(tops)) <= 1, True)
    # ── รวมเป็นไฟล์ Word เดียว (พี่ปอนด์สั่งไว้ 18/09 ทำจริง 23/09/2026) ──
    # ‼️ ต้องเปิดไฟล์ที่ได้มาอ่านจริง ไม่ใช่เช็คแค่ว่าไฟล์ถูกดาวน์โหลด
    #    ของที่ต้องเห็น: ชื่อคนทุกคนจากไฟล์ Excel ครบ และมีตัวขึ้นหน้าใหม่คั่นเท่ากับจำนวนฉบับลบหนึ่ง
    pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").click()
    pg.wait_for_selector(".result", timeout=60000); pg.wait_for_timeout(800)
    made = pg.locator(".result").count()
    one = pg.locator("button.btn:visible", has_text="รวมเป็นไฟล์ Word เดียว")
    ck("มีปุ่มรวมเป็นไฟล์เดียวข้างปุ่ม ZIP", one.count(), 1)
    with pg.expect_download(timeout=120000) as dl:
        one.click()
    path = dl.value.path()
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    breaks = len(re.findall(r'<w:br[^>]*w:type="page"', xml))
    joined = "".join(re.findall(r"<w:t[^>]*>([^<]+)</w:t>", xml))
    ck(f"ขึ้นหน้าใหม่ทุกฉบับ ({made} ฉบับ = ตัวขึ้นหน้าใหม่ {breaks} ตัว)", breaks, made - 1)
    # ‼️ เทียบกับตัวจริง: โหลดแต่ละฉบับมาอ่านข้อความ แล้วดูว่าอยู่ในไฟล์รวมครบทุกฉบับ
    #    (เทียบด้วยชื่อไฟล์ไม่ได้ ชื่อตั้งตามลำดับ ไม่ใช่ชื่อคน)
    def text_of(path):
        with zipfile.ZipFile(path) as z:
            return "".join(re.findall(r"<w:t[^>]*>([^<]+)</w:t>", z.read("word/document.xml").decode("utf-8")))
    missing = []
    for i in range(made):
        with pg.expect_download(timeout=60000) as d1:
            pg.locator(".result").nth(i).locator("button.btn").first.click()
        t = text_of(d1.value.path())
        uniq = [w for w in t.split() if w and w not in ("", " ")]
        # เอาช่วงข้อความยาวสุดของฉบับนั้นไปหาในไฟล์รวม (ยาวพอจะไม่บังเอิญตรงกัน)
        probe = max(uniq, key=len) if uniq else ""
        if probe and probe not in joined: missing.append((i + 1, probe[:30]))
        if t and t[:120] not in joined: missing.append((i + 1, "ต้นฉบับ 120 ตัวแรกไม่อยู่ในไฟล์รวม"))
    ck(f"เนื้อของทุกฉบับอยู่ในไฟล์รวมครบ {made} ฉบับ", missing, [])
    ck("ไฟล์เดียวมีข้อความจากเอกสารจริง (ไม่ใช่ไฟล์เปล่า)", len(joined) > 200, True)
    ck("สถานะบอกว่ารวมกี่ฉบับ", "รวมเป็นไฟล์เดียวแล้ว" in pg.locator(".status, .st").first.inner_text(), True)
    ck("ไม่มี error", len([e for e in errs if 'favicon' not in e.lower()]), 0)
    b.close()
print(f"\nผ่าน {P} · ตก {len(F)}")
for i,x in enumerate(F,1): print(f"  {i}. {x}")
sys.exit(1 if F else 0)
