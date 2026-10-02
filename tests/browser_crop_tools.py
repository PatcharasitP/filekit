"""ครอบตัดขอบ PDF เฟส 3: เลิกทำ ทำซ้ำ, แยกกรอบทีละหน้า, ดูผลหลังตัด, ตัดขอบขาวอัตโนมัติ, แถบบนแถวเดียว

‼️ ที่มา 02/10/2026 พี่ปอนด์เคาะ "เอาตามฟ้าแนะนำได้เลยย" ทั้ง 4 ข้อ
   แผนผ่านรอบตรวจแย้ง 4 มุม (61 ข้อ) ก่อนเขียน กติกาที่เทสนี้ถือ:
   ① ไฟล์ที่ได้ต้องตรงกับที่เห็นเสมอ สลับโหมดหรือขอบเขตต้องไม่เขียนกรอบทับเงียบ ๆ
   ② เลิกทำได้แม้โฟกัสหลุดไปที่ body และห้ามเลิกทำตอนอยู่หน้าผลลัพธ์ ระหว่างบันทึก หรือระหว่างหาขอบ
   ③ ตัดขอบขาวต้องไม่ตัดเนื้อหาจริง (เส้นบาง เลขหน้า ตัวอักษรสีเทาอ่อน) แต่ตัดฝุ่นของไฟล์สแกนทิ้ง
      กรอบเดียวใช้หลายหน้า = รวมกล่องของทุกหน้าในขอบเขต กดหยุด = กรอบเดิม
   ④ แถบบนเป็นแถวเดียวทุกจอ ปุ่มที่ล้นไปอยู่แผงลอย อีก N ปุ่ม ที่ไม่ดันหน้ากระดาษ

ค่าที่คาดคิดจากเรขาคณิตของไฟล์ทดสอบ ไม่ใช่คิดในหัว
  เนื้อหาจริงของหน้า (ink box) วัดจากภาพที่ PyMuPDF วาด ไม่ใช่สูตรที่เขียนเอง
  ระยะเผื่อขอบ = max(1.5% ของด้านสั้น, 2.5 พิกเซลที่สเกลวิเคราะห์) ตามแผน (src/trimbox.js)
ข้อประชากรไม่ว่าง: ไฟล์ทดสอบต้องมีเนื้อหาจริงตามที่ตั้งใจ (selftest) และแผงพับต้องมีปุ่มจริงก่อนนับ

รัน: tests/run.sh browser_crop_tools (ที่อยู่เว็บมาจาก FK_BASE ผ่าน browser_crop_edit.BASE ที่ open_tool ใช้)
"""
import io
import math
import re
import sys

import fitz
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

import browser_crop_edit as base
from browser_crop_edit import (A4, FIX, DL, MM, BANNED, THAI, COLORS, ck, near, make_pdf, make_rotated, raw_boxes,
                               is_cropped, colors_in, color_name, shown_size, open_tool, frame, same_frame,
                               fmt, at, mdrag, tbtn, has, click_if, handle, hcenter, zoom_pct, geo,
                               status_text, save, scenario, touch, two_finger)

SELFTEST = "--selftest" in sys.argv


# ── ไฟล์ทดสอบ ────────────────────────────────────────────────────────────
def make_faint(path):
    """หน้าเอกสารที่มีของบางและจางชิดขอบ (รอบตรวจแย้ง A1 ถึง A3): เนื้อความ 20 บรรทัด,
    เส้นบาง 0.25 พอยต์สีเทาเกือบเต็มความกว้าง, เลขหน้า 9 พอยต์, คำท้ายหน้า 7 พอยต์สีเทาอ่อน"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    for i in range(20):
        p.insert_text((72, 120 + 16.5 * i), f"Body line {i:02d} of the faint content test page", fontsize=11)
    p.draw_line((60, 40), (535, 40), color=(0.73, 0.73, 0.73), width=0.25)
    p.insert_text((294, 805), "1", fontsize=9)
    p.insert_text((250, 815), "Confidential", fontsize=7, color=(0.78, 0.78, 0.78))
    d.save(str(path)); d.close()
    return path


def make_union(path):
    """3 หน้า: หน้า 1 กล่องแดงซ้ายบน, หน้า 2 กล่องน้ำเงินขวาล่าง, หน้า 3 ว่าง"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    p.draw_rect(fitz.Rect(60, 80, 260, 300), color=(1, 0, 0), fill=(1, 0, 0))
    p = d.new_page(width=A4[0], height=A4[1])
    p.draw_rect(fitz.Rect(330, 520, 540, 780), color=(0, 0, 1), fill=(0, 0, 1))
    d.new_page(width=A4[0], height=A4[1])
    d.save(str(path)); d.close()
    return path


def make_dark(path):
    """สไลด์พื้นน้ำเงินเข้มเต็มหน้า ตัวหนังสือขาว ขอบไม่ใช่สีขาว ตัดอัตโนมัติไม่ได้"""
    d = fitz.open()
    p = d.new_page(width=960, height=540)
    p.draw_rect(p.rect, color=(0.12, 0.16, 0.27), fill=(0.12, 0.16, 0.27))
    p.insert_text((200, 300), "Dark slide title", fontsize=40, color=(1, 1, 1))
    d.save(str(path)); d.close()
    return path


def make_edges(path):
    """เส้นดำล้อมรอบชิดขอบกระดาษ เนื้อหาถึงขอบทุกด้าน ไม่มีขอบขาวให้ตัด"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    p.draw_rect(fitz.Rect(1, 1, A4[0] - 1, A4[1] - 1), color=(0, 0, 0), width=2)
    p.insert_text((200, 400), "EDGE-MARK", fontsize=22)
    d.save(str(path)); d.close()
    return path


def make_rotrect(path, deg):
    """มีแค่กล่องแดงที่ fitz (40,60)-(200,140) แล้วหมุนหน้า"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    p.draw_rect(fitz.Rect(40, 60, 200, 140), color=(1, 0, 0), fill=(1, 0, 0))
    p.set_rotation(deg)
    d.save(str(path)); d.close()
    return path


def make_annot(path):
    """เนื้อความกลางหน้า กับตรายาง APPROVED เป็น annotation มุมขวาล่าง (ผู้ใช้เห็นบนจอ ต้องไม่ถูกตัด)"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    for i in range(20):
        p.insert_text((72, 120 + 16.5 * i), f"Body line {i:02d} with an approval stamp", fontsize=11)
    a = p.add_freetext_annot(fitz.Rect(430, 770, 560, 805), "APPROVED", fontsize=14)
    a.update()
    d.save(str(path)); d.close()
    return path


def make_empty(path, n=1):
    """ไฟล์ที่ทุกหน้าว่างจริง (make_blank ของชุดหลักมีคำ BLANK-MARK อยู่ ไม่ว่างจริง)"""
    d = fitz.open()
    for _ in range(n):
        d.new_page(width=A4[0], height=A4[1])
    d.save(str(path)); d.close()
    return path


def make_dark_mid(path):
    """3 หน้า: หน้า 1 กับ 3 เนื้อความบนกระดาษขาว หน้า 2 พื้นน้ำเงินเข้มเต็มหน้า (ขอบไม่ขาว หาขอบไม่ได้) รอบรีวิว T2"""
    d = fitz.open()
    for k in range(3):
        p = d.new_page(width=A4[0], height=A4[1])
        if k == 1:
            p.draw_rect(p.rect, color=(0.12, 0.16, 0.27), fill=(0.12, 0.16, 0.27))
            p.insert_text((150, 400), "Dark page", fontsize=30, color=(1, 1, 1))
        else:
            for i in range(10):
                p.insert_text((120, 200 + 18 * i), f"Body line {i:02d} on page {k + 1}", fontsize=12)
    d.save(str(path)); d.close()
    return path


BIG = base.A1
BIG_DIGIT = (BIG[0] / 2, BIG[1] - 120)      # จุดเริ่มเส้นฐานของเลขหน้าโดดเดี่ยว 12 พอยต์


def big_page(digit=True, body=True):
    """หน้า A1 สะอาด: เนื้อความกลางหน้า กับเลขหน้า 12 พอยต์ตัวเดียวเหนือขอบล่าง 120 พอยต์ (รอบรีวิว T1)"""
    d = fitz.open()
    p = d.new_page(width=BIG[0], height=BIG[1])
    if body:
        x0, y0 = BIG[0] * 0.2, BIG[1] * 0.3
        for i in range(int(BIG[1] * 0.4 / 16.5)):
            p.insert_text((x0, y0 + 16.5 * i), f"Scanned body line {i:02d} lorem ipsum dolor sit amet consectetur", fontsize=11)
    if digit:
        p.insert_text(BIG_DIGIT, "7", fontsize=12)
    return d


def make_big_scan(path, dpi=100):
    """สแกนจำลองขนาด A1 แบบเดียวกับ make_scan (กระดาษนวล สัญญาณรบกวน JPEG) ทำทีละแถบกันหน่วยความจำบวม
    ‼️ รอบรีวิว T1: ภาพที่ใช้หาขอบเดิมคงที่ 0.5 ล้านพิกเซล หน้า A1 ได้ราว 1 พิกเซลต่อมม. ฝุ่นจึงกว้างถึง 4 มม.
       เลขหน้า 12 พอยต์ที่อยู่โดดเดี่ยวถูกนับเป็นฝุ่นแล้วตัดทิ้ง"""
    rng = np.random.default_rng(7)
    t = big_page()
    pm = t[0].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    g = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width)
    t.close()
    h, w = g.shape
    img = np.empty((h, w, 3), np.uint8)
    for y in range(0, h, 512):
        ink = 1 - g[y:y + 512].astype(np.float32) / 255.0
        blk = np.empty((ink.shape[0], w, 3), np.float32)
        blk[:] = (236, 229, 210)
        blk += rng.normal(0, 4, blk.shape).astype(np.float32)
        img[y:y + 512] = np.clip(blk * (1 - ink[..., None]) + 30 * ink[..., None], 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, "JPEG", quality=75)
    d = fitz.open()
    p = d.new_page(width=BIG[0], height=BIG[1])
    p.insert_image(p.rect, stream=buf.getvalue())
    d.save(str(path)); d.close()
    return path


QUAD = {"red": (0, 0, 0.5, 0.5), "green": (0.5, 0, 1, 0.5), "blue": (0, 0.5, 0.5, 1), "black": (0.5, 0.5, 1, 1)}


def make_null_leaf(path, kind):
    """หน้า A4 สี่สีสี่มุม ค่าที่สืบทอดอยู่ที่ /Pages และใบหน้าเขียน null ทับไว้ตรง ๆ (รอบรีวิว S5)
    kind rot: /Pages /Rotate 90 ใบหน้า /Rotate null (pdf.js หยุดที่ null แสดงหน้าตั้งไม่หมุน)
    kind crop: /Pages /CropBox [30 40 560 800] ใบหน้า /CropBox null (pdf.js ใช้ MediaBox)"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    for name, (a, b2, c, e) in QUAD.items():
        p.draw_rect(fitz.Rect(a * A4[0], b2 * A4[1], c * A4[0], e * A4[1]), color=COLORS[name], fill=COLORS[name])
    px = int(d.xref_get_key(d.pdf_catalog(), "Pages")[1].split()[0])
    if kind == "rot":
        d.xref_set_key(px, "Rotate", "90")
        d.xref_set_key(d[0].xref, "Rotate", "null")
    else:
        d.xref_set_key(px, "CropBox", "[30 40 560 800]")
        d.xref_set_key(d[0].xref, "CropBox", "null")
    d.save(str(path), garbage=0, deflate=False)
    d.close()
    return path


def raw_keys(path):
    """คีย์ /Rotate และ /CropBox ที่เขียนอยู่ในไฟล์จริง (ไว้ยืนยันว่าไฟล์ทดสอบมี null ตรง ๆ ไม่ใช่ถูกลบทิ้ง)"""
    return [m.group(0).decode() for m in re.finditer(rb"/(Rotate|CropBox)\s*(null|\d+|\[[^\]]*\])", path.read_bytes())]


SPECKS_MM = [(12, 12), (198, 14), (10, 285), (200, 280), (105, 292)]


def scan_text_page():
    """หน้าข้อความสะอาดที่ใช้ทำไฟล์สแกน (เก็บไว้วัด ink box จริงของเนื้อหา)"""
    t = fitz.open()
    tp = t.new_page(width=A4[0], height=A4[1])
    for i in range(20):
        tp.insert_text((180, 200 + 16.5 * i), f"Scanned body line {i:02d} lorem ipsum", fontsize=11)
    tp.insert_text((294, 805), "1", fontsize=9)
    return t


def make_scan(path, specks=True, paper=(236, 229, 210)):
    """ไฟล์สแกนจำลอง 150 dpi: กระดาษสีนวล สัญญาณรบกวน JPEG ฝุ่น 0.5 มม. 5 จุดตามขอบ และเลขหน้า 9 พอยต์"""
    rng = np.random.default_rng(7)
    W, H = 1240, 1754
    img = np.empty((H, W, 3), np.float32)
    img[:] = paper
    img += rng.normal(0, 4, img.shape)
    t = scan_text_page()
    pm = t[0].get_pixmap(dpi=150, colorspace=fitz.csGRAY)
    g = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width).astype(np.float32) / 255.0
    t.close()
    ink = 1 - g[:H, :W]
    img = img * (1 - ink[..., None]) + 30 * ink[..., None]
    if specks:
        k = 150 / 25.4
        for x, y in SPECKS_MM:
            cx, cy, r = int(x * k), int(y * k), max(1, int(0.25 * k))
            img[cy - r:cy + r + 1, cx - r:cx + r + 1] = 40
    img = np.clip(img, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, "JPEG", quality=75)
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    p.insert_image(p.rect, stream=buf.getvalue())
    d.save(str(path)); d.close()
    return path


def ink_box(src, page=0, dpi=144, thr=250):
    """กรอบเนื้อหาจริงที่ตาเห็น เป็นพอยต์นับจากมุมซ้ายบนของหน้าที่แสดง (คิดการหมุนแล้ว)"""
    d = src if isinstance(src, fitz.Document) else fitz.open(str(src))
    pix = d[page].get_pixmap(dpi=dpi)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    ys, xs = np.nonzero((a < thr).any(axis=2))
    if d is not src:
        d.close()
    if not len(xs):
        return None
    s = 72 / dpi
    return [xs.min() * s, ys.min() * s, (xs.max() + 1) * s, (ys.max() + 1) * s]


def shown_crop(path, page=0, H=A4[1]):
    """กรอบที่บันทึกในไฟล์ เป็นพอยต์นับจากมุมซ้ายบน (หน้าที่ไม่หมุน)"""
    c = raw_boxes(path)[page][0]
    return None if c is None else [c[0], H - c[3], c[2], H - c[1]]


def pad_pt(W, H):
    s = min(2, math.sqrt(500000 / (W * H)), 8192 / max(W, H))
    return max(0.015 * min(W, H), 2.5 / s)


def contains(outer, inner, tol):
    return (outer is not None and inner is not None and outer[0] <= inner[0] + tol and outer[1] <= inner[1] + tol
            and outer[2] >= inner[2] - tol and outer[3] >= inner[3] - tol)


