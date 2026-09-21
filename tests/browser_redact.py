# ตรวจเครื่องมือ "ลบข้อมูลลับออกจาก PDF" ด้วยคำถามเดียวที่สำคัญ: **คำลับหายจากไฟล์จริงไหม**
#
# ‼️ ตัวจำลองบั๊กของเทสนี้คือ "วาดสี่เหลี่ยมทับเฉย ๆ" ซึ่งดูเหมือนทำงานถูกทุกประการบนจอ
#    แต่ลากคัดลอกยังได้ข้อความเดิม · เทสจึงต้องค้นทั้ง 2 ชั้น
#      ① ชั้นข้อความที่โปรแกรมอ่าน PDF เห็น (get_text)
#      ② ไบต์ดิบทั้งไฟล์ รวม stream ที่ถูกคลายแล้ว (กันกรณีข้อความซ่อนอยู่แต่ get_text ไม่คืนมา)
#    รัน --selftest เพื่อพิสูจน์ว่าตัวตรวจจับ "ของปลอม" ได้จริงก่อนเชื่อผลมัน

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_redact_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

SECRET = "TOPSECRET-1234567890"     # คำที่ต้องหายไป
KEEP = "PUBLIC-LINE-STAYS"          # คำในหน้าที่ไม่ได้แตะ ต้องยังอยู่และยังค้นได้

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make_pdf(path):
    """หน้า 1 มีคำลับ · หน้า 2 ไม่มี ใช้ตรวจว่าเครื่องมือไม่ไปยุ่งหน้าที่ไม่ได้แตะ"""
    d = fitz.open()
    p1 = d.new_page(width=400, height=600)
    p1.insert_text((40, 120), SECRET, fontname="helv", fontsize=18)
    p1.insert_text((40, 300), "other text on page one", fontname="helv", fontsize=12)
    p2 = d.new_page(width=400, height=600)
    p2.insert_text((40, 120), KEEP, fontname="helv", fontsize=16)
    d.save(str(path)); d.close()
    return path


