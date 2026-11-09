#!/usr/bin/env python3
"""ไฟล์รูปเสียต้องได้ข้อความไทยที่บอกว่าทำอะไรต่อ ไม่ใช่ข้อความดิบภาษาอังกฤษของเบราว์เซอร์

‼️ ที่มา 09/11/2026 ไล่มุมไอโฟน: ตัวถอดกลาง decodeImage (src/imgdecode.js) โยน error ของ createImageBitmap
   ออกไปตรง ๆ เมื่อไฟล์ไม่ใช่ HEIC เครื่องมือจึงขึ้นต่อท้าย "อ่านรูปไม่ได้: " ด้วยข้อความเบราว์เซอร์
   ค่าจริงที่จับได้: Chromium "The source image could not be decoded."
   WebKit ของ Playwright "Cannot decode the data in the argument to createImageBitmap"
   ตรวจสามเครื่องมือที่ต่อข้อความ e.message ตรง ๆ: pdf-edit (โหมดรูป), pdf-sign (อัปโหลดรูป), image-convert

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_image_error_thai.py"""
import os
import pathlib
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
RAW = re.compile(r"could not be decoded|cannot decode|createImageBitmap|InvalidStateError|EncodingError", re.I)
ok = fail = 0


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""), flush=True)
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""), flush=True)


def wait_status(pg, pattern):
    pg.wait_for_function(
        "(p) => [...document.querySelectorAll('.status')].some((s) => new RegExp(p).test(s.innerText))",
        arg=pattern, timeout=40000)
    texts = pg.eval_on_selector_all(".status", "els => els.map((e) => e.innerText)")
    return " | ".join(t.replace("\n", " ") for t in texts if re.search(pattern, t))


def load_sample(pg, tool):
    pg.goto(f"{BASE}/#{tool}", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2500)
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").filter(visible=True).first.click()


def pdf_edit(pg, bad):
    load_sample(pg, "pdf-edit")
    pg.wait_for_selector(".pe-stage:not([hidden])", timeout=60000)
    pg.get_by_role("button", name="รูป", exact=True).filter(visible=True).first.click()
    pg.wait_for_timeout(500)
    inputs = pg.locator("input[type=file][accept='image/*']")
    inputs.nth(inputs.count() - 1).set_input_files(str(bad))
    return wait_status(pg, "อ่านรูปไม่ได้|เลือกรูปแล้ว")


def pdf_sign(pg, bad):
    load_sample(pg, "pdf-sign")
    pg.wait_for_timeout(2500)
    pg.locator("input[type=file][accept='image/*']").first.set_input_files(str(bad))
    return wait_status(pg, "อ่านรูปไม่ได้|ลายเซ็น")


def image_convert(pg, bad):
    """ไฟล์ดีหนึ่งไฟล์กับไฟล์เสียหนึ่งไฟล์ ไฟล์เสียไปอยู่ในกล่องรายการข้าม พร้อมเหตุผลรายไฟล์"""
    pg.goto(f"{BASE}/#image-convert", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2500)
    pg.locator("input[type=file]").first.set_input_files([str(GOOD), str(bad)])
    pg.wait_for_timeout(800)
    pg.get_by_role("button", name="แปลงไฟล์").filter(visible=True).first.click()
    wait_status(pg, "แปลงเสร็จ|ไม่สำเร็จ")
    pg.wait_for_timeout(500)
    box = pg.locator(".fail-box").filter(visible=True).first  # หน้าอื่นที่ซ่อนอยู่มี .fail-box ค้างได้
    box.wait_for(timeout=20000)
    return box.inner_text().replace("\n", " ")


GOOD = None


def main():
    global GOOD
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk-imgerr-"))
    GOOD = tmp / "ดี.png"
    from PIL import Image  # มีในทุกเครื่องที่รันชุดเทส FileKit (เทส HEIC ใช้อยู่แล้ว)
    Image.new("RGB", (40, 30), (200, 120, 60)).save(GOOD)
    bad = tmp / "รูปเสีย.jpg"
    bad.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00garbage-not-a-real-jpeg" * 40)  # หัว JPEG ถูก เนื้อในเป็นขยะ
    with sync_playwright() as p:
        for name in ("chromium", "webkit"):
            br = getattr(p, name).launch()
            for tool, fn in (("pdf-edit", pdf_edit), ("pdf-sign", pdf_sign), ("image-convert", image_convert)):
                # pdf-edit จอแคบซ่อนปุ่มเลือกโหมดไว้ในแถบเครื่องมือ ตัวเทสนี้ตรวจข้อความ จึงใช้จอกว้างแบบเทส HEIC เดิม
                pg = br.new_page(viewport={"width": 1280, "height": 900} if tool == "pdf-edit" else {"width": 390, "height": 844})
                try:
                    msg = fn(pg, bad)
                    ck(f"{name} {tool} ไม่มีข้อความดิบของเบราว์เซอร์", not RAW.search(msg), msg[:160])
                    ck(f"{name} {tool} บอกว่าไฟล์เสียหรือไม่ใช่รูป", "เสียหาย" in msg, msg[:160])
                except Exception as e:  # noqa: BLE001 เทสพังกลางทางนับเป็นตก
                    ck(f"{name} {tool} เปิดหน้าและเลือกไฟล์ได้", False, str(e)[:160])
                pg.close()
            br.close()
    print(f"ผ่าน {ok} ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
