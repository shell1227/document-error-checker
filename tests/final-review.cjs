// 최종 점검에서 발견한 예외: 압축 팽창, 취소된 작업의 결과/버튼 덮어쓰기, 안전한 텍스트 표시.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
async function main() {
  const root = path.resolve(__dirname, "../frontend");
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, "." + new URL(req.url, "http://local").pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, data) => { if (error) return res.writeHead(404).end(); res.setHeader("Content-Type", /\.m?js$/.test(file) ? "text/javascript" : "text/html"); res.end(data); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.locator("#documentFile").setInputFiles({ name: "test.docx", mimeType: "application/octet-stream", buffer: Buffer.from("placeholder") });
    await page.locator('[name="inspectionItem"][value="required-words"]').check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    await page.locator('[name="requiredWord"][value="서론"]').check();
    await page.evaluate(() => {
      window.extractions = [];
      documentReader.extract = () => new Promise((resolve) => window.extractions.push(resolve));
      window.makeDoc = (text) => ({ fileName: "test.docx", format: "docx", text, warnings: [], paragraphs: [{ source: "본문", index: 1, text, runs: [{ text }] }] });
    });
    const start = page.getByRole("button", { name: "검사 시작", exact: true });
    await start.click();
    await page.waitForFunction(() => window.extractions.length === 1);
    await page.locator('[name="requiredWord"][value="결론"]').check(); // 첫 검사 취소
    assert.equal(await start.isDisabled(), false);
    await start.click();
    await page.waitForFunction(() => window.extractions.length === 2);
    await page.evaluate(async () => { window.extractions[0](window.makeDoc("이전 결과")); await new Promise((resolve) => setTimeout(resolve, 50)); });
    assert.equal(await start.isDisabled(), true, "취소된 검사 finally가 새 검사의 버튼을 풀면 안 됨");
    await page.evaluate(() => window.extractions[1](window.makeDoc('서론 결론 <img src=x onerror="window.injected=true">')));
    await page.waitForFunction(() => document.getElementById("settingsMessage").textContent.includes("검사가 완료"));
    assert.ok((await page.locator("#extractedText").inputValue()).startsWith("서론 결론"));
    const before = await page.evaluate(() => ({ text: extractedDocument.text, injected: window.injected === true }));
    assert.equal(before.injected, false);
    const downloaded = page.waitForEvent("download");
    await page.locator("#downloadExtraction").click();
    assert.equal(JSON.parse(fs.readFileSync(await (await downloaded).path(), "utf8")).text, before.text);
    assert.equal(await page.locator("#extractionData img").count(), 0);

    const large = new JSZip();
    large.file("word/document.xml", "x".repeat(15000001));
    const data = await large.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    assert.ok(data.length < 100000, "작은 압축 파일의 과도한 팽창을 재현");
    // 새 페이지에서는 원래 추출기를 사용해 UI 모의 함수와 분리합니다.
    const reader = await browser.newPage();
    await reader.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    for (const file of ["vendor/jszip.min.js", "document-reader.js", "docx-reader.js"]) await reader.addScriptTag({ path: path.join(root, file) });
    const error = await reader.evaluate(async (bytes) => {
      try { await documentReader.extract(new File([new Uint8Array(bytes)], "large.docx"), "docx"); return ""; }
      catch (error) { return error.message; }
    }, [...data]);
    assert.ok(error.includes("XML이 너무 큽니다"), error);
    const declarations = new JSZip();
    declarations.file("word/document.xml", '<!DOCTYPE x [<!ENTITY e "text">]><x>&e;</x>');
    const unsafeXml = await reader.evaluate(async (bytes) => {
      try { await documentReader.extract(new File([new Uint8Array(bytes)], "unsafe.docx"), "docx"); return ""; }
      catch (error) { return error.message; }
    }, [...await declarations.generateAsync({ type: "nodebuffer" })]);
    assert.ok(unsafeXml.includes("DTD·엔터티"));
    const literal = new JSZip();
    literal.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t><![CDATA[<!DOCTYPE example>]]></w:t></w:r></w:p></w:body></w:document>');
    const literalText = await reader.evaluate(async (bytes) => (await documentReader.extract(new File([new Uint8Array(bytes)], "literal.docx"), "docx")).text,
      [...await literal.generateAsync({ type: "nodebuffer" })]);
    assert.equal(literalText, "<!DOCTYPE example>", "문서의 CDATA에 적힌 단순 설명 문자열은 허용해야 함");
    await reader.evaluate(() => sessionStorage.setItem("documentCheckerSetup", JSON.stringify({ inspectionItems: {} })));
    const pageErrors = [];
    reader.on("pageerror", (error) => pageErrors.push(error.message));
    await reader.goto(`http://127.0.0.1:${server.address().port}/settings.html`);
    assert.equal(await reader.locator("#summaryFile").textContent(), "직접 연 화면");
    assert.deepEqual(pageErrors, [], "잘못된 세션 설정이 화면 스크립트를 중단하면 안 됨");
    await reader.close();
    console.log("PASS: canceled/restarted extraction isolation, active submit state, extraction JSON consistency, inert HTML text and bounded ZIP inflation");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
