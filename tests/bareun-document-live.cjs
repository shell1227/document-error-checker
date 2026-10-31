// 실제 배포 사이트에 짧은 DOCX를 업로드합니다. 바른 호출 1회와 검사 기록 1개를 사용합니다.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
async function main() {
  if (!process.env.BAREUN_TEST_SITE) { console.log("SKIP: BAREUN_TEST_SITE 설정이 필요합니다."); return; }
  const site = new URL(process.env.BAREUN_TEST_SITE).origin;
  const texts = ["오늘은 날씨가 맑습니다.", "저는학교에갓습니다.", "내일 뵈요.", "저는 할수있어요.", "그건 아니예요.", "다시 뵈요."];
  const archive = new JSZip();
  archive.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${texts.map((s) => `<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  const buffer = await archive.generateAsync({ type: "nodebuffer" });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => { if (r.url() === `${site}/api/proofread` && r.method() === "POST") requests.push(r.postDataJSON()); });
    await page.goto(`${site}/`);
    await page.locator("#documentFile").setInputFiles({ name: "__bareun_fulltext_test__.docx", mimeType: "application/octet-stream", buffer });
    await page.locator('[name="documentType"][value="general"]').check();
    await page.locator('[name="inspectionItem"][value="spelling"]').check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    await page.locator("#externalProofreading").check();
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("settingsMessage").textContent.includes("검사가 완료"), null, { timeout: 130000 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].chunks.length, 1, "짧은 문단이 한 호출로 묶이지 않음");
    for (const text of texts) assert.ok(requests[0].chunks[0].includes(text), "일부 문단이 API 요청에서 제외됨");
    const item = await page.evaluate(() => inspectionReport.items.find((i) => i.id === "spelling"));
    assert.ok(item.coverage, "최신 검사 범위 기능이 배포되지 않음");
    assert.equal(item.coverage.totalCharacters, texts.join("").length);
    assert.equal(item.coverage.completedCharacters, item.coverage.totalCharacters, "일부 구간의 실제 API 검사 미완료");
    assert.ok(item.details.some((r) => r.provider === "bareun" || r.providers?.includes("bareun")), "외부 수정 후보가 표시되지 않음");
    const candidates = item.details.filter((r) => r.suggestion && r.segmentKey);
    const keys = candidates.map((r) => JSON.stringify([r.segmentKey, r.offset, r.actual, r.suggestion]));
    assert.equal(new Set(keys).size, keys.length, "동일 후보가 중복됨");
    assert.ok(item.details.some((r) => r.ruleId), "규칙 검사 결과가 사라짐");
    await page.waitForFunction(() => /저장했습니다|저장하지 못했습니다/.test(document.getElementById("saveHistoryMessage").textContent));
    assert.ok((await page.locator("#saveHistoryMessage").textContent()).includes("저장했습니다"));
    await page.goto(`${site}/history.html`);
    await page.getByRole("button", { name: /__bareun_fulltext_test__/ }).click();
    await page.locator("#historyDetail").waitFor({ state: "visible" });
    const stored = await page.locator("#inspectionResults").textContent();
    assert.ok(stored.includes("바른 검사 범위:"));
    assert.ok(stored.includes("수정 제안:"));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ paragraphs: texts.length, apiCalls: requests[0].chunks.length,
      characters: item.coverage.totalCharacters, completed: item.coverage.completedCharacters,
      candidates: candidates.map((r) => ({ original: r.actual, suggestion: r.suggestion, location: r.location, status: r.status })),
      uninspectedCharacters: item.coverage.totalCharacters - item.coverage.completedCharacters }, null, 2));
    console.log("PASS: 실제 배포 DOCX 업로드 → 전체 규칙/추가 API 검사 → 후보 병합/범위 → Supabase 저장/기록 조회");
    console.log("바른 호출 1회 및 테스트 기록 __bareun_fulltext_test__.docx가 사용되었습니다. 테스트 익명 사용자의 기록입니다.");
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
