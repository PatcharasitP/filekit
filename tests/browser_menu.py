#!/usr/bin/env python3
"""เมนูรวมเครื่องมือกับหน้าแรก ต้องแบ่งหมวดใหญ่เป็นกลุ่มย่อยได้จริง และไม่มีเครื่องมือหล่นหาย

‼️ ที่มา 23/09/2026: หมวด PDF โตจาก 16 เป็น 26 ตัว
   เดิมเมนูหั่นสองคอลัมน์ด้วยเลขดัชนีตายตัว (MENU_SPLIT = [10, ...]) ซึ่งมีปัญหาสองชั้น
   ① คอลัมน์ที่สองยาว 16 แถว เลยความสูงของกล่องเมนูบนจอเตี้ย
   ② เพิ่มเครื่องมือกลางหมวดเมื่อไร เส้นแบ่งเลื่อนไปคนละที่โดยไม่มีอะไรฟ้อง
   ตอนนี้กลุ่มย่อยมาจากทะเบียน (ช่อง sub) เทสนี้จึงเป็นเครื่องบังคับว่า
   **เครื่องมือ PDF ตัวใหม่ที่ลืมใส่ sub = แดง ไม่ใช่หายเงียบจากเมนู**

สิ่งที่ตรวจ (ถามแบบคนใช้ ไม่ใช่ถามโครงสร้าง)
   ① เปิดเมนูแล้วเห็นหัวกลุ่มครบ 4 ชื่อ และเครื่องมือทุกตัวในทะเบียนอยู่ในเมนูพอดีหนึ่งที่
   ② ไม่มีคอลัมน์ไหนยาวเกินกล่อง (ต้องไม่ต้องเลื่อนเพื่อเห็นตัวสุดท้าย) ที่จอ 1280 และ 900x700
   ③ หน้าแรกกดชิป PDF แล้วเห็นหัวกลุ่มย่อย 4 อัน และทุกป้ายอยู่ใต้หัวใดหัวหนึ่ง
   ④ โหมดอังกฤษ หัวกลุ่มต้องเป็นอังกฤษ (ไม่ใช่ไทยค้าง)
   ⑤ คลิกจากเมนูแล้วเปิดเครื่องมือนั้นจริง

--selftest: ถอด sub ของเครื่องมือหนึ่งตัวออกกลางอากาศ แล้วเทสต้องจับได้ว่าเมนูขาดตัวนั้น
รัน: FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_menu.py
"""
import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
ROOT = Path(__file__).resolve().parents[1]
SELFTEST = "--selftest" in sys.argv
P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok:
        P += 1
    else:
        F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


def registry_subs():
    """อ่านกลุ่มย่อยจากไฟล์ทะเบียนตรง ๆ (ไม่ผ่านเบราว์เซอร์) เพื่อเอาไว้เทียบกับที่จอแสดง"""
    src = (ROOT / "src" / "registry.js").read_text(encoding="utf-8")
    subs = re.findall(r'\{ id: "(\w+)",\s*label: "([^"]+)" \}', src)
    tools = re.findall(r'\{ id:"([\w-]+)",\s*group:"(\w+)",(?:\s*sub:"(\w+)",)?', src)
    return subs, tools


MENU_JS = """() => {
  const panel = document.getElementById('toolmenupanel');
  const cols = [...panel.querySelectorAll('.s2-col')];
  const box = panel.getBoundingClientRect();
  return { cols: cols.map(c => ({
      head: c.querySelector('h4')?.textContent.trim(),
      tools: [...c.querySelectorAll('[data-id]')].map(a => a.dataset.id),
      bottom: Math.round(c.getBoundingClientRect().bottom) })),
    panelBottom: Math.round(box.bottom), panelTop: Math.round(box.top),
    scrollOver: panel.scrollHeight - panel.clientHeight,
    winH: window.innerHeight };
}"""

PDF_CHIP = '#cats button.cat:has-text("PDF")'

