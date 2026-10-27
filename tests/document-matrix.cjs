// 실제 ZIP/XML → 추출 → 기준 비교를 연결해 여섯 항목의 성공/실패/검사 불가를 검증합니다.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relationships = (...entries) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
const docxParagraph = (text, runProperties = "", paragraphProperties = "") => `<w:p><w:pPr><w:pStyle w:val="Body"/>${paragraphProperties}</w:pPr><w:r>${runProperties}<w:t>${text}</w:t></w:r></w:p>`;
function docx(body = docxParagraph("서론 결론")) {
  return {
    "word/document.xml": `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${body}</w:body></w:document>`,
    "word/styles.xml": `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:jc w:val="left"/><w:spacing w:line="384"/></w:pPr><w:rPr><w:rFonts w:eastAsia="맑은 고딕" w:ascii="Arial"/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Body"><w:basedOn w:val="Base"/></w:style></w:styles>`
  };
}
function pptx() {
  const shape = (text) => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const wrap = (name, body) => `<p:${name} xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}">${body}</p:${name}>`;
  return {
    "ppt/presentation.xml": wrap("presentation", '<p:sldIdLst><p:sldId id="256" r:id="s1"/><p:sldId id="257" r:id="s2"/></p:sldIdLst>'),
    "ppt/_rels/presentation.xml.rels": relationships(["s1", "slide", "slides/slide1.xml"], ["s2", "slide", "slides/slide2.xml"]),
    "ppt/slides/slide1.xml": wrap("sld", `<p:cSld><p:spTree>${shape("서론 결론")}</p:spTree></p:cSld>`),
    "ppt/slides/slide2.xml": wrap("sld", `<p:cSld><p:spTree>${shape("본문")}</p:spTree></p:cSld>`).replace('<p:sld ', '<p:sld show="0" '),
    "ppt/slides/_rels/slide1.xml.rels": relationships(["layout", "slideLayout", "../slideLayouts/layout.xml"]),
    "ppt/slides/_rels/slide2.xml.rels": relationships(["layout", "slideLayout", "../slideLayouts/layout.xml"]),
    "ppt/slideLayouts/layout.xml": wrap("sldLayout", `<p:cSld><p:spTree>${shape("")}</p:spTree></p:cSld>`),
    "ppt/slideLayouts/_rels/layout.xml.rels": relationships(["master", "slideMaster", "../slideMasters/master.xml"]),
    "ppt/slideMasters/master.xml": wrap("sldMaster", `<p:cSld><p:spTree>${shape("")}</p:spTree></p:cSld><p:txStyles><p:bodyStyle><a:lvl1pPr algn="l"><a:lnSpc><a:spcPct val="160000"/></a:lnSpc><a:defRPr sz="1200"><a:ea typeface="+mn-ea"/><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle></p:txStyles>`),
    "ppt/slideMasters/_rels/master.xml.rels": relationships(["theme", "theme", "../theme/theme.xml"]),
    "ppt/theme/theme.xml": `<a:theme xmlns:a="${a}"><a:themeElements><a:fontScheme><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:font script="Hang" typeface="맑은 고딕"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`
  };
}
const ids = ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words"];
const criteria = { fontFamily: "맑은 고딕", fontSize: 12, alignment: "left", lineSpacing: 160, lengthUnit: "slides", minLength: 2, maxLength: 2, requiredWords: ["서론", "결론"] };
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let checks = 0;
  try {
    const page = await browser.newPage();
    for (const name of ["vendor/jszip.min.js", "document-reader.js", "docx-reader.js", "pptx-styles.js", "pptx-reader.js", "document-inspector.js"]) await page.addScriptTag({ path: path.resolve(__dirname, "../frontend", name) });
    async function extract(files, format) {
      const zip = new JSZip();
      for (const [name, content] of Object.entries(files)) zip.file(name, content);
      return page.evaluate(async ({ bytes, format }) => documentReader.extract(new File([new Uint8Array(bytes)], `sample.${format}`), format), { bytes: [...await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })], format });
    }
    const inspect = (document, selected = ids, settings = criteria) => page.evaluate(({ document, selected, settings }) => documentInspector.inspect(document, selected, settings), { document, selected, settings });
    async function status(document, id, expected, settings = criteria) {
      assert.equal((await inspect(document, [id], settings)).items[0].status, expected, `${document.format} ${id}: ${expected}`);
      checks++;
    }
    for (const format of ["docx", "pptx"]) {
      const document = await extract(format === "docx" ? docx() : pptx(), format);
      for (const id of ids) await status(document, id, format === "docx" && id === "page-count" ? "unknown" : "pass");
      const mismatch = { ...criteria, fontFamily: "바탕", fontSize: 14, alignment: "right", lineSpacing: 150, minLength: 3, maxLength: 4, requiredWords: ["참고문헌"] };
      for (const id of ids) await status(document, id, format === "docx" && id === "page-count" ? "unknown" : "fail", mismatch);
      const unsupported = format === "docx" ? docx(docxParagraph("서론", "", '<w:spacing w:line="300" w:lineRule="exact"/>')) : pptx();
      if (format === "pptx") unsupported["ppt/slideMasters/master.xml"] = unsupported["ppt/slideMasters/master.xml"].replace('<a:spcPct val="160000"/>', '<a:spcPts val="1500"/>');
      await status(await extract(unsupported, format), "line-spacing", "unknown");
      const empty = format === "docx" ? docx(docxParagraph("   ")) : pptx();
      if (format === "pptx") {
        for (const file of ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]) empty[file] = empty[file].replace(/<a:t>.*?<\/a:t>/g, "<a:t> </a:t>");
      }
      const emptyDocument = await extract(empty, format);
      for (const id of ids.slice(0, 4)) await status(emptyDocument, id, "unknown");
      const split = format === "docx" ? docx(docxParagraph("서론 결론").replace("서론 결론", "서</w:t></w:r><w:r><w:t>론 결론")) : pptx();
      if (format === "pptx") split["ppt/slides/slide1.xml"] = split["ppt/slides/slide1.xml"].replace("서론 결론", "서</a:t></a:r><a:r><a:t>론 결론");
      await status(await extract(split, format), "required-words", "pass");
    }
    // 잘못된 직접 값이 정상적인 상위 값으로 덮이는지 확인합니다.
    const invalidSize = await extract(docx(docxParagraph("서론", '<w:rPr><w:sz w:val="invalid"/></w:rPr>')), "docx");
    await status(invalidSize, "font-size", "unknown");
    const disabledComplex = await extract(docx(docxParagraph("서론", '<w:rPr><w:cs w:val="0"/><w:rtl w:val="false"/></w:rPr>')), "docx");
    await status(disabledComplex, "font-family", "pass");
    await status(disabledComplex, "font-size", "pass");
    const enabledComplex = await extract(docx(docxParagraph("서론", '<w:rPr><w:cs w:val="true"/></w:rPr>')), "docx");
    await status(enabledComplex, "font-family", "unknown");
    await status(enabledComplex, "font-size", "unknown");
    const overriddenComplex = docx(docxParagraph("서론", '<w:rPr><w:cs w:val="off"/></w:rPr>'));
    overriddenComplex["word/styles.xml"] = overriddenComplex["word/styles.xml"].replace('<w:sz w:val="24"/>', '<w:sz w:val="24"/><w:cs/>');
    await status(await extract(overriddenComplex, "docx"), "font-family", "pass");
    // 실제 섹션이 참조하지 않는 머리글의 단어는 문서에 포함된 것으로 세면 안 됩니다.
    const unusedHeader = docx();
    unusedHeader["word/_rels/document.xml.rels"] = relationships(["unused", "header", "header1.xml"]);
    unusedHeader["word/header1.xml"] = `<w:hdr xmlns:w="${w}">${docxParagraph("참고문헌")}</w:hdr>`;
    await status(await extract(unusedHeader, "docx"), "required-words", "fail", { requiredWords: ["참고문헌"] });
    const activeHeader = { ...unusedHeader };
    activeHeader["word/document.xml"] = activeHeader["word/document.xml"].replace("</w:body>", '<w:sectPr><w:headerReference w:type="default" r:id="unused"/></w:sectPr></w:body>');
    await status(await extract(activeHeader, "docx"), "required-words", "pass", { requiredWords: ["참고문헌"] });
    const mismatchedHeader = { ...activeHeader, "word/header1.xml": `<w:hdr xmlns:w="${w}">${docxParagraph("참고문헌", "", '<w:spacing w:line="240"/>')}</w:hdr>` };
    await status(await extract(mismatchedHeader, "docx"), "line-spacing", "fail");
    const asFooter = (files) => Object.fromEntries(Object.entries(files).map(([name, content]) => [name.replaceAll("header", "footer"), content.replaceAll("header", "footer").replaceAll("w:hdr", "w:ftr")]));
    await status(await extract(asFooter(unusedHeader), "docx"), "required-words", "fail", { requiredWords: ["참고문헌"] });
    await status(await extract(asFooter(activeHeader), "docx"), "required-words", "pass", { requiredWords: ["참고문헌"] });
    delete activeHeader["word/header1.xml"];
    await status(await extract(activeHeader, "docx"), "required-words", "unknown", { requiredWords: ["참고문헌"] });
    if (process.env.DOCX_SAMPLE) {
      const sample = await page.evaluate(async (bytes) => documentReader.extract(new File([new Uint8Array(bytes)], "sample.docx"), "docx"), [...fs.readFileSync(process.env.DOCX_SAMPLE)]);
      for (const id of ids) {
        await status(sample, id, id === "page-count" ? "unknown" : "pass");
        await status(sample, id, id === "page-count" ? "unknown" : "fail", { ...criteria, fontFamily: "바탕", fontSize: 14, alignment: "right", lineSpacing: 150, requiredWords: ["없는단어"] });
      }
      await status(sample, "required-words", "pass", { requiredWords: ["참고문헌"] });
    }
    console.log(`PASS: ${checks} document-level assertions across DOCX/PPTX and all six inspection items`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
