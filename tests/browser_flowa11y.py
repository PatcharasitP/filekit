# FlowKit ขัดเงา (แผนเฟส 6): คีย์บอร์ดล้วน , โปรแกรมอ่านหน้าจอ , อังกฤษครบ , จอมือถือ
#
# ‼️ ถามของที่ใช้ได้จริง ไม่ใช่ถามว่ามี attribute: กด Tab จริงแล้ววัดกรอบโฟกัสจาก computed style ,
#    กด Enter จริงแล้วดูว่าผังเปลี่ยน , อ่านข้อความจริงทุกชิ้นบนหน้าอังกฤษแล้วหาตัวอักษรไทย
# ‼️ ต้องต่อเน็ตได้ (draw.io)
#
# --selftest ตัวตรวจทุกตัวต้องจับของผิดที่ใส่เอง: ปุ่มที่ถอดกรอบโฟกัส , ปุ่มไม่มีชื่อ , คำไทยที่แอบใส่ในหน้าอังกฤษ

import sys, os, re, pathlib, traceback
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import drawn, state

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
SELFTEST = "--selftest" in sys.argv
THAI = re.compile(r"[฀-๿]")
P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


FOCUS = """() => { const el = document.activeElement; if (!el || el === document.body) return null;
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  const ring = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none');
  const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('alt') || '').trim().slice(0, 30);
  return { tag: el.tagName, id: el.id, name, ring, shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' }; }"""

NAMELESS = """() => [...document.querySelectorAll('button, select, textarea, input:not([type=file]), a[href], [role=button], [tabindex="0"]')]
  .filter((el) => { const r = el.getBoundingClientRect(); if (!r.width || el.closest('[hidden], dialog:not([open])')) return false;
    const lab = el.id && document.querySelector(`label[for="${el.id}"]`);
    const name = (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText) ||
      (lab && lab.innerText) || el.innerText || el.getAttribute('alt') || el.getAttribute('title') || '').trim();
    return !name; }).map((el) => el.outerHTML.slice(0, 80))"""

SCAN = """() => { const out = [];
  const skip = (el) => el.closest('#src, #hl, #lang, iframe, .fk-engine');
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const t = n.nodeValue.trim(); if (t && !skip(n.parentElement)) out.push(t); }
  for (const el of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) { if (skip(el)) continue;
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v) out.push(v); } }
  out.push(document.title); return out; }"""


