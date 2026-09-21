// ── ใส่รหัสผ่านให้ไฟล์ PDF ─────────────────────────────────────────────────
// ‼️ นี่คือเครื่องมือที่ "เว็บทำงานในเครื่อง" ได้เปรียบที่สุดในบรรดาทั้ง 53 ตัว
//   เพราะการเอาไฟล์ลับไปอัปโหลดขึ้นเซิร์ฟเวอร์คนอื่นเพื่อใส่รหัส เป็นเรื่องย้อนแย้งในตัวเอง
//   (วัดมาแล้ว 21/09/2026: Adobe, PDF2Go, Sejda, Soda PDF มีเครื่องมือนี้ทุกเจ้า
//    และทุกเจ้าประมวลผลบนเซิร์ฟเวอร์ · Soda เขียนเองใต้กล่องว่าไฟล์อยู่บนเครื่องเขา 24 ชั่วโมง)
//
// ‼️ ทำได้เพราะเฟส 0 เปลี่ยนไลบรารีเป็น @cantoo/pdf-lib ซึ่งมี doc.encrypt()
//   บันทึกเก่าของโปรเจกต์เคยเขียนว่าต้องใช้ qpdf-wasm หรือ mupdf ซึ่ง **ผิด**
//   พิสูจน์แล้วด้วยมือ: AES 256 บิต (Standard V5 R6), 202 ms ต่อไฟล์บนหน้าเว็บจริง
//   PyMuPDF ยืนยันอิสระว่าล็อกจริง รหัสผิดเปิดไม่ได้ และรหัสภาษาไทยใช้ได้
//
// ‼️ กฎเหล็กของไฟล์นี้: **ห้ามเก็บรหัสผ่านลงที่ไหนทั้งสิ้น**
//   ไม่ใส่ stateKit ไม่ใส่ localStorage ไม่ใส่ลิงก์แชร์ ไม่ใส่ชื่อไฟล์ผลลัพธ์
//   เครื่องมืออื่นในเว็บนี้จำค่าที่ตั้งไว้ให้ผู้ใช้ แต่ตัวนี้ต้องไม่จำ
//   (กฎเดียวกับ feedback_never_store_credentials ที่ออกมาหลังเคสบัญชีถูกแฮ็ก 26/07/2026)
import { loadPdfLib, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton,
         stripExt, yieldToBrowser, fmtBytes, failedBox } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

/* สิทธิ์ที่ผู้ใช้เลือกได้ ค่าเริ่มต้นคือ "อนุญาตทุกอย่าง" เพราะคนส่วนใหญ่
   ต้องการแค่รหัสเปิดไฟล์ ไม่ได้ต้องการห้ามอะไร และการห้ามโดยไม่ตั้งใจสร้างปัญหามากกว่า */
const PERMS = [
  ["printing", () => tr("สั่งพิมพ์", "Printing")],
  ["copying", () => tr("คัดลอกข้อความและรูป", "Copying text and images")],
  ["modifying", () => tr("แก้ไขเนื้อหา", "Editing the content")],
  ["fillingForms", () => tr("กรอกฟอร์ม", "Filling in forms")],
  ["annotating", () => tr("ใส่คอมเมนต์", "Adding comments")],
];

