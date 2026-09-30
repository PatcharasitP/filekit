"""สร้างไฟล์ตัวอย่างของเครื่องมือ excel-lookup (ดึงข้อมูลจากอีกไฟล์มาเติม)

ข้อมูลจำลองตามภาพไฟล์ Pending VAT 2026 ของพี่ปอนด์ (30/09/2026): ไฟล์หลักมี
  · แถว 1 เป็นยอดรวม (ตัวเลข 18 กับสูตร SUBTOTAL) หัวตารางจริงอยู่แถว 2
  · คอลัมน์ Mapping เป็นสูตร =A&F  · คอลัมน์ Tax Inv. Date/No/Send to Tax Team ว่างรอเติม
  · ตั้งฟิลเตอร์ + ซ่อนบางแถว + แช่แข็งหัวตาราง + ช่องสูตรที่ได้ค่าว่าง
‼️ ไฟล์ที่ได้จากสคริปต์นี้เป็นไฟล์ "ดิบ" (openpyxl) ให้ Excel จริงเปิดแล้วบันทึกซ้ำอีกรอบ
   (tests/browser_lookup.py และ tests/lookup_excel_check.ps1) เพื่อได้ XML แบบที่ Excel เขียนเอง
   ซึ่งเป็นแบบที่ไฟล์จริงของบริษัทเป็น (มี spans, sharedStrings, x14ac) openpyxl เขียนไม่เหมือน
ใช้:  python3 tools/build_lookup_samples.py <โฟลเดอร์ปลายทาง>
"""
import sys, datetime as dt
import openpyxl
from openpyxl.styles import PatternFill, Font
from openpyxl.worksheet.filters import AutoFilter

out = sys.argv[1]
D = dt.datetime
# (company, item, doc_date, post_date, docno, invoice, vendor, vendor_name, amount, base, total)
NAME = "บริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)"
rows = [
 (1068, 44151, D(2026,3,12), D(2026,3,12), 2619062802, "SMTRENT20260312", 6088686, 12052.76, 172182.34),
 (1068, 44152, D(2026,3,12), D(2026,3,12), 2619062803, "SMTRENT20260312", 6088686, 3080.00, 44000.00),
 (1068, 22055, D(2025,9,26), D(2026,3,12), 2619063334, "IN9992500626", 6088686, 404.74, 5782.00),
 (1068, 23766, D(2025,10,28), D(2026,3,12), 2619063335, "IN9992500655", 6088686, 135.73, 1939.00),
 (1068, 46209, D(2026,3,20), D(2026,3,20), 2619067566, "SMTRENT20260320", 6068935, 1077.09, 15387.00),
 (1068, 46059, D(2026,4,1), D(2026,4,1), 2619070521, "SMTRENT20260324", 6088685, 12786.78, 182668.23),
 (1068, 46060, D(2026,4,1), D(2026,4,1), 2619070522, "SMTRENT20260324", 6088685, 3080.00, 44000.00),
 (1019, 12739, D(2026,4,2), D(2026,4,9), 2619020111, "BKK0173DSI/2", 6101546, 2152.28, 30746.85),
 (1019, 12738, D(2026,4,2), D(2026,4,9), 2619020110, "BKK0173DSI/1", 6101546, 2089.59, 29851.31),
 (1068, 46815, D(2026,4,2), D(2026,4,2), 2619080653, "SMTRENT20260402", 6088685, 12786.78, 182668.23),
 (1068, 46816, D(2026,4,2), D(2026,4,2), 2619080654, "SMTRENT20260402", 6088685, 3080.00, 44000.00),
 (1068, 48815, D(2026,4,16), D(2026,4,17), 2619089500, "YLA80007A/2", 6068935, 1586.20, 22660.00),
 (1068, 48814, D(2026,4,16), D(2026,4,17), 2619089499, "YLA80007A/1", 6068935, 1540.00, 22000.00),
 (1068, 48817, D(2026,4,16), D(2026,4,17), 2619089502, "YLA80007A/4", 6068935, 1400.00, 20000.00),
 (1068, 48816, D(2026,4,16), D(2026,4,17), 2619089501, "YLA80007A/3", 6068935, 1400.00, 20000.00),
 (1068, 50718, D(2026,4,22), D(2026,4,22), 2619091572, "SMTRENT20260422", 6088686, 3080.00, 44000.00),
 (1068, 49495, D(2026,4,17), D(2026,4,17), 2619088982, "SMTRENT20260417", 6088685, 3080.00, 44000.00),
 (1068, 48635, D(2026,5,8), D(2026,5,8), 2619103772, "SMTRENT20260508", 6068935, 9800.00, 140000.00),
]

# ── ไฟล์หลัก ──────────────────────────────────────────────────────────────────
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "2026"
head = ["Company Code","Item","Doc.Date","Posting Date","Doc.Type","Doc. No.","Mapping","Invoice no.",
        "Vendor/Cust","Vendor/Customer Name","Amount","Tax Base Amount","Total (SM)",
        "Tax Inv. Date (SM)","Tax Inv. No (SM)","Send to Tax Team No.","Clearing Doc."]
