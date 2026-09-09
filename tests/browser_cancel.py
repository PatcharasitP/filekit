import sys, pathlib, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("FK_BASE","http://localhost:8899")
D = pathlib.Path("/tmp/claude-1000/-mnt-c-Users-USER-Desktop-Claude-Code/1a23ba41-65a0-437b-a9bd-bf64961a3d72/scratchpad/fx/many")
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
    pg.select_option("select", "png")
    pg.locator("button.btn", has_text="แปลง").first.click()
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
    pg.locator("button.btn", has_text="แปลง").first.click()
    pg.wait_for_timeout(12000)
    ck("กดแปลงใหม่ → ทำครบ 30 ไฟล์ (ธงยกเลิกไม่ค้าง)", pg.locator(".result").count(), 30)
    b.close()
print(f"\nผ่าน {P} · ตก {len(F)}")
for i,x in enumerate(F,1): print(f"  {i}. {x}")
sys.exit(1 if F else 0)