const STYLE = `
.pt-stage{display:flex;flex-direction:column;gap:14px;margin:auto;width:100%;max-width:420px;text-align:center}
.pt-stage[hidden]{display:none}
.pt-lock{width:64px;height:64px;margin:0 auto;border-radius:18px;display:grid;place-items:center;
  background:color-mix(in srgb,var(--g-pdf) 14%,transparent);color:var(--g-pdf)}
.pt-lock svg{width:32px;height:32px}
.pt-files{font-size:13.5px;color:var(--text-dim);line-height:1.6}
.pt-files b{color:var(--text)}
.pt-pw-row{display:flex;gap:6px;align-items:stretch}
.pt-pw-row input{flex:1 1 auto;min-width:0}
.pt-eye{flex:none;min-height:40px;padding-inline:12px}
.pt-warn{border:1px solid var(--line);border-left:3px solid #b8860b;border-radius:var(--r-sm);
  background:color-mix(in srgb,#b8860b 7%,transparent);padding:10px 12px;font-size:13px;line-height:1.6;text-align:start}
.pt-warn + .pt-warn{margin-top:8px}
.pt-more{margin-top:4px}
.pt-more > summary{cursor:pointer;font-size:13.5px;color:var(--brand-text);padding:6px 0;min-height:36px;
  display:flex;align-items:center}
.pt-perm{display:flex;align-items:center;gap:9px;min-height:36px;font-size:14px;line-height:1.5;cursor:pointer}
.pt-perm input{width:17px;height:17px;flex:none;accent-color:var(--g-pdf)}
.pt-hint{font-size:12.5px;color:var(--text-mute);line-height:1.6;margin-top:6px}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  /* ‼️ ช่องรหัสไม่มี autocomplete และไม่มี name เพื่อไม่ให้ตัวจัดการรหัสผ่านของเบราว์เซอร์
     เสนอบันทึกรหัสนี้ไว้ มันไม่ใช่รหัสของเว็บเรา เป็นรหัสที่ผู้ใช้ตั้งให้ไฟล์ของเขาเอง */
  const pw = el("input", { type: "password", autocomplete: "new-password",
    placeholder: tr("ตั้งรหัสสำหรับเปิดไฟล์", "Set a password to open the file") });
  const owner = el("input", { type: "password", autocomplete: "new-password",
    placeholder: tr("ไม่ใส่ก็ได้", "Optional") });

  const eye = button(tr("ดู", "Show"), { ghost: true, onclick: () => {
    const showing = pw.type === "text";
    pw.type = owner.type = showing ? "password" : "text";
    eye.textContent = showing ? tr("ดู", "Show") : tr("ซ่อน", "Hide");
    eye.setAttribute("aria-label", showing
      ? tr("แสดงรหัสผ่านที่พิมพ์ไว้", "Show the password")
      : tr("ซ่อนรหัสผ่านที่พิมพ์ไว้", "Hide the password"));
  } });
  eye.classList.add("pt-eye");
  eye.setAttribute("aria-label", tr("แสดงรหัสผ่านที่พิมพ์ไว้", "Show the password"));

  const permBoxes = PERMS.map(([key, label]) => {
    const input = el("input", { type: "checkbox", checked: true });
    return { key, node: el("label", { class: "pt-perm" }, [input, el("span", {}, label())]), input };
  });

  const go = button(tr("ใส่รหัส", "Protect"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: true,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ใส่ได้หลายไฟล์ ใช้รหัสเดียวกันทั้งชุด", "Several files at once, all get the same password"),
    onChange: onFiles,
  });

  const lockIco = el("div", { class: "pt-lock", "aria-hidden": "true" });
  lockIco.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  const filesLine = el("div", { class: "pt-files" });
  const stage = el("div", { class: "pt-stage", hidden: true }, [lockIco, filesLine]);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "Files"), node: dz.container },
    right: { title: tr("ตั้งรหัส", "Password"), node: el("div", {}, [
      field(tr("รหัสสำหรับเปิดไฟล์", "Password to open the file"),
            el("div", { class: "pt-pw-row" }, [pw, eye])),
      el("div", { class: "pt-warn" },
         tr("ลืมรหัสแล้วกู้ไม่ได้ เพราะไฟล์ไม่เคยออกจากเครื่องคุณ เว็บนี้ไม่มีสำเนารหัสไว้ที่ไหน",
            "If you forget it, nobody can recover it. The file never leaves your device and this site keeps no copy of the password anywhere")),
      el("details", { class: "pt-more" }, [
        el("summary", {}, tr("ตัวเลือกเพิ่มเติม", "More options")),
        el("div", {}, [
          el("div", { class: "pt-hint" },
             tr("สิ่งที่คนเปิดไฟล์ได้ ยังทำได้อยู่", "What someone who opens the file may still do")),
          ...permBoxes.map((p) => p.node),
          el("div", { class: "pt-warn" },
             tr("สิทธิ์พวกนี้เป็นคำขอที่ฝากไว้ในไฟล์ โปรแกรมอ่านบางตัวไม่ทำตาม ของลับจริงอย่าส่งออกไปเลยดีกว่า",
                "These are requests stored in the file, and some readers ignore them. For truly secret content, do not send the file")),
          field(tr("รหัสเจ้าของเอกสาร", "Owner password"), owner,
                tr("ใช้ปลดข้อจำกัดข้างบน ไม่ใส่ = สุ่มรหัสที่ไม่มีใครรู้ให้ ข้อห้ามจะได้มีผลจริง",
                   "Lifts the limits above. Left empty, a random password nobody knows is used, so the limits hold")),
        ]),
      ]),
    ]) },
    center: { node: stage, empty: tr("เลือกไฟล์ PDF ที่อยากใส่รหัส", "Choose the PDF files you want to protect") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let files = [];

  function refresh() {
    const n = files.length;
    go.disabled = !n || !pw.value;
    if (!n) { stage.hidden = true; ws.showCanvas(false); return; }
    stage.hidden = false;
    ws.showCanvas(true);
    filesLine.replaceChildren(
      el("b", {}, tr(`${n} ไฟล์พร้อมใส่รหัส`, `${pl(n, "file", "files")} ready to protect`)),
      el("div", {}, pw.value
        ? tr("กดปุ่มด้านล่างเพื่อใส่รหัส ไฟล์ต้นฉบับของคุณไม่ถูกแตะต้อง",
             "Press the button below. Your original files are left untouched")
        : tr("พิมพ์รหัสในแผงด้านขวาก่อน", "Type a password in the panel on the right first")),
    );
  }

  function onFiles() {
    files = dz.files.slice();
    results.innerHTML = "";
    st.clear();
    refresh();
  }
  pw.oninput = refresh;
  pw.onkeydown = (e) => { if (e.key === "Enter" && !go.disabled) run(); };

  async function run() {
    if (!files.length) return st.err(tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF file first"));
    if (!pw.value) return st.err(tr("พิมพ์รหัสผ่านก่อน", "Type a password first"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();

    /* เก็บสิทธิ์ที่ผู้ใช้ "ไม่ติ๊ก" เป็นข้อห้าม
       ‼️ printing ของไลบรารีรับค่าเป็นสตริง ไม่ใช่ true/false
          "highResolution" = พิมพ์ได้เต็มคุณภาพ · false = ห้ามพิมพ์ */
    const picked = Object.fromEntries(permBoxes.map((p) => [p.key, p.input.checked]));
    const restricting = permBoxes.some((p) => !p.input.checked);
    const permissions = {
      printing: picked.printing ? "highResolution" : false,
      copying: picked.copying,
      modifying: picked.modifying,
      fillingForms: picked.fillingForms,
      annotating: picked.annotating,
    };

    /* ‼️ รหัสเจ้าของต้องไม่เท่ากับรหัสผู้ใช้ ถ้ามีการห้ามอะไรไว้ (จับได้จากเทส 21/09/2026)
     * มาตรฐาน PDF ให้คนที่เปิดไฟล์ด้วย "รหัสเจ้าของ" ทำได้ทุกอย่างโดยไม่สนข้อจำกัด
     * ถ้าเราตั้งสองรหัสเท่ากัน คนที่รู้รหัสเปิดไฟล์ก็กลายเป็นเจ้าของทันที
     * แล้วข้อห้ามที่ผู้ใช้ตั้งไว้จะไม่มีผลเลย (วัดจริง: ปิดคัดลอกแล้ว PyMuPDF ยังคัดลอกได้)
     * เมื่อผู้ใช้ไม่ได้ตั้งรหัสเจ้าของเอง จึงสุ่มรหัสที่ไม่มีใครรู้ รวมทั้งตัวเราเอง
     * ผลคือไม่มีใครปลดข้อจำกัดได้ ซึ่งตรงกับเจตนาของคนที่ติ๊กออก
     * ถ้าไม่ได้ห้ามอะไรเลย ใช้รหัสเดียวกันได้ ไม่มีอะไรต้องบังคับ */
    const ownerPw = owner.value
      || (restricting
          ? [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("")
          : pw.value);

    const failed = [];
    let done = 0;
    try {
      for (const file of files) {
        if (st.cancelled) break;
        try {
          const { doc } = await loadPdfLib(file);
          await doc.encrypt({
            userPassword: pw.value,
            ownerPassword: ownerPw,
            permissions,
          });
          const blob = new Blob([await doc.save()], { type: "application/pdf" });
          /* ‼️ ชื่อไฟล์ห้ามมีรหัสผ่านเด็ดขาด ชื่อไฟล์ติดไปกับไฟล์ตลอดชีวิตของมัน */
          const name = stripExt(file.name) + tr("-ใส่รหัส.pdf", "-protected.pdf");
          results.appendChild(el("div", { class: "result" }, [
            el("div", { class: "r-name" }, [el("strong", {}, name),
              el("small", {}, tr(`${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`,
                                 `${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`))]),
            downloadButton(blob, name),
          ]));
          done++;
        } catch (e) {
          failed.push({ name: file.name, reason: friendlyPdfError(e, file.name).message });
        }
        const seen = done + failed.length;
        st.progress((seen / files.length) * 100, `(${seen}/${files.length})`);
        await yieldToBrowser();
      }
      st.end();
      st.progress(null);
      if (failed.length) results.appendChild(failedBox(failed));
      if (!done) st.err(tr("ใส่รหัสไม่สำเร็จสักไฟล์", "Couldn't protect any file"));
      else st.ok(st.cancelled
        ? tr(`หยุดตามที่สั่งแล้ว ใส่รหัสไปแล้ว ${done} ไฟล์`, `Stopped as asked, ${pl(done, "file", "files")} protected`)
        : tr(`ใส่รหัสให้ ${done} ไฟล์แล้ว เปิดไฟล์ครั้งหน้าต้องใช้รหัสนี้`,
             `Protected ${pl(done, "file", "files")}. The password is needed to open them from now on`));
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(friendlyPdfError(e, files[0] && files[0].name).message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
