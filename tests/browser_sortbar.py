"""หน้าแรก: แถบเรียงลำดับ และฉาก hero ที่ต้องไม่โกหก

‼️ ที่มา พี่ปอนด์สั่งให้ไปผ่าเว็บ thepexcel.com ทั้งระบบแล้วเอาแนวคิดมาใช้ในธีมขาวดำ
   (บันทึกเต็มที่ .claude/research/2026-09-12-thepexcel-full-system.md)
   สองอย่างที่ถอดมาใช้รอบนี้
   ① เขาแยก "ตัวเรียง" ออกจาก "ตัวกรอง" ชัดเจน ของเราไม่เคยมีตัวเรียงเลย
   ② hero ของเขาเอาวิชาที่สอนมาเรนเดอร์เป็นภาพ และ "สูตรทำงานจริง"
      ของเราจึงเป็นไฟล์ถูกรวมแล้วได้ผลลัพธ์ ซึ่งตัวเลขต้องบวกกันได้จริง

เทสนี้ตรวจ 6 อย่าง
   ① มีแถบเรียง 3 แบบ ค่าตั้งต้นคือตามหมวด
   ② เรียงใหม่ก่อน ต้องได้ตัวที่ since ใหม่สุดขึ้นก่อนจริง (เทียบกับทะเบียน)
   ③ เรียงแบบอื่นต้องเป็นรายการเรียบ ไม่มีหัวหมวดคั่น
   ④ ‼️ ปุ่มเพิ่งใช้ต้องกดไม่ได้ตอนยังไม่มีประวัติ ไม่งั้นได้ลำดับไร้ความหมายที่ดูเหมือนประวัติ
   ⑤ เลือกแล้วต้องจำข้ามการรีโหลด
   ⑥ ‼️ ตัวเลขใน hero ต้องสอดคล้องกันเอง หน้าเข้าบวกกันต้องเท่าหน้าออก

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_sortbar.py
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

names = lambda pg: pg.evaluate(
    "() => [...document.querySelectorAll('.pill')].map(e => (e.querySelector('span')||{}).textContent || '')")
btns = lambda pg: pg.evaluate(
    "() => [...document.querySelectorAll('.sort-sel option')].map(e => ({t: e.textContent.trim(), v: e.value, on: e.selected}))")

def click_sort(pg, value):
    pg.evaluate("(v) => { const s = document.querySelector('.sort-sel'); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", value)
    pg.wait_for_timeout(800)

# ทะเบียนคือความจริง เทสต้องเทียบกับมัน ไม่ใช่กับค่าที่ hardcode ไว้
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
# ‼️ ไม่ใช่ทุกเครื่องมือที่มี since (ของเก่าไม่ได้ใส่ไว้) จึงต้องแยก "จำนวนเครื่องมือทั้งหมด"
#    ออกจาก "ตารางวันที่" ไม่งั้นนับผิดแล้วเทสแดงทั้งที่หน้าเว็บถูก (เจอเองตอนเขียนเทสนี้)
all_ids = [m.group(1) for m in re.finditer(r'\{\s*id:"([\w-]+)",\s*group:', reg)]
sinces = {m.group(1): m.group(2) for m in re.finditer(r'\{ id:"([\w-]+)"[^}]*?since:"([\d-]+)"', reg, re.S)}
newest = max(sinces.values()) if sinces else ""

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_timeout(1300)

    b = btns(pg)
    ck(f"① มีตัวเลือกเรียง {len(b)} แบบ และตั้งต้นที่ตามหมวด",
       len(b) == 2 and b[0]["on"] and b[0]["v"] == "group", str(b))
    ck("④ ตัวเลือกเพิ่งใช้ต้องไม่มีให้เลือกตอนยังไม่มีประวัติ",
       not any(x["v"] == "recent" for x in b), str(b))
    ck("② ตอนตามหมวด ต้องมีหัวหมวดคั่น",
       pg.evaluate("() => document.querySelectorAll('.pill-group').length") > 0)

    # ② เรียงใหม่ก่อน — ตัวแรกต้องมี since ใหม่สุดตามทะเบียน
    click_sort(pg, "new")
    first_id = pg.evaluate("() => { const e = document.querySelector('.pill'); return e ? e.dataset.id : ''; }")
    ck(f"② ใหม่ก่อน ตัวแรกคือ {first_id} (since {sinces.get(first_id)}) ต้องเท่ากับใหม่สุด {newest}",
       bool(newest) and sinces.get(first_id) == newest, f"ทะเบียนมี since {len(sinces)} ตัว")
    ck("③ เรียงใหม่ก่อน ต้องเป็นรายการเรียบ ไม่มีหัวหมวดคั่น",
       pg.evaluate("() => document.querySelectorAll('.pill-group').length") == 0)
    ck(f"③ ยังแสดงเครื่องมือครบทุกตัว ({len(names(pg))})", len(names(pg)) == len(all_ids),
       f"เห็น {len(names(pg))} จากทะเบียน {len(all_ids)}")
    ck(f"③ ตัวอ่านทะเบียนอ่านได้ {len(all_ids)} เครื่องมือ และ {len(sinces)} วันที่ (ประชากรต้องไม่เป็นศูนย์)",
       len(all_ids) >= 30 and len(sinces) >= 3)

    # ④ สร้างประวัติจริงแล้วปุ่มต้องเปิด
    for t in ["pdf-merge", "excel-to-pq", "pbi-bar"]:
        pg.goto(f"{BASE}/#/{t}", wait_until="networkidle")
        pg.wait_for_timeout(650)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_timeout(1300)
    ck("④ ใช้เครื่องมือแล้ว ตัวเลือกเพิ่งใช้ต้องโผล่มา",
       any(x["v"] == "recent" for x in btns(pg)), str(btns(pg)))
    click_sort(pg, "recent")
    top3 = pg.evaluate("() => [...document.querySelectorAll('.pill')].slice(0,3).map(e => e.dataset.id)")
    ck(f"④ เรียงเพิ่งใช้ ต้องได้ตัวที่เปิดล่าสุดขึ้นก่อน (ได้ {top3})",
       top3 == ["pbi-bar", "excel-to-pq", "pdf-merge"], str(top3))

    # ⑤ จำค่าข้ามการรีโหลด
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(1300)
    ck("⑤ รีโหลดแล้วยังจำตัวเรียงที่เลือกไว้",
       any(x["on"] and x["v"] == "recent" for x in btns(pg)), str(btns(pg)))

    # ⑥ ‼️ ฉาก hero ต้องไม่โกหก
    hero = pg.evaluate("""() => {
        const rows = [...document.querySelectorAll('.hero-obj .hd-row')];
        return rows.map(r => ({
            name: r.querySelector('b').textContent,
            size: r.querySelector('span').textContent,
            pages: r.querySelector('em').textContent,
            out: r.classList.contains('hd-out') }));
    }""")
    num = lambda s: int(re.search(r"(\d+)", s).group(1))
    ins = [h for h in hero if not h["out"]]
    outs = [h for h in hero if h["out"]]
    ck(f"⑥ ฉาก hero มีไฟล์เข้า {len(ins)} และไฟล์ออก {len(outs)}", len(ins) >= 2 and len(outs) == 1, str(hero))
    if ins and outs:
        ck(f"⑥ จำนวนหน้าต้องบวกกันได้จริง ({' + '.join(h['pages'] for h in ins)} = {outs[0]['pages']})",
           sum(num(h["pages"]) for h in ins) == num(outs[0]["pages"]),
           f"เข้า {[h['pages'] for h in ins]} ออก {outs[0]['pages']}")
        ck(f"⑥ ไฟล์ที่ได้ต้องไม่ใหญ่กว่าไฟล์เข้ารวมกัน ({outs[0]['size']})",
           num(outs[0]["size"]) <= sum(num(h["size"]) for h in ins))

    ck("ไม่มี error หลุดออกมาตลอดทั้งชุด", not errs, str(errs[:2]))
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
