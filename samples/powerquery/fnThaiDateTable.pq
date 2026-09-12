// fnThaiDateTable — ตารางปฏิทินสำหรับ Power BI ที่รองรับปีงบประมาณและ พ.ศ.
//
// ‼️ ทำไมต้องมีตารางปฏิทิน: ฟังก์ชันตระกูล TIME INTELLIGENCE ของ DAX
//    (TOTALYTD, SAMEPERIODLASTYEAR, DATEADD) ต้องการตารางวันที่ที่ทำเครื่องหมายเป็น
//    Date table และมีวันที่ต่อเนื่องไม่ขาดวัน ถ้าไม่มี ตัวเลขจะเพี้ยนแบบเงียบ ๆ
//
// ‼️ สร้างด้วย Power Query ไม่ใช่ CALENDAR ของ DAX เพราะตารางที่มาจาก M
//    จะถูกบีบอัดเข้า VertiPaq ตอน refresh ส่วน calculated table กินแรมเพิ่มตอนเปิดไฟล์
//
// ตัวแปรที่ต้องใส่
//   StartDate     วันแรกของตาราง เช่น #date(2023,1,1)
//   EndDate       วันสุดท้าย เช่น #date(2026,12,31)
//   FiscalStart   เดือนที่ปีงบเริ่ม (1 = ปฏิทินปกติ, 10 = ปีงบไทยที่เริ่ม ต.ค.)
//
// วิธีใช้: Power Query > New Source > Blank Query > Advanced Editor > วางทับทั้งหมด
//          แล้วเรียกใช้จาก query อื่นด้วย  = fnThaiDateTable(#date(2023,1,1), #date(2026,12,31), 10)
//          จากนั้นใน Power BI คลิกขวาที่ตาราง > Mark as date table > เลือกคอลัมน์ Date

let
    fnThaiDateTable = (StartDate as date, EndDate as date, optional FiscalStart as number) as table =>
let
    FS = if FiscalStart = null then 1 else FiscalStart,

    // ‼️ Duration.Days ต้องลบด้วย date ทั้งคู่ ไม่ใช่ datetime ไม่งั้นได้เศษวันติดมา
    DayCount = Duration.Days(EndDate - StartDate) + 1,
    Dates    = List.Dates(StartDate, DayCount, #duration(1, 0, 0, 0)),
    Source   = Table.FromList(Dates, Splitter.SplitByNothing(), {"Date"}),
    TypedDate = Table.TransformColumnTypes(Source, {{"Date", type date}}),

    // ── ส่วนปฏิทินปกติ ────────────────────────────────────────────────
    AddYear    = Table.AddColumn(TypedDate, "Year",        each Date.Year([Date]),        Int64.Type),
    AddMonth   = Table.AddColumn(AddYear,   "MonthNumber", each Date.Month([Date]),       Int64.Type),
    AddDay     = Table.AddColumn(AddMonth,  "DayOfMonth",  each Date.Day([Date]),         Int64.Type),
    AddQuarter = Table.AddColumn(AddDay,    "Quarter",     each Date.QuarterOfYear([Date]), Int64.Type),

    // ‼️ ปี พ.ศ. = ค.ศ. + 543 เสมอ ไม่มีข้อยกเว้นสำหรับวันที่หลัง พ.ศ. 2484
    //    (ก่อนหน้านั้นปีไทยเริ่มเดือนเมษายน ซึ่งอยู่นอกช่วงที่รายงานธุรกิจใช้)
    AddBE      = Table.AddColumn(AddQuarter, "YearBE",     each [Year] + 543,             Int64.Type),

    // ── ชื่อเดือนภาษาไทย ──────────────────────────────────────────────
    // ‼️ ไม่ใช้ Date.MonthName เพราะผลลัพธ์ขึ้นกับ locale ของเครื่องที่ refresh
    //    ซึ่งบนเซิร์ฟเวอร์ของ Power BI Service ไม่ใช่ไทย จะได้ January ปนมา
    MonthTH    = {"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},
    MonthTHAbb = {"ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
                  "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."},
    AddMonthTH = Table.AddColumn(AddBE,      "MonthNameTH",    each MonthTH{[MonthNumber] - 1},    type text),
    AddMonthAb = Table.AddColumn(AddMonthTH, "MonthShortTH",   each MonthTHAbb{[MonthNumber] - 1}, type text),

    // ‼️ ป้ายเดือนที่เอาไปโชว์บนแกน ต้องมีคอลัมน์ตัวเลขคู่ไว้เรียงเสมอ
    //    ไม่งั้น Power BI เรียงตามตัวอักษรแล้วได้ ก.ค. มาก่อน ม.ค.
    //    (บทเรียนที่ทำให้กราฟเรียงผิดโดยไม่มีใครทักมาหลายรอบ)
    AddLabel   = Table.AddColumn(AddMonthAb, "MonthLabelTH",
                    each [MonthShortTH] & " " & Text.From(Number.Mod([YearBE], 100)), type text),
    AddSortKey = Table.AddColumn(AddLabel,   "MonthSort",      each [Year] * 100 + [MonthNumber], Int64.Type),

    // ── ปีงบประมาณ ────────────────────────────────────────────────────
    // ‼️ เดือนที่ >= เดือนเริ่มปีงบ ให้ถือเป็นปีงบถัดไป เช่นเริ่ม ต.ค.
    //    ต.ค. 2025 จึงอยู่ในปีงบ 2026 ซึ่งเป็นวิธีนับของราชการไทย
    AddFY      = Table.AddColumn(AddSortKey, "FiscalYear",
                    each if [MonthNumber] >= FS then [Year] + 1 else [Year], Int64.Type),
    AddFYBE    = Table.AddColumn(AddFY,      "FiscalYearBE",   each [FiscalYear] + 543, Int64.Type),
    AddFQ      = Table.AddColumn(AddFYBE,    "FiscalQuarter",
                    each Number.IntegerDivide(Number.Mod([MonthNumber] - FS + 12, 12), 3) + 1, Int64.Type),

    // ── ตัวช่วยกรองที่ใช้บ่อยในรายงาน ───────────────────────────────────
    Today      = Date.From(DateTime.FixedLocalNow()),
    AddIsToday = Table.AddColumn(AddFQ,      "IsToday",        each [Date] = Today,        type logical),
    AddIsPast  = Table.AddColumn(AddIsToday, "IsPastOrToday",  each [Date] <= Today,       type logical),
    AddWeekday = Table.AddColumn(AddIsPast,  "DayOfWeek",      each Date.DayOfWeek([Date], Day.Monday) + 1, Int64.Type),
    AddIsWknd  = Table.AddColumn(AddWeekday, "IsWeekend",      each [DayOfWeek] >= 6,      type logical),

    // ‼️ คีย์ตัวเลขไว้เชื่อมกับตารางที่เก็บวันที่เป็น yyyymmdd ซึ่งพบบ่อยในระบบเก่า
    AddKey     = Table.AddColumn(AddIsWknd,  "DateKey",
                    each [Year] * 10000 + [MonthNumber] * 100 + [DayOfMonth], Int64.Type)
in
    AddKey
in
    fnThaiDateTable
