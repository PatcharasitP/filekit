"""ครอบตัดขอบ PDF: แก้กรอบหลังวางได้ ซูมได้ พอดีหน้า พอดีความกว้าง ใช้นิ้วบนมือถือได้

‼️ ที่มา 02/10/2026 พี่ปอนด์: "พอจะย้ายดันย้ายไม่ได้ต้องไปวางใหม่ ... ไม่มีเครื่องมือซูม หรือ Fit to Page"
   และ "ตอนครอบไปแล้วอยากให้มันเลื่อนซ้าย เลื่อนขวาเองได้ ไม่ต้องมาครอบใหม่อีก"
   รุ่น v187 ลากในกรอบ = เริ่มวาดกรอบใหม่ทับ ลากสั้นกว่า 2% กรอบหายไปเลย ไม่มีซูม ไม่มีพอดีหน้า

‼️ รอบตรวจแย้ง 02/10/2026 (รีวิว 4 มุม ผู้ตรวจแย้งยืนยันจริง 45 ข้อ) เพิ่มฉาก ⑨ ถึง ⑰ และข้อในฉากเดิม
   ทุกข้อใหม่พิสูจน์แดงกับโค้ดก่อนแก้ก่อน ข้อที่โค้ดเดิมไม่มีบั๊ก (เช่นภาพตรงหน้า) พิสูจน์แดงด้วยตัวกลายพันธุ์

คำตอบตัดสินจากไฟล์ที่บันทึกออกมาจริง คืออ่าน /CropBox ดิบในไฟล์ (พิกัด PDF นับจากมุมล่างซ้าย)
‼️ ห้ามใช้ page.cropbox ของ PyMuPDF เทียบตรง ๆ เพราะมันกลับแกนเป็นนับจากบน
   (วัดจริง 02/10/2026: set_cropbox(30,40,500,700) ได้ /CropBox ดิบ [30 142 500 802])
หน้าที่หมุนไว้ (/Rotate) ตัดสินด้วยภาพที่ PyMuPDF วาดออกมา ไม่ใช่สูตรที่เขียนเอง จะได้ไม่ผิดพร้อมโค้ด
และวัดขนาดหน้าที่ได้ด้วย page.rect ซึ่งคิดการหมุนให้แล้ว (วัดจริง: หน้า 595 x 842 หมุน 90 ได้ 842 x 595)

ข้อประชากรไม่ว่าง: ต้องเจอมือจับ 8 จุด, อ่าน /CropBox ได้ครบทุกหน้า, ไฟล์ทดสอบที่หมุนต้องเห็นสีครบ 4 มุม,
แถบเลื่อนจริงต้องกว้าง 17 px ก่อนเชื่อผลพอดีความกว้าง
--selftest พิสูจน์ว่าตัวอ่าน /CropBox (รวมไฟล์ล็อกรหัส) ตัวดูสีมุม และไฟล์ทดสอบทุกแบบอ่านของที่รู้คำตอบได้ตรง

รัน: tests/run.sh browser_crop_edit
"""
import io
import math
import os
import pathlib
import re
import sys
import tempfile

import fitz
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_cropedit_"))
FIX, DL = ROOT / "fix", ROOT / "dl"
A4 = (595, 842)
A1 = (1684, 2384)
MM = 25.4 / 72
PW = "crop-pw-1"
THAI = re.compile(r"[฀-๿]")
BANNED = re.compile("[·—–]")

P, F = 0, []


def ck(name, ok, note=""):
    global P
    if ok:
        P += 1
    else:
        F.append(name + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f"  ({note})" if note and not ok else ""))
    return ok


def near(a, b, tol):
    return a is not None and b is not None and abs(a - b) <= tol


# ── ไฟล์ทดสอบ ────────────────────────────────────────────────────────────
COLORS = {"red": (1, 0, 0), "green": (0, 0.6, 0), "blue": (0, 0, 1), "black": (0, 0, 0)}
PAGE_COLORS = ["red", "green", "blue", "black"]      # สีกล่องกลางหน้าของหน้า 1, 2, 3, 4 (วนซ้ำ)


def make_pdf(path, n, size=A4):
    """แต่ละหน้ามีกล่องสีกลางหน้า (หน้า 1 แดง 2 เขียว 3 น้ำเงิน 4 ดำ) ไว้ดูว่าบนจอวาดหน้าไหนอยู่จริง"""
    d = fitz.open()
    for i in range(n):
        p = d.new_page(width=size[0], height=size[1])
        p.insert_text((60, 120), f"PAGE-MARK-{i + 1}", fontname="helv", fontsize=22)
        c = COLORS[PAGE_COLORS[i % 4]]
        p.draw_rect(fitz.Rect(200, 300, 400, 500), color=c, fill=c)
    d.save(str(path)); d.close()
    return path


def make_blank(path, size):
    d = fitz.open()
    p = d.new_page(width=size[0], height=size[1])
    p.insert_text((60, 120), "BLANK-MARK", fontname="helv", fontsize=22)
    d.save(str(path)); d.close()
    return path


