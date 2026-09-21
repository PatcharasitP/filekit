# ตรวจเครื่องมือ "ใส่รหัสผ่าน PDF" ด้วยคำถามที่สำคัญที่สุด: ไฟล์ที่ได้ **ล็อกจริงไหม**
#
# ‼️ เทสนี้ต้องแดงถ้าเครื่องมือทำงานหลอก ๆ (เช่น บันทึกไฟล์เฉย ๆ โดยไม่เข้ารหัส)
#    ตรวจด้วย PyMuPDF ซึ่งเป็นคนละเครื่องยนต์กับ pdf-lib ที่สร้างไฟล์ จึงไม่เข้าข้างกัน
#    รัน --selftest เพื่อพิสูจน์ว่าตัวตรวจจับของปลอมได้จริงก่อนเชื่อผลมัน
#
# รันจากโฟลเดอร์ FileKit/ หลังเปิดเซิร์ฟเวอร์แล้ว:
#   FK_BASE=http://127.0.0.1:PORT ../.venv/bin/python tests/browser_protect.py

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_protect_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make_pdf(path, texts, size=(400, 600)):
    d = fitz.open()
    for t in texts:
        p = d.new_page(width=size[0], height=size[1])
        p.insert_text((40, 80), t, fontname="helv", fontsize=16)
    d.save(str(path)); d.close()
    return path


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, has_text=None, timeout=25000):
    side = ".s2-side-res button:visible, .s2-subrow button:visible"
    stage = ".s2-res-list .result button:visible, .results .result button:visible, .result button:visible"
    loc = pg.locator(side)
    if has_text: loc = loc.filter(has_text=has_text)
    try:
        loc.first.wait_for(state="visible", timeout=6000)
    except Exception:
        loc = pg.locator(stage)
        if has_text: loc = loc.filter(has_text=has_text)
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def protect(pg, files, password, tweak=None, out_name="out.pdf"):
    """เดินเส้นทางจริงของผู้ใช้: เปิดหน้า ใส่ไฟล์ พิมพ์รหัส กดปุ่ม ดาวน์โหลด"""
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-protect", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files([str(f) for f in files])
    pg.wait_for_timeout(500)
    pg.locator("input[type=password]").first.fill(password)
    pg.wait_for_timeout(200)
    if tweak: tweak(pg)
    act(pg, "ใส่รหัส")
    pg.wait_for_timeout(2500)
    return dl_result(pg, DL / out_name, "ดาวน์โหลด")


