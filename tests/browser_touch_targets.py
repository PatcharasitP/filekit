#!/usr/bin/env python3
"""มือถือ ปุ่มที่แตะบ่อยและปุ่มสำคัญต้องแตะได้สบายอย่างน้อย 44x44 px และลิ้นชักตัวเลือกปิดได้ด้วยการแตะฉากหลัง

‼️ ที่มา 09/11/2026 เทสเตอร์มือถือ (.claude/evidence/2026-11-09-tester-fk-mobile/REPORT_FINDINGS.txt)
   U1 ปุ่มดาวน์โหลดหน้าผลลัพธ์ 41x36 (ปุ่มสำคัญที่สุดของหน้า) , U2 ปุ่มเอาไฟล์ออก 36x36 (ปุ่มทำลายข้อมูล)
   U3 ปุ่มปิดลิ้นชัก 17x36 และแตะฉากหลังไม่ปิด , U5 ปุ่มภาษา ธีม เมนูเครื่องมือ สูง 36 , U6 ช่องค้นหาหน้าแรก 14.5px
   (Safari บน iPhone ซูมทั้งหน้าเมื่อแตะช่องที่ตัวอักษรเล็กกว่า 16px)

ใช้: python3 -m http.server 8899 &  แล้ว FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_touch_targets.py"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
PDF = pathlib.Path(__file__).resolve().parents[1] / "samples" / "ตัวอย่าง-รายงานประจำเดือน.pdf"
PDF2 = PDF.with_name("ตัวอย่าง-ใบปะหน้าเอกสาร.pdf")
MIN = 44
ok = fail = 0

SIZES = """(sel) => [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0; })
  .map(e => { const r = e.getBoundingClientRect(); return [(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), Math.round(r.width), Math.round(r.height)]; })"""


def ck(label, cond, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if detail else ""), flush=True)


def all_big(pg, label, sel, need_any=True):
    got = pg.evaluate(SIZES, sel)
    small = [g for g in got if g[1] < MIN or g[2] < MIN]
    ck(f"{label} ทุกปุ่มอย่างน้อย {MIN}x{MIN}", (bool(got) or not need_any) and not small, f"เจอ {len(got)} ปุ่ม เล็ก {small[:3]}")


VIEWS = [("iPhone SE", 320, 568), ("Galaxy Fold", 280, 653), ("Pixel 7", 412, 915)]


def main():
    assert PDF.exists(), f"ไม่มีไฟล์ตัวอย่าง {PDF}"
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h in VIEWS:
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, locale="th-TH")
            pg = ctx.new_page()
            ck(f"{name} จำลองจอสัมผัส (pointer:coarse)", pg.evaluate("matchMedia('(pointer:coarse)').matches"))
            # U2 ปุ่มในแถวไฟล์ (ขึ้น ลง เอาออก)
            fkui.open_tool(pg, "pdf-merge", base=BASE)
            fkui.feed(pg, [PDF, PDF2])
            all_big(pg, f"{name} pdf-merge ปุ่มในแถวไฟล์", ".file-row button.icon-btn")
            # U5 หัวเว็บในหน้าเครื่องมือ
            all_big(pg, f"{name} หัวเว็บหน้าเครื่องมือ (ภาษา ธีม เมนู)", ".top .langopt, .top .iconbtn, .top .s2-menubtn")
            # โลโก้หน้าเครื่องมือจอแคบต้องเหลือไอคอน ไม่ใช่ปุ่มล่องหน (เจอ 10/11/2026 ซ่อนข้อความแล้วไอคอนหายด้วย)
            mk = pg.evaluate("() => { const r = document.querySelector('.top .brand .mark')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null }")
            ck(f"{name} โลโก้หน้าเครื่องมือมองเห็น", bool(mk) and mk[0] >= 20 and mk[1] >= 20, str(mk))
            mt = pg.evaluate("() => { const b = document.querySelector('.top .s2-menubtn'); const s = [...b.querySelectorAll('span')].filter(x => x.getBoundingClientRect().width > 0); return s.map(x => [x.textContent.trim(), Math.round(x.scrollWidth - x.clientWidth)]) }")
            ck(f"{name} ป้ายปุ่มเมนูเครื่องมือขึ้นครบไม่ถูกตัด", len(mt) == 1 and mt[0][1] <= 0 and len(mt[0][0]) >= 3, str(mt))
            hs = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
            ck(f"{name} หน้าเครื่องมือไม่เลื่อนซ้ายขวา", hs <= 0, f"{hs}px")
            # U1 ปุ่มดาวน์โหลดหน้าผลลัพธ์
            fkui.act(pg, "รวม")
            pg.wait_for_function("() => document.querySelector('.s2')?.dataset.state === 'result'", timeout=60000)
            pg.wait_for_timeout(500)
            all_big(pg, f"{name} pdf-merge ปุ่มในแผงผลลัพธ์", ".s2-side-res button")
            # U3 ลิ้นชักตัวเลือก
            fkui.open_tool(pg, "pdf-protect", base=BASE)
            fkui.feed(pg, [PDF])
            pg.locator("button.s2-sheetbtn:visible").first.click()
            pg.wait_for_timeout(500)
            all_big(pg, f"{name} ปุ่มหัวลิ้นชัก (ปิด เริ่มใหม่)", ".s2-side.open .s2-sheet-hd button, .s2-side.open .s2-side-hd button")
            top = pg.evaluate("() => Math.round(document.querySelector('.s2-side.open')?.getBoundingClientRect().top ?? -1)")
            ck(f"{name} ลิ้นชักเปิดอยู่ก่อนแตะฉากหลัง", top > 60, f"ขอบบน {top}")
            pg.touchscreen.tap(w // 2, max(30, top - 30))
            pg.wait_for_timeout(500)
            closed = pg.evaluate("() => !document.querySelector('.s2-side.open')")
            ck(f"{name} แตะฉากหลังเหนือลิ้นชักแล้วลิ้นชักปิด", closed)
            focus_ok = pg.evaluate("() => document.activeElement && document.activeElement !== document.body")
            ck(f"{name} ปิดลิ้นชักแล้วโฟกัสไม่หลุดไป body", focus_ok, pg.evaluate("() => document.activeElement?.className || document.activeElement?.tagName"))
            # U4 เปิดลิ้นชักแล้วเห็นตัวเลือกแรกครบ ไม่ซ่อนใต้แถบปุ่มล่าง (เทสเตอร์ iPhone SE 7 จาก 8 เครื่องมือถูกบัง)
            for tool in ("pdf-protect", "pdf-compress", "pdf-page-numbers", "pdf-split"):
                fkui.open_tool(pg, tool, base=BASE)
                fkui.feed(pg, [PDF])
                btn = pg.locator("button.s2-sheetbtn:visible")
                if not btn.count():
                    ck(f"{name} {tool} มีปุ่มตัวเลือก", False)
                    continue
                btn.first.click()
                pg.wait_for_timeout(600)
                v = pg.evaluate("""() => { const bd = document.querySelector('.s2-side.open .s2-side-bd'); if (!bd) return null;
                  const c = [...bd.querySelectorAll('input:not([type=file]):not([type=hidden]), select, textarea')].find(x => !x.closest('.dz-wrap, .dz, .file-row') && x.getClientRects().length);
                  if (!c) return 'ไม่มีช่อง'; const r = c.getBoundingClientRect(), b = bd.getBoundingClientRect(), f = document.querySelector('.s2-side.open .s2-side-ft').getBoundingClientRect();
                  return [Math.round(r.top), Math.round(r.bottom), Math.round(b.top), Math.round(Math.min(b.bottom, f.top))] }""")
                seen = isinstance(v, list) and v[0] >= v[2] - 1 and v[1] <= v[3] + 1
                ck(f"{name} {tool} เปิดลิ้นชักแล้วเห็นช่องตัวเลือกแรกครบ", seen, f"ช่อง บน ล่าง, พื้นที่ บน ล่าง = {v}")
                act = pg.evaluate("() => document.activeElement?.tagName")
                ck(f"{name} {tool} เปิดลิ้นชักแล้วไม่โฟกัสช่องพิมพ์เอง (แป้นพิมพ์ไม่เด้ง)", act not in ("INPUT", "TEXTAREA"), act)
            # U6 ช่องค้นหาหน้าแรก
            pg.goto(BASE + "/")
            pg.wait_for_selector("#q", timeout=20000)
            fs = pg.evaluate("() => parseFloat(getComputedStyle(document.querySelector('#q')).fontSize)")
            ck(f"{name} ช่องค้นหาหน้าแรกตัวอักษรอย่างน้อย 16px (Safari ไม่ซูมทั้งหน้า)", fs >= 16, f"{fs}px")
            all_big(pg, f"{name} หัวเว็บหน้าแรก (ภาษา ธีม)", ".top .langopt, .top .iconbtn")
            wide = pg.evaluate("() => [document.documentElement.scrollWidth - innerWidth, Math.round(document.querySelector('.search').getBoundingClientRect().right - document.querySelector('.hero').getBoundingClientRect().right)]")
            ck(f"{name} หน้าแรกไม่เลื่อนซ้ายขวา และช่องค้นหาไม่ล้นการ์ด", wide[0] <= 0 and wide[1] <= 0, str(wide))
            ctx.close()
        # เมาส์บนคอมต้องไม่ได้ปุ่มอ้วน (กฎใช้เฉพาะจอสัมผัส)
        ctx = b.new_context(viewport={"width": 1366, "height": 800}, locale="th-TH")
        pg = ctx.new_page()
        fkui.open_tool(pg, "pdf-merge", base=BASE)
        fkui.feed(pg, [PDF, PDF2])
        got = pg.evaluate(SIZES, ".file-row button.icon-btn")
        ck("คอมใช้เมาส์ ปุ่มแถวไฟล์คงขนาดเดิม (ไม่เกิน 40)", got and all(g[2] <= 40 for g in got), str(got[:2]))
        ctx.close()
        b.close()
    print(f"สรุป: ผ่าน {ok} ตก {fail}", flush=True)
    sys.exit(1 if fail or ok == 0 else 0)


if __name__ == "__main__":
    main()