def tight(outer, inner, W, H, slack=4.0):
    """ทุกด้านของกรอบห่างจากเนื้อหาไม่เกินระยะเผื่อ + slack
    ด้านที่ชิดขอบกระดาษนับว่าแน่นได้ก็ต่อเมื่อเนื้อหาด้านนั้นอยู่ใกล้ขอบพอจะถูกดูดเข้าขอบจริง
    (‼️ selftest จับได้ 02/10/2026: รุ่นแรกยอมทุกด้านที่ชิดขอบ กรอบเต็มหน้าจึงผ่านว่า แน่น)"""
    p = pad_pt(W, H) + slack
    s = min(2, math.sqrt(500000 / (W * H)), 8192 / max(W, H))
    if outer is None or inner is None:
        return False
    snap = lambda side: p + max(0.01 * side, 3 / s)
    return ((outer[0] >= inner[0] - p or (outer[0] <= 0.5 and inner[0] <= snap(W)))
            and (outer[1] >= inner[1] - p or (outer[1] <= 0.5 and inner[1] <= snap(H)))
            and (outer[2] <= inner[2] + p or (outer[2] >= W - 0.5 and inner[2] >= W - snap(W)))
            and (outer[3] <= inner[3] + p or (outer[3] >= H - 0.5 and inner[3] >= H - snap(H))))


# ── ตัวช่วยของเฟส 3 ──────────────────────────────────────────────────────
def save(pg, path):
    """เหมือน browser_crop_edit.save แต่หาปุ่มดาวน์โหลดบนสุดของผืนงานด้วย
    ‼️ หลังกด กลับไปแก้ เปลือกหน้าไม่สลับไปหน้าผลลัพธ์อีก (เป็นแบบนี้ทั้งเว็บ ดูคอมเมนต์ใน pdf-crop.js)
       บันทึกรอบสองจึงได้แถวผลบนสุดของผืนงาน ตัวช่วยเดิมหาเฉพาะแผงผลลัพธ์ รอบแรกของเฟส 3 จึงรอจนหมดเวลา 2 ฉาก"""
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    if not ck("ปุ่ม ครอบตัดแล้วบันทึก กดได้", has(cta) and cta.first.is_enabled()):
        return None
    cta.first.click()
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible, .cr-wrap .results button:visible").filter(has_text="ดาวน์โหลด")
    loc.first.wait_for(state="visible", timeout=30000)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def info(pg):
    return status_text(pg)


def foot(pg):
    return pg.evaluate("() => (document.querySelector('.s2-side .status.show') || {}).textContent || ''")


def wait_job(pg, timeout=60000):
    """รองานหาขอบหรือบันทึกให้จบ (ปุ่มหยุดหาย) แล้วคืนข้อความสถานะ"""
    pg.wait_for_function("() => { const s = document.querySelector('button.btn-cancel'); return !s || s.hidden; }", timeout=timeout)
    pg.wait_for_timeout(250)
    return foot(pg)


def trim_btn(pg, which="main"):
    sel = ".cr-trim" if which == "main" else ".cr-trim-page" if which == "page" else ".cr-trim-quick"
    return pg.locator(sel)


def side_open(pg):
    """จอแคบแผงขวาเป็นแผ่นล่าง ต้องกด ตัวเลือก ก่อน"""
    b = pg.locator(".s2-sheetbtn")
    if has(b) and b.first.is_visible() and b.first.get_attribute("aria-expanded") != "true":
        b.first.click()
        pg.wait_for_timeout(250)


def set_mode(pg, each):
    """สลับโหมดกรอบ คืน True เมื่อสลับได้จริง
    ‼️ บันทึกความผิดพลาด ขั้นเตรียมสภาพไม่ยืนยันว่าไปถึงสภาพนั้นจริง (02/10/2026 ภาพ 10 ติดชื่อผิดเพราะตัวนี้คืน False เงียบ ๆ)
       ตอนนี้ตรวจตัวเองด้วย ck ทั้งตอนหาป้ายไม่เจอและตอนกดแล้วโหมดไม่เปลี่ยน ผู้เรียกที่ลืมเช็คค่าคืนก็ยังเห็นแดง"""
    name = "แยกทีละหน้า" if each else "กรอบเดียว"
    lab = pg.locator(".cr-mode label").filter(has_text=name)
    if not ck(f"มีตัวเลือกโหมด {name}", has(lab)):
        return False
    lab.first.click()
    pg.wait_for_timeout(250)
    return ck(f"สลับเป็นโหมด {name} ได้จริง", each_on(pg) == each, f"โหมดแยก {each_on(pg)}")


def blur(pg):
    pg.evaluate("() => { const a = document.activeElement; if (a && a !== document.body) a.blur(); }")


def page_no(pg):
    pin = pg.locator(".cr-pgin")
    return pin.first.input_value() if has(pin) else ""


def go_page(pg, n):
    pin = pg.locator(".cr-pgin")
    pin.first.fill(str(n))
    pin.first.press("Enter")
    pg.wait_for_timeout(600)


def back_to_edit(pg):
    b = pg.locator(".s2-res-row button").filter(has_text="กลับไปแก้")
    if has(b) and b.first.is_visible():
        b.first.click()
        pg.wait_for_timeout(400)


def stage_colors(pg):
    """สีที่เห็นในเวทีจากภาพหน้าจอจริง (นับเฉพาะสีที่มีอย่างน้อย 0.5% ของพื้นที่)"""
    b = pg.locator(".cr-stage").bounding_box()
    png = pg.screenshot(clip={"x": b["x"] + 1, "y": b["y"] + 1, "width": b["width"] - 2, "height": b["height"] - 2})
    im = Image.open(io.BytesIO(png)).convert("RGB")
    seen = {}
    for y in range(0, im.height, 3):
        for x in range(0, im.width, 3):
            n = color_name(im.getpixel((x, y)))
            seen[n] = seen.get(n, 0) + 1
    tot = sum(seen.values()) or 1
    return {k for k, v in seen.items() if v / tot >= 0.005}


# ── ตัวช่วยของรอบรีวิวหลังทำ ─────────────────────────────────────────────────
ACT_JS = """() => { const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return 'BODY';
  if (a.classList.contains('cr-keep')) return 'กรอบ';
  if (a.classList.contains('cr-more')) return 'อีก N ปุ่ม';
  if (a.id === 'toolmenu') return 'ปุ่มเมนูเครื่องมือ';
  if (a.classList.contains('s2-mi')) return 'ในเมนูเครื่องมือ';
  if (a.classList.contains('s2-sheetbtn')) return 'ตัวเลือก';
  if (a.classList.contains('cr-pgin')) return 'ช่องเลขหน้า';
  if (a.dataset && a.dataset.edge) return 'ช่อง มม. ' + a.dataset.edge;
  return (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 30); }"""

OVERLAY_JS = """() => { const m = document.querySelector('.s2-tbar .cr-more');
  return { menu: !document.getElementById('toolmenupanel').hidden, fold: m ? m.getAttribute('aria-expanded') : null,
           sheet: !!document.querySelector('.s2-side.open'), tool: location.hash.includes('pdf-crop') }; }"""


def focus_on(pg):
    """ของที่มีโฟกัสตอนนี้ เป็นคำสั้น ๆ (BODY = โฟกัสหลุดไปทั้งหน้า)"""
    return pg.evaluate(ACT_JS)


def seen(note):
    """พิมพ์ค่าจริงที่เห็นไว้ในบันทึก ข้อที่ผ่านก็ต้องดูได้ว่าผ่านด้วยค่าอะไร (ค่าคาดต้องมาจากของจริง)"""
    print(f"      เห็น: {note}")


def each_on(pg):
    return pg.evaluate("() => !!document.querySelector('.cr-mode input[value=\"each\"]:checked')")


def cut_pages(path):
    """เลขหน้าที่ถูกตัดจริงในไฟล์ (นับจาก 1)"""
    return [i + 1 for i, (c, m) in enumerate(raw_boxes(path)) if is_cropped(c, m)]


def set_scope(pg, v):
    pg.locator(".cr-scope select, .s2-side-bd select").first.select_option(v)
    pg.wait_for_timeout(200)


def mm_vals(pg):
    return pg.evaluate("() => Object.fromEntries([...document.querySelectorAll('.cr-mm input')].map(i => [i.dataset.edge, i.value]))")


def tight_on(pg):
    return pg.evaluate("() => !!document.querySelector('.s2-tbar.cr-tight, .s2-tbar .cr-tight')")


# ── ⑰ เลิกทำ ทำซ้ำ ──────────────────────────────────────────────────────
def sc_undo(pg, a4, other):
    open_tool(pg, a4)
    mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.5, 0.5))
    f0 = frame(pg)
    mdrag(pg, *at(pg, 0.55, 0.6), *at(pg, 0.9, 0.9))
    f1 = frame(pg)
    ck("วาดกรอบที่สองนอกกรอบแรก ได้กรอบใหม่", same_frame(f1, [0.55, 0.6, 0.35, 0.3], 0.01), fmt(f1))
    undo, redo = tbtn(pg, "เลิกทำ"), tbtn(pg, "ทำซ้ำ")
    if not ck("แถบบนมีปุ่ม เลิกทำ และ ทำซ้ำ", has(undo) and has(redo)):
        return
    # ‼️ รอบตรวจแย้ง AK-01: คลิกพื้นเทาหรือกดปุ่มบน Safari แล้วโฟกัสอยู่ที่ body ตัวรับที่ผูกกับเครื่องมือไม่ได้ยิน
    blur(pg)
    ck("ก่อนกด Ctrl+Z โฟกัสอยู่ที่ body จริง", pg.evaluate("() => document.activeElement === document.body"))
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(150)
    fz = frame(pg)
    ck("Ctrl+Z ตอนโฟกัสอยู่ที่ body ย้อนกลับเป็นกรอบแรก", same_frame(fz, f0, 0.004), f"{fmt(f1)} -> {fmt(fz)}")
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(150)
    ck("Ctrl+Shift+Z ทำซ้ำกลับเป็นกรอบที่สอง", same_frame(frame(pg), f1, 0.004), fmt(frame(pg)))
    # ลูกศรรัว ๆ แล้วกด Ctrl+Z ทันที ต้องย้อนทั้งชุดในก้าวเดียว (AK-11, S6)
    pg.locator(".cr-keep").first.focus()
    fa = frame(pg)
    for _ in range(5):
        pg.keyboard.press("ArrowLeft")
    fb = frame(pg)
    moved = (fa[0] - fb[0]) * A4[0] if fa and fb else None
    ck("ลูกศรซ้าย 5 ครั้ง กรอบขยับ 5 พอยต์", near(moved, 5, 0.35), f"{moved}")
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(120)
    ck("Ctrl+Z ทันทีหลังกดลูกศรรัว ย้อนทั้ง 5 ก้าวในทีเดียว", same_frame(frame(pg), fa, 0.0012), f"{fmt(fa)} ได้ {fmt(frame(pg))}")
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(120)
    ck("ทำซ้ำกลับมาครบ 5 พอยต์", same_frame(frame(pg), fb, 0.0012), fmt(frame(pg)))
    pg.wait_for_timeout(700)
    # คลิกในกรอบโดยไม่ขยับ = ไม่มีก้าวใหม่ (S6 AK-10) Ctrl+Z ครั้งเดียวต้องย้อนก้าวจริงก่อนหน้า
    cx, cy = at(pg, fb[0] + fb[2] / 2, fb[1] + fb[3] / 2)
    pg.mouse.click(cx, cy)
    x0, y0 = at(pg, 0.3, 0.05)
    mdrag(pg, x0, y0, x0 + 3, y0 + 2, steps=2)          # ลากสั้นกว่า 2% นอกกรอบ กรอบเดิมกลับมา
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(150)
    ck("คลิกโดยไม่ขยับและลากพลาดสั้น ๆ ไม่นับเป็นก้าว Ctrl+Z ครั้งเดียวย้อนก้าวลูกศร", same_frame(frame(pg), fa, 0.0012),
       f"ได้ {fmt(frame(pg))} ควรได้ {fmt(fa)}")
    # ล้างกรอบแล้วเลิกทำได้
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("Delete")
    pg.wait_for_timeout(150)
    ck("กด Delete กรอบหาย", frame(pg) is None)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(150)
    ck("ล้างกรอบแล้ว Ctrl+Z ได้กรอบคืน", same_frame(frame(pg), fa, 0.0012), fmt(frame(pg)))
    # กดปุ่ม เลิกทำ จนสุด โฟกัสต้องไปที่ ทำซ้ำ ไม่หลุดไป body (AK-03)
    undo = tbtn(pg, "เลิกทำ")
    undo.first.focus()
    for _ in range(12):
        if not undo.first.is_enabled():
            break
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(80)
    act = pg.evaluate("() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.tagName) : null; }")
    ck("กด เลิกทำ จนปุ่มปิด โฟกัสย้ายไปปุ่ม ทำซ้ำ", act == "ทำซ้ำ", str(act))
    ck("ย้อนจนสุดแล้วไม่มีกรอบ (ก่อนวาดครั้งแรก)", frame(pg) is None, fmt(frame(pg)))
    # ช่อง มม. หนึ่งรอบโฟกัส = หนึ่งก้าว แม้พิมพ์ช้า (S6, AK-11)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    fp = frame(pg)
    top = pg.locator('input[data-edge="top"]')
    t0 = top.first.input_value()
    top.first.click()
    top.first.fill("")
    top.first.type("1")
    pg.wait_for_timeout(700)
    top.first.type("5")
    pg.keyboard.press("Tab")
    pg.wait_for_timeout(150)
    ck("พิมพ์ 15 มม. ที่ขอบบน กรอบขยับตาม", near(float(top.first.input_value() or "nan"), 15.0, 0.051), top.first.input_value())
    f15 = frame(pg)
    # ‼️ วัดจริง 02/10/2026 (probe mm_undo.py): Chrome ใช้ประวัติการพิมพ์ร่วมกันทั้งหน้า Ctrl+Z ในช่องอื่น
    #    ไปย้อนช่องบนจาก 15 เป็น 1 แล้วย้ายโฟกัสไปช่องบนเอง รุ่นแรกของเทสนี้คาดว่า "ไม่มีอะไรเกิดขึ้น" ซึ่งเดาผิด
    #    ① ‼️ รีวิวหลังทำ F7: ช่องเลขหน้าเดิมปล่อยให้ Chrome ย้อนเอง ประวัติร่วมทั้งหน้าพาโฟกัสกระโดดไปช่อง มม.
    #       แล้วไม่มีอะไรถูกย้อน (รุ่นก่อนของข้อนี้ตรวจแค่ว่า มม. ไม่เปลี่ยน จึงไม่เห็นโฟกัสที่หาย)
    #       ตอนนี้ช่องเลขหน้าใช้ประวัติของเครื่องมือเหมือนช่อง มม. ย้อนรอบที่พิมพ์ 15 มม. ทั้งรอบ โฟกัสอยู่ที่เดิม
    pin = pg.locator(".cr-pgin")
    pin.first.focus()
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(200)
    a = focus_on(pg)
    seen(f"ขอบบน {top.first.input_value()!r} กรอบ {fmt(frame(pg))} โฟกัส {a} เลขหน้า {pin.first.input_value()!r}")
    ck(f"Ctrl+Z ในช่องเลขหน้า ย้อนรอบที่พิมพ์ ขอบบนกลับเป็น {t0} ทั้งช่องและกรอบ และโฟกัสยังอยู่ที่ช่องเลขหน้า",
       top.first.input_value() == t0 and same_frame(frame(pg), fp, 0.0005) and a == "ช่องเลขหน้า",
       f"ขอบบน {top.first.input_value()!r} กรอบ {fmt(frame(pg))} โฟกัส {a}")
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(200)
    ck("Ctrl+Shift+Z ในช่องเลขหน้า ทำซ้ำกลับเป็น 15 มม. เลขหน้ายังเป็น 1",
       top.first.input_value() == "15" and same_frame(frame(pg), f15, 0.0005) and pin.first.input_value() == "1",
       f"ขอบบน {top.first.input_value()!r} เลขหน้า {pin.first.input_value()!r}")
    #    ② ในช่อง มม. Ctrl+Z ใช้ประวัติของเครื่องมือ ย้อนทั้งรอบที่พิมพ์ในก้าวเดียว ไม่ใช่ทีละตัวเลข
    bottom = pg.locator('input[data-edge="bottom"]')
    bottom.first.focus()
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(200)
    ck(f"Ctrl+Z ในช่อง มม. ย้อนทั้งรอบที่พิมพ์ ขอบบนกลับเป็น {t0} ทั้งช่องและกรอบ (ไม่ใช่ 1 มม. ครึ่งทาง)",
       top.first.input_value() == t0 and same_frame(frame(pg), fp, 0.0005), f"ขอบบน {top.first.input_value()!r} กรอบ {fmt(frame(pg))}")
    act = pg.evaluate("() => (document.activeElement && document.activeElement.dataset || {}).edge || ''")
    ck("Ctrl+Z ในช่อง มม. โฟกัสยังอยู่ที่ช่องเดิม (ไม่กระโดดไปช่องบนแบบ Chrome)", act == "bottom", act)
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(200)
    ck("Ctrl+Shift+Z ในช่อง มม. ทำซ้ำกลับเป็น 15 มม.", top.first.input_value() == "15", top.first.input_value())
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(150)
    ck(f"ออกจากช่องแล้ว Ctrl+Z ครั้งเดียวคืนขอบบนเป็นค่าก่อนพิมพ์ ({t0} มม.)", top.first.input_value() == t0,
       f"ได้ {top.first.input_value()!r}")
    # ‼️ แป้นไทย: Ctrl กับปุ่ม Z ส่ง key เป็น ผ (S7, AK-11) ต้องดูจาก code ด้วย
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(120)
    tv0 = top.first.input_value()
    blur(pg)
    pg.evaluate("""() => document.body.dispatchEvent(new KeyboardEvent('keydown',
        {key: 'ผ', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true}))""")
    pg.wait_for_timeout(150)
    # ‼️ วัดจากค่าในช่อง ไม่ใช่กรอบ (รอบสองของเทสตกเพราะ 15 กับ 14.9 มม. ต่างกันแค่ 0.0005 ของความสูงหน้า เท่าค่าที่ยอมพอดี)
    ck("แป้นภาษาไทย Ctrl กับปุ่ม Z (ตัว ผ) ก็เลิกทำได้", tv0 == "15" and top.first.input_value() == t0,
       f"ขอบบน {tv0} -> {top.first.input_value()} ควรเป็น {t0}")
    free = pg.evaluate("""() => document.body.dispatchEvent(new KeyboardEvent('keydown',
        {key: 'y', code: 'KeyY', metaKey: true, bubbles: true, cancelable: true}))""")
    ck("Cmd+Y ไม่ถูกแย่ง (เป็นปุ่มประวัติของเบราว์เซอร์บน Mac)", free is True, str(free))
    # หน้าผลลัพธ์: Ctrl+Z ห้ามเปลี่ยนกรอบ ไฟล์ที่ดาวน์โหลดต้องตรงกับกรอบที่เห็น (S1, AK-02)
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(120)
    fs = frame(pg)
    out = save(pg, DL / "undo-result.pdf")
    if out:
        dl = pg.locator(".s2-side-res button, .s2-subrow button").filter(has_text="ดาวน์โหลด")
        if has(dl):
            dl.first.focus()
        pg.keyboard.press("Control+z")
        pg.wait_for_timeout(200)
        ck("หน้าผลลัพธ์ กด Ctrl+Z แล้วกรอบไม่เปลี่ยน", same_frame(frame(pg), fs, 0.0005), f"{fmt(fs)} -> {fmt(frame(pg))}")
        back_to_edit(pg)
        ck("กลับไปแก้แล้วกรอบยังเป็นกรอบที่บันทึก", same_frame(frame(pg), fs, 0.0005), fmt(frame(pg)))
        c = shown_crop(out)
        want = [fs[0] * A4[0], fs[1] * A4[1], (fs[0] + fs[2]) * A4[0], (fs[1] + fs[3]) * A4[1]] if fs else None
        ck("ไฟล์ที่ดาวน์โหลดตรงกับกรอบบนจอ", c is not None and want is not None and all(near(a, b, 1.5) for a, b in zip(c, want)),
           f"ไฟล์ {c} จอ {want}")
    # เปลี่ยนไฟล์ ล้างประวัติ
    open_tool(pg, other)
    u = tbtn(pg, "เลิกทำ")
    ck("เปิดไฟล์ใหม่ ปุ่มเลิกทำกดไม่ได้ (ประวัติไม่ข้ามไฟล์)", has(u) and not u.first.is_enabled())


