// fnPickDate, เลือกวันที่จากหลายคอลัมน์มาเป็นคอลัมน์ใหม่ 1 คอลัมน์ (มากสุด / น้อยสุด / อันดับรองลงมา)
//
// เกิดจากงานจริง (13/09/2026 พี่ปอนด์): ตาราง RENEW CONTRACT TASK มีคอลัมน์วันที่หลายตัว
// (SUB_BOOKED_DATE, CREATED_DOC_DATE, SUBMIT_LETTER_DATE, SUBMIT_LL_RESPONSE_DATE, SUBMIT_NEGOTIATE_DATE)
// อยากได้ "วันล่าสุด" มาไว้คอลัมน์เดียว และ "วันล่าสุดรองลงมา" อีกคอลัมน์ เอาไปคิด SLA ต่อเอง
//
// ‼️ ฟังก์ชันนี้ทำหน้าที่เดียว คือ "เลือกอันดับ" ไม่แปลงวันที่ให้ (พี่ปอนด์เคาะ 13/09/2026 ให้แยกส่วนงาน)
//    คอลัมน์ที่ส่งมาต้องเป็นวันที่จริงแล้ว ถ้ายังเป็นข้อความให้แปลงด้วย fnToDate ก่อน 1 บรรทัด
//    ข้อดีคือแปลงครั้งเดียวจบ เรียก fnPickDate กี่ชั้นก็ไม่ต้องแปลงซ้ำ (วัดแล้วเร็วกว่าเดิมหลายเท่า)
//
// Usage:
//   fnPickDate(Source, DateColumns, optional Mode, optional Rank, optional FallbackColumn, optional NewColumnName, optional Options)
//
//   Source          ตารางที่จะเติมคอลัมน์ (คอลัมน์เดิมไม่ถูกแตะแม้แต่ตัวเดียว)
//   DateColumns     รายชื่อคอลัมน์วันที่ เช่น {"SUB_BOOKED_DATE", "CREATED_DOC_DATE"} (ต้องเป็นชนิดวันที่แล้ว)
//   Mode            "MAX" (ค่าเริ่มต้น) = มากสุด, "MIN" = น้อยสุด
//   Rank            1 (ค่าเริ่มต้น) = อันดับแรก, 2 = รองลงมา, 3, 4, ... ได้เรื่อย ๆ
//   FallbackColumn  คอลัมน์สำรองเมื่อไม่มีวันที่เลย เช่น "MODIFY_DATE", ไม่ใส่ = คืนค่าว่าง
//   NewColumnName   ชื่อคอลัมน์ผลลัพธ์, ไม่ใส่ = ตั้งให้เอง ("วันที่ล่าสุด" / "วันที่ล่าสุดรองลงมา" / "วันที่แรกสุด")
//   Options         [ CountRepeatedDates = false, FallbackEveryRank = false, SkipTypeCheck = false ]
//
// ‼️ ค่าสำรองใช้กับอันดับ 1 เท่านั้นโดยตั้งใจ (ค่าเริ่มต้น)
//    ถ้าใส่ค่าสำรองให้อันดับ 2 ด้วย ทั้งสองช่องจะได้วันเดียวกัน แล้ว "อันดับ 1 ลบอันดับ 2" จะกลายเป็น 0 วัน
//    ซึ่งอ่านว่า "ทำ 2 ขั้นวันเดียวกัน เร็วมาก" ทั้งที่ความจริงคือ "ไม่มีข้อมูลเลย"
//    (ข้อมูลจริง 103,084 แถว มีเคสนี้ 48,219 แถว = 46.8%), อยากได้จริง ๆ ตั้ง FallbackEveryRank = true
//
// ‼️ วันซ้ำนับเป็นค่าเดียวโดยตั้งใจ (ค่าเริ่มต้น)
//    ระบบต้นทางมักลงวันเดียวกันหลายคอลัมน์ ถ้านับซ้ำ อันดับ 2 จะเท่ากับอันดับ 1
//    (ข้อมูลจริงเป็นแบบนั้น 84.7% ของแถวที่มีวันที่ตั้งแต่ 2 ค่า), อยากนับซ้ำตั้ง CountRepeatedDates = true
//
// Options:
//   CountRepeatedDates  false (ค่าเริ่มต้น) = วันซ้ำนับเป็นค่าเดียว, true = นับทุกคอลัมน์
//   FallbackEveryRank   false (ค่าเริ่มต้น) = ค่าสำรองใช้กับอันดับ 1 เท่านั้น, true = ใช้ทุกอันดับที่หาไม่เจอ
//   SkipTypeCheck       false (ค่าเริ่มต้น) = ตรวจก่อนว่าคอลัมน์เป็นวันที่จริง, true = ข้ามการตรวจ (เร็วขึ้นนิดหน่อยบนตารางใหญ่)
//
// Examples:
//   // แปลงวันที่ก่อน 1 บรรทัด แล้วเลือกอันดับกี่ชั้นก็ได้
//   let
//       Cols   = {"SUB_BOOKED_DATE", "CREATED_DOC_DATE", "SUBMIT_LETTER_DATE"},
//       วันที่  = fnToDate(Source, Cols & {"MODIFY_DATE"}),
//       ล่าสุด  = fnPickDate(วันที่, Cols, "MAX", 1, "MODIFY_DATE"),
//       รองลงมา = fnPickDate(ล่าสุด, Cols, "MAX", 2),
//       แรกสุด  = fnPickDate(รองลงมา, Cols, "MIN", 1)
//   in
//       แรกสุด
(
    Source as table,
    DateColumns as list,
    optional Mode as nullable text,
    optional Rank as nullable number,
    optional FallbackColumn as nullable text,
    optional NewColumnName as nullable text,
    optional Options as nullable record
) as table =>
let
    Opt      = Options ?? [],
    mode     = Text.Upper(Text.Trim(Mode ?? "MAX")),
    rank     = Rank ?? 1,
    dedupe   = not Record.FieldOrDefault(Opt, "CountRepeatedDates", false),
    fbEvery  = Record.FieldOrDefault(Opt, "FallbackEveryRank", false),
    skipType = Record.FieldOrDefault(Opt, "SkipTypeCheck", false),
    cols     = List.Distinct(DateColumns),
    allCols  = if FallbackColumn = null then cols else List.Distinct(cols & {FallbackColumn}),

    // ---- ด่านตรวจ: ผิดตรงไหนบอกตรงนั้น ดีกว่าพังเงียบกลางตาราง ----
    have     = Table.ColumnNames(Source),
    missing  = List.Difference(allCols, have),
    // อ่านแค่ 20 ค่าแรกที่ไม่ว่างต่อคอลัมน์ พอรู้ว่าเป็นวันที่หรือยังเป็นข้อความ (ถูกมาก ไม่กระทบเวลารวม)
    stillText = if skipType then {}
                else List.Select(allCols, (c) =>
                    List.AnyTrue(List.Transform(
                        List.FirstN(List.RemoveNulls(Table.Column(Source, c)), 20),
                        each _ is text))),
    Checked  =
        if List.IsEmpty(cols) then error "fnPickDate: ต้องระบุคอลัมน์วันที่อย่างน้อย 1 คอลัมน์"
        else if not List.IsEmpty(missing) then error "fnPickDate: ไม่พบคอลัมน์ " & Text.Combine(missing, ", ") & " ในตารางที่ส่งมา"
        else if not List.Contains({"MAX", "MIN"}, mode) then error "fnPickDate: Mode ต้องเป็น MAX หรือ MIN (ได้มา " & mode & ")"
        else if rank < 1 or rank <> Number.RoundDown(rank) then error "fnPickDate: Rank ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป"
        else if not List.IsEmpty(stillText) then
            error "fnPickDate: คอลัมน์ " & Text.Combine(stillText, ", ") & " ยังเป็นข้อความอยู่ "
                & "ฟังก์ชันนี้ไม่แปลงวันที่ให้ ใช้ fnToDate แปลงก่อน เช่น fnToDate(Source, {"""
                & Text.Combine(stillText, """, """) & """})"
        else Source,

    // ---- รับเฉพาะชนิดวันที่ (datetime ตัดเวลาให้ ไม่ต้องแปลงเอง) ----
    AsDate = (v as any) as nullable date =>
        if v = null then null
        else if v is date then v
        else if v is datetime then Date.From(v)
        else if v is datetimezone then Date.From(DateTime.From(v))
        else null,

    // ---- เลือกอันดับที่ n โดยไม่เรียงลำดับ (List.Max/List.Min เร็วกว่า List.Sort ต่อแถวมาก) ----
    NthOf = (lst as list, n as number) as nullable date =>
        List.Accumulate(
            {1 .. n},
            [rest = lst, val = null],
            (s, _) =>
                if List.IsEmpty(s[rest]) then [rest = {}, val = null]
                else
                    let
                        m    = if mode = "MAX" then List.Max(s[rest]) else List.Min(s[rest]),
                        next = if dedupe
                               then List.Select(s[rest], each _ <> m)
                               else List.RemoveRange(s[rest], List.PositionOf(s[rest], m), 1)
                    in [rest = next, val = m]
        )[val],

    // ---- ชื่อคอลัมน์ผลลัพธ์ ----
    autoName =
        if mode = "MAX" and rank = 1 then "วันที่ล่าสุด"
        else if mode = "MAX" and rank = 2 then "วันที่ล่าสุดรองลงมา"
        else if mode = "MIN" and rank = 1 then "วันที่แรกสุด"
        else if mode = "MIN" and rank = 2 then "วันที่แรกสุดรองขึ้นมา"
        else "วันที่ " & (if mode = "MAX" then "มากสุด" else "น้อยสุด") & " อันดับ " & Text.From(rank),
    outName  = NewColumnName ?? autoName,
    Final    = if List.Contains(have, outName)
               then error "fnPickDate: ตารางมีคอลัมน์ชื่อ " & outName & " อยู่แล้ว ตั้งชื่อใหม่ด้วย NewColumnName"
               else Checked,

    // ---- เติมคอลัมน์ ----
    Pick = (row as record) as nullable date =>
        let
            vals  = List.RemoveNulls(List.Transform(cols, (c) => AsDate(Record.Field(row, c)))),
            found = if List.IsEmpty(vals) then null else NthOf(vals, rank),
            useFb = FallbackColumn <> null and found = null and (rank = 1 or fbEvery)
        in
            if useFb then AsDate(Record.Field(row, FallbackColumn)) else found,
    Added = Table.AddColumn(Final, outName, Pick, type nullable date)
in
    Added
