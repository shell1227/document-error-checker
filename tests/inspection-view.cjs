const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<section id="inspectionSection" hidden><div id="inspectionResults"></div></section>');
    await page.addScriptTag({ path: path.resolve(__dirname, "../frontend/inspection-view.js") });
    const row = (status) => ({ status, location: `${status}-location`, actual: `${status}-value`, expected: "기준", reason: status === "unknown" ? "서식 누락" : "" });
    const item = (details, status = "pass", id = "font-family") => ({ id, label: "글꼴", status, counts: { pass: details.filter((r) => r.status === "pass").length, fail: 0, unknown: 0 }, details });
    async function render(items) {
      const report = { scope: "검사 범위", items };
      const unchanged = await page.evaluate((report) => {
        const before = JSON.stringify(report);
        renderInspection(report);
        return before === JSON.stringify(report);
      }, report);
      assert.equal(unchanged, true, "화면 표시가 저장/다운로드 원본을 변경하면 안 됨");
    }
    await render([item([row("pass"), row("fail"), row("unknown")], "fail")]);
    assert.equal(await page.locator('.inspection-item li').count(), 3); // 사유 요약 1 + 문제 상세 2
    assert.equal(await page.locator('.inspection-item').getByText(/pass-location/).count(), 0);
    assert.ok((await page.locator('.inspection-overview').textContent()).includes("기준 일치 1건"));
    assert.ok((await page.locator('.inspection-item').textContent()).includes("서식 누락"));
    await render([item([row("pass")])]);
    assert.equal(await page.locator('.inspection-item').count(), 0);
    assert.ok((await page.locator('.inspection-overview').textContent()).includes("오류가 발견되지 않았습니다"));
    await render([item([row("unknown")], "unknown")]);
    assert.ok(!(await page.locator('#inspectionResults').textContent()).includes("오류가 발견되지 않았습니다"));
    const notice = { ...row("unknown"), kind: "notice", location: "검사 범위" };
    await render([item([notice], "unknown", "spelling")]);
    assert.ok(!(await page.locator('#inspectionResults').textContent()).includes("오류가 발견되지 않았습니다"));
    assert.equal(await page.locator('.inspection-item > details:not([hidden])').count(), 1);
    assert.ok((await page.locator('.inspection-overview').textContent()).includes("전체 정상 판정 아님"));
    await render([item([...Array.from({ length: 250 }, () => row("pass")), row("fail")], "fail")]);
    assert.equal(await page.locator('.inspection-item li').count(), 1);
    console.log("PASS: problem-only details, normal counts in overview, all-pass notice, unknown/spelling safety, unchanged report and large normal lists");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
