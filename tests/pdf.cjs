// 실제 PDF 파일과 로컬 브라우저로 추출·비교·화면 흐름을 검증합니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../frontend");
const folder = process.argv[2] || path.join(process.env.TEMP, "document-checker-pdf-tests");
async function main() {
  const server = http.createServer((req, res) => {
    const name = path.resolve(root, "." + new URL(req.url, "http://local").pathname);
    if (!name.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(name, (error, body) => {
      if (error) return res.writeHead(404).end();
      res.setHeader("Content-Type", /\.m?js$/.test(name) ? "text/javascript" : "text/html");
      res.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.PDF_DEBUG) page.on("console", (m) => console.log(m.type(), m.text()));
    page.on("request", (r) => { if (/^https?:/.test(r.url()) && !r.url().startsWith(base)) external.push(r.url()); });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.route("**/supabase-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
    await page.goto(`${base}/index.html`);
    await page.locator("#documentFile").setInputFiles(path.join(folder, "korean.pdf"));
    await page.locator('[value="general"]').check();
    const ids = ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words"];
    for (const id of ids) await page.locator(`[name="inspectionItem"][value="${id}"]`).check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    await page.reload();
    await page.locator("#fontFamily").fill("맑은 고딕");
    await page.locator("#fontSize").fill("12");
    await page.locator("#alignment").selectOption("left");
    await page.locator("#lineSpacing").fill("160");
    await page.locator("#minLength").fill("1");
    await page.locator("#maxLength").fill("1");
    await page.locator('[name="requiredWord"][value="서론"]').check();
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.waitForFunction(() => !document.getElementById("inspectionSection").hidden || document.getElementById("settingsMessage").classList.contains("error-message"));
    if (!(await page.locator("#inspectionSection").isVisible())) {
      const diagnostic = await page.evaluate(async () => { try { await readPdf(await documentFileStore.load(setup.fileId)); } catch (e) { return `${e.message}: ${e.cause?.stack || ""}`; } });
      assert.fail(diagnostic);
    }
    const korean = JSON.parse(await page.locator("#extractionData").textContent());
    assert.ok(korean.text.includes("서론 결론 참고문헌"), korean.text);
    assert.equal(korean.pageCount, 1);
    assert.equal(korean.paragraphs[0].runs[0].fontFamily, "MalgunGothic");
    assert.equal(korean.paragraphs[0].runs[0].fontSizePt, 12);
    const criteria = { fontFamily: "Helvetica", fontSize: 12, alignment: "left", lineSpacing: 160,
      lengthUnit: "pages", minLength: 2, maxLength: 2, requiredWords: ["Introduction", "Conclusion"] };
    const inspect = (doc, criteriaOverride = {}) => page.evaluate(({ doc, ids, criteria }) => documentInspector.inspect(doc, ids, criteria), { doc, ids, criteria: { ...criteria, ...criteriaOverride } });
    async function extract(name) {
      return page.evaluate(({ bytes, name }) => documentReader.extract(new File([new Uint8Array(bytes)], name), "pdf"),
        { bytes: [...fs.readFileSync(path.join(folder, name))], name });
    }
    const basic = await extract("basic.pdf");
    assert.equal(basic.pageCount, 2);
    const pass = await inspect(basic);
    assert.deepEqual(pass.items.map((i) => i.status), ["pass", "pass", "unknown", "unknown", "pass", "pass"]);
    const fail = await inspect(basic, { fontFamily: "Courier", fontSize: 14, minLength: 3, maxLength: 4, requiredWords: ["MissingWord"] });
    assert.deepEqual(fail.items.map((i) => i.status), ["fail", "fail", "unknown", "unknown", "fail", "fail"]);
    for (const name of ["scan.pdf", "blank.pdf"]) {
      const scanned = await extract(name);
      assert.equal(scanned.pageCount, 1);
      const report = await inspect(scanned, { minLength: 1, maxLength: 1 });
      assert.equal(report.items[4].status, "pass");
      for (const item of report.items.filter((i) => i.id !== "page-count")) assert.equal(item.status, "unknown");
    }
    const hidden = await extract("hidden.pdf");
    assert.equal((await inspect(hidden, { requiredWords: ["Hidden"] })).items[5].status, "unknown");
    const transformed = await extract("transformed.pdf");
    const runs = transformed.paragraphs.flatMap((p) => p.runs);
    assert.equal(runs.find((r) => r.text === "Scaled").fontSizePt, 24);
    assert.equal(runs.find((r) => r.text === "Stretched").fontSizePt, null);
    assert.equal(runs.find((r) => r.text === "Rotated").fontSizePt, 12);
    const unit = await extract("user-unit.pdf");
    assert.equal(unit.paragraphs[0].runs[0].fontSizePt, 24);
    if (fs.existsSync(path.join(folder, "w3c.pdf"))) {
      const w3c = await extract("w3c.pdf");
      assert.equal(w3c.pageCount, 1);
      assert.ok(w3c.text.includes("Dummy PDF file"), w3c.text);
      assert.ok(w3c.paragraphs.some((p) => p.runs.some((r) => r.fontNameKnown)));
      const fontResult = (await inspect(w3c, { fontFamily: "Arial" })).items[0];
      assert.ok(fontResult.counts.pass > 0);
      assert.equal(fontResult.counts.fail, 0);
      console.log("PASS: W3C public PDF page count, text extraction and original font names");
    }
    await assert.rejects(() => extract("encrypted.pdf"), /암호/);
    await assert.rejects(() => page.evaluate(() => documentReader.extract(new File(["invalid"], "broken.pdf"), "pdf")), /PDF/);
    // 라이브러리 내부 TypeError를 문서 손상으로 오안내하지 않는지 확인합니다.
    const faultContext = await browser.newContext();
    try {
      await faultContext.route("**/vendor/pdfjs/pdf.min.mjs", (route) => route.fulfill({ contentType: "text/javascript",
        body: 'export const GlobalWorkerOptions={}; export function getDocument(){return {promise:Promise.reject(new TypeError("library API failure")),destroy:async()=>{}};}' }));
      const faultPage = await faultContext.newPage();
      await faultPage.goto(`${base}/index.html`);
      await faultPage.addScriptTag({ url: `${base}/pdf-reader.js` });
      const message = await faultPage.evaluate(async () => { try { await readPdf(new File(["test"], "test.pdf")); } catch (e) { return e.message; } });
      assert.ok(message.includes("내부 오류"), message);
      assert.ok(!message.includes("정상적인 PDF"));
    } finally { await faultContext.close(); }
    const download = page.waitForEvent("download");
    await page.locator("#downloadInspection").click();
    assert.equal((await download).suggestedFilename(), "korean.pdf.inspection.json");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], "PDF 검사가 외부 네트워크에 의존함");
    console.log("PASS: 8 real PDFs, Korean/subset font, point size, pass/fail/unknown, page counts, scans/blank pages, transformations/UserUnit, hidden text, encryption/corruption, upload/refresh/download and offline assets");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
