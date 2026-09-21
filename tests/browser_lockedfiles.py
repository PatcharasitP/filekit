# ตรวจว่าเครื่องมือ PDF เปิด "ไฟล์ที่ล็อกรหัส" ได้แล้ว
#
# ‼️ ก่อนหน้านี้ไฟล์ที่ล็อกถูกปฏิเสธทุกเครื่องมือ ผู้ใช้ต้องไปปลดรหัสก่อนแล้วค่อยกลับมา
#    ตอนนี้ไลบรารีถอดรหัสได้แล้ว เครื่องมือจึงควรถามรหัสแล้วทำงานต่อได้เลย
#
# ตรวจ 3 แบบ
#   ① ไฟล์ล็อกแค่สิทธิ์ (เปิดอ่านได้อยู่แล้ว) ต้องทำงานได้ทันที ไม่ต้องถามอะไร
#   ② ไฟล์ล็อกการเปิด ต้องถามรหัส แล้วทำงานต่อได้เมื่อใส่ถูก
#   ③ ใส่รหัสผิด ต้องไม่ปล่อยไฟล์ผลลัพธ์ออกมา

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_locked_"))
FIX, DL = ROOT / "fix", ROOT / "dl"
PW = "ลับ1234"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def base_pdf(path, n=3):
    d = fitz.open()
    for i in range(n):
        p = d.new_page(width=595, height=842)
        p.insert_text((60, 120), f"LOCKED-MARK-{i + 1}", fontname="helv", fontsize=20)
    d.save(str(path)); d.close()
    return path


def make_locked(path, plain):
    d = fitz.open(str(plain))
    d.save(str(path), encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=PW, owner_pw="own-x")
    d.close(); return path


def make_restricted(path, plain):
    d = fitz.open(str(plain))
    d.save(str(path), encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="own-y",
           permissions=int(fitz.PDF_PERM_PRINT | fitz.PDF_PERM_ACCESSIBILITY))
    d.close(); return path


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def open_with(pg, tool, src, password=None, wait_ms=2500):
    """เปิดเครื่องมือแล้วใส่ไฟล์ · ถ้ามีกล่องขอรหัสโผล่มา ให้กรอกตามที่ส่งมา"""
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{tool}", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(1200)
    box = pg.locator(".pw-box")
    asked = box.count() > 0 and box.first.is_visible()
    if asked and password is not None:
        box.locator("input[type=password]").first.fill(password)
        box.locator("button").filter(has_text="ปลดล็อกแล้วทำต่อ").first.click()
        pg.wait_for_timeout(wait_ms)
    return asked


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    plain = base_pdf(FIX / "plain.pdf")
    locked = make_locked(FIX / "locked.pdf", plain)
    restricted = make_restricted(FIX / "restricted.pdf", plain)

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        a = fitz.open(str(locked))
        ok1 = ck("ไฟล์ล็อกการเปิด ต้องต้องใช้รหัส", bool(a.needs_pass), True); a.close()
        b = fitz.open(str(restricted))
        ok2 = ck("ไฟล์ล็อกแค่สิทธิ์ ต้องไม่ต้องใช้รหัส", bool(b.needs_pass), False)
        ok3 = ck("ไฟล์ล็อกแค่สิทธิ์ ต้องคัดลอกไม่ได้", bool(b.permissions & fitz.PDF_PERM_COPY), False); b.close()
        good = all([ok1, ok2, ok3])
        print("\n" + ("✅ ไฟล์ทดสอบถูกต้องทั้งสามแบบ" if good else "❌ ไฟล์ทดสอบไม่ถูก"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① ไฟล์ล็อกแค่สิทธิ์ ต้องใช้งานได้ทันทีโดยไม่ต้องถามอะไร")
        asked = open_with(pg, "pdf-nup", restricted)
        ck("ต้องไม่ถามรหัส", asked, False,
           "ไฟล์แบบนี้เปิดอ่านได้อยู่แล้ว การถามรหัสคือการกวนผู้ใช้โดยไม่จำเป็น")
        ck("ต้องพร้อมทำงาน (ปุ่มหลักกดได้)",
           pg.evaluate("() => { const b = document.querySelector('button.s2-cta'); return !!b && !b.disabled; }"), True)

        print("\n── ② ไฟล์ล็อกการเปิด ต้องถามรหัสแล้วทำงานต่อได้")
        for tool, btn in [("pdf-nup", "จัดหน้าแล้วบันทึก"), ("pdf-watermark", "ใส่ลายน้ำ")]:
            asked = open_with(pg, tool, locked, PW)
            ck(f"[{tool}] ต้องถามรหัสผ่าน", asked, True,
               "ถ้าไม่ถาม แปลว่ายังปฏิเสธไฟล์ล็อกแบบเดิม")
            ready = pg.evaluate("() => { const b = document.querySelector('button.s2-cta'); return !!b && !b.disabled; }")
            ck(f"[{tool}] ใส่รหัสถูกแล้วต้องทำงานต่อได้", ready, True)

        print("\n── ③ ใส่รหัสผิด ต้องไม่ปล่อยไฟล์ออกมา")
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/pdf-nup", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(locked))
        pg.wait_for_timeout(1200)
        for _ in range(3):
            box = pg.locator(".pw-box")
            if not (box.count() and box.first.is_visible()): break
            box.locator("input[type=password]").first.fill("ผิดแน่นอน")
            box.locator("button").filter(has_text="ปลดล็อกแล้วทำต่อ").first.click()
            pg.wait_for_timeout(1200)
        ck("ต้องไม่มีไฟล์ผลลัพธ์", pg.locator(".s2-side-res .result, .results .result").count(), 0)
        status = pg.evaluate("() => document.querySelector('.status')?.textContent || ''")
        ck("ต้องบอกผู้ใช้ว่ารหัสไม่ถูก", "รหัส" in status, True, f"ข้อความจริง {status[:70]!r}")

        print("\n── ④ ไฟล์ธรรมดาต้องไม่ถูกงานนี้ทำพัง")
        asked = open_with(pg, "pdf-nup", plain)
        ck("ไฟล์ปกติต้องไม่ถูกถามรหัส", asked, False)
        ck("ไฟล์ปกติต้องพร้อมทำงานเหมือนเดิม",
           pg.evaluate("() => { const b = document.querySelector('button.s2-cta'); return !!b && !b.disabled; }"), True)

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ เครื่องมือเปิดไฟล์ล็อกได้แล้ว และไฟล์ปกติไม่ถูกกระทบ")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
