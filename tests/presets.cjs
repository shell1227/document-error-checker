// 실행: NODE_PATH에 Playwright 경로를 지정한 뒤 node tests/presets.cjs
// 로컬 브라우저 테스트이며 실제 바른/Supabase 서비스는 호출하지 않습니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
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
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const zip = new JSZip();
    zip.file("word/document.xml", `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:t>서론 결론 본문</w:t></w:r></w:p></w:body></w:document>`);
    zip.file("word/styles.xml", `<w:styles xmlns:w="${w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="맑은 고딕"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:jc w:val="left"/><w:spacing w:line="384"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
    await page.goto(`${base}/index.html`);
    await page.locator("#documentFile").setInputFiles({ name: "preset.docx", mimeType: "application/octet-stream", buffer: await zip.generateAsync({ type: "nodebuffer" }) });
    for (const id of ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words", "spelling"]) await page.locator(`[name="inspectionItem"][value="${id}"]`).check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    const select = page.locator("#criteriaPreset");
    const formats = () => page.evaluate(() => [fontFamilyInput.value, fontSizeInput.value, alignmentInput.value, lineSpacingInput.value]);
    assert.equal(await select.inputValue(), "");
    assert.deepEqual(await formats(), ["", "", "", ""]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "좁은 화면에서 프리셋 선택란이 가로로 넘치면 안 됨");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator("#minLength").fill("1");
    await page.locator("#maxLength").fill("9");
    await page.locator('[name="requiredWord"][value="서론"]').check();
    await page.locator("#customWord").fill("본문");
    await page.locator("#addWordButton").click();
    await page.locator("#externalProofreading").check();
    const unrelated = () => page.evaluate(() => ({ min: minLengthInput.value, max: maxLengthInput.value, words: getSelectedRequiredWords(), consent: document.getElementById("externalProofreading").checked }));
    const original = await unrelated();
    for (const [id, size, spacing] of [["basic", "11", "160"], ["large", "12", "180"], ["presentation", "24", "100"]]) {
      await select.selectOption(id);
      assert.deepEqual(await formats(), ["맑은 고딕", size, "left", spacing]);
      assert.deepEqual(await unrelated(), original);
    }
    assert.ok((await page.locator("#presetHelp").textContent()).includes("공식 양식이 아닌"));
    assert.ok((await page.locator("#presetPresentationHelp").textContent()).includes("제목과 본문"));
    for (const [id, value] of [["fontFamily", "바탕"], ["fontSize", "13.5"], ["alignment", "right"], ["lineSpacing", "175"]]) {
      await select.selectOption("basic");
      if (id === "alignment") await page.locator(`#${id}`).selectOption(value);
      else await page.locator(`#${id}`).fill(value);
      assert.equal(await select.inputValue(), "custom");
    }
    await select.selectOption("basic");
    await page.locator("#minLength").fill("2");
    await page.locator("#externalProofreading").uncheck();
    assert.equal(await select.inputValue(), "basic", "프리셋과 무관한 입력 변경은 서식 상태를 바꾸지 않음");
    await select.selectOption("");
    assert.deepEqual(await formats(), ["맑은 고딕", "11", "left", "160"]);
    await page.locator("#fontSize").fill("0");
    await page.evaluate(() => criteriaForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.ok((await page.locator("#settingsMessage").textContent()).includes("0보다 큰 값"));
    await page.locator("#fontSize").fill("13.5");
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("settingsMessage").textContent.includes("검사가 완료"));
    const stored = await page.evaluate(() => ({ criteria: JSON.parse(sessionStorage.getItem("documentCheckerCriteria")), config: JSON.parse(sessionStorage.getItem("documentCheckerInspectionConfig")), report: inspectionReport, record: inspectionHistory.createRecord(inspectionReport, setup) }));
    assert.equal(stored.criteria.fontSize, 13.5);
    assert.equal(stored.criteria.minLength, 2);
    assert.deepEqual(stored.config.criteria, stored.criteria);
    assert.deepEqual(stored.report.criteria, stored.criteria);
    assert.deepEqual(stored.record.criteria, stored.criteria);
    assert.equal("preset" in stored.criteria, false, "기존 저장 형식을 유지하며 최종 값만 보관");
    const downloaded = page.waitForEvent("download");
    await page.locator("#downloadInspection").click();
    assert.deepEqual(JSON.parse(fs.readFileSync(await (await downloaded).path(), "utf8")).criteria, stored.criteria);
    await select.selectOption("large");
    assert.equal(await page.locator("#inspectionSection").isVisible(), false);
    assert.equal(await page.locator("#downloadInspection").isDisabled(), true);

    // 프리셋 변경 시 진행 중인 외부 검사도 기존 취소 경로로 중단합니다.
    await page.locator("#externalProofreading").check();
    await page.evaluate(() => { bareunProofreader.check = (_doc, signal) => new Promise((resolve) => { window.externalSignal = signal; window.finishExternal = resolve; }); });
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.waitForFunction(() => Boolean(window.finishExternal));
    await select.selectOption("presentation");
    assert.equal(await page.evaluate(() => window.externalSignal.aborted), true);
    await page.evaluate(async () => { window.finishExternal([]); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(await page.locator("#inspectionSection").isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "검사 시작", exact: true }).isDisabled(), false);

    // 선택하지 않은 숨긴 서식은 건드리지 않으며 네 형식에서 동일하게 적용합니다.
    for (const extension of ["docx", "pptx", "hwpx", "pdf"]) {
      await page.evaluate((extension) => sessionStorage.setItem("documentCheckerSetup", JSON.stringify({ fileName: `sample.${extension}`, extension, inspectionItems: ["font-size"] })), extension);
      await page.goto(`${base}/settings.html`);
      await page.evaluate(() => { fontFamilyInput.value = "숨긴 글꼴"; alignmentInput.value = "right"; lineSpacingInput.value = "195"; });
      await select.selectOption("presentation");
      assert.deepEqual(await formats(), ["숨긴 글꼴", "24", "right", "195"]);
      assert.deepEqual(await page.evaluate(() => buildCriteriaData()), { fontSize: 24 });
    }
    await page.evaluate(() => sessionStorage.setItem("documentCheckerSetup", JSON.stringify({ fileName: "sample.docx", extension: "docx", inspectionItems: ["spelling", "page-count", "required-words"] })));
    await page.goto(`${base}/settings.html`);
    assert.equal(await page.locator("#presetSection").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log("PASS: three presets, selected fields only across four formats, manual/custom/reapply, unrelated criteria and consent retained, validation, final stored/downloaded values and cancellation");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
