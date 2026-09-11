"""เทสกราฟแท่ง Deneb บนหน้าเว็บจริง — ตรวจ "สิ่งที่ตาคนใช้เห็น" ไม่ใช่แค่ mount ผ่าน

‼️ วัดความยาวแท่งจากพิกัดใน SVG ที่วาดจริงในเบราว์เซอร์ แล้วเทียบกับตัวเลขในไฟล์ข้อมูล
   ถ้ากราฟโกหกเมื่อไร (แท่งยาวไม่ตรงสัดส่วน, เรียงผิด, ยุบผิดจำนวน) ข้อนี้ต้องแดง
   เหตุผลที่ต้องอ่านทั้งเส้นทางไม่ใช่แค่จุดแรก: แท่งมีมุมโค้ง เส้นทางจึงเริ่มที่ x0+r
   อ่านแค่จุด M กับ L แรกจะสั้นกว่าจริง 2r ทุกแท่ง (พิสูจน์แล้ว 11/09/2026)

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_pbibar.py
"""
import json, sys, re
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, got, want):
    ok = got == want
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        print(f"      ได้    : {got}\n      ควรได้ : {want}")
        fails.append(label)

def ck_true(label, cond, detail=""):
    print(("  ✅ " if cond else "  ❌ ") + label)
    if not cond:
        if detail: print("      " + detail)
        fails.append(label)

# อ่านแท่งจาก DOM: ชื่อกลุ่ม, ค่าที่ทูลทิปประกาศ, กรอบซ้ายสุด-ขวาสุด-บนสุดของเส้นทาง
READ_BARS = """() => {
  const out = [];
  for (const p of document.querySelectorAll('#pbib-chart path[aria-label]')) {
    const al = p.getAttribute('aria-label') || '';
    const m = al.match(/^(?:กลุ่ม|Category): ([^;]+); (?:ค่า|Value): ([^;]+);/);
    if (!m) continue;
    const d = p.getAttribute('d') || '';
    const xs = [], ys = [];
    for (const q of d.matchAll(/(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)/g)) {
      xs.push(parseFloat(q[1])); ys.push(parseFloat(q[2]));
    }
    if (!xs.length) continue;
    out.push({ name: m[1], shown: m[2], x0: Math.min(...xs), x1: Math.max(...xs), y: Math.min(...ys) });
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}"""

def open_tool(pg):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pbi-bar", wait_until="networkidle")
    pg.wait_for_function("() => document.querySelectorAll('#pbib-chart path[aria-label]').length > 0", timeout=20000)

def pick_dataset(pg, idx):
    pg.locator("input[name='pbib-ds']").nth(idx).check()
    pg.wait_for_timeout(400)

