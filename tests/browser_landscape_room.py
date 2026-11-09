#!/usr/bin/env python3
"""มือถือแนวนอนจอเตี้ย ต้องเหลือที่ให้เห็นเอกสารอย่างน้อย 40% ของความสูงจอ (และไม่ต่ำกว่า 110px)
วัดจากขอบล่างแถบเครื่องมือถึงขอบบนแถบล่าง ปุ่มหลักยังเห็นครบสูงอย่างน้อย 44px และหน้าไม่เลื่อนซ้ายขวา

‼️ ที่มา 09/11/2026 เทสเตอร์มือถือ B3 (.claude/evidence/2026-11-09-tester-fk-mobile/REPORT_FINDINGS.txt)
   iPhone SE แนวนอน 568x320 pdf-edit เห็นเอกสาร 0px (หัวเว็บ 61 แถบเครื่องมือสองแถว 101 แถบล่าง 156)
   Galaxy Fold แนวนอน 653x280 pdf-edit pdf-sign 0px , iPhone 15 แนวนอน 852x393 pdf-sign 54px

ใช้: python3 -m http.server 8899 &  แล้ว FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_landscape_room.py"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
PDF = pathlib.Path(__file__).resolve().parents[1] / "samples" / "ตัวอย่าง-รายงานประจำเดือน.pdf"
ok = fail = 0

Q = """() => { const g = s => document.querySelector(s)?.getBoundingClientRect();
  const tb = g('.s2-tbar'), side = g('.s2-side'), cv = g('.s2-canvas');
  const top = tb && tb.height > 0 ? tb.bottom : (cv ? cv.top : 0);
  const cta = [...document.querySelectorAll('button.s2-cta')].find(b => b.getBoundingClientRect().height > 0);
  const c = cta && cta.getBoundingClientRect();
  return { ih: innerHeight, band: Math.round((side ? side.top : innerHeight) - top),
           sideBottom: side ? Math.round(side.bottom) : null,
           cta: c ? [Math.round(c.top), Math.round(c.bottom), Math.round(c.height)] : null,
           hscroll: document.documentElement.scrollWidth - innerWidth } }"""


def ck(label, cond, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if detail else ""), flush=True)


VIEWS = [("iPhone SE แนวนอน", 568, 320), ("Galaxy Fold แนวนอน", 653, 280), ("iPhone 15 แนวนอน", 852, 393)]
TOOLS = ("pdf-edit", "pdf-sign", "pdf-pages", "pdf-watermark")


def main():
    assert PDF.exists(), f"ไม่มีไฟล์ตัวอย่าง {PDF}"
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h in VIEWS:
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, locale="th-TH")
            pg = ctx.new_page()
            for tool in TOOLS:
                fkui.open_tool(pg, tool, base=BASE)
                fkui.feed(pg, [PDF])
                pg.wait_for_timeout(1500)
                m = pg.evaluate(Q)
                need = max(110, round(0.4 * m["ih"]))
                ck(f"{name} {tool} เห็นเอกสารอย่างน้อย {need}px", m["band"] >= need, f"ได้ {m['band']}px")
                ck(f"{name} {tool} ปุ่มหลักอยู่ในจอครบ สูงอย่างน้อย 44px",
                   bool(m["cta"]) and m["cta"][1] <= m["ih"] + 1 and m["cta"][2] >= 44, f"cta={m['cta']} ih={m['ih']}")
                ck(f"{name} {tool} หน้าไม่เลื่อนซ้ายขวา", m["hscroll"] <= 1, f"เกิน {m['hscroll']}px")
            ctx.close()
        b.close()
    print(f"สรุป: ผ่าน {ok} ตก {fail}", flush=True)
    sys.exit(1 if fail or ok == 0 else 0)


if __name__ == "__main__":
    main()
