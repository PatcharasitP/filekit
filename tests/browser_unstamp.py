#!/usr/bin/env python3
"""ลบชั้นที่ทับบนหน้า PDF — ต้องลบลายน้ำได้จริง และห้ามแตะเนื้อหาแม้แต่ไบต์เดียว

‼️ ทำไมเทสนี้ต้องวัดถึงระดับไบต์ของ content stream (19/09/2026)
   เครื่องมือแนวนี้พังเงียบได้ในแบบที่ดูด้วยตาไม่ออก คือ "ลบลายน้ำสำเร็จ" แต่กินเนื้อหาไปด้วย
   วิธีที่ล่อใจที่สุดคือใช้ regex ตัดเฉพาะช่วง q...Q ที่มีลายน้ำ ซึ่งวัดจริงแล้วว่า
   กินเนื้อหาจริงไปทั้งก้อน เพราะ regex ไม่รู้จักการซ้อนของ q/Q
   ถ้าวันหลังมีคนเปลี่ยนไปตัดข้างในชั้น เทสข้อ "ทุกสตรีมที่เหลือต้องเหมือนต้นฉบับเป๊ะ" จะแดงทันที
   นั่นคือเหตุผลที่ข้อนั้นมีอยู่ ไม่ใช่แค่เช็กจำนวนหน้าให้ผ่าน ๆ

‼️ ลายน้ำมี 3 ที่อยู่ ต้องทดสอบให้ครบทั้งสาม (เพิ่ม 19/09/2026)
   รอบแรกเทสนี้ครอบแค่ "สตรีมเนื้อหาแยกก้อน" แล้วเขียวสนิท ทั้งที่เครื่องมือมองไม่เห็นลายน้ำแบบ
   annotation กับ OCG เลย และตอบผู้ใช้ผิดว่า "ลายน้ำถูกวาดปนอยู่กับเนื้อหา"
   เทสที่ครอบแค่ทางเดียวจึงให้ความมั่นใจปลอม ตอนนี้ยิงครบทั้งสามแบบ
   และข้อสำคัญที่สุดของสองแบบหลังคือ "content stream ต้องไม่ถูกแตะเลยแม้แต่ไบต์เดียว"

‼️ เกณฑ์สีต้องจับจากของจริง ห้ามเดา
   รอบแรกฟ้าเดาว่าลายน้ำคือ "แดงเข้ม" (R>200, B<200) แล้ววัดได้ 0 พิกเซลทั้งที่ตาเห็นชัด
   ค่าจริงคือชมพูอ่อน (255, 220, 226) ตัววัดที่จับเป้าไม่เจอ พิสูจน์อะไรไม่ได้เลย
   เทสนี้จึงนิยามลายน้ำว่า "ไม่ขาว แต่ไม่ดำสนิท" และนิยามเนื้อหาว่า "ดำสนิท" แยกขาดจากกัน

รันปกติ:   ../.venv/bin/python tests/browser_unstamp.py
รันพิสูจน์: ../.venv/bin/python tests/browser_unstamp.py --selftest   (ทำให้แดงเองเพื่อพิสูจน์ว่าเทสจับได้จริง)
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8848")
SELFTEST = "--selftest" in sys.argv
ok = fail = 0
reds = []

# ‼️ โหมดพิสูจน์ต้องบอกล่วงหน้าว่าข้อไหนต้องแดง แล้วตรวจว่าแดงตรงนั้นจริง
#    ถ้าเขียนแค่ "ต้องเห็น ❌ บ้าง" ก็ยังโกหกตัวเองได้ว่าเทสใช้งานได้
SELFTEST_MUST_FAIL = {
    "ทุกสตรีมที่เหลือเหมือนต้นฉบับทุกไบต์ = ไม่เคยตัดข้างในชั้น",
    "ลายน้ำหายจริงทุกหน้า",
}


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def make_pdf(path, pages=3):
    """เอกสารที่มีแต่ข้อความดำสนิท ไม่มีอะไรสีอ่อนเลย เพื่อให้แยกลายน้ำออกได้เด็ดขาด"""
    c = rl_canvas.Canvas(str(path), pagesize=A4)
    for p in range(1, pages + 1):
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold", 44)
        c.drawString(90, 700, f"DOC{p}")
        c.setFont("Helvetica", 18)
        c.drawString(90, 640, f"real content line on page {p}")
        c.showPage()
    c.save()


def streams(path):
    """ไบต์ของทุก content stream แยกตามหน้า (แกะบีบอัดแล้ว)"""
    d = fitz.open(str(path))
    out = [[d.xref_stream(x) for x in d[i].get_contents()] for i in range(d.page_count)]
    d.close()
    return out


def render(path, tag, tmp):
    subprocess.run(["pdftoppm", "-r", "110", "-png", str(path), str(tmp / tag)],
                   check=True, capture_output=True)
    return sorted(tmp.glob(f"{tag}-*.png"))


def make_annot_pdf(path):
    """ลายน้ำเป็น annotation + ลิงก์ที่ห้ามโดนลบ (Acrobat และตัวเซ็นเอกสารหลายตัวทำแบบนี้)"""
    import fitz
    d = fitz.open()
    for i in range(2):
        pg = d.new_page()
        pg.insert_text((72, 120), f"REAL CONTENT page {i+1}", fontsize=20)
        pg.add_freetext_annot(fitz.Rect(100, 300, 480, 380), "CONFIDENTIAL",
                              fontsize=36, text_color=(1, 0.3, 0.3)).update()
        pg.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(72, 100, 260, 130),
                        "uri": "https://example.invalid/"})
    d.save(str(path)); d.close()


def make_ocg_pdf(path):
    """ลายน้ำใน optional content group = สิ่งที่ Acrobat เรียกว่า 'ชั้น'"""
    import fitz
    d = fitz.open()
    ocg = d.add_ocg("watermark", on=True)
    for i in range(2):
        pg = d.new_page()
        pg.insert_text((72, 120), f"REAL CONTENT page {i+1}", fontsize=20)
        pg.insert_text((120, 420), "DRAFT", fontsize=60, color=(1, 0.4, 0.4), oc=ocg)
    d.save(str(path)); d.close()


def annots_of(path):
    """‼️ PyMuPDF ไม่นับ Link ใน annots() ต้องถามแยกด้วย get_links()
       รอบแรกเทสนี้ใช้ annots() อย่างเดียวแล้วฟ้องว่าลิงก์หาย ทั้งที่ลิงก์ยังอยู่ครบ
       ตัววัดที่มองไม่เห็นเป้า ฟ้องผิดได้พอ ๆ กับที่มันปล่อยของพังผ่าน"""
    import fitz
    d = fitz.open(str(path))
    out = [[a.type[1] for a in d[i].annots()] + ["Link"] * len(d[i].get_links())
           for i in range(d.page_count)]
    d.close()
    return out


def run_tool(pg, src, tmp, out_name):
    """ใส่ไฟล์ ติ๊กทุกชั้นออก บันทึก แล้วคืน path ไฟล์ผล กับสิ่งที่หน้าจอบอก"""
    pg.goto(f"{BASE}/#pdf-unstamp", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2000)
    pg.locator("input[type=file]").first.set_input_files(str(src))
    pg.wait_for_timeout(4000)
    rows = pg.locator(".us-layer input")
    seen = [pg.locator(".us-layer").nth(i).inner_text().replace("\n", " ") for i in range(rows.count())]
    blocked = pg.locator(".us-blocked").inner_text().replace("\n", " ")
    if not rows.count():
        return None, seen, blocked
    for i in range(rows.count()):
        rows.nth(i).uncheck()
    pg.wait_for_timeout(2600)
    pg.get_by_role("button", name="บันทึกไฟล์").click()
    pg.wait_for_timeout(2200)
    with pg.expect_download() as dl:
        pg.get_by_role("button", name="ดาวน์โหลด").first.click()
    out = tmp / out_name
    dl.value.save_as(str(out))
    return out, seen, blocked


def main():
    tmp = Path(tempfile.mkdtemp(prefix="fk-unstamp-"))
    plain = tmp / "plain.pdf"
    make_pdf(plain)

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:140]))

        # ── ① ใส่ลายน้ำด้วยเครื่องมือของเราเอง = เส้นทางที่ผู้ใช้เดินจริง ─────────
        pg.goto(f"{BASE}/#pdf-watermark", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2200)
        pg.locator("input[type=file]").first.set_input_files(str(plain))
        pg.wait_for_timeout(2200)
        pg.get_by_role("button", name="ใส่ลายน้ำ").first.click()
        pg.wait_for_timeout(3000)
        with pg.expect_download() as dl:
            pg.get_by_role("button", name="ดาวน์โหลด").first.click()
        wm = tmp / "wm.pdf"
        dl.value.save_as(str(wm))

        src = streams(wm)
        ck(all(len(s) >= 2 for s in src),
           "ไฟล์ทดสอบมีลายน้ำแยกเป็นสตรีมของตัวเองจริง",
           f"สตรีมต่อหน้า {[len(s) for s in src]}")

        # ── ② เปิดในเครื่องมือลบชั้น ──────────────────────────────────────────
        pg.goto(f"{BASE}/#pdf-unstamp", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2200)
        pg.locator("input[type=file]").first.set_input_files(str(wm))
        pg.wait_for_timeout(4500)

        rows = pg.locator(".us-layer input")
        ck(rows.count() == 1, "เจอชั้นที่ถอดได้ 1 ชั้น", f"เจอ {rows.count()}")
        ck("3 หน้า" in pg.locator(".us-layer").first.inner_text(),
           "บอกได้ว่าชั้นนี้อยู่กี่หน้า", pg.locator(".us-layer").first.inner_text().replace("\n", " "))
        ck(pg.locator(".us-blocked").inner_text().strip() != "",
           "บอกตรง ๆ ว่าชั้นไหนไม่แตะและเพราะอะไร")

        shot = lambda n: pg.locator(".us-stage canvas").screenshot(path=str(tmp / n))
        shot("p-on.png")
        rows.first.uncheck()
        pg.wait_for_timeout(3000)
        shot("p-off.png")
        on = np.asarray(Image.open(tmp / "p-on.png").convert("L"), int)
        off = np.asarray(Image.open(tmp / "p-off.png").convert("L"), int)
        ck(int((abs(on - off) > 18).sum()) > 500,
           "ติ๊กออกแล้วพรีวิวเปลี่ยนให้เห็นทันที ไม่ต้องบันทึกก่อน",
           f"ต่างกัน {int((abs(on - off) > 18).sum())} พิกเซล")

        # ‼️ ข้อนี้มาจากกับดักจริง: ถ้า build() ไปแก้เอกสารเดิมสะสมแทนที่จะเปิดใหม่ทุกครั้ง
        #    ติ๊กกลับเข้ามาแล้วชั้นจะไม่กลับมา ผู้ใช้จะลองเปิดปิดเทียบไม่ได้เลย
        rows.first.check()
        pg.wait_for_timeout(3000)
        shot("p-back.png")
        back = np.asarray(Image.open(tmp / "p-back.png").convert("L"), int)
        ck(int((abs(on - back) > 18).sum()) == 0,
           "ติ๊กกลับเข้ามาแล้วชั้นกลับมาเหมือนเดิมเป๊ะ",
           f"ต่าง {int((abs(on - back) > 18).sum())} พิกเซล")

        rows.first.uncheck()
        pg.wait_for_timeout(2500)
        pg.get_by_role("button", name="บันทึกไฟล์").click()
        pg.wait_for_timeout(2500)
        with pg.expect_download() as dl2:
            pg.get_by_role("button", name="ดาวน์โหลด").first.click()
        out = tmp / "out.pdf"
        dl2.value.save_as(str(out))

        # ── ③ เคสที่ต้องปฏิเสธอย่างซื่อสัตย์: ไฟล์ที่ไม่มีชั้นทับ ──────────────
        pg.goto(f"{BASE}/#pdf-unstamp", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2000)
        pg.locator("input[type=file]").first.set_input_files(str(plain))
        pg.wait_for_timeout(4000)
        ck(pg.locator(".us-layer input").count() == 0,
           "ไฟล์ที่ไม่มีชั้นทับ ต้องไม่เสนอชั้นให้ลบสักชั้น")
        msg = pg.locator(".status").inner_text()
        ck("ไม่มีชั้นที่ถอดออกได้" in msg,
           "บอกตรง ๆ ว่าทำให้ไม่ได้ ไม่หลอกว่าสำเร็จ", msg[:70])
        ck(pg.get_by_role("button", name="บันทึกไฟล์").is_disabled(),
           "ปุ่มบันทึกปิดอยู่เมื่อไม่มีอะไรให้ลบ")

        ck(not errs, "ไม่มี error หลุดออกมา", errs[0] if errs else "")
        b.close()

    # ── ④ ตรวจที่ไบต์: ห้ามตัดข้างในชั้นเด็ดขาด ────────────────────────────
    got = streams(out)
    if SELFTEST:   # ‼️ พิสูจน์ว่าเทสจับได้จริง ทำผลลัพธ์ให้เสียแบบ "ตัดข้างในชั้น"
        got = [[s[:-40] for s in pageset] for pageset in got]
    ck(len(got) == len(src), "จำนวนหน้าไม่เปลี่ยน", f"{len(src)} เป็น {len(got)}")
    ck(all(len(g) == len(s) - 1 for g, s in zip(got, src)),
       "แต่ละหน้าเหลือสตรีมน้อยลงพอดี 1 ชั้น", f"{[len(g) for g in got]}")
    intact = all(any(g == o for o in s) for gs, s in zip(got, src) for g in gs)
    ck(intact, "ทุกสตรีมที่เหลือเหมือนต้นฉบับทุกไบต์ = ไม่เคยตัดข้างในชั้น")

    # ── ⑤ ตรวจที่พิกเซล: ลายน้ำหาย เนื้อหาอยู่ครบ ไม่มีอะไรโผล่มาใหม่ ────────
    A_all, B_all = render(wm, "a", tmp), render(out, "b", tmp)
    worst_gone, worst_lost, worst_new = 10**9, 0, 0
    for fa, fb in zip(A_all, B_all):
        A = np.asarray(Image.open(fa).convert("RGB"), int)
        B = np.asarray(Image.open(fb).convert("RGB"), int)
        if SELFTEST:
            B = A.copy()          # ‼️ แกล้งว่า "ลบไม่ออก" เพื่อดูว่าข้อลายน้ำแดงไหม
        soft = (A.sum(2) < 720) & (A.sum(2) >= 300)   # ลายน้ำ = ไม่ขาว แต่ไม่ดำสนิท
        dark = A.sum(2) < 300                          # เนื้อหาจริง = ดำสนิท
        worst_gone = min(worst_gone, int((soft & (B.sum(2) >= 720)).sum()))
        worst_lost = max(worst_lost, int((dark & (B.sum(2) >= 300)).sum()))
        worst_new = max(worst_new, int(((A.sum(2) >= 720) & (B.sum(2) < 720)).sum()))
    ck(worst_gone > 2000, "ลายน้ำหายจริงทุกหน้า", f"หน้าที่หายน้อยสุด {worst_gone} พิกเซล")
    ck(worst_lost == 0, "เนื้อหาจริงไม่หายแม้แต่พิกเซลเดียว", f"หายมากสุด {worst_lost}")
    ck(worst_new == 0, "ไม่มีอะไรโผล่ขึ้นมาใหม่", f"โผล่มากสุด {worst_new}")

    # ── ⑥ ลายน้ำอีกสองที่อยู่: annotation กับ OCG ──────────────────────────
    a_src, o_src = tmp / "annot.pdf", tmp / "ocg.pdf"
    make_annot_pdf(a_src)
    make_ocg_pdf(o_src)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        pg = ctx.new_page()
        a_out, a_seen, a_blocked = run_tool(pg, a_src, tmp, "annot-out.pdf")
        o_out, o_seen, o_blocked = run_tool(pg, o_src, tmp, "ocg-out.pdf")
        b.close()

    ck(a_out is not None and len(a_seen) == 1,
       "ลายน้ำแบบ annotation ต้องถูกมองเห็น", f"เจอ {a_seen}")
    ck(any("CONFIDENTIAL" in x for x in a_seen),
       "บอกได้ว่าตรานั้นเขียนว่าอะไร ไม่ใช่แค่บอกว่ามีของ")
    ck("ลิงก์" in a_blocked, "บอกว่าลิงก์กับช่องกรอกฟอร์มไม่ถูกแตะ", a_blocked[:60])
    if a_out:
        left = annots_of(a_out)
        ck(all("FreeText" not in x for x in left), "ตราถูกลบออกจริงทุกหน้า", f"{left}")
        ck(all("Link" in x for x in left), "‼️ ลิงก์ต้องยังอยู่ครบ ห้ามลบของใช้งาน", f"{left}")
        # ‼️ ข้อสำคัญที่สุด: ลบ annotation ต้องไม่แตะเนื้อหาของหน้าเลย
        ck(streams(a_out) == streams(a_src),
           "ลบ annotation แล้ว content stream ต้องเหมือนเดิมทุกไบต์")

    ck(o_out is not None and len(o_seen) == 1,
       "ลายน้ำแบบ OCG ต้องถูกมองเห็น", f"เจอ {o_seen}")
    ck(any("ข้อมูลยังอยู่ในไฟล์" in x for x in o_seen),
       "‼️ ต้องบอกตรง ๆ ว่า OCG แค่ปิด ไม่ได้ลบข้อมูลทิ้ง")
    if o_out:
        ck(streams(o_out) == streams(o_src),
           "ปิด OCG แล้ว content stream ต้องเหมือนเดิมทุกไบต์")
        import fitz
        d = fitz.open(str(o_out))
        vis = [g["on"] for g in d.get_ocgs().values()]
        d.close()
        ck(vis and not any(vis), "ชั้น OCG ถูกตั้งเป็นปิดจริงในไฟล์ผลลัพธ์", f"สถานะ {vis}")
        A = np.asarray(Image.open(render(o_src, "o1", tmp)[0]).convert("RGB"), int)
        B = np.asarray(Image.open(render(o_out, "o2", tmp)[0]).convert("RGB"), int)
        red = (A[:, :, 0] > 150) & (A[:, :, 1] < A[:, :, 0] - 40)
        redB = (B[:, :, 0] > 150) & (B[:, :, 1] < B[:, :, 0] - 40)
        dark = A.sum(2) < 300
        ck(red.sum() > 1000 and redB.sum() == 0,
           "เปิดไฟล์ผลแล้วลายน้ำ OCG ไม่แสดงอีก", f"{int(red.sum())} เหลือ {int(redB.sum())} px")
        ck(int((dark & (B.sum(2) < 300)).sum()) == int(dark.sum()),
           "เนื้อหาจริงยังอยู่ครบหลังปิดชั้น")

    print(f"\nผ่าน {ok} ตก {fail}")
    if SELFTEST:
        # ทำผลลัพธ์เสีย 2 แบบ (ตัดข้างในสตรีม + ลบไม่ออก) จึงต้องแดงตรง 2 ข้อนี้พอดี
        got_red = set(reds)
        good = got_red == SELFTEST_MUST_FAIL
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงข้อที่ควรจับ" if good else
              f"❌ จับได้ไม่ตรง ขาด {SELFTEST_MUST_FAIL - got_red} เกิน {got_red - SELFTEST_MUST_FAIL}")
        return 0 if good else 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
