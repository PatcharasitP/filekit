"""หน้าของสำเร็จรูปแจกฟรี

‼️ ที่มา ผ่าเว็บ thepexcel.com 12/09/2026 เขาให้ "แจก🎁" ยืนเป็นเมนูหลักเทียบเท่า
   บทความและคอร์ส ทั้งที่เป็นของฟรี เพราะของแจกทำให้คนกลับมาและบอกต่อ
   ของเราสร้างของพวกนี้อยู่แล้ว แต่เดิมต้องเปิดเครื่องมือทีละตัวถึงจะได้

‼️ กฎเหล็กของหน้านี้: ของที่แจกต้อง "มีอยู่จริงและอ่านได้จริง"
   ตัวเลขบรรทัดและขนาดอ่านจากไฟล์จริงตอนเปิดหน้า ไม่ได้เขียนตายตัว
   เทสนี้จึงเทียบกับไฟล์ในดิสก์ ไม่ใช่แค่ดูว่ามีตัวเลขโผล่มา

เทสนี้ตรวจ 6 อย่าง
   ① ทุกชิ้นอ่านไฟล์ได้จริง และปุ่มพร้อมใช้
   ② ‼️ ขนาดกับจำนวนบรรทัดตรงกับไฟล์จริงในดิสก์
   ③ ยังไม่กางต้องไม่ทาสีโค้ด (สเปกโดนัท 1,327 บรรทัด ทาตั้งแต่แรกจะหน่วงเปล่า)
   ④ ‼️ คัดลอกแล้วต้องได้เนื้อไฟล์จริง ไม่ใช่ HTML ที่ทาสีแล้ว
   ⑤ เลย์เอาต์: หน้าเนื้อหาล้วนต้องไม่ถูกบีบเป็นคอลัมน์แคบ และมือถือไม่ล้นแนวนอน
   ⑥ ลิงก์ไปเครื่องมือที่ปรับเองได้ ต้องชี้ไปเครื่องมือที่มีอยู่จริง

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_freebies.py
"""
import os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = Path(__file__).resolve().parent.parent
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

# ไฟล์ที่หน้านี้ประกาศว่าจะแจก อ่านจากซอร์สของเครื่องมือเอง จะได้ไม่ต้องเขียนซ้ำสองที่
tool_src = (ROOT / "src/tools/freebies.js").read_text(encoding="utf-8")
FILES = re.findall(r'file:\s*"([^"]+)"', tool_src)
TOOLS = re.findall(r'tool:\s*"([^"]+)"', tool_src)
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
ALL_IDS = set(re.findall(r'\{\s*id:"([\w-]+)",\s*group:', reg))

ck(f"อ่านรายการของแจกจากซอร์สได้ {len(FILES)} ชิ้น", len(FILES) >= 3, str(FILES))
missing = [f for f in FILES if not (ROOT / f).exists()]
ck("① ไฟล์ที่ประกาศไว้มีอยู่จริงในดิสก์ทุกชิ้น", not missing, str(missing))
bad_tool = [t for t in TOOLS if t not in ALL_IDS]
ck("⑥ ลิงก์ไปเครื่องมือ ชี้ไปตัวที่มีอยู่จริง", not bad_tool, str(bad_tool))

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 1000},
                         permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/freebies", wait_until="networkidle")
    pg.wait_for_timeout(2600)

    cards = pg.evaluate("""() => [...document.querySelectorAll('.gf-card')].map(e => ({
        size: e.querySelector('.gf-size').textContent,
        ready: ![...e.querySelectorAll('button')].some(b => b.disabled),
    }))""")
    ck(f"① แสดงครบ {len(cards)} ชิ้น และปุ่มพร้อมใช้ทุกใบ",
       len(cards) == len(FILES) and all(c["ready"] for c in cards), str(cards))

    # ② ตัวเลขต้องตรงกับไฟล์จริง
    for i, f in enumerate(FILES):
        raw = (ROOT / f).read_text(encoding="utf-8")
        want_lines = len(raw.split("\n"))
        want_kb = f"{len(raw.encode('utf-8')) / 1024:.1f} KB"
        got = cards[i]["size"]
        n = int(re.sub(r"[^\d]", "", got.split("บรรทัด")[0] if "บรรทัด" in got else got.split("line")[0]) or 0)
        ck(f"② {f.split('/')[-1]} ตัวเลขตรงกับไฟล์จริง ({want_lines} บรรทัด, {want_kb})",
           n == want_lines and want_kb in got, f"หน้าเว็บบอก {got}")

    ck("③ ยังไม่กาง ต้องยังไม่ทาสีโค้ด",
       pg.evaluate("() => document.querySelectorAll('.gf-pre i[class^=cv-]').length") == 0)
    pg.evaluate("() => document.querySelector('.gf-see summary').click()")
    pg.wait_for_timeout(900)
    ck("③ กางแล้วต้องทาสี",
       pg.evaluate("() => document.querySelectorAll('.gf-pre i[class^=cv-]').length") > 0)

    # ④ คัดลอกต้องได้เนื้อไฟล์จริง
    pg.evaluate("""() => [...document.querySelectorAll('.gf-card button')]
        .find(b => /คัดลอก|Copy/.test(b.textContent)).click()""")
    pg.wait_for_timeout(700)
    clip = pg.evaluate("() => navigator.clipboard.readText()")
    disk = (ROOT / FILES[0]).read_text(encoding="utf-8")
    ck(f"④ ‼️ คัดลอกแล้วได้เนื้อไฟล์จริงทั้งไฟล์ ({len(clip)} ตัวอักษร)",
       clip == disk, f"ในดิสก์ {len(disk)} ตัวอักษร, มีแท็ก HTML ปน: {'<i' in clip}")

    ck("ไม่มี error หลุดออกมาตลอดทั้งชุด", not errs, str(errs[:2]))
    ctx.close()

    # ⑤ เลย์เอาต์
    for w, floor in ((1920, 600), (1440, 600), (390, 280)):
        c = br.new_context(viewport={"width": w, "height": 950})
        pp = c.new_page()
        pp.goto(f"{BASE}/#/freebies", wait_until="networkidle")
        pp.wait_for_timeout(2200)
        d = pp.evaluate("""() => { const r = document.querySelector('.gf-card').getBoundingClientRect();
            return {w: Math.round(r.width), over: document.documentElement.scrollWidth > window.innerWidth}; }""")
        ck(f"⑤ จอ {w}px การ์ดกว้าง {d['w']}px (ต้อง >= {floor}) และไม่ล้นแนวนอน",
           d["w"] >= floor and not d["over"], str(d))
        c.close()
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
