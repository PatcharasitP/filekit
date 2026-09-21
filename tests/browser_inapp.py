#!/usr/bin/env python3
"""เปิด FileKit จากลิงก์ในแอปแชท (LINE) แล้วต้องยังเอาไฟล์ออกไปได้

‼️ ที่มา 20/09/2026 พี่ปอนด์เปิดจากลิงก์ในแอป LINE บนมือถือจริง
   ย่อรูปสำเร็จ กดดาวน์โหลด แล้ว LINE ขึ้นข้อความของตัวเองว่า
   "ไม่สามารถดาวน์โหลดไฟล์ได้ โปรดดาวน์โหลดด้วยเบราว์เซอร์อื่น"
   งานที่ทำมาทั้งหมดสูญเปล่า และหน้าเว็บไม่ได้บอกอะไรเลยทั้งก่อนและหลัง

‼️ สามอย่างที่เทสนี้บังคับ
   ① อยู่ในแอปแชท ต้องมีแถบเตือน "ตั้งแต่เปิดหน้า" ไม่ใช่ตอนกดโหลดแล้วพัง
      พร้อมทางออกที่ใช้ได้จริง (LINE รองรับ openExternalBrowser=1 อย่างเป็นทางการ)
   ② ถ้าเบราว์เซอร์ในแอปมี Web Share ต้องส่งไฟล์ผ่าน share sheet
      และ ‼️ ห้ามเด้งดาวน์โหลดซ้ำ ไม่งั้นผู้ใช้เจอทั้ง share sheet และข้อความ error ของ LINE พร้อมกัน
   ③ ‼️ เบราว์เซอร์ปกติต้องไม่เปลี่ยนพฤติกรรมเลย ห้ามมีแถบเตือน ห้ามใช้ share
      เพราะคนส่วนใหญ่ไม่ได้มีปัญหานี้ การไปเปลี่ยนของเขาคือสร้างปัญหาใหม่

รันปกติ:   ../.venv/bin/python tests/browser_inapp.py
รันพิสูจน์: ../.venv/bin/python tests/browser_inapp.py --selftest
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
ok = fail = 0
reds = []

# ‼️ โหมดพิสูจน์ต้องบอกล่วงหน้าว่าข้อไหนควรแดง แล้วตรวจว่าแดงตรงนั้นจริง
# ไม่มี Web Share ให้ = ตกไปดาวน์โหลดปกติ ซึ่งทำให้สามข้อนี้แดงต่อเนื่องกัน
MUST_FAIL = {"ส่งไฟล์ผ่าน share sheet ของระบบ",
             "ห้ามเด้งดาวน์โหลดซ้ำหลังส่งผ่าน share",
             "ผู้ใช้กดยกเลิกเอง ต้องไม่มีอะไรเด้งตามมา"}

LINE_UA = ("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) "
           "Chrome/126.0.6478.71 Mobile Safari/537.36 Line/14.6.2/IAB")
PLAIN_UA = ("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.6478.71 Mobile Safari/537.36")

# จำลองเบราว์เซอร์ในแอปที่ "มี" Web Share — headless chromium ไม่มีให้จริง
FAKE_SHARE = """
window.__shared = [];
navigator.canShare = (d) => !!(d && d.files && d.files.length);
navigator.share = async (d) => { window.__shared.push((d.files || []).map(f => f.name)); };
"""


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def press_download(pg):
    """กดปุ่มดาวน์โหลดที่ผู้ใช้เห็นจริงบนจอ
    ‼️ v2 บนมือถือ ปุ่มดาวน์โหลดรายไฟล์ของเครื่องมือย่อรูปอยู่ในแผ่น "ตัวเลือก" ที่ปิดอยู่
       สิ่งที่อยู่บนจอจริงหลังทำเสร็จคือ "โหลดทั้งหมด (ZIP)" ซึ่งผ่าน download() ตัวเดียวกัน
       เทสนี้ถามว่า "กดโหลดแล้วส่งผ่าน share sheet ไหม" ไม่ได้ถามว่าเป็นปุ่มใบไหน
       จึงกดใบแรกที่มองเห็นและมีคำว่า โหลด (ครอบทั้ง ดาวน์โหลด และ โหลดทั้งหมด)"""
    import re as _re
    loc = pg.locator("button:visible").filter(has_text=_re.compile("โหลด"))
    if not loc.count():
        loc = pg.get_by_role("button", name="ดาวน์โหลด").filter(visible=True)
    loc.first.click()


PHOTO = Path(__file__).resolve().parent.parent / "samples" / "ตัวอย่าง-รูปภาพ-1.jpg"


def make_result(pg):
    """ย่อรูปหนึ่งใบจนมีปุ่มดาวน์โหลดให้กด
    ‼️ ใช้รูปใบเดียวเหมือนเหตุการณ์จริง (พี่ปอนด์ย่อรูปหนึ่งใบจากใน LINE) ไม่ใช่ไฟล์ตัวอย่าง
       ไฟล์ตัวอย่างมี 2 รูป ซึ่งปุ่มที่เห็นบนจอจะเป็น "โหลดทั้งหมด (ZIP)" แทน "ดาวน์โหลดรูป"
       (วัดจริง 22/09/2026 จอ 390: 1 รูป = ดาวน์โหลดรูป, 2 รูป = โหลดทั้งหมด (ZIP) ส่วนรายไฟล์อยู่ในแผ่นตัวเลือก)"""
    pg.locator(".dz input[type=file]").first.set_input_files(str(PHOTO))
    pg.wait_for_timeout(2200)
    pg.get_by_role("button", name="ย่อและบีบอัด").filter(visible=True).first.click()
    pg.wait_for_timeout(3500)


def main():
    with sync_playwright() as b_:
        b = b_.chromium.launch()

        # ── ① ในแอป LINE ต้องมีแถบเตือนกับทางออก ────────────────────────────
        ctx = b.new_context(viewport={"width": 390, "height": 780}, has_touch=True,
                            is_mobile=True, user_agent=LINE_UA, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.goto(f"{BASE}/#image-resize", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2600)
        bar = pg.locator(".ia-bar")
        ck("อยู่ในแอป LINE ต้องมีแถบเตือนตั้งแต่เปิดหน้า", bar.count() == 1)
        if bar.count():
            txt = bar.inner_text().replace("\n", " ")
            ck("แถบเตือนบอกชื่อแอปที่ผู้ใช้กำลังใช้อยู่", "LINE" in txt, txt[:60])
            href = pg.locator(".ia-bar .ia-go").get_attribute("href") or ""
            ck("มีทางออกที่ LINE รองรับจริง (openExternalBrowser=1)",
               "openExternalBrowser=1" in href, href[-40:])
            ck("ทางออกต้องพากลับมาที่เครื่องมือเดิม ไม่ใช่หน้าแรก", "#image-resize" in href)
        ctx.close()

        # ── ② ในแอปที่มี Web Share ต้องส่งผ่าน share sheet ───────────────────
        ctx = b.new_context(viewport={"width": 390, "height": 780}, has_touch=True,
                            is_mobile=True, user_agent=LINE_UA, accept_downloads=True)
        if not SELFTEST:
            ctx.add_init_script(FAKE_SHARE)   # โหมดพิสูจน์ = ไม่ใส่ share ให้ ต้องแดง 2 ข้อ
        pg = ctx.new_page()
        dl_count = {"n": 0}
        pg.on("download", lambda d: dl_count.__setitem__("n", dl_count["n"] + 1))
        pg.goto(f"{BASE}/#image-resize", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2600)
        make_result(pg)
        press_download(pg)
        pg.wait_for_timeout(2500)
        shared = pg.evaluate("() => window.__shared || []")
        ck("ส่งไฟล์ผ่าน share sheet ของระบบ", len(shared) == 1 and len(shared[0]) == 1, str(shared))
        ck("ห้ามเด้งดาวน์โหลดซ้ำหลังส่งผ่าน share", dl_count["n"] == 0, f"เด้ง {dl_count['n']} ครั้ง")

        # ผู้ใช้กดยกเลิกใน share sheet = ตั้งใจไม่เอา ห้ามยัดดาวน์โหลดตามมา
        pg.evaluate("() => { navigator.share = async () => { const e = new Error('x');"
                    " e.name = 'AbortError'; throw e; }; }")
        press_download(pg)
        pg.wait_for_timeout(2200)
        ck("ผู้ใช้กดยกเลิกเอง ต้องไม่มีอะไรเด้งตามมา", dl_count["n"] == 0, f"เด้ง {dl_count['n']} ครั้ง")

        # share พังจริง ต้องยังได้ไฟล์ทางปกติ ห้ามเงียบหาย
        pg.evaluate("() => { navigator.share = async () => { throw new Error('ไม่รองรับ'); }; }")
        got = ""
        try:
            with pg.expect_download(timeout=12000) as dl:
                press_download(pg)
            got = dl.value.suggested_filename
        except Exception as e:
            got = "ไม่ได้ไฟล์: " + str(e).splitlines()[0][:50]
        ck("share ใช้ไม่ได้ ต้องตกไปดาวน์โหลดปกติ ไม่ใช่เงียบ", got.endswith(".jpg"), got)
        ck("ไม่มี error หลุดออกมา", not errs, errs[0] if errs else "")
        ctx.close()

        # ── ③ เบราว์เซอร์ปกติต้องไม่เปลี่ยนอะไรเลย ──────────────────────────
        ctx = b.new_context(viewport={"width": 390, "height": 780}, has_touch=True,
                            is_mobile=True, user_agent=PLAIN_UA, accept_downloads=True)
        ctx.add_init_script(FAKE_SHARE)   # มี share ให้ แต่ห้ามเอาไปใช้
        pg = ctx.new_page()
        pg.goto(f"{BASE}/#image-resize", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2600)
        ck("เบราว์เซอร์ปกติต้องไม่มีแถบเตือน", pg.locator(".ia-bar").count() == 0)
        make_result(pg)
        got = ""
        try:
            with pg.expect_download(timeout=12000) as dl:
                press_download(pg)
            got = dl.value.suggested_filename
        except Exception as e:
            got = "ไม่ได้ไฟล์: " + str(e).splitlines()[0][:50]
        ck("เบราว์เซอร์ปกติต้องดาวน์โหลดตรง ๆ เหมือนเดิม", got.endswith(".jpg"), got)
        ck("‼️ เบราว์เซอร์ปกติต้องไม่ไปใช้ share sheet",
           pg.evaluate("() => (window.__shared || []).length") == 0)
        ctx.close()
        b.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    if SELFTEST:
        good = set(reds) == MUST_FAIL
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงข้อที่ควรจับ" if good else
              f"❌ จับไม่ตรง ขาด {MUST_FAIL - set(reds)} เกิน {set(reds) - MUST_FAIL}")
        return 0 if good else 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
