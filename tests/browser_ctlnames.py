"""ตัวควบคุมทุกตัวในทุกเครื่องมือต้องมีชื่อที่โปรแกรมอ่านหน้าจออ่านได้

‼️ ที่มา 30/09/2026: ไล่ accessibility tree ของเบราว์เซอร์จริงทุกเครื่องมือ (69 ตัว, 1,080 ตัวควบคุม)
   เจอช่องติ๊กที่ไม่มีชื่อ 10 ช่องใน 6 เครื่องมือ ทุกช่องเป็นสวิตช์รูปแบบเดียวกัน คือ
   <div class="field"><span>ป้าย</span><label class="switch"><input type=checkbox></label></div>
   ป้ายอยู่ใน <span> ข้าง ๆ ไม่ได้ครอบช่อง โปรแกรมอ่านหน้าจออ่านว่า "checkbox" เฉย ๆ
   (เทส browser_a11y.py เดิมตรวจปุ่มกับ aria-live แต่ไม่ได้ไล่ชื่อของช่องกรอก จึงไม่เคยเห็น)

ตรวจแบบเดียวกับที่โปรแกรมอ่านหน้าจอใช้จริง คือชื่อที่เบราว์เซอร์คำนวณให้ (Accessibility.getFullAXTree)
ไม่ใช่ตรวจว่ามี aria-label หรือไม่ เพราะชื่อมาได้จากหลายทาง (label ครอบ, aria-labelledby, title)

‼️ ข้อประชากรไม่ว่าง: ทุกเครื่องมือต้องพบตัวควบคุมอย่างน้อย 1 ตัว และรวมกันเกิน 500 ตัว
   ถ้าตัวตรวจอ่านต้นไม้ได้ศูนย์ตัว จะไม่ผ่านแบบหลอกว่า "ไม่มีตัวไม่มีชื่อ"

รัน: python3 -m http.server 8899 &  แล้ว ../.venv/bin/python tests/browser_ctlnames.py
"""
import os
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8899")
IDS = list(dict.fromkeys(re.findall(r'\{ *id:"([\w-]+)"', (ROOT / "src/registry.js").read_text(encoding="utf-8"))))
ROLES = {"checkbox", "radio", "textbox", "combobox", "slider", "spinbutton", "button", "switch", "searchbox", "listbox"}
fails = []


def ck_true(label, cond, detail=""):
    print(("  ✅ " if cond else "  ❌ ") + label)
    if not cond:
        if detail:
            print("      " + detail)
        fails.append(label)


def main():
    print(f"\n── ไล่ {len(IDS)} เครื่องมือ ──")
    total = 0
    empty_tools, bad_tools = [], []
    with sync_playwright() as P:
        b = P.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 950}).new_page()
        cdp = pg.context.new_cdp_session(pg)
        for tid in IDS:
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
            pg.wait_for_function("() => !document.querySelector('#tool .loading') && !!document.querySelector('#tool .s2, #tool .tool-head')",
                                 timeout=30000)
            pg.wait_for_timeout(600)
            n_ctl, unnamed = 0, []
            for n in cdp.send("Accessibility.getFullAXTree")["nodes"]:
                if n.get("ignored"):
                    continue
                role = (n.get("role") or {}).get("value")
                if role not in ROLES:
                    continue
                n_ctl += 1
                if not ((n.get("name") or {}).get("value") or "").strip():
                    try:
                        node = cdp.send("DOM.describeNode", {"backendNodeId": n["backendDOMNodeId"]})["node"]
                        at = dict(zip(node.get("attributes", [])[::2], node.get("attributes", [])[1::2]))
                        unnamed.append(f"{role} <{node['nodeName'].lower()} class={at.get('class', '')[:24]}>")
                    except Exception:
                        unnamed.append(role)
            total += n_ctl
            if n_ctl == 0:
                empty_tools.append(tid)
            if unnamed:
                bad_tools.append((tid, unnamed))
        b.close()
    ck_true(f"อ่านตัวควบคุมได้จริง รวม {total} ตัว (ต้องเกิน 500)", total > 500)
    ck_true("ทุกเครื่องมืออ่านตัวควบคุมได้อย่างน้อย 1 ตัว", not empty_tools, f"ว่าง: {empty_tools}")
    ck_true("ไม่มีตัวควบคุมไหนไม่มีชื่อ", not bad_tools,
            "; ".join(f"{t}: {len(u)} ตัว เช่น {u[0]}" for t, u in bad_tools))
    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)


main()
