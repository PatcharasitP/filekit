import sys, pathlib, os
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui          # ตัวช่วยกลางที่รู้จักโครงหน้า v2
BASE = os.environ.get("FK_BASE","http://localhost:8899")
# ‼️ สร้างรูป 30 ใบเองทุกครั้ง (เดิมผูกกับ path ของ session เก่า พอหายก็รันไม่ได้)
import tempfile, shutil, atexit
from PIL import Image
D = pathlib.Path(tempfile.mkdtemp(prefix="fk_cancel_"))
atexit.register(lambda: shutil.rmtree(D, ignore_errors=True))
for i in range(30):
    # ภาพใหญ่พอให้การเข้ารหัส PNG กินเวลา ปุ่มหยุดจะได้โผล่ทันให้กด
    Image.new("RGB", (900, 700), (i * 8 % 256, 90, 160)).save(D / f"รูป{i:02d}.png")
P,F=0,[]
def ck(n,g,w,contains=False):
    global P
    ok=(str(w) in str(g)) if contains else g==w
    if ok:P+=1
    else:F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":950})
    pg.goto(BASE+"/#/image-convert", wait_until="networkidle"); pg.wait_for_selector(".dz")
    files=[str(f) for f in sorted(D.glob("*.png"))]
    pg.locator("input[type=file]").set_input_files(files); pg.wait_for_timeout(900)
    ck("โหลดครบ 30 ไฟล์", pg.locator(".file-row").count(), 30)
    ck("ยังไม่เริ่มงาน → ไม่มีปุ่มหยุด", pg.locator(".btn-cancel:visible").count(), 0)
    # ‼️ ตั้งเป็น PNG ก่อน เพราะการเข้ารหัส PNG ช้ากว่า JPG มาก
    #    ตั้งแต่ทำงานขนานหลายไฟล์พร้อมกัน (09/09/2026) งาน JPG 30 ไฟล์จบเร็วกว่า 700 มิลลิวินาที
    #    ปุ่มหยุดจึงหายไปก่อนที่เทสจะกดทัน = เทสตกทั้งที่การยกเลิกยังทำงานถูกต้อง
    # ‼️ ต้องชี้ดรอปดาวน์ด้วยค่าที่ต้องการ ไม่ใช่ "select ตัวไหนก็ได้"
    #    เพราะ <select class="sort-sel"> ของหน้าแรกยังค้างใน DOM หลังสลับมาหน้าเครื่องมือ
    #    คำสั่งเดิมจึงไปตกที่ดรอปดาวน์เรียงลำดับของหน้าแรกแล้วค้างจนหมดเวลา (แดงมาตั้งแต่ 13/09)
    pg.locator("select").filter(has=pg.locator('option[value="png"]')).first.select_option("png")
    pg.locator("button.btn:visible", has_text="แปลง").first.click()
    pg.wait_for_selector(".btn-cancel:visible", timeout=5000)
    ck("เริ่มงานแล้ว → ปุ่มหยุดโผล่", pg.locator(".btn-cancel:visible").count(), 1)
    # ‼️ ห้ามใช้ .click() ตรงนี้ Playwright จะรอจนงานหนักเสร็จก่อนค่อยกด = ทดสอบผิดเคสเงียบ ๆ
    pg.evaluate("() => document.querySelector('.btn-cancel')?.click()")
    pg.wait_for_timeout(3000)
    done = pg.locator(".result").count()
    ck(f"หยุดกลางคัน → ได้ผลบางส่วน ({done} ไฟล์) ไม่ใช่ศูนย์และไม่ใช่ครบ 30", 0 < done < 30, True)
    ck("บอกว่าหยุดตามที่สั่ง", pg.locator(".fail-box").inner_text(), "หยุดตามที่สั่ง", contains=True)
    ck("ปุ่มหยุดหายไปหลังจบ", pg.locator(".btn-cancel:visible").count(), 0)
    # กดใหม่ต้องเริ่มได้ปกติ ไม่ติดธงยกเลิกค้าง
    # ‼️ หยุดกลางคันแล้วได้ผลบางส่วน = หน้าเข้าสถานะผลลัพธ์ แผงขวากลายเป็นแผงผลลัพธ์
    #    ปุ่มลงมือทำจึงหายไปจากจอ ผู้ใช้จริงต้องกด "เริ่มใหม่" หรือ "กลับไปแก้" ก่อน
    #    ที่นี่ใช้ "เริ่มใหม่" แล้วใส่ไฟล์ชุดเดิมกลับเข้าไป เพราะเป็นรอบที่สะอาดจริง
    #    นับผลลัพธ์ได้ตรงไปตรงมาว่า 30 ใบ ไม่ปนกับ 7 ใบของรอบที่ถูกหยุด
    #    (เดิมเทสไปงัดปุ่มที่ถูกแผงผลลัพธ์บังอยู่ แล้วค้างจนหมดเวลา)
    restart = pg.locator("button:visible, a:visible").filter(has_text="เริ่มใหม่")
    if restart.count(): restart.first.click(); pg.wait_for_timeout(800)
    pg.locator("input[type=file]").first.set_input_files(files); pg.wait_for_timeout(1200)
    pg.locator("select").filter(has=pg.locator('option[value="png"]')).first.select_option("png")
    pg.locator("button.btn:visible", has_text="แปลง").first.click()
    pg.wait_for_timeout(14000)
    ck("กดแปลงใหม่ → ทำครบ 30 ไฟล์ (ธงยกเลิกไม่ค้าง)",
       pg.locator(".s2-side-res .result, .results .result").count(), 30)
    b.close()
print(f"\nผ่าน {P} · ตก {len(F)}")
for i,x in enumerate(F,1): print(f"  {i}. {x}")
sys.exit(1 if F else 0)
