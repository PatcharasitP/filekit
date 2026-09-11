// ============================================================================
//  fnMultiSourceFallbackLookup  (v1 — 2026-08-23)
//  ไล่หา code จาก "หลายแหล่ง" ตามลำดับความสำคัญ — แต่ละแหล่งมี key กี่ชั้นก็ได้
//  คืน payload ที่ map ชื่อคอลัมน์ให้ลงช่องเดียวกันได้แม้ต้นทางคนละชื่อ
//  ----------------------------------------------------------------------------
//  ต่างจาก fnFallbackLookup ยังไง:
//    fnFallbackLookup = 1 ตาราง lookup, key หลายชั้น
//    fnMultiSourceFallbackLookup = หลายตาราง lookup (cascade), แต่ละตารางมี key หลายชั้นได้
//      + Match_Source บอกชื่อแหล่ง (ตั้ง label ไดนามิกจากคอลัมน์ในแถวที่ match ได้)
//      + Payload เป็น record map: ผลลัพธ์ชื่อเดียว ↔ ชื่อคอลัมน์ต้นทางที่ต่างกันในแต่ละแหล่ง
//
//  PERFORMANCE (รองรับล้านแถว — ยึดบทเรียน fnFallbackLookup v3):
//    • dict = Record.FromList → hash lookup O(1)/code · เก็บ dict ทุกชั้นใน "record"
//      (M memoize record field = build ครั้งเดียวแน่นอน)
//      ‼️ ห้ามเก็บ dict ใน list จาก List.Transform — M ไม่ memoize สมาชิก list
//         = rebuild ทุกแถว ช้าระดับแสนเท่า (บั๊กจริงที่ฆ่า fnCascadeLookup 23/07)
//    • SelectColumns เหลือ key+payload ก่อน Table.Buffer → เบา RAM/เร็วขึ้นมาก
//    • scan ตารางต้นทางรอบเดียว (เทียบกับเรียก fnFallbackLookup ซ้ำ = scan หลายรอบ)
//    • short-circuit: เจอแหล่งไหนแล้วหยุด ไม่แตะ dict แหล่งถัดไป (List.First + lazy)
//
//  พารามิเตอร์
//    Source      : ตารางต้นทาง
//    CodeColumn  : ชื่อคอลัมน์ code (1 เซลล์มีหลาย code คั่น Separator ได้)
//    Sources     : list ของ record เรียงตามลำดับความสำคัญ — แต่ละ record:
//        [ Name    = "Latest Contract",              // ชื่อแหล่ง (ค่า default ของ Match_Source)
//          Table   = #"Latest Contract",             // ตาราง lookup
//          Keys    = {"รหัสสถานี", "รหัสสถานีเดิม"}, // key เรียงตามลำดับ กี่ชั้นก็ได้
//          Payload = [ Company = "Company",          // ชื่อผลลัพธ์ = ชื่อคอลัมน์ในตารางนี้
//                      #"SITE OWNER" = "SITE OWNER" ],
//          Label   = each "Site Rental - " & [Type]  // (optional) label ไดนามิกจากแถวที่ match
//                                                    //   ใช้คอลัมน์ไหนก็ได้ใน Table ของแหล่งนั้น
//        ]
//    Options     : (optional) record ตั้งค่า
//        [ Separator    = ",",      // ตัวคั่น code (default ",")
//          KeepPerSource = false,   // true = เพิ่มคอลัมน์ payload แยกรายแหล่ง "<ผลลัพธ์> (<Name>)"
//          NotFound     = "ไม่พบ",  // ค่า Match_Via/Match_Source เมื่อไม่เจอ
//          CodeName     = "Matched_Code", ViaName = "Match_Via", SourceName = "Match_Source" ]
//
//  ผลลัพธ์: คอลัมน์เดิมทั้งหมด + Matched_Code (code ที่ชนได้) + Match_Via (ชื่อคอลัมน์ key ที่เจอ)
//           + Match_Source (ชื่อ/label แหล่งที่เจอ) + payload ตาม Payload map
//           (+ payload รายแหล่ง ถ้า KeepPerSource = true)
//  ‼️ ชื่อผลลัพธ์ทั้งหมดห้ามซ้ำกับคอลัมน์ที่มีอยู่ใน Source (ฟังก์ชันเช็คให้ error ดัง ๆ)
// ============================================================================
(
    Source as table,
    CodeColumn as text,
    Sources as list,
    optional Options as nullable record
) as table =>
let
    opt        = Options ?? [],
    sep        = Record.FieldOrDefault(opt, "Separator", ","),
    keepPer    = Record.FieldOrDefault(opt, "KeepPerSource", false),
    notFound   = Record.FieldOrDefault(opt, "NotFound", "ไม่พบ"),
    codeName   = Record.FieldOrDefault(opt, "CodeName", "Matched_Code"),
    viaName    = Record.FieldOrDefault(opt, "ViaName", "Match_Via"),
    sourceName = Record.FieldOrDefault(opt, "SourceName", "Match_Source"),

    // ---- ด่านตรวจ: พิมพ์ผิด/ลืมคอลัมน์ = error ดัง ๆ ตั้งแต่ต้น ไม่ใช่ null เงียบ ๆ ----
    assertCols = (t as table, cols as list, where as text) as logical =>
        let missing = List.RemoveItems(cols, Table.ColumnNames(t))
        in  if missing = {} then true
            else error Error.Record("ColumnNotFound", "ไม่พบคอลัมน์ใน " & where,
                    [Missing = Text.Combine(List.Transform(missing, each try Text.From(_) otherwise "(ไม่ใช่ text)"), ", ")]),
    okSrc = assertCols(Source, {CodeColumn}, "Source"),

    // ผลลัพธ์ payload ทั้งหมด (union ของทุกแหล่ง เรียงตามที่พบครั้งแรก)
    payloadNames = List.Distinct(List.Combine(List.Transform(Sources, each Record.FieldNames(_[Payload])))),
    // นิยามคอลัมน์ payload รายแหล่ง (โหมด KeepPerSource) — เก็บเป็น record ไม่ต้อง parse ชื่อกลับ
    perDefs      = if not keepPer then {}
                   else List.Combine(List.Transform(Sources, (s) =>
                          List.Transform(Record.FieldNames(s[Payload]),
                            (pn) => [Col = pn & " (" & s[Name] & ")", Payload = pn, Src = s[Name]]))),
    perNames     = List.Transform(perDefs, each _[Col]),
    outNames     = {codeName, viaName, sourceName} & payloadNames & perNames,
    dupCheck = let dup = List.Intersect({Table.ColumnNames(Source), outNames})
               in  if dup = {} then true
                   else error Error.Record("DuplicateColumn",
                          "ชื่อคอลัมน์ผลลัพธ์ซ้ำกับคอลัมน์ที่มีอยู่แล้วใน Source",
                          [Duplicated = Text.Combine(dup, ", ")]),

    // ---- เตรียมแหล่ง: SelectColumns ให้เหลือเท่าที่ใช้ แล้ว Buffer ครั้งเดียว ----
    prep = (s as record) as record =>
        let
            payload   = s[Payload],
            outCols   = Record.FieldNames(payload),
            srcCols   = List.Transform(outCols, each Record.Field(payload, _)),
            labelFn   = Record.FieldOrDefault(s, "Label", null),
            keys      = s[Keys],
            ok        = assertCols(s[Table], List.Distinct(keys & srcCols), "Sources[" & s[Name] & "]"),
            // label ใช้คอลัมน์อะไรก็ได้ในตาราง → ต้องเก็บทั้งแถวไว้ตอนมี Label
            // ‼️ เขียนเป็น "if not ok then error" เพื่อบังคับให้ด่านตรวจถูก evaluate เสมอ
            //    (ถ้าเขียน `labelFn = null and ok` M จะ short-circuit ข้าม ok เมื่อมี Label
            //     แล้ว try ใน mkDict จะกลืน error → คอลัมน์ key พิมพ์ผิดกลายเป็น "ไม่พบ" เงียบ ๆ)
            slim      = if not ok then error "unreachable"
                        else if labelFn = null
                        then Table.SelectColumns(s[Table], List.Distinct(keys & srcCols))
                        else s[Table],
            L         = Table.Buffer(slim),
            // ค่า payload ของ 1 แถว = record ที่ rename ชื่อ source → ชื่อผลลัพธ์แล้ว
            valueOf   = (r as record) as record =>
                          Record.FromList(List.Transform(srcCols, each Record.FieldOrDefault(r, _, null)), outCols),
            mkDict    = (keyCol as text) as record =>
                let
                    withKey  = Table.AddColumn(L, "__k",
                                  each try Text.Upper(Text.Trim(Text.From(Record.Field(_, keyCol) ?? ""))) otherwise "", type text),
                    nonBlank = Table.SelectRows(withKey, each [__k] <> ""),
                    uniq     = Table.Distinct(nonBlank, {"__k"}),
                    recs     = Table.ToRecords(uniq),
                    vals     = List.Transform(recs, each
                                 [ Pl  = valueOf(_),
                                   Lbl = if labelFn = null then s[Name] else Text.From(labelFn(_)) ])
                in
                    Record.FromList(vals, Table.Column(uniq, "__k")),
            // ‼️ dict ทุกชั้นเก็บเป็น field ใน record → M memoize = build ครั้งเดียว/ชั้น
            dicts     = Record.FromList(List.Transform(keys, mkDict), keys)
        in
            [ Name = s[Name], Keys = keys, Dicts = dicts, OutCols = outCols ],

    // ‼️ เช่นเดียวกัน: เก็บแหล่งที่เตรียมแล้วใน record (field = ชื่อแหล่ง) ไม่ใช่ list
    prepped = Record.FromList(List.Transform(Sources, prep), List.Transform(Sources, each _[Name])),
    srcOrder = List.Transform(Sources, each _[Name]),

    blankMain = Record.FromList(List.Repeat({null}, List.Count(payloadNames)), payloadNames),

    // ---- จับคู่ 1 เซลล์: ไล่แหล่ง → ไล่ key ในแหล่ง → ไล่ code · เจอแล้วหยุดทันที ----
    matchOne = (codesText as nullable text) as record =>
        let
            codes = List.Select(
                       List.Transform(
                         Text.Split(Text.Replace(Text.Replace(codesText ?? "", "[", sep), "]", ""), sep),
                         each Text.Upper(Text.Trim(_))),
                       each _ <> ""),
            hit = if codes = {} then null else
                  List.First(
                    List.Select(
                      List.Transform(srcOrder, (sname) =>
                        let p = Record.Field(prepped, sname)
                        in  List.First(
                              List.Select(
                                List.Transform(p[Keys], (kc) =>
                                  let d = Record.Field(p[Dicts], kc),
                                      c = List.First(List.Select(codes, each Record.HasFields(d, {_})), null)
                                  in  if c = null then null
                                      else let e = Record.Field(d, c)
                                           in [Code = c, Via = kc, Src = sname, Lbl = e[Lbl], Pl = e[Pl]]),
                                each _ <> null),
                              null)),
                      each _ <> null),
                    null),
            head = if hit = null
                   then Record.AddField(Record.AddField([], viaName, notFound), sourceName, notFound)
                   else Record.AddField(Record.AddField([], viaName, hit[Via]), sourceName, hit[Lbl]),
            out0 = Record.AddField(head, codeName, if hit = null then null else hit[Code]),
            main = if hit = null then blankMain
                   else Record.FromList(
                          List.Transform(payloadNames, each Record.FieldOrDefault(hit[Pl], _, null)),
                          payloadNames),
            per  = if not keepPer then []
                   else Record.FromList(
                          List.Transform(perDefs, (d) =>
                            if hit <> null and hit[Src] = d[Src]
                            then Record.FieldOrDefault(hit[Pl], d[Payload], null) else null),
                          perNames)
        in
            out0 & main & per,

    Added  = if okSrc and dupCheck
             then Table.AddColumn(Source, "__msl",
                    each matchOne(try Text.From(Record.Field(_, CodeColumn) ?? "") otherwise ""), type record)
             else null,
    Result = Table.ExpandRecordColumn(Added, "__msl", outNames)
in
    Result
