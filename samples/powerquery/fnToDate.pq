// fnToDate, แปลงคอลัมน์ข้อความให้เป็นวันที่จริง ทีเดียวทั้งคอลัมน์
//
// เกิดจากงานจริง (13/09/2026 พี่ปอนด์): ตาราง Latest Contract / RENEW CONTRACT TASK เก็บวันที่เป็นข้อความ
// (CONTRACT_START_DATE_CHAR = "2024-01-15", SUB_BOOKED_DATE = "31/10/2022")
// เดิมฟังก์ชันอื่นแปลงเองทีละเซลล์ทุกครั้งที่เรียก เรียก 3 ชั้นก็แปลง 3 รอบ
// แยกออกมาเป็นฟังก์ชันเดียวจบ แปลงครั้งเดียวแล้วฟังก์ชันอื่นรับวันที่จริงไปใช้ต่อ
//
// Usage:
//   fnToDate(Source, optional Columns, optional Options)
//
//   Source    ตารางต้นทาง
//   Columns   รายชื่อคอลัมน์ที่จะแปลง เช่น {"SUB_BOOKED_DATE", "CREATED_DOC_DATE"}
//             ไม่ใส่ (null) = หาเองตาม Options[Detect]
//
// Options:
//   Detect          วิธีหาคอลัมน์เมื่อไม่ระบุ Columns
//                     "byName" (ค่าเริ่มต้น) = ชื่อคอลัมน์เข้าเกณฑ์ NamePattern
//                     "byContent" = สุ่มอ่านค่าจริง SampleRows แถวแรกของทุกคอลัมน์ข้อความ แปลงได้เกิน MinHitRate ถือว่าเป็นวันที่
//                     "all" = คอลัมน์ข้อความทั้งหมด
//   NamePattern     {"DATE"} (ค่าเริ่มต้น) ชื่อคอลัมน์ที่มีคำเหล่านี้ถือเป็นคอลัมน์วันที่ (ไม่สนตัวพิมพ์)
//   SampleRows      200 (ค่าเริ่มต้น) จำนวนแถวที่อ่านตอน Detect = byContent
//   MinHitRate      0.8 (ค่าเริ่มต้น) สัดส่วนค่าที่ต้องแปลงได้ถึงจะนับว่าคอลัมน์นั้นเป็นวันที่
//   YearEra         "CE" = ค.ศ. (ค่าเริ่มต้น), "BE" = พ.ศ. ลบ 543 ให้ทุกค่า, "auto" = ดูทั้งคอลัมน์แล้วตัดสินครั้งเดียว
//                   ‼️ ไม่เดาปฏิทินให้ทีละเซลล์ "auto" เจอปีปนกันทั้งสองแบบจะ error ไม่เดาต่อ
//   TwoDigitYear    ปี 2 หลัก ("19/08/69") null = ไม่รับ คืนค่าว่าง (ค่าเริ่มต้น), "BE", "CE"
//   Mode            "replace" (ค่าเริ่มต้น) = แปลงทับคอลัมน์เดิม, "add" = เพิ่มคอลัมน์ใหม่ เก็บของเดิมไว้
//   Prefix/Suffix   ใช้กับ Mode = "add" ตั้งชื่อคอลัมน์ใหม่ (ค่าเริ่มต้น Prefix = "" Suffix = "_d")
//   Parser          ฟังก์ชันแปลงเอง เช่น fnParseThaiDate (รองรับเดือนไทย ชื่อวันนำหน้า) ส่งมาแล้วข้าม YearEra กับ TwoDigitYear
//   ReportColumn    ใส่ชื่อคอลัมน์ = เพิ่มคอลัมน์นับจำนวนช่องที่แปลงไม่ได้ในแถวนั้น (ไว้ไล่ดูข้อมูลเสีย)
//
// Examples:
//   fnToDate(Source, {"SUB_BOOKED_DATE", "CREATED_DOC_DATE"})                        // ระบุเอง เร็วสุด
//   fnToDate(Source)                                                                  // หาเองจากชื่อที่มีคำว่า DATE
//   fnToDate(Source, null, [ NamePattern = {"DATE", "_CHAR"} ])                       // ชื่อที่มี DATE หรือ _CHAR
//   fnToDate(Source, null, [ Detect = "byContent" ])                                  // ดูจากค่าจริง 200 แถวแรก
//   fnToDate(Source, {"วันที่"}, [ YearEra = "BE" ])                                   // ข้อมูลเป็น พ.ศ.
//   fnToDate(Source, Cols, [ Mode = "add", Suffix = "_d" ])                           // เก็บคอลัมน์ข้อความเดิมไว้ด้วย
(
    Source as table,
    optional Columns as nullable list,
    optional Options as nullable record
) as table =>
let
    Opt        = Options ?? [],
    detect     = Text.Lower(Record.FieldOrDefault(Opt, "Detect", "byName")),
    pattern    = Record.FieldOrDefault(Opt, "NamePattern", {"DATE"}),
    sampleRows = Record.FieldOrDefault(Opt, "SampleRows", 200),
    minHit     = Record.FieldOrDefault(Opt, "MinHitRate", 0.8),
    eraIn      = Text.Upper(Text.Trim(Record.FieldOrDefault(Opt, "YearEra", "CE"))),
    twoDigit   = Record.FieldOrDefault(Opt, "TwoDigitYear", null),
    mode       = Text.Lower(Record.FieldOrDefault(Opt, "Mode", "replace")),
    prefix     = Record.FieldOrDefault(Opt, "Prefix", ""),
    suffix     = Record.FieldOrDefault(Opt, "Suffix", "_d"),
    parser     = Record.FieldOrDefault(Opt, "Parser", null),
    reportCol  = Record.FieldOrDefault(Opt, "ReportColumn", null),

    have = Table.ColumnNames(Source),

    // ---- อ่านรูปแบบวันที่ (ไม่พึ่ง culture ของเครื่อง เพราะเครื่องไทยตีปีเป็น พ.ศ. เองเงียบ ๆ) ----
    SplitParts = (v as text) as nullable list =>
        let
            t     = Text.Trim(v),
            head  = if Text.Contains(t, " ") then Text.Start(t, Text.PositionOf(t, " ")) else t,   // ตัดเวลาที่พ่วงท้าย
            parts = List.Select(Text.SplitAny(head, "/-."), each _ <> "")
        in
            if List.Count(parts) <> 3 then null else parts,
    IsIso      = (parts as list) as logical => Text.Length(parts{0}) = 4,
    YearTextOf = (parts as list) as text => if IsIso(parts) then parts{0} else parts{2},
    RawYearOf  = (v as any) as nullable number =>
        if not (v is text) then null
        else let p = SplitParts(v) in if p = null then null else (try Number.From(YearTextOf(p)) otherwise null),

    // ---- เลือกคอลัมน์ที่จะแปลง ----
    textCols = List.Select(have, (c) =>
        List.AnyTrue(List.Transform(List.FirstN(Table.Column(Source, c), 50), each _ is text))),
    byName = List.Select(have, (c) =>
        List.AnyTrue(List.Transform(pattern, (p) => Text.Contains(Text.Upper(c), Text.Upper(p))))),
    byContent = List.Select(textCols, (c) =>
        let
            vals = List.RemoveNulls(List.FirstN(Table.Column(Source, c), sampleRows)),
            n    = List.Count(vals)
        in
            n > 0 and (List.Count(List.Select(vals, each RawYearOf(_) <> null)) / n) >= minHit),
    picked =
        if Columns <> null then Columns
        else if detect = "byname" then byName
        else if detect = "bycontent" then byContent
        else if detect = "all" then textCols
        else error "fnToDate: Detect ต้องเป็น byName, byContent หรือ all (ได้มา " & detect & ")",

    missing = List.Difference(picked, have),
    Checked =
        if not List.IsEmpty(missing) then error "fnToDate: ไม่พบคอลัมน์ " & Text.Combine(missing, ", ") & " ในตารางที่ส่งมา"
        else if not List.Contains({"replace", "add"}, mode) then error "fnToDate: Mode ต้องเป็น replace หรือ add (ได้มา " & mode & ")"
        else Source,

    // ---- ตัดสินปฏิทินครั้งเดียวจากทุกคอลัมน์ที่จะแปลง ไม่ใช่เดาทีละเซลล์ ----
    scanYears = if eraIn <> "AUTO" or parser <> null then {}
                else List.Select(
                        List.RemoveNulls(List.Combine(List.Transform(picked, (c) =>
                            List.Transform(Table.Column(Checked, c), RawYearOf)))),
                        each _ >= 1000),
    era =
        if eraIn = "CE" or eraIn = "BE" then eraIn
        else if eraIn <> "AUTO" then error "fnToDate: YearEra ต้องเป็น CE, BE หรือ auto (ได้มา " & eraIn & ")"
        else if List.IsEmpty(scanYears) then "CE"
        else if List.Min(scanYears) >= 2400 then "BE"
        else if List.Max(scanYears) < 2400 then "CE"
        else error "fnToDate: YearEra = auto แต่คอลัมน์มีปีปนกันทั้งสองแบบ (ต่ำสุด "
                   & Text.From(List.Min(scanYears)) & " สูงสุด " & Text.From(List.Max(scanYears))
                   & ") ให้ระบุ YearEra เป็น CE หรือ BE เอง",

    FixYear = (y as number) as nullable number =>
        if y >= 1000 then (if era = "BE" then y - 543 else y)
        else if y >= 100 then null                                   // ปี 3 หลัก = ข้อมูลเสีย ไม่เดาให้
        else if twoDigit = null then null                            // ปี 2 หลัก ไม่ระบุ = ไม่เดา คืนค่าว่าง
        else if Text.Upper(twoDigit) = "BE" then 2500 + y - 543
        else if Text.Upper(twoDigit) = "CE" then 2000 + y
        else error "fnToDate: TwoDigitYear ต้องเป็น BE, CE หรือไม่ใส่",

    Builtin = (v as any) as nullable date =>
        if v = null then null
        else if v is date then v
        else if v is datetime then Date.From(v)
        else if v is datetimezone then Date.From(DateTime.From(v))
        else if not (v is text) then null
        else
            let parts = SplitParts(v)
            in  if parts = null then null
                else
                    let
                        iso = IsIso(parts),
                        y   = try Number.From(YearTextOf(parts)) otherwise null,
                        m   = try Number.From(parts{1}) otherwise null,
                        d   = try Number.From(if iso then parts{2} else parts{0}) otherwise null,
                        yy  = if y = null then null else FixYear(y)
                    in  if yy = null or m = null or d = null then null else (try #date(yy, m, d) otherwise null),

    ToDate = if parser = null then Builtin else parser,

    // ‼️ บังคับให้ era ถูกคำนวณตั้งแต่ตอนสร้างตาราง ไม่งั้น error เรื่องปฏิทินเป็น lazy ไปโผล่ตอนคำนวณทีละเซลล์
    Guarded = if parser = null and not List.Contains({"CE", "BE"}, era)
              then error "fnToDate: ตีความปฏิทินของปีไม่ได้"
              else Checked,

    // ---- แปลง: TransformColumns ทำงานในคอลัมน์เดิม เร็วกว่าเพิ่มคอลัมน์ใหม่ทีละแถว ----
    Replaced = Table.TransformColumns(Guarded,
                    List.Transform(picked, (c) => {c, ToDate, type nullable date})),
    Added    = List.Accumulate(picked, Guarded, (t, c) =>
                    Table.AddColumn(t, prefix & c & suffix, each ToDate(Record.Field(_, c)), type nullable date)),
    Converted = if mode = "replace" then Replaced else Added,

    outCols = if mode = "replace" then picked else List.Transform(picked, (c) => prefix & c & suffix),
    WithReport = if reportCol = null then Converted
                 else Table.AddColumn(Converted, reportCol,
                        each List.Count(List.Select(outCols, (c) => Record.Field(_, c) = null)), Int64.Type)
in
    WithReport