# ── ตัวตรวจ: ไฟล์นี้ล็อกจริงไหม ─────────────────────────────────────────────
def audit(path, password, wrong="ไม่ใช่รหัสนี้แน่นอน"):
    """คืนผลตรวจเป็น dict — ทุกค่าอ่านจาก PyMuPDF ล้วน"""
    d = fitz.open(str(path))
    r = {"needs_pass": bool(d.needs_pass), "encrypted": bool(d.is_encrypted)}
    r["wrong_rejected"] = d.authenticate(wrong) == 0
    # ‼️ PyMuPDF คืน 2 = เปิดในฐานะผู้ใช้ · 4 = เปิดในฐานะเจ้าของ (ทำได้ทุกอย่าง ไม่สนข้อจำกัด)
    #    ต้องแยกให้ออก ไม่งั้นจะอ่านสิทธิ์ของ "เจ้าของ" มาตอบแทนสิทธิ์ของคนทั่วไปที่เปิดไฟล์
    lvl = d.authenticate(password)
    r["right_accepted"] = lvl > 0
    r["as_owner"] = lvl >= 4
    r["pages"] = d.page_count
    r["text"] = d[0].get_text().strip() if d.page_count else ""
    r["can_copy"] = bool(d.permissions & fitz.PDF_PERM_COPY)
    r["can_print"] = bool(d.permissions & fitz.PDF_PERM_PRINT)
    d.close()
    return r


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)

    if SELFTEST:
        # ‼️ พิสูจน์ตัวตรวจก่อนเชื่อ: ป้อนไฟล์ที่ "ไม่ได้ล็อก" แล้วมันต้องฟ้อง
        print("ตรวจตัวตรวจเอง")
        plain = make_pdf(FIX / "plain.pdf", ["NOT LOCKED"])
        a = audit(plain, "อะไรก็ได้")
        ok1 = ck("ไฟล์ที่ไม่ได้ล็อก ต้องรายงานว่าไม่ต้องใช้รหัส", a["needs_pass"], False)
        # ไฟล์ที่ล็อกจริง (สร้างด้วย PyMuPDF เอง คนละทางกับเครื่องมือ)
        d = fitz.open(str(plain))
        locked = FIX / "locked.pdf"
        d.save(str(locked), encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="ลับ1234", owner_pw="own")
        d.close()
        b = audit(locked, "ลับ1234")
        ok2 = ck("ไฟล์ที่ล็อกจริง ต้องรายงานว่าต้องใช้รหัส", b["needs_pass"], True)
        ok3 = ck("รหัสผิดต้องถูกปฏิเสธ", b["wrong_rejected"], True)
        ok4 = ck("รหัสถูกต้องเปิดได้", b["right_accepted"], True)
        print("\n" + ("✅ ตัวตรวจใช้ได้ แยกไฟล์ล็อกกับไม่ล็อกออกจากกันได้"
                      if all([ok1, ok2, ok3, ok4]) else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if all([ok1, ok2, ok3, ok4]) else 1

    PW = "ลับ1234"            # ‼️ ภาษาไทยโดยตั้งใจ เพราะผู้ใช้ของเราตั้งรหัสไทยได้
    src = make_pdf(FIX / "secret.pdf", ["SECRET-PAGE-1", "SECRET-PAGE-2"])

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        # ① เส้นทางหลัก: ใส่รหัสไฟล์เดียว
        print("\n── ① ใส่รหัสไฟล์เดียว (รหัสภาษาไทย)")
        out = protect(pg, [src], PW, out_name="one.pdf")
        a = audit(out, PW)
        ck("ไฟล์ที่ได้ต้องเปิดไม่ได้ถ้าไม่มีรหัส", a["needs_pass"], True,
           "ถ้าเป็น False แปลว่าเครื่องมือบันทึกไฟล์เฉย ๆ โดยไม่ได้เข้ารหัสจริง")
        ck("รหัสผิดต้องเปิดไม่ได้", a["wrong_rejected"], True)
        ck("รหัสภาษาไทยที่ตั้งไว้ ต้องเปิดได้", a["right_accepted"], True)
        ck("จำนวนหน้าต้องครบเหมือนต้นฉบับ", a["pages"], 2)
        ck("เนื้อหาต้องไม่เสีย", a["text"], "SECRET-PAGE-1")

        # ② สิทธิ์: ติ๊กห้ามคัดลอกออก แล้วต้องห้ามจริง
        print("\n── ② เอาสิทธิ์คัดลอกออก")
        def uncheck_copy(page):
            page.locator("details.pt-more > summary").click()
            page.wait_for_timeout(300)
            page.locator(".pt-perm input[type=checkbox]").nth(1).uncheck()
            page.wait_for_timeout(200)
        out2 = protect(pg, [src], PW, tweak=uncheck_copy, out_name="nocopy.pdf")
        a2 = audit(out2, PW)
        ck("ยังต้องล็อกอยู่", a2["needs_pass"], True)
        ck("คนที่รู้รหัสต้องเปิดได้ในฐานะผู้ใช้ ไม่ใช่เจ้าของ", a2["as_owner"], False,
           "ถ้าเป็นเจ้าของ ข้อห้ามทุกข้อจะไม่มีผล เพราะมาตรฐาน PDF ให้เจ้าของทำได้ทุกอย่าง")
        ck("สิทธิ์คัดลอกต้องถูกปิด", a2["can_copy"], False)
        ck("สิทธิ์พิมพ์ที่ไม่ได้แตะ ต้องยังเปิดอยู่", a2["can_print"], True)

        # ③ หลายไฟล์พร้อมกัน ต้องได้ทุกไฟล์
        print("\n── ③ ใส่รหัสหลายไฟล์พร้อมกัน")
        s2 = make_pdf(FIX / "secret2.pdf", ["OTHER-DOC"])
        pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-protect", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator(".dz input[type=file]").set_input_files([str(src), str(s2)])
        pg.wait_for_timeout(500)
        pg.locator("input[type=password]").first.fill(PW)
        act(pg, "ใส่รหัส")
        pg.wait_for_timeout(3000)
        rows = pg.locator(".s2-side-res .result, .results .result").count()
        ck("ต้องได้ผลลัพธ์ 2 ไฟล์", rows, 2)

        # ④ ‼️ รหัสผ่านต้องไม่ถูกเก็บไว้ที่ไหนเลย
        print("\n── ④ รหัสต้องไม่ถูกเก็บไว้ในเครื่อง")
        leaked = pg.evaluate(
            """(pw) => {
                 const hits = [];
                 for (const store of [localStorage, sessionStorage]) {
                   for (let i = 0; i < store.length; i++) {
                     const k = store.key(i);
                     if ((store.getItem(k) || '').includes(pw) || k.includes(pw)) hits.push(k);
                   }
                 }
                 if (location.href.includes(pw)) hits.push('URL');
                 if (document.cookie.includes(pw)) hits.push('cookie');
                 return hits;
               }""", PW)
        ck("ไม่มีรหัสผ่านหลงเหลือใน localStorage, sessionStorage, URL หรือ cookie", leaked, [])
        names = pg.locator(".s2-side-res .r-name strong, .results .r-name strong").all_inner_texts()
        ck("ชื่อไฟล์ผลลัพธ์ต้องไม่มีรหัสผ่านปนอยู่", [n for n in names if PW in n], [])

        # ⑤ ไม่มี error ใน console
        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ เครื่องมือใส่รหัสทำงานถูกต้อง และไฟล์ที่ได้ล็อกจริง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