HOME_JS = """() => { const out = []; let head = null;
  for (const n of document.querySelectorAll('#tools .pill-group, #tools .pill')) {
    if (n.classList.contains('pill-group')) { head = n.textContent.trim(); out.push({ head, tools: [] }); }
    else if (out.length) out[out.length - 1].tools.push(n.dataset.id);
    else out.push({ head: null, tools: [n.dataset.id] }); }
  return out; }"""


def opaque(css_color):
    """สีนี้ทึบไหม — transparent หรือ alpha ต่ำกว่า 1 แปลว่ามองทะลุได้"""
    if not css_color or css_color in ("transparent", "rgba(0, 0, 0, 0)"):
        return False
    m = re.match(r"rgba?\(([^)]+)\)", css_color)
    if not m:
        return True
    parts = [x.strip() for x in m.group(1).replace("/", ",").split(",")]
    return len(parts) < 4 or float(parts[3]) >= 0.99


def open_menu(pg):
    # ‼️ ปุ่มเดียวกันเป็นตัวสลับเปิดปิด ถ้าเมนูเปิดค้างอยู่แล้วกดซ้ำ = ปิด (รอ .s2-col แล้วค้างจนหมดเวลา)
    if pg.evaluate("() => !document.getElementById('toolmenupanel').hidden"):
        return
    pg.click("#toolmenu")
    pg.wait_for_selector("#toolmenupanel .s2-col", state="visible", timeout=8000)
    pg.wait_for_timeout(250)


