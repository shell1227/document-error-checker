const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
async function main() {
  const root = path.resolve(__dirname, "../frontend");
  const server = http.createServer((req, res) => {
    const name = path.resolve(root, "." + new URL(req.url, "http://local").pathname);
    if (!name.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(name, (e, data) => { if (e) return res.writeHead(404).end(); res.setHeader("Content-Type", /\.m?js$/.test(name) ? "text/javascript" : "text/html"); res.end(data); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    let calls = 0, mode = "ok";
    await page.route("**/supabase-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
    await page.route("**/api/proofread", async (r) => {
      calls++;
      const body = r.request().postDataJSON();
      assert.equal(body.consent, true);
      assert.equal(r.request().headers().authorization, "Bearer test");
      assert.ok(body.chunks.length <= 10 && body.chunks.every((s) => s.length <= 1000));
      if (mode === "limited") return r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "호출 한도에 도달했습니다." }) });
      const results = body.chunks.map((text) => ({ ok: true, incomplete: false,
        findings: [...text.matchAll(/그런대|할수있어요/g)].map((m) => ({ original: m[0], suggestion: m[0] === "그런대" ? "그런데" : "할 수 있어요", offset: m.index, category: "SPACING", reason: "테스트 수정 후보" })) }));
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ provider: "bareun", results: mode === "partial" ? results.slice(0, 1) : results }) });
    });
    const archive = new JSZip();
    archive.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>그런대 저는 할수있어요.</w:t></w:r></w:p></w:body></w:document>');
    const buffer = await archive.generateAsync({ type: "nodebuffer" });
    await page.goto(`${base}/index.html`);
    await page.locator("#documentFile").setInputFiles({ name: "test.docx", mimeType: "application/octet-stream", buffer });
    await page.locator('[name="documentType"][value="general"]').check();
    await page.locator('[name="inspectionItem"][value="spelling"]').check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    const inspect = async () => { await page.getByRole("button", { name: "검사 시작", exact: true }).click(); await page.waitForFunction(() => document.getElementById("settingsMessage").textContent.includes("검사가 완료")); };
    await inspect();
    assert.equal(calls, 0, "동의 없이 외부 호출 발생");
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("할 수 있어요"));
    await page.evaluate(() => { inspectionHistory.accessToken = async () => "test"; });
    await page.locator("#externalProofreading").check();
    await inspect();
    assert.equal(calls, 1);
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("수정 제안: 그런데"));
    const merged = await page.evaluate(() => inspectionReport.items.find((i) => i.id === "spelling"));
    assert.equal(merged.counts.fail, 2, "동일 오류가 중복 표시됨");
    assert.equal(merged.coverage.totalCharacters, merged.coverage.completedCharacters);
    await inspect();
    assert.equal(calls, 1, "같은 탭·텍스트 재검사에 중복 외부 호출 발생");
    await page.reload();
    mode = "limited";
    await page.evaluate(() => { inspectionHistory.accessToken = async () => "test"; });
    await page.locator("#externalProofreading").check();
    await inspect();
    const text = await page.locator("#inspectionResults").textContent();
    assert.ok(text.includes("호출 한도"));
    assert.ok(text.includes("할 수 있어요"), "API 실패로 규칙 결과가 사라짐");
    assert.equal(calls, 2);
    mode = "ok";
    const bounded = await page.evaluate(async () => {
      const paragraphs = ["가".repeat(11000)].map((text, i) => ({ source: "본문", index: i, text }));
      const rows = await bareunProofreader.check({ format: "docx", paragraphs });
      return { rows, coverage: rows.coverage };
    });
    assert.equal(bounded.coverage.totalCharacters, 11000);
    assert.equal(bounded.coverage.completedCharacters, 10000);
    assert.equal(bounded.coverage.requestedCalls, 1, "같은 텍스트 묶음을 한 요청에서 중복 호출함");
    assert.ok(bounded.rows.some((r) => r.location.includes("10001~11000")));
    // 긴 문단, 서로 다른 위치의 반복 오류, 단순 문단 묶기와 겹친 후보 중복 제거.
    const detailed = await page.evaluate(async () => {
      const paragraphs = Array.from({ length: 20 }, (_, i) => ({ source: "본문", index: i + 1, text: `문단 ${i + 1}. 저는 할수있어요. 그런대요.` }));
      const document = { format: "docx", fileName: "many.docx", paragraphs };
      const report = documentInspector.inspect(document, ["spelling"], {});
      const rows = await bareunProofreader.check(document);
      bareunProofreader.merge(report, rows);
      const item = report.items[0];
      return { item, planned: bareunProofreader.plan(document).batches.length };
    });
    assert.equal(detailed.planned, 1, "짧은 문단마다 호출을 낭비함");
    assert.equal(detailed.item.coverage.completedCharacters, detailed.item.coverage.totalCharacters);
    assert.equal(detailed.item.details.filter((r) => r.suggestion === "할 수 있어요").length, 20);
    const overlap = await page.evaluate(() => {
      const doc = { format: "docx", fileName: "overlap.docx", paragraphs: [{ source: "본문", index: 1, text: "뵈요. 뵈요." }] };
      const report = documentInspector.inspect(doc, ["spelling"], {});
      bareunProofreader.merge(report, [{ status: "fail", location: "본문", segmentKey: "segment:0", offset: 0, length: 3, actual: "뵈요.", suggestion: "봬요.", expected: "봬요." }]);
      return report.items[0].details.filter((r) => r.suggestion).length;
    });
    assert.equal(overlap, 2, "문장부호를 포함하는 동일 교정이 중복 표시되거나 다른 위치 오류가 사라짐");
    const whitespace = await page.evaluate(() => {
      const p = bareunProofreader.plan({ format: "docx", paragraphs: [{ source: "본문", index: 1, text: "한글" + " ".repeat(5000) + "끝" }] });
      return p.batches.every((b) => b.text.trim().length > 0 && b.text.length <= 1000);
    });
    assert.equal(whitespace, true);
    mode = "partial";
    const partial = await page.evaluate(async () => {
      const paragraphs = ["첫째 문장 ".repeat(100), "둘째 문장 ".repeat(100)].map((text, i) => ({ source: "본문", index: i + 1, text }));
      const rows = await bareunProofreader.check({ format: "docx", paragraphs });
      return rows.coverage;
    });
    assert.equal(partial.completedCharacters, 600);
    assert.equal(partial.segments[1].uninspected[0].start, 0);
    assert.equal(partial.segments[1].uninspected[0].end, 600);
    mode = "ok";
    for (const [format, file] of [["docx", "document-checker-test.docx"], ["pptx", "document-checker-template.pptx"],
      ["hwpx", "document-checker-hancom.hwpx"], ["pdf", "document-checker-pdf-tests/korean.pdf"]]) {
      const filename = path.join(process.env.TEMP, file);
      if (!fs.existsSync(filename)) { console.log(`SKIP real document: ${format}`); continue; }
      const actual = await page.evaluate(async ({ bytes, format }) => {
        const doc = await documentReader.extract(new File([new Uint8Array(bytes)], `sample.${format}`), format);
        const report = documentInspector.inspect(doc, ["spelling"], {});
        const rows = await bareunProofreader.check(doc);
        bareunProofreader.merge(report, rows);
        return report.items[0].coverage;
      }, { bytes: [...fs.readFileSync(filename)], format });
      const remaining = actual.segments.reduce((n, s) => n + s.uninspected.reduce((a, r) => a + r.end - r.start, 0), 0);
      assert.equal(actual.totalCharacters, actual.completedCharacters + remaining);
      assert.ok(actual.completedCharacters <= 10000);
      assert.ok(actual.completedCharacters > 0);
      console.log(`PASS real ${format}: ${actual.completedCharacters}/${actual.totalCharacters} characters, ${remaining} explicitly uninspected (mock API)`);
    }
    console.log("PASS: opt-in only, shared result UI, local rules retained, in-tab deduplication, length limits and API-quota failure fallback");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
