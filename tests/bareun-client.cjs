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
      assert.ok(body.chunks.length <= 3 && body.chunks.every((s) => s.length <= 1000));
      if (mode !== "ok") return r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "호출 한도에 도달했습니다." }) });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ provider: "bareun", results: body.chunks.map(() => ({ ok: true, incomplete: false, findings: [{ original: "그런대", suggestion: "그런데", offset: 0, category: "CONFUSABLE_WORDS", reason: "문맥을 확인하세요." }] })) }) });
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
    const bounded = await page.evaluate(async () => {
      const paragraphs = ["가".repeat(1001), "문장 하나", "문장 둘", "문장 셋", "문장 넷"].map((text, i) => ({ source: "본문", index: i, text }));
      return bareunProofreader.check({ format: "docx", paragraphs });
    });
    assert.ok(bounded.some((r) => r.reason.includes("최대 3개")));
    console.log("PASS: opt-in only, shared result UI, local rules retained, in-tab deduplication, length limits and API-quota failure fallback");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
