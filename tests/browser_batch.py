import sys, pathlib
from playwright.sync_api import sync_playwright
S = pathlib.Path("/tmp/claude-1000/-mnt-c-Users-USER-Desktop-Claude-Code/1a23ba41-65a0-437b-a9bd-bf64961a3d72/scratchpad/fx")
P,F=0,[]
def ck(n,g,w,contains=False):
    global P
    ok=(str(w) in str(g)) if contains else g==w
    if ok:P+=1
    else:F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":950})
    pg.goto("http://localhost:8899/#/image-convert", wait_until="networkidle")
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