def contrast(a, b):
    """อัตราคอนทราสต์ตามสูตร WCAG ของสีสองสีในรูป rgb(...)"""
    def lum(c):
        r, g, b_ = [int(x) / 255 for x in re.findall(r"\d+", c)[:3]]
        f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b_)
    x, y = sorted([lum(a), lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


def ready(pg): pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready'", timeout=60000)
def settle(pg): pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready' && !document.querySelector('#live').hasAttribute('data-busy')", timeout=60000)


def walk(pg, n=40):
    """กด Tab ทีละครั้งจากต้นหน้า คืนรายการที่โฟกัสไปถึง (ช่องพิมพ์: กด Esc แล้ว Tab เพื่อออก ตามที่หน้าเว็บบอกไว้)"""
    pg.evaluate("() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); }")
    seen = []
    for _ in range(n):
        if (pg.evaluate("() => document.activeElement && document.activeElement.id") or "") == "src": pg.keyboard.press("Escape")
        pg.keyboard.press("Tab")
        f = pg.evaluate(FOCUS)
        if not f: break
        seen.append(f)
        if f["id"] == "dl" or len(seen) > 1 and seen[-1] == seen[0]: break
    return seen


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        if SELFTEST:
            return selftest(b)
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + "/flow/"); ready(pg); settle(pg)

        print("\n━━ คีย์บอร์ดล้วน ━━")
        seen = walk(pg)
        ids = [s["id"] or s["name"] for s in seen]
        ck("กด Tab ไล่ได้ครบตั้งแต่หัวหน้าจนถึงปุ่มดาวน์โหลด", "src" in ids and "opentpl" in ids and "dl" in ids, " > ".join(ids))
        order = [ids.index(x) for x in ("src", "opentpl", "openai", "openfile", "dl") if x in ids]
        ck("ลำดับ Tab ตามที่ตาเห็น: ช่องพิมพ์ , ทางเข้าอื่น , ปุ่มดาวน์โหลด", order == sorted(order) and len(order) == 5, str(order))
        # ช่องพิมพ์ไม่มีกรอบของตัวเอง กรอบของ .ed ที่ครอบอยู่เข้มขึ้นแทน (ตรวจแยกข้อถัดไป วัดสีจริงสองสภาพ)
        noring = [f'{s["tag"]}#{s["id"]} {s["name"]}' for s in seen if not s["ring"] and s["id"] != "src"]
        ck("‼️ ทุกจุดที่โฟกัสไปถึงมีกรอบโฟกัสให้เห็น", not noring, str(noring))
        pg.evaluate("() => document.activeElement.blur()")
        off = pg.evaluate("() => getComputedStyle(document.querySelector('.ed')).borderTopColor")
        pg.focus("#src")
        on = pg.evaluate("() => getComputedStyle(document.querySelector('.ed')).borderTopColor")
        ck("ช่องพิมพ์ตอนโฟกัส กรอบเข้มขึ้นจนต่างกันชัด (คอนทราสต์ของสองสีอย่างน้อย 3 ต่อ 1)", contrast(off, on) >= 3, f"{off} เป็น {on} ได้ {contrast(off, on):.2f}")
        ck("โฟกัสไม่ไปตกที่ของที่มองไม่เห็น", all(s["shown"] for s in seen), str([s for s in seen if not s["shown"]]))
        types = [s for s in seen if s["tag"] == "BUTTON" and s["name"] in ("ขั้นตอน", "องค์กร", "ระบบ", "ไทม์ไลน์", "Power Automate")]
        ck("ปุ่มชนิดผังทั้ง 5 ปุ่มกด Tab ไปถึงได้", len(types) == 5, str([s["name"] for s in types]))
        pg.focus("#types [data-kind=org]"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
        ck("กด Enter ที่ปุ่มชนิดผัง สลับชนิดได้", pg.get_attribute("#types [data-kind=org]", "aria-pressed") == "true")
        pg.focus("#src"); pg.keyboard.press("Escape"); pg.keyboard.press("Tab")
        ck("‼️ ในช่องพิมพ์ กด Esc แล้ว Tab ออกจากช่องได้ (ไม่ติดกับ WCAG 2.1.2)", pg.evaluate("() => document.activeElement.id") != "src")
        org = pg.input_value("#src")
        pg.focus("#src"); pg.keyboard.press("Tab")
        ck("ในช่องพิมพ์ กด Tab เฉย ๆ เป็นการย่อหน้า ไม่หลุดออกจากช่อง", pg.evaluate("() => document.activeElement.id") == "src" and pg.input_value("#src") != org)
        pg.keyboard.press("Shift+Tab")               # ย่อหน้าบรรทัดแรกของผังองค์กรทิ้งไว้ = ผังผิด ข้อหลัง ๆ จะรอผังไม่ขึ้น
        ck("กด Shift กับ Tab ถอยย่อหน้าคืนได้", pg.input_value("#src") == org)

        pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(300)
        pg.focus("#opentpl"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
        inside = pg.evaluate("() => !!document.activeElement.closest('#dlg-tpl')")
        ck("กด Enter ที่ เทมเพลต เปิดหน้าต่าง และโฟกัสอยู่ในหน้าต่าง", pg.evaluate("() => document.querySelector('#dlg-tpl').open") and inside)
        for _ in range(12): pg.keyboard.press("Tab")
        ck("กด Tab วนอยู่ในหน้าต่าง ไม่หลุดไปข้างหลัง", pg.evaluate("() => !!document.activeElement.closest('#dlg-tpl')"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        ck("กด Esc ปิดหน้าต่าง โฟกัสกลับไปที่ปุ่มเดิม", not pg.evaluate("() => document.querySelector('#dlg-tpl').open") and pg.evaluate("() => document.activeElement.id") == "opentpl")
        pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
        pg.focus("#tpl-list .tpl:has-text('ต่อสัญญาเช่า')"); pg.keyboard.press("Enter")
        settle(pg); pg.wait_for_timeout(600)
        ck("เลือกเทมเพลตด้วย Enter ได้ผังใหม่ โฟกัสกลับมาที่ช่องพิมพ์", pg.evaluate("() => document.activeElement.id") == "src" and "สัญญาใกล้หมดอายุ" in pg.input_value("#src"))
        ck("โปรแกรมอ่านหน้าจอได้ยินว่าวาดเสร็จ (หลังเลือกเทมเพลต)", "วาดเสร็จแล้ว" in (pg.text_content("#srstat") or ""), pg.text_content("#srstat"))

        print("\n━━ ‼️ พิมพ์ต่อหลังผังวาดเสร็จ (ตัววาดเคยแย่งโฟกัสไป ตัวอักษรหาย 22/09/2026) ━━")
        pg.click("#src"); pg.keyboard.press("Control+End")
        before = pg.input_value("#src")
        pg.keyboard.type("ก"); settle(pg); pg.wait_for_timeout(1200)
        ck("ผังวาดเสร็จแล้ว โฟกัสยังอยู่ในช่องพิมพ์", pg.evaluate("() => document.activeElement.id") == "src",
           pg.evaluate("() => document.activeElement.className || document.activeElement.tagName"))
        pg.keyboard.type("ขค"); pg.wait_for_timeout(200)
        ck("พิมพ์ต่อหลังผังวาดเสร็จ ตัวอักษรเข้าช่องพิมพ์ครบทุกตัว", pg.input_value("#src") == before + "กขค", repr(pg.input_value("#src")[-8:]))

        print("\n━━ ซูมผังด้วยคีย์บอร์ด ━━")
        pg.set_viewport_size({"width": 1280, "height": 700}); pg.wait_for_timeout(600)
        zoomable = pg.evaluate("() => 'zoomable' in document.querySelector('#canvas').dataset")
        ck("ผังต่อสัญญาเช่าบนจอ 1280x700 ถูกย่อให้พอดีกรอบ (ซูมได้)", zoomable)
        ck("‼️ ตอนซูมได้ ผังกด Tab ไปถึงได้ และบอกว่ากดแล้วเกิดอะไร",
           pg.get_attribute("#png", "tabindex") == "0" and pg.get_attribute("#png", "role") == "button" and "ขนาดจริง" in (pg.get_attribute("#png", "aria-label") or ""),
           str(pg.get_attribute("#png", "aria-label")))
        pg.focus("#png"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
        ck("กด Enter ที่ผัง ดูขนาดจริง", pg.evaluate("() => 'zoom' in document.querySelector('#canvas').dataset") and "ทั้งผัง" in (pg.get_attribute("#png", "aria-label") or ""))
        pg.keyboard.press(" "); pg.wait_for_timeout(300)
        ck("กด Space กลับมาเห็นทั้งผัง", not pg.evaluate("() => 'zoom' in document.querySelector('#canvas').dataset"))
        # ผังองค์กรตัวอย่าง 633x296 ขนาดจริงเล็กกว่ากรอบบนจอ 1280x700 (วัดจริง) ส่วนผังระบบ 429x445 ยังถูกย่อ ซูมได้ถูกต้องแล้ว
        pg.click("#types [data-kind=org]"); settle(pg); pg.wait_for_timeout(600)
        ck("ผังเล็กที่เห็นขนาดจริงอยู่แล้ว ไม่อยู่ในลำดับ Tab (กดแล้วไม่มีอะไรเกิดขึ้นทำให้งง)",
           pg.get_attribute("#png", "tabindex") is None and not pg.evaluate("() => 'zoomable' in document.querySelector('#canvas').dataset"))

        print("\n━━ โปรแกรมอ่านหน้าจอ ━━")
        ck("ทุกปุ่ม ช่อง และตัวเลือกบนหน้ามีชื่อให้โปรแกรมอ่านหน้าจออ่าน", not pg.evaluate(NAMELESS), str(pg.evaluate(NAMELESS)))
        ck("ภาพผังมีคำบรรยาย (ชนิดผังกับจำนวนกล่อง)", bool(re.search(r"\d+ กล่อง", pg.get_attribute("#png", "alt") or "")), pg.get_attribute("#png", "alt"))
        ck("ข้อผิดพลาดประกาศผ่าน aria-live , ข่าวสำคัญอยู่นอกแผงที่ซ่อนได้บนมือถือ",
           pg.get_attribute("#msg", "aria-live") == "polite" and pg.evaluate("() => document.querySelector('#srstat').getAttribute('role') === 'status' && !document.querySelector('#srstat').closest('.pane')"))
        pg.evaluate("() => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, 'A -> B'); }")
        pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(200)
        pg.evaluate("() => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, 'เริ่ม\\n      ย่อหน้าผิด\\nจบ'); }")
        pg.wait_for_selector("#msg .err .go", timeout=5000)
        pg.focus("#msg .go"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
        sel = pg.evaluate("() => { const t = document.querySelector('#src'); return document.activeElement === t ? t.value.slice(t.selectionStart, t.selectionEnd) : null; }")
        ck("ปุ่ม ไปที่บรรทัดนี้ กด Enter แล้วเลือกบรรทัดที่ผิดในช่องพิมพ์ให้", sel is not None and "ย่อหน้าผิด" in sel, repr(sel))
        ck("ไม่มี error บนหน้า", not errs, str(errs[:3]))
        ctx.close()

        print("\n━━ จอมือถือ ━━")
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
        ck("มีปุ่มสลับ ข้อความ กับ ผัง เริ่มที่ข้อความ", pg.is_visible("#mtabs") and pg.get_attribute("#mtabs [data-pane=write]", "aria-pressed") == "true" and pg.is_hidden(".see"))
        pg.click("#mtabs [data-pane=see]"); pg.wait_for_timeout(300)
        ck("กด ผัง แล้วเห็นผัง ช่องพิมพ์ซ่อน ปุ่มดาวน์โหลดยังอยู่", pg.is_visible("#canvas") and pg.is_hidden("#src") and pg.is_visible("#dl")
           and pg.get_attribute("#mtabs [data-pane=see]", "aria-pressed") == "true")
        pg.click("#mtabs [data-pane=write]"); pg.click("#opentpl"); pg.click("#tpl-list .tpl >> nth=0"); pg.wait_for_timeout(300)
        ck("เลือกเทมเพลตบนมือถือ พาไปดูผังให้เอง", pg.evaluate("() => document.querySelector('#main').dataset.pane") == "see")
        settle(pg)
        ck("ข่าวสำคัญยังประกาศได้ตอนแผงข้อความถูกซ่อน", pg.evaluate("() => getComputedStyle(document.querySelector('#srstat')).display !== 'none'"))
        pg.click("#edit"); pg.wait_for_timeout(1500)
        ck("เปิดห้องแก้ไขบนมือถือ มีป้ายบอกว่าจอใหญ่สะดวกกว่า", pg.is_visible("#roomtip") and "จอใหญ่" in pg.inner_text("#roomtip"))
        pg.click("#roomtip"); pg.wait_for_timeout(200)
        ck("แตะป้ายแล้วหาย", pg.is_hidden("#roomtip"))
        ck("หน้าไม่เลื่อนข้าง", pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth"))
        ctx.close()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg); settle(pg)
        ck("จอใหญ่ไม่มีปุ่มสลับ (เห็นสองแผงพร้อมกันอยู่แล้ว)", pg.is_hidden("#mtabs") and pg.is_visible("#src") and pg.is_visible("#canvas"))
        pg.click("#edit"); pg.wait_for_timeout(1500)
        ck("จอใหญ่เปิดห้องแก้ไขไม่มีป้ายเตือน", pg.is_hidden("#roomtip"))
        ctx.close()

        print("\n━━ หน้าอังกฤษไม่มีภาษาไทยหลง ━━")
        th = collect(b, "th")
        en = collect(b, "en")
        ck("ตัวสแกนเห็นข้อความจริง (หน้าไทยเจอคำไทยเยอะ , หน้าอังกฤษสแกนได้จำนวนเท่ากัน)", th[0] > 200 and len(th[1]) > 30 and en[0] > 200, f"ไทย {th[0]} ชิ้น เจอ {len(th[1])} , อังกฤษ {en[0]} ชิ้น")
        ck("‼️ หน้าอังกฤษทุกสภาพ (เริ่มต้น , เทมเพลต , AI , Power Automate , ข้อผิดพลาด , ย่อกลุ่ม) ไม่มีคำไทยหลง", not en[1], str(sorted(en[1])[:6]))
        b.close()
    return finish()


def collect(b, lang):
    """เปิดหน้าตามภาษา กดผ่านทุกสภาพที่ผู้ใช้เจอ แล้วเก็บข้อความทุกชิ้นที่มีตัวอักษรไทย คืน (จำนวนชิ้นที่สแกน , ชุดข้อความที่เจอ)"""
    ctx = b.new_context(viewport={"width": 1280, "height": 860})
    ctx.add_init_script(f"try {{ localStorage.setItem('fk-lang', '{lang}') }} catch (e) {{}}")
    pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
    n, hits = 0, set()

    def grab():
        nonlocal n
        items = pg.evaluate(SCAN); n += len(items)
        hits.update(t[:60] for t in items if THAI.search(t))
    grab()
    pg.click("#opentpl"); pg.wait_for_timeout(300); grab(); pg.keyboard.press("Escape")
    pg.click("#openai"); pg.wait_for_timeout(300); grab(); pg.keyboard.press("Escape")
    pg.click("#types [data-kind=pa]"); settle(pg); grab()
    pg.select_option("#pa-sel", "collapse"); settle(pg); grab()
    pg.evaluate("() => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, '{ \"definition\": '); }")
    pg.wait_for_selector("#msg .err", timeout=5000); grab()
    pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(300)
    pg.evaluate("() => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, 'Start\\n      bad\\nEnd'); }")
    pg.wait_for_selector("#msg .err", timeout=5000); grab()
    ctx.close()
    return n, hits


def selftest(b):
    print("\n━━ selftest ━━")
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
    pg.evaluate("() => { const b = document.querySelector('#opentpl'); b.style.outline = 'none'; b.style.boxShadow = 'none'; }")
    seen = walk(pg)
    ck("ตัวตรวจกรอบโฟกัสจับปุ่มที่ถอดกรอบโฟกัสได้", any(s["id"] == "opentpl" and not s["ring"] for s in seen))
    # ‼️ ต้องใส่กับปุ่มที่มีขอบใน (ปุ่มชนิดผัง) ปุ่มลิงก์ที่ไม่มีตัวหนังสือกว้าง 0 ถูกนับว่ามองไม่เห็น ตัวตรวจข้ามไปถูกต้องแล้ว
    pg.evaluate("() => { document.querySelector('#types [data-kind=org]').textContent = ''; }")
    ck("ตัวตรวจชื่อจับปุ่มที่ไม่มีชื่อได้", any('data-kind="org"' in x for x in pg.evaluate(NAMELESS)), str(pg.evaluate(NAMELESS)))
    ctx.close()
    ctx = b.new_context(); ctx.add_init_script("try { localStorage.setItem('fk-lang', 'en') } catch (e) {}")
    pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
    clean = [t for t in pg.evaluate(SCAN) if THAI.search(t)]
    pg.evaluate("() => { document.querySelector('.hint').textContent = 'หลงมา'; }")
    ck("ตัวสแกนภาษาจับคำไทยที่แอบใส่ในหน้าอังกฤษได้ (และหน้าปกติสะอาด)", not clean and any(THAI.search(t) for t in pg.evaluate(SCAN)), str(clean[:3]))
    b.close()
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจจับของผิดได้ทุกตัว" if SELFTEST else "✅ ใช้ด้วยคีย์บอร์ดล้วนได้ โปรแกรมอ่านหน้าจออ่านได้ หน้าอังกฤษครบ มือถือสลับดูได้")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
