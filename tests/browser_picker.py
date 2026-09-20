#!/usr/bin/env python3
"""ทุกเครื่องมือที่รับไฟล์ ต้องมี "ที่ให้เลือกไฟล์" ที่มองเห็นและกดได้จริง ทุกความกว้างจอ

‼️ ทำไมต้องมีเทสนี้ (20/09/2026 เจอบั๊กบนเว็บสด v127)
   จอ CSS กว้างตั้งแต่ 1820px เครื่องมือแบบ workspace ไม่มีปุ่มเลือกไฟล์และไม่มีกล่องลากวางเลย
   ผืนงานเขียนว่า "ยังไม่มีไฟล์ เลือก PDF เพื่อดูตัวอย่าง" แต่ไม่มีอะไรให้กด
   ต้นเหตุคือสองโหมดผังที่เขียนคนละรอบชนกัน
     workspace.js ย้าย .dz-wrap เข้าไปใน .tool-head (เพื่อใช้ที่ว่างครึ่งขวาของแถบหัว)
     tool.css สั่ง body.tool .tool-head{display:none} ที่ 1820px (เพราะรางซ้ายมาแทนหัวเรื่อง)
   กล่องรับไฟล์จึงถูกซ่อนไปพร้อมหัวเรื่อง

‼️ ทำไมเทส 107 ไฟล์เดิมไม่เจอ
   ไม่มีข้อไหนถามคำถามของผู้ใช้ตรง ๆ ว่า "เปิดเครื่องมือนี้แล้วเห็นที่เลือกไฟล์ไหม"
   แต่ละโหมดถูกเทสแยกกันและถูกต้องเมื่ออยู่ลำพัง ของพังอยู่ที่ผลคูณของโหมด

‼️ เกณฑ์ที่ใช้ ตรวจจาก DOM จริง ไม่ใช่จากรายชื่อที่ฝังไว้
   ถ้าหน้ามี .dz-wrap อยู่ใน DOM (= เครื่องมือนี้รับไฟล์) ต้องมีอย่างน้อยหนึ่งอันที่
   ① มองเห็น (checkVisibility) ② มีขนาดจริง ③ มีของกดได้ข้างใน ④ จุดกลางของปุ่มกดโดนจริง
   ข้อ ④ สำคัญ เพราะของที่ถูกอย่างอื่นทับอยู่ = ผู้ใช้กดไม่ได้ แม้ CSS จะบอกว่า visible

รันปกติ:   FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_picker.py
รันเร็ว:   FK_BASE=... ../.venv/bin/python tests/browser_picker.py --quick   (8 เครื่องมือตัวแทน)
รันพิสูจน์: FK_BASE=... ../.venv/bin/python tests/browser_picker.py --selftest
รันกับเว็บจริง: FK_BASE=https://patcharasitp.github.io/filekit ../.venv/bin/python tests/browser_picker.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")

# ‼️ ความกว้างต้องคร่อมทุกจุดตัดของ CSS ที่มีอยู่
#    721 (มือถือเป็นเดสก์ท็อป) · 1000 (ปิดการพับแผง) · 1820 (รางซ้ายมาแทนหัวเรื่อง = จุดที่บั๊กเกิด)
#    2560 คือจอที่พี่ปอนด์ใช้จริงได้ และเป็นฝั่งที่ไม่มีใครเคยเทส
WIDTHS = [390, 768, 1366, 1600, 1819, 1820, 1920, 2560]
QUICK_TOOLS = ["pdf-pages", "pdf-watermark", "pdf-compress", "pdf-sign", "pdf-split",
               "pdf-merge", "word-mailmerge", "thai-date"]

# อ่านรายชื่อเครื่องมือจากทะเบียนจริง ห้ามฝังไว้ในเทส (เทสที่ก็อปตรรกะไปเขียนซ้ำจะตกยุคเสมอ)
TOOL_IDS_JS = """async (base) => {
  const m = await import(base + '/src/registry.js');
  return m.TOOLS.map(t => t.id);
}"""

CHECK_JS = """() => {
  const wraps = [...document.querySelectorAll('.dz-wrap')];
  if (!wraps.length) return { hasPicker: false, skip: true };

  const info = wraps.map((w) => {
    const vis = w.checkVisibility ? w.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
                                  : getComputedStyle(w).display !== 'none';
    const r = w.getBoundingClientRect();
    // ของกดได้ข้างในกล่อง ปุ่มเลือกไฟล์ หรือตัวกล่องเองที่คลิกได้
    const hit = [...w.querySelectorAll('button,label,[role=button],.dz')].find((e) => {
      const er = e.getBoundingClientRect();
      return er.width > 20 && er.height > 20;
    });
    let clickable = false, blockedBy = '';
    if (hit && vis) {
      const er = hit.getBoundingClientRect();
      const cx = er.left + er.width / 2, cy = er.top + er.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        clickable = !!top && (hit.contains(top) || top.contains(hit));
        if (!clickable && top) blockedBy = (top.className || top.tagName).toString().slice(0, 40);
      } else {
        clickable = true;   // อยู่นอกจอเพราะยังไม่เลื่อน ไม่ใช่ถูกทับ
      }
    }
    // ไล่หาบรรพบุรุษที่ซ่อนมัน เพื่อบอกต้นเหตุตรง ๆ ในรายงาน
    let hiddenBy = '';
    if (!vis) {
      for (let n = w; n && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).display === 'none') { hiddenBy = (n.className || n.tagName).toString().slice(0, 40); break; }
      }
    }
    return { vis, w: Math.round(r.width), h: Math.round(r.height), hasHit: !!hit, clickable, hiddenBy, blockedBy };
  });

  const ok = info.find((i) => i.vis && i.w > 0 && i.h > 0 && i.hasHit && i.clickable);
  return { hasPicker: !!ok, skip: false, count: wraps.length, info };
}"""


def run(tools, widths, selftest=False):
    fails, checked, skipped = [], 0, 0
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for w in widths:
            # context ใหม่ต่อความกว้าง = cold ไม่มี localStorage ค้างจากเครื่องมือก่อนหน้า
            ctx = b.new_context(viewport={"width": w, "height": 900}, locale="th-TH")
            pg = ctx.new_page()
            for t in tools:
                pg.goto(f"{BASE}/#/{t}", wait_until="load", timeout=60000)
                try:
                    pg.wait_for_selector(".dz-wrap, .ws-body, .panel", timeout=15000)
                except Exception:
                    pass
                pg.wait_for_timeout(500)     # เผื่อเครื่องมือที่ต่อ DOM ต่อหลังวาดรอบแรก
                if selftest:
                    # ‼️ จำลองบั๊กเดิมเป๊ะ ๆ ซ่อนแถบหัวที่กล่องรับไฟล์ถูกย้ายไปอยู่
                    pg.evaluate("""() => { const h = document.querySelector('.tool-head');
                                           if (h && h.querySelector('.dz-wrap')) h.style.display = 'none'; }""")
                    pg.wait_for_timeout(120)
                m = pg.evaluate(CHECK_JS)
                if m.get("skip"):
                    skipped += 1
                    continue
                checked += 1
                if not m["hasPicker"]:
                    why = []
                    for i in m["info"]:
                        if not i["vis"]:
                            why.append(f"ถูกซ่อนโดย .{i['hiddenBy'] or 'ไม่ทราบ'}")
                        elif not i["hasHit"]:
                            why.append("ไม่มีของกดได้ข้างใน")
                        elif not i["clickable"]:
                            why.append(f"ถูกทับโดย .{i['blockedBy']}")
                        else:
                            why.append(f"ขนาด {i['w']}x{i['h']}")
                    fails.append(f"{t} @{w}px: ไม่มีที่ให้เลือกไฟล์ ({'; '.join(why)})")
            ctx.close()
        b.close()
    print(f"ตรวจ {checked} กรณี (ข้าม {skipped} กรณีที่เครื่องมือไม่รับไฟล์)")
    for f in fails:
        print("  ❌", f)
    if not fails:
        print("  ✅ ทุกเครื่องมือที่รับไฟล์ มีที่ให้เลือกไฟล์ครบทุกความกว้าง")
    return 1 if fails else 0


if __name__ == "__main__":
    selftest = "--selftest" in sys.argv
    quick = "--quick" in sys.argv or selftest
    if quick:
        tools = QUICK_TOOLS
    else:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True)
            pg = b.new_context().new_page()
            pg.goto(BASE + "/", wait_until="load", timeout=60000)
            tools = pg.evaluate(TOOL_IDS_JS, BASE)
            b.close()
        print(f"อ่านทะเบียนได้ {len(tools)} เครื่องมือ")
    code = run(tools, WIDTHS, selftest)
    if selftest:
        print("\nโหมดพิสูจน์:", "✅ เทสจับของพังได้จริง" if code else "🔴 เทสไม่จับอะไรเลย ใช้ไม่ได้")
        sys.exit(0 if code else 1)
    sys.exit(code)
