#!/usr/bin/env python3
"""แถวรายการไฟล์ (file-row) ลากสลับลำดับได้ชัด และปุ่มขึ้นลงเป็นไอคอน

‼️ ที่มา 18/11/2026 พี่ปอนด์ลองบนเว็บจริงแล้วเจอ 2 เรื่อง
   (ก) ลากแถวไฟล์ขึ้น ตัวที่ลากจางจนแทบมองไม่เห็น (ภาพลากของเบราว์เซอร์) ตัวหนังสือถูกคลุมสีฟ้า
       เพราะเลือกข้อความ และขึ้นเคอร์เซอร์รูปห้าม "ดูแทบไม่ออกเลยว่ามันย้ายขึ้นลงแบบลากได้"
   (ข) ปุ่มเลื่อนเป็นตัวอักษร ↑ ↓ ดูเรียบ เล็ก แปลก
‼️ เทสถามสิ่งที่ผู้ใช้เห็นระหว่างลาก ไม่ใช่ว่า DOM มีคลาสอะไร
   สำเนาลอยทึบ , ไม่มีการเลือกข้อความ , ไม่มี dragstart ของเบราว์เซอร์ (ที่ทำให้เกิดภาพจางกับเคอร์เซอร์ห้าม) ,
   มีช่องว่างที่จะวาง , ปล่อยแล้วลำดับเปลี่ยนจริงและหน้าในเครื่องมือจัดการหน้า PDF ตามไป

รัน:  FK_BASE=http://127.0.0.1:8941 ../.venv/bin/python tests/browser_filerow_drag.py
"""
import os
import pathlib
import sys
import tempfile

from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SHOTS = os.environ.get("FK_SHOTS", "")     # โฟลเดอร์เก็บภาพ (ว่าง = ไม่ถ่าย)
ok = fail = 0


def ck(cond, label, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if (detail and not cond) else ""), flush=True)


def make_pdf(path, tag, pages):
    c = rl_canvas.Canvas(str(path), pagesize=A4)
    for p in range(1, pages + 1):
        c.setFont("Helvetica-Bold", 64)
        c.drawString(90, 520, f"{tag}{p}")
        c.showPage()
    c.save()


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name))


COUNT_DRAGSTART = """() => { window.__ds = 0;
  window.addEventListener('dragstart', () => { window.__ds++; }, true); }"""


def names(pg):
    return pg.eval_on_selector_all(".file-row .f-name", "ns => ns.map(n => n.textContent.trim())")


def srcs(pg):
    return pg.eval_on_selector_all(".pg .src", "ns => ns.map(n => n.textContent.trim())")


