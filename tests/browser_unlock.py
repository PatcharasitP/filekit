# ตรวจเครื่องมือ "ปลดรหัสผ่าน PDF" — ไฟล์ที่ได้ต้องเปิดได้จริงโดยไม่ต้องใช้รหัส
#
# ‼️ ไฟล์ล็อกมี 2 แบบที่ต้องแยกให้ออก (พิสูจน์ด้วยมือ 21/09/2026)
#    ① ล็อกการเปิด  ต้องรู้รหัส · ② ล็อกแค่สิทธิ์  เปิดอ่านได้อยู่แล้ว แต่ห้ามคัดลอก
#    เทสนี้ครอบทั้งสองแบบ บวกเคสรหัสผิด ซึ่งต้องไม่ยอมปล่อยไฟล์ออกมา
#
# รัน --selftest เพื่อพิสูจน์ว่าตัวตรวจแยกไฟล์ที่ปลดแล้วกับยังไม่ปลดได้จริง

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_unlock_"))
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


def base_pdf(path):
    d = fitz.open()
    for t in ["UNLOCK-PAGE-1", "UNLOCK-PAGE-2"]:
        p = d.new_page(width=400, height=600)
        p.insert_text((40, 80), t, fontname="helv", fontsize=16)
    d.save(str(path)); d.close()
    return path


def make_locked(path, plain):
    """แบบ ① ล็อกการเปิด ต้องใช้รหัส"""
    d = fitz.open(str(plain))
    d.save(str(path), encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=PW, owner_pw="owner-x")
    d.close(); return path


def make_restricted(path, plain):
    """แบบ ② ล็อกแค่สิทธิ์ เปิดอ่านได้แต่ห้ามคัดลอก"""
    d = fitz.open(str(plain))
    d.save(str(path), encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="owner-y",
           permissions=int(fitz.PDF_PERM_PRINT | fitz.PDF_PERM_ACCESSIBILITY))
    d.close(); return path


