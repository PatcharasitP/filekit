"""เครื่องมือแปลงชนิดไฟล์รูป ต้องทำไฟล์ .ico ที่ใช้ได้จริง

‼️ ที่มา: รายการค้างบอกว่า "เราแปลงได้ 3 ฟอร์แมต Squoosh ได้ 10"
   วัดจริง 12/09/2026 บนเบราว์เซอร์จริง พบว่าเบราว์เซอร์ **เขียนได้แค่ 3 ฟอร์แมต**
   (PNG, JPEG, WEBP · Firefox ได้ BMP เพิ่ม) ส่วน AVIF/TIFF/GIF/HEIC/JXL เขียนไม่ได้เลย
   เว็บที่ได้ 10 ฟอร์แมตขนตัวเข้ารหัส WASM มาเป็นเมกะไบต์ ขัดกับหลักโหลดเท่าที่ใช้
   แต่ .ico เพิ่มได้ฟรี เพราะเป็นหัวไฟล์ 22 ไบต์ครอบ PNG ที่เบราว์เซอร์ทำให้อยู่แล้ว

เทสนี้ยืนยันปลายทางจริง ไม่ใช่แค่ว่ากดแล้วไม่ error
   ① เลือก ICO แล้วแถบคุณภาพต้องหาย เพราะ PNG ข้างในไม่มีการปรับคุณภาพ
   ② แปลงแล้วได้ไฟล์นามสกุล .ico จริง
   ③ ‼️ ไฟล์ที่ดาวน์โหลดมา ต้องมีครบ 4 ขนาดในไฟล์เดียว ตรวจจากไบต์จริง
   ④ ‼️ ไฟล์เล็กลงกว่าต้นฉบับ (ไอคอนไม่ควรใหญ่กว่ารูปเดิม)
   ⑤ ไม่มี error หลุด

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_ico.py
"""
import os, struct, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label)

def read_ico(path):
    """อ่านโครง .ico จากไบต์จริง ไม่พึ่งไลบรารีภายนอก"""
    b = open(path, "rb").read()
    reserved, kind, n = struct.unpack("<HHH", b[:6])
    out = {"reserved": reserved, "type": kind, "count": n, "sizes": [], "png": [], "total": len(b)}
    for i in range(n):
        e = b[6 + i * 16: 6 + (i + 1) * 16]
        w, h, colors, res, planes, bits, nbytes, off = struct.unpack("<BBBBHHII", e)
        out["sizes"].append(w if w else 256)
        out["png"].append(b[off:off + 8] == b"\x89PNG\r\n\x1a\n")
    return out

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(accept_downloads=True)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE + "/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.wait_for_timeout(600)

    print("\n① เลือกชนิด ICO")
    sel = pg.locator(".panel select").first
    opts = sel.locator("option").all_inner_texts()
    ck(f"มีตัวเลือก ICO ในรายการ ({opts})", any("ICO" in o for o in opts), opts)
    sel.select_option("ico")
    pg.wait_for_timeout(400)
    ck("แถบปรับคุณภาพถูกซ่อน เพราะ PNG ข้างในไม่มีการปรับคุณภาพ",
       pg.locator(".field", has_text="คุณภาพไฟล์").is_hidden())
    note = pg.locator(".th-iconote").inner_text()
    ck(f"บอกล่วงหน้าว่าไฟล์เดียวมีกี่ขนาด ({note})", "16" in note and "64" in note, note)

    print("\n② แปลงจริง")
    pg.locator("button", has_text="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(2500)
    pg.locator("button", has_text="แปลงไฟล์").click()
    pg.wait_for_timeout(6000)
    rows = pg.locator(".result")
    ck(f"ได้ผลลัพธ์ออกมา ({rows.count()} ไฟล์)", rows.count() >= 1, rows.count())
    names = [rows.nth(i).inner_text() for i in range(rows.count())]
    ck("ทุกไฟล์นามสกุล .ico", all(".ico" in n for n in names), names)

    print("\n③ ไฟล์ที่ได้ต้องใช้ได้จริง ตรวจจากไบต์")
    out = os.path.join(tempfile.gettempdir(), "fk_probe.ico")
    with pg.expect_download() as d:
        pg.locator(".result button", has_text="ดาวน์โหลด").first.click()
    d.value.save_as(out)
    ico = read_ico(out)
    ck(f"ประเภทเป็นไอคอน ไม่ใช่เคอร์เซอร์ (type={ico['type']})", ico["type"] == 1 and ico["reserved"] == 0, ico)
    ck(f"มีครบ 4 ขนาดในไฟล์เดียว {ico['sizes']}", ico["sizes"] == [16, 32, 48, 64], ico["sizes"])
    ck("ทุกตำแหน่งที่หัวไฟล์ชี้ไว้ เจอ PNG จริง", all(ico["png"]), ico["png"])
    ck(f"ไฟล์มีเนื้อจริง ไม่ใช่หัวเปล่า ({ico['total']} ไบต์)", ico["total"] > 500, ico["total"])

    print("\n④ ขนาดไฟล์")
    src = os.path.getsize("samples/ตัวอย่าง-รูปภาพ-1.jpg") if os.path.exists("samples/ตัวอย่าง-รูปภาพ-1.jpg") else None
    if src:
        ck(f"ไอคอนเล็กกว่ารูปต้นฉบับ ({ico['total']} เทียบ {src} ไบต์)", ico["total"] < src, (ico["total"], src))
    os.remove(out)

    print("\n⑤ ไม่มี error")
    ck("ไม่มี error หลุดออกมาเลย", not errs, errs)
    br.close()

print(f"\nตก {len(fails)} ข้อ")
if fails:
    sys.exit(1)
print("✅ ผ่านหมด")