def main():
    subs, tools = registry_subs()
    pdf_ids = [t[0] for t in tools if t[1] == "pdf"]
    want_heads = [s[1] for s in subs]
    missing_sub = [t[0] for t in tools if t[1] == "pdf" and not t[2]]
    ck(f"ทุกเครื่องมือในหมวด PDF มีกลุ่มย่อย ({len(pdf_ids)} ตัว)", not missing_sub, "ไม่มี sub: " + ", ".join(missing_sub))

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        if SELFTEST:
            # ตัวตรวจต้องจับได้จริง: ถอด sub ของ pdf-merge ออกก่อนโมดูลทะเบียนถูกโหลด
            pg.route(re.compile(r".*/src/registry\.js"), lambda r: r.fulfill(
                status=200, content_type="text/javascript; charset=utf-8",
                body=(ROOT / "src" / "registry.js").read_text(encoding="utf-8")
                     .replace('{ id:"pdf-merge",   group:"pdf", sub:"organize",', '{ id:"pdf-merge",   group:"pdf",')))
        pg.goto(BASE + "/#/pdf-pages")
        pg.wait_for_selector("#toolmenu", state="visible", timeout=20000)
        open_menu(pg)
        m = pg.evaluate(MENU_JS)
        heads = [c["head"] for c in m["cols"]]
        ck(f"เมนูมีหัวกลุ่มย่อยของ PDF ครบตามทะเบียน {want_heads}",
           heads[:len(want_heads)] == want_heads, str(heads))
        in_menu = [i for c in m["cols"] for i in c["tools"]]
        if SELFTEST:
            # ของจริงเวลาลืมใส่ sub: เครื่องมือตัวนั้นหายจากเมนูเงียบ ๆ ตัวตรวจต้องเห็น
            ck("ตัวตรวจจับได้ว่าเครื่องมือที่ลืมใส่กลุ่มย่อยหายจากเมนู (pdf-merge)", "pdf-merge" not in in_menu,
               "ยังเห็น pdf-merge ในเมนูทั้งที่ถอด sub ออกแล้ว = ตัวตรวจนี้เชื่อไม่ได้")
            ck("ตัวตรวจไม่ได้จับผิดตัวอื่น (ตัวที่เหลือยังครบ)", len(set(in_menu) & set(pdf_ids)) == len(pdf_ids) - 1,
               f"เหลือ {len(set(in_menu) & set(pdf_ids))} จาก {len(pdf_ids) - 1}")
            b.close()
            return finish()
        ck(f"เครื่องมือ PDF ทุกตัวอยู่ในเมนู ({len(pdf_ids)} ตัว)",
           sorted(set(in_menu) & set(pdf_ids)) == sorted(pdf_ids),
           "ขาด: " + ", ".join(sorted(set(pdf_ids) - set(in_menu))))
        ck("ไม่มีเครื่องมือตัวไหนโผล่สองที่ในเมนู", len(in_menu) == len(set(in_menu)),
           str([i for i in set(in_menu) if in_menu.count(i) > 1]))
        over = [c["head"] for c in m["cols"] if c["bottom"] > m["panelBottom"] + 1]
        ck("ไม่มีคอลัมน์ไหนยาวล้นกล่องเมนู (จอ 1280x900)", not over, str(over))

        # พื้นหลังเมนูต้องทึบจริง ไม่งั้นอ่านไม่ออกเพราะเนื้อหาหน้าทะลุขึ้นมา
        bg = pg.evaluate("() => getComputedStyle(document.getElementById('toolmenupanel')).backgroundColor")
        ck(f"พื้นหลังเมนูทึบ ไม่มองทะลุเห็นเนื้อหาหน้าข้างหลัง ({bg})", opaque(bg), bg)

        pg.set_viewport_size({"width": 900, "height": 700})
        pg.wait_for_timeout(300)
        m2 = pg.evaluate(MENU_JS)
        tall = max((c["bottom"] for c in m2["cols"]), default=0)
        ck("จอเตี้ย 900x700: เมนูยังอยู่ในจอ (เลื่อนในกล่องได้ ไม่ล้นออกนอกจอ)",
           tall <= m2["winH"] + 1 or m2["scrollOver"] > 0, f"ล่างสุด {tall} จอสูง {m2['winH']} เลื่อนได้ {m2['scrollOver']}")
        pg.set_viewport_size({"width": 1280, "height": 900})

        first_convert = next(c for c in m["cols"] if c["head"] == want_heads[-1])["tools"][0]
        open_menu(pg)
        pg.click(f'#toolmenupanel [data-id="{first_convert}"]')
        pg.wait_for_timeout(700)
        ck(f"คลิกจากเมนูแล้วเปิดเครื่องมือนั้นจริง ({first_convert})",
           pg.evaluate("() => location.hash") == f"#/{first_convert}", pg.evaluate("() => location.hash"))

        # ── หน้าแรก: กดชิป PDF แล้วต้องเห็นหัวกลุ่มย่อย ──
        pg.goto(BASE + "/#/")
        pg.wait_for_selector("#tools .pill", timeout=20000)
        pg.click(PDF_CHIP)
        pg.wait_for_timeout(400)
        groups = pg.evaluate(HOME_JS)
        ck(f"หน้าแรกกดชิป PDF เห็นหัวกลุ่มย่อยครบ {want_heads}",
           [g["head"] for g in groups] == want_heads, str([g["head"] for g in groups]))
        loose = [g for g in groups if g["head"] is None]
        ck("ไม่มีป้ายเครื่องมือลอยอยู่นอกหัวกลุ่ม", not loose, str(loose))
        shown = [i for g in groups for i in g["tools"]]
        ck(f"ป้ายบนหน้าแรกครบทั้ง {len(pdf_ids)} ตัว", sorted(shown) == sorted(pdf_ids),
           "ขาด: " + ", ".join(sorted(set(pdf_ids) - set(shown))))

        # ── โหมดอังกฤษ ──
        ctx2 = b.new_context(viewport={"width": 1280, "height": 900})
        ctx2.add_init_script("try { localStorage.setItem('fk-lang','en'); } catch (e) {}")
        pg = ctx2.new_page()
        pg.goto(BASE + "/#/")
        pg.wait_for_selector("#tools .pill", timeout=20000)
        pg.click(PDF_CHIP)
        pg.wait_for_timeout(400)
        en = [g["head"] for g in pg.evaluate(HOME_JS)]
        thai = [h for h in en if h and re.search(r"[฀-๿]", h)]
        ck(f"โหมดอังกฤษ หัวกลุ่มเป็นอังกฤษทุกอัน {en}", not thai, str(thai))
        b.close()
    return finish()


def finish():
    print("\n" + "━" * 60)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1):
            print(f"  {i}. {x}")
        return 1
    print("✅ เมนูกับหน้าแรกแบ่งกลุ่มย่อยถูก ไม่มีเครื่องมือหล่นหาย")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
