// ── ปลดรหัสผ่านออกจากไฟล์ PDF ──────────────────────────────────────────────
// คู่แฝดของ pdf-protect · คนที่ใส่รหัสไว้แล้วอยากเอาออก หรือได้ไฟล์ที่ล็อกมาจากที่อื่น
// แล้วต้องมานั่งพิมพ์รหัสทุกครั้งที่เปิด
//
// ‼️ เครื่องมือนี้ **ไม่เจาะรหัส** ต้องรู้รหัสถึงจะปลดได้ และเขียนบอกไว้บนหน้าตรง ๆ
//   ไม่มีการเดา ไม่มีการไล่ลองรหัส เพราะนั่นคือเครื่องมือคนละชนิดกันและเราจะไม่ทำ
//
// ‼️ ไฟล์ PDF ที่ล็อกมี 2 แบบ ซึ่งผู้ใช้แยกไม่ออกจากหน้าตา แต่ต่างกันมาก (พิสูจน์ 21/09/2026)
//   ① ล็อกการเปิด   ต้องพิมพ์รหัสก่อนถึงจะเห็นเนื้อหา  → ต้องรู้รหัส
//   ② ล็อกแค่สิทธิ์  เปิดอ่านได้เลย แต่ห้ามคัดลอกหรือพิมพ์ → ปลดได้โดยไม่ต้องรู้รหัส
//      (ไลบรารีรับรหัสเป็นสตริงว่างแล้วเปิดได้ ซึ่งเป็นพฤติกรรมตามมาตรฐาน PDF
//       เพราะไฟล์แบบนี้ "รหัสผู้ใช้ว่าง" อยู่แล้ว ข้อจำกัดจึงเป็นแค่คำขอที่ฝากไว้ในไฟล์)
//   เราจัดการทั้งสองแบบ แต่ **บอกผู้ใช้ให้รู้ว่าไฟล์ที่เขาถืออยู่เป็นแบบไหน** ไม่ทำเงียบ ๆ
import { friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton,
         stripExt, yieldToBrowser, fmtBytes, failedBox } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