# ── ⑱ แยกกรอบทีละหน้า ─────────────────────────────────────────────────
def sc_each(pg, a4):
    open_tool(pg, a4)
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    F = frame(pg)
    if not ck("มีตัวเลือก กรอบเดียว กับ แยกทีละหน้า", has(pg.locator('.cr-mode input[value="each"]'))
              and has(pg.locator('.cr-mode input[value="single"]'))):
        return
    set_mode(pg, True)
    ck("เข้าโหมดแยกทีละหน้า กรอบหน้า 1 เหมือนเดิม", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    ck("โหมดแยกทีละหน้าไม่มีช่อง ใช้กรอบนี้กับ ให้สับสน", not pg.locator(".cr-scope").first.is_visible())
    go_page(pg, 2)
    ck("หน้า 2 เริ่มจากกรอบเดิมที่มีอยู่", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    w = pg.locator(".cr-stage").bounding_box()["width"]
    x, y = hcenter(pg, "e")
    mdrag(pg, x, y, x - 0.3 * w, y)
    B = frame(pg)
    ck("หน้า 2 แก้กรอบของตัวเองได้", B is not None and near(B[2], F[2] - 0.3, 0.01), fmt(B))
    go_page(pg, 3)
    ck("ไปหน้า 3 กรอบยังเป็นกรอบเดิม ไม่ตามหน้า 2", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("Delete")
    pg.wait_for_timeout(200)
    ck("ล้างกรอบหน้า 3 แล้วบอกว่า หน้านี้ไม่ตัด", frame(pg) is None and "หน้านี้ไม่ตัด" in info(pg), info(pg)[:80])
    go_page(pg, 4)
    ck("หน้า 4 ที่ไม่ได้แตะยังตามกรอบเดิม", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    go_page(pg, 1)
    ck("กลับหน้า 1 กรอบเดิมไม่เปลี่ยน", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    summ = pg.evaluate("() => (document.querySelector('.cr-each-sum') || {}).textContent || ''")
    seen(summ)
    # ‼️ รีวิวหลังทำ K4: เดิม ตั้งแยก 2 หน้า ไม่ตัด 1 หน้า จากทั้งหมด 4 หน้า อ่านเหมือนตัด 1 หน้า ตอนนี้บอกหน้าที่ตัดก่อน
    ck("สรุปบอกจำนวนหน้าที่ตัด ไม่ตัด และตั้งแยก (หน้า 1 2 4 ตัด หน้า 3 ไม่ตัด ตั้งแยก หน้า 2 กับ 3)",
       "ตัด 3 หน้า ไม่ตัด 1 หน้า ตั้งแยกไว้ 2 หน้า" in summ, summ)
    out = save(pg, DL / "each.pdf")
    if out:
        bx = raw_boxes(out)
        want = lambda f: [f[0] * A4[0], (1 - f[1] - f[3]) * A4[1], (f[0] + f[2]) * A4[0], (1 - f[1]) * A4[1]]
        okp = [c is not None and all(near(a, b, 1.5) for a, b in zip(c, want(f))) for (c, _), f in
               zip([bx[0], bx[1], bx[3]], [F, B, F])]
        ck("ไฟล์จริง หน้า 1 กับ 4 ได้กรอบเดิม หน้า 2 ได้กรอบของตัวเอง", all(okp), str(bx))
        ck("ไฟล์จริง หน้า 3 ไม่ถูกตัด", not is_cropped(*bx[2]), str(bx[2]))
        back_to_edit(pg)
    # คัดลอกกรอบหน้า 2 ไปทุกหน้า
    go_page(pg, 2)
    cp = pg.locator(".cr-copy-all")
    if ck("มีปุ่ม คัดลอกกรอบนี้ไปทุกหน้า", has(cp)):
        cp.first.click()
        pg.wait_for_timeout(250)
        go_page(pg, 3)
        f3 = frame(pg)
        go_page(pg, 4)
        ck("คัดลอกไปทุกหน้าแล้ว หน้า 3 และ 4 ได้กรอบของหน้า 2", same_frame(f3, B, 0.002) and same_frame(frame(pg), B, 0.002),
           f"{fmt(f3)} {fmt(frame(pg))}")
    # ออกจากโหมดแยก กลับไปกรอบเดียว ต้องไม่เอากรอบของหน้าที่เห็นไปใช้ทุกหน้า (UX-01, S4)
    open_tool(pg, a4)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    F = frame(pg)
    set_mode(pg, True)
    go_page(pg, 2)
    x, y = hcenter(pg, "s")
    h = pg.locator(".cr-stage").bounding_box()["height"]
    mdrag(pg, x, y, x, y - 0.4 * h)
    S2 = frame(pg)
    set_mode(pg, False)
    ck("กลับเป็นกรอบเดียว หน้า 2 แสดงกรอบเดิมของทุกหน้า ไม่ใช่กรอบที่แก้แยก", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    dorm = pg.locator(".cr-dormant")
    ck("บอกว่ามีกรอบแยกเก็บไว้ ใช้เมื่อเลือกแยกทีละหน้า", has(dorm) and dorm.first.is_visible() and "1 หน้า" in dorm.first.inner_text(),
       dorm.first.inner_text() if has(dorm) else "")
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(250)
    each_on = pg.evaluate("() => { const r = document.querySelector('.cr-mode input[value=\"each\"]'); return !!r && r.checked; }")
    ck("Ctrl+Z กลับไปโหมดแยกทีละหน้าพร้อมกรอบของหน้า 2", each_on and same_frame(frame(pg), S2, 0.002), f"{each_on} {fmt(frame(pg))}")
    # สลับโหมดด้วยลูกศรไปมา (radio ยิง change ทุกครั้ง) ต้องไม่เขียนกรอบทับ
    pg.locator('.cr-mode input[value="each"]').first.focus()
    for k in ["ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"]:
        pg.keyboard.press(k)
        pg.wait_for_timeout(80)
    ck("กดลูกศรสลับโหมดไปมา กรอบหน้า 2 ยังเป็นกรอบที่แก้แยก", same_frame(frame(pg), S2, 0.002), fmt(frame(pg)))
    go_page(pg, 1)
    ck("และหน้า 1 ยังเป็นกรอบเดิม", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    # เลิกทำในโหมดแยก พาไปหน้าที่เปลี่ยน (UX-15e)
    go_page(pg, 3)
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("ArrowDown")
    pg.wait_for_timeout(700)
    go_page(pg, 1)
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(700)
    ck("เลิกทำการแก้หน้า 3 ขณะดูหน้า 1 แล้วพาไปหน้า 3", page_no(pg) == "3", page_no(pg))
    ck("แถบสถานะบอกหน้าที่ย้อน", "หน้า 3" in info(pg), info(pg)[:90])


# ── ⑱ข เข้าโหมดแยกจากหน้าคี่ ผลต้องเท่าเดิมทุกหน้า (UX-02) ────────────────
def sc_each_scope(pg, a4):
    open_tool(pg, a4)
    pg.locator(".cr-scope select, .s2-side-bd select").first.select_option("odd")
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    a = save(pg, DL / "scope-odd.pdf")
    back_to_edit(pg)
    if not set_mode(pg, True):
        ck("มีตัวเลือก แยกทีละหน้า", False)
        return
    go_page(pg, 2)
    ck("โหมดแยกทีละหน้า หน้าคู่ที่เดิมไม่ถูกตัด แสดงว่า หน้านี้ไม่ตัด", frame(pg) is None and "หน้านี้ไม่ตัด" in info(pg), info(pg)[:80])
    b = save(pg, DL / "scope-odd-each.pdf")
    if a and b:
        ra, rb = raw_boxes(a), raw_boxes(b)
        ck("เข้าโหมดแยกจากหน้าคี่ ไฟล์ที่ได้เหมือนเดิมทุกหน้า", ra == rb, f"{ra} != {rb}")


# ── ⑲ ดูผลหลังตัด ───────────────────────────────────────────────────────
def sc_preview(pg, corners, a4):
    open_tool(pg, corners)
    pv = tbtn(pg, "ดูผลหลังตัด")
    if not ck("มีปุ่ม ดูผลหลังตัด", has(pv)):
        return
    ck("ยังไม่มีกรอบ ปุ่มดูผลหลังตัดกดไม่ได้", not pv.first.is_enabled())
    mdrag(pg, *at(pg, 0.02, 0.02), *at(pg, 0.45, 0.45))
    f = frame(pg)
    g0 = geo(pg)
    pv.first.click()
    pg.wait_for_timeout(900)
    ck("กดแล้วปุ่มอยู่ในสถานะกดค้าง (aria-pressed)", pv.first.get_attribute("aria-pressed") == "true")
    hid = pg.evaluate("() => ['.cr-keep', '.cr-clip'].map(s => { const n = document.querySelector(s); return !n || !n.getClientRects().length; })")
    ck("ตอนดูผล ไม่มีกรอบ มือจับ หรือเงามืด", all(hid), str(hid))
    sb = pg.locator(".cr-stage").bounding_box()
    want = (f[2] * A4[0]) / (f[3] * A4[1]) if f else None
    ck("หน้าที่เห็นมีสัดส่วนเท่ากรอบที่ตัด", want and near(sb["width"] / sb["height"], want, want * 0.01),
       f"{sb['width']:.0f} x {sb['height']:.0f} ควรได้ {want}")
    cols = stage_colors(pg)
    ck("เห็นแค่มุมแดงที่อยู่ในกรอบ ไม่เห็นมุมอื่น", "red" in cols and not cols & {"green", "blue", "black"}, str(cols))
    z0 = zoom_pct(pg)
    click_if(pg, tbtn(pg, "ซูมเข้า"), "ซูมเข้า")
    pg.wait_for_timeout(900)
    cols = stage_colors(pg)
    ck("ซูมแล้ววาดใหม่ ยังเห็นแค่ส่วนในกรอบ", "red" in cols and not cols & {"green", "blue", "black"} and zoom_pct(pg) > z0, str(cols))
    sb = pg.locator(".cr-stage").bounding_box()
    mdrag(pg, sb["x"] + 20, sb["y"] + 20, sb["x"] + 120, sb["y"] + 90)
    esc_ok = True
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    esc_ok = "pdf-crop" in pg.evaluate("() => location.hash") and pv.first.get_attribute("aria-pressed") == "false"
    ck("กด Esc ออกจากดูผล ยังอยู่ในเครื่องมือ", esc_ok, pg.evaluate("() => location.hash"))
    ck("ลากบนหน้าตอนดูผล กรอบไม่เปลี่ยน", same_frame(frame(pg), f, 0.002), f"{fmt(f)} -> {fmt(frame(pg))}")
    g1 = geo(pg)
    ck("ออกจากดูผลแล้วกลับมาเห็นทั้งหน้าพอดีจอเหมือนเดิม", g1 and g1["scw"] <= g1["cw"] + 1 and g1["sch"] <= g1["ch"] + 1
       and near(g1["sw"], g0["sw"], 2), f"{g0 and g0['sw']} -> {g1 and g1['sw']}")
    pv.first.click()
    pg.wait_for_timeout(500)
    ex = pg.locator(".cr-pv-exit")
    if ck("ตอนดูผลมีลิงก์ แก้กรอบต่อ ในแถบสถานะ", has(ex) and ex.first.is_visible()):
        ex.first.click()
        pg.wait_for_timeout(400)
        ck("กด แก้กรอบต่อ แล้วกลับมาแก้กรอบได้", pv.first.get_attribute("aria-pressed") == "false" and frame(pg) is not None)
    # ‼️ กรอบมุมซ้ายบนข้างบนจับการวาดผิดตำแหน่งไม่ได้ (ลืมเลื่อน offset ของ viewport ก็ยังได้มุมซ้ายบนเหมือนกัน)
    #    กรอบมุมขวาล่างต้องเห็นแค่มุมดำ ถ้าวาดผิดตำแหน่งจะเห็นมุมแดงของซ้ายบนแทน
    mdrag(pg, *at(pg, 0.6, 0.6), *at(pg, 0.98, 0.98))
    pv.first.click()
    pg.wait_for_timeout(900)
    cols = stage_colors(pg)
    ck("กรอบมุมขวาล่าง ตอนดูผลเห็นแค่มุมดำ ไม่เห็นมุมแดงซ้ายบน (วาดเฉพาะส่วนตรงตำแหน่ง)",
       "black" in cols and not cols & {"red", "green", "blue"}, f"{cols} กรอบ {fmt(frame(pg))}")
    pv.first.click()
    pg.wait_for_timeout(300)
    # หน้าคู่ที่ไม่อยู่ในขอบเขต ต้องเห็นทั้งหน้าพร้อมบอกว่าไม่ถูกตัด
    open_tool(pg, a4)
    pg.locator(".cr-scope select, .s2-side-bd select").first.select_option("odd")
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    tbtn(pg, "ดูผลหลังตัด").first.click()
    pg.wait_for_timeout(700)
    go_page(pg, 2)
    sb = pg.locator(".cr-stage").bounding_box()
    ck("ดูผลหน้า 2 (หน้าคู่ไม่ถูกตัด) เห็นทั้งหน้าและบอกว่า หน้านี้ไม่ถูกตัด",
       near(sb["width"] / sb["height"], A4[0] / A4[1], 0.01) and "หน้านี้ไม่ถูกตัด" in info(pg), info(pg)[:80])
    tbtn(pg, "ดูผลหลังตัด").first.click()
    pg.wait_for_timeout(300)


# ── ⑲ข ดูผลบนมือถือ บีบนิ้วยังซูมได้ (ห้ามใช้ inert) ──────────────────────
def sc_preview_touch(b, a4, errs):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=3,
                        accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("ดูผลมือถือ: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        tbtn(pg, "วางกรอบ").first.tap()
        pg.wait_for_timeout(300)
        pv = tbtn(pg, "ดูผลหลังตัด")
        if not ck("มือถือ มีปุ่ม ดูผลหลังตัด", has(pv)):
            return
        pv.first.tap()
        pg.wait_for_timeout(800)
        pinned = pg.evaluate("""() => { const b = document.querySelector('.s2-tbar .cr-pv-btn');
          return !!b && !b.closest('.cr-fold') && b.getClientRects().length > 0 && b.getAttribute('aria-pressed') === 'true'; }""")
        ck("มือถือ ตอนดูผลอยู่ ปุ่มดูผลหลังตัดโผล่บนแถบเสมอ (ไม่พับเก็บ)", pinned)
        cdp = ctx.new_cdp_session(pg)
        z0 = zoom_pct(pg)
        cx, cy = at(pg, 0.5, 0.5)
        two_finger(pg, cdp, (cx - 30, cy), (cx + 30, cy), (cx - 90, cy), (cx + 90, cy))
        ck("มือถือ ตอนดูผล สองนิ้วยังซูมได้", z0 and zoom_pct(pg) and zoom_pct(pg) > z0 * 1.4, f"{z0} -> {zoom_pct(pg)}")
    finally:
        ctx.close()


# ── ⑳ ตัดขอบขาวอัตโนมัติ ───────────────────────────────────────────────
def press_trim(pg, which="main"):
    side_open(pg)
    b = trim_btn(pg, which)
    if not has(b) or not b.first.is_visible():
        return None
    b.first.click()
    return wait_job(pg)


def sc_trim(pg, fx, errs):
    W, H = A4
    # ① เนื้อหาบางและจาง ห้ามโดนตัด
    open_tool(pg, fx["faint"])
    q = trim_btn(pg, "quick")
    ck("ยังไม่มีกรอบ มีปุ่มตัดขอบขาวเล็ก ๆ ในแถบสถานะ (มือถือหาเจอโดยไม่ต้องเปิดแผง)", has(q) and q.first.is_visible())
    msg = press_trim(pg)
    if not ck("มีปุ่มตัดขอบขาวในแผงขวา และทำงานจบ", msg is not None, str(msg)):
        return
    fr = frame(pg)
    ck("ตัดขอบขาวแล้วได้กรอบ", fr is not None, f"{fmt(fr)} {msg[:80]}")
    out = save(pg, DL / "trim-faint.pdf")
    if out:
        c, ink = shown_crop(out), ink_box(fx["faint"])
        ck("ไม่ตัดเนื้อหาจริงเลย (เส้นบาง เลขหน้า คำสีเทาอ่อน อยู่ในกรอบครบ)", contains(c, ink, 0.6), f"กรอบ {c} เนื้อหา {ink}")
        ck("กรอบแน่นพอดีเนื้อหา (ห่างไม่เกินระยะเผื่อ)", tight(c, ink, W, H), f"กรอบ {c} เนื้อหา {ink} เผื่อ {pad_pt(W, H):.1f}")
        back_to_edit(pg)
    # เลิกทำหลังตัดขอบ
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(200)
    ck("ตัดขอบขาวแล้ว Ctrl+Z กรอบกลับเป็นเหมือนก่อนกด (ไม่มีกรอบ)", frame(pg) is None, fmt(frame(pg)))
    # ② หลายหน้า กรอบเดียว = รวมทุกหน้า และบอกหน้าว่าง
    open_tool(pg, fx["union"])
    msg = press_trim(pg) or ""
    seen(msg)
    # ‼️ รีวิวหลังทำ X5: ภาษาไทยไม่มีจุดคั่น ท่อนหน้าว่างที่ต่อท้าย เลิกทำ อ่านเป็น กด เลิกทำ หน้า 3 จึงย้ายมาไว้กลาง
    ck("หลายหน้า บอกว่าหน้า 3 ว่าง จึงไม่ได้นำมาคิด (บอกก่อนคำแนะนำ ไม่ต่อท้ายคำว่า เลิกทำ)",
       msg.startswith("ตัดขอบขาวให้แล้ว หน้าว่าง 3 ไม่นำมาคิด ปรับกรอบต่อได้"), msg[:120])
    out = save(pg, DL / "trim-union.pdf")
    if out:
        c = shown_crop(out)
        ok = contains(c, [60, 80, 260, 300], 0.6) and contains(c, [330, 520, 540, 780], 0.6)
        ck("กรอบเดียวคลุมกล่องแดงหน้า 1 และกล่องน้ำเงินหน้า 2 ครบ (ไม่ตัดหน้าไหน)", ok, str(c))
        ck("ทุกหน้าได้กรอบเดียวกัน", len({tuple(b[0] or []) for b in raw_boxes(out)}) == 1, str(raw_boxes(out)))
        back_to_edit(pg)
    pg.locator(".cr-scope select, .s2-side-bd select").first.select_option("odd")
    press_trim(pg)
    out = save(pg, DL / "trim-odd.pdf")
    if out:
        bx = raw_boxes(out)
        c1 = shown_crop(out, 0)
        ck("หน้าคี่ กรอบแน่นรอบกล่องแดงหน้า 1 (หน้า 3 ว่างไม่นับ)", contains(c1, [60, 80, 260, 300], 0.6) and tight(c1, [60, 80, 260, 300], W, H),
           str(c1))
        ck("หน้าคี่ หน้า 2 ไม่ถูกตัด", not is_cropped(*bx[1]), str(bx[1]))
        back_to_edit(pg)
    # ③ แยกทีละหน้า ทุกหน้าได้กรอบของตัวเอง หน้าว่างไม่ตัด
    open_tool(pg, fx["union"])
    if set_mode(pg, True):
        msg = press_trim(pg) or ""
        seen(msg)
        # ‼️ รีวิวหลังทำ X11: เดิมตรวจแค่ว่ามีตัวเลข หน้า ตัวกลายพันธุ์ที่นับทุกหน้าว่าตัดก็ผ่าน ตอนนี้ตรวจจำนวนตรง
        ck("แยกทีละหน้า บอกจำนวนตรงตัว ตัด 2 หน้า ไม่ตัด 1 หน้า และหน้า 3 ว่าง",
           msg.startswith("ตัดขอบขาวแล้ว 2 หน้า ไม่ตัด 1 หน้า") and "หน้าว่าง 3 ไม่นำมาคิด" in msg and "แทนกรอบเดิม" not in msg,
           msg[:120])
        out = save(pg, DL / "trim-each.pdf")
        if out:
            bx = raw_boxes(out)
            c1, c2 = shown_crop(out, 0), shown_crop(out, 1)
            ck("แยกทีละหน้า หน้า 1 แน่นรอบกล่องแดง", contains(c1, [60, 80, 260, 300], 0.6) and tight(c1, [60, 80, 260, 300], W, H), str(c1))
            ck("แยกทีละหน้า หน้า 2 แน่นรอบกล่องน้ำเงิน", contains(c2, [330, 520, 540, 780], 0.6) and tight(c2, [330, 520, 540, 780], W, H), str(c2))
            ck("แยกทีละหน้า หน้า 3 ที่ว่างไม่ถูกตัด", not is_cropped(*bx[2]), str(bx[2]))
            back_to_edit(pg)
    # ④ สไลด์พื้นเข้ม: ไม่ใช่ขอบขาว บอกเหตุผล กรอบไม่เปลี่ยน
    open_tool(pg, fx["dark"])
    msg = press_trim(pg) or ""
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    ck("สไลด์พื้นเข้ม บอกว่าขอบไม่ใช่สีขาว และไม่วางกรอบ", frame(pg) is None and "ขาว" in msg and not cta.first.is_enabled(), msg[:120])
    # ⑤ เนื้อหาถึงขอบทุกด้าน: ไม่มีขอบให้ตัด
    open_tool(pg, fx["edges"])
    msg = press_trim(pg) or ""
    ck("เนื้อหาถึงขอบทุกด้าน บอกว่าไม่พบขอบขาวให้ตัด และไม่วางกรอบ", frame(pg) is None and "ไม่พบขอบขาว" in msg, msg[:120])
    # ⑥ หน้าที่หมุน 90
    open_tool(pg, fx["rot90"])
    press_trim(pg)
    out = save(pg, DL / "trim-rot90.pdf")
    if out:
        sw, sh = shown_size(out)
        p = pad_pt(W, H)
        ck("หน้าหมุน 90 ตัดขอบขาวแล้วยังเห็นกล่องแดง", "red" in colors_in(out), str(colors_in(out)))
        ck("หน้าหมุน 90 ขนาดที่ได้เท่ากล่องแดงบวกระยะเผื่อ (กว้างสูงสลับกัน)",
           near(sw, 80 + 2 * p, 4) and near(sh, 160 + 2 * p, 4), f"ได้ {sw:.1f} x {sh:.1f} ควรได้ราว {80 + 2 * p:.1f} x {160 + 2 * p:.1f}")
        back_to_edit(pg)
    # ⑦ ไฟล์สแกน: ฝุ่นออก เลขหน้าอยู่
    open_tool(pg, fx["scan"])
    press_trim(pg)
    out = save(pg, DL / "trim-scan.pdf")
    if out:
        c = shown_crop(out)
        t = scan_text_page()
        ink = ink_box(t)
        t.close()
        k = 72 / 25.4
        outside = all(not (c[0] <= x * k <= c[2] and c[1] <= y * k <= c[3]) for x, y in SPECKS_MM) if c else False
        ck("ไฟล์สแกน ฝุ่น 5 จุดตามขอบอยู่นอกกรอบทั้งหมด", outside, str(c))
        ck("ไฟล์สแกน เนื้อความและเลขหน้า 9 พอยต์อยู่ในกรอบครบ", contains(c, ink, 1.5), f"กรอบ {c} เนื้อหา {ink}")
        back_to_edit(pg)
    # ⑧ ตรายาง annotation ที่เห็นบนจอต้องอยู่ในกรอบ
    # ‼️ วัดจริง 02/10/2026 (probe scan_probe.py): กล่องของ annotation (430,770 ถึง 560,805) มีที่ว่างที่มองไม่เห็นอยู่ด้วย
    #    ตัวอักษร APPROVED ที่เห็นจริงอยู่ที่ 430,770.5 ถึง 507.5,781.5 ทั้งใน PyMuPDF และภาพที่ pdf.js วาด
    #    รุ่นแรกของเทสคาดว่ากล่องทั้งกล่องต้องอยู่ในกรอบ ซึ่งเดาผิด ของที่ต้องอยู่คือหมึกที่เห็น
    open_tool(pg, fx["annot"])
    press_trim(pg)
    out = save(pg, DL / "trim-annot.pdf")
    if out:
        c = shown_crop(out)
        d = fitz.open(str(fx["annot"]))
        ann = list(d[0].annots())
        ink_all = ink_box(d)
        d.close()
        ck("ประชากร: ไฟล์ทดสอบมีตรายาง 1 อันและหมึกของมันอยู่ล่างกว่าเนื้อความ (y เกิน 770)", len(ann) == 1 and ink_all and ink_all[3] > 770,
           str(ink_all))
        ck("ตรายาง APPROVED (annotation) ที่เห็นอยู่ในกรอบครบ", contains(c, ink_all, 0.6), f"กรอบ {c} หมึก {ink_all}")
        back_to_edit(pg)
    # ⑨ กดหยุดกลางทาง = กรอบเดิม
    open_tool(pg, fx["big"])
    side_open(pg)
    tb = trim_btn(pg)
    if has(tb):
        tb.first.click()
        pg.wait_for_timeout(700)
        busy = pg.evaluate("""() => ({ stage: document.querySelector('.cr-stage').inert,
            undo: ([...document.querySelectorAll('.s2-tbar button')].find(b => b.getAttribute('aria-label') === 'เลิกทำ') || {}).disabled,
            cta: document.querySelector('button.s2-cta').disabled })""")
        ck("ระหว่างหาขอบ แก้กรอบ เลิกทำ และบันทึก ไม่ได้", busy["stage"] and busy["undo"] and busy["cta"], str(busy))
        stop = pg.locator("button.btn-cancel")
        if stop.count() and stop.first.is_visible():
            stop.first.click()
        msg = wait_job(pg)
        ck("กดหยุดกลางทาง กรอบเหมือนเดิม (ไม่มีกรอบ) และบอกว่าหยุดแล้ว", frame(pg) is None and "หยุด" in msg, msg[:100])
        pl = tbtn(pg, "วางกรอบ")
        ck("หยุดแล้วกลับมาแก้ได้", has(pl) and pl.first.is_enabled())
    # ⑩ เปลี่ยนไฟล์ระหว่างหาขอบ ห้ามมีผลหรือข้อความของงานเก่าโผล่
    open_tool(pg, fx["big"])
    side_open(pg)
    tb = trim_btn(pg)
    if has(tb):
        tb.first.click()
        pg.wait_for_timeout(800)
        pg.locator(".dz input[type=file]").set_input_files(str(fx["a4"]))
        pg.wait_for_selector(".cr-layer", timeout=25000)
        pg.wait_for_timeout(3000)
        ck("เปลี่ยนไฟล์ระหว่างหาขอบ ไฟล์ใหม่ไม่มีกรอบค้าง และไม่มีข้อความของงานเก่า",
           frame(pg) is None and "ตัดขอบ" not in foot(pg) and "หยุด" not in foot(pg), foot(pg)[:80])


# ── ㉑ แถบบนแถวเดียว ────────────────────────────────────────────────────
TBAR_JS = """() => {
  const t = document.querySelector('.s2-tbar'); if (!t) return null;
  const more = t.querySelector('.cr-more'), panel = t.querySelector('.cr-fold');
  const vis = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
  const ctrls = [...t.querySelectorAll('button, input')].filter(n => n !== more && !n.closest('[hidden]'));
  const inPanel = panel ? ctrls.filter(n => panel.contains(n)) : [];
  const bar = ctrls.filter(n => !panel || !panel.contains(n));
  const r = t.getBoundingClientRect();
  const seps = [...t.children].filter(n => n.classList.contains('sep') && vis(n));
  const kids = [...t.children].filter(n => vis(n) && n !== panel);
  return { h: Math.round(r.height), right: r.right, w: t.clientWidth,
           more: vis(more), moreText: more ? more.textContent.trim() : '', expanded: more ? more.getAttribute('aria-expanded') : null,
           nPanel: inPanel.length, nBar: bar.filter(vis).length,
           over: bar.filter(vis).filter(n => n.getBoundingClientRect().right > r.right - 1).length,
           sepFirstLast: seps.some(s => s === kids[0] || s === kids[kids.length - 1]),
           sepAdjacent: kids.some((n, i) => i && n.classList.contains('sep') && kids[i - 1].classList.contains('sep')),
           pageGroup: vis(t.querySelector('.cr-pgin')), undo: vis([...t.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'เลิกทำ')),
           small: ctrls.filter(vis).filter(n => { const b = n.getBoundingClientRect(); return b.width < 43.5 || b.height < 43.5; })
                    .map(n => (n.getAttribute('aria-label') || n.textContent || n.tagName).trim().slice(0, 14)),
           docW: document.documentElement.scrollWidth };
}"""


def sc_fold(b, a4, one, errs):
    for w, h in [(1920, 1080), (1366, 768), (1280, 800)]:
        ctx = b.new_context(viewport={"width": w, "height": h})
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(f"แถบ {w}: " + str(e)[:200]))
        try:
            open_tool(pg, a4)
            t = pg.evaluate(TBAR_JS)
            ck(f"จอ {w} แถบบนแถวเดียว ไม่มีปุ่มพับ (ปุ่มกะทัดรัดบนจอเมาส์)", t and t["h"] <= 60 and not t["more"] and t["nPanel"] == 0, str(t))
        finally:
            ctx.close()
    for w, h in [(390, 844), (360, 740), (320, 640)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=3)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(f"แถบ {w}: " + str(e)[:200]))
        try:
            open_tool(pg, a4)
            t = pg.evaluate(TBAR_JS)
            if not ck(f"จอ {w} แถบบนแถวเดียว (สูงไม่เกิน 64) ไม่ล้นจอ", t and t["h"] <= 64 and t["over"] == 0 and t["docW"] <= w + 1, str(t)):
                continue
            n = re.search(r"(\d+)", t["moreText"] or "")
            ck(f"จอ {w} มีปุ่ม อีก N ปุ่ม และ N เท่ากับปุ่มที่พับไว้จริง ({t['nPanel']})",
               t["more"] and t["nPanel"] > 0 and n is not None and int(n.group(1)) == t["nPanel"], str(t))
            ck(f"จอ {w} กลุ่มเปลี่ยนหน้ายังอยู่บนแถบ", t["pageGroup"], str(t))
            if w >= 360:
                ck(f"จอ {w} ปุ่มเลิกทำยังอยู่บนแถบ", t["undo"], str(t))
            ck(f"จอ {w} เส้นคั่นไม่อยู่หัวแถว ท้ายแถว หรือติดกัน", not t["sepFirstLast"] and not t["sepAdjacent"], str(t))
            ck(f"จอ {w} ปุ่มบนแถบใหญ่พอให้นิ้วกด (อย่างน้อย 44 px)", not t["small"], str(t["small"]))
            s0 = pg.locator(".cr-stage").bounding_box()
            z0 = zoom_pct(pg)
            more = pg.locator(".s2-tbar .cr-more")
            more.first.tap()
            pg.wait_for_timeout(300)
            s1 = pg.locator(".cr-stage").bounding_box()
            ck(f"จอ {w} กางแผงแล้วหน้ากระดาษไม่ขยับ (แผงลอย ไม่ดันหน้า)",
               all(near(s0[k], s1[k], 0.6) for k in ("x", "y", "width", "height")) and zoom_pct(pg) == z0, f"{s0} -> {s1}")
            t2 = pg.evaluate(TBAR_JS)
            ck(f"จอ {w} กางแล้ว aria-expanded เป็น true", t2["expanded"] == "true", str(t2["expanded"]))
            small = pg.evaluate("""() => [...document.querySelectorAll('.s2-tbar .cr-fold button, .s2-tbar .cr-fold input')]
              .filter(n => n.getClientRects().length).filter(n => { const b = n.getBoundingClientRect(); return b.width < 43.5 || b.height < 43.5; }).length""")
            ck(f"จอ {w} ปุ่มในแผงพับใหญ่พอให้นิ้วกด", small == 0, str(small))
            fw = tbtn(pg, "พอดีความกว้าง")
            if has(fw):
                fw.first.tap()
                pg.wait_for_timeout(400)
                st = pg.evaluate("() => { const m = document.querySelector('.s2-tbar .cr-more'); return [m && m.getAttribute('aria-expanded'), document.activeElement === m]; }")
                ck(f"จอ {w} กดคำสั่งในแผงแล้วแผงปิด โฟกัสกลับปุ่ม อีก N ปุ่ม", st == ["false", True], str(st))
            more.first.tap()
            pg.wait_for_timeout(200)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(200)
            st = pg.evaluate("() => { const m = document.querySelector('.s2-tbar .cr-more'); return [m && m.getAttribute('aria-expanded'), location.hash]; }")
            ck(f"จอ {w} กด Esc ปิดแผง ไม่ออกจากเครื่องมือ", st[0] == "false" and "pdf-crop" in st[1], str(st))
            if w == 390:
                hint = info(pg)
                pl_vis = pg.evaluate("""() => { const b = [...document.querySelectorAll('.s2-tbar button')].find(x => x.textContent.trim() === 'วางกรอบ');
                  return !!b && !b.closest('.cr-fold'); }""")
                ck("ข้อความแนะนำไม่ชี้ไปที่ปุ่ม วางกรอบ ที่ถูกพับไว้", pl_vis or "วางกรอบ" not in hint, hint[:90])
                # ‼️ ภาพจอรอบ 1 (02/10/2026): วางกรอบจากแผงพับแล้วแผงปิด โฟกัสถูกดึงกลับไปปุ่ม อีก N ปุ่ม
                #    ทั้งที่วางกรอบตั้งใจส่งโฟกัสไปที่กรอบให้กดลูกศรปรับต่อได้ทันที คนใช้คีย์บอร์ดต้องกด Tab หากรอบเอง
                more.first.focus()
                pg.keyboard.press("Enter")
                pg.wait_for_timeout(250)
                pb = pg.locator(".s2-tbar .cr-fold button").filter(has_text="วางกรอบ")
                if ck("จอ 390 ปุ่ม วางกรอบ อยู่ในแผงพับ", has(pb) and pb.first.is_visible()):
                    pb.first.focus()
                    pg.keyboard.press("Enter")
                    pg.wait_for_timeout(300)
                    st = pg.evaluate("""() => [document.activeElement.classList.contains('cr-keep'),
                      document.querySelector('.s2-tbar .cr-more').getAttribute('aria-expanded')]""")
                    f0 = frame(pg)
                    pg.keyboard.press("ArrowRight")
                    pg.wait_for_timeout(150)
                    f1 = frame(pg)
                    ck("จอ 390 วางกรอบจากแผงพับด้วยคีย์บอร์ด แผงปิด โฟกัสอยู่ที่กรอบ กดลูกศรขวาแล้วกรอบขยับทันที",
                       st == [True, "false"] and f0 and f1 and f1[0] > f0[0], f"{st} {fmt(f0)} -> {fmt(f1)}")
        finally:
            ctx.close()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, device_scale_factor=3)
    pg = ctx.new_page()
    try:
        open_tool(pg, one)
        t = pg.evaluate(TBAR_JS)
        ck("ไฟล์หน้าเดียว ซ่อนกลุ่มเปลี่ยนหน้า (เหลือที่ให้ปุ่มอื่น)", t and not t["pageGroup"] and not t["sepFirstLast"], str(t))
    finally:
        ctx.close()


# ── ㉒ ขอบเขตที่ไม่มีหน้าให้ตัด ปุ่มบันทึกต้องกดไม่ได้ ───────────────────────
def sc_empty_scope(pg, one):
    open_tool(pg, one)
    pg.locator(".cr-scope select, .s2-side-bd select").first.select_option("even")
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    ck("ไฟล์ 1 หน้าเลือกหน้าคู่ ไม่มีหน้าให้ตัด ปุ่มบันทึกกดไม่ได้ (เดิมขึ้นว่าครอบตัด 0 หน้าเรียบร้อย)",
       has(cta) and not cta.first.is_enabled())


# ══ รีวิวหลังทำ (02/10/2026) ══════════════════════════════════════════════
# ทีมตรวจทาน 4 มุมแล้วตรวจแย้งทีละข้อ 30 ข้อ ยืนยันจริง 29 (ตัดทิ้ง T4 ข้อเดียว) ฉากข้างล่างเขียนจากฉากที่ผู้ตรวจยิงจริง
# ทุกข้อต้องแดงกับโค้ดก่อนแก้ (fk_prereview) หรือกับตัวกลายพันธุ์ที่ถอดการแก้ข้อนั้นออก ก่อนเชื่อผลเขียว

# ── ㉓ก ขอบเขตหน้าเดียวกับโหมดแยก (X1 S4 S6) และกลับไปแก้จากหน้าผลลัพธ์ (X7) ────────────
def sc_rv_one(pg, a4):
    open_tool(pg, a4)
    set_scope(pg, "one")
    go_page(pg, 3)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    out = save(pg, DL / "rv-one.pdf")
    got = cut_pages(out) if out else None
    ck("ประชากร: ขอบเขต เฉพาะหน้าที่เห็นอยู่ บนหน้า 3 ไฟล์ตัดหน้า 3 หน้าเดียว", got == [3], str(got))
    back_to_edit(pg)
    set_mode(pg, True)
    t = info(pg)
    seen(t)
    ck("S4 โหมดแยก หน้า 3 ไม่อ้างว่าใช้กรอบเดียวกับหน้าอื่น (ไม่มีหน้าอื่นถูกตัดเลย)",
       page_no(pg) == "3" and "หน้าอื่น" not in t and "กรอบที่ตั้งตอนเลือก กรอบเดียว" in t, t[:90])
    go_page(pg, 1)
    ck("X1 โหมดแยก หน้า 1 ไม่ตัด", frame(pg) is None and "หน้านี้ไม่ตัด" in info(pg), info(pg)[:60])
    out = save(pg, DL / "rv-one-each.pdf")
    got = cut_pages(out) if out else None
    ck("X1 เข้าโหมดแยกจากขอบเขตหน้าเดียว ไฟล์ยังตัดหน้า 3 หน้าเดียว (ไม่ย้ายไปหน้าที่เห็น)", got == [3], str(got))
    back_to_edit(pg)
    go_page(pg, 4)
    set_mode(pg, False)
    pg.wait_for_timeout(700)
    seen(f"ออกจากโหมดแยกตอนดูหน้า 4 แล้วอยู่หน้า {page_no(pg)}")
    ck("S6 ออกจากโหมดแยกขณะดูหน้า 4 พากลับหน้า 3 ที่กรอบอยู่", page_no(pg) == "3", page_no(pg))
    out = save(pg, DL / "rv-one-back.pdf")
    got = cut_pages(out) if out else None
    ck("S6 สลับโหมดอย่างเดียว ไฟล์ยังตัดหน้า 3 ไม่ย้ายไปหน้า 4", got == [3], str(got))
    back_to_edit(pg)
    set_mode(pg, True)
    go_page(pg, 4)
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(800)
    seen(f"เลิกทำการเข้าโหมดแยกตอนดูหน้า 4 ได้โหมดแยก {each_on(pg)} หน้า {page_no(pg)}")
    ck("S6 เลิกทำการเข้าโหมดแยกขณะดูหน้า 4 กลับเป็นกรอบเดียวที่หน้า 3", not each_on(pg) and page_no(pg) == "3",
       f"แยก {each_on(pg)} หน้า {page_no(pg)}")
    out = save(pg, DL / "rv-one-undo.pdf")
    got = cut_pages(out) if out else None
    ck("S6 หลังเลิกทำ ไฟล์ยังตัดหน้า 3", got == [3], str(got))
    back_to_edit(pg)
    # X7: บันทึกตอนดูผลอยู่ หน้าผลลัพธ์ห้ามมีลิงก์ แก้กรอบต่อ (กดแล้วแก้ไม่ได้จริง) และ กลับไปแก้ ต้องได้กรอบที่แก้ได้ในก้าวเดียว
    # ‼️ รอบแรกของข้อนี้บันทึกต่อจากข้างบนเลย ได้แดงหลอก เพราะกด กลับไปแก้ มาแล้ว เปลือกหน้าจึงไม่ไปหน้าผลลัพธ์อีก
    #    (แถวดาวน์โหลดขึ้นบนผืนงานแทน ดูคอมเมนต์ที่ save) เปิดไฟล์ใหม่เพื่อล้างธงนั้น แล้วยืนยันสถานะก่อนตรวจ
    open_tool(pg, a4)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    tbtn(pg, "ดูผลหลังตัด").first.click()
    pg.wait_for_timeout(600)
    out = save(pg, DL / "rv-pv-save.pdf")
    if out:
        state = pg.evaluate("() => document.querySelector('.s2').dataset.state")
        ck("ประชากร: บันทึกรอบแรกของไฟล์ใหม่ไปหน้าผลลัพธ์จริง", state == "result", state)
        ex = pg.locator(".cr-pv-exit")
        ck("X7 หน้าผลลัพธ์ไม่มีลิงก์ แก้กรอบต่อ", not (has(ex) and ex.first.is_visible()))
        back_to_edit(pg)
        st = [pg.locator(".s2-tbar .cr-pv-btn").first.get_attribute("aria-pressed"), frame(pg) is not None, focus_on(pg)]
        seen(st)
        ck("X7 กด กลับไปแก้ แล้วออกจากดูผลด้วย เห็นกรอบที่แก้ได้ทันที โฟกัสอยู่ที่กรอบ", st == ["false", True, "กรอบ"], str(st))


# ── ㉓ข Ctrl+Z ในช่อง มม. ที่พาไปหน้าอื่น (S1) ─────────────────────────────────
def sc_rv_mm(pg, a4):
    open_tool(pg, a4)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    set_mode(pg, True)
    left, top = pg.locator('input[data-edge="left"]'), pg.locator('input[data-edge="top"]')
    go_page(pg, 3)
    left.first.click()
    left.first.fill("50")
    pg.keyboard.press("Tab")
    pg.wait_for_timeout(250)
    go_page(pg, 1)
    v0 = mm_vals(pg)
    top.first.click()
    top.first.fill("40")
    pg.keyboard.press("Tab")
    pg.wait_for_timeout(250)
    go_page(pg, 3)
    v3 = mm_vals(pg)
    seen(f"หน้า 1 ก่อนพิมพ์ {v0} หน้า 3 {v3}")
    ck("ประชากร: หน้า 3 ขอบซ้าย 50 มม. ต่างจากหน้า 1", v3.get("left") == "50" and v0.get("left") != "50", f"{v0} {v3}")
    left.first.click()
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(900)
    v = mm_vals(pg)
    seen(f"หลัง Ctrl+Z อยู่หน้า {page_no(pg)} ช่อง {v} โฟกัส {focus_on(pg)}")
    ck("S1 Ctrl+Z ในช่องซ้ายของหน้า 3 ย้อนการแก้ของหน้า 1 แล้วพาไปหน้า 1", page_no(pg) == "1", page_no(pg))
    ck("S1 ทุกช่อง มม. รวมช่องที่มีโฟกัส แสดงค่าของหน้า 1 จริง (ไม่ค้าง 50 ของหน้า 3)", v == v0, f"{v} ควรเป็น {v0}")
    go_page(pg, 3)
    top.first.click()
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(900)
    v = mm_vals(pg)
    seen(f"หลัง Ctrl+Shift+Z อยู่หน้า {page_no(pg)} ช่อง {v}")
    ck("S1 ทำซ้ำจากช่องบนของหน้า 3 พาไปหน้า 1 ช่องบนที่มีโฟกัสแสดง 40 ของหน้า 1", page_no(pg) == "1" and v.get("top") == "40", str(v))


# ── ㉓ค ประกาศเลิกทำข้ามหน้าครั้งเดียว (S3) และทำซ้ำข้ามหน้า (X12) ───────────────────
def sc_rv_note(pg, a4):
    open_tool(pg, a4)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    set_mode(pg, True)
    go_page(pg, 3)
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("ArrowDown")
    pg.wait_for_timeout(700)
    go_page(pg, 1)
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(900)
    t = info(pg)
    seen(t)
    ck("ประชากร: เลิกทำข้ามหน้า พาไปหน้า 3 และบอก ย้อนการแก้ที่หน้า 3", page_no(pg) == "3" and "ย้อนการแก้ที่หน้า 3" in t, t[:80])
    go_page(pg, 2)
    go_page(pg, 3)
    t = info(pg)
    seen(t)
    ck("S3 ไปหน้าอื่นแล้วกลับมาหน้า 3 ไม่ประกาศการย้อนซ้ำ (ไม่ได้ย้อนอะไรใหม่)", "ย้อนการแก้" not in t, t[:80])
    go_page(pg, 1)
    blur(pg)
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(900)
    t = info(pg)
    seen(t)
    ck("X12 ทำซ้ำการแก้ของหน้า 3 ขณะดูหน้า 1 พาไปหน้า 3 และบอก ทำซ้ำการแก้ที่หน้า 3",
       page_no(pg) == "3" and "ทำซ้ำการแก้ที่หน้า 3" in t, f"หน้า {page_no(pg)} {t[:80]}")


# ── ㉓ง เลิกทำกรอบที่มีโฟกัส โฟกัสต้องไม่หลุดไปทั้งหน้า (F1) ─────────────────────────
def sc_rv_undo_focus(pg, a4):
    open_tool(pg, a4)
    pl = tbtn(pg, "วางกรอบ")
    pl.first.focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(300)
    a0 = focus_on(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(300)
    a1 = [frame(pg) is None, focus_on(pg)]
    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(300)
    a2 = [frame(pg) is not None, focus_on(pg)]
    seen(f"วางกรอบ {a0} เลิกทำ {a1} ทำซ้ำ {a2}")
    ck("ประชากร: วางกรอบด้วยคีย์บอร์ดแล้วโฟกัสอยู่ที่กรอบ", a0 == "กรอบ", a0)
    ck("F1 Ctrl+Z ที่กรอบ กรอบหาย โฟกัสย้ายไปปุ่ม วางกรอบ ไม่หลุดไปทั้งหน้า", a1 == [True, "วางกรอบ"], str(a1))
    ck("F1 Ctrl+Shift+Z กรอบกลับมา โฟกัสยังอยู่ในเครื่องมือ", a2[0] and a2[1] != "BODY", str(a2))
    # โหมดแยก: เลิกทำการวาดกรอบหน้า 2 ขณะโฟกัสอยู่ที่กรอบหน้า 1 พาไปหน้า 2 แบบรอโหลด กรอบหายตอนหน้ามาถึง
    open_tool(pg, a4)
    set_mode(pg, True)
    mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.6, 0.6))
    go_page(pg, 2)
    mdrag(pg, *at(pg, 0.2, 0.2), *at(pg, 0.7, 0.7))
    go_page(pg, 1)
    f1 = frame(pg)
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(1500)
    st = [page_no(pg), frame(pg) is None, focus_on(pg)]
    seen(f"กรอบหน้า 1 {fmt(f1)} หลัง Ctrl+Z {st}")
    ck("ประชากร: โหมดแยก หน้า 1 มีกรอบของตัวเอง", f1 is not None, fmt(f1))
    ck("F1 โหมดแยก Ctrl+Z ที่กรอบหน้า 1 ย้อนหน้า 2 พาไปหน้า 2 ที่ไม่มีกรอบแล้ว โฟกัสย้ายไปปุ่ม วางกรอบ",
       st == ["2", True, "วางกรอบ"], str(st))


# ── ㉓จ คัดลอกไปหน้าคี่หรือคู่ทุกหน้า (X2 X8) ─────────────────────────────────────
def sc_rv_par(pg, a4):
    open_tool(pg, a4)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    F = frame(pg)
    set_mode(pg, True)
    go_page(pg, 2)
    w = pg.locator(".cr-stage").bounding_box()["width"]
    x, y = hcenter(pg, "e")
    mdrag(pg, x, y, x - 0.3 * w, y)
    B = frame(pg)
    go_page(pg, 1)
    par = pg.locator(".cr-copy-par")
    lab = par.first.inner_text() if has(par) else ""
    if not ck("ประชากร: หน้า 1 มีปุ่ม คัดลอกไปหน้าคี่ทุกหน้า", lab == "คัดลอกไปหน้าคี่ทุกหน้า", lab):
        return
    par.first.click()
    pg.wait_for_timeout(300)
    m = foot(pg)
    seen(m)
    ck("X8 หน้าคี่ตรงกันอยู่แล้ว บอกว่า หน้าคี่ทุกหน้าใช้กรอบนี้อยู่แล้ว (เดิมบอกว่าทุกหน้า ทั้งที่หน้า 2 ต่างอยู่)",
       "หน้าคี่ทุกหน้าใช้กรอบนี้อยู่แล้ว" in m, m)
    go_page(pg, 2)
    lab = par.first.inner_text()
    par.first.click()
    pg.wait_for_timeout(300)
    m = foot(pg)
    seen(f"{lab} {m}")
    ck("X2 หน้า 2 กด คัดลอกไปหน้าคู่ทุกหน้า บอกว่าคัดลอกไปแล้ว 1 หน้า (หน้า 4)",
       lab == "คัดลอกไปหน้าคู่ทุกหน้า" and "คัดลอกกรอบนี้ไปแล้ว 1 หน้า" in m, f"{lab} {m}")
    out = save(pg, DL / "rv-par.pdf")
    if out:
        rights = [round(c[2], 1) if c else None for c, _ in raw_boxes(out)]
        rF, rB = round((F[0] + F[2]) * A4[0], 1), round((B[0] + B[2]) * A4[0], 1)
        seen(f"ขอบขวาในไฟล์ {rights} กรอบเดิม {rF} กรอบหน้า 2 {rB}")
        ck("X2 ไฟล์จริง หน้า 2 กับ 4 ได้กรอบแคบของหน้า 2 หน้า 1 กับ 3 ได้กรอบเดิม",
           None not in rights and near(rights[0], rF, 1.5) and near(rights[2], rF, 1.5)
           and near(rights[1], rB, 1.5) and near(rights[3], rB, 1.5), f"{rights} ควรเป็น [{rF}, {rB}, {rF}, {rB}]")
        back_to_edit(pg)


# ── ㉓ฉ สลับโหมดไปกลับที่จบที่เดิมไม่นับเป็นก้าว และ Ctrl+Y (X12) ───────────────────────
def sc_rv_group(pg, a4):
    open_tool(pg, a4)
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    f0 = frame(pg)
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(700)
    f1 = frame(pg)
    pg.locator('.cr-mode input[value="single"]').first.focus()
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(60)
    pg.keyboard.press("ArrowLeft")
    pg.wait_for_timeout(250)
    ck("ประชากร: ลูกศรขวาขยับกรอบ แล้วสลับโหมดไปกลับจบที่กรอบเดียว",
       f0 and f1 and f1[0] > f0[0] and not each_on(pg), f"{fmt(f0)} {fmt(f1)} แยก {each_on(pg)}")
    blur(pg)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(250)
    fz = frame(pg)
    pg.keyboard.press("Control+y")
    pg.wait_for_timeout(250)
    fy = frame(pg)
    seen(f"{fmt(f0)} ขยับเป็น {fmt(f1)} Ctrl+Z ได้ {fmt(fz)} Ctrl+Y ได้ {fmt(fy)}")
    ck("X12 สลับโหมดไปกลับที่จบที่เดิมไม่นับเป็นก้าว Ctrl+Z ครั้งแรกย้อนการขยับกรอบเลย", same_frame(fz, f0, 0.0008),
       f"ได้ {fmt(fz)} ควรได้ {fmt(f0)}")
    ck("X12 Ctrl+Y ทำซ้ำได้เหมือน Ctrl+Shift+Z", same_frame(fy, f1, 0.0008), f"ได้ {fmt(fy)} ควรได้ {fmt(f1)}")


# ── ㉔ก สแกนแผ่นใหญ่ (T1) กับตัดขอบขาวทีละหน้าที่มีหน้าหาขอบไม่ได้ (T2) ────────────────
def sc_rv_trim_big(pg, fx):
    open_tool(pg, fx["a1scan"])
    msg = press_trim(pg) or ""
    seen(msg)
    out = save(pg, DL / "rv-a1.pdf")
    if out:
        c = shown_crop(out, 0, H=BIG[1])
        d = big_page(body=False)
        dig = ink_box(d, dpi=72)
        d.close()
        seen(f"กรอบ {c} เลขหน้า {dig}")
        ck("T1 สแกน A1 เลขหน้า 12 พอยต์ที่อยู่โดดเดี่ยว ยังอยู่ในกรอบ (ไม่ถูกนับเป็นฝุ่น)", contains(c, dig, 1.5),
           f"กรอบ {c} เลขหน้า {dig}")
        back_to_edit(pg)
    open_tool(pg, fx["darkmid"])
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    F = frame(pg)
    set_mode(pg, True)
    msg = press_trim(pg) or ""
    seen(msg)
    ck("T2 ข้อความนับกรอบเดียวที่ถูกแทน 2 หน้า และบอกว่าหน้า 2 หาขอบไม่ได้ คงไว้แบบเดิม",
       msg.startswith("ตัดขอบขาวแล้ว 2 หน้า ไม่ตัด 0 หน้า แทนกรอบเดิม 2 หน้า หน้า 2 หาขอบไม่ได้ คงไว้แบบเดิม"), msg)
    go_page(pg, 2)
    ck("T2 หน้า 2 ที่ขอบไม่ขาว ยังได้กรอบเดิม ไม่ถูกถอดทิ้งเงียบ ๆ", same_frame(frame(pg), F, 0.002), fmt(frame(pg)))
    out = save(pg, DL / "rv-darkmid.pdf")
    got = cut_pages(out) if out else None
    ck("T2 ไฟล์จริงตัดครบ 3 หน้า (หน้า 2 ด้วยกรอบเดิม)", got == [1, 2, 3], str(got))
    if out:
        back_to_edit(pg)


# ── ㉔ข ตัดขอบขาวแล้วโฟกัสกับแผ่นตัวเลือก (T3) ────────────────────────────────────
def sc_rv_trim_focus(pg, b, fx, errs):
    open_tool(pg, fx["faint"])
    q = trim_btn(pg, "quick")
    q.first.focus()
    pg.keyboard.press("Enter")
    wait_job(pg)
    st = [frame(pg) is not None, focus_on(pg)]
    seen(st)
    ck("T3 จอกว้าง กดลิงก์ตัดขอบขาวด้วยคีย์บอร์ด ตัดได้ ลิงก์หายไป โฟกัสไปอยู่ที่กรอบ", st == [True, "กรอบ"], str(st))
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    m = ctx.new_page()
    m.on("pageerror", lambda e: errs.append("ตัดขอบขาวมือถือ: " + str(e)[:200]))
    try:
        open_tool(m, fx["faint"])
        side_open(m)
        tb = trim_btn(m)
        tb.first.focus()
        m.keyboard.press("Enter")
        wait_job(m)
        st = [m.evaluate(OVERLAY_JS)["sheet"], frame(m) is not None, focus_on(m)]
        seen(st)
        ck("T3 มือถือ กดตัดขอบขาวในแผ่นตัวเลือก กรอบเปลี่ยน แผ่นปิด โฟกัสไปที่กรอบ", st == [False, True, "กรอบ"], str(st))
        open_tool(m, fx["dark"])
        side_open(m)
        tb = trim_btn(m)
        tb.first.focus()
        m.keyboard.press("Enter")
        msg = wait_job(m)
        st = [m.evaluate(OVERLAY_JS)["sheet"], focus_on(m)]
        seen(f"{st} {msg}")
        ck("T3 มือถือ ตัดไม่ได้ (ขอบไม่ขาว) แผ่นตัวเลือกค้างไว้ให้อ่านเหตุ โฟกัสกลับปุ่มเดิม",
           st[0] is True and st[1].startswith("ตัดขอบขาว"), str(st))
    finally:
        ctx.close()


# ── ㉔ค ตัดเฉพาะหน้านี้ (X3) ไฟล์หน้าเดียว (X9) จำนวนที่บอก (X11) ภาษาอังกฤษ (X5) ─────────────
def sc_rv_trim_more(pg, b, fx, errs):
    open_tool(pg, fx["union"])
    set_mode(pg, True)
    go_page(pg, 2)
    msg = press_trim(pg, "page") or ""
    seen(msg)
    ck("X3 ตัดขอบขาวเฉพาะหน้านี้ บอกว่าตัดหน้านี้แล้ว", msg.startswith("ตัดขอบขาวหน้านี้แล้ว"), msg)
    out = save(pg, DL / "rv-trim-page.pdf")
    if out:
        got, c2 = cut_pages(out), shown_crop(out, 1)
        seen(f"ตัดหน้า {got} กรอบหน้า 2 {c2}")
        ck("X3 ไฟล์จริงตัดหน้า 2 หน้าเดียว แน่นรอบกล่องน้ำเงิน", got == [2] and contains(c2, [330, 520, 540, 780], 0.6)
           and tight(c2, [330, 520, 540, 780], *A4), f"{got} {c2}")
        back_to_edit(pg)
    go_page(pg, 3)
    msg = press_trim(pg, "page") or ""
    seen(msg)
    ck("X3 หน้า 3 ที่ว่าง กดเฉพาะหน้านี้ บอกว่าหน้านี้ว่างเปล่า", msg.startswith("หน้านี้ว่างเปล่า"), msg)
    open_tool(pg, fx["empty1"])
    msg = press_trim(pg) or ""
    seen(msg)
    ck("X9 ไฟล์หน้าเดียวที่ว่าง บอกว่า หน้านี้ว่างเปล่า (เดิมบอกว่าหน้าที่เลือกว่างเปล่าทั้งหมด)",
       msg.startswith("หน้านี้ว่างเปล่า"), msg)
    set_mode(pg, True)
    vis = pg.evaluate("""() => ['.cr-trim-page', '.cr-copy-all', '.cr-copy-par'].map(s => {
      const n = document.querySelector(s); return !!n && n.getClientRects().length > 0; })""")
    lab = trim_btn(pg).first.inner_text()
    seen(f"{vis} {lab}")
    ck("X9 ไฟล์หน้าเดียวโหมดแยก ไม่มีปุ่มที่ทำเรื่องเดียวกันซ้ำ (เฉพาะหน้านี้ คัดลอกไปทุกหน้า หน้าคี่คู่)",
       vis == [False, False, False], str(vis))
    ck("X9 ป้ายปุ่มตัดขอบขาวของไฟล์หน้าเดียวไม่พูดว่า ทุกหน้า", "ทุกหน้า" not in lab, lab)
    open_tool(pg, fx["union"])
    set_mode(pg, True)
    mdrag(pg, *at(pg, 0.05, 0.05), *at(pg, 0.6, 0.6))
    msg = press_trim(pg) or ""
    seen(msg)
    ck("X11 หน้า 1 ตั้งกรอบเองไว้ ตัดขอบขาวทีละหน้า บอก ตัด 2 หน้า ไม่ตัด 1 หน้า แทนกรอบเดิม 1 หน้า",
       msg.startswith("ตัดขอบขาวแล้ว 2 หน้า ไม่ตัด 1 หน้า แทนกรอบเดิม 1 หน้า"), msg)
    ctx = b.new_context(viewport={"width": 1400, "height": 1000})
    ctx.add_init_script("try{localStorage.setItem('fk-lang','en')}catch(e){}")
    e = ctx.new_page()
    e.on("pageerror", lambda x: errs.append("ตัดขอบขาวอังกฤษ: " + str(x)[:200]))
    try:
        open_tool(e, fx["union"])
        msg = press_trim(e) or ""
        seen(msg)
        ck("X5 อังกฤษ กรอบเดียว ประโยคแยกด้วยจุด หน้าว่างหน้าเดียวใช้เอกพจน์",
           msg == "White margins trimmed. Blank page left out: 3. Adjust the frame or press Undo.", msg)
        open_tool(e, fx["union"])
        e.locator(".cr-mode label").filter(has_text="Per page").first.click()
        e.wait_for_timeout(250)
        msg = press_trim(e) or ""
        seen(msg)
        ck("X5 อังกฤษ แยกทีละหน้า ประโยคแยกด้วยจุด", msg == "Trimmed 2 pages, 1 left whole. Blank page left out: 3.", msg)
    finally:
        ctx.close()


# ── ㉕ก จอ 600 ปุ่มคู่ที่ถูกพับ (F2) กับ Esc ซ้อนกันหลายชั้น (F5) ───────────────────────
def sc_rv_narrow(b, a4, one, errs):
    ctx = b.new_context(viewport={"width": 600, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("จอ 600: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.6, 0.6))
        where = pg.evaluate("""() => { const f = (n) => [...document.querySelectorAll('.s2-tbar button')].find(b => b.getAttribute('aria-label') === n);
          const u = f('เลิกทำ'), r = f('ทำซ้ำ'); return [!!u && !u.closest('.cr-fold'), !!r && !!r.closest('.cr-fold')]; }""")
        if ck("ประชากร: จอ 600 ปุ่มเลิกทำอยู่บนแถบ ปุ่มทำซ้ำถูกพับ", where == [True, True], str(where)):
            undo = pg.locator(".s2-tbar").get_by_role("button", name="เลิกทำ", exact=True)
            undo.first.focus()
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(250)
            st = [frame(pg) is None, focus_on(pg)]
            seen(st)
            ck("F2 จอ 600 กดเลิกทำจนสุดด้วยคีย์บอร์ด ปุ่มทำซ้ำถูกพับ โฟกัสไปที่ อีก N ปุ่ม ไม่หลุดไปทั้งหน้า",
               st == [True, "อีก N ปุ่ม"], str(st))
        # F5 แผงพับใต้เมนูรวมเครื่องมือ
        open_tool(pg, a4)
        more = pg.locator(".s2-tbar .cr-more")
        more.first.focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(200)
        pg.locator("#toolmenu").focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(250)
        s0, a0 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        n0 = len(errs)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        s1, a1 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        s2, a2 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        seen(f"ก่อน {s0} {a0} | Esc 1 {s1} {a1} | Esc 2 {s2} {a2}")
        ck("ประชากร: จอ 600 แผงพับกางอยู่ใต้เมนูรวมเครื่องมือ โฟกัสอยู่ในเมนู",
           s0["menu"] and s0["fold"] == "true" and a0 == "ในเมนูเครื่องมือ", f"{s0} {a0}")
        ck("F5 Esc ครั้งแรกปิดเมนูที่อยู่บนสุด แผงพับยังกาง ยังอยู่ในเครื่องมือ โฟกัสกลับปุ่มเมนู",
           not s1["menu"] and s1["fold"] == "true" and s1["tool"] and a1 == "ปุ่มเมนูเครื่องมือ", f"{s1} {a1}")
        ck("F5 Esc ครั้งที่สองปิดแผงพับ ยังอยู่ในเครื่องมือ โฟกัสไม่ถูกดึงไปปุ่ม อีก N ปุ่ม ไม่มีข้อผิดพลาด",
           s2["fold"] == "false" and s2["tool"] and a2 == "ปุ่มเมนูเครื่องมือ" and len(errs) == n0, f"{s2} {a2} {errs[n0:]}")
        # F5 แผงพับกับแผ่นตัวเลือก
        if not s2["tool"]:
            open_tool(pg, a4)
        more.first.focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(200)
        pg.locator(".s2-sheetbtn").first.focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(250)
        s0 = pg.evaluate(OVERLAY_JS)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        s1, a1 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        s2, a2 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        seen(f"ก่อน {s0} | Esc 1 {s1} {a1} | Esc 2 {s2} {a2}")
        ck("ประชากร: จอ 600 แผงพับกางพร้อมแผ่นตัวเลือก", s0["fold"] == "true" and s0["sheet"], str(s0))
        ck("F5 Esc ครั้งแรกปิดแผ่นตัวเลือก แผงพับยังกาง โฟกัสอยู่ที่ ตัวเลือก",
           not s1["sheet"] and s1["fold"] == "true" and a1 == "ตัวเลือก", f"{s1} {a1}")
        ck("F5 Esc ครั้งที่สองปิดแผงพับ โฟกัสยังอยู่ที่ ตัวเลือก ยังอยู่ในเครื่องมือ",
           s2["fold"] == "false" and a2 == "ตัวเลือก" and s2["tool"], f"{s2} {a2}")
        # F5 แผงพับกางแต่โฟกัสอยู่ที่กรอบ Esc ปิดแผงโดยไม่ดึงโฟกัสออกจากกรอบ
        if not s2["tool"]:
            open_tool(pg, a4)
        mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.6, 0.6))
        more.first.focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(200)
        pg.locator(".cr-keep").first.focus()
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        s1, a1 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        seen(f"{s1} {a1}")
        ck("F5 แผงพับกางแต่โฟกัสอยู่ที่กรอบ Esc ปิดแผง โฟกัสยังอยู่ที่กรอบ", s1["fold"] == "false" and a1 == "กรอบ" and s1["tool"],
           f"{s1} {a1}")
        # F2 ไฟล์หน้าเดียว โฟกัสอยู่ที่ อีก N ปุ่ม แล้วขยายจอจนไม่มีอะไรพับ
        open_tool(pg, one)
        vis = more.first.is_visible()
        more.first.focus()
        pg.set_viewport_size({"width": 1366, "height": 900})
        pg.wait_for_timeout(700)
        st = [more.first.is_visible(), focus_on(pg)]
        seen(f"ก่อนขยาย อีก N ปุ่ม เห็น {vis} หลังขยาย {st}")
        ck("ประชากร: ไฟล์หน้าเดียวจอ 600 มีปุ่ม อีก N ปุ่ม", vis)
        ck("F2 ขยายจอจนปุ่ม อีก N ปุ่ม หายไปตอนมีโฟกัส โฟกัสย้ายไปปุ่ม วางกรอบ ไม่หลุดไปทั้งหน้า", st == [False, "วางกรอบ"], str(st))
    finally:
        ctx.close()


# ── ㉕ข จอกว้าง ปุ่มที่ปิดตัวเอง (F2 F3) กับ Esc ตอนเมนูเปิด (F8) ──────────────────────
def sc_rv_wide(b, a4, errs):
    ctx = b.new_context(viewport={"width": 1366, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("จอ 1366: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.6, 0.6))
        tbtn(pg, "ล้างกรอบ").first.focus()
        pg.keyboard.press("Control+z")
        pg.wait_for_timeout(250)
        st = [frame(pg) is None, focus_on(pg)]
        pg.keyboard.press("Control+Shift+z")
        pg.wait_for_timeout(250)
        tbtn(pg, "ดูผลหลังตัด").first.focus()
        pg.keyboard.press("Control+z")
        pg.wait_for_timeout(250)
        st2 = [frame(pg) is None, focus_on(pg)]
        seen(f"ล้างกรอบ {st} ดูผล {st2}")
        ck("F2 โฟกัสอยู่ที่ ล้างกรอบ แล้ว Ctrl+Z เอากรอบเดียวออก ปุ่มปิด โฟกัสย้ายไปปุ่ม วางกรอบ", st == [True, "วางกรอบ"], str(st))
        ck("F2 โฟกัสอยู่ที่ ดูผลหลังตัด แล้ว Ctrl+Z เอากรอบเดียวออก ปุ่มปิด โฟกัสย้ายไปปุ่ม วางกรอบ", st2 == [True, "วางกรอบ"], str(st2))
        # F3 ลิงก์ แก้กรอบต่อ ซ่อนตัวเองตอนกด
        pg.keyboard.press("Control+Shift+z")
        pg.wait_for_timeout(250)
        tbtn(pg, "ดูผลหลังตัด").first.click()
        pg.wait_for_timeout(600)
        pg.locator(".cr-pv-exit").first.focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(400)
        st = [pg.locator(".s2-tbar .cr-pv-btn").first.get_attribute("aria-pressed"), focus_on(pg)]
        seen(st)
        ck("F3 กด แก้กรอบต่อ ด้วยคีย์บอร์ด ออกจากดูผล โฟกัสไปที่กรอบ", st == ["false", "กรอบ"], str(st))
        # F8 เมนูรวมเครื่องมือเปิดค้าง โฟกัสกลับเข้ามาในเครื่องมือ แล้วกด Esc
        n0 = len(errs)
        pg.locator("#toolmenu").focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(250)
        tbtn(pg, "ซูมเข้า").first.focus()
        s0 = pg.evaluate(OVERLAY_JS)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        s1, a1 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        seen(f"{s0} {s1} {a1} {errs[n0:]}")
        ck("ประชากร: เมนูรวมเครื่องมือเปิดค้างตอนโฟกัสอยู่ในเครื่องมือ", s0["menu"], str(s0))
        ck("F8 Esc ตอนเมนูเปิดแต่โฟกัสอยู่ในเครื่องมือ ปิดเมนู ไม่มีข้อผิดพลาด ยังอยู่ในเครื่องมือ โฟกัสกลับปุ่มเมนู",
           not s1["menu"] and s1["tool"] and a1 == "ปุ่มเมนูเครื่องมือ" and len(errs) == n0, f"{s1} {a1} {errs[n0:]}")
        if not s1["tool"]:
            open_tool(pg, a4)
        pg.locator("#toolmenu").focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(250)
        a0 = focus_on(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        s1, a1 = pg.evaluate(OVERLAY_JS), focus_on(pg)
        seen(f"{a0} {s1} {a1}")
        ck("F8 Esc ตอนโฟกัสอยู่ในเมนู ปิดเมนูอย่างเดียว ไม่ออกจากเครื่องมือ โฟกัสกลับปุ่มเมนู",
           a0 == "ในเมนูเครื่องมือ" and not s1["menu"] and s1["tool"] and a1 == "ปุ่มเมนูเครื่องมือ", f"{a0} {s1} {a1}")
        if not s1["tool"]:
            open_tool(pg, a4)
        blur(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(500)
        ck("Esc ตอนไม่มีอะไรเปิดอยู่ ยังพากลับหน้าแรกตามกติกาของทั้งเว็บ", not pg.evaluate(OVERLAY_JS)["tool"])
    finally:
        ctx.close()


# ── ㉕ค มือถือ: แถบค้างแบบย่อ (F4) แผ่นตัวเลือกกับ Esc ที่ body (F8) แถบย่อตอนดูผล (X10 F6) ──────────
TB_FIT_JS = """() => { const t = document.querySelector('.s2-tbar'), m = t && t.querySelector('.cr-more');
  if (!t) return null; const r = t.getBoundingClientRect(), mr = m ? m.getBoundingClientRect() : null;
  return { tight: !!document.querySelector('.s2-tbar.cr-tight, .s2-tbar .cr-tight'), sw: t.scrollWidth, cw: t.clientWidth,
           barR: Math.round(r.right), moreR: mr ? Math.round(mr.right) : 9999, moreVis: !!m && m.getClientRects().length > 0,
           moreText: m ? m.innerText.trim() : '', moreLabel: m ? m.getAttribute('aria-label') : '' }; }"""


def sc_rv_mobile(b, a4, errs):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("มือถือ 390: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        tbtn(pg, "วางกรอบ").first.tap()
        pg.wait_for_timeout(300)
        t0 = pg.evaluate(TB_FIT_JS)
        tbtn(pg, "ดูผลหลังตัด").first.tap()
        pg.wait_for_timeout(800)
        pg.locator(".s2-tbar .cr-pv-btn").first.tap()
        pg.wait_for_timeout(600)
        t1 = pg.evaluate(TB_FIT_JS)
        x, y = at(pg, 0.5, 0.5)
        pg.touchscreen.tap(x, y)
        pg.wait_for_timeout(700)
        t2 = pg.evaluate(TB_FIT_JS)
        seen(f"ก่อนดูผล {t0} | ออกจากดูผล {t1} | แตะหน้ากระดาษ {t2} โฟกัส {focus_on(pg)}")
        ck("ประชากร: มือถือ 390 มีกรอบแล้วแถบไม่ย่อ และออกจากดูผลทันทีแถบยังย่ออยู่ (ปุ่มตาค้างเพราะมีโฟกัส)",
           not t0["tight"] and t1["tight"], f"{t0['tight']} {t1['tight']}")
        ck("F4 ออกจากดูผลแล้วแตะหน้ากระดาษ แถบกลับเป็นแบบไม่ย่อ (เห็นคำว่า ปุ่ม อีกครั้ง)",
           not t2["tight"] and "ปุ่ม" in t2["moreText"], str(t2))
        # F8 แผ่นตัวเลือกเปิด โฟกัสอยู่ที่ body (Safari ไม่โฟกัสปุ่มที่แตะ)
        pg.locator(".s2-sheetbtn").first.tap()
        pg.wait_for_timeout(300)
        blur(pg)
        s0 = pg.evaluate(OVERLAY_JS)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        s1 = pg.evaluate(OVERLAY_JS)
        seen(f"{s0} {s1}")
        ck("F8 มือถือ แผ่นตัวเลือกเปิด โฟกัสอยู่ที่ body กด Esc ปิดแผ่น ไม่ออกจากเครื่องมือ",
           s0["sheet"] and not s1["sheet"] and s1["tool"], f"{s0} {s1}")
    finally:
        ctx.close()
    for w, h in [(390, 844), (360, 740), (320, 640)]:
        for en in (False, True):
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=2)
            if en:
                ctx.add_init_script("try{localStorage.setItem('fk-lang','en')}catch(e){}")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errs.append(f"แถบย่อ {w}: " + str(e)[:200]))
            lang = "อังกฤษ" if en else "ไทย"
            try:
                open_tool(pg, a4)
                tbtn(pg, "Place a frame" if en else "วางกรอบ").first.tap()
                pg.wait_for_timeout(300)
                tbtn(pg, "Preview result" if en else "ดูผลหลังตัด").first.tap()
                pg.wait_for_timeout(800)
                t = pg.evaluate(TB_FIT_JS)
                seen(f"{w} {lang} {t}")
                ck(f"X10 จอ {w} {lang} ตอนดูผล แถบย่อ ไม่ล้น ปุ่ม อีก N ปุ่ม อยู่ในจอครบ",
                   t and t["tight"] and t["sw"] <= t["cw"] + 1 and t["moreVis"] and t["moreR"] <= t["barR"] + 1, str(t))
                if en:
                    ck(f"F6 จอ {w} อังกฤษ แถบย่อแล้วปุ่ม อีก N ปุ่ม ไม่เหลือแค่ตัวเลข",
                       t and re.fullmatch(r"\d+", t["moreText"]) is None, t and t["moreText"])
            finally:
                ctx.close()
    # X6 อังกฤษ พับไว้ปุ่มเดียว ชื่อของปุ่มต้องเป็นเอกพจน์
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    ctx.add_init_script("try{localStorage.setItem('fk-lang','en')}catch(e){}")
    pg = ctx.new_page()
    try:
        open_tool(pg, a4)
        found = None
        for w in range(1400, 900, -4):
            pg.set_viewport_size({"width": w, "height": 900})
            pg.wait_for_timeout(100)
            t = pg.evaluate(TB_FIT_JS)
            if t and t["moreVis"] and re.match(r"1 ", t["moreLabel"] or ""):
                found = (w, t["moreLabel"], t["moreText"])
                break
        seen(str(found))
        if ck("ประชากร: อังกฤษ มีความกว้างที่พับไว้ปุ่มเดียว", found is not None):
            ck("X6 อังกฤษ พับไว้ปุ่มเดียว ชื่อสำหรับโปรแกรมอ่านจอเป็น 1 more button", found[1] == "1 more button", str(found))
    finally:
        ctx.close()


# ── ㉖ ไฟล์แปลก: ค่า มม. ผิดค้างตอนเปลี่ยนไฟล์ (S2) ใบหน้าเขียน null ทับค่าที่สืบทอด (S5) ─────────────
def sc_rv_files(pg, fx, errs):
    open_tool(pg, fx["a4"])
    click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ")
    top = pg.locator('input[data-edge="top"]')
    top.first.click()
    top.first.fill("999")
    pg.wait_for_timeout(200)
    bad = pg.evaluate("() => (document.querySelector('.cr-mm-msg') || {}).textContent || ''")
    n0 = len(errs)
    pg.locator(".dz input[type=file]").set_input_files(str(fx["union"]))
    pg.wait_for_selector(".cr-layer", timeout=25000)
    pg.wait_for_timeout(2000)
    seen(f"ข้อความค่าผิด {bad!r} ข้อผิดพลาดหลังเปลี่ยนไฟล์ {errs[n0:]}")
    ck("ประชากร: พิมพ์ 999 มม. แล้วมีข้อความเตือนค่าผิด", bad != "", bad)
    ck("S2 ค่า มม. ผิดค้างอยู่แล้วใส่ไฟล์ใหม่ ไม่มีข้อผิดพลาดในหน้า", len(errs) == n0, "; ".join(errs[n0:])[:200])
    W, H = A4
    for kind, key in (("rot", "Rotate"), ("crop", "CropBox")):
        open_tool(pg, fx["null-" + kind])
        sb = pg.locator(".cr-stage").bounding_box()
        asp = sb["width"] / sb["height"]
        mdrag(pg, *at(pg, 0.10, 0.10), *at(pg, 0.40, 0.30))
        F = frame(pg)
        out = save(pg, DL / f"rv-null-{kind}.pdf")
        crop = raw_boxes(out)[0][0] if out else None
        want = [F[0] * W, (1 - F[1] - F[3]) * H, (F[0] + F[2]) * W, (1 - F[1]) * H] if F else None
        seen(f"{kind} สัดส่วนเวที {asp:.3f} กรอบ {fmt(F)} ในไฟล์ {crop} ควรเป็น {want}")
        ck(f"ประชากร: ใบหน้า /{key} null pdf.js แสดงทั้งหน้ากระดาษตั้งเต็ม MediaBox", near(asp, W / H, 0.01), f"{asp:.3f}")
        ck(f"S5 ใบหน้าเขียน /{key} null ทับค่าที่สืบทอด กรอบในไฟล์ตรงกับที่เห็นบนจอ",
           crop is not None and want is not None and all(near(a, c, 1.5) for a, c in zip(crop, want)), f"{crop} ควรเป็น {want}")
        if out:
            back_to_edit(pg)


def selftest():
    print("ตรวจตัวตรวจเอง")
    FIX.mkdir(parents=True, exist_ok=True)
    ink = ink_box(make_faint(FIX / "st-faint.pdf"))
    ok1 = ck("ตัววัดเนื้อหาจริงเห็นเส้นบาง 0.25 พอยต์ที่ x 60 ถึง 535", ink is not None and near(ink[0], 60, 1.5) and near(ink[2], 535, 1.5),
             str(ink))
    ok2 = ck("ตัววัดเนื้อหาจริงเห็นคำสีเทาอ่อนท้ายหน้า (ล่างกว่า 812)", ink is not None and ink[3] > 812, str(ink))
    u = make_union(FIX / "st-union.pdf")
    ok3 = ck("ไฟล์ทดสอบหลายหน้า หน้า 3 ว่างจริง", ink_box(u, 2) is None and ink_box(u, 0) is not None)
    s = make_scan(FIX / "st-scan.pdf")
    d = fitz.open(str(s))
    pix = d[0].get_pixmap(dpi=150)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3].astype(int)
    d.close()
    k = 150 / 25.4
    dark = [a[int(y * k), int(x * k)].mean() < 120 for x, y in SPECKS_MM]
    ok4 = ck("ไฟล์สแกนจำลองมีฝุ่นจริงครบ 5 จุด", all(dark), str(dark))
    ok5 = ck("ตัวเช็คกรอบแน่นแดงเมื่อกรอบหลวมเกินหรือเต็มหน้า และเขียวเมื่อพอดี",
             not tight([0, 0, 595, 842], [100, 100, 200, 200], 595, 842)
             and not tight([50, 50, 300, 300], [100, 100, 200, 200], 595, 842)
             and tight([91, 91, 209, 209], [100, 100, 200, 200], 595, 842)
             and tight([0, 91, 209, 209], [4, 100, 200, 200], 595, 842))
    ok6 = ck("ตัวเช็คคลุมเนื้อหาแดงเมื่อขาดไป 2 พอยต์", not contains([100, 100, 198, 200], [100, 100, 200, 200], 0.6))
    rr = make_rotrect(FIX / "st-rot.pdf", 90)
    ok7 = ck("ไฟล์หมุน 90 ขนาดหน้าที่แสดงเป็นแนวนอน", shown_size(rr) == (842, 595), str(shown_size(rr)))
    # ไฟล์ของรอบรีวิวหลังทำ
    bp = big_page(body=False)
    dig = ink_box(bp, dpi=72)
    bp.close()
    ok8 = ck("ไฟล์ A1 มีเลขหน้าโดดเดี่ยวเหนือขอบล่างราว 120 พอยต์", dig is not None and near(dig[3], BIG[1] - 120, 4), str(dig))
    kr = raw_keys(make_null_leaf(FIX / "st-null-rot.pdf", "rot"))
    kc = raw_keys(make_null_leaf(FIX / "st-null-crop.pdf", "crop"))
    ok9 = ck("ไฟล์ null มี /Rotate null ที่ใบหน้าและ /Rotate 90 ที่ /Pages จริง (ไม่ถูกลบตอนบันทึก)",
             "/Rotate null" in kr and "/Rotate 90" in kr, str(kr))
    ok10 = ck("ไฟล์ null มี /CropBox null ที่ใบหน้าและ /CropBox [30 40 560 800] ที่ /Pages จริง",
              "/CropBox null" in kc and any(re.fullmatch(r"/CropBox\s*\[30 40 560 800\]", k) for k in kc), str(kc))
    d = fitz.open(str(make_dark_mid(FIX / "st-darkmid.pdf")))
    corner = [d[k].get_pixmap(dpi=36).pixel(2, 2)[:3] for k in range(3)]
    d.close()
    ok11 = ck("ไฟล์ว่างจริงไม่มีหมึกเลย และไฟล์ 3 หน้า มุมหน้า 2 เข้ม มุมหน้า 1 กับ 3 ขาว",
              ink_box(make_empty(FIX / "st-empty.pdf")) is None and max(corner[1]) < 100 and min(corner[0]) > 240
              and min(corner[2]) > 240, str(corner))
    good = all([ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9, ok10, ok11])
    print("\n" + ("✅ selftest: ตัววัดเนื้อหาจริง ไฟล์ทดสอบ และตัวเช็คกรอบ อ่านของที่รู้คำตอบได้ตรง" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
    return 0 if good else 1


def main():
    if SELFTEST:
        return selftest()
    FIX.mkdir(parents=True, exist_ok=True)
    DL.mkdir(parents=True, exist_ok=True)
    a4 = make_pdf(FIX / "t-a4-4.pdf", 4)
    a4b = make_pdf(FIX / "t-a4-2.pdf", 2)
    one = make_pdf(FIX / "t-one.pdf", 1)
    corners = make_rotated(FIX / "t-corners.pdf", 0)
    fx = {"faint": make_faint(FIX / "t-faint.pdf"), "union": make_union(FIX / "t-union.pdf"), "dark": make_dark(FIX / "t-dark.pdf"),
          "edges": make_edges(FIX / "t-edges.pdf"), "rot90": make_rotrect(FIX / "t-rot90.pdf", 90),
          "scan": make_scan(FIX / "t-scan.pdf"), "annot": make_annot(FIX / "t-annot.pdf"),
          "big": make_pdf(FIX / "t-big.pdf", 2000), "a4": a4,
          "a1scan": make_big_scan(FIX / "t-a1scan.pdf"), "darkmid": make_dark_mid(FIX / "t-darkmid.pdf"),
          "empty1": make_empty(FIX / "t-empty1.pdf"), "null-rot": make_null_leaf(FIX / "t-null-rot.pdf", "rot"),
          "null-crop": make_null_leaf(FIX / "t-null-crop.pdf", "crop")}
    only = [a for a in sys.argv[1:] if not a.startswith("-")]     # รันเฉพาะฉากที่ชื่อขึ้นต้นตามนี้ ไว้ไล่แก้ทีละฉาก
    errs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        plan = [("⑰ เลิกทำ ทำซ้ำ", sc_undo, pg, a4, a4b),
                ("⑱ แยกกรอบทีละหน้า", sc_each, pg, a4),
                ("⑱ข เข้าโหมดแยกจากหน้าคี่", sc_each_scope, pg, a4),
                ("⑲ ดูผลหลังตัด", sc_preview, pg, corners, a4),
                ("⑲ข ดูผลบนมือถือ", sc_preview_touch, b, a4, errs),
                ("⑳ ตัดขอบขาวอัตโนมัติ", sc_trim, pg, fx, errs),
                ("㉑ แถบบนแถวเดียว", sc_fold, b, a4, one, errs),
                ("㉒ ขอบเขตที่ไม่มีหน้าให้ตัด", sc_empty_scope, pg, one),
                ("㉓ก ขอบเขตหน้าเดียวกับโหมดแยก", sc_rv_one, pg, a4),
                ("㉓ข Ctrl+Z ในช่อง มม. ข้ามหน้า", sc_rv_mm, pg, a4),
                ("㉓ค ประกาศเลิกทำข้ามหน้า", sc_rv_note, pg, a4),
                ("㉓ง โฟกัสหลังเลิกทำกรอบ", sc_rv_undo_focus, pg, a4),
                ("㉓จ คัดลอกไปหน้าคี่หรือคู่", sc_rv_par, pg, a4),
                ("㉓ฉ ก้าวที่จบที่เดิมกับ Ctrl+Y", sc_rv_group, pg, a4),
                ("㉔ก สแกนแผ่นใหญ่กับหน้าที่หาขอบไม่ได้", sc_rv_trim_big, pg, fx),
                ("㉔ข โฟกัสหลังตัดขอบขาว", sc_rv_trim_focus, pg, b, fx, errs),
                ("㉔ค ตัดเฉพาะหน้า ไฟล์หน้าเดียว จำนวน อังกฤษ", sc_rv_trim_more, pg, b, fx, errs),
                ("㉕ก จอ 600 ปุ่มคู่ที่พับกับ Esc ซ้อนชั้น", sc_rv_narrow, b, a4, one, errs),
                ("㉕ข จอกว้าง ปุ่มที่ปิดตัวเองกับ Esc ตอนเมนูเปิด", sc_rv_wide, b, a4, errs),
                ("㉕ค มือถือ แถบย่อกับแผ่นตัวเลือก", sc_rv_mobile, b, a4, errs),
                ("㉖ ไฟล์แปลก", sc_rv_files, pg, fx, errs)]
        for name, fn, *a in plan:
            if not only or any(name.startswith(o) for o in only):
                scenario(name, fn, *a)
        b.close()
    print("\n── ข้อผิดพลาดในหน้า")
    ck("ไม่มีข้อผิดพลาดในหน้าเลย", not errs, "; ".join(errs[:3]))
    print(f"\nPASS={base.P} FAIL={len(base.F)}")
    for f in base.F:
        print("  ❌ " + f.splitlines()[0])
    return 0 if not base.F else 1


if __name__ == "__main__":
    sys.exit(main())
