// 실제 Supabase SDK + 모의 Auth/PostgREST API 테스트입니다. 실제 DB/RLS 검증은 아닙니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const root = path.resolve(__dirname, "../frontend");
const api = "https://demo.supabase.co";
const records = [];
const refreshUsers = new Map();
let userCount = 0;
let refreshCount = 0;
let mode = "ok";
const jwt = (id) => [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", is_anonymous: true, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString("base64url"), "test-signature"].join(".");
function session(id) {
  const refresh = `refresh-${id}`;
  refreshUsers.set(refresh, id);
  return { access_token: jwt(id), refresh_token: refresh, token_type: "bearer", expires_in: 3600,
    user: { id, aud: "authenticated", role: "authenticated", is_anonymous: true, created_at: new Date().toISOString(), identities: [] } };
}
async function mockApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const respond = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "X-Supabase-Api-Version" }, body: JSON.stringify(body) });
  if (url.pathname.endsWith("/signup")) {
    if (mode === "auth-error") return respond(422, { code: "anonymous_provider_disabled", msg: "Anonymous sign-ins disabled" });
    const id = `00000000-0000-4000-8000-${String(++userCount).padStart(12, "0")}`;
    return respond(200, session(id));
  }
  if (url.pathname.endsWith("/token")) {
    refreshCount++;
    const id = refreshUsers.get(request.postDataJSON().refresh_token);
    return id ? respond(200, session(id)) : respond(400, { code: "refresh_token_not_found", msg: "Invalid refresh token" });
  }
  if (!url.pathname.endsWith("/inspection_records")) return respond(404, {});
  let owner;
  try { owner = JSON.parse(Buffer.from(request.headers().authorization.split(".")[1], "base64url")).sub; } catch { return respond(401, {}); }
  if (mode === "missing-table") return respond(404, { code: "PGRST205" });
  if (mode === "old-format-constraint") return respond(400, { code: "23514" });
  if (request.method() === "POST") {
    if (mode === "save-error") return respond(403, { code: "42501" });
    const row = request.postDataJSON();
    assert.ok(!("user_id" in row), "owner is set by server auth.uid(), not trusted client data");
    assert.ok(!("file" in row) && !("extractedText" in row));
    if (records.some((record) => record.id === row.id)) return respond(409, { code: "23505" });
    records.push({ ...row, user_id: owner, created_at: new Date().toISOString() });
    if (mode === "lost-response") { mode = "ok"; return route.abort("failed"); }
    return respond(201, null);
  }
  let rows = records.filter((record) => record.user_id === owner);
  const id = url.searchParams.get("id");
  if (id) rows = rows.filter((record) => record.id === id.replace("eq.", ""));
  rows.sort((x, y) => y.inspected_at.localeCompare(x.inspected_at) || y.id.localeCompare(x.id));
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || rows.length);
  rows = rows.slice(offset, offset + limit);
  if (request.headers().accept?.includes("vnd.pgrst.object")) return rows.length === 1 ? respond(200, rows[0]) : respond(406, { code: "PGRST116" });
  return respond(200, rows);
}
async function main() {
  const archive = new JSZip();
  archive.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>서론 결론. 저는 할수있어요. 내일 뵈요.</w:t></w:r></w:p></w:body></w:document>');
  const file = await archive.generateAsync({ type: "nodebuffer" });
  const presentation = new JSZip();
  presentation.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>');
  presentation.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
  presentation.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>서론 결론</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  const pptxFile = await presentation.generateAsync({ type: "nodebuffer" });
  const hwpxZip = new JSZip();
  for (const [name, value] of Object.entries(require("./hwpx-fixture.cjs")())) hwpxZip.file(name, value);
  const hwpxFile = await hwpxZip.generateAsync({ type: "nodebuffer" });
  const pdfFile = require("./pdf-fixture.cjs")();
  const server = http.createServer((req, res) => {
    const filename = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(filename, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", /\.m?js$/.test(filename) ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html");
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = await browser.newContext();
    await context.route(`${api}/**`, mockApi);
    await context.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: `window.documentCheckerCloudConfig={url:"${api}",publishableKey:"sb_publishable_test"};` }));
    await context.route("**/api/proofread", (route) => {
      const { chunks } = route.request().postDataJSON();
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ provider: "bareun", results: chunks.map(() => ({ ok: true, incomplete: false, findings: [{ original: "서론", suggestion: "서문", offset: 0, category: "CONFIRM", reason: "저장·조회 테스트용 확인 필요 후보" }] })) }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function inspect(format = "docx", target = page, external = false) {
      await target.goto(base);
      await target.locator("#documentFile").setInputFiles({ name: `sample.${format}`, mimeType: "application/octet-stream", buffer: format === "pptx" ? pptxFile : format === "hwpx" ? hwpxFile : format === "pdf" ? pdfFile : file });
      await target.locator('[value="report"]').check();
      await target.locator('[value="required-words"][name="inspectionItem"]').check();
      await target.locator('[value="spelling"][name="inspectionItem"]').check();
      await target.getByRole("button", { name: "다음", exact: true }).click();
      await target.waitForURL("**/settings.html");
      if (external) await target.locator("#externalProofreading").check();
      if (format === "pdf") {
        await target.locator("#customWord").fill("Introduction");
        await target.locator("#addWordButton").click();
      } else await target.locator('[name="requiredWord"][value="서론"]').check();
      await target.getByRole("button", { name: "검사 시작", exact: true }).click();
      await target.locator("#inspectionSection").waitFor({ state: "visible" });
      assert.ok((await target.locator("#inspectionResults").textContent()).includes("필수 단어: 기준 일치"));
    }
    // 검사 완료 시 자동 저장 → 새 페이지에서 목록/기준/결과 재조회
    await inspect();
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    assert.equal(records.length, 1);
    assert.equal(records[0].file_name, "sample.docx");
    assert.equal(records[0].file_format, "docx");
    assert.deepEqual(records[0].criteria.requiredWords, ["서론"]);
    assert.ok(records[0].inspected_at);
    assert.ok(records[0].result.items.some((item) => item.id === "spelling" && item.counts.unknown > 0));
    const spelling = records[0].result.items.find((item) => item.id === "spelling");
    assert.equal(spelling.counts.fail, 2);
    assert.ok(spelling.details.some((row) => row.suggestion === "봬요"));
    await page.goto(`${base}/history.html`);
    await page.locator(".history-open").first().waitFor();
    await page.locator(".history-open").first().click();
    await page.locator("#historyDetail").waitFor({ state: "visible" });
    assert.ok((await page.locator("#historyCriteria").textContent()).includes("서론"));
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("수정 제안: 할 수 있어요"));
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("수정 제안: 봬요"));
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("필수 단어: 기준 일치"));
    if (process.env.HISTORY_SCREENSHOT) await page.screenshot({ path: process.env.HISTORY_SCREENSHOT, fullPage: true });
    const downloaded = page.waitForEvent("download");
    await page.locator("#downloadHistory").click();
    assert.equal((await downloaded).suggestedFilename(), "sample.docx.history.json");
    // 같은 기록의 재시도는 1건을 유지
    await page.evaluate((record) => { const { user_id, created_at, ...payload } = record; return inspectionHistory.save(payload); }, records[0]);
    assert.equal(records.length, 1);
    // 세션 만료 시 SDK refresh 후 같은 사용자의 기록 유지
    await page.evaluate(() => {
      const key = "document-checker-auth:demo.supabase.co";
      const value = JSON.parse(localStorage.getItem(key));
      value.expires_at = Math.floor(Date.now() / 1000) - 10;
      localStorage.setItem(key, JSON.stringify(value));
    });
    await page.reload();
    await page.locator(".history-open").first().waitFor();
    assert.ok(refreshCount > 0);
    // 페이지 단위 목록 (결과 본문은 상세 조회에서만 요청)
    for (let i = 1; i <= 22; i++) records.push({ ...records[0], id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, file_name: `sample-${i}.docx` });
    await page.locator("#reloadHistory").click();
    await page.waitForFunction(() => document.querySelectorAll(".history-open").length === 20);
    await page.locator("#nextHistory").click();
    await page.waitForFunction(() => document.querySelectorAll(".history-open").length === 3);
    await page.locator("#previousHistory").click();
    await page.waitForFunction(() => document.querySelectorAll(".history-open").length === 20);
    // 다른 브라우저 사용자에게는 모의 서버가 기록을 반환하지 않음
    const second = await browser.newContext();
    await second.route(`${api}/**`, mockApi);
    await second.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: `window.documentCheckerCloudConfig={url:"${api}",publishableKey:"sb_publishable_test"};` }));
    const another = await second.newPage();
    await another.goto(`${base}/history.html`);
    await another.waitForFunction(() => document.getElementById("historyMessage").textContent.includes("저장된 검사 기록이 없습니다"));
    const inaccessible = await another.evaluate(async (id) => { try { await inspectionHistory.get(id); return false; } catch { return true; } }, records[0].id);
    assert.equal(inaccessible, true);
    await second.close();
    // DB 권한 실패가 문서 검사에 영향을 주지 않고 재시도 가능
    mode = "save-error";
    await inspect();
    await page.locator("#retrySaveHistory").waitFor({ state: "visible" });
    assert.ok((await page.locator("#settingsMessage").textContent()).includes("검사가 완료"));
    mode = "ok";
    await page.locator("#retrySaveHistory").click();
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    // 저장됐지만 응답이 유실된 경우 같은 ID로 재시도
    const beforeLost = records.length;
    mode = "lost-response";
    await inspect();
    await page.locator("#retrySaveHistory").waitFor({ state: "visible" });
    await page.locator("#retrySaveHistory").click();
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    assert.equal(records.length, beforeLost + 1);
    await inspect("pptx");
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    assert.equal(records.at(-1).file_format, "pptx");
    assert.equal(records.at(-1).result.format, "pptx");
    await inspect("hwpx");
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    assert.equal(records.at(-1).file_format, "hwpx");
    await page.goto(`${base}/history.html`);
    await page.getByRole("button", { name: /sample.hwpx/ }).click();
    await page.locator("#historyDetail").waitFor({ state: "visible" });
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("필수 단어: 기준 일치"));
    await inspect("pdf");
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    assert.equal(records.at(-1).file_format, "pdf");
    assert.equal(records.at(-1).result.format, "pdf");
    assert.deepEqual(records.at(-1).criteria.requiredWords, ["Introduction"]);
    await page.goto(`${base}/history.html`);
    await page.getByRole("button", { name: /sample.pdf/ }).click();
    await page.locator("#historyDetail").waitFor({ state: "visible" });
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("필수 단어: 기준 일치"));
    mode = "old-format-constraint";
    await inspect("pdf");
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("add-hwpx-pdf.sql"));
    assert.equal(await page.locator("#inspectionSection").isVisible(), true);
    mode = "ok";
    await page.locator("#retrySaveHistory").click();
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    await inspect("docx", page, true);
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("저장했습니다"));
    const externalRecord = records.at(-1);
    assert.equal(externalRecord.criteria.externalProofreading, true);
    assert.ok(externalRecord.result.items.find((i) => i.id === "spelling").details.some((r) => r.provider === "bareun" && r.suggestion === "서문" && r.status === "unknown"));
    await page.goto(`${base}/history.html`);
    await page.locator(".history-open").first().click();
    await page.locator("#historyDetail").waitFor({ state: "visible" });
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("수정 제안: 서문"));
    // 저장 크기 제한은 검사 결과 다운로드를 막지 않습니다.
    const tooLarge = await page.evaluate(async (record) => {
      try { await inspectionHistory.save({ ...record, result: { scope: "x".repeat(3 * 1024 * 1024) } }); return ""; }
      catch (error) { return error.message; }
    }, records[0]);
    assert.ok(tooLarge.includes("2MB"));
    mode = "missing-table";
    await page.goto(`${base}/history.html`);
    await page.waitForFunction(() => document.getElementById("historyMessage").textContent.includes("SQL 설정"));
    mode = "ok";
    // 설정 없음 / SDK 파일 실패 / 공개되지 않아야 할 키도 기본 검사 보존
    await context.unroute("**/supabase-config.js");
    await context.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
    await inspect();
    assert.ok((await page.locator("#saveHistoryMessage").textContent()).includes("설정되지 않아"));
    await context.unroute("**/supabase-config.js");
    await context.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: `window.documentCheckerCloudConfig={url:"${api}",publishableKey:"sb_secret_do_not_use"};` }));
    await inspect();
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("공개 키만"));
    await context.unroute("**/supabase-config.js");
    await context.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: `window.documentCheckerCloudConfig={url:"${api}",publishableKey:"sb_publishable_test"};` }));
    await context.route("**/vendor/supabase.min.js", (route) => route.abort());
    await inspect();
    await page.waitForFunction(() => document.getElementById("saveHistoryMessage").textContent.includes("라이브러리"));
    await context.unroute("**/vendor/supabase.min.js");
    // 새 세션에서 익명 인증이 꺼져 있는 경우
    const authFailure = await browser.newContext();
    await authFailure.route(`${api}/**`, mockApi);
    await authFailure.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: `window.documentCheckerCloudConfig={url:"${api}",publishableKey:"sb_publishable_test"};` }));
    const failedAuthPage = await authFailure.newPage();
    mode = "auth-error";
    await inspect("docx", failedAuthPage);
    await failedAuthPage.locator("#retrySaveHistory").waitFor({ state: "visible" });
    const authMessage = await failedAuthPage.locator("#saveHistoryMessage").textContent();
    assert.ok(authMessage.includes("익명 로그인을 활성화"), authMessage);
    await authFailure.close();
    assert.deepEqual(errors, []);
    console.log("PASS: DOCX/PPTX/HWPX/PDF mocked Supabase save/load, criteria/results, migration failure recovery, auth refresh, paging, identity boundary, retry/deduplication and disconnected inspection");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
