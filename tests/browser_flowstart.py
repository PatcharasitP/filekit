# FlowKit ทางเข้าอื่น (แผนเฟส 5): เทมเพลต 8 ใบ กับปุ่มให้ AI ช่วยร่าง ผ่านหน้าเว็บจริง
#
# ‼️ เทมเพลตทุกใบต้องกดแล้วได้ผังที่วาดเสร็จจริง ชนิดผังสลับให้ถูก และกล่องครบตามข้อความ
# ‼️ ปุ่มคัดลอกคำสั่งต้องได้ข้อความในคลิปบอร์ดจริง (มีกติกา ตัวอย่าง และงานที่ผู้ใช้เล่า) ไม่ใช่แค่ขึ้นว่าคัดลอกแล้ว
# ‼️ คำตอบจาก AI ที่ห่อกรอบโค้ด วางลงช่องพิมพ์แล้วต้องเหลือแต่ข้อความผัง
# ‼️ ต้องต่อเน็ตได้ (draw.io)
#
# --selftest ตัวตรวจต้องจับผังที่กล่องไม่ครบ และคลิปบอร์ดที่ว่างได้

import sys, os, pathlib, traceback
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import drawn, state

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
SELFTEST = "--selftest" in sys.argv

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


def model_boxes(pg, text, kind):
    """กล่องที่ควรได้ คิดด้วยโมดูลตัวเดียวกับหน้าเว็บ"""
    return pg.evaluate("""async ([t, k]) => { const { parseText } = await import('./src/parse.js'); const r = parseText(t, k);
        return r.model ? [...r.model.nodes.map((n) => n.text), ...r.model.groups.map((g) => g.title)] : null; }""", [text, kind])


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + "/flow/")
        pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready'", timeout=60000)

        if SELFTEST:
            print("\n━━ selftest ━━")
            got = drawn(pg, ["กล่องที่ไม่มีอยู่จริง"], 3000)
            ck("ตัวรอผังรู้ว่ากล่องไม่ครบ (คืนของที่เห็นจริง ไม่ใช่ของที่ขอ)", got != ["กล่องที่ไม่มีอยู่จริง"])
            pg.evaluate("() => navigator.clipboard.writeText('')")
            ck("ตัวอ่านคลิปบอร์ดเห็นว่าว่าง", pg.evaluate("() => navigator.clipboard.readText()") == "")
            b.close()
            return finish()

        print("\n━━ เทมเพลต ━━")
        cards = pg.evaluate("() => { document.querySelector('#opentpl').click(); return [...document.querySelectorAll('#tpl-list .tpl')].length }")
        ck("หน้าต่างเทมเพลตมี 8 ใบ", cards == 8, str(cards))
        pg.keyboard.press("Escape")
        tpls = pg.evaluate("""async () => { const { TEMPLATES } = await import('./src/templates.js'); return TEMPLATES.map((t) => [t.id, t.kind, t.title.th, t.text.th]); }""")
        for tid, kind, title, text in tpls:
            pg.click("#opentpl")
            pg.click(f"#tpl-list .tpl:has-text('{title}')")
            want = model_boxes(pg, text, kind)
            got = drawn(pg, want, 45000)
            pressed = pg.evaluate("() => document.querySelector('#types [aria-pressed=true]').dataset.kind")
            ck(f"[{tid}] กดแล้วได้ผัง{kind} กล่องครบ {len(want)} กล่อง ปุ่มชนิดผังสลับให้ถูก", got == sorted(want) and pressed == kind,
               f"ชนิด {pressed} ได้ {got}")
        pg.focus("#src"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)
        ck("กด Ctrl+Z ในช่องพิมพ์ ได้ข้อความก่อนเลือกเทมเพลตคืน", pg.input_value("#src") != tpls[-1][3], pg.input_value("#src")[:40])

        print("\n━━ ให้ AI ช่วยร่าง ━━")
        pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(300)
        pg.click("#openai")
        pg.fill("#ai-desc", "เบิกเงินสดย่อย ต้องผ่านหัวหน้าแล้วบัญชี")
        pg.click("#ai-copy"); pg.wait_for_timeout(300)
        clip = pg.evaluate("() => navigator.clipboard.readText()")
        ck("กดคัดลอกแล้วคลิปบอร์ดมีคำสั่งครบ (กติกา ตัวอย่าง 2 ใบ งานที่เล่า)",
           "กติกา:" in clip and clip.count("ตัวอย่างที่") == 2 and clip.strip().endswith("เบิกเงินสดย่อย ต้องผ่านหัวหน้าแล้วบัญชี"), clip[:80])
        ck("บอกผู้ใช้ว่าคัดลอกแล้ว", "คัดลอกแล้ว" in pg.inner_text("#ai-done"))
        ck("คำสั่งที่เห็นในหน้าต่างเป็นคำสั่งเดียวกับที่คัดลอก", pg.input_value("#ai-prompt") == clip)
        pg.keyboard.press("Escape")
        ck("กด Esc ปิดหน้าต่าง", not pg.evaluate("() => document.querySelector('#dlg-ai').open"))
        answer = "นี่คือผังที่ขอค่ะ\n```\nพนักงานกรอกใบเบิก\nหัวหน้าอนุมัติไหม?\n  อนุมัติ: บัญชีจ่ายเงิน\n  ไม่อนุมัติ: แจ้งกลับ\n    จบ\n```\nหวังว่าจะช่วยได้นะคะ"
        pg.evaluate("""(x) => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); const dt = new DataTransfer(); dt.setData('text/plain', x);
            ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", answer)
        ck("วางคำตอบ AI ที่ห่อกรอบโค้ด เหลือแต่ข้อความผัง", pg.input_value("#src") == "พนักงานกรอกใบเบิก\nหัวหน้าอนุมัติไหม?\n  อนุมัติ: บัญชีจ่ายเงิน\n  ไม่อนุมัติ: แจ้งกลับ\n    จบ",
           repr(pg.input_value("#src")[:60]))
        got = drawn(pg, ["พนักงานกรอกใบเบิก", "หัวหน้าอนุมัติไหม?", "บัญชีจ่ายเงิน", "แจ้งกลับ"], 30000)
        ck("คำตอบที่วางกลายเป็นผังได้เลย", got == sorted(["พนักงานกรอกใบเบิก", "หัวหน้าอนุมัติไหม?", "บัญชีจ่ายเงิน", "แจ้งกลับ"]), str(got))
        # คำตอบจริงของ AI 3 รอบ (tests/flow_ai) วางแล้วต้องได้ผังทุกรอบ
        for f in sorted((pathlib.Path(__file__).resolve().parent / "flow_ai").glob("*.txt")):
            kind = f.name.split(".")[1]
            text = f.read_text(encoding="utf-8")
            pg.click(f"#types [data-kind={kind}]"); pg.wait_for_timeout(200)
            pg.evaluate("""(x) => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, x); }""", text)
            want = model_boxes(pg, text, kind)
            got = drawn(pg, want, 45000)
            ck(f"คำตอบจริงของ AI {f.stem} วางแล้วได้ผัง {len(want)} กล่องครบ", bool(want) and got == sorted(want), str(got))
        ck("ไม่มี error บนหน้า", not errs, str(errs[:3]))
        b.close()
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจจับผังไม่ครบและคลิปบอร์ดว่างได้" if SELFTEST else "✅ เทมเพลตกับคำสั่งให้ AI ใช้ได้จริง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
