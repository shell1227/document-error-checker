const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const fixtures = require("./roles-fixtures.cjs");
const roles = { title: { fontFamily: "맑은 고딕", fontSize: 24 }, subheading: { fontFamily: "바탕", fontSize: 16 }, body: { fontFamily: "굴림", fontSize: 11 } };
async function bytes(format, unknown = false, prominent = false, wrongTitle = false) {
  if (format === "pdf") return fixtures.pdf(unknown, true, false, prominent, wrongTitle);
  const zip = new JSZip();
  const files = fixtures[format](unknown);
  if (wrongTitle) {
    if (format === "docx") files["word/styles.xml"] = files["word/styles.xml"].replace('w:eastAsia="맑은 고딕"', 'w:eastAsia="돋움"').replace('w:val="48"', 'w:val="52"');
    if (format === "pptx") files["ppt/slides/slide1.xml"] = files["ppt/slides/slide1.xml"].replace('sz="2400"', 'sz="2600"').replace('typeface="맑은 고딕"', 'typeface="돋움"');
    if (format === "hwpx") files["Contents/header.xml"] = files["Contents/header.xml"].replace('face="맑은 고딕"', 'face="돋움"').replace('id="0" height="2400"', 'id="0" height="2600"');
  }
  if (prominent) {
    if (format === "docx") files["word/document.xml"] = files["word/document.xml"].replace('<w:pStyle w:val="Fancy"/></w:pPr><w:r>', '<w:pStyle w:val="Fancy"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="120"/></w:rPr>');
    if (format === "pptx") files["ppt/slides/slide1.xml"] = files["ppt/slides/slide1.xml"].replace('<a:rPr sz="1100"><a:ea typeface="굴림"/></a:rPr><a:t>임의 상자', '<a:rPr sz="6000"><a:ea typeface="굴림"/></a:rPr><a:t>임의 상자');
    if (format === "hwpx") files["Contents/header.xml"] = files["Contents/header.xml"].replace('<hh:charPr id="3" height="1100">', '<hh:charPr id="3" height="6000">');
  }
  for (const [name, value] of Object.entries(files)) zip.file(name, value);
  return zip.generateAsync({ type: "nodebuffer" });
}
async function main() {
  const root = path.resolve(__dirname, "../frontend");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "document-checker-roles-"));
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
    await page.goto(`${base}/settings.html`);
    async function extract(buffer, format) {
      return page.evaluate(({ buffer, format }) => documentReader.extract(new File([new Uint8Array(buffer)], `roles.${format}`), format), { buffer: [...buffer], format });
    }
    const inspect = (doc, criteria) => page.evaluate(({ doc, criteria }) => documentInspector.inspect(doc, ["font-family", "font-size"], criteria), { doc, criteria });
    for (const format of ["docx", "pptx", "hwpx", "pdf"]) {
      const buffer = await bytes(format);
      fs.writeFileSync(path.join(folder, `roles.${format}`), buffer);
      const doc = await extract(buffer, format);
      const paragraphs = format === "pptx" ? doc.slides[0].paragraphs : doc.paragraphs;
      const sequence = paragraphs.map((p) => p.role).filter((role, i, all) => i === 0 || role !== all[i - 1]);
      assert.deepEqual(sequence, ["title", "subheading", "body"], format);
      assert.ok(paragraphs.every((p) => p.roleReason));
      const roleFormats = format === "pdf" ? { title: { fontFamily: "Helvetica", fontSize: 24 }, subheading: { fontFamily: "Times", fontSize: 16 }, body: { fontFamily: "Courier", fontSize: 11 } } : roles;
      const criteria = { formatMode: "by-role", roleFormats };
      const pass = await inspect(doc, criteria);
      assert.deepEqual(pass.items.map((i) => i.status), ["pass", "pass"], format);
      const mismatchBytes = await bytes(format, false, false, true);
      fs.writeFileSync(path.join(folder, `title-mismatch.${format}`), mismatchBytes);
      const changedFile = await inspect(await extract(mismatchBytes, format), criteria);
      assert.ok(changedFile.items.every((i) => i.status === "fail" && i.counts.unknown === 0));
      assert.ok(changedFile.items.every((i) => i.details.filter((r) => r.status === "fail").every((r) => r.role === "title")));
      const missing = JSON.parse(JSON.stringify(criteria));
      missing.fontFamily = roleFormats.title.fontFamily;
      missing.fontSize = 24;
      missing.roleFormats.title = {};
      assert.ok((await inspect(doc, missing)).items.every((i) => i.counts.unknown > 0), "영역 기준 누락을 공통 기준으로 메우면 안 됨");
      for (const role of ["title", "subheading", "body", "unknown"]) assert.equal(pass.roleSummary[role], paragraphs.filter((p) => p.role === role).length);
      for (const role of ["title", "subheading", "body"]) {
        for (const mismatch of ["font-family", "font-size", "both"]) {
          const changed = JSON.parse(JSON.stringify(criteria));
          if (mismatch !== "font-size") changed.roleFormats[role].fontFamily = "없는 글꼴";
          if (mismatch !== "font-family") changed.roleFormats[role].fontSize = 50;
          const fail = await inspect(doc, changed);
          assert.deepEqual(fail.items.map((i) => i.status), [mismatch === "font-size" ? "pass" : "fail", mismatch === "font-family" ? "pass" : "fail"]);
          assert.ok(fail.items.every((i) => i.details.filter((r) => r.status === "fail").every((r) => r.role === role)));
        }
      }
      const withUnknown = await extract(await bytes(format, true), format);
      const unknown = await inspect(withUnknown, criteria);
      assert.ok(unknown.roleSummary.unknown > 0, format);
      assert.ok(unknown.items.every((i) => i.counts.unknown === unknown.roleSummary.unknown && i.counts.fail === 0));
      assert.ok(unknown.items.every((i) => i.details.some((r) => r.reason?.includes("영역 구분 불가"))));
      const prominent = await extract(await bytes(format, true, true), format);
      const prominentReport = await inspect(prominent, criteria);
      assert.equal(prominentReport.roleSummary.unknown, unknown.roleSummary.unknown, "큰 글씨·가운데 정렬만으로 제목을 만들어내면 안 됨");
      const prominentParagraphs = format === "pptx" ? prominent.slides[0].paragraphs : prominent.paragraphs;
      assert.ok(prominentParagraphs.some((p) => p.role === "unknown" && p.runs.some((r) => r.fontSizePt === 60)), "구분 불가 큰 글씨 사례가 실제 추출됐는지 확인");
      const uniform = await inspect(doc, { fontFamily: roleFormats.body.fontFamily, fontSize: 11 });
      assert.ok(uniform.items.every((i) => i.counts.unknown === 0 && i.counts.fail > 0));
      assert.equal("roleSummary" in uniform, false);
      console.log(`PASS roles: ${format} structure, role-specific pass/fail, unknown and uniform compatibility`);
    }
    const untagged = await extract(fixtures.pdf(false, false), "pdf");
    assert.ok(untagged.paragraphs.every((p) => p.role === "unknown"));
    const conflict = await extract(fixtures.pdf(false, true, true), "pdf");
    assert.equal(conflict.paragraphs[2].role, "unknown", "반복되는 PDF 구조 ID는 확정하지 않음");
    const docxUnknown = await extract(await bytes("docx", true), "docx");
    const independent = await page.evaluate(({ doc, roles }) => documentInspector.inspect(doc, ["required-words", "spelling"], { formatMode: "by-role", roleFormats: roles, requiredWords: ["본문"] }), { doc: docxUnknown, roles });
    assert.equal(independent.items[0].status, "pass", "영역 구분 실패가 필수 단어 검사를 막으면 안 됨");
    assert.equal(independent.items[1].counts.unknown, 0, "영역 구분 실패를 맞춤법 텍스트 추출 실패로 취급하면 안 됨");
    if (process.env.ROLE_OFFICE_DIR) {
      for (const format of ["docx", "pptx"]) {
        const doc = await extract(fs.readFileSync(path.join(process.env.ROLE_OFFICE_DIR, `roles-office.${format}`)), format);
        const report = await inspect(doc, { formatMode: "by-role", roleFormats: roles });
        assert.ok(report.items.every((i) => i.status === "pass"), JSON.stringify(report.items.map((i) => ({ label: i.label, counts: i.counts }))));
        assert.ok(["title", "subheading", "body"].every((role) => report.roleSummary[role] > 0));
        console.log(`PASS generated Office file: ${format}, all roles matched`);
        for (const role of ["title", "subheading", "body"]) {
          const changedDoc = await extract(fs.readFileSync(path.join(process.env.ROLE_OFFICE_DIR, `roles-office-${role}-mismatch.${format}`)), format);
          const changedReport = await inspect(changedDoc, { formatMode: "by-role", roleFormats: roles });
          assert.ok(changedReport.items.every((i) => i.status === "fail" && i.counts.unknown === 0));
          assert.ok(changedReport.items.every((i) => i.details.filter((r) => r.status === "fail").every((r) => r.role === role)));
          console.log(`PASS generated Office mismatch: ${format}/${role}`);
        }
      }
    } else console.log("SKIP generated Office files: ROLE_OFFICE_DIR not set");
    if (process.env.ROLE_HWPX_SAMPLE) {
      const doc = await extract(fs.readFileSync(process.env.ROLE_HWPX_SAMPLE), "hwpx");
      const report = await inspect(doc, { formatMode: "by-role", roleFormats: roles });
      assert.ok(doc.text.length > 0);
      assert.equal(Object.values(report.roleSummary).reduce((a, b) => a + b, 0), doc.paragraphs.filter((p) => p.text.trim()).length);
      assert.ok(doc.paragraphs.every((p) => ["title", "subheading", "body", "unknown"].includes(p.role)));
      console.log(`PASS actual HWPX extraction/role coverage: ${JSON.stringify(report.roleSummary)} (style semantics are not visually verified)`);
    }

    // 첫 화면부터 영역별 입력, 프리셋 복귀, 최종 JSON 및 기록 화면을 연결합니다.
    await page.goto(`${base}/index.html`);
    await page.locator("#documentFile").setInputFiles({ name: "roles.docx", mimeType: "application/octet-stream", buffer: await bytes("docx") });
    for (const id of ["font-family", "font-size"]) await page.locator(`[name="inspectionItem"][value="${id}"]`).check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.waitForURL("**/settings.html");
    await page.locator("#criteriaPreset").selectOption("basic");
    await page.locator("#formatMode").selectOption("by-role");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await page.locator("#presetSection").isVisible(), false);
    await page.getByRole("button", { name: "검사 시작", exact: true }).click();
    assert.ok((await page.locator("#settingsMessage").textContent()).includes("제목 기준 글꼴"));
    for (const [role, criteria] of Object.entries(roles)) {
      await page.locator(`#${role}-fontFamily`).fill(criteria.fontFamily);
      await page.locator(`#${role}-fontSize`).fill(String(criteria.fontSize));
    }
    async function start() {
      await page.getByRole("button", { name: "검사 시작", exact: true }).click();
      await page.waitForFunction(() => document.getElementById("settingsMessage").textContent.includes("검사가 완료"));
    }
    await start();
    assert.ok(await page.evaluate(() => inspectionReport.items.every((i) => i.status === "pass")));
    await page.locator("#title-fontSize").fill("26");
    assert.equal(await page.locator("#inspectionSection").isVisible(), false);
    await start();
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("영역 근거"));
    await page.locator("#formatMode").selectOption("uniform");
    assert.equal(await page.locator("#criteriaPreset").inputValue(), "basic");
    assert.equal(await page.locator("#fontSize").inputValue(), "11");
    await start();
    assert.equal(await page.evaluate(() => inspectionReport.criteria.formatMode), undefined);
    await page.locator("#formatMode").selectOption("by-role");
    assert.equal(await page.locator("#title-fontSize").inputValue(), "26");
    await start();
    const record = await page.evaluate(() => inspectionHistory.createRecord(inspectionReport, setup));
    assert.equal(record.criteria.roleFormats.title.fontSize, 26);
    assert.equal("fontSize" in record.criteria, false);
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("documentCheckerCriteria"))), record.criteria);
    const download = page.waitForEvent("download");
    await page.locator("#downloadInspection").click();
    assert.deepEqual(JSON.parse(fs.readFileSync(await (await download).path(), "utf8")).criteria, record.criteria);
    await page.goto(`${base}/history.html`);
    await page.evaluate(async (record) => { inspectionHistory.get = async () => record; await openRecord(record.id); }, record);
    assert.ok((await page.locator("#historyCriteria").textContent()).includes("26pt"));
    assert.ok((await page.locator("#inspectionResults").textContent()).includes("영역 근거"));
    for (const selected of ["font-size", "font-family"]) {
      await page.evaluate((selected) => { const setup = JSON.parse(sessionStorage.getItem("documentCheckerSetup")); setup.inspectionItems = [selected]; sessionStorage.setItem("documentCheckerSetup", JSON.stringify(setup)); }, selected);
      await page.goto(`${base}/settings.html`);
      await page.locator("#formatMode").selectOption("by-role");
      for (const [role, criteria] of Object.entries(roles)) {
        if (selected === "font-size") await page.locator(`#${role}-fontSize`).fill(String(criteria.fontSize));
        else await page.locator(`#${role}-fontFamily`).fill(criteria.fontFamily);
      }
      await start();
      assert.ok(await page.evaluate(() => inspectionReport.items.every((i) => i.status === "pass")));
      const criterion = await page.evaluate(() => inspectionReport.criteria.roleFormats.title);
      assert.deepEqual(Object.keys(criterion), [selected === "font-size" ? "fontSize" : "fontFamily"]);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: role-mode UI, validation, uniform preset preservation, JSON/session/history display; fixtures at ${folder}`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
