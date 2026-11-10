#!/usr/bin/env python3
"""ไฟล์ Excel ใหญ่ต้องอ่านใน worker ไม่ใช่บนเธรดหลัก หน้าเว็บจะได้ไม่ค้างนิ่งตอนเปิดไฟล์
และผลที่อ่านได้ต้องตรงกับทางเดิมทุกเซลล์ (รวมวันที่ที่ผ่านตัวแก้ fixExcelDateSkew) ส่วนเครื่องที่ไม่มี Worker ต้องถอยไปอ่านแบบเดิมได้

‼️ ที่มา 09/11/2026 เทสเตอร์มือถือ: Pixel 7 CPU ช้า 4 เท่า เปิดไฟล์ 50,000 แถว หน้าค้างนิ่ง 8 ถึง 11 วินาที ไม่มีแถบความคืบหน้า
   ตัวกินเวลาคือ XLSX.read บนเธรดหลัก (.claude/evidence/2026-11-09-fk-slow-mobile/excel_results.jsonl)
   วัด 10/11/2026 (.claude/evidence/2026-11-09-fk-xlsx-worker/probe_run.log) 50,000 แถว อ่านบนเธรดหลักค้าง 3,575 ms
   อ่านใน worker แล้วส่งสมุดงานกลับ ค้างเหลือ 1,292 ms (ช่วงรับของกลับ)

ใช้: python3 -m http.server 8899 &  แล้ว FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_xlsx_worker.py"""
import base64
import datetime
import json
import os
import pathlib
import sys
import tempfile

import openpyxl
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0


def ck(label, cond, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if detail else ""), flush=True)