const STYLE = `
.pu-stage{display:flex;flex-direction:column;gap:14px;margin:auto;width:100%;max-width:440px;text-align:center}
.pu-stage[hidden]{display:none}
.pu-ico{width:64px;height:64px;margin:0 auto;border-radius:18px;display:grid;place-items:center;
  background:color-mix(in srgb,var(--g-pdf) 14%,transparent);color:var(--g-pdf)}
.pu-ico svg{width:32px;height:32px}
.pu-files{font-size:13.5px;color:var(--text-dim);line-height:1.6}
.pu-files b{color:var(--text)}
.pu-kinds{display:flex;flex-direction:column;gap:6px;margin-top:6px;text-align:start}
.pu-kind{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.6;
  border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 10px}
.pu-kind b{font-weight:600}
.pu-dot{flex:none;width:8px;height:8px;border-radius:50%;margin-top:7px}
.pu-dot.need{background:#b8860b}
.pu-dot.free{background:#2f6b4f}
.pu-pw-row{display:flex;gap:6px;align-items:stretch}
.pu-pw-row input{flex:1 1 auto;min-width:0}
.pu-eye{flex:none;min-height:40px;padding-inline:12px}
.pu-note{border:1px solid var(--line);border-left:3px solid var(--g-pdf);border-radius:var(--r-sm);
  padding:10px 12px;font-size:13px;line-height:1.6;text-align:start;
  background:color-mix(in srgb,var(--g-pdf) 6%,transparent)}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  /* ‼️ ไม่เก็บรหัสไว้ที่ไหนเลย กฎเดียวกับ pdf-protect */
  const pw = el("input", { type: "password", autocomplete: "off",
    placeholder: tr("รหัสที่ใช้เปิดไฟล์นี้", "The password that opens this file") });
  const eye = button(tr("ดู", "Show"), { ghost: true, onclick: () => {
    const showing = pw.type === "text";
    pw.type = showing ? "password" : "text";
    eye.textContent = showing ? tr("ดู", "Show") : tr("ซ่อน", "Hide");
  } });
  eye.classList.add("pu-eye");
  eye.setAttribute("aria-label", tr("แสดงรหัสผ่านที่พิมพ์ไว้", "Show the password"));

  const go = button(tr("ปลดรหัส", "Remove password"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: true,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ใส่ได้หลายไฟล์ ถ้าใช้รหัสเดียวกัน", "Several files at once if they share a password"),
    onChange: onFiles,
  });

  const ico = el("div", { class: "pu-ico", "aria-hidden": "true" });
  ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.6-2"/></svg>';
  const filesLine = el("div", { class: "pu-files" });
  const stage = el("div", { class: "pu-stage", hidden: true }, [ico, filesLine]);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "Files"), node: dz.container },
    right: { title: tr("รหัสของไฟล์", "The file's password"), node: el("div", {}, [
      field(tr("รหัสผ่าน", "Password"), el("div", { class: "pu-pw-row" }, [pw, eye]),
            tr("ไม่ต้องใส่ ถ้าไฟล์เปิดอ่านได้อยู่แล้วแต่ห้ามคัดลอก",
               "Leave it empty if the file already opens but blocks copying")),
      el("div", { class: "pu-note" },
         tr("เครื่องมือนี้ไม่เจาะรหัส ต้องรู้รหัสที่ถูกต้องจึงจะปลดได้ ถ้าลืมรหัสแล้วก็ช่วยอะไรไม่ได้จริง ๆ",
            "This tool does not crack passwords. You need the correct one. If it is forgotten, nothing here can help")),
      el("div", { class: "pu-kinds" }, [
        el("div", { class: "pu-kind" }, [
          el("span", { class: "pu-dot need" }),
          el("div", {}, [el("b", {}, tr("ล็อกการเปิด", "Locked for opening")), " ",
            tr("ต้องพิมพ์รหัสก่อนถึงจะเห็นเนื้อหา ใส่รหัสในช่องด้านบน",
               "The password is required before the content shows. Type it in the box above")]),
        ]),
        el("div", { class: "pu-kind" }, [
          el("span", { class: "pu-dot free" }),
          el("div", {}, [el("b", {}, tr("ล็อกแค่สิทธิ์", "Restricted only")), " ",
            tr("เปิดอ่านได้เลยแต่ห้ามคัดลอกหรือสั่งพิมพ์ แบบนี้ปลดได้โดยไม่ต้องใช้รหัส",
               "It opens fine but blocks copying or printing. This kind is removed without a password")]),
        ]),
      ]),
    ]) },
    center: { node: stage, empty: tr("เลือกไฟล์ PDF ที่ติดรหัสอยู่", "Choose the PDF files that are locked") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let files = [];

  function refresh() {
    const n = files.length;
    go.disabled = !n;
    if (!n) { stage.hidden = true; ws.showCanvas(false); return; }
    stage.hidden = false;
    ws.showCanvas(true);
    filesLine.replaceChildren(
      el("b", {}, tr(`${n} ไฟล์`, `${pl(n, "file", "files")}`)),
      el("div", {}, tr("กดปุ่มด้านล่างได้เลย ถ้าไฟล์ต้องใช้รหัสแล้วยังไม่ได้ใส่ ฟ้าจะบอกให้ทราบ",
                       "Press the button below. If a file needs a password you have not typed yet, you will be told")),
    );
  }

  function onFiles() {
    files = dz.files.slice();
    results.innerHTML = "";
    st.clear();
    refresh();
  }
  pw.onkeydown = (e) => { if (e.key === "Enter" && !go.disabled) run(); };

  /** เปิดไฟล์ให้ได้ แล้วบอกว่ามันล็อกแบบไหน
   * ‼️ ลำดับสำคัญ: ลองรหัสว่างก่อนเสมอ เพราะไฟล์ "ล็อกแค่สิทธิ์" มีรหัสผู้ใช้ว่างอยู่แล้ว
   *   ถ้าลองรหัสที่ผู้ใช้พิมพ์ก่อน ไฟล์แบบนั้นจะถูกปฏิเสธทั้งที่จริง ๆ เปิดได้ */
  async function openAny(file) {
    const { PDFDocument } = PDFLib;
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const doc = await PDFDocument.load(bytes, { password: "" });
      return { doc, kind: "restricted" };
    } catch { /* ล็อกการเปิดจริง ต้องใช้รหัสของผู้ใช้ */ }
    if (!pw.value) {
      const e = new Error(tr("ไฟล์นี้ล็อกการเปิด ต้องใส่รหัสในแผงด้านขวาก่อน",
                             "This file is locked for opening, type its password in the panel on the right first"));
      e.needsPassword = true;
      throw e;
    }
    try {
      const doc = await PDFDocument.load(bytes, { password: pw.value });
      return { doc, kind: "opened" };
    } catch (e) {
      if (/password/i.test(String(e && e.message)))
        throw new Error(tr("รหัสไม่ถูกต้องสำหรับไฟล์นี้", "That password is not right for this file"));
      throw e;
    }
  }

  async function run() {
    if (!files.length) return st.err(tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF file first"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();

    const failed = [];
    let done = 0, restricted = 0, needPw = 0;
    try {
      for (const file of files) {
        if (st.cancelled) break;
        try {
          const { doc, kind } = await openAny(file);
          if (kind === "restricted") restricted++;
          const blob = new Blob([await doc.save()], { type: "application/pdf" });
          const name = stripExt(file.name) + tr("-ปลดรหัส.pdf", "-unlocked.pdf");
          results.appendChild(el("div", { class: "result" }, [
            el("div", { class: "r-name" }, [el("strong", {}, name),
              el("small", {}, kind === "restricted"
                ? tr("ไฟล์นี้ล็อกแค่สิทธิ์ ตอนนี้คัดลอกและสั่งพิมพ์ได้แล้ว",
                     "This file was restricted only, copying and printing now work")
                : tr(`ปลดรหัสแล้ว ${fmtBytes(blob.size)}`, `Password removed, ${fmtBytes(blob.size)}`))]),
            downloadButton(blob, name),
          ]));
          done++;
        } catch (e) {
          if (e && e.needsPassword) needPw++;
          failed.push({ name: file.name,
                        reason: (e && e.needsPassword) ? e.message : friendlyPdfError(e, file.name).message });
        }
        const seen = done + failed.length;
        st.progress((seen / files.length) * 100, `(${seen}/${files.length})`);
        await yieldToBrowser();
      }
      st.end();
      st.progress(null);
      if (failed.length) results.appendChild(failedBox(failed));
      if (!done) {
        st.err(needPw
          ? tr("ยังปลดไม่ได้ ต้องใส่รหัสของไฟล์ก่อน", "Not unlocked yet, the file's password is needed first")
          : tr("ปลดรหัสไม่สำเร็จสักไฟล์", "Couldn't unlock any file"));
      } else {
        const extra = restricted
          ? tr(` (${restricted} ไฟล์ล็อกแค่สิทธิ์ ไม่ได้ล็อกการเปิด)`,
               ` (${restricted} of them were restricted only, not locked for opening)`)
          : "";
        st.ok(tr(`ปลดรหัสให้ ${done} ไฟล์แล้ว เปิดได้เลยไม่ต้องใช้รหัสอีก`,
                 `Unlocked ${pl(done, "file", "files")}. They open with no password now`) + extra);
      }
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
