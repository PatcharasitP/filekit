// fnGroupConcat, ยุบหลายแถวให้เหลือแถวเดียวต่อกลุ่ม แล้วเอาค่าคอลัมน์อื่นมาต่อกันด้วยตัวคั่น
//
// เกิดจากงานจริง (13/09/2026 พี่ปอนด์): ตาราง Latest Contract มีหลายสัญญาต่อ 1 รหัสสถานี
// อยากเห็นสถานะทั้งหมดของสถานีนั้นในแถวเดียว และเงินก็ต้องยุบตามให้สอดคล้องกัน
//
//   รหัสสถานี  สถานะสัญญา  เงิน            →   รหัสสถานี  สถานะสัญญา                   เงิน
//   BKFC023    Active      1500                BKFC023    Active, Preactive, Expired  3,000, 2,500, 3,000
//   BKFC023    Active      1500
//   BKFC023    Preactive   2500                (ยุบค่าซ้ำของสถานะ แล้วเงินของ Active 2 แถวบวกกันเป็น 3,000)
//   BKFC023    Expired     3000
//
// Usage:
//   fnGroupConcat(Source, GroupBy, ConcatColumns, optional Options)
//
//   Source         ตารางต้นทาง
//   GroupBy        คอลัมน์ที่ใช้จัดกลุ่ม เช่น {"รหัสสถานี"} (ใส่หลายคอลัมน์ได้)
//   ConcatColumns  คอลัมน์ที่จะเอามาต่อกัน เช่น {"สถานะสัญญา", "เงิน"}
//   Options        ตัวเลือกทั้งหมดด้านล่าง ไม่ใส่ก็ได้
//
// Options (ใส่เฉพาะที่ต้องการ):
//   DistinctBy      = {"สถานะสัญญา"}   ยุบแถวที่คอลัมน์นี้ซ้ำกันให้เหลือค่าเดียว (ใส่หลายคอลัมน์ = ยุบตามหลายคอลัมน์พร้อมกัน)
//                                       ไม่ใส่ = ต่อกันทุกแถวตามเดิม ("Active, Active, Preactive, Expired")
//   SumColumns      = {"เงิน"}          คอลัมน์ตัวเลขที่ให้บวกกันเมื่อแถวถูกยุบ (ไม่ใส่ = เอาค่าของแถวแรก)
//   Separator       = ", "              ตัวคั่น
//   SortBy          = {"วันสิ้นสุดสัญญา"}   เรียงก่อนต่อ, เรียงจากมากไปน้อยใส่เป็น {{"วันสิ้นสุดสัญญา", 1}}
//   TotalColumns    = {"เงิน"}          เพิ่มคอลัมน์ผลรวมทั้งกลุ่มเป็น "ตัวเลขจริง" (เอาไปคิดต่อใน DAX ได้ ไม่ใช่ข้อความ)
//   CountColumn     = "จำนวนสัญญา"      เพิ่มคอลัมน์นับแถวเดิมในกลุ่ม
//   DistinctCountColumn = "จำนวนสถานะ"  เพิ่มคอลัมน์นับแถวหลังยุบ
//   FirstColumns    = {"SITE OWNER"}    คอลัมน์ที่เอาค่าแถวแรกมาอย่างเดียว (ไม่ต่อกัน)
//   NumberFormat    = "#,0"             รูปแบบตัวเลขตอนแปลงเป็นข้อความ (ไม่ใส่ = ตามค่าเดิม)
//   DateFormat      = "dd/MM/yyyy"      รูปแบบวันที่ตอนแปลงเป็นข้อความ
//   NullText        = "(ว่าง)"          ‼️ ค่าว่างแสดงเป็นข้อความนี้ เวลาต่อหลายคอลัมน์พร้อมกัน (ดู "กฎตำแหน่งตรง" ด้านล่าง)
//   KeepNulls       = true              ทางลัดของ NullText = "" (ช่องว่างเปล่า), มีไว้เพื่อคิวรีเก่าที่ใช้อยู่แล้ว
//
//   ‼️ NullText = null กับ KeepNulls = false ไม่ใช่เรื่องเดียวกัน (พี่ปอนด์ถาม 14/09/2026, ชื่อมันชวนสับสนจริง)
//       KeepNulls = false  = ค่าเริ่มต้น, ค่าว่าง "ยังอยู่" แต่แสดงเป็น (ว่าง) เพื่อไม่ให้ตำแหน่งเลื่อน
//       NullText  = null   = สั่ง "ทิ้ง" ค่าว่างจริง ๆ (พฤติกรรมก่อน 14/09) ตำแหน่งจะเลื่อน ใช้เมื่อตั้งใจเท่านั้น
//       NullText  = ""     = ยังอยู่ แต่เป็นช่องว่างเปล่า (เท่ากับ KeepNulls = true)
//
// ‼️ กฎตำแหน่งตรง (แก้ 14/09/2026 หลังพี่ปอนด์จับได้จากข้อมูลจริง BKFC026):
//   ต่อ "หลายคอลัมน์" พร้อมกัน = สัญญากับคนอ่านว่าสมาชิกตัวที่ i ของทุกคอลัมน์มาจากแถวเดียวกัน
//   ของเดิมทิ้ง null แยกรายคอลัมน์ ทำให้สถานะเหลือ 3 ตัวแต่เงินมี 4 ตัว ตำแหน่งเลื่อนแบบเงียบ ๆ
//       เดิม  สถานะ "Active, Active, Active"          เงิน "800, 800, 900, 1100"   ← 1100 ไม่มีเจ้าของ
//       ใหม่  สถานะ "Active, (ว่าง), Active, Active"   เงิน "800, 800, 900, 1100"   ← ตรงกันทีละตัว
//   ต่อ "คอลัมน์เดียว" ไม่มีอะไรให้เทียบตำแหน่ง จึงยังทิ้งค่าว่างเหมือนเดิมเพื่อให้อ่านสะอาด
//
// Examples:
//   // แบบง่ายสุด ต่อกันทุกแถว
//   fnGroupConcat(Source, {"รหัสสถานี"}, {"สถานะสัญญา"})
//   // ยุบสถานะซ้ำ แล้วรวมเงินตามสถานะ
//   fnGroupConcat(Source, {"รหัสสถานี"}, {"สถานะสัญญา", "เงิน"}, [ DistinctBy = {"สถานะสัญญา"}, SumColumns = {"เงิน"} ])
//   // ยุบตาม 2 คอลัมน์ + ผลรวมทั้งกลุ่ม + นับจำนวน
//   fnGroupConcat(Source, {"รหัสสถานี"}, {"สถานะสัญญา", "ประเภทสัญญา", "เงิน"},
//       [ DistinctBy = {"สถานะสัญญา", "ประเภทสัญญา"}, SumColumns = {"เงิน"},
//         TotalColumns = {"เงิน"}, CountColumn = "จำนวนสัญญา", NumberFormat = "#,0" ])
(
    Source as table,
    GroupBy as list,
    ConcatColumns as list,
    optional Options as nullable record
) as table =>
let
    Opt       = Options ?? [],
    sep       = Record.FieldOrDefault(Opt, "Separator", ", "),
    distinctBy= Record.FieldOrDefault(Opt, "DistinctBy", {}),
    sumCols   = Record.FieldOrDefault(Opt, "SumColumns", {}),
    sortBy    = Record.FieldOrDefault(Opt, "SortBy", {}),
    totalCols = Record.FieldOrDefault(Opt, "TotalColumns", {}),
    countCol  = Record.FieldOrDefault(Opt, "CountColumn", null),
    dcountCol = Record.FieldOrDefault(Opt, "DistinctCountColumn", null),
    firstCols = Record.FieldOrDefault(Opt, "FirstColumns", {}),
    numFmt    = Record.FieldOrDefault(Opt, "NumberFormat", null),
    dateFmt   = Record.FieldOrDefault(Opt, "DateFormat", "dd/MM/yyyy"),
    keepNulls = Record.FieldOrDefault(Opt, "KeepNulls", false),
    // ค่าว่างแสดงเป็นอะไร, null = สั่งทิ้ง, "" = ช่องว่าง, ปกติ = "(ว่าง)"
    hasNullText = Record.HasFields(Opt, "NullText"),
    nullText  = if hasNullText then Record.Field(Opt, "NullText") else (if keepNulls then "" else "(ว่าง)"),
    // ผู้ใช้สั่งเรื่องค่าว่างมาเองหรือเปล่า (ถ้าสั่งมา ให้ทำตามตรง ๆ ไม่ต้องเดาใจ)
    explicitNull = hasNullText or keepNulls,
    // ต่อหลายคอลัมน์เมื่อไหร่ ตำแหน่งของทุกคอลัมน์ต้องตรงกันเสมอ
    alignRows = List.Count(ConcatColumns) > 1,

    // ---- ด่านตรวจ: ผิดตรงไหนบอกตรงนั้น ----
    have    = Table.ColumnNames(Source),
    needed  = List.Distinct(GroupBy & ConcatColumns & distinctBy & sumCols & totalCols & firstCols),
    missing = List.Difference(needed, have),
    Checked =
        if List.IsEmpty(GroupBy) then error "fnGroupConcat: ต้องระบุคอลัมน์ที่ใช้จัดกลุ่มอย่างน้อย 1 คอลัมน์"
        else if List.IsEmpty(ConcatColumns) then error "fnGroupConcat: ต้องระบุคอลัมน์ที่จะเอามาต่อกันอย่างน้อย 1 คอลัมน์"
        else if not List.IsEmpty(missing) then error "fnGroupConcat: ไม่พบคอลัมน์ " & Text.Combine(missing, ", ") & " ในตารางที่ส่งมา"
        else if keepNulls and hasNullText and nullText <> "" then
            error "fnGroupConcat: ใส่ KeepNulls = true คู่กับ NullText ที่ไม่ใช่ข้อความว่าง สองตัวนี้สั่งเรื่องเดียวกัน เลือกอย่างใดอย่างหนึ่ง (แนะนำใช้ NullText อย่างเดียว)"
        else if not List.IsEmpty(List.Intersect({GroupBy, ConcatColumns})) then
            error "fnGroupConcat: คอลัมน์ " & Text.Combine(List.Intersect({GroupBy, ConcatColumns}), ", ") & " อยู่ทั้งในกลุ่มและในรายการที่จะต่อกัน เลือกอย่างใดอย่างหนึ่ง"
        else Source,

    // ---- แปลงค่าเป็นข้อความให้อ่านรู้เรื่อง (ตัวเลขและวันที่ไม่ให้ออกมาเพี้ยนตามเครื่อง) ----
    ToText = (v as any) as nullable text =>
        if v = null then null
        else if v is text then v
        else if v is number then (if numFmt = null then Text.From(v) else Number.ToText(v, numFmt, "en-US"))
        else if v is date then Date.ToText(v, [Format = dateFmt, Culture = "en-US"])
        else if v is datetime then Date.ToText(Date.From(v), [Format = dateFmt, Culture = "en-US"])
        else if v is logical then (if v then "TRUE" else "FALSE")
        else Text.From(v),

    // ---- ยุบแถวในกลุ่ม: ถ้าระบุ DistinctBy ให้รวมแถวที่คีย์ซ้ำ (SumColumns บวกกัน คอลัมน์อื่นเอาค่าแรก) ----
    Collapse = (t as table) as table =>
        let
            // ‼️ ต้อง Table.Buffer ไม่งั้น Table.Group ที่ตามมาทำให้ลำดับที่เพิ่งเรียงหายไป (engine ตัด sort ทิ้ง)
            sorted = if List.IsEmpty(sortBy) then t else Table.Buffer(Table.Sort(t, sortBy)),
            result =
                if List.IsEmpty(distinctBy) then sorted
                else
                    Table.Group(
                        sorted, distinctBy,
                        {{"__g", (sub as table) as record =>
                            List.Accumulate(sumCols, Table.First(sub), (rec, c) =>
                                Record.TransformFields(rec, {{c, each List.Sum(List.RemoveNulls(Table.Column(sub, c)))}})),
                          type record}},
                        GroupKind.Global
                    )
        in
            if List.IsEmpty(distinctBy) then result
            else Table.FromRecords(Table.Column(result, "__g")),

    // ---- ต่อข้อความของคอลัมน์เดียว ----
    ConcatOne = (t as table, col as text) as nullable text =>
        let
            raw     = Table.Column(t, col),
            texts   = List.Transform(raw, ToText),
            allNull = List.IsEmpty(List.RemoveNulls(texts)),
            kept =
                // NullText = null คือสั่งทิ้งตรง ๆ (พฤติกรรมก่อน 14/09, ตำแหน่งจะเลื่อน ต้องตั้งใจเอง)
                if nullText = null then List.RemoveNulls(texts)
                // ไม่ได้สั่งอะไรมา + ต่อคอลัมน์เดียว = ไม่มีอะไรให้เทียบตำแหน่ง ทิ้งเพื่อให้อ่านสะอาด
                else if not explicitNull and not alignRows then List.RemoveNulls(texts)
                // ไม่ได้สั่งอะไรมา + ทั้งกลุ่มว่างหมด = คืน null ไปเลย ไม่ใช่ "(ว่าง), (ว่าง)" ที่ไม่ได้ความ
                else if not explicitNull and allNull then {}
                // ‼️ หัวใจ: ต่อหลายคอลัมน์ ต้องมีตัวแทนของแถวว่าง ไม่งั้นตำแหน่งเลื่อน
                else List.Transform(texts, each _ ?? nullText)
        in
            if List.IsEmpty(kept) then null else Text.Combine(kept, sep),

    // ---- ลงมือ ----
    Grouped = Table.Group(Checked, GroupBy, {{"__rows", each _, type table}}),
    Collapsed = Table.AddColumn(Grouped, "__c", each Collapse([__rows]), type table),

    WithConcat = List.Accumulate(ConcatColumns, Collapsed, (t, c) =>
        Table.AddColumn(t, c, each ConcatOne([__c], c), type nullable text)),

    WithFirst = List.Accumulate(firstCols, WithConcat, (t, c) =>
        Table.AddColumn(t, c, each Table.Column(Table.FirstN([__rows], 1), c){0})),

    WithTotals = List.Accumulate(totalCols, WithFirst, (t, c) =>
        Table.AddColumn(t, "รวม " & c, each List.Sum(List.RemoveNulls(Table.Column([__rows], c))), type nullable number)),

    WithCount = if countCol = null then WithTotals
                else Table.AddColumn(WithTotals, countCol, each Table.RowCount([__rows]), Int64.Type),

    WithDCount = if dcountCol = null then WithCount
                 else Table.AddColumn(WithCount, dcountCol, each Table.RowCount([__c]), Int64.Type),

    Final = Table.RemoveColumns(WithDCount, {"__rows", "__c"})
in
    Final