def find_secret(path, word=SECRET):
    """คืน dict ว่าเจอคำนั้นที่ชั้นไหนบ้าง"""
    d = fitz.open(str(path))
    in_text = any(word in d[i].get_text() for i in range(d.page_count))
    pages = d.page_count
    keep_ok = any(KEEP in d[i].get_text() for i in range(d.page_count))
    d.close()
    raw = pathlib.Path(path).read_bytes()
    in_raw = word.encode() in raw
    # ‼️ ต้องคลาย stream ด้วย ไม่งั้นข้อความที่ถูกบีบอยู่จะไม่โผล่ในไบต์ดิบ
    d2 = fitz.open(str(path))
    flat = d2.tobytes(expand=255, garbage=0, deflate=False)
    d2.close()
    in_flat = word.encode() in flat
    return {"in_text": in_text, "in_raw": in_raw, "in_flat": in_flat,
            "pages": pages, "keep_searchable": keep_ok}


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, timeout=30000):
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=8000)
    except Exception:
        loc = pg.locator(".s2-res-list .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def drag_box(pg, x0, y0, x1, y1):
    """ลากคลุมบนชั้นวางกล่อง โดยคิดพิกัดเป็นสัดส่วนของหน้า"""
    box = pg.locator(".rd-layer").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * x0, box["y"] + box["height"] * y0)
    pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * (x0 + x1) / 2, box["y"] + box["height"] * (y0 + y1) / 2, steps=4)
    pg.mouse.move(box["x"] + box["width"] * x1, box["y"] + box["height"] * y1, steps=4)
    pg.mouse.up()
    pg.wait_for_timeout(300)


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    src = make_pdf(FIX / "secret.pdf")

    if SELFTEST:
        # ‼️ พิสูจน์ตัวตรวจ: ป้อน "ของปลอม" คือวาดสี่เหลี่ยมทับเฉย ๆ แล้วต้องจับได้ว่าคำยังอยู่
        print("ตรวจตัวตรวจเอง")
        a = find_secret(src)
        ok1 = ck("ไฟล์ต้นฉบับ ต้องเจอคำลับในชั้นข้อความ", a["in_text"], True)

        fake = FIX / "fake-redacted.pdf"
        d = fitz.open(str(src))
        d[0].draw_rect(fitz.Rect(30, 100, 370, 140), color=(0, 0, 0), fill=(0, 0, 0))
        d.save(str(fake)); d.close()
        b = find_secret(fake)
        ok2 = ck("ของปลอม (วาดสี่เหลี่ยมทับ) ต้องยังเจอคำลับ ตัวตรวจถึงจะเชื่อถือได้", b["in_text"], True,
                 "ถ้าไม่เจอ แปลว่าตัวตรวจอ่อนเกินไป จะปล่อยของเสียผ่าน")

        real = FIX / "real-redacted.pdf"
        d = fitz.open(str(src))
        out = fitz.open()
        pix = d[0].get_pixmap(dpi=150)
        pg0 = out.new_page(width=d[0].rect.width, height=d[0].rect.height)
        pg0.insert_image(pg0.rect, pixmap=pix)
        out.insert_pdf(d, from_page=1, to_page=1)
        out.save(str(real)); out.close(); d.close()
        c = find_secret(real)
        ok3 = ck("ของจริง (แปลงหน้าเป็นภาพ) ต้องไม่เจอคำลับเลย", c["in_text"] or c["in_flat"], False)
        ok4 = ck("ของจริง ต้องยังค้นข้อความในหน้าที่ไม่ได้แตะได้", c["keep_searchable"], True)
        good = all([ok1, ok2, ok3, ok4])
        print("\n" + ("✅ ตัวตรวจใช้ได้ แยกของจริงกับของปลอมออกจากกันได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        pg.goto(f"{BASE}/#/pdf-redact", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(src))
        pg.wait_for_selector(".rd-layer", timeout=20000)
        pg.wait_for_timeout(1200)

        print("\n── ① ลากคลุมคำลับบนหน้า 1 แล้วบันทึก")
        # คำลับอยู่ที่ y ราว 120/600 = 0.2 ลากคลุมกว้าง ๆ ให้ครอบแน่นอน
        drag_box(pg, 0.05, 0.13, 0.95, 0.27)
        boxes = pg.locator(".rd-box").count()
        ck("กล่องถูกสร้างจากการลาก", boxes >= 1, True)

        act(pg, "บันทึกไฟล์ที่ลบแล้ว")
        pg.wait_for_timeout(4000)
        out = dl_result(pg, DL / "redacted.pdf")

        r = find_secret(out)
        ck("คำลับต้องหายจากชั้นข้อความ", r["in_text"], False,
           "ถ้ายังเจอ แปลว่าแค่วาดทับ ไม่ได้ลบจริง")
        ck("คำลับต้องไม่เหลือในไบต์ของไฟล์ (คลาย stream แล้ว)", r["in_flat"], False)
        ck("จำนวนหน้าต้องครบเหมือนเดิม", r["pages"], 2)
        ck("หน้าที่ไม่ได้แตะ ต้องยังค้นข้อความได้", r["keep_searchable"], True,
           "ถ้าหาย แปลว่าเครื่องมือแปลงทั้งเล่มเป็นภาพ ซึ่งทำลายของที่ไม่ได้สั่งให้ลบ")

        print("\n── ② ข้อมูลกำกับไฟล์ต้องถูกล้าง")
        d = fitz.open(str(out))
        meta = {k: (d.metadata or {}).get(k) or "" for k in ("title", "author", "subject", "keywords", "creator")}
        d.close()
        ck("ชื่อเรื่อง ผู้เขียน และอื่น ๆ ต้องว่าง", [v for v in meta.values() if v], [])

        print("\n── ③ ไม่มี error บนหน้า")
        ck("ไม่มี error", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ลบข้อมูลได้จริง ไม่ใช่แค่วาดทับ และไม่ไปทำลายหน้าที่ไม่ได้สั่ง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
