#!/usr/bin/env python3
"""ตัวแก้ไขบนหน้า รอบ 6 (19/11/2026) รวมลายเซ็นกับรูป และระยะห่างในแผง

  พี่ปอนด์: "รูปกับลายเซ็นคล้ายกันมาก รวมกันอันเดียวดีไหม" , "ชิดกันเกินไหม"
  ①  เครื่องมือเหลือ 4 ปุ่ม เรียง 2 แถว แถวละ 2 (ปิดทับ ข้อความ ไฮไลต์ ลายเซ็นและรูป)
  ②  ลายเซ็นที่วาดกับรูปที่อัปโหลดอยู่ช่อง "ที่บันทึกไว้" ช่องเดียว ลากทั้งสองชนิดมาวาง ลงไฟล์ตรงจุดปล่อย
      ของที่บันทึกไว้ในที่เก็บเดิม (filekit-signatures) ยังอยู่
  ③  สวิตช์ลบพื้นขาว ปิดไว้ก่อน เปิดแล้วมุมรูปโปร่งทั้งในภาพย่อและในไฟล์ (alpha 0)
  ④  ข้อความเตือนสั้นบรรทัดเดียว
  ⑤  ไม่มีคำว่า null หรือ undefined บนจอ (v248 กดใช้ลายเซ็นนี้แล้วสลับไปรูป ขึ้น null ใต้ปุ่มเลือกไฟล์รูป)
  ⑥  หน้าแก้ไขและเซ็น (pdf-edit) เหมือนกัน
  ⑦  ช่องช่วงหน้ากับปุ่มใช้ช่วงนี้อยู่แถวเดียว สูงเท่ากัน ห่างอย่างน้อย 8px ที่ 1440 , 390 ไม่ล้นแนวนอน
      control ติดกันทุกคู่ในแผงตัวเลือกและแผงแก้ไขห่างอย่างน้อย 8px
  ภาพจอ คอม 1440 และมือถือ 390

ไฟล์ผลลัพธ์อ่านด้วย PyMuPDF (ตำแหน่งภาพ และหน้ากากความโปร่งของภาพ)
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfpages_edit_r6.py [--shots <โฟลเดอร์>]
"""
import base64
import io
import os
import sys
import tempfile
import traceback
from pathlib import Path

import fitz
from PIL import Image, ImageDraw

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
ok = fail = 0
notes = []

GAPS = """(root) => {
  const R = typeof root === 'string' ? document.querySelector(root) : root;
  if (!R) return {err: 'no root'};
  const vis = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && n.offsetParent !== null; };
  const ctl = [...R.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea, button')]
    .filter(vis).filter((n) => !n.closest('.pe-box') && !n.closest('figure') && !n.matches('.pe-padclear'))
    .filter((n) => !(n.type === 'radio' || n.type === 'checkbox') || n.getBoundingClientRect().width > 6);
  const box = (n) => n.getBoundingClientRect();
  const name = (n) => (n.getAttribute('aria-label') || n.innerText || n.placeholder || n.type || n.tagName).trim().slice(0, 24);
  const bad = [];
  for (const a of ctl) {
    const A = box(a);
    let right = null, below = null;
    for (const b of ctl) {
      if (a === b || a.contains(b) || b.contains(a)) continue;
      const B = box(b);
      const vOv = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      const hOv = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      if (vOv > Math.min(A.height, B.height) * 0.5 && B.left >= A.left + 1) {
        const g = B.left - A.right; if (!right || g < right.g) right = { b, g };
      }
      if (hOv > 4 && B.top >= A.top + 1) {
        const g = B.top - A.bottom; if (!below || g < below.g) below = { b, g };
      }
    }
    for (const [dir, p] of [['ข้าง', right], ['ล่าง', below]]) if (p && p.g < 8) bad.push(`${name(a)} | ${name(p.b)} ${dir} ${p.g.toFixed(1)}`);
  }
  return { n: ctl.length, bad, overflowX: document.documentElement.scrollWidth - innerWidth };
}"""


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  [{detail}]" if detail else ""))


