"""หน้าเครื่องมือ: รางซ้ายบนจอกว้าง และส่วนคำถามที่เจอบ่อย

‼️ ที่มา พี่ปอนด์สั่ง "จอริมซ้ายแบบของเขาเราเอามาปรับใช้ด้วยสิ จะได้มีที่เพิ่มอีก"
   หลังผ่าเว็บ thepexcel.com (.claude/research/2026-09-12-thepexcel-full-system.md)
   วัดของเราแล้ว หัวเรื่องเครื่องมือสูง 138px ทำให้แผงงานเริ่มที่ 249px จากบนจอ
   และเนื้อหาถูกจำกัดกว้าง 1096px จอ 1600px จึงมีขอบว่างข้างละ 252px ที่ทิ้งเปล่า
   จึงย้ายหัวเรื่องไปไว้ในขอบว่างนั้น ได้ที่แนวตั้งคืนโดยไม่เสียความกว้างพื้นที่ทำงาน

เทสนี้ตรวจ 6 อย่าง
   ① จอแคบต้องไม่มีราง และใช้หัวเรื่องเดิม (ของเดิมห้ามเปลี่ยน)
   ② จอกว้างต้องมีราง และหัวเรื่องใหญ่ต้องหายไป
   ③ ‼️ รางห้ามทับพื้นที่ทำงาน และพื้นที่ทำงานต้องกว้างเท่าเดิมทุกความกว้างจอ
   ④ ‼️ แผงงานต้องขยับขึ้นจริง ไม่ใช่แค่ซ่อนหัวเรื่องแล้วเหลือช่องว่าง
   ⑤ ‼️ ลิงก์ข้ามส่วนต้องไม่เปลี่ยน hash ไม่งั้น router เด้งกลับหน้าแรกทันที
   ⑥ ส่วนคำถามที่เจอบ่อย พับไว้ก่อน กดแล้วกางได้

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_toolrail.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
TOOL = "pdf-pages"
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

GEO = """() => {
  const vis = e => !!e && getComputedStyle(e).display !== 'none';
  const box = e => { const r = e.getBoundingClientRect();
    return {l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), t: Math.round(r.top + scrollY)}; };
  const rail = document.querySelector('.tool-rail');
  const head = document.querySelector('.tool-head');
  const body = document.querySelector('.ws-body');
  return { rail: vis(rail), head: vis(head),
           railBox: vis(rail) ? box(rail) : null,
           body: body ? box(body) : null };
}"""

with sync_playwright() as p:
    br = p.chromium.launch()
    errs = []
    seen = {}
    # ‼️ เกณฑ์จริงใน tool.css คือ 1820px ไม่ใช่ 1500 (ดูคอมเมนต์การคำนวณในไฟล์นั้น)
    #    1600 จึงต้อง "ไม่มีราง" ไม่ใช่ "มีราง" — เทสเดิมค้างอยู่ที่เกณฑ์เก่าแล้วระเบิด
    for w in (1100, 1440, 1600, 1840, 1920):
        ctx = br.new_context(viewport={"width": w, "height": 950})
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#/{TOOL}", wait_until="networkidle")
        pg.wait_for_timeout(1200)
        seen[w] = pg.evaluate(GEO)
        ctx.close()

    for w in (1100, 1440, 1600):
        d = seen[w]
        ck(f"① จอ {w}px ไม่มีราง และยังมีหัวเรื่องเดิม", not d["rail"] and d["head"], str(d))
    for w in (1840, 1920):
        d = seen[w]
        ck(f"② จอ {w}px มีราง และหัวเรื่องใหญ่หายไป", d["rail"] and not d["head"], str(d))
        # ‼️ อ่านค่ากล่องเฉพาะตอนมีรางจริง ไม่งั้นเทสระเบิดแทนที่จะรายงานว่าตก
        if d["railBox"] and d["body"]:
            ck(f"③ จอ {w}px รางไม่ทับพื้นที่ทำงาน (รางจบที่ {d['railBox']['r']}, งานเริ่มที่ {d['body']['l']})",
               d["railBox"]["r"] <= d["body"]["l"], str(d))
        else:
            ck(f"③ จอ {w}px วัดตำแหน่งรางได้", False, str(d))

    # ‼️ ข้อนี้เคยเขียนว่า "กว้างเท่าเดิมทุกจอ" ซึ่งเป็นตัวแทนที่ถูกในตอนนั้น
    #    เพราะ --page-w ตรึงไว้ 1400px ทุกจอที่กว้างกว่า 1280px
    #    แต่เจตนาจริงของข้อนี้คือ "รางห้ามขโมยพื้นที่ทำงาน" ไม่ใช่ "ห้ามกว้างขึ้นเลย"
    #    พอเปิดให้หน้ากว้างตามจอบนจอใหญ่ (20/09/2026) ตัวแทนเดิมจึงแดงทั้งที่เจตนายังครบ
    #    เขียนเจตนาตรง ๆ แทน คือกว้างขึ้นได้ แต่ห้ามแคบลง
    widths = {w: seen[w]["body"]["w"] for w in (1440, 1600, 1840, 1920)}
    order = [widths[w] for w in (1440, 1600, 1840, 1920)]
    ck(f"③ จอกว้างขึ้นแล้วพื้นที่ทำงานต้องไม่แคบลง {widths}",
       all(b >= a for a, b in zip(order, order[1:])), str(widths))
    ck(f"③ รางโผล่มาแล้วพื้นที่ทำงานต้องไม่ถูกหดเลย (1600 -> 1840)",
       widths[1840] >= widths[1600], f"{widths[1600]} -> {widths[1840]}")

    narrow_top, wide_top = seen[1440]["body"]["t"], seen[1920]["body"]["t"]
    ck(f"④ จอกว้างแผงงานขยับขึ้นจริง จาก {narrow_top}px เหลือ {wide_top}px (ได้คืน {narrow_top - wide_top}px)",
       wide_top < narrow_top - 80, f"{narrow_top} → {wide_top}")

    # ⑤ ลิงก์ข้ามส่วนต้องไม่ทำให้หลุดออกจากหน้าเครื่องมือ
    ctx = br.new_context(viewport={"width": 1920, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/{TOOL}", wait_until="networkidle")
    pg.wait_for_timeout(1200)
    links = pg.evaluate("() => [...document.querySelectorAll('.rail-jump a')].map(a => a.textContent.trim())")
    ck(f"⑤ รางมีลิงก์ข้ามส่วน {len(links)} รายการ", len(links) >= 3, str(links))
    before = pg.evaluate("() => location.hash")
    pg.evaluate("() => document.querySelectorAll('.rail-jump a')[1].click()")
    pg.wait_for_timeout(1100)
    ck(f"⑤ กดลิงก์แล้ว hash ต้องไม่เปลี่ยน (ยังเป็น {pg.evaluate('() => location.hash')})",
       pg.evaluate("() => location.hash") == before, f"{before} → {pg.evaluate('() => location.hash')}")
    ck("⑤ กดลิงก์แล้วยังอยู่หน้าเครื่องมือ ไม่เด้งกลับหน้าแรก",
       pg.evaluate("() => document.body.classList.contains('tool')"))
    # ‼️ เกณฑ์: กดแล้วส่วนนั้นต้องอยู่ในจอ (13/09/2026 เคยย้าย FAQ ไปคอลัมน์ขวาแล้วถอดออกเพราะรก เกณฑ์นี้ใช้ได้ทั้งสองแบบ)
    inview = pg.evaluate("() => { const r = document.getElementById('faq-h').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0; }")
    ck("⑤ กดลิงก์แล้วส่วนนั้นอยู่ในจอจริง", inview, f"scrollY={pg.evaluate('() => scrollY')}")

    # ⑥ คำถามที่เจอบ่อย
    n = pg.evaluate("() => document.querySelectorAll('.faq-i').length")
    ck(f"⑥ มีคำถามที่เจอบ่อย {n} ข้อ และพับไว้ทั้งหมดตอนแรก",
       n >= 4 and pg.evaluate("() => [...document.querySelectorAll('.faq-i')].filter(e => e.open).length") == 0)
    pg.evaluate("() => document.querySelector('.faq-i summary').click()")
    pg.wait_for_timeout(500)
    ck("⑥ กดแล้วกางออกได้",
       pg.evaluate("() => [...document.querySelectorAll('.faq-i')].filter(e => e.open).length") == 1)

    # ⑦ ‼️ คัดลอกเป็น Markdown ต้องได้ของจริง และต้องแนบโค้ดเมื่อหน้ามีโค้ดเท่านั้น
    ctx2 = br.new_context(viewport={"width": 1920, "height": 950},
                          permissions=["clipboard-read", "clipboard-write"])
    pg2 = ctx2.new_page()
    pg2.on("pageerror", lambda e: errs.append(str(e)))
    pg2.goto(f"{BASE}/#/{TOOL}", wait_until="networkidle")
    pg2.wait_for_timeout(1200)
    pg2.evaluate("() => document.querySelector('.rail-md').click()")
    pg2.wait_for_timeout(700)
    md = pg2.evaluate("() => navigator.clipboard.readText()")
    ck("⑦ คัดลอกเป็น Markdown ได้ และขึ้นต้นด้วยหัวเรื่อง",
       md.startswith("# ") and len(md) > 80, md[:60])
    for need in ("หมวด:", "รับไฟล์:", f"#/{TOOL}"):
        ck(f"⑦ Markdown มี {need}", need in md, md[:160])
    ck("⑦ เครื่องมือที่ยังไม่มีโค้ดบนจอ ต้องไม่มีหัวข้อโค้ดเปล่า ๆ",
       "```" not in md, md[-120:])

    # เครื่องมือสายโค้ด ต้องแนบโค้ดจริงมาด้วย
    pg2.goto("about:blank")
    pg2.goto(f"{BASE}/#/excel-to-pq", wait_until="networkidle")
    pg2.wait_for_timeout(1000)
    pg2.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg2.wait_for_timeout(4200)
    pg2.evaluate("() => document.querySelector('.rail-md').click()")
    pg2.wait_for_timeout(700)
    md2 = pg2.evaluate("() => navigator.clipboard.readText()")
    onscreen = pg2.evaluate("() => { const e = document.querySelector('.pq-code'); return e ? e.textContent.trim() : ''; }")
    ck(f"⑦ เครื่องมือสายโค้ด ต้องแนบโค้ดมาด้วย ({len(md2)} ตัวอักษร)",
       "```" in md2 and len(md2) > 400, md2[:120])
    ck("⑦ ‼️ โค้ดใน Markdown ต้องตรงกับโค้ดที่อยู่บนจอจริง",
       bool(onscreen) and onscreen in md2, f"บนจอ {len(onscreen)} ตัวอักษร")
    ctx2.close()

    ck("ไม่มี error หลุดออกมาตลอดทั้งชุด", not errs, str(errs[:2]))
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