def make_xlsx(path, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "ข้อมูล"
    ws.append(["รหัสสาขา", "ชื่อลูกค้า", "ยอดเงิน", "วันที่"])
    for i in range(rows):
        ws.append([f"S{i % 500:04d}", f"ลูกค้า {i}", i * 1.5, datetime.date(2026, 1, 1) + datetime.timedelta(days=i % 300)])
    wb.save(path)


# นับ XLSX.read ที่เกิดบนเธรดหลัก ห่อตอนถูกเรียกครั้งแรก (ไลบรารีตั้ง XLSX เป็นของว่างก่อนแล้วค่อยเติม read ทีหลัง ห่อตอนตั้งค่าจะไม่โดน)
COUNT = """(() => { let real; window.__mainReads = 0; window.__mainWrites = 0;
  Object.defineProperty(window, 'XLSX', { configurable: true, set(v) { real = v; }, get() {
    if (real && real.read && !real.read.__w) { const r = real.read; real.read = function () { window.__mainReads++; return r.apply(this, arguments); }; real.read.__w = 1; }
    if (real && real.write && !real.write.__w) { const w = real.write; real.write = function () { window.__mainWrites++; return w.apply(this, arguments); }; real.write.__w = 1; }
    return real; } }); })();"""
NO_WORKER = "window.Worker = undefined;"

# อ่านผ่าน readWorkbook ของจริง แล้วแปลงทุกชีทเป็นแถว (วันที่เป็นวันตามเวลาเครื่อง) ไว้เทียบกันสองทาง
READ = """async ([b64, name]) => {
  const { loadLibs } = await import(new URL('src/loader.js', document.baseURI).href); await loadLibs('xlsx');
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const file = new File([u], name);
  const before = window.__mainReads;
  const { readWorkbook } = await import(new URL('src/sheetpick.js', document.baseURI).href);
  const { wb } = await readWorkbook(file);
  const reads = window.__mainReads - before;
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (v) => v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}` : v;
  const sheets = wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }).map((r) => r.map(fmt))]);
  return { reads, names: wb.SheetNames, rows: sheets[0][1].length, d2: sheets[0][1][1][3], last: sheets[0][1].at(-1), digest: JSON.stringify(sheets).length, json: JSON.stringify(sheets) };
}"""


def read_with(b, init, path):
    ctx = b.new_context(viewport={"width": 412, "height": 915}, timezone_id="Asia/Bangkok")  # เขตเวลาไทยคือที่วันที่เพี้ยน 4 วินาที
    ctx.add_init_script(COUNT)
    if init:
        ctx.add_init_script(init)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    fkui.open_tool(pg, "excel-match-sum", base=BASE)
    r = pg.evaluate(READ, [base64.b64encode(path.read_bytes()).decode(), path.name])
    r["errs"] = errs
    ctx.close()
    return r


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk_xw_"))
    big, small = tmp / "ใหญ่-30000แถว.xlsx", tmp / "เล็ก-50แถว.xlsx"
    make_xlsx(big, 30000)
    make_xlsx(small, 50)
    print(f"ไฟล์ใหญ่ {big.stat().st_size:,} ไบต์ ไฟล์เล็ก {small.stat().st_size:,} ไบต์", flush=True)
    with sync_playwright() as p:
        b = getattr(p, os.environ.get("FK_ENGINE", "chromium")).launch()  # FK_ENGINE=webkit ลองแบบไอโฟน
        w = read_with(b, None, big)
        m = read_with(b, NO_WORKER, big)
        ck("ไฟล์ใหญ่ ไม่อ่านบนเธรดหลัก (XLSX.read บนหน้า 0 ครั้ง)", w["reads"] == 0, f"{w['reads']} ครั้ง")
        ck("ไฟล์ใหญ่ อ่านได้ครบ 30,001 แถว ชื่อชีทไทยถูก", w["rows"] == 30001 and w["names"] == ["ข้อมูล"], f"{w['rows']} แถว {w['names']}")
        ck("วันที่แถวแรกเป็น 1 ม.ค. 2026 เที่ยงคืนพอดี (ผ่านตัวแก้ 4 วินาที)", w["d2"] == "2026-01-01 00:00:00", str(w["d2"]))
        ck("เครื่องไม่มี Worker ถอยไปอ่านบนเธรดหลักได้", m["reads"] == 1 and m["rows"] == 30001, f"reads={m['reads']} rows={m['rows']}")
        ck("สองทางได้ผลตรงกันทุกเซลล์", w["json"] == m["json"], f"ยาว {w['digest']} กับ {m['digest']}")
        s = read_with(b, None, small)
        ck("ไฟล์เล็กอ่านได้ครบ 51 แถว", s["rows"] == 51, f"{s['rows']} แถว reads={s['reads']}")
        ck("ไม่มี error บนหน้า", not (w["errs"] or m["errs"] or s["errs"]), str((w["errs"] + m["errs"] + s["errs"])[:2]))

        # จุดอื่นที่อ่าน Excel เอง (ไม่ผ่าน readWorkbook) ต้องอ่านไฟล์ใหญ่นอกเธรดหลักด้วย และยังได้ผลจริง
        for name, tool, do, done in (
            ("excel-csv แปลงเป็น CSV", "excel-csv", lambda pg: fkui.act(pg, "แปลงไฟล์"),
             "() => document.querySelector('.s2')?.dataset.state === 'result'"),
            ("excel-to-pdf แปลงเป็น PDF", "excel-to-pdf", lambda pg: fkui.act(pg, "แปลงเป็น PDF"),
             "() => document.querySelector('.s2')?.dataset.state === 'result'"),
            ("ตัวดูไฟล์ (แตะชื่อไฟล์)", "excel-match-sum",
             lambda pg: pg.locator(f'button[aria-label="ดูข้อมูลใน {big.name}"]').first.click(),
             "() => [...document.querySelectorAll('dialog[open] td, [role=dialog] td')].length > 20"),
        ):
            # จอมือถือซ่อนรายการไฟล์ไว้ในลิ้นชักตัวเลือก ตัวดูไฟล์จึงใช้จอกว้าง
            vw = {"width": 1280, "height": 900} if tool == "excel-match-sum" else {"width": 412, "height": 915}
            ctx = b.new_context(viewport=vw, timezone_id="Asia/Bangkok")
            ctx.add_init_script(COUNT)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            fkui.open_tool(pg, tool, base=BASE)
            fkui.feed(pg, [big])
            pg.wait_for_timeout(3000)
            before = pg.evaluate("() => window.__mainReads")
            do(pg)
            try:
                pg.wait_for_function(done, timeout=120000)
                fin = True
            except Exception:
                fin = False
            reads = pg.evaluate("() => window.__mainReads") - before
            ck(f"{name} ไฟล์ใหญ่ทำเสร็จ และไม่อ่านบนเธรดหลัก", fin and reads == 0 and not errs, f"เสร็จ={fin} อ่านบนหน้า {reads} ครั้ง error={errs[:1]}")
            ctx.close()

        # เขียนไฟล์ผลลัพธ์ใหญ่ต้องเขียนนอกเธรดหลัก และไฟล์ที่ได้ต้องเปิดได้ แถวครบ (เปิดด้วย openpyxl ไม่ใช่ SheetJS ตัวเดียวกัน)
        csv = tmp / "ใหญ่-30000แถว.csv"
        csv.write_text("รหัส,ชื่อ,ยอด,หมายเหตุ\n" + "".join(f"S{i % 500:04d},ลูกค้า {i},{i * 1.5},หมายเหตุ {i % 97}\n" for i in range(30000)), encoding="utf-8")
        big2 = tmp / "ใหญ่-ชุดสอง.xlsx"
        big2.write_bytes(big.read_bytes())
        for name, tool, files, prep, btn, want in (
            ("excel-merge รวมสองไฟล์", "excel-merge", [big, big2], None, "รวมไฟล์", 60001),
            ("excel-csv CSV เป็น Excel", "excel-csv", [csv], "to-xlsx", "แปลงไฟล์", 30001),
        ):
            for engine_off in (False, True):
                ctx = b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Bangkok", accept_downloads=True)
                ctx.add_init_script(COUNT)
                if engine_off:
                    ctx.add_init_script(NO_WORKER)
                pg = ctx.new_page()
                errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                fkui.open_tool(pg, tool, base=BASE)
                if prep:
                    pg.select_option("select:has(option[value=to-xlsx])", prep)
                fkui.feed(pg, files)
                pg.wait_for_timeout(3000)
                before = pg.evaluate("() => window.__mainWrites")
                fkui.act(pg, btn)
                out = tmp / f"ผล-{tool}-{int(engine_off)}.xlsx"
                try:
                    # dl_button ไม่รอ ถ้ายังทำงานอยู่จะหาปุ่มไม่เจอทันที ต้องรอสถานะเสร็จก่อน
                    pg.wait_for_function("() => document.querySelector('.s2')?.dataset.state === 'result'", timeout=120000)
                    fkui.download(pg, out, timeout=120000)
                    rows = openpyxl.load_workbook(out, read_only=True).active.max_row
                except Exception as e:
                    rows = f"ไม่ได้ไฟล์ {str(e)[:80]}"
                writes = pg.evaluate("() => window.__mainWrites") - before
                label = "เครื่องไม่มี Worker ถอยไปเขียนบนหน้า" if engine_off else "เขียนนอกเธรดหลัก"
                good = (writes >= 1) if engine_off else (writes == 0)
                ck(f"{name} {label} ไฟล์เปิดได้ {want:,} แถว", good and rows == want and not errs, f"เขียนบนหน้า {writes} ครั้ง แถว {rows} error={errs[:1]}")
                if tool == "excel-merge" and out.exists():
                    # ‼️ 10/11/2026 วันที่ในไฟล์ผลเคยเกิน 4 วินาที (00:00:04) ทั้งสองทาง เพราะฐานปี 1899 ของกรุงเทพ
                    d2 = openpyxl.load_workbook(out, read_only=True).active["D2"].value
                    ck(f"{name} {label} วันที่ในไฟล์ผลเป็นเที่ยงคืนพอดี", d2 == datetime.datetime(2026, 1, 1), str(d2))
                ctx.close()
        b.close()
    print(f"สรุป: ผ่าน {ok} ตก {fail}", flush=True)
    sys.exit(1 if fail or ok == 0 else 0)


if __name__ == "__main__":
    main()
