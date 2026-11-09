#!/usr/bin/env python3
"""ไฟล์ผิดชนิดที่นามสกุลถูก (PDF เปลี่ยนชื่อเป็น .xlsx หรือ .docx , ไบต์สุ่ม .docx) ต้องได้ข้อความไทยบอกว่าไฟล์ไม่ใช่ชนิดนั้น
ห้ามขึ้นว่าสำเร็จ ห้ามมีข้อความดิบอังกฤษของไลบรารีหรือลิงก์

‼️ ที่มา 09/11/2026 เทสเตอร์มือถือ (.claude/evidence/2026-11-09-tester-fk-mobile/REPORT_FINDINGS.txt B1 B2)
   B2: excel-csv excel-merge excel-to-pdf รับ PDF ที่เปลี่ยนนามสกุลเป็น .xlsx แล้วขึ้นสำเร็จ CSV บรรทัดแรก %PDF-1.4,,,,,
   B1: word-to-pdf ใส่ docx เสีย ขึ้นข้อความ JSZip "Can't find end of central directory" พร้อมลิงก์เอกสารของไลบรารี

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_fake_ext_thai.py"""
import os
import pathlib
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
RAW = re.compile(r"central directory|jszip|https?://|is this a zip|Unsupported|undefined|TypeError|Error:", re.I)
SUCCESS = re.compile(r"(?<!ไม่)สำเร็จ|(?<!ไม่)เสร็จ|แยกได้|รวมได้|แปลงได้")  # "แปลงไม่สำเร็จ" ไม่นับเป็นสำเร็จ
ok = fail = 0


def ck(label, cond, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if detail else ""), flush=True)


def statuses(pg):
    return " | ".join(t.replace("\n", " ") for t in pg.eval_on_selector_all(".status", "els => els.filter((e) => e.offsetParent).map((e) => e.innerText)") if t.strip())


def run_tool(pg, tool, path):
    fkui.open_tool(pg, tool, base=BASE)
    fkui.feed(pg, [path])
    pg.wait_for_timeout(800)
    cta = pg.locator("button.s2-cta:visible")
    if cta.count() and cta.first.is_enabled():
        cta.first.click(timeout=8000)
    for _ in range(40):
        pg.wait_for_timeout(400)
        s = statuses(pg)
        if fkui.state(pg) == "result" or re.search(r"ไม่ใช่|อ่าน.*ไม่ได้|เสีย|ไม่ถูกต้อง|ผิดชนิด", s):
            break
    return fkui.state(pg), statuses(pg)


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk_fake_"))
    pdf = pathlib.Path(__file__).resolve().parents[1] / "samples"
    src = next((p for p in sorted(pdf.rglob("*.pdf"))), None)
    pdf_bytes = src.read_bytes() if src else b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    (tmp / "pdf_as.xlsx").write_bytes(pdf_bytes)
    (tmp / "pdf_as.docx").write_bytes(pdf_bytes)
    (tmp / "junk.docx").write_bytes(bytes((i * 131 + 7) % 256 for i in range(4096)))
    cases = [("excel-csv", "pdf_as.xlsx"), ("excel-merge", "pdf_as.xlsx"), ("excel-to-pdf", "pdf_as.xlsx"), ("excel-split", "pdf_as.xlsx"),
             ("word-to-pdf", "junk.docx"), ("word-to-pdf", "pdf_as.docx")]
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="th-TH").new_page()
        for tool, name in cases:
            print(f"{tool} {name}", flush=True)
            st, s = run_tool(pg, tool, tmp / name)
            ck("ไม่ขึ้นหน้าผลลัพธ์ว่าทำสำเร็จ", st != "result" and not SUCCESS.search(s), f"state={st} status={s[:160]}")
            ck("มีข้อความไทยบอกว่าไฟล์ใช้ไม่ได้", bool(re.search(r"[฀-๿]", s)) and bool(re.search(r"ไม่ใช่|อ่าน.*ไม่ได้|เสีย|ไม่ถูกต้อง|ผิดชนิด", s)), s[:160])
            ck("ไม่มีข้อความดิบอังกฤษหรือลิงก์", not RAW.search(s), s[:160])
        b.close()
    print(f"สรุป: ผ่าน {ok} ตก {fail}", flush=True)
    sys.exit(1 if fail or ok == 0 else 0)


if __name__ == "__main__":
    main()