def audit(path, password=None):
    """‼️ ไฟล์ที่ยังล็อกอยู่ อ่านหน้าไม่ได้จนกว่าจะ authenticate
       ต้องดักไว้ ไม่งั้นตัวตรวจเองจะระเบิดก่อนได้ตอบคำถาม"""
    d = fitz.open(str(path))
    r = {"needs_pass": bool(d.needs_pass), "encrypted": bool(d.is_encrypted)}
    if d.needs_pass and password is not None:
        d.authenticate(password)
    r["pages"] = d.page_count
    r["can_copy"] = bool(d.permissions & fitz.PDF_PERM_COPY)
    try:
        r["text"] = d[0].get_text().strip() if d.page_count else ""
    except ValueError:
        r["text"] = None      # ยังล็อกอยู่ อ่านไม่ได้ ซึ่งเป็นคำตอบที่มีความหมายในตัวมันเอง
    d.close(); return r


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, timeout=25000):
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=6000)
    except Exception:
        loc = pg.locator(".s2-res-list .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def unlock(pg, files, password=None, out_name="out.pdf", expect_file=True):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-unlock", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files([str(f) for f in files])
    pg.wait_for_timeout(600)
    if password is not None:
        pg.locator("input[type=password]").first.fill(password)
        pg.wait_for_timeout(200)
    act(pg, "ปลดรหัส")
    pg.wait_for_timeout(3000)
    if not expect_file:
        return None
    return dl_result(pg, DL / out_name)


def status_text(pg):
    s = pg.locator(".status")
    return s.first.inner_text() if s.count() else ""


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    plain = base_pdf(FIX / "plain.pdf")
    locked = make_locked(FIX / "locked.pdf", plain)
    restricted = make_restricted(FIX / "restricted.pdf", plain)

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        a = audit(locked)
        ok1 = ck("ไฟล์ล็อกการเปิด ต้องรายงานว่าต้องใช้รหัส", a["needs_pass"], True)
        b = audit(restricted)
        ok2 = ck("ไฟล์ล็อกแค่สิทธิ์ ต้องรายงานว่าไม่ต้องใช้รหัส", b["needs_pass"], False)
        ok3 = ck("ไฟล์ล็อกแค่สิทธิ์ ต้องรายงานว่าคัดลอกไม่ได้", b["can_copy"], False)
        c = audit(plain)
        ok4 = ck("ไฟล์ธรรมดา ต้องรายงานว่าคัดลอกได้", c["can_copy"], True)
        good = all([ok1, ok2, ok3, ok4])
        print("\n" + ("✅ ตัวตรวจใช้ได้ แยกไฟล์ทั้งสามแบบออกจากกันได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        # ① ล็อกการเปิด + รหัสถูก
        print("\n── ① ไฟล์ล็อกการเปิด ใส่รหัสถูก")
        out = unlock(pg, [locked], PW, "un-locked.pdf")
        a = audit(out)
        ck("ไฟล์ที่ได้ต้องเปิดได้โดยไม่ต้องใช้รหัส", a["needs_pass"], False,
           "ถ้ายัง True แปลว่าไม่ได้ปลดจริง")
        ck("จำนวนหน้าครบ", a["pages"], 2)
        ck("เนื้อหาไม่เสีย", a["text"], "UNLOCK-PAGE-1")

        # ② ล็อกการเปิด + รหัสผิด ต้องไม่ได้ไฟล์
        print("\n── ② ไฟล์ล็อกการเปิด ใส่รหัสผิด")
        unlock(pg, [locked], "รหัสผิดแน่นอน", expect_file=False)
        rows = pg.locator(".s2-side-res .result, .results .result").count()
        ck("ต้องไม่มีไฟล์ผลลัพธ์ออกมาเลย", rows, 0,
           "ถ้ามีไฟล์ออกมาแปลว่าเครื่องมือปล่อยของที่ยังถอดไม่ได้")
        txt = status_text(pg)
        ck("ต้องบอกผู้ใช้ว่ารหัสไม่ถูก", "รหัสไม่ถูกต้อง" in txt or "ปลดรหัสไม่สำเร็จ" in txt, True,
           f"ข้อความที่ขึ้นจริง: {txt[:80]!r}")

        # ③ ล็อกการเปิด + ไม่ใส่รหัสเลย ต้องบอกให้ใส่
        print("\n── ③ ไฟล์ล็อกการเปิด ไม่ใส่รหัส")
        unlock(pg, [locked], None, expect_file=False)
        txt3 = status_text(pg)
        ck("ต้องบอกว่าต้องใส่รหัสก่อน", "รหัส" in txt3, True, f"ข้อความจริง: {txt3[:80]!r}")

        # ④ ล็อกแค่สิทธิ์ ปลดได้โดยไม่ต้องใส่รหัส
        print("\n── ④ ไฟล์ล็อกแค่สิทธิ์ ไม่ต้องใส่รหัส")
        out4 = unlock(pg, [restricted], None, "un-restricted.pdf")
        a4 = audit(out4)
        ck("ไฟล์ที่ได้ต้องไม่ถูกเข้ารหัสแล้ว", a4["encrypted"], False)
        ck("ต้องคัดลอกได้แล้ว", a4["can_copy"], True)
        ck("เนื้อหาไม่เสีย", a4["text"], "UNLOCK-PAGE-1")
        ck("ต้องบอกผู้ใช้ว่าไฟล์นี้ล็อกแค่สิทธิ์", "ล็อกแค่สิทธิ์" in status_text(pg), True)

        # ⑤ รหัสต้องไม่ถูกเก็บ
        print("\n── ⑤ รหัสต้องไม่ถูกเก็บไว้ในเครื่อง")
        unlock(pg, [locked], PW, "again.pdf")
        leaked = pg.evaluate(
            """(pw) => {
                 const hits = [];
                 for (const store of [localStorage, sessionStorage])
                   for (let i = 0; i < store.length; i++) {
                     const k = store.key(i);
                     if ((store.getItem(k) || '').includes(pw) || k.includes(pw)) hits.push(k);
                   }
                 if (location.href.includes(pw)) hits.push('URL');
                 return hits;
               }""", PW)
        ck("ไม่มีรหัสหลงเหลือใน localStorage, sessionStorage หรือ URL", leaked, [])
        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ เครื่องมือปลดรหัสทำงานถูกต้อง และไม่ปล่อยไฟล์ที่ยังถอดไม่ได้")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
