"""ข้อความใน UI ของ FileKit ต้องอ่านออกทั้งโหมดมืดและสว่างบนจอมือถือ (iPhone SE บน WebKit) ไล่ทุกเครื่องมือ

เกณฑ์ WCAG AA: ตัวอักษรปกติ 4.5:1 ตัวใหญ่ (24px หรือหนา 18.66px ขึ้นไป) 3:1
พื้นหลังหาจากกล่องบรรพบุรุษที่ข้อความอยู่ข้างในจริง (ป้ายที่ลอยออกนอกกล่องไม่นับพื้นกล่องนั้น) สี color-mix แปลงผ่าน canvas
ยกเว้นเนื้อของผู้ใช้เองที่สีตามที่ผู้ใช้เลือก: ลายน้ำ (.wmp-wm-text) , ตัวอย่างรายงานตามธีม (.th-report) , ตัวอย่างอีเมล (.pah-preview)

‼️ ที่มา 10/11/2026 ไล่โหมดมืดบนมือถือครั้งแรก เจอ 6 จุดที่ไม่มีเทสไหนจับ
   ป้าย A ถึง F ใน pdf-pages ตัวขาวบนสีไฟล์ 2.42 ถึง 3.98 , ลิงก์ pbi-theme โหมดมืดสีธีมบนพื้นมืด 3.05
   ชื่อช่อง {{...}} ใน word-mailmerge โหมดสว่าง 2.65 , เลขหน้าในตัวอย่าง pdf-nup 2.95 และป้ายบนสไลด์ตัวอย่าง pdf-to-powerpoint 2.8
   (สองตัวหลังพื้นกระดาษขาวตายตัว แต่ใช้สีชุดโหมดมืด ตามกฎใน tool.css: บล็อกที่ตั้งพื้นเองต้องตั้ง token สีให้ลูกครบ)
   หลักฐาน .claude/evidence/2026-11-10-fk-dark/
ใช้: python3 -m http.server 8899 --bind 127.0.0.1 &  แล้ว FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_contrast_mobile.py
     CONTRAST_ONLY=pdf-pages,pbi-theme ไล่เฉพาะบางตัว , CONTRAST_THEMES=dark ไล่โหมดเดียว
"""
import asyncio, json, os, re, sys, time, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
TOOLS = [m.group(1) for m in re.finditer(r'\{\s*id:"([\w-]+)",\s*group:', reg)]
if os.environ.get("CONTRAST_ONLY"):
    TOOLS = [t for t in TOOLS if t in os.environ["CONTRAST_ONLY"].split(",")]
THEMES = os.environ.get("CONTRAST_THEMES", "dark,light").split(",")
USER_CONTENT = ".wmp-wm-text, .th-report, .pah-preview"
MEASURE = r"""(USER_CONTENT) => {
  const cvs = document.createElement('canvas').getContext('2d');
  const parse = (s) => { let m = s.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = s.match(/color\(srgb ([^)]+)\)/); if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    if (/color-mix|oklch|lab\(/.test(s)) { cvs.clearRect(0, 0, 1, 1); cvs.fillStyle = '#000'; cvs.fillStyle = s; cvs.fillRect(0, 0, 1, 1); const d = cvs.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; }
    return null; };
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const mix = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const bgOf = (el) => { const stack = [], er = el.getBoundingClientRect(); for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e);
      if (e !== el && e !== document.body && e !== document.documentElement && !inside(er, e.getBoundingClientRect())) continue;  // ลูกที่ลอยออกนอกกล่อง ไม่ได้อยู่บนพื้นกล่องนั้น
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null;
      if (/gradient/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1]; const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor); if (htmlBg && htmlBg[3] > 0) base = htmlBg;
    for (let i = stack.length - 1; i >= 0; i--) base = mix(stack[i], base); return base; };
  const out = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (el.closest('[disabled], [aria-disabled=true], [hidden], svg, canvas, .sr-only, [aria-hidden=true]')) continue;
    if (el.closest(USER_CONTENT)) continue;  // เนื้อของผู้ใช้เอง สีตามที่ผู้ใช้เลือก ไม่ใช่สีของ FileKit
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    const fg0 = parse(cs.color); const bg = bgOf(el); if (!fg0 || !bg) continue;
    const fg = mix([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) { const key = (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ' ' + cs.color + ' on ' + bg.slice(0,3).map(Math.round).join(',');
      if (!out.has(key)) out.set(key, {key, ratio: +ratio.toFixed(2), need, text: t.slice(0, 30)}); }
  }
  return [...out.values()];
}"""

# ‼️ เปิดพร้อมกันหลายหน้า (ค่าตั้งต้น 4) เดิมเปิดทีละหน้า 144 หน้าใช้ราว 20 นาที เกินเวลาตัด 600 วินาทีของ tests/runp.sh
#    log ว่างเปล่าเพราะโดนตัดก่อนพิมพ์ผล (runp_v240.log กับ runp_v240_solo.log 10/11/2026)
PAR = int(os.environ.get("CONTRAST_PAR", "4"))
fails, checked = [], 0


async def one(ctx, theme, tid, sem):
    global checked
    async with sem:
        pg = await ctx.new_page()
        try:
            await pg.goto(f"{BASE}/" + ("" if tid == "home" else f"#/{tid}"), wait_until="networkidle", timeout=45000)
            await pg.wait_for_timeout(400)
            had = await pg.evaluate("""() => { const b = [...document.querySelectorAll('button')]
                .find((e) => e.offsetParent && /ลองด้วยไฟล์ตัวอย่าง/.test(e.textContent)); if (b) b.click(); return !!b }""")
            if had:
                try: await pg.wait_for_selector(".file-row", timeout=6000)
                except Exception: pass
                await pg.wait_for_timeout(600)
            bad = await pg.evaluate(MEASURE, USER_CONTENT)
            checked += 1
            for x in bad:
                fails.append(f"{theme} {tid}: {x['key']} = {x['ratio']}:1 ต้อง {x['need']} ({x['text']!r})")
        except Exception as e:
            fails.append(f"{theme} {tid}: เปิดไม่ได้ {str(e).splitlines()[0][:80]}")
        finally:
            await pg.close()


async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.webkit.launch()
        sem = asyncio.Semaphore(PAR)
        jobs, ctxs = [], []
        for theme in THEMES:
            ctx = await b.new_context(**p.devices["iPhone SE"], color_scheme=theme)
            await ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','%s')}catch(e){}" % theme)
            ctxs.append(ctx)
            jobs += [one(ctx, theme, tid, sem) for tid in ["home"] + TOOLS]
        await asyncio.gather(*jobs)
        for c in ctxs: await c.close()
        await b.close()


t0 = time.time()
asyncio.run(main())
for f in sorted(fails):
    print("  ❌", f)
print(f"ตรวจ {checked} หน้า ({len(THEMES)} โหมด) ตก {len(fails)} ใช้ {time.time() - t0:.0f} วินาที")
sys.exit(1 if fails or checked == 0 else 0)