ws["J1"] = 18
ws["K1"] = f"=SUBTOTAL(9,K3:K{2+len(rows)})"
ws.append([]) if False else None
for c, h in enumerate(head, 1):
    cell = ws.cell(row=2, column=c, value=h); cell.font = Font(bold=True)
    if 14 <= c <= 16: cell.fill = PatternFill("solid", fgColor="E4DFEC")
for i, (co, it, d1, d2, doc, inv, ven, amt, base) in enumerate(rows):
    r = 3 + i
    vals = [co, it, d1, d2, "KR", doc, f"=A{r}&F{r}", inv, ven, NAME, amt, base, round(amt+base, 2)]
    for c, v in enumerate(vals, 1): ws.cell(row=r, column=c, value=v)
    ws.cell(row=r, column=3).number_format = "dd/mm/yyyy"; ws.cell(row=r, column=4).number_format = "dd/mm/yyyy"
    for c in (11, 12, 13): ws.cell(row=r, column=c).number_format = "#,##0.00"
    ws.cell(row=r, column=14).number_format = "dd/mm/yyyy"      # Tax Inv. Date ว่าง แต่ตั้งรูปแบบวันที่ไว้แล้ว
    ws.cell(row=r, column=15).number_format = "@"
    ws.cell(row=r, column=16).number_format = "@"
    ws.cell(row=r, column=17, value=2620062538 + i)
# ช่องเดิมที่ไม่ควรถูกทับ / ช่องสูตรที่ดูเหมือนว่าง
ws["O12"] = "OLD-001"                       # แถว 12 มีของอยู่แล้ว (โหมดเติมเฉพาะช่องว่างต้องไม่ทับ)
ws["P5"] = '=""'                           # สูตรที่ได้ค่าว่าง (ห้ามทับเงียบ ๆ)
for r in (4, 6, 9, 13): ws.row_dimensions[r].hidden = True     # แถวที่ถูกซ่อนตามฟิลเตอร์
ws.auto_filter.ref = f"A2:Q{2+len(rows)}"
ws.freeze_panes = "C3"
for col, w in {"G": 18, "J": 34, "N": 18, "O": 20, "P": 20}.items(): ws.column_dimensions[col].width = w
wb.save(f"{out}/lookup-main-raw.xlsx")

# ── ไฟล์รอง (จากทีมภาษี) ─────────────────────────────────────────────────────
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "TaxTeam"
ws.append(["Mapping","Tax Inv. Date (SM)","Tax Inv. No (SM)","Send to Tax Team No.","Remark"])
key = lambda k: f"{k[0]}{k[4]}"
R = {i: rows[i] for i in range(len(rows))}
src = []
def add(i, date, no, send, remark="", as_number=False, pad=""):
    k = key(R[i])
    src.append([int(k) if as_number else k + pad, date, no, send, remark])
add(0, D(2026,3,27), "TX-6900001", "TT-01")
add(1, D(2026,3,27), "TX-6900002", "TT-01", as_number=True)             # คีย์เก็บเป็นตัวเลข ฝั่งหลักเป็นข้อความจากสูตร
add(2, D(2026,3,28), "TX-6900003", "TT-02", pad=" ")                     # ท้ายคีย์มีช่องว่าง
add(3, D(2026,3,28), "TX-6900004", "TT-02")
add(3, D(2026,3,28), "TX-6900004", "TT-02", "ซ้ำ ค่าเหมือนกัน")           # ซ้ำแบบค่าเหมือนกันทุกช่อง
add(5, D(2026,4,2), "TX-6900010", "TT-03")
add(5, D(2026,4,9), "TX-6900011", "TT-04", "ซ้ำ ค่าต่างกัน")               # ซ้ำและค่าต่างกัน
add(7, D(2026,4,15), "TX-6900020", "TT-05")
add(8, D(2026,4,15), "TX-6900021", "TT-05")
add(9, D(2026,4,18), "TX-6900025", "TT-06")                              # คีย์ของแถวที่ไฟล์หลักมีของเดิมอยู่แล้ว (ไว้ทดสอบโหมดทับ)
add(10, D(2026,4,20), "TX-6900030", "TT-06")
add(11, D(2026,4,25), "TX-6900040", "TT-07")
add(13, D(2026,4,30), "TX-6900050", "TT-08")
add(17, None, "TX-6900060", "TT-09", "ยังไม่มีวันที่")                     # ค่าบางช่องว่าง
src.append(["10682619070000", D(2026,5,1), "TX-NOUSE", "TT-99", "ไม่มีใครใช้คีย์นี้"])
for row in src: ws.append(row)
ws.append(["#N/A", D(2026,5,1), "TX-BAD1", "TT-00", ""])
ws["A%d" % ws.max_row].data_type = "e"
ws.append(["#N/A", D(2026,5,1), "TX-BAD2", "TT-00", ""])
ws["A%d" % ws.max_row].data_type = "e"
for r in range(2, ws.max_row + 1): ws.cell(row=r, column=2).number_format = "dd/mm/yyyy"
wb.save(f"{out}/lookup-source.xlsx")
print("ok", out)
