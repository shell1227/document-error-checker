// 설정 완료 뒤에만 실행합니다. 실제 Supabase에 가상 기록 2개가 저장됩니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../frontend");
const documentMode = process.argv.includes("--documents");
async function main() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "supabase-config.js"), "utf8"), sandbox);
  const config = sandbox.window.documentCheckerCloudConfig;
  if (!config?.url || !config.publishableKey) {
    console.log("SKIP: 실제 Supabase 연결 정보가 없습니다. supabase/README.md 순서대로 설정 후 실행하세요.");
    return;
  }
  const server = http.createServer((req, res) => {
    if (req.url !== "/") {
      const filename = path.resolve(root, "." + new URL(req.url, "http://local").pathname);
      if (!filename.startsWith(root + path.sep)) return res.writeHead(403).end();
      return fs.readFile(filename, (error, data) => {
        if (error) return res.writeHead(404).end();
        res.setHeader("Content-Type", /\.m?js$/.test(filename) ? "text/javascript" : "application/octet-stream");
        res.end(data);
      });
    }
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
      if (documentMode) for (const name of ["vendor/jszip.min.js", "document-reader.js", "hwpx-reader.js", "pdf-reader.js", "document-inspector.js"]) await page.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/${name}` });
      return page;
    }
    const first = await newUser();
    const second = await newUser();
    async function saveTest(page, suffix) {
      let format = "docx", bytes = null;
      if (documentMode && suffix === "A") {
        format = "hwpx";
        const archive = new (require("../frontend/vendor/jszip.min.js"))();
        for (const [name, value] of Object.entries(require("./hwpx-fixture.cjs")())) archive.file(name, value);
        bytes = [...await archive.generateAsync({ type: "nodebuffer" })];
      } else if (documentMode) {
        format = "pdf";
        bytes = [...fs.readFileSync(path.join(process.env.TEMP, "document-checker-pdf-tests/korean.pdf"))];
      }
      return page.evaluate(async ({ suffix, format, bytes }) => {
        let report = { fileName: `__connection_test__${suffix}.docx`, format: "docx", criteria: { requiredWords: ["서론"] }, scope: "연결 확인용 가상 기록", items: [{ id: "required-words", label: "필수 단어", status: "pass", counts: { pass: 1, fail: 0, unknown: 0 }, details: [{ status: "pass", location: "테스트", expected: "서론", actual: "포함" }] }] };
        if (bytes) {
          const extracted = await documentReader.extract(new File([new Uint8Array(bytes)], `__connection_test__${suffix}.${format}`), format);
          report = documentInspector.inspect(extracted, ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words"],
            { fontFamily: format === "hwpx" ? "바탕" : "맑은 고딕", fontSize: 12, alignment: "left", lineSpacing: 160,
              lengthUnit: "pages", minLength: 1, maxLength: 2, requiredWords: ["서론"] });
          if (report.items.find((item) => item.id === "required-words").status !== "pass") throw new Error("테스트 문서 추출·단어 검사가 실패했습니다.");
        }
        const record = inspectionHistory.createRecord(report, { documentType: "general", inspectionItems: report.items.map((item) => item.id) });
        await inspectionHistory.save(record);
        await inspectionHistory.save(record); // 중복 재시도
        const loaded = await inspectionHistory.get(record.id);
        return { record, loaded };
      }, { suffix, format, bytes });
    }
    const a = await saveTest(first, "A");
    const b = await saveTest(second, "B");
    assert.deepEqual(a.loaded.result, a.record.result);
    assert.deepEqual(a.loaded.criteria, a.record.criteria);
    assert.deepEqual(b.loaded.result, b.record.result);
    assert.deepEqual(b.loaded.criteria, b.record.criteria);
    if (documentMode) {
      assert.equal(a.loaded.file_format, "hwpx");
      assert.equal(b.loaded.file_format, "pdf");
    }
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
    console.log(documentMode ? "PASS: HWPX/PDF 추출·검사 결과와 기준의 실제 DB 저장/재조회" : "PASS: DOCX 가상 기록 연결 확인");
    console.log(`테스트용 ${a.record.file_name} / ${b.record.file_name} 기록 2개와 익명 사용자는 프로젝트에 남습니다.`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
