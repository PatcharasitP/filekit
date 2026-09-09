import sys, pathlib
from playwright.sync_api import sync_playwright
import os
# รับ FK_BASE เหมือนไฟล์เทสอื่น เพื่อยิงใส่เว็บจริง/พอร์ตอื่นได้
BASE = os.environ.get("FK_BASE", "http://localhost:8899")

# ‼️ สร้างไฟล์ทดสอบเองทุกครั้ง ไม่ผูกกับโฟลเดอร์ชั่วคราวของเครื่องใครเครื่องหนึ่ง
#    (เดิมชี้ path ของ session เก่าแบบตายตัว พอ session เปลี่ยนก็รันไม่ได้เลยทั้งไฟล์)
import tempfile, shutil, atexit
from PIL import Image
S = pathlib.Path(tempfile.mkdtemp(prefix="fk_batch_"))
atexit.register(lambda: shutil.rmtree(S, ignore_errors=True))
Image.new("RGB", (320, 240), (200, 60, 60)).save(S / "รูปดี1.png")
Image.new("RGB", (280, 200), (60, 140, 200)).save(S / "รูปดี2.png")
# ไฟล์นามสกุล .png ที่เนื้อในไม่ใช่รูป — ต้องถูกข้ามโดยไม่ทำให้ทั้งชุดล้ม
(S / "รูปเสีย.png").write_bytes(b"\x89PNG\r\n\x1a\n" + "เนื้อในพัง ไม่ใช่รูปจริง".encode())
P,F=0,[]
def ck(n,g,w,contains=False):
    global P
    ok=(str(w) in str(g)) if contains else g==w
    if ok:P+=1
    else:F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":950})
    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator("input[type=file]").set_input_files(
        [str(S/"รูปดี1.png"), str(S/"รูปเสีย.png"), str(S/"รูปดี2.png")])
    pg.wait_for_timeout(600)
    pg.locator("button.btn", has_text="แปลง").first.click()
    pg.wait_for_timeout(2500)
    ck("ไฟล์ดี 2 ไฟล์ยังแปลงสำเร็จ (ไม่ล้มทั้งชุด)", pg.locator(".result").count(), 2)
    ck("บอกสถานะว่าข้ามไป 1 ไฟล์", pg.locator(".status").inner_text(), "ข้าม 1", contains=True)
    ck("มีกล่องบอกว่าไฟล์ไหนพังและเพราะอะไร", pg.locator(".fail-box").count(), 1)
    ck("ระบุชื่อไฟล์ที่พัง", pg.locator(".fail-box li").inner_text(), "รูปเสีย.png", contains=True)
    b.close()
print(f"\nผ่าน {P} · ตก {len(F)}")
for i,x in enumerate(F,1): print(f"  {i}. {x}")
sys.exit(1 if F else 0)