def make_rotated(path, rot=90):
    """หน้าเดียว ทาสี 4 มุมคนละสี แล้วหมุนหน้าไว้ด้วย /Rotate (แบบไฟล์สแกนจากมือถือ)"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    s = 120
    rects = {"red": (0, 0, s, s), "green": (A4[0] - s, 0, A4[0], s),
             "blue": (0, A4[1] - s, s, A4[1]), "black": (A4[0] - s, A4[1] - s, A4[0], A4[1])}
    for name, r in rects.items():
        p.draw_rect(fitz.Rect(*r), color=COLORS[name], fill=COLORS[name])
    p.set_rotation(rot)
    d.save(str(path)); d.close()
    return path


def make_boxes(path, crop):
    """หน้า A4 ที่เขียน /CropBox ดิบเอง (ใหญ่กว่า MediaBox หรือขนาด 0) แบบไฟล์ที่มาจากโปรแกรมอื่น"""
    d = fitz.open()
    p = d.new_page(width=A4[0], height=A4[1])
    p.insert_text((60, 120), "BOX-MARK", fontname="helv", fontsize=22)
    d.xref_set_key(p.xref, "CropBox", crop)
    d.save(str(path)); d.close()
    return path


def make_mixed(path):
    """หน้า 1 กับ 3 เป็น A4 แนวตั้ง หน้า 2 เป็น A4 แนวนอน"""
    d = fitz.open()
    for w, h in [A4, (A4[1], A4[0]), A4]:
        p = d.new_page(width=w, height=h)
        p.insert_text((60, 120), "MIX-MARK", fontname="helv", fontsize=22)
    d.save(str(path)); d.close()
    return path


def make_locked(path, src):
    d = fitz.open(str(src))
    d.save(str(path), encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=PW, owner_pw="own-crop")
    d.close()
    return path


def color_name(px):
    r, g, b = px[:3]
    if r > 200 and g > 200 and b > 200: return "white"
    if r > 180 and g < 80 and b < 80: return "red"
    if g > 100 and r < 80 and b < 80: return "green"
    if b > 180 and r < 80 and g < 80: return "blue"
    if r < 60 and g < 60 and b < 60: return "black"
    return "other"


def colors_in(path, page=0):
    """สีที่มองเห็นบนหน้านั้นตามที่โปรแกรมดู PDF วาดจริง (คิด /Rotate กับ /CropBox ให้เอง)"""
    d = fitz.open(str(path))
    pix = d[page].get_pixmap(dpi=36)
    seen = {}
    for y in range(0, pix.height, 2):
        for x in range(0, pix.width, 2):
            n = color_name(pix.pixel(x, y))
            seen[n] = seen.get(n, 0) + 1
    d.close()
    return {k for k, v in seen.items() if v >= 3}


def corner_color(path, page=0):
    """สีที่มุมซ้ายบนของหน้าตามที่ตาเห็น"""
    d = fitz.open(str(path))
    pix = d[page].get_pixmap(dpi=36)
    c = color_name(pix.pixel(4, 4))
    d.close()
    return c


def shown_size(path, page=0):
    """ขนาดหน้าตามที่ตาเห็น (คิด /Rotate และ /CropBox แล้ว) เป็นพอยต์"""
    d = fitz.open(str(path))
    r = d[page].rect
    d.close()
    return r.width, r.height


def raw_boxes(path, pw=None):
    """[(crop หรือ None, media)] ต่อหน้า เป็นตัวเลขพิกัด PDF ดิบ (ไฟล์ล็อกรหัสส่งรหัสมาด้วย)"""
    def arr(d, xref, key):
        t, v = d.xref_get_key(xref, key)
        if t == "xref":
            v = d.xref_object(int(v.split()[0]))
            t = "array"
        if t != "array":
            return None
        return [float(x) for x in v.strip("[] \n").split()]
    d = fitz.open(str(path))
    if d.needs_pass and pw:
        d.authenticate(pw)
    out = [(arr(d, d[i].xref, "CropBox"), arr(d, d[i].xref, "MediaBox")) for i in range(d.page_count)]
    d.close()
    return out


def is_cropped(crop, media):
    return crop is not None and any(abs(a - b) > 0.01 for a, b in zip(crop, media))


def png_pixel(png):
    return Image.open(io.BytesIO(png)).convert("RGB").getpixel((0, 0))


# ── ตัวช่วยเบราว์เซอร์ ──────────────────────────────────────────────────
def open_tool(pg, src, wait=True):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-crop", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    if wait:
        pg.wait_for_selector(".cr-layer", timeout=25000)
        pg.wait_for_timeout(1200)


def frame(pg):
    """กรอบบนจอเป็นสัดส่วนของหน้า [x, y, w, h] หรือ None ถ้าไม่มีกรอบ"""
    return pg.evaluate("""() => {
      const k = document.querySelector('.cr-keep'), s = document.querySelector('.cr-stage');
      if (!k || !s || k.hidden || !k.getClientRects().length) return null;
      const a = k.getBoundingClientRect(), b = s.getBoundingClientRect();
      return [(a.left - b.left) / b.width, (a.top - b.top) / b.height, a.width / b.width, a.height / b.height];
    }""")


def same_frame(a, b, tol=0.004):
    return a is not None and b is not None and all(abs(x - y) <= tol for x, y in zip(a, b))


def fmt(fr):
    return "ไม่มีกรอบ" if fr is None else "[" + ", ".join(f"{v:.3f}" for v in fr) + "]"


def at(pg, rx, ry):
    """จุดบนจอจากสัดส่วนของหน้า"""
    b = pg.locator(".cr-stage").bounding_box()
    return b["x"] + b["width"] * rx, b["y"] + b["height"] * ry


def mdrag(pg, x0, y0, x1, y1, steps=8):
    pg.mouse.move(x0, y0)
    pg.mouse.down()
    pg.mouse.move(x1, y1, steps=steps)
    pg.mouse.up()
    pg.wait_for_timeout(200)


def tbtn(pg, name):
    return pg.locator(".s2-tbar").get_by_role("button", name=name, exact=True)


def has(loc):
    try:
        return loc.count() > 0
    except Exception:
        return False


def click_if(pg, loc, name):
    if not ck(f"มีปุ่ม {name}", has(loc)):
        return False
    if not loc.first.is_enabled():
        ck(f"ปุ่ม {name} กดได้", False)
        return False
    loc.first.click()
    pg.wait_for_timeout(250)
    return True


def handle(pg, h):
    return pg.locator(f'.cr-keep .cr-h[data-h="{h}"]')


def hcenter(pg, h):
    b = handle(pg, h).first.bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def zoom_pct(pg):
    t = pg.evaluate("() => (document.querySelector('.cr-zoom') || {}).textContent || ''")
    m = re.search(r"(\d+)\s*%", t)
    return int(m.group(1)) if m else None


def zoom_to(pg, pct):
    zin = tbtn(pg, "ซูมเข้า")
    for _ in range(14):
        if zoom_pct(pg) == pct or not (has(zin) and zin.first.is_enabled()):
            break
        zin.first.click()
        pg.wait_for_timeout(120)
    return zoom_pct(pg)


def geo(pg):
    return pg.evaluate("""() => {
      const s = document.querySelector('.cr-stage'), c = document.querySelector('.cr-scroll');
      const cv = s && s.querySelector('canvas');
      if (!s || !c) return null;
      const a = s.getBoundingClientRect(), b = c.getBoundingClientRect();
      return { sw: s.offsetWidth, sh: s.offsetHeight, cw: c.clientWidth, ch: c.clientHeight, ow: c.offsetWidth,
               scw: c.scrollWidth, sch: c.scrollHeight, sl: c.scrollLeft, st: c.scrollTop,
               dl: a.left - b.left, dt: a.top - b.top, cvw: cv ? cv.width : 0, dpr: devicePixelRatio };
    }""")


def page_color(pg):
    """สีกลางกล่องสีของหน้าที่วาดอยู่บนจอ อ่านจากพิกเซลของภาพหน้าจริง"""
    px = pg.evaluate("""() => {
      const c = document.querySelector('.cr-stage canvas'); if (!c || !c.width) return null;
      const d = c.getContext('2d').getImageData(Math.floor(c.width * 0.5), Math.floor(c.height * 0.475), 1, 1).data;
      return [d[0], d[1], d[2]];
    }""")
    return color_name(px) if px else None


def status_text(pg):
    return pg.evaluate("() => (document.querySelector('.cr-bar [role=status]') || {}).textContent || ''")


def visible_downloads(pg):
    """ปุ่มดาวน์โหลดที่ผู้ใช้เห็นและกดได้จริงตอนนี้ (อยู่ในจอ และจุดกลางปุ่มไม่มีอะไรบัง)"""
    return pg.evaluate("""() => [...document.querySelectorAll('button')]
      .filter(b => /ดาวน์โหลด/.test(b.textContent) && b.getClientRects().length)
      .map(b => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
                  const hit = document.elementFromPoint(x, y);
                  return { y: Math.round(y), inView: x > 0 && x < innerWidth && y > 0 && y < innerHeight,
                           hit: !!hit && (hit === b || b.contains(hit)) }; })""")


CONTRAST_JS = r"""(sel) => {
  const el = document.querySelector(sel); if (!el) return null;
  const parse = (s) => { let v = (s.match(/[\d.]+/g) || []).map(Number);
    if (s.startsWith('color(')) v = v.map((x, k) => (k < 3 ? x * 255 : x));
    return v; };
  let n = el.parentElement, bg = null;
  while (n) { const v = parse(getComputedStyle(n).backgroundColor);
    if (v.length >= 3 && (v.length < 4 || v[3] > 0.5)) { bg = v; break; } n = n.parentElement; }
  if (!bg) bg = [255, 255, 255];
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (v) => 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
  const a = L(parse(getComputedStyle(el).borderTopColor)), b = L(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}"""


def save(pg, path):
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    if not ck("ปุ่ม ครอบตัดแล้วบันทึก กดได้", has(cta) and cta.first.is_enabled()):
        return None
    cta.first.click()
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    loc.first.wait_for(state="visible", timeout=30000)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def save_or_error(pg, path):
    """เหมือน save แต่รอทั้งปุ่มดาวน์โหลดและข้อความผิดพลาด คืน (ไฟล์ หรือ None, ข้อความสถานะ)"""
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    if not (has(cta) and cta.first.is_enabled()):
        return None, "ปุ่มบันทึกกดไม่ได้"
    cta.first.click()
    pg.wait_for_function("""() => !!document.querySelector('.status.show.err') ||
      [...document.querySelectorAll('.s2-side-res button, .s2-subrow button')]
        .some(b => /ดาวน์โหลด/.test(b.textContent) && b.getClientRects().length)""", timeout=30000)
    err = pg.evaluate("() => (document.querySelector('.status.show.err') || {}).textContent || ''")
    if err:
        return None, err
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path, ""


def touch(cdp, kind, pts):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})


def tdrag(pg, cdp, x0, y0, x1, y1, steps=10):
    touch(cdp, "touchStart", [(x0, y0)])
    for k in range(1, steps + 1):
        touch(cdp, "touchMove", [(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps)])
    touch(cdp, "touchEnd", [])
    pg.wait_for_timeout(250)


def two_finger(pg, cdp, a0, b0, a1, b1, steps=10):
    touch(cdp, "touchStart", [a0])
    touch(cdp, "touchStart", [a0, b0])
    for k in range(1, steps + 1):
        t = k / steps
        touch(cdp, "touchMove", [(a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t),
                                 (b0[0] + (b1[0] - b0[0]) * t, b0[1] + (b1[1] - b0[1]) * t)])
    touch(cdp, "touchEnd", [])
    pg.wait_for_timeout(400)


def away_from_handles(pg, x, y, gap=34):
    """เลื่อนจุดให้ห่างมือจับทุกตัว นิ้วที่ลงบนมือจับคือปรับขนาด ไม่ใช่เลื่อนดู"""
    pts = pg.evaluate("""() => [...document.querySelectorAll('.cr-keep .cr-h')].map(h => {
      const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })""")
    for _ in range(12):
        if all(math.hypot(x - hx, y - hy) > gap for hx, hy in pts):
            break
        y += gap / 2
    return x, y


def scenario(name, fn, *a):
    print(f"\n── {name}")
    try:
        fn(*a)
    except Exception as e:      # ตัวเก่าไม่มีของบางอย่าง ให้แดงเป็นข้อ ไม่ใช่ล้มทั้งไฟล์
        ck(f"{name} ทำจนจบได้", False, f"{type(e).__name__}: {str(e).splitlines()[0][:160]}")


# ── ① ลากย้ายกรอบด้วยเมาส์ ──────────────────────────────────────────────
def sc_move(pg, a4):
    open_tool(pg, a4)
    ck("ไฟล์ที่ทุกหน้าขนาดเท่ากัน ไม่ขึ้นคำเตือนหน้าหลายขนาด", not pg.locator(".cr-mixed").is_visible())
    mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.5, 0.5))
    f0 = frame(pg)
    ck("ลากคลุมแล้วได้กรอบตามที่ลาก", same_frame(f0, [0.1, 0.1, 0.4, 0.4], 0.01), fmt(f0))
    mdrag(pg, *at(pg, 0.3, 0.3), *at(pg, 0.5, 0.3))
    f1 = frame(pg)
    ck("ลากในกรอบ = ย้ายทั้งกรอบไปขวา 20% ขนาดเท่าเดิม",
       same_frame(f1, [f0[0] + 0.2, f0[1], f0[2], f0[3]] if f0 else None, 0.006), f"ก่อน {fmt(f0)} หลัง {fmt(f1)}")
    x, y = at(pg, 0.85, 0.85)
    mdrag(pg, x, y, x + 3, y + 2, steps=2)
    f2 = frame(pg)
    ck("คลิกพลาดนอกกรอบ กรอบเดิมต้องยังอยู่", same_frame(f2, f1), f"ก่อน {fmt(f1)} หลัง {fmt(f2)}")
    out = save(pg, DL / "move.pdf")
    if not out:
        return
    bx = raw_boxes(out)
    ck("อ่าน /CropBox ได้ครบ 4 หน้า", len(bx) == 4 and all(c for c, _ in bx), str(len(bx)))
    c = bx[0][0]
    want_x0 = f1[0] * A4[0] if f1 else None
    ck("ไฟล์จริง ขอบซ้ายของกรอบเลื่อนตามที่ย้ายบนจอ", c and near(c[0], want_x0, 2.0), f"ได้ {c} ควรได้ x0 ราว {want_x0}")
    ck("ไฟล์จริง ความกว้างกรอบเท่าก่อนย้าย", c and near(c[2] - c[0], f0[2] * A4[0], 2.0), f"ได้ {c}")
    ck("ทุกหน้าได้กรอบเดียวกัน", all(b[0] == c for b in bx))


# ── ② มือจับ 8 จุด กันกรอบหลุดหน้า หน้าผลลัพธ์ และบันทึกรอบสอง ──────────────
def sc_handles(pg, a4):
    open_tool(pg, a4)
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    f0 = frame(pg)
    ck("วางกรอบ = กรอบห่างขอบ 5% ทุกด้าน", same_frame(f0, [0.05, 0.05, 0.9, 0.9], 0.003), fmt(f0))
    n = pg.locator(".cr-keep .cr-h").count()
    if not ck("มีมือจับครบ 8 จุด", n == 8, f"เจอ {n}"):
        return
    w = pg.locator(".cr-stage").bounding_box()["width"]
    h = pg.locator(".cr-stage").bounding_box()["height"]
    x, y = hcenter(pg, "e")
    mdrag(pg, x, y, x - 0.2 * w, y)
    f1 = frame(pg)
    ck("ลากมือจับขวา กรอบแคบลง 20% ขอบซ้ายอยู่ที่เดิม", same_frame(f1, [0.05, 0.05, 0.7, 0.9], 0.006), fmt(f1))
    x, y = hcenter(pg, "nw")
    mdrag(pg, x, y, x + 0.1 * w, y + 0.1 * h)
    f2 = frame(pg)
    ck("ลากมุมซ้ายบน ขอบซ้ายกับบนขยับ ขอบขวากับล่างอยู่ที่เดิม", same_frame(f2, [0.15, 0.15, 0.6, 0.8], 0.006), fmt(f2))
    out = save(pg, DL / "handles.pdf")
    if out:
        c = raw_boxes(out)[0][0]
        want = [0.15 * A4[0], (1 - 0.95) * A4[1], 0.75 * A4[0], (1 - 0.15) * A4[1]]
        ck("ไฟล์จริงได้กรอบตามมือจับ", c and all(near(a, b, 2.5) for a, b in zip(c, want)), f"ได้ {c} ควรได้ราว {want}")
        # ‼️ รอบตรวจแย้ง: หน้าผลลัพธ์บนจอกว้างยังเห็นกรอบ เดิมลากแก้ได้ แต่ปุ่มดาวน์โหลดยังเป็นไฟล์ของกรอบเก่า
        before = frame(pg)
        x, y = at(pg, 0.45, 0.55)
        mdrag(pg, x, y, x + 0.1 * w, y)
        after = frame(pg)
        ck("หน้าผลลัพธ์ แก้กรอบไม่ได้ (ไฟล์ที่ดาวน์โหลดต้องตรงกับกรอบที่เห็น)", same_frame(before, after, 0.002),
           f"ก่อน {fmt(before)} หลัง {fmt(after)}")
        pg.locator(".s2-res-row button").filter(has_text="กลับไปแก้").first.click()
        pg.wait_for_timeout(400)
    # ‼️ ต้องลากย้ายตอนกรอบยังใหญ่ กรอบกว้าง 2% (ราว 10 px) จุดกลางกรอบอยู่ในพื้นที่รับคลิกของมือจับ
    #    กดตรงนั้นคือจับมือจับ ไม่ใช่ย้าย (รอบแรกเทสสลับลำดับไว้ ได้ค่าเดิมทุกตัว เพราะไปจับมือจับซ้าย)
    f3 = frame(pg)
    x, y = at(pg, f3[0] + f3[2] / 2, f3[1] + f3[3] / 2) if f3 else at(pg, 0.5, 0.5)
    mdrag(pg, x, y, x + 2 * w, y + 2 * h)
    f4 = frame(pg)
    ck("ลากกรอบออกนอกหน้า กรอบหยุดที่ขอบหน้า ขนาดเท่าเดิม",
       f4 is not None and f3 is not None and near(f4[0] + f4[2], 1, 0.004) and near(f4[1] + f4[3], 1, 0.004)
       and near(f4[2], f3[2], 0.004) and near(f4[3], f3[3], 0.004), f"ก่อน {fmt(f3)} หลัง {fmt(f4)}")
    x, y = hcenter(pg, "w")
    mdrag(pg, x, y, x + 2 * w, y)
    f5 = frame(pg)
    # ‼️ รอบตรวจแย้ง: เดิมรับกว้างแค่มากกว่า 0.5% ค่า MIN = 1% ก็ผ่าน ต้องเท่า 2% จริง
    ck("ลากขอบซ้ายเลยขอบขวา กรอบไม่กลับด้าน หยุดที่กว้าง 2% ขอบขวาอยู่ที่เดิม",
       f5 is not None and near(f5[2], 0.02, 0.003) and near(f5[0] + f5[2], 1, 0.006), fmt(f5))
    # ‼️ รอบตรวจแย้ง: บันทึกรอบสองหลัง "กลับไปแก้" ต้องเห็นปุ่มดาวน์โหลด (เดิมตกไปอยู่ใต้หน้ากระดาษ มองไม่เห็น)
    x, y = hcenter(pg, "w")
    mdrag(pg, x, y, x - 0.4 * w, y)
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    if not ck("บันทึกรอบสองกดได้", has(cta) and cta.first.is_enabled()):
        return
    cta.first.click()
    pg.wait_for_timeout(2500)
    vd = visible_downloads(pg)
    ck("บันทึกรอบสองหลังกลับไปแก้ เห็นปุ่มดาวน์โหลดในจอและกดได้", any(v["inView"] and v["hit"] for v in vd), str(vd))
    # ‼️ ต้องขยับไปทางที่ยังมีที่ว่าง กรอบตอนนี้ชิดขอบขวา (รอบแรกเทสกดลูกศรขวา กรอบชนขอบไม่ขยับ
    #    แถวดาวน์โหลดจึงยังตรงกับกรอบและไม่ควรหาย เป็นค่าที่คาดผิดเอง ไม่ใช่บั๊ก) จึงกดซ้ายและเช็กว่ากรอบขยับจริง
    fb = frame(pg)
    pg.locator(".cr-keep").first.focus()
    pg.keyboard.press("ArrowLeft")
    pg.wait_for_timeout(300)
    fa = frame(pg)
    vd2 = visible_downloads(pg)
    ck("ขยับกรอบหลังบันทึก แถวดาวน์โหลดเก่าที่ไม่ตรงกรอบแล้วหายไป",
       fb is not None and fa is not None and not same_frame(fa, fb, 0.0005) and not vd2,
       f"กรอบ {fmt(fb)} -> {fmt(fa)} ปุ่ม {vd2}")


# ── ③ คีย์บอร์ดกับช่องระยะขอบ มม. (ค่าแม่นถึงทศนิยม) ─────────────────────
def sc_keys(pg, a4):
    open_tool(pg, a4)
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    ck("วางกรอบแล้วโฟกัสอยู่ที่กรอบ พร้อมกดลูกศรต่อได้",
       pg.evaluate("() => !!document.activeElement && document.activeElement.classList.contains('cr-keep')"))
    role = pg.evaluate("() => { const k = document.querySelector('.cr-keep'); return [k.getAttribute('role'), k.getAttribute('aria-roledescription')]; }")
    ck("กรอบเป็น role application มีคำบอกชนิด (โปรแกรมอ่านหน้าจอส่งลูกศรถึงกรอบได้)",
       role[0] == "application" and bool(role[1]), str(role))
    valid = pg.evaluate("() => [...document.querySelectorAll('input[data-edge]')].map(i => i.validity.valid)")
    ck("ช่อง มม. ทั้ง 4 ช่องผ่านกติกาของเบราว์เซอร์เอง (ค่าทศนิยม 1 ตำแหน่งตรงกับ step)",
       len(valid) == 4 and all(valid), str(valid))
    s0 = status_text(pg)
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(80)
    s1 = status_text(pg)
    ck("ย้ายกรอบด้วยลูกศร แถบสถานะบอกตำแหน่งใหม่ (โปรแกรมอ่านหน้าจอรู้ว่ากรอบไปอยู่ไหน)",
       bool(s0) and s1 != s0, f"ก่อน {s0[-40:]!r} หลัง {s1[-40:]!r}")
    for k in ["Shift+ArrowRight", "Alt+ArrowLeft", "Alt+Shift+ArrowUp"]:
        pg.keyboard.press(k)
        pg.wait_for_timeout(60)
    ring = pg.evaluate("""() => { const k = document.querySelector('.cr-keep'), s = getComputedStyle(k).boxShadow;
      return { fv: k.matches(':focus-visible'), dark: s.includes('rgb(17, 17, 17)'), white: s.includes('rgb(255, 255, 255)') }; }""")
    ck("วงโฟกัสของกรอบเป็นขาวคู่ดำ เห็นได้ทั้งบนเงามืดและบนกระดาษ", ring["fv"] and ring["dark"] and ring["white"], str(ring))
    top = pg.locator('input[data-edge="top"]')
    if not ck("มีช่องระยะขอบบน", has(top)):
        return
    # ‼️ เจอจากภาพจอ 02/10/2026: ช่องฝั่งขวาล้นออกนอกแผงขวา เพราะ .field กลางของเว็บมี min-width:170px
    ov = pg.evaluate("""() => {
      const p = document.querySelector('.s2-side-bd'); if (!p) return null;
      const r = p.getBoundingClientRect();
      const ins = [...document.querySelectorAll('input[data-edge]')];
      return { n: ins.length, over: ins.filter(i => i.getBoundingClientRect().right > r.right + 0.5).length,
               sw: p.scrollWidth, cw: p.clientWidth };
    }""")
    ck("ช่องระยะขอบ 4 ช่องอยู่ในแผงขวาครบ ไม่ล้นขอบแผง",
       bool(ov) and ov["n"] == 4 and ov["over"] == 0 and ov["sw"] <= ov["cw"] + 1, str(ov))
    top.first.fill("20")
    pg.wait_for_timeout(250)
    left = pg.locator('input[data-edge="left"]')
    lv = left.first.input_value() if has(left) else ""
    ck("ช่องขอบซ้ายบอกระยะใหม่ 14.4 มม. (5% + 11 พอยต์)", near(float(lv or "nan"), 14.4, 0.051) if lv else False, f"ได้ {lv!r}")
    # ‼️ รอบตรวจแย้ง: พิมพ์ค่าที่ใช้ไม่ได้ เดิมมีแค่ขอบแดง ไม่บอกเลยว่าใส่ได้ถึงเท่าไร
    left.first.fill("300")
    pg.wait_for_timeout(200)
    msg = pg.evaluate("""() => { const i = document.querySelector('input[data-edge="left"]');
      const id = i.getAttribute('aria-describedby'); const m = id && document.getElementById(id);
      return { inv: i.getAttribute('aria-invalid'), text: m ? m.textContent : '', vis: !!m && !!m.getClientRects().length }; }""")
    ck("พิมพ์ระยะเกิน บอกเป็นคำว่าใส่ได้ไม่เกินกี่ มม. และผูกข้อความกับช่อง",
       msg["inv"] == "true" and msg["vis"] and re.search(r"\d+(\.\d)? มม", msg["text"]) is not None, str(msg))
    pg.keyboard.press("Tab")
    pg.wait_for_timeout(200)
    back = pg.evaluate("""() => { const i = document.querySelector('input[data-edge="left"]');
      const m = document.getElementById(i.getAttribute('aria-describedby') || ''); return [i.value, m ? m.textContent : '']; }""")
    ck("ออกจากช่องแล้วคืนค่าเดิม และบอกว่าคืนค่าเดิมให้", near(float(back[0] or "nan"), 14.4, 0.051) and "คืนค่าเดิม" in back[1],
       str(back))
    out = save(pg, DL / "keys.pdf")
    if not out:
        return
    c = raw_boxes(out)[0][0]
    want = [29.75 + 11, 842 - (42.1 + 757.8 - 10), 29.75 + 11 + 535.5 - 1, 842 - 20 / MM]
    ck("ไฟล์จริงตรงทุกด้าน: ลูกศร 1 พอยต์, Shift 10 พอยต์, Alt ปรับขนาด, ขอบบน 20 มม.",
       c is not None and all(near(a, b, 0.02) for a, b in zip(c, want)),
       f"ได้ {c} ควรได้ {[round(v, 3) for v in want]}")


# ── ④ ซูม พอดีหน้า พอดีความกว้าง เปลี่ยนหน้า ──────────────────────────────
def sc_view(pg, a4):
    open_tool(pg, a4)
    g = geo(pg)
    ck("เปิดไฟล์มาเห็นทั้งหน้าพอดีจอ ไม่ต้องเลื่อน",
       g and g["scw"] <= g["cw"] + 1 and g["sch"] <= g["ch"] + 1
       and (g["sw"] >= g["cw"] - 60 or g["sh"] >= g["ch"] - 60), str(g))
    z = zoom_pct(pg)
    real = g["sw"] / (A4[0] * 96 / 72) * 100 if g else None
    ck("ตัวเลข % ตรงกับขนาดจริงบนจอ (100% = ขนาดกระดาษจริง)", z is not None and near(z, real, 1.5), f"ป้าย {z} วัดได้ {real}")
    ck("บนจอวาดหน้า 1 จริง (กล่องสีแดง)", page_color(pg) == "red", str(page_color(pg)))
    pin_border = pg.evaluate(CONTRAST_JS, ".cr-pgin")
    ck("เส้นขอบช่องเลขหน้าเข้มพอ (อย่างน้อย 3:1 กับพื้นแถบ)", pin_border is not None and pin_border >= 3,
       f"{pin_border and round(pin_border, 2)}:1")
    mdrag(pg, *at(pg, 0.2, 0.2), *at(pg, 0.7, 0.6))
    f0 = frame(pg)
    if not click_if(pg, tbtn(pg, "พอดีความกว้าง"), "พอดีความกว้าง"):
        return
    g = geo(pg)
    ck("พอดีความกว้าง: หน้ากว้างเกือบเต็มช่อง ไม่มีแถบเลื่อนแนวนอน",
       g and g["sw"] >= g["cw"] - 60 and g["sw"] <= g["cw"] and g["scw"] <= g["cw"] + 1, str(g))
    ck("พอดีความกว้าง: หน้ายาวกว่าช่อง เลื่อนลงดูได้", g and g["sch"] > g["ch"] + 50, str(g))
    f1 = frame(pg)
    ck("ซูมแล้วกรอบยังอยู่ตำแหน่งเดิมบนหน้า", same_frame(f0, f1, 0.003), f"ก่อน {fmt(f0)} หลัง {fmt(f1)}")
    click_if(pg, tbtn(pg, "พอดีหน้า"), "พอดีหน้า")
    g = geo(pg)
    ck("พอดีหน้า: กลับมาเห็นทั้งหน้า", g and g["scw"] <= g["cw"] + 1 and g["sch"] <= g["ch"] + 1, str(g))
    z0 = zoom_pct(pg)
    click_if(pg, tbtn(pg, "ซูมเข้า"), "ซูมเข้า")
    z1 = zoom_pct(pg)
    g = geo(pg)
    ck("ซูมเข้า: ตัวเลขเพิ่มและหน้ากว้างขึ้นตามจริง",
       z0 and z1 and z1 > z0 and near(g["sw"] / (A4[0] * 96 / 72) * 100, z1, 1.5), f"{z0} -> {z1}, {g and g['sw']}")
    # ‼️ รอบตรวจแย้ง: ป้าย % เดิมพูดเองทุกครั้งที่กล่องเปลี่ยนขนาด และพูดแค่ตัวเลขไม่มีคำว่าซูม
    pg.wait_for_timeout(600)
    say = pg.evaluate("""() => { const z = document.querySelector('.cr-zoom');
      const s = [...document.querySelectorAll('.cr-wrap [role=status]')].map(n => n.textContent).find(t => /ซูม/.test(t));
      return { live: z && z.getAttribute('aria-live'), say: s || '' }; }""")
    ck("ซูมเสร็จแล้วบอกโปรแกรมอ่านหน้าจอว่า ซูม กี่ % ส่วนป้ายตัวเลขไม่พูดเอง",
       say["live"] is None and say["say"] == f"ซูม {z1}%", str(say))
    click_if(pg, tbtn(pg, "ซูมออก"), "ซูมออก")
    click_if(pg, tbtn(pg, "ซูมออก"), "ซูมออก")
    z2 = zoom_pct(pg)
    ck("ซูมออก: ตัวเลขลดลง", z1 and z2 and z2 < z1, f"{z1} -> {z2}")
    # Ctrl + ล้อเมาส์ ซูมรอบจุดที่ชี้ จุดของหน้าที่อยู่ใต้เมาส์ต้องอยู่ที่เดิม
    # ‼️ วัดตอนหน้าใหญ่กว่ากล่องทั้งสองแกน หน้าที่เล็กกว่ากล่องถูกจัดกลางไว้ จุดใต้เมาส์คงที่ไม่ได้อยู่แล้ว
    #    (รอบแรกเทสวัดตอนหน้าเล็กกว่ากล่อง ได้ 0.36 แทน 0.30 เป็นค่าคาดที่เป็นไปไม่ได้ ไม่ใช่บั๊ก)
    zin = tbtn(pg, "ซูมเข้า")
    zoom_to(pg, 200)
    pg.evaluate("() => { const c = document.querySelector('.cr-scroll');"
                " c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2; c.scrollTop = (c.scrollHeight - c.clientHeight) / 2; }")
    sb = pg.locator(".cr-scroll").bounding_box()
    px, py = sb["x"] + sb["width"] * 0.4, sb["y"] + sb["height"] * 0.45
    b = pg.locator(".cr-stage").bounding_box()
    rx0, ry0 = (px - b["x"]) / b["width"], (py - b["y"]) / b["height"]
    z2 = zoom_pct(pg)
    pg.mouse.move(px, py)
    pg.keyboard.down("Control")
    pg.mouse.wheel(0, -240)
    pg.keyboard.up("Control")
    pg.wait_for_timeout(300)
    z3 = zoom_pct(pg)
    b = pg.locator(".cr-stage").bounding_box()
    rx, ry = (px - b["x"]) / b["width"], (py - b["y"]) / b["height"]
    ck("Ctrl กับล้อเมาส์ ซูมเข้า", z2 == 200 and z3 and z3 > z2, f"{z2} -> {z3}")
    ck("Ctrl กับล้อเมาส์ จุดของหน้าใต้เมาส์ยังอยู่ที่เดิม", near(rx, rx0, 0.004) and near(ry, ry0, 0.004),
       f"ก่อน {rx0:.4f}, {ry0:.4f} หลัง {rx:.4f}, {ry:.4f}")
    for _ in range(12):
        if not (has(zin) and zin.first.is_enabled()):
            break
        zin.first.click()
        pg.wait_for_timeout(120)
    ck("ซูมเข้าได้ถึง 400% แล้วปุ่มซูมเข้ากดไม่ได้", zoom_pct(pg) == 400 and has(zin) and not zin.first.is_enabled(), str(zoom_pct(pg)))
    pg.evaluate("() => { const c = document.querySelector('.cr-scroll'); c.scrollLeft = 0; c.scrollTop = 0; }")
    g = geo(pg)
    ck("ซูมใหญ่แล้วเลื่อนไปซ้ายสุดได้ ขอบซ้ายของหน้าไม่หายไปนอกจอ", g and g["dl"] >= 0, str(g))
    click_if(pg, tbtn(pg, "ซูมออก"), "ซูมออก")
    click_if(pg, tbtn(pg, "ซูมออก"), "ซูมออก")
    pg.wait_for_timeout(900)
    g = geo(pg)
    ck("ซูม 200% แล้วภาพคมตามซูม (เรนเดอร์ใหม่ ไม่ใช่ขยายภาพเดิม)",
       zoom_pct(pg) == 200 and g and g["cvw"] >= g["sw"] * g["dpr"] * 0.85, f"{zoom_pct(pg)}% canvas {g and g['cvw']} หน้า {g and g['sw']}")
    # เปลี่ยนหน้า
    pin = pg.locator(".s2-tbar").get_by_role("spinbutton")
    if not ck("มีช่องเลขหน้าในแถบบน", has(pin)):
        return
    ck("เริ่มที่หน้า 1 และบอกจำนวนหน้า / 4", pin.first.input_value() == "1"
       and "/ 4" in pg.locator(".s2-tbar").inner_text(), pg.locator(".s2-tbar").inner_text()[:80])
    prev, nxt = tbtn(pg, "หน้าก่อนหน้า"), tbtn(pg, "หน้าถัดไป")
    ck("หน้าแรก ปุ่มหน้าก่อนหน้ากดไม่ได้", has(prev) and not prev.first.is_enabled())
    click_if(pg, nxt, "หน้าถัดไป")
    ck("กดหน้าถัดไป ไปหน้า 2", pin.first.input_value() == "2", pin.first.input_value())
    pg.wait_for_timeout(700)
    ck("บนจอวาดหน้า 2 จริง (กล่องสีเขียว)", page_color(pg) == "green", str(page_color(pg)))
    pin.first.fill("4")
    pin.first.press("Enter")
    pg.wait_for_timeout(700)
    ck("พิมพ์ 4 แล้วกด Enter ไปหน้า 4 และปุ่มหน้าถัดไปกดไม่ได้",
       pin.first.input_value() == "4" and has(nxt) and not nxt.first.is_enabled(), pin.first.input_value())
    ck("บนจอวาดหน้า 4 จริง (กล่องสีดำ)", page_color(pg) == "black", str(page_color(pg)))
    f2 = frame(pg)
    ck("เปลี่ยนหน้าแล้วกรอบยังอยู่ที่เดิม", same_frame(f0, f2, 0.003), f"{fmt(f0)} -> {fmt(f2)}")
    # ‼️ รอบตรวจแย้ง: กดหน้าถัดไปด้วยคีย์บอร์ดจนถึงหน้าสุดท้าย ปุ่มปิดตัวเองแล้วโฟกัสหลุดไปทั้งหน้า
    prev.first.click()
    pg.wait_for_timeout(500)
    nxt.first.focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    act = pg.evaluate("() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.tagName) : null; }")
    ck("กดหน้าถัดไปด้วยคีย์บอร์ดจนสุด โฟกัสย้ายไปปุ่มหน้าก่อนหน้า ไม่หลุด", act == "หน้าก่อนหน้า", str(act))
    pg.locator(".cr-keep").first.evaluate("k => k.focus()")
    pg.keyboard.press("Delete")
    pg.wait_for_timeout(200)
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    ck("กด Delete ที่กรอบ กรอบหายและปุ่มบันทึกกดไม่ได้", frame(pg) is None and not cta.first.is_enabled())
    # ‼️ รอบตรวจแย้ง: ข้อภาพคมข้างบนวัดภาพที่วาดไว้ตอนซูม 287% จึงผ่านได้แม้ 200% ไม่เคยวาดใหม่
    #    วัดใหม่จากไฟล์ที่เพิ่งเปิด ซูมจากพอดีหน้าขึ้นไป 200% ตรง ๆ
    open_tool(pg, a4)
    zf = zoom_to(pg, 200)
    pg.wait_for_timeout(900)
    g = geo(pg)
    ck("เปิดใหม่แล้วซูมจากพอดีหน้าถึง 200% ภาพคมทันที",
       zf == 200 and g and g["cvw"] >= g["sw"] * g["dpr"] * 0.85, f"{zf}% canvas {g and g['cvw']} หน้า {g and g['sw']}")


# ── ⑤ เปลี่ยนหน้าแล้วใช้กับหน้าที่เห็นอยู่ ต้องตัดหน้านั้นจริง ────────────────
def sc_onepage(pg, a4):
    open_tool(pg, a4)
    nxt = tbtn(pg, "หน้าถัดไป")
    if not click_if(pg, nxt, "หน้าถัดไป"):
        return
    nxt.first.click()
    pg.wait_for_timeout(500)
    pg.locator(".s2-side-bd select").first.select_option("one")
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    out = save(pg, DL / "one.pdf")
    if out:
        cut = [is_cropped(c, m) for c, m in raw_boxes(out)]
        ck("ตัดเฉพาะหน้า 3 ที่เปิดดูอยู่", cut == [False, False, True, False], str(cut))


# ── ⑥ หน้าที่หมุนไว้ (/Rotate) กรอบบนจอต้องตรงกับที่ได้ในไฟล์ ────────────────
# ‼️ จับได้ตอนเขียนเทสนี้ 02/10/2026: รุ่น v187 ครอบมุมซ้ายบนของหน้าที่หมุน 90 บนจอ
#    ได้ไฟล์ที่เห็นมุมแดงแทนมุมน้ำเงินที่เห็นบนจอ คือกรอบลงไฟล์ผิดมุม (ไฟล์สแกนจากมือถือหมุนหน้ากันบ่อย)
# ‼️ รอบตรวจแย้ง: กรอบเกือบจัตุรัสจับไม่ได้ถ้าโค้ดลืมสลับกว้างกับสูงตอนหมุน 90 และ 270
#    (ผู้ตรวจแย้งลองเขียน CropBox แบบไม่สลับ ยังเห็นแต่สีมุมที่ถูก) จึงใช้กรอบผอมสูงและวัดขนาดหน้าที่ได้ด้วย
def sc_rotated(pg, rots):
    for deg, rot in rots:
        want = corner_color(rot)
        seen = colors_in(rot)
        ck(f"หมุน {deg}: ไฟล์ทดสอบเห็นสีครบ 4 มุม", {"red", "green", "blue", "black"} <= seen, str(seen))
        open_tool(pg, rot)
        b = pg.locator(".cr-stage").bounding_box()
        wide = deg in (90, 270)
        ck(f"หมุน {deg}: บนจอแสดงแนว{'นอน' if wide else 'ตั้ง'}ตามที่โปรแกรมดู PDF แสดง",
           (b["width"] > b["height"]) == wide, f"{b['width']:.0f} x {b['height']:.0f}")
        mdrag(pg, *at(pg, 0.03, 0.04), *at(pg, 0.13, 0.64))
        fr = frame(pg)
        out = save(pg, DL / f"rot{deg}.pdf")
        if not out or not fr:
            continue
        got = colors_in(out)
        others = {"red", "green", "blue", "black"} - {want}
        ck(f"หมุน {deg}: ครอบมุมซ้ายบนบนจอ ไฟล์ที่ได้ต้องเห็นสีมุมซ้ายบน ({want}) และไม่เห็นมุมอื่น",
           want in got and not (got & others), f"เห็น {sorted(got)}")
        W, H = (A4[1], A4[0]) if wide else A4
        sw, sh = shown_size(out)
        ck(f"หมุน {deg}: หน้าที่ได้กว้างและสูงตามกรอบผอมบนจอ ({fr[2] * W:.0f} x {fr[3] * H:.0f} พอยต์)",
           near(sw, fr[2] * W, 2.5) and near(sh, fr[3] * H, 2.5), f"ได้ {sw:.1f} x {sh:.1f}")


# ── ⑦ มือถือ: นิ้วเดียวย้ายและปรับกรอบ สองนิ้วซูมและเลื่อน ────────────────
def sc_mobile(b, a4, errs):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                        device_scale_factor=3, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("มือถือ: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        ow = pg.evaluate("() => document.documentElement.scrollWidth")
        ck("จอ 390 ไม่มีเลื่อนแนวนอนทั้งหน้า", ow <= 391, str(ow))
        seps = pg.evaluate("() => [...document.querySelectorAll('.s2-tbar .sep')].map(s => getComputedStyle(s).display)")
        ck("จอ 390 ซ่อนเส้นคั่นกลุ่มในแถบบน (แถบพับหลายแถว เส้นไปค้างท้ายแถว)",
           len(seps) >= 2 and all(d == "none" for d in seps), str(seps))
        pl_btn = tbtn(pg, "วางกรอบ")
        if not ck("มีปุ่ม วางกรอบ", has(pl_btn)):
            return
        pl_btn.first.tap()
        pg.wait_for_timeout(300)
        f0 = frame(pg)
        ck("แตะ วางกรอบ แล้วได้กรอบ", f0 is not None, fmt(f0))
        if not has(handle(pg, "se")):
            ck("มีมือจับให้นิ้วจับ", False)
            return
        hb = handle(pg, "se").first.bounding_box()
        ck("มือจับบนจอสัมผัสใหญ่พอให้นิ้วเห็น (อย่างน้อย 18 px)", hb["width"] >= 17.5 and hb["height"] >= 17.5, str(hb))
        cdp = ctx.new_cdp_session(pg)
        w = pg.locator(".cr-stage").bounding_box()["width"]
        x, y = hcenter(pg, "se")
        tdrag(pg, cdp, x, y, x - 0.2 * w, y - 0.2 * w)
        f1 = frame(pg)
        ck("นิ้วลากมุมขวาล่าง = กรอบเล็กลง มุมซ้ายบนอยู่ที่เดิม",
           f1 is not None and f0 is not None and near(f1[2], f0[2] - 0.2, 0.01) and near(f1[0], f0[0], 0.006) and near(f1[1], f0[1], 0.006),
           f"{fmt(f0)} -> {fmt(f1)}")
        # ‼️ ย้ายไปขวา กรอบที่วางไว้ห่างขอบซ้ายแค่ 5% ย้ายซ้าย 10% จะชนขอบหน้าก่อน (รอบแรกเทสคาดผิดตรงนี้)
        x, y = at(pg, f1[0] + f1[2] / 2, f1[1] + f1[3] / 2) if f1 else at(pg, 0.5, 0.5)
        tdrag(pg, cdp, x, y, x + 0.1 * w, y)
        f2 = frame(pg)
        ck("นิ้วลากในกรอบ = ย้ายกรอบไปขวา 10% ขนาดเท่าเดิม",
           same_frame(f2, [f1[0] + 0.1, f1[1], f1[2], f1[3]] if f1 else None, 0.01), f"{fmt(f1)} -> {fmt(f2)}")
        z0 = zoom_pct(pg)
        cx, cy = at(pg, 0.5, 0.5)
        two_finger(pg, cdp, (cx - 30, cy), (cx + 30, cy), (cx - 90, cy), (cx + 90, cy))
        z1 = zoom_pct(pg)
        f3 = frame(pg)
        ck("สองนิ้วถ่างออก = ซูมเข้า", z0 and z1 and z1 > z0 * 1.5, f"{z0} -> {z1}")
        ck("ถ่างนิ้วแล้วกรอบไม่ขยับ", same_frame(f2, f3, 0.006), f"{fmt(f2)} -> {fmt(f3)}")
        g0 = geo(pg)
        two_finger(pg, cdp, (cx - 40, cy + 60), (cx + 40, cy + 60), (cx - 40, cy - 60), (cx + 40, cy - 60))
        g1 = geo(pg)
        f4 = frame(pg)
        ck("สองนิ้วปัดขึ้น = เลื่อนดูส่วนล่างของหน้า", g0 and g1 and g1["st"] > g0["st"] + 40, f"{g0 and g0['st']} -> {g1 and g1['st']}")
        ck("ปัดสองนิ้วแล้วกรอบไม่ขยับ", same_frame(f3, f4, 0.006), f"{fmt(f3)} -> {fmt(f4)}")
        # ‼️ รอบตรวจแย้ง: ซูมจนหน้าล้นจอแล้ว นิ้วเดียวต้องเลื่อนดูได้ (เดิมต้องใช้สองนิ้ว นิ้วเดียวไปย้ายกรอบโดยไม่เห็นขอบ)
        ck("ตอนนี้หน้าล้นจอจริง (ก่อนวัดนิ้วเดียวเลื่อนดู)", g1 and g1["sch"] > g1["ch"] + 100, str(g1))
        sb = pg.locator(".cr-scroll").bounding_box()
        px, py = away_from_handles(pg, sb["x"] + sb["width"] * 0.5, sb["y"] + sb["height"] * 0.55)
        tdrag(pg, cdp, px, py, px, py - 80)
        g2 = geo(pg)
        f5 = frame(pg)
        ck("ซูมอยู่ นิ้วเดียวปัดขึ้น = เลื่อนดู", g1 and g2 and g2["st"] > g1["st"] + 50, f"{g1 and g1['st']} -> {g2 and g2['st']}")
        ck("นิ้วเดียวเลื่อนดูแล้วกรอบไม่ขยับ", same_frame(f4, f5, 0.004), f"{fmt(f4)} -> {fmt(f5)}")
    finally:
        ctx.close()


# ── ⑧ ภาษาอังกฤษ และกฎข้อความ ──────────────────────────────────────────
# ‼️ รอบตรวจแย้ง: เดิมอ่านแค่ innerText ตอนยังไม่มีกรอบ จึงไม่เห็นข้อความแนะนำของจอสัมผัส (ซ่อนบนจอเมาส์)
#    ชื่อกรอบ ข้อความผิดพลาด และสถานะซูม ตอนนี้วางกรอบ พิมพ์ค่าผิด ซูม แล้วอ่าน textContent ทุกโหนดรวมที่ซ่อน
def sc_english(b, a4, errs):
    ctx = b.new_context(viewport={"width": 1400, "height": 1000})
    ctx.add_init_script("try{localStorage.setItem('fk-lang','en')}catch(e){}")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("EN: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        for name in ["Previous page", "Next page", "Zoom out", "Zoom in", "Fit page", "Fit width",
                     "Place a frame", "Clear the frame"]:
            ck(f"แถบบนมีปุ่ม {name}", has(tbtn(pg, name)))
        if has(tbtn(pg, "Place a frame")):
            tbtn(pg, "Place a frame").first.click()
            pg.wait_for_timeout(200)
        if has(tbtn(pg, "Zoom in")):
            tbtn(pg, "Zoom in").first.click()
            pg.wait_for_timeout(600)
        left = pg.locator('input[data-edge="left"]')
        if has(left):
            left.first.fill("999")
            pg.wait_for_timeout(150)
        txt = pg.evaluate("""() => {
          const out = [];
          for (const sel of ['.s2-tbar', '.cr-wrap', '.s2-side-bd', '.s2-side-ft']) {
            const n = document.querySelector(sel); if (!n) continue;
            const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
            for (let t = w.nextNode(); t; t = w.nextNode()) {
              if (t.parentElement && t.parentElement.closest('style, script')) continue;
              out.push(t.nodeValue);
            }
            n.querySelectorAll('[aria-label], [aria-roledescription], [placeholder]').forEach(e => {
              for (const a of ['aria-label', 'aria-roledescription', 'placeholder']) if (e.getAttribute(a)) out.push(e.getAttribute(a));
            });
          }
          return out.join('\\n');
        }""")
        th = THAI.findall(txt)
        ck("โหมดอังกฤษไม่มีภาษาไทยหลุด รวมข้อความที่ซ่อนอยู่ ชื่อกรอบ ข้อความผิดพลาด และสถานะ",
           not th and len(txt) > 200, f"เจอ {''.join(th)[:20]!r} อ่านได้ {len(txt)} ตัว")
        for probe in [r"one finger", r"can be at most \d", r"Zoom \d+%"]:
            ck(f"อ่านเจอข้อความที่ต้องตรวจจริง ({probe})", re.search(probe, txt) is not None)
        bad = BANNED.findall(txt)
        ck("ข้อความไม่มีจุดกลาง ขีดยาว ขีดสั้น", not bad, repr(bad[:3]))
    finally:
        ctx.close()


# ── ⑨ ระหว่างบันทึก ห้ามแก้อะไร และกดหยุดแล้วต้องไม่ได้ไฟล์ ────────────────
# ‼️ รอบตรวจแย้ง: แถบบนอยู่นอกเขตที่ busy บังไว้ กดล้างกรอบกลางคันได้ error ดิบ กดหน้าถัดไปได้หน้าที่ไม่ได้เลือก
#    และกดหยุดแล้วยังได้ไฟล์ที่ตัดไปครึ่งเดียวพร้อมข้อความว่าเรียบร้อย
def sc_busy(pg, big):
    open_tool(pg, big)
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    cta = pg.locator("button.s2-cta").filter(has_text="ครอบตัดแล้วบันทึก")
    cta.first.click()
    lock = pg.evaluate("""() => {
      const b = (n) => [...document.querySelectorAll('.s2-tbar button')].find(x => (x.getAttribute('aria-label') || x.textContent).trim() === n);
      return { reset: b('ล้างกรอบ').disabled, place: b('วางกรอบ').disabled, next: b('หน้าถัดไป').disabled,
               stage: document.querySelector('.cr-stage').inert,
               edge: document.querySelector('input[data-edge="top"]').disabled,
               sel: document.querySelector('.s2-side-bd select').disabled,
               running: !!document.querySelector('button.btn-cancel:not([hidden])') }; }""")
    ck("ระหว่างบันทึกจริง (ปุ่มหยุดโผล่)", lock["running"], str(lock))
    ck("ระหว่างบันทึก แถบบน ช่อง มม. ตัวเลือกหน้า และกรอบ แก้ไม่ได้ทั้งหมด",
       all(lock[k] for k in ["reset", "place", "next", "stage", "edge", "sel"]), str(lock))
    stop = pg.locator("button.btn-cancel")
    if stop.count() and stop.first.is_visible():
        stop.first.click()
    pg.wait_for_function("() => !document.querySelector('button.s2-cta').disabled", timeout=60000)
    pg.wait_for_timeout(600)
    n = pg.evaluate("() => document.querySelectorAll('.result').length")
    msg = pg.evaluate("() => (document.querySelector('.status.show') || {}).textContent || ''")
    ck("กดหยุดกลางคัน ไม่ได้ไฟล์ และบอกว่าหยุดแล้ว", n == 0 and "หยุด" in msg, f"แถวผลลัพธ์ {n} ข้อความ {msg[:60]!r}")
    after = pg.evaluate("() => [...document.querySelectorAll('.s2-tbar button')].find(x => x.textContent.trim() === 'ล้างกรอบ').disabled")
    ck("บันทึกจบแล้ว ปุ่มแก้กรอบกลับมากดได้", after is False, str(after))


# ── ⑩ ไฟล์ล็อกรหัส: ใส่รหัสตอนเปิดแล้วต้องบันทึกได้ ไม่ถามซ้ำ ────────────────
def sc_password(pg, locked):
    open_tool(pg, locked, wait=False)
    box = pg.locator(".pw-box")
    box.first.wait_for(state="visible", timeout=15000)
    box.locator("input[type=password]").first.fill(PW)
    box.locator("button").filter(has_text="ปลดล็อกแล้วทำต่อ").first.click()
    pg.wait_for_selector(".cr-layer", timeout=25000)
    pg.wait_for_timeout(1200)
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    out, err = save_or_error(pg, DL / "locked.pdf")
    ck("ไฟล์ล็อกรหัส ใส่รหัสตอนเปิดแล้วบันทึกได้", out is not None, err[:90])
    ck("ตอนบันทึกไม่ถามรหัสซ้ำ", pg.locator(".pw-box").count() == 0)
    if not out:
        return
    d = fitz.open(str(out))
    print(f"     (ข้อสังเกต ไฟล์ที่ได้ล็อกรหัสอยู่ไหม: {bool(d.needs_pass)})")
    d.close()
    c = raw_boxes(out, PW)[0][0]
    want = [29.75, 42.1, 565.25, 799.9]
    ck("ไฟล์ล็อกรหัส ได้กรอบตรงกับที่วาง", c is not None and all(near(a, b, 0.05) for a, b in zip(c, want)), f"ได้ {c}")


# ── ⑪ CropBox แปลก ๆ จากโปรแกรมอื่น กรอบต้องลงตรงกับที่เห็นบนจอ ──────────────
# ‼️ รอบตรวจแย้ง: pdf.js แสดง CropBox ตัดกับ MediaBox แต่เดิมคิดจาก CropBox ดิบ
def sc_boxes(pg, cases):
    for i, (name, path, want) in enumerate(cases):
        open_tool(pg, path)
        if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
            continue
        out = save(pg, DL / f"box-{i}.pdf")
        if not out:
            continue
        c = raw_boxes(out)[0][0]
        ck(f"{name}: ไฟล์ได้กรอบ 5% ของส่วนที่เห็นบนจอ {want}",
           c is not None and all(near(a, b, 0.05) for a, b in zip(c, want)), f"ได้ {c}")


# ── ⑫ ท่าลากที่ถูกรบกวนกลางทาง ───────────────────────────────────────────
def sc_gesture(pg, a4):
    open_tool(pg, a4)
    mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.3, 0.3))
    # ‼️ รอบตรวจแย้ง: กดวาดตอนช่อง มม. มีโฟกัสค้าง ช่องนั้นโชว์ระยะของกรอบเก่า
    top = pg.locator('input[data-edge="top"]')
    top.first.focus()
    mdrag(pg, *at(pg, 0.5, 0.45), *at(pg, 0.8, 0.9))
    tv = top.first.input_value()
    want = round(0.45 * A4[1] * MM, 1)
    ck(f"วาดกรอบใหม่ตอนช่องขอบบนมีโฟกัสค้าง ช่องนั้นอัปเดตเป็น {want} มม.", near(float(tv or "nan"), want, 0.6), f"ได้ {tv!r}")
    mdrag(pg, *at(pg, 0.1, 0.1), *at(pg, 0.4, 0.4))
    f0 = frame(pg)
    # ‼️ รอบตรวจแย้ง: Esc ระหว่างลาก เดิมพาออกจากเครื่องมือกลางท่า กลับมาแล้วแค่ชี้เมาส์ กรอบก็วิ่งตาม
    x, y = at(pg, 0.25, 0.25)
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x + 40, y + 30, steps=4)
    mid = frame(pg)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(250)
    where = pg.evaluate("() => location.hash")
    alive = pg.locator(".cr-wrap").count() > 0 and pg.locator(".cr-wrap").first.is_visible()
    f1 = frame(pg)
    pg.mouse.move(x + 80, y + 60, steps=3)
    pg.mouse.up()
    pg.wait_for_timeout(200)
    f2 = frame(pg)
    ck("กด Esc ระหว่างลาก ยังอยู่ในเครื่องมือ ไม่เด้งกลับหน้าแรก", "pdf-crop" in where and alive, f"hash {where!r}")
    ck("กด Esc ระหว่างลาก กรอบกลับไปที่เดิม", not same_frame(mid, f0) and same_frame(f1, f0), f"{fmt(f0)} กลางท่า {fmt(mid)} หลัง Esc {fmt(f1)}")
    ck("ปล่อยเมาส์หลัง Esc กรอบไม่ขยับต่อ", same_frame(f2, f0), fmt(f2))
    if not alive:
        return
    # ‼️ รอบตรวจแย้ง: เลื่อนจอกลางท่าลาก (ล้อเมาส์ขณะกดค้าง) เดิมกรอบหลุดห่างจากปลายเมาส์
    zoom_to(pg, 200)
    pg.evaluate("() => { const c = document.querySelector('.cr-scroll'); c.scrollLeft = 0; c.scrollTop = 0; }")
    pg.wait_for_timeout(200)
    f3 = frame(pg)
    sh = pg.locator(".cr-stage").bounding_box()["height"]
    x, y = at(pg, 0.25, 0.25)
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x, y + 20, steps=2)
    pg.evaluate("() => { document.querySelector('.cr-scroll').scrollTop += 100; }")
    pg.mouse.move(x, y + 21, steps=1)
    pg.mouse.up()
    pg.wait_for_timeout(200)
    f4 = frame(pg)
    dy = (f4[1] - f3[1]) * sh if f3 and f4 else None
    ck("เลื่อนจอ 100 px กลางท่าลาก กรอบยังติดปลายเมาส์ (ขยับ 121 px ตามหน้า)", near(dy, 121, 3), f"ขยับ {dy}")


# ── ⑬ ไฟล์ที่มีหน้าหลายขนาด ต้องบอกว่าระยะ มม. เป็นของหน้าที่เห็น ────────────
def sc_mixed(pg, mixed):
    open_tool(pg, mixed)
    pg.wait_for_timeout(800)
    note = pg.locator(".cr-mixed")
    ck("ไฟล์หน้าแนวตั้งปนแนวนอน ขึ้นคำเตือนว่าหน้าหลายขนาด", note.count() > 0 and note.first.is_visible())


# ── ⑭ กระดาษใหญ่ซูมสุด เงาต้องคลุมถึงขอบล่าง ───────────────────────────────
# ‼️ รอบตรวจแย้ง: เงาเดิมยาวคงที่ 9999 px A1 ที่ 400% สูง 12714 px ส่วนล่างที่จะถูกตัดไม่มืด
def sc_bigpage(pg, a1):
    open_tool(pg, a1)
    if not click_if(pg, tbtn(pg, "วางกรอบ"), "วางกรอบ"):
        return
    bottom = pg.locator('input[data-edge="bottom"]')
    bottom.first.fill(str(round(0.9 * A1[1] * MM, 1)))
    pg.keyboard.press("Tab")
    pg.wait_for_timeout(200)
    fr = frame(pg)
    ck("กรอบอยู่แค่ 10% บนของหน้า", fr is not None and near(fr[1] + fr[3], 0.1, 0.004), fmt(fr))
    z = zoom_to(pg, 400)
    pg.evaluate("() => { const c = document.querySelector('.cr-scroll'); c.scrollTop = c.scrollHeight; }")
    pg.wait_for_timeout(500)
    s = pg.locator(".cr-stage").bounding_box()
    c = pg.locator(".cr-scroll").bounding_box()
    y = min(s["y"] + s["height"], c["y"] + c["height"]) - 40
    x = c["x"] + c["width"] / 2
    px = png_pixel(pg.screenshot(clip={"x": x, "y": y, "width": 1, "height": 1}))
    ck(f"A1 ที่ {z}% เลื่อนลงสุด ส่วนล่างที่จะถูกตัดยังมืด", z == 400 and px[0] < 200, f"พิกเซล {px}")


# ── ⑮ แถบเลื่อนจริงกว้าง 17 px แบบ Windows ─────────────────────────────────
# ‼️ รอบตรวจแย้ง: เบราว์เซอร์เทสซ่อนแถบเลื่อน (--hide-scrollbars) ข้อพอดีความกว้างเดิมจึงไม่มีวันแดง
def sc_scrollbar(pw, a4, errs):
    b2 = pw.chromium.launch(ignore_default_args=["--hide-scrollbars"])
    try:
        pg = b2.new_page(viewport={"width": 1400, "height": 1000})
        pg.on("pageerror", lambda e: errs.append("แถบเลื่อน: " + str(e)[:200]))
        open_tool(pg, a4)
        pg.add_style_tag(content="::-webkit-scrollbar{width:17px;height:17px}")
        pg.wait_for_timeout(200)
        if not click_if(pg, tbtn(pg, "พอดีความกว้าง"), "พอดีความกว้าง"):
            return
        pg.wait_for_timeout(300)
        g = geo(pg)
        ck("แถบเลื่อนแนวตั้งโผล่จริงและกว้าง 17 px (ก่อนเชื่อผลข้อถัดไป)", g and g["ow"] - g["cw"] == 17, str(g))
        ck("พอดีความกว้างกับแถบเลื่อน 17 px ไม่มีแถบเลื่อนแนวนอนโผล่", g and g["scw"] <= g["cw"], str(g))
    finally:
        b2.close()


# ── ⑯ บีบนิ้วช้า ๆ ต้องซูมตามจริง ────────────────────────────────────────
# ‼️ รอบตรวจแย้ง: เดิมทิ้งการเปลี่ยนที่น้อยกว่า 0.2% ต่อรอบแล้วตั้งฐานใหม่ทุกรอบ บีบช้าจึงไม่ซูมเลย
#    นิ้วหนึ่งนิ่ง อีกนิ้วขยับทีละ 1 px สลับแกน ระยะห่างเปลี่ยนรอบละไม่ถึง 0.2% แต่รวมแล้วถ่างออก 1.4 เท่า
def sc_slowpinch(b, a4, errs):
    ctx = b.new_context(viewport={"width": 1200, "height": 900}, has_touch=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("บีบช้า: " + str(e)[:200]))
    try:
        open_tool(pg, a4)
        cdp = ctx.new_cdp_session(pg)
        w0 = pg.locator(".cr-stage").bounding_box()["width"]
        ax, ay = at(pg, 0.05, 0.05)
        bx, by = at(pg, 0.75, 0.75)
        ax, ay, bx, by = round(ax), round(ay), round(bx), round(by)
        d0 = math.hypot(bx - ax, by - ay)
        touch(cdp, "touchStart", [(ax, ay)])
        touch(cdp, "touchStart", [(ax, ay), (bx, by)])
        for k in range(1, 301):
            touch(cdp, "touchMove", [(ax, ay), (bx + (k + 1) // 2, by + k // 2)])
        touch(cdp, "touchEnd", [])
        pg.wait_for_timeout(400)
        d1 = math.hypot(bx + 150 - ax, by + 150 - ay)
        w1 = pg.locator(".cr-stage").bounding_box()["width"]
        ck(f"บีบนิ้วถ่างออกช้า ๆ {d1 / d0:.2f} เท่า หน้าซูมตามเกือบเท่ากัน", w1 / w0 > 1 + 0.8 * (d1 / d0 - 1),
           f"หน้ากว้าง {w0:.0f} -> {w1:.0f} ({w1 / w0:.3f} เท่า)")
    finally:
        ctx.close()


def selftest():
    print("ตรวจตัวตรวจเอง")
    FIX.mkdir(parents=True, exist_ok=True)
    d = fitz.open()
    p = d.new_page(width=595, height=842)
    p.set_cropbox(fitz.Rect(30, 40, 500, 700))
    d.new_page(width=595, height=842)
    d.save(str(FIX / "known.pdf")); d.close()
    bx = raw_boxes(FIX / "known.pdf")
    ok1 = ck("ตัวอ่าน /CropBox อ่านค่าดิบที่รู้คำตอบได้ตรง [30, 142, 500, 802]", bx[0][0] == [30, 142, 500, 802], str(bx[0]))
    ok2 = ck("ตัวอ่านแยกหน้าที่ตัดกับไม่ตัดได้", [is_cropped(c, m) for c, m in bx] == [True, False], str(bx))
    rot = make_rotated(FIX / "rot.pdf")
    plain = make_rotated(FIX / "plain.pdf", 0)
    ok3 = ck("ตัวดูสีมุม หน้าไม่หมุนมุมซ้ายบนเป็นแดง", corner_color(plain) == "red", corner_color(plain))
    ok4 = ck("ตัวดูสีมุม หน้าหมุน 90 มุมซ้ายบนไม่ใช่แดงแล้ว", corner_color(rot) not in ("red", "white", "other"), corner_color(rot))
    ok5 = ck("ตัวดูสีเห็นครบ 4 สี", {"red", "green", "blue", "black"} <= colors_in(rot), str(colors_in(rot)))
    ok6 = ck("ตัววัดขนาดหน้าคิดการหมุนให้ (A4 หมุน 90 = 842 x 595)", shown_size(rot) == (842, 595), str(shown_size(rot)))
    locked = make_locked(FIX / "locked.pdf", FIX / "known.pdf")
    lb = raw_boxes(locked, PW)
    ok7 = ck("ตัวอ่าน /CropBox อ่านไฟล์ล็อกรหัสได้เมื่อส่งรหัส", lb[0][0] == [30, 142, 500, 802], str(lb[0]))
    big = raw_boxes(make_boxes(FIX / "bigcrop.pdf", "[0 0 612 792]"))[0]
    zero = raw_boxes(make_boxes(FIX / "zerocrop.pdf", "[0 0 0 0]"))[0]
    ok8 = ck("ไฟล์ทดสอบ CropBox ใหญ่กว่า MediaBox และขนาด 0 เก็บค่าดิบไว้จริง",
             big == ([0, 0, 612, 792], [0, 0, 595, 842]) and zero[0] == [0, 0, 0, 0], f"{big} {zero}")
    mx = fitz.open(str(make_mixed(FIX / "mixed.pdf")))
    sizes = [(round(pg.rect.width), round(pg.rect.height)) for pg in mx]
    mx.close()
    ok9 = ck("ไฟล์ทดสอบหน้าหลายขนาดมีหน้าแนวนอนปนจริง", sizes == [(595, 842), (842, 595), (595, 842)], str(sizes))
    buf = io.BytesIO()
    Image.new("RGB", (1, 1), (148, 149, 150)).save(buf, "PNG")
    ok10 = ck("ตัวอ่านพิกเซลจากภาพหน้าจออ่านสีที่รู้คำตอบได้ตรง", png_pixel(buf.getvalue()) == (148, 149, 150))
    cols = colors_in(make_pdf(FIX / "colors.pdf", 4), 1)
    ok11 = ck("ไฟล์ทดสอบหลายหน้า หน้า 2 มีกล่องเขียวจริง", "green" in cols and "red" not in cols, str(cols))
    good = all([ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9, ok10, ok11])
    print("\n" + ("✅ selftest: ตัวอ่าน /CropBox ตัวดูสี ตัววัดขนาด ตัวอ่านพิกเซล และไฟล์ทดสอบทุกแบบอ่านของที่รู้คำตอบได้ตรง"
                  if good else "❌ ตัวตรวจเชื่อไม่ได้"))
    return 0 if good else 1


def main():
    if SELFTEST:
        return selftest()
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    a4 = make_pdf(FIX / "a4-4.pdf", 4)
    big = make_pdf(FIX / "big.pdf", 2000)
    locked = make_locked(FIX / "locked.pdf", make_pdf(FIX / "one.pdf", 1))
    boxes = [("CropBox ใหญ่กว่า MediaBox", make_boxes(FIX / "bigcrop.pdf", "[0 0 612 792]"), [29.75, 39.6, 565.25, 752.4]),
             ("CropBox ขนาด 0", make_boxes(FIX / "zerocrop.pdf", "[0 0 0 0]"), [29.75, 42.1, 565.25, 799.9])]
    mixed = make_mixed(FIX / "mixed.pdf")
    a1 = make_blank(FIX / "a1.pdf", A1)
    rots = [(d, make_rotated(FIX / f"rot{d}.pdf", d)) for d in (90, 180, 270)]
    errs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        scenario("① ลากย้ายกรอบด้วยเมาส์", sc_move, pg, a4)
        scenario("② มือจับ 8 จุด หน้าผลลัพธ์ และบันทึกรอบสอง", sc_handles, pg, a4)
        scenario("③ คีย์บอร์ดกับช่องระยะขอบ มม.", sc_keys, pg, a4)
        scenario("④ ซูม พอดีหน้า พอดีความกว้าง เปลี่ยนหน้า", sc_view, pg, a4)
        scenario("⑤ ใช้กรอบกับหน้าที่เห็นอยู่", sc_onepage, pg, a4)
        scenario("⑥ หน้าที่หมุนไว้", sc_rotated, pg, rots)
        scenario("⑦ มือถือ", sc_mobile, b, a4, errs)
        scenario("⑧ ภาษาอังกฤษและกฎข้อความ", sc_english, b, a4, errs)
        scenario("⑨ ระหว่างบันทึกและกดหยุด", sc_busy, pg, big)
        scenario("⑩ ไฟล์ล็อกรหัส", sc_password, pg, locked)
        scenario("⑪ CropBox จากโปรแกรมอื่น", sc_boxes, pg, boxes)
        scenario("⑫ ท่าลากที่ถูกรบกวนกลางทาง", sc_gesture, pg, a4)
        scenario("⑬ หน้าหลายขนาด", sc_mixed, pg, mixed)
        scenario("⑭ กระดาษใหญ่ซูมสุด", sc_bigpage, pg, a1)
        scenario("⑮ แถบเลื่อนจริง 17 px", sc_scrollbar, pw, a4, errs)
        scenario("⑯ บีบนิ้วช้า", sc_slowpinch, b, a4, errs)
        b.close()
    print("\n── ข้อผิดพลาดในหน้า")
    ck("ไม่มีข้อผิดพลาดในหน้าเลย", not errs, "; ".join(errs[:3]))
    print(f"\nPASS={P} FAIL={len(F)}")
    for f in F:
        print("  ❌ " + f.splitlines()[0])
    return 0 if not F else 1


if __name__ == "__main__":
    sys.exit(main())
