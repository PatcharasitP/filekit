# ตัวช่วยกลางสำหรับเทสเบราว์เซอร์ — รู้จักโครงหน้าเครื่องมือ v2
#
# ‼️ ที่มา 21/09/2026: หลังเปลี่ยนหน้าเครื่องมือเป็น v2 (shell2.js) เทสเก่าแดงยกแผง
#    เพราะแต่ละชุดเขียนวิธี "เปิดเครื่องมือ แล้วกดปุ่มลงมือทำ" ของตัวเองคนละแบบ
#    ทุกชุดจึงต้องแก้ทีละไฟล์ ทั้งที่เป็นความรู้ชุดเดียวกันเป๊ะ
#    รวมไว้ที่เดียว รอบหน้าเปลี่ยนโครงอีกก็แก้ไฟล์เดียว
#
# ‼️ สิ่งที่เทสควรถาม: "ผู้ใช้เห็นอะไร กดอะไรได้" ไม่ใช่ "DOM มีคลาสชื่อนี้ไหม"
#    ตัวช่วยพวกนี้จึงเลือกของที่ **มองเห็นจริง** เสมอ และเลี่ยงของที่ถูกชั้นลอยบังอยู่

import os

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")


def open_tool(pg, tool, base=None, timeout=30000):
    """เปิดหน้าเครื่องมือแบบสะอาด (ล้าง hash เดิมก่อน ไม่งั้นบางตัวไม่ยอม remount)"""
    b = (base or BASE).rstrip("/")
    pg.goto("about:blank")
    pg.goto(f"{b}/#/{tool}", wait_until="networkidle", timeout=timeout)
    try:
        pg.wait_for_selector(".s2, .tool-head", timeout=timeout)
    except Exception:
        pass
    pg.wait_for_timeout(500)


def state(pg):
    """สถานะของเปลือก v2: landing | work | busy | result (None = ยังเป็นโครงเดิม)"""
    return pg.evaluate("() => document.querySelector('.s2')?.dataset.state || null")


def feed(pg, files, index=0):
    """ใส่ไฟล์เข้ากล่องรับไฟล์ใบที่ index แล้วรอให้เปลือกเปลี่ยนสถานะ
       ‼️ ต้องใช้ input ที่ซ่อนอยู่ ห้ามกดปุ่มยักษ์เพราะจะเปิดหน้าต่างเลือกไฟล์ของระบบ"""
    paths = [str(f) for f in (files if isinstance(files, (list, tuple)) else [files])]
    pg.locator(".dz input[type=file]").nth(index).set_input_files(paths)
    pg.wait_for_timeout(1200)


def act(pg, text, timeout=30000):
    """กดปุ่มลงมือทำ
       ‼️ ต้องเลือก .s2-cta (ปุ่มในแผงขวา) ก่อนเสมอ ปุ่มจริงของเครื่องมืออยู่ในผืนงาน
          ซึ่งตอนสถานะ result ถูกชั้นผลลัพธ์บังอยู่ กดแล้วจะได้ 'intercepts pointer events'"""
    for sel in ("button.s2-cta", "button.s2-sub", ".s2-subrow button", "button.btn", "button"):
        loc = pg.locator(sel).filter(has_text=text)
        if loc.count():
            loc.first.wait_for(state="visible", timeout=timeout)
            loc.first.click(timeout=timeout)
            return True
    raise AssertionError(f"หาปุ่มที่มีคำว่า {text!r} ที่กดได้ไม่เจอ")


def dl_button(pg, text="ดาวน์โหลด", timeout=60000):
    """ปุ่มดาวน์โหลดที่ผู้ใช้กดได้จริงในสถานะนี้
       แผงผลลัพธ์มาก่อน แล้วค่อยถอยไปหาในผืนงาน (เครื่องมือที่ไม่เข้าสถานะ result)"""
    order = (".s2-side-res button:visible", ".s2-subrow button:visible",
             ".results .result button:visible", ".results button:visible", "button:visible")
    last = None
    for sel in order:
        loc = pg.locator(sel).filter(has_text=text)
        if loc.count():
            last = loc.first
            try:
                last.wait_for(state="visible", timeout=4000)
                return last
            except Exception:
                continue
    if last is None:
        raise AssertionError(f"หาปุ่ม {text!r} ไม่เจอเลย")
    last.wait_for(state="visible", timeout=timeout)
    return last


def download(pg, out_path, text="ดาวน์โหลด", timeout=60000):
    """กดดาวน์โหลดแล้วเซฟลงไฟล์ คืน path"""
    btn = dl_button(pg, text, timeout)
    with pg.expect_download(timeout=timeout) as dl:
        btn.click()
    dl.value.save_as(str(out_path))
    return out_path


def back_to_work(pg, timeout=10000):
    """กลับจากสถานะผลลัพธ์มาหน้าทำงาน เพื่อสั่งงานรอบใหม่
       ‼️ v2 พอมีผลลัพธ์แล้วจะสลับแผงขวาเป็นแผงผลลัพธ์ ปุ่มลงมือทำจึงหายไปจากจอ
          ผู้ใช้จริงต้องกด "กลับไปแก้" ก่อน เทสจึงต้องทำแบบเดียวกัน
          ไม่ใช่ไปงัดหาปุ่มที่ซ่อนอยู่ข้างหลัง"""
    if state(pg) != "result":
        return False
    b = pg.locator("button:visible, a:visible").filter(has_text="กลับไปแก้")
    if not b.count():
        return False
    b.first.click(timeout=timeout)
    pg.wait_for_timeout(600)
    return True


def side_selects(pg):
    """<select> ทั้งหมดในแผงตัวเลือกด้านขวา (เรียงตามที่ผู้ใช้เห็นจากบนลงล่าง)"""
    return pg.locator(".s2-side-bd select, .ws-right select, .panel select")


def visible_texts(pg, sel):
    return pg.evaluate("""(s) => [...document.querySelectorAll(s)]
        .filter(e => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; })
        .map(e => e.textContent.trim())""", sel)