def drag_row(pg, start_sel, label, shoot=None):
    """ลากแถวที่ 2 (bravo) ขึ้นเหนือแถวที่ 1 ด้วยเมาส์จริง ตรวจระหว่างลากแล้วปล่อย"""
    rows = pg.query_selector_all(".file-row")
    r1 = rows[0].bounding_box()
    handle = rows[1].query_selector(start_sel)
    hb = handle.bounding_box()
    sx, sy = hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2
    pg.evaluate(COUNT_DRAGSTART)
    pg.mouse.move(sx, sy)
    pg.mouse.down()
    ty = r1["y"] + 2                       # ลากไปเหนือกึ่งกลางแถวแรก
    steps = 14
    for k in range(1, steps + 1):
        pg.mouse.move(sx + 3, sy + (ty - sy) * k / steps)
        pg.wait_for_timeout(25)
    pg.wait_for_timeout(250)

    st = pg.evaluate("""() => {
      const g = document.querySelector('.fr-ghost');
      const s = document.querySelector('.file-row.fr-slot');
      const rows = [...document.querySelectorAll('.file-row:not(.fr-ghost)')];
      const cs = g ? getComputedStyle(g) : null;
      return {
        ghost: !!g,
        opacity: cs ? parseFloat(cs.opacity) : 0,
        pos: cs ? cs.position : '',
        shadow: cs ? cs.boxShadow : '',
        sel: window.getSelection().toString(),
        ds: window.__ds,
        slot: !!s,
        slotIdx: s ? rows.indexOf(s) : -1,
        hasUp: document.querySelector('.fr-ghost') ? true : false,
      };
    }""")
    ck(st["ghost"], f"{label} ระหว่างลากมีสำเนาลอยตามเมาส์ (.fr-ghost)")
    ck(st["opacity"] >= 0.95, f"{label} สำเนาลอยทึบ ไม่จาง (opacity {st['opacity']})", str(st["opacity"]))
    ck(st["pos"] == "fixed" and st["shadow"] not in ("", "none"),
       f"{label} สำเนาลอยมีเงา ลอยอยู่ชั้นบน", f"{st['pos']} / {st['shadow'][:40]}")
    ck(st["sel"] == "", f"{label} ไม่มีข้อความถูกเลือก (ไม่มีสีฟ้าคลุม)", repr(st["sel"][:40]))
    ck(st["ds"] == 0, f"{label} ไม่มี dragstart ของเบราว์เซอร์ (ที่ทำให้ภาพจางกับเคอร์เซอร์ห้าม)", str(st["ds"]))
    ck(st["slot"], f"{label} มีช่องว่างที่จะวาง (.fr-slot)")
    ck(st["slotIdx"] == 0, f"{label} ช่องว่างขยับขึ้นไปอยู่บนสุด แถวอื่นเลื่อนหลบ", str(st["slotIdx"]))
    cur = pg.evaluate("""([x, y]) => { const e = document.elementFromPoint(x, y);
      return e ? getComputedStyle(e).cursor : '' }""", [sx + 3, ty])
    ck(cur == "grabbing", f"{label} เคอร์เซอร์เป็นมือกำ ไม่ใช่รูปห้าม (ได้ {cur})", cur)
    if shoot:
        shot(pg, shoot)
    pg.mouse.up()
    pg.wait_for_timeout(700)


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    a, b = tmp / "alpha.pdf", tmp / "bravo.pdf"
    make_pdf(a, "A", 2)
    make_pdf(b, "B", 3)

    with sync_playwright() as p:
        br = p.chromium.launch()

        # ── เดสก์ท็อป ──
        ctx = br.new_context(viewport={"width": 1440, "height": 950}, locale="th-TH")
        # ธีมตั้งเฉพาะตอนยังไม่เคยตั้ง ไม่งั้นรอบโหมดมืดถูกทับกลับเป็นสว่างทุกครั้งที่โหลดหน้า (เจอจากภาพ drag_dark.png ที่ออกมาสว่าง)
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th');if(!localStorage.getItem('fk-theme'))localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        fkui.open_tool(pg, "pdf-pages", base=BASE)
        fkui.feed(pg, [a, b])
        pg.wait_for_function("() => document.querySelectorAll('.pg').length >= 5", timeout=60000)
        pg.wait_for_timeout(1200)
        ck(names(pg) == ["alpha.pdf", "bravo.pdf"], "เริ่มต้นแถวไฟล์เรียง alpha แล้ว bravo", str(names(pg)))
        ck(srcs(pg)[:5] == ["A", "A", "B", "B", "B"], "เริ่มต้นหน้าเรียง A A B B B", str(srcs(pg)))

        # ปุ่มขึ้นลงต้องเป็นไอคอน จับกลุ่มเป็นปุ่มคู่
        info = pg.evaluate("""() => [...document.querySelectorAll('.file-row')].map(r => {
          const bs = [...r.querySelectorAll('button[aria-label^="เลื่อน"]')];
          return { n: bs.length, svg: bs.every(b => b.querySelector('svg')),
                   txt: bs.map(b => b.textContent.trim()).join(''),
                   pair: bs.length === 2 && bs[0].parentElement === bs[1].parentElement
                         && bs[0].parentElement !== r,
                   w: bs.map(b => Math.round(b.getBoundingClientRect().width)) };
        })""")
        ck(all(i["n"] == 2 for i in info), "ทุกแถวมีปุ่มเลื่อนขึ้นกับลง", str(info))
        ck(all(i["svg"] for i in info), "ปุ่มเลื่อนเป็นไอคอน svg", str(info))
        ck(all(i["txt"] == "" for i in info), "ปุ่มเลื่อนไม่มีตัวอักษร ↑ ↓", str(info))
        ck(all(i["pair"] for i in info), "ปุ่มขึ้นลงจับกลุ่มเป็นปุ่มคู่เดียวกัน (segmented)", str(info))
        shot(pg, "buttons_light.png")

        # กดปุ่มบนแถว ต้องไม่เริ่มลาก
        rows = pg.query_selector_all(".file-row")
        ub = rows[1].query_selector('button[aria-label^="เลื่อน"]')
        ubb = ub.bounding_box()
        pg.mouse.move(ubb["x"] + ubb["width"] / 2, ubb["y"] + ubb["height"] / 2)
        pg.mouse.down()
        pg.mouse.move(ubb["x"] + ubb["width"] / 2, ubb["y"] - 60, steps=8)
        mid = pg.evaluate("() => !!document.querySelector('.fr-ghost')")
        pg.mouse.up()
        pg.wait_for_timeout(500)
        ck(not mid, "กดค้างบนปุ่มเลื่อนแล้วลาก ไม่ถือเป็นการลากแถว")
        # ถ้าปล่อยบนปุ่มเดิม เบราว์เซอร์ไม่ยิง click ถ้าขยับออกไปแล้ว ลำดับต้องไม่เปลี่ยน
        ck(names(pg) == ["alpha.pdf", "bravo.pdf"], "ลำดับยังเหมือนเดิมหลังลองลากจากปุ่ม", str(names(pg)))

        # ลากจากตัวจับ grip
        drag_row(pg, ".grip", "[ลากจาก grip]", shoot="drag_light.png")
        ck(names(pg) == ["bravo.pdf", "alpha.pdf"], "ปล่อยแล้วแถวแรกเป็น bravo", str(names(pg)))
        ck(pg.evaluate("() => !document.querySelector('.fr-ghost, .fr-slot')"), "ปล่อยแล้วสำเนาลอยกับช่องว่างหายหมด")
        ck(srcs(pg)[:5] == ["A", "A", "A", "B", "B"],
           "หน้าในเครื่องมือจัดการหน้า PDF เรียงตามไฟล์ใหม่ (A A A B B)", str(srcs(pg)))
        ck(pg.evaluate("() => document.querySelectorAll('.file-row').length") == 2, "ยังมี 2 แถวไฟล์พอดี")

        # ลากจากตัวแถว (ชื่อไฟล์) กลับลง ต้องไม่เปิดตัวดูไฟล์ด้วย
        rows = pg.query_selector_all(".file-row")
        r2 = rows[1].bounding_box()
        pg.evaluate(COUNT_DRAGSTART)
        # ลากแถวบน (bravo) ลงต่ำกว่าแถวล่าง ผ่านตัวชื่อไฟล์
        h = rows[0].query_selector(".f-name").bounding_box()
        sx, sy = h["x"] + 20, h["y"] + h["height"] / 2
        pg.mouse.move(sx, sy)
        pg.mouse.down()
        for k in range(1, 15):
            pg.mouse.move(sx + 2, sy + (r2["y"] + r2["height"] - 2 - sy) * k / 14)
            pg.wait_for_timeout(25)
        pg.wait_for_timeout(250)
        mid = pg.evaluate("() => ({g: !!document.querySelector('.fr-ghost'), s: window.getSelection().toString(), ds: window.__ds})")
        ck(mid["g"], "ลากจากตัวแถว (ชื่อไฟล์) ก็ยกแถวลอยได้")
        ck(mid["s"] == "" and mid["ds"] == 0, "ลากจากตัวแถว ไม่เลือกข้อความและไม่มี dragstart", str(mid))
        pg.mouse.up()
        pg.wait_for_timeout(700)
        ck(names(pg) == ["alpha.pdf", "bravo.pdf"], "ลากลงแล้วลำดับกลับเป็น alpha bravo", str(names(pg)))
        ck(pg.evaluate("() => !document.querySelector('.viewer, .fk-viewer, [role=dialog]:not([hidden])')"),
           "ลากจากชื่อไฟล์แล้วปล่อย ไม่เปิดตัวดูไฟล์ผิดจังหวะ")

        # Esc ระหว่างลาก = ยกเลิก ลำดับเดิม
        rows = pg.query_selector_all(".file-row")
        g = rows[1].query_selector(".grip").bounding_box()
        pg.mouse.move(g["x"] + 6, g["y"] + 6)
        pg.mouse.down()
        pg.mouse.move(g["x"] + 6, g["y"] - 70, steps=10)
        pg.wait_for_timeout(150)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(500)
        pg.mouse.up()
        pg.wait_for_timeout(400)
        ck(names(pg) == ["alpha.pdf", "bravo.pdf"] and pg.evaluate("() => !document.querySelector('.fr-ghost, .fr-slot')"),
           "กด Esc ระหว่างลาก ยกเลิก ลำดับเดิม ไม่มีเศษค้าง", str(names(pg)))

        # โหมดมืด
        pg.evaluate("() => { try{localStorage.setItem('fk-theme','dark')}catch(e){} }")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(800)
        fkui.feed(pg, [a, b])
        pg.wait_for_function("() => document.querySelectorAll('.pg').length >= 5", timeout=60000)
        pg.wait_for_timeout(1000)
        shot(pg, "buttons_dark.png")
        rows = pg.query_selector_all(".file-row")
        gb = rows[1].query_selector(".grip").bounding_box()
        pg.mouse.move(gb["x"] + 6, gb["y"] + 6)
        pg.mouse.down()
        pg.mouse.move(gb["x"] + 6, rows[0].bounding_box()["y"] + 2, steps=12)
        pg.wait_for_timeout(300)
        shot(pg, "drag_dark.png")
        pg.mouse.up()
        pg.wait_for_timeout(600)
        ctx.close()

        # ── มือถือ (จอสัมผัส) ปุ่มขึ้นลงยัง 44px และกดได้ ──
        ctx = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="th-TH")
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        ck(pg.evaluate("matchMedia('(pointer:coarse)').matches"), "[มือถือ] จำลองจอสัมผัสได้ (pointer:coarse)")
        fkui.open_tool(pg, "pdf-merge", base=BASE)
        fkui.feed(pg, [a, b])
        pg.wait_for_selector(".file-row", timeout=15000)
        sizes = pg.evaluate("""() => [...document.querySelectorAll('.file-row button[aria-label^="เลื่อน"]')]
          .map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), !!b.querySelector('svg')]; })""")
        ck(len(sizes) == 4 and all(w >= 44 and h >= 44 for w, h, _ in sizes), "[มือถือ] ปุ่มขึ้นลงทุกปุ่มอย่างน้อย 44x44", str(sizes))
        ck(all(s for _, _, s in sizes), "[มือถือ] ปุ่มเป็นไอคอน svg", str(sizes))
        shot(pg, "buttons_mobile.png")
        before = names(pg)
        pg.locator('.file-row button[aria-label^="เลื่อน"][aria-label$="ขึ้น"]').nth(1).tap()
        pg.wait_for_timeout(500)
        after = names(pg)
        ck(before == ["alpha.pdf", "bravo.pdf"] and after == ["bravo.pdf", "alpha.pdf"],
           "[มือถือ] แตะปุ่มขึ้นของแถวที่สอง ลำดับสลับจริง", f"{before} -> {after}")
        ctx.close()
        br.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