def make_files(tmp):
    a = tmp / "a.pdf"
    d = fitz.open()
    for i in range(3):
        d.new_page(width=595, height=842).insert_text((80, 100), f"Page {i + 1}", fontsize=20)
    d.save(a)
    d.close()
    # รูปสแกนลายเซ็น: พื้นขาว มีหมึกน้ำเงินตรงกลาง กว้าง 2 เท่าของสูง
    scan = tmp / "scan.png"
    im = Image.new("RGB", (240, 120), (255, 255, 255))
    ImageDraw.Draw(im).ellipse((60, 30, 180, 90), fill=(20, 40, 200))
    im.save(scan)
    # ลายเซ็นเดิมที่ v248 เก็บไว้ (รูปแบบเดียวกับ saveSignature: JSON array ของ data URL PNG)
    old = Image.new("RGBA", (280, 100), (0, 0, 0, 0))
    ImageDraw.Draw(old).line((20, 80, 140, 20, 260, 80), fill=(0, 0, 0, 255), width=6)
    buf = io.BytesIO(); old.save(buf, "PNG")
    old_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return a, scan, old_url


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_ppedit6_"))
    A, SCAN, OLD = make_files(tmp)

    with sync_playwright() as pw:
        b = pw.chromium.launch()

        def section(name, fn):
            print(f"\n── {name}")
            try:
                fn()
            except Exception as e:
                ck(False, f"{name}: ทำจนจบไม่ได้", f"{type(e).__name__}: {str(e).splitlines()[0][:160]}")
                if os.environ.get("FK_TRACE"):
                    traceback.print_exc()

        def new_page(w, h, mob=False):
            ctx = b.new_context(viewport={"width": w, "height": h}, accept_downloads=True,
                                **({"device_scale_factor": 2, "is_mobile": True, "has_touch": True} if mob else {}))
            pg = ctx.new_page()
            pg.errs = []
            pg.on("pageerror", lambda e: pg.errs.append(str(e)))
            pg.on("dialog", lambda dg: dg.dismiss())
            return pg

        def fresh(pg, tool="pdf-pages", seed=True):
            pg.goto(f"{BASE}/#{tool}", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(1500)
            if seed:
                pg.evaluate("(u) => { localStorage.clear(); localStorage.setItem('filekit-signatures', JSON.stringify([u])); }", OLD)
                pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(2000)
            if tool == "pdf-pages":
                pg.set_input_files("input[type=file]", [str(A)])
                pg.wait_for_selector(".pg", timeout=60000)
            else:
                pg.set_input_files(".dz input[type=file]", [str(A)])
                pg.wait_for_selector(".pe-stage:not([hidden]) canvas", timeout=60000)
            pg.wait_for_timeout(1500)

        def open_edit(pg):
            btn = pg.locator(".s2-tbar button").filter(has_text="แก้ข้อความบนหน้า").first
            btn.scroll_into_view_if_needed(); btn.click()
            pg.wait_for_selector(".pz.editing", timeout=8000)
            pg.wait_for_timeout(1000)

        def paper_at(pg, fx, fy, sel=".pz-paper"):
            r = pg.locator(sel).bounding_box()
            return r["x"] + r["width"] * fx, r["y"] + r["height"] * fy

        def no_null(pg, scope):
            t = pg.evaluate("(s) => [...document.querySelectorAll(s)].map((n) => n.innerText).join('\\n')", scope)
            words = t.replace("\n", " ").split()
            return not any(w in ("null", "undefined", "NaN") for w in words), t

        def draw_pad(pg, scope):
            c = pg.locator(f"{scope} canvas.sign-canvas").first
            c.scroll_into_view_if_needed()
            r = c.bounding_box()
            pg.mouse.move(r["x"] + r["width"] * 0.2, r["y"] + r["height"] * 0.6); pg.mouse.down()
            pg.mouse.move(r["x"] + r["width"] * 0.5, r["y"] + r["height"] * 0.3, steps=6)
            pg.mouse.move(r["x"] + r["width"] * 0.8, r["y"] + r["height"] * 0.7, steps=6); pg.mouse.up()
            pg.wait_for_timeout(250)

        def upload_input(pg, scope):
            """ช่องเลือกไฟล์ของเครื่องมือลายเซ็นและรูป (v248 มีสองช่อง ช่องที่สองคือรูป)"""
            return pg.locator(f"{scope} input[type=file]").last

        def saved_figs(pg, scope):
            return pg.evaluate("""(s) => [...document.querySelectorAll(s + ' .pe-saved')].filter((n) => n.offsetParent)
              .map((n) => n.querySelectorAll('figure').length)""", scope)

        CORNER = """(src) => new Promise((ok) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
            ok([x.getImageData(1, 1, 1, 1).data[3], x.getImageData(c.width >> 1, c.height >> 1, 1, 1).data[3]]); }; im.src = src; })"""

        def drag_fig(pg, fig, to):
            fig.scroll_into_view_if_needed()
            fb = fig.bounding_box()
            pg.mouse.move(fb["x"] + fb["width"] / 2, fb["y"] + fb["height"] / 2); pg.mouse.down()
            pg.mouse.move((fb["x"] + to[0]) / 2, (fb["y"] + to[1]) / 2, steps=6)
            pg.mouse.move(*to, steps=6); pg.mouse.up(); pg.wait_for_timeout(600)

        def tools_grid(pg, scope):
            return pg.evaluate("""(s) => [...document.querySelectorAll(s + ' button[data-mode]')].filter((n) => n.offsetParent)
              .map((n) => { const r = n.getBoundingClientRect(); return [n.innerText.trim(), Math.round(r.top), Math.round(r.left)]; })""", scope)

        def check_grid(g, where):
            labels = [x[0] for x in g]
            rows = []
            for x in g:
                if not any(abs(x[1] - r) <= 4 for r in rows):
                    rows.append(x[1])
            ck(len(g) == 4 and any("ลายเซ็นและรูป" in x for x in labels), f"① {where} เครื่องมือ 4 ปุ่ม มีลายเซ็นและรูป ({labels})", str(g))
            ck(len(rows) == 2 and all(sum(1 for x in g if abs(x[1] - r) <= 4) == 2 for r in rows), f"① {where} เรียง 2 แถว แถวละ 2", str(g))

        # ①②③④⑤ ตัวดูของจัดการหน้า คอม 1440
        def s1():
            pg = new_page(1440, 950)
            fresh(pg); open_edit(pg)
            check_grid(tools_grid(pg, ".pz-edit"), "ตัวดู")
            pg.click(".pz-edit button[data-mode=sign]"); pg.wait_for_timeout(400)
            n0 = saved_figs(pg, ".pz-edit")
            ck(n0 == [1], f"② ของที่บันทึกไว้จาก v248 ยังอยู่ ({n0})")
            hint = pg.evaluate("""() => { const h = [...document.querySelectorAll('.pz-edit .pe-hint')].find((n) => n.offsetParent && /ใบรับรอง/.test(n.innerText));
              if (!h) return null; const r = document.createRange(); r.selectNodeContents(h);
              const tops = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top)));
              return [h.innerText.trim(), tops.size, h.scrollWidth <= h.clientWidth + 1]; }""")
            ck(bool(hint) and hint[1] == 1 and hint[2] and len(hint[0]) <= 50, f"④ ข้อความเตือนบรรทัดเดียว สั้น ไม่ถูกตัด ({hint})", str(hint))
            draw_pad(pg, ".pz-edit")
            pg.locator(".pz-edit button").filter(has_text="ใช้ลายเซ็นนี้").first.click(); pg.wait_for_timeout(400)
            # ⑤ ท่าที่ v248 ขึ้น null: ใช้ลายเซ็นแล้วไปเครื่องมืออื่นแล้วกลับ
            for m in ("cover", "text", "highlight", "sign", "image"):
                loc = pg.locator(f".pz-edit button[data-mode={m}]")
                if loc.count():
                    loc.click(); pg.wait_for_timeout(250)
                    good, t = no_null(pg, ".pz-edit")
                    ck(good, f"⑤ เครื่องมือ {m} ไม่มีคำว่า null หรือ undefined บนแผง", t[-160:].replace("\n", " / "))
            pg.click(".pz-edit button[data-mode=sign]"); pg.wait_for_timeout(300)
            up = upload_input(pg, ".pz-edit")
            up.set_input_files(str(SCAN)); pg.wait_for_timeout(900)
            n1 = saved_figs(pg, ".pz-edit")
            ck(n1 == [3], f"② อัปโหลดรูปแล้วอยู่ช่องที่บันทึกไว้ช่องเดียวกับลายเซ็นที่วาด ({n1} ช่องที่เห็น)")
            good, t = no_null(pg, ".pz-edit")
            ck(good and "scan.png" in t, "⑤ ใต้ปุ่มอัปโหลดขึ้นชื่อไฟล์ ไม่มี null", t[-120:].replace("\n", " / "))
            sw = pg.locator(".pz-edit label").filter(has_text="ลบพื้นขาว")
            ck(sw.count() == 1 and not sw.locator("input").is_checked(), "③ มีสวิตช์ลบพื้นขาว ปิดไว้ก่อน")
            src0 = pg.locator(".pz-edit .pe-saved figure.on img").get_attribute("src")
            a0 = pg.evaluate(CORNER, src0) if src0 else None
            if sw.count():
                sw.click(); pg.wait_for_timeout(900)
            src1 = pg.locator(".pz-edit .pe-saved figure.on img").get_attribute("src")
            a1 = pg.evaluate(CORNER, src1) if src1 else None
            notes.append(f"มุมรูปอัปโหลด alpha ก่อนเปิดสวิตช์ {a0} หลังเปิด {a1} (มุม, กลาง)")
            ck(bool(a0) and a0[0] == 255 and bool(a1) and a1[0] == 0 and a1[1] == 255,
               f"③ เปิดลบพื้นขาวแล้วภาพย่อมุมโปร่ง หมึกตรงกลางยังอยู่ ({a0} เป็น {a1})")
            ck(saved_figs(pg, ".pz-edit") == [3], "③ สลับสวิตช์แล้วไม่ได้ชิ้นซ้ำในที่บันทึกไว้")
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "sign_image_panel_1440.png"))
            figs = pg.locator(".pz-edit .pe-saved figure")
            # ชิ้นแรก = รูปที่เพิ่งอัปโหลด , ชิ้นที่สอง = ลายเซ็นที่วาด
            drag_fig(pg, figs.nth(0), paper_at(pg, 0.30, 0.30))
            drag_fig(pg, figs.nth(1), paper_at(pg, 0.60, 0.70))
            n = pg.locator(".pz .pe-box.stamp").count()
            ck(n == 2, f"② ลากรูปและลายเซ็นจากที่บันทึกไว้มาวางได้ทั้งสองชิ้น ({n})")
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "placed_both_1440.png"))
            ck(not pg.errs, "ไม่มี error ในหน้าเว็บ", "; ".join(pg.errs[:2]))
            pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
            out = tmp / "both.pdf"
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible").filter(has_text="บันทึก").first.click()
                pg.wait_for_timeout(2500)
                pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
            dl.value.save_as(str(out))
            doc = fitz.open(str(out)); p = doc[0]
            W, H = p.rect.width, p.rect.height
            info = sorted(p.get_image_info(xrefs=True), key=lambda i: i["bbox"][1])
            if len(info) != 2:
                return ck(False, "② ไฟล์มีภาพ 2 ชิ้น", str(len(info)))
            for i, (fx, fy, what) in enumerate(((0.30, 0.30, "รูป"), (0.60, 0.70, "ลายเซ็น"))):
                x0, y0, x1, y1 = info[i]["bbox"]
                cx, cy = (x0 + x1) / 2 / W, (y0 + y1) / 2 / H
                notes.append(f"{what} ในไฟล์กึ่งกลาง ({cx:.4f}, {cy:.4f}) ปล่อยที่ ({fx}, {fy})")
                ck(abs(cx - fx) <= 0.01 and abs(cy - fy) <= 0.01, f"② {what}ลงไฟล์ตรงจุดปล่อย ({cx:.4f}, {cy:.4f})")
            xref = info[0]["xref"]
            smask = next((im[1] for im in p.get_images(full=True) if im[0] == xref), 0)
            if not smask:
                return ck(False, "③ รูปในไฟล์มีหน้ากากความโปร่ง", f"xref {xref}")
            m = fitz.Pixmap(doc, smask)
            corner, mid = m.pixel(1, 1)[0], m.pixel(m.width // 2, m.height // 2)[0]
            notes.append(f"รูปในไฟล์ หน้ากากโปร่ง มุม {corner} กลาง {mid} (0 = โปร่ง)")
            ck(corner == 0 and mid == 255, f"③ ในไฟล์มุมรูปโปร่ง alpha 0 หมึกตรงกลางทึบ ({corner}, {mid})")
            pg.context.close()
        section("①②③④⑤ ตัวดู คอม 1440", s1)

        # ⑥ หน้าแก้ไขและเซ็น
        def s6():
            pg = new_page(1440, 950)
            fresh(pg, "pdf-edit")
            check_grid(tools_grid(pg, ".pe-right"), "หน้าแก้ไขและเซ็น")
            pg.click(".pe-right button[data-mode=sign]"); pg.wait_for_timeout(400)
            ck(saved_figs(pg, ".pe-right") == [1], "⑥ หน้าแก้ไขและเซ็น ของที่บันทึกไว้เดิมยังอยู่")
            upload_input(pg, ".pe-right").set_input_files(str(SCAN)); pg.wait_for_timeout(900)
            ck(saved_figs(pg, ".pe-right") == [2], f"⑥ หน้าแก้ไขและเซ็น อัปโหลดรูปแล้วเข้าที่บันทึกไว้ช่องเดียวกัน ({saved_figs(pg, '.pe-right')})")
            fig = pg.locator(".pe-right .pe-saved figure").first
            drag_fig(pg, fig, paper_at(pg, 0.5, 0.5, ".pe-stage"))
            ck(pg.locator(".pe-box.stamp").count() == 1, "⑥ หน้าแก้ไขและเซ็น ลากรูปจากที่บันทึกไว้มาวางได้")
            good, t = no_null(pg, ".pe-right")
            ck(good, "⑤ หน้าแก้ไขและเซ็น ไม่มีคำว่า null บนแผง", t[-120:])
            g = pg.evaluate(GAPS, ".pe-right")
            ck(not g["bad"], f"⑦ หน้าแก้ไขและเซ็น control ติดกันทุกคู่ห่างอย่างน้อย 8px ({g['n']} ชิ้น)", str(g["bad"]))
            ck(not pg.errs, "หน้าแก้ไขและเซ็น ไม่มี error", "; ".join(pg.errs[:2]))
            pg.context.close()
        section("⑥ หน้าแก้ไขและเซ็น", s6)

        # ⑦ ระยะห่าง คอม 1440 และมือถือ 390
        def s7():
            for w, h, mob in ((1440, 950, False), (390, 844, True)):
                pg = new_page(w, h, mob)
                fresh(pg, seed=False)
                for sel in (".ws-rail-right", ".s2-sheetbtn"):
                    loc = pg.locator(sel)
                    if loc.count() and loc.first.is_visible():
                        loc.first.click(); pg.wait_for_timeout(700)
                inp = pg.locator("input[placeholder^='เช่น 1-3']").first
                btn = pg.locator("button").filter(has_text="ใช้ช่วงนี้").first
                ib, bb = inp.bounding_box(), btn.bounding_box()
                same = abs(ib["y"] - bb["y"]) <= 1 and abs(ib["height"] - bb["height"]) <= 1
                gap = bb["x"] - (ib["x"] + ib["width"]) if same else bb["y"] - (ib["y"] + ib["height"])
                notes.append(f"{w}: ช่องช่วงหน้า {ib['width']:.0f}x{ib['height']:.0f} ปุ่ม {bb['width']:.0f}x{bb['height']:.0f} แถวเดียวกัน {same} ห่าง {gap:.1f}px")
                if w == 1440:
                    ck(same and gap >= 8, f"⑦ 1440 ช่องกับปุ่มใช้ช่วงนี้อยู่แถวเดียว สูงเท่ากัน ห่าง {gap:.1f}px")
                else:
                    ck(gap >= 8, f"⑦ 390 ช่องกับปุ่มใช้ช่วงนี้ห่าง {gap:.1f}px (แถวเดียวกัน {same})")
                root = pg.evaluate_handle("() => document.querySelector(\"input[placeholder^='เช่น 1-3']\").closest('.s2-side-bd, .s2-side, aside') || document.body")
                g = pg.evaluate(GAPS, root)
                ck(not g["bad"] and g["overflowX"] <= 0, f"⑦ {w} แผงตัวเลือก control ติดกันทุกคู่ห่างอย่างน้อย 8px ไม่ล้นแนวนอน ({g['n']} ชิ้น)", str(g))
                if SHOTS:
                    pg.screenshot(path=str(SHOTS / f"options_{w}.png"))
                if mob:
                    # ปิดแผ่นตัวเลือกก่อน (ห้ามกด Escape บนจอคอม เพราะไม่ได้เลือกหน้า = ออกจากเครื่องมือ)
                    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
                open_edit(pg)
                for m in ("cover", "text", "highlight", "sign"):
                    pg.click(f".pz-edit button[data-mode={m}]"); pg.wait_for_timeout(250)
                    g = pg.evaluate(GAPS, ".pz-edit")
                    ck(not g["bad"], f"⑦ {w} แผงแก้ไขเครื่องมือ {m} control ติดกันทุกคู่ห่างอย่างน้อย 8px", str(g["bad"]))
                if mob:
                    check_grid(tools_grid(pg, ".pz-edit"), "มือถือ")
                if SHOTS:
                    pg.screenshot(path=str(SHOTS / f"viewer_sign_{w}.png"))
                pg.context.close()
        section("⑦ ระยะห่าง", s7)
        b.close()

    if notes:
        print("\n      ค่าที่วัด")
        for n in notes:
            print(f"      {n}")
    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
