// 실행: NODE_PATH에 Playwright 설치 경로를 지정한 뒤 node tests/extraction.cjs
// 테스트용 DOCX/PPTX ZIP을 메모리에서 만들며 사용자 문서는 사용하지 않습니다.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const root = path.resolve(__dirname, "../frontend");
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
async function zip(files) {
  const archive = new JSZip();
  for (const [name, data] of Object.entries(files)) archive.file(name, data);
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
async function main() {
  const docx = await zip({
    "word/document.xml": `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t>서론</w:t><w:tab/><w:t>본문</w:t></w:r><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>추가</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:pPr><w:spacing w:line="300" w:lineRule="exact"/></w:pPr><w:r><w:t>표 내용</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    "word/styles.xml": `<w:styles xmlns:w="${w}"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Base"><w:rPr><w:rFonts w:eastAsia="맑은 고딕"/></w:rPr><w:pPr><w:jc w:val="center"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Body"><w:basedOn w:val="Base"/><w:pPr><w:spacing w:line="384"/></w:pPr></w:style></w:styles>`
  });
  const pptx = await zip({
    "ppt/presentation.xml": `<p:presentation xmlns:p="${p}" xmlns:r="${rel}"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="first" Type="${rel}/slide" Target="slides/slide1.xml"/><Relationship Id="second" Type="${rel}/slide" Target="slides/slide2.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr><a:noAutofit/></a:bodyPr><a:p><a:r><a:t>마지막</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    "ppt/slides/slide2.xml": `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr><a:noAutofit/></a:bodyPr><a:lstStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></a:lstStyle><a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:pPr><a:r><a:rPr sz="2400"><a:ea typeface="맑은 고딕"/></a:rPr><a:t>첫 슬라이드</a:t></a:r><a:br/><a:fld><a:t>필드</a:t></a:fld></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  });
  const server = http.createServer((req, res) => {
    const filename = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(filename, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html");
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
    const page = await browser.newPage();
    await page.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    assert.equal(await page.locator('[name="documentType"]').count(), 0);
    await page.locator("#documentFile").setInputFiles({ name: "sample.docx", mimeType: "application/octet-stream", buffer: docx });
    await page.locator('[value="font-family"]').check();
    await page.locator('[value="required-words"]').check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    assert.equal(await page.locator("#summaryType").count(), 0);
    assert.equal(await page.evaluate(() => "documentType" in JSON.parse(sessionStorage.getItem("documentCheckerSetup"))), false);
    await page.reload(); // 파일이 페이지 이동과 새로고침을 지나도 보관되는지 확인
    await page.locator("#fontFamily").fill("맑은 고딕");
    await page.locator('[name="requiredWord"][value="서론"]').check();
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.locator("#extractionSection").waitFor({ state: "visible" });
    const data = JSON.parse(await page.locator("#extractionData").textContent());
    assert.equal(data.paragraphs[0].runs[0].fontFamily, "맑은 고딕");
    assert.equal(data.paragraphs[0].runs[0].fontSizePt, 10);
    assert.equal(data.paragraphs[0].runs[1].fontSizePt, 14);
    assert.equal(data.paragraphs[0].alignment, "center");
    assert.equal(data.paragraphs[0].lineSpacing.value, 160);
    assert.equal(data.paragraphs[1].lineSpacing.value, 15);
    assert.equal(data.text, "서론\t본문추가\n표 내용");
    assert.equal(data.pageCount, null);
    await page.locator("#inspectionSection").waitFor({ state: "visible" });
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("글꼴: 일부 검사 불가"));
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("필수 단어: 기준 일치"));
    await page.locator("#fontFamily").fill("바탕");
    assert.equal(await page.locator("#inspectionSection").isVisible(), false);
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.locator("#inspectionSection").waitFor({ state: "visible" });
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("글꼴: 불일치"));
    const result = await page.evaluate(async (bytes) => {
      return documentReader.extract(new File([new Uint8Array(bytes)], "sample.pptx"), "pptx");
    }, [...pptx]);
    assert.equal(result.slideCount, 2);
    assert.equal(result.slides[0].paragraphs[0].text, "첫 슬라이드\n필드");
    assert.equal(result.slides[0].paragraphs[0].runs[0].fontSizePt, 24);
    assert.equal(result.slides[0].paragraphs[0].runs[2].fontSizePt, 18);
    assert.equal(result.slides[0].paragraphs[0].lineSpacing.value, 120);
    assert.equal(result.slides[1].paragraphs[0].runs[0].fontSizePt, null);
    assert.equal(result.slides[1].text, "마지막");
    // PPTX도 실제 업로드 화면부터 전체 항목 검사까지 확인합니다.
    await page.goto(base);
    await page.locator("#documentFile").setInputFiles({ name: "sample.pptx", mimeType: "application/octet-stream", buffer: pptx });
    for (const id of ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words", "spelling"]) {
      await page.locator(`[name="inspectionItem"][value="${id}"]`).check();
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    await page.locator("#fontFamily").fill("맑은 고딕");
    await page.locator("#fontSize").fill("24");
    await page.locator("#alignment").selectOption("center");
    await page.locator("#lineSpacing").fill("120");
    await page.locator("#minLength").fill("2");
    await page.locator("#maxLength").fill("2");
    await page.locator('[name="requiredWord"][value="서론"]').check();
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.locator("#inspectionSection").waitFor({ state: "visible" });
    const inspectionText = await page.locator("#inspectionResults").textContent();
    for (const expected of ["글자 크기: 불일치", "문단 정렬: 일부 검사 불가", "줄 간격: 일부 검사 불가", "문서 분량: 기준 일치", "필수 단어: 불일치", "맞춤법·띄어쓰기: 검사 불가", "슬라이드 1 · 문단 1"]) {
      assert.ok(inspectionText.includes(expected), expected);
    }
    const downloadEvent = page.waitForEvent("download");
    await page.locator("#downloadInspection").click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), "sample.pptx.inspection.json");
    if (process.env.INSPECTION_SCREENSHOT) {
      await page.locator("#inspectionSection").scrollIntoViewIfNeeded();
      await page.screenshot({ path: process.env.INSPECTION_SCREENSHOT });
    }
    if (process.env.PPTX_SAMPLE) {
      await page.goto(base);
      await page.locator("#documentFile").setInputFiles(process.env.PPTX_SAMPLE);
      for (const id of ["font-family", "font-size", "alignment", "line-spacing"]) await page.locator(`[name="inspectionItem"][value="${id}"]`).check();
      await page.getByRole("button", { name: "다음", exact: true }).click();
      await page.waitForURL("**/settings.html");
      await page.locator("#fontFamily").fill("맑은 고딕");
      await page.locator("#fontSize").fill("32");
      await page.locator("#alignment").selectOption("left");
      await page.locator("#lineSpacing").fill("100");
      await page.getByRole("button", { name: "검사 시작", exact: true }).click();
      await page.locator("#inspectionSection").waitFor({ state: "visible" });
      if (process.env.PPTX_DEFAULT_SAMPLE === "1") {
        const text = await page.locator("#inspectionResults").textContent();
        for (const expected of ["글꼴: 기준 일치", "글자 크기: 불일치", "문단 정렬: 불일치", "줄 간격: 기준 일치", "근거:"]) assert.ok(text.includes(expected), expected);
        assert.ok(!text.includes("[검사 불가]"));
      }
      if (process.env.INSPECTION_SCREENSHOT) {
        await page.locator("#inspectionSection").scrollIntoViewIfNeeded();
        await page.screenshot({ path: process.env.INSPECTION_SCREENSHOT });
      }
    }
    if (process.env.DOCX_SAMPLE) {
      await page.goto(base);
      await page.locator("#documentFile").setInputFiles(process.env.DOCX_SAMPLE);
      for (const id of ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words"]) await page.locator(`[name="inspectionItem"][value="${id}"]`).check();
      await page.getByRole("button", { name: "다음", exact: true }).click();
      await page.waitForURL("**/settings.html");
      await page.locator("#fontFamily").fill("맑은 고딕");
      await page.locator("#fontSize").fill("12");
      await page.locator("#alignment").selectOption("left");
      await page.locator("#lineSpacing").fill("160");
      await page.locator("#minLength").fill("1");
      await page.locator('[name="requiredWord"][value="서론"]').check();
      await page.getByRole("button", { name: "검사 시작", exact: true }).click();
      await page.locator("#inspectionSection").waitFor({ state: "visible" });
      const text = await page.locator("#inspectionResults").textContent();
      for (const expected of ["글꼴: 기준 일치", "글자 크기: 기준 일치", "문단 정렬: 기준 일치", "줄 간격: 기준 일치", "문서 분량: 검사 불가", "필수 단어: 기준 일치"]) assert.ok(text.includes(expected), expected);
    }
    for (const [name, buffer, format] of [["broken.docx", Buffer.from("invalid"), "docx"],
      ["badxml.docx", await zip({ "word/document.xml": "<broken>" }), "docx"],
      ["wrong.pptx", docx, "pptx"]]) {
      const message = await page.evaluate(async ({ bytes, name, format }) => {
        try { await documentReader.extract(new File([new Uint8Array(bytes)], name), format); return null; }
        catch (error) { return error.message; }
      }, { bytes: [...buffer], name, format });
      assert.ok(message, `${name} must fail`);
    }
    await page.evaluate(() => sessionStorage.removeItem("documentCheckerFileId"));
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("settingsMessage").textContent.includes("다시 선택"));
    assert.equal(await page.locator("#extractionSection").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log("PASS: DOCX/PPTX extraction, inherited/direct formats, slide order, file persistence, invalid files and missing file recovery");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
