// 설정 완료 뒤에만 실행합니다. 실제 Supabase에 가상 기록 2개가 저장됩니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../frontend");
async function main() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "supabase-config.js"), "utf8"), sandbox);
  const config = sandbox.window.documentCheckerCloudConfig;
  if (!config?.url || !config.publishableKey) {
    console.log("SKIP: 실제 Supabase 연결 정보가 없습니다. supabase/README.md 순서대로 설정 후 실행하세요.");
    return;
  }
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><html lang='ko'><title>Supabase 연결 테스트</title></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    async function newUser() {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      for (const name of ["vendor/supabase.min.js", "supabase-config.js", "history-store.js"]) await page.addScriptTag({ path: path.join(root, name) });
      return page;
    }
    const first = await newUser();
    const second = await newUser();
    async function saveTest(page, suffix) {
      return page.evaluate(async (suffix) => {
        const report = { fileName: `__connection_test__${suffix}.docx`, format: "docx", criteria: { requiredWords: ["서론"] }, scope: "연결 확인용 가상 기록", items: [{ id: "required-words", label: "필수 단어", status: "pass", counts: { pass: 1, fail: 0, unknown: 0 }, details: [{ status: "pass", location: "테스트", expected: "서론", actual: "포함" }] }] };
        const record = inspectionHistory.createRecord(report, { documentType: "general", inspectionItems: ["required-words"] });
        await inspectionHistory.save(record);
        await inspectionHistory.save(record); // 중복 재시도
        const loaded = await inspectionHistory.get(record.id);
        return { record, loaded };
      }, suffix);
    }
    const a = await saveTest(first, "A");
    const b = await saveTest(second, "B");
    assert.deepEqual(a.loaded.result, a.record.result);
    assert.deepEqual(a.loaded.criteria, a.record.criteria);
    assert.notEqual(a.loaded.user_id, b.loaded.user_id);
    for (const [page, other] of [[first, b.record.id], [second, a.record.id]]) {
      const denied = await page.evaluate(async (id) => { try { await inspectionHistory.get(id); return false; } catch { return true; } }, other);
      assert.equal(denied, true, "다른 사용자의 기록이 노출됨");
      const listing = await page.evaluate(() => inspectionHistory.list());
      assert.ok(!listing.records.some((record) => record.id === other));
    }
    const forged = await second.evaluate(async ({ owner, record }) => {
      const config = window.documentCheckerCloudConfig;
      const key = `document-checker-auth:${new URL(config.url).host}`;
      const session = JSON.parse(localStorage.getItem(key));
      const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/inspection_records`, {
        method: "POST", headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...record, id: crypto.randomUUID(), user_id: owner })
      });
      return { status: response.status, code: (await response.json()).code };
    }, { owner: a.loaded.user_id, record: b.record });
    assert.equal(forged.code, "42501", "다른 사용자 명의의 INSERT가 허용됨");
    console.log("PASS: 실제 Supabase 저장/조회, 중복 방지, 두 사용자 RLS 격리 및 소유자 위조 차단");
    console.log("테스트용 __connection_test__A.docx / B.docx 기록 2개와 익명 사용자는 프로젝트에 남습니다.");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