def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 950})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        data = json.loads(open("samples/powerbi/bar-datasets.json", encoding="utf-8").read())

        print("\n── ชุดแรก: ยอดขายตามช่องทาง ──")
        open_tool(pg)
        bars = pg.evaluate(READ_BARS)
        want = data["sales_channel"]["rows"]
        ck("วาดครบทุกแท่ง", len(bars), len(want))
        ck("เรียงมากไปน้อยถูกต้อง", [b0["name"] for b0 in bars],
           [r["Category"] for r in sorted(want, key=lambda r: -r["Value"])])

        # ความยาวแท่งต้องตรงสัดส่วนค่าจริง วัดจากแท่งยาวสุดเป็นสเกล
        vals = {r["Category"]: r["Value"] for r in want}
        lens = {b0["name"]: b0["x1"] - b0["x0"] for b0 in bars}
        top = max(vals, key=lambda k: vals[k])
        scale = lens[top] / vals[top]
        worst = max(abs(lens[n] - vals[n] * scale) / (vals[n] * scale) for n in vals)
        ck_true(f"ความยาวแท่งตรงสัดส่วนค่าจริง (เพี้ยนสูงสุด {worst*100:.3f}% เพดาน 1%)", worst <= 0.01,
                f"lens={ {k: round(v,1) for k,v in lens.items()} }")
        ck_true("ทุกแท่งเริ่มจากเส้นฐานเดียวกัน",
                max(b0["x0"] for b0 in bars) - min(b0["x0"] for b0 in bars) < 0.5,
                str([round(b0["x0"], 2) for b0 in bars]))

        print("\n── ค่าติดลบ: กำไรขาดทุนรายสาขา ──")
        pick_dataset(pg, 2)
        bars = pg.evaluate(READ_BARS)
        want = data["branch_profit"]["rows"]
        ck("เรียงมากไปน้อยแม้มีค่าติดลบ", [b0["name"] for b0 in bars],
           [r["Category"] for r in sorted(want, key=lambda r: -r["Value"])])
        vals = {r["Category"]: r["Value"] for r in want}
        neg = [b0 for b0 in bars if vals[b0["name"]] < 0]
        pos = [b0 for b0 in bars if vals[b0["name"]] > 0]
        ck_true("แท่งค่าลบไปทางซ้ายของแท่งค่าบวก",
                bool(neg) and bool(pos) and max(b0["x0"] for b0 in neg) < min(b0["x1"] for b0 in pos),
                str([(b0["name"], round(b0["x0"]), round(b0["x1"])) for b0 in bars]))

        print("\n── ยุบกลุ่ม: สินค้าขายดี 15 รายการ ──")
        pick_dataset(pg, 3)
        bars = pg.evaluate(READ_BARS)
        ck("ยุบเหลือจำนวนแท่งสูงสุด 10 บวกแท่งรวม 1", len(bars), 11)
        ck("แท่งที่ยุบรวมปักท้ายสุด", bars[-1]["name"], "อื่น ๆ")
        rest = sum(r["Value"] for r in sorted(data["top_products"]["rows"], key=lambda r: -r["Value"])[10:])
        ck("ค่าของแท่งที่ยุบรวมเท่ากับผลรวมของกลุ่มที่เหลือ",
           bars[-1]["shown"].replace(",", ""), f"{rest:,}".replace(",", ""))

        print("\n── เส้นเป้าหมาย ──")
        # ‼️ เส้นเป้าหมายถูกวาดไว้ตลอดแล้วคุมการเห็นด้วยความทึบ ไม่ใช่สร้างหรือลบ mark
        # การนับจำนวน mark จึงตอบว่า "ไม่มีอะไรเปลี่ยน" ทั้งที่เปลี่ยนจริง ต้องวัดความทึบ
        # (ฟ้าเขียนเทสผิดวิธีรอบแรกจริง แล้วจับได้ตอนส่องของจริง 11/09/2026)
        RULE_OPACITY = """() => {
          const g = [...document.querySelectorAll('#pbib-chart g[aria-roledescription="rule mark container"]')]
            .find(x => x.children.length > 1);
          return g ? [...g.children].map(c => Number(c.getAttribute('opacity') ?? 1)) : [];
        }"""
        pick_dataset(pg, 0)
        ck("ปิดโหมดเป้าหมาย เส้นต้องมองไม่เห็นทุกเส้น", pg.evaluate(RULE_OPACITY), [0, 0, 0, 0])
        pg.get_by_label(re.compile("ใช้คอลัมน์ Target|How to use the Target")).select_option("line")
        pg.wait_for_timeout(500)
        ck("เปิดโหมดเส้นเป้าหมาย เส้นต้องโผล่ครบทุกแท่ง", pg.evaluate(RULE_OPACITY), [1, 1, 1, 1])
        pg.get_by_label(re.compile("ใช้คอลัมน์ Target|How to use the Target")).select_option("color")
        pg.wait_for_timeout(500)
        ck("โหมดระบายสี เส้นต้องหายไป", pg.evaluate(RULE_OPACITY), [0, 0, 0, 0])
        # โหมดสี: แท่งที่ถึงเป้าต้องเขียว แท่งที่ไม่ถึงต้องแดง ตามค่าจริงในไฟล์ข้อมูล
        fills = pg.evaluate("""() => {
          const o = {};
          for (const p of document.querySelectorAll('#pbib-chart path[aria-label]')) {
            const m = (p.getAttribute('aria-label')||'').match(/^(?:กลุ่ม|Category): ([^;]+);/);
            if (m) o[m[1]] = (p.getAttribute('fill')||'').toLowerCase();
          }
          return o;
        }""")
        met = {r["Category"]: (r["Value"] >= r["Target"]) for r in data["sales_channel"]["rows"]}
        ck("สีแท่งบอกถึงเป้าหรือไม่ถึงได้ตรงตามตัวเลขจริง",
           {k: (v == "#2e7d32") for k, v in fills.items()}, met)
        pg.get_by_label(re.compile("ใช้คอลัมน์ Target|How to use the Target")).select_option("none")
        pg.wait_for_timeout(300)

        print("\n── สเปกที่คัดลอกไปใช้ ──")
        spec = pg.evaluate("""async () => {
          const r = await fetch('samples/powerbi/bar.vl.json'); return await r.json();
        }""")
        ck_true("สเปกยังใช้ placeholder ข้อมูลของ Deneb ไม่มีข้อมูลตัวอย่างติดไป",
                json.dumps(spec, ensure_ascii=False).count('"values"') == 0)
        ck("สเปกใช้ขนาดแบบ container ทั้งกว้างและสูง", [spec.get("width"), spec.get("height")],
           ["container", "container"])
        # ‼️ ห้ามเช็ค "1e15" ทั้งไฟล์ เพราะสเปกใช้ 1e15 เป็นค่าหมายจับที่อื่นโดยชอบธรรม
        # ต้องเจาะที่กุญแจเรียงลำดับตัวเดียว ไม่งั้นเทสแดงทั้งที่ของถูก
        sort_key = next((t["calculate"] for t in spec["transform"] if t.get("as") == "__sortKey"), "")
        ck_true("กุญแจเรียงลำดับไม่ใช้สูตรลบจากเลขยักษ์ (พังกับค่าลบและค่าศูนย์)",
                bool(sort_key) and "1e15" not in sort_key,
                sort_key[:160])
        ck_true("กุญแจเรียงลำดับใช้สัดส่วน 0 ถึง 1 ที่กว้างเท่ากันทุกแถว",
                "__sortFrac" in sort_key, sort_key[:160])

        print("\n── โหมดอังกฤษ ──")
        # ‼️ ชื่อแท่งที่ยุบรวมเป็นค่าที่ถูกแปลตามภาษา ถ้าลำดับโค้ดสลับกันเมื่อไร
        # ค่าไทยจะค้างแล้วโผล่กลางกราฟอังกฤษ เห็นได้เฉพาะชุดที่มีการยุบรวมเท่านั้น
        # ภาษาถูกจำใน localStorage และอ่านครั้งเดียวตอนโหลดหน้า จึงต้องตั้งก่อนเปิดหน้า
        ctx = b.new_context(viewport={"width": 1440, "height": 950})
        ctx.add_init_script("try{localStorage.setItem('fk-lang','en')}catch(e){}")
        pg_en = ctx.new_page()
        pg_en.goto(f"{BASE}/#/pbi-bar", wait_until="networkidle")
        pg_en.wait_for_function("() => document.querySelectorAll('#pbib-chart path[aria-label]').length > 0", timeout=20000)
        ck("หน้าเป็นภาษาอังกฤษจริง", pg_en.evaluate("document.documentElement.lang"), "en")
        pg_en.locator("input[name='pbib-ds']").nth(3).check()
        pg_en.wait_for_timeout(700)
        names_en = [b0["name"] for b0 in pg_en.evaluate(READ_BARS)]
        ck("แท่งที่ยุบรวมในโหมดอังกฤษต้องไม่เป็นภาษาไทย", names_en[-1] if names_en else "", "Other")
        ck_true("ไม่มีตัวอักษรไทยหลงอยู่ในชื่อแท่งเลยสักตัว",
                not any(any("\u0e00" <= c <= "\u0e7f" for c in n) for n in names_en), str(names_en))

        ctx.close()

        real_errs = [e for e in errs if "favicon" not in e.lower()]
        ck("ไม่มี error ใน console", real_errs, [])
        pg.screenshot(path="/tmp/claude-1000/-mnt-c-Users-USER-Desktop-Claude-Code/31cd52d8-15ff-4762-a418-5f397bf66d01/scratchpad/pbibar_web.png", full_page=False)
        b.close()

    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)

main()
