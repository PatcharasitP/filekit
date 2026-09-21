# -*- coding: utf-8 -*-
"""ไอคอนเครื่องมือ: ต้องแยกออกจากกันได้ด้วยตาที่ขนาดจริง และไม่กลายเป็นก้อนทึบ

‼️ ที่มาของเทสนี้ (พี่ปอนด์ทัก 19/09/2026 ว่าไอคอน "ไม่สวย สื่อความหมายไม่พอ ไม่คมชัด")
   วัดความเหมือนของไอคอนทุกคู่จากภาพที่เรนเดอร์ **ขนาดจริงบนการ์ด** พบว่า
   42 คู่เหมือนกันเกิน 90% และ 11 คู่ในนั้นอยู่หมวดเดียวกัน = กวาดตาหาไม่เจอจริง
   ต้นเหตุ: กรอบหน้ากระดาษกินหมึกเกือบหมด เหลือที่ให้ตัวที่ต่างแค่ 7x7 หน่วย = 5.8px

‼️ ทำไมต้องวัดจากภาพ ไม่ใช่จากโค้ด: ความต่างในโค้ดเยอะแค่ไหนไม่สำคัญ
   สิ่งที่สำคัญคือ "ตอนย่อลงขนาดจริงแล้วยังต่างกันอยู่ไหม" ซึ่งรู้ได้จากพิกเซลเท่านั้น
"""
import itertools
import json
import os
import pathlib
import subprocess
import sys
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
ok, bad = [], []
def check(name, cond, got=""):
    (ok if cond else bad).append(name)
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  ({got})" if got else ""))

tools = json.loads(subprocess.run(["node", "-e", """
Promise.all([import('./src/icons.js'), import('./src/registry.js')]).then(([m, r]) => {
  console.log(JSON.stringify(r.TOOLS.map(t => ({id: t.id, group: t.group, d: m.ICONS[t.id] || ''}))));
});"""], cwd=ROOT, capture_output=True, text=True).stdout or "[]")
check("ทุกเครื่องมือมีไอคอน", all(t["d"] for t in tools),
      f"ไม่มีรูป {[t['id'] for t in tools if not t['d']]}")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    try:
        pg.goto(BASE, wait_until="load", timeout=45000); pg.wait_for_timeout(1800)
        live = pg.evaluate("""() => { const s = document.querySelector('.pill .ico-svg');
          if (!s) return null; const c = getComputedStyle(s);
          return {w: Math.round(s.getBoundingClientRect().width), sw: parseFloat(c.strokeWidth),
                  fill: c.fill, stroke: c.stroke,
                  box: Math.round(s.parentElement.getBoundingClientRect().width)}; }""")
        # ‼️ บทเรียนเก่า: ไอคอนเคยกลายเป็นก้อนสี่เหลี่ยมทึบทั้งชุด เพราะกฎ fill:none หาย
        #    แล้วเทส 265 ข้อเขียวหมด เพราะไม่มีข้อไหนถามเรื่องนี้
        check("ไอคอนเป็นเส้น ไม่ใช่ก้อนทึบ",
              live and live["fill"] in ("none",) and live["stroke"] != "none",
              f"fill={live and live['fill']} stroke={(live or {}).get('stroke','')[:18]}")
        # ‼️ 16px จากผืน 24 = 1 หน่วยเหลือ 0.67px เส้นคร่อมพิกเซลตลอด วัดได้พิกเซลทึบแค่ 52%
        #    20px เส้น 2.0 ได้ 64% ห้ามให้หดกลับไปโดยไม่รู้ตัว
        check("ไอคอนในการ์ดไม่เล็กกว่า 19px", live and live["w"] >= 19, f"{live and live['w']}px")
        check("เส้นไม่บางกว่า 1.9", live and live["sw"] >= 1.9, f"{live and live['sw']}")
        check("กล่องไอคอนใหญ่พอครอบไอคอน", live and live["box"] >= live["w"] + 8,
              f"กล่อง {live and live['box']}px ไอคอน {live and live['w']}px")

        # ── ความเหมือนของไอคอนที่ขนาดจริง
        N, SW = (live["w"], live["sw"]) if live else (20, 2.0)
        html = ("<meta charset=utf-8><style>body{margin:0;background:#fff}svg{display:block}</style>" + "".join(
            f'<svg viewBox="0 0 24 24" width="{N}" height="{N}" fill="none" stroke="#000" stroke-width="{SW}" '
            f'stroke-linecap="round" stroke-linejoin="round">{t["d"]}</svg>' for t in tools))
        f = pathlib.Path("/tmp/fk-icons.html"); f.write_text(html, encoding="utf-8")
        sh = b.new_page(viewport={"width": 60, "height": N * len(tools) + 20}, device_scale_factor=2)
        sh.goto(f.as_uri()); sh.wait_for_timeout(500)
        sh.screenshot(path="/tmp/fk-icons.png", full_page=True)
        im = Image.open("/tmp/fk-icons.png").convert("L"); S = N * 2
        tiles = [list(im.crop((0, i*S, S, i*S+S)).getdata()) for i in range(len(tools))]
        sim = lambda a, c: sum(1 for x, y in zip(a, c) if (x < 200) == (y < 200)) / len(a)

        groups = {}
        for i, t in enumerate(tools): groups.setdefault(t["group"], []).append(i)
        worst, top = [], (0, "", "")
        for g, idx in groups.items():
            for i, j in itertools.combinations(idx, 2):
                s = sim(tiles[i], tiles[j])
                if s > top[0]: top = (s, tools[i]["id"], tools[j]["id"])
                if s >= 0.90: worst.append(f"{tools[i]['id']} ⇄ {tools[j]['id']} {s*100:.0f}%")
        check("ไม่มีไอคอนคู่ไหนในหมวดเดียวกันเหมือนกันเกิน 90%", not worst,
              f"สูงสุด {top[0]*100:.0f}% ({top[1]} ⇄ {top[2]})" + (f"  ‼️ {'; '.join(worst[:4])}" if worst else ""))

        # ไม่มีไอคอนไหนว่างเปล่าหรือจิ๋วจนมองไม่เห็นตอนย่อ
        inked = [(tools[i]["id"], sum(1 for v in tiles[i] if v < 200)) for i in range(len(tools))]
        thin = [t for t, n in inked if n < S * S * 0.04]
        check("ไม่มีไอคอนที่จาง/เล็กจนแทบมองไม่เห็น", not thin, f"{thin}")
    except Exception as e:
        bad.append(f"เทสระเบิดกลางทาง: {str(e).splitlines()[0][:80]}")
        print(f"  ❌ เทสระเบิดกลางทาง {str(e).splitlines()[0][:80]}")
    b.close()

print(f"\nผ่าน {len(ok)} ตก {len(bad)}")
for x in bad: print(f"   ❌ {x}")
sys.exit(1 if bad else 0)
