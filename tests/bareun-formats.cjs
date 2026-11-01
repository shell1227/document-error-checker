// 실제 문서 업로드/추출/화면/JSON 경로 + 모의 외부 API. 실제 바른 호출은 없습니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const text = "저는 친구를 만낫습니다. 내일 뵈요. 저는 할수있어요.";
async function archive(files) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) zip.file(name, value);
  return zip.generateAsync({ type: "nodebuffer" });
}
function koreanPdf() {
  const hex = Buffer.from(text, "utf16le").swap16().toString("hex");
  const stream = `BT /F1 12 Tf 30 450 Td <${hex}> Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /HYSMyeongJo-Medium /Encoding /UniKS-UCS2-H /DescendantFonts [5 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYSMyeongJo-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 2 >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let output = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(output);
  output += `xref\n0 7\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(output);
}
async function main() {
  const hwpx = require("./hwpx-fixture.cjs")();
  hwpx["Contents/section1.xml"] = hwpx["Contents/section1.xml"].replace("서론ABC漢字かな", text);
  const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files = {
    docx: await archive({ "word/document.xml": `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` }),
    pptx: await archive({ "ppt/presentation.xml": `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="s" Type="${r}/slide" Target="slides/slide1.xml"/></Relationships>`,
      "ppt/slides/slide1.xml": `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>` }),
    hwpx: await archive(hwpx), pdf: koreanPdf()
  };
  const root = path.resolve(__dirname, "../frontend");
  const server = http.createServer((req, res) => {
    const name = path.resolve(root, "." + new URL(req.url, "http://local").pathname);
    if (!name.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(name, (e, data) => { if (e) return res.writeHead(404).end(); res.setHeader("Content-Type", /\.m?js$/.test(name) ? "text/javascript" : "text/html"); res.end(data); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const format of Object.keys(files)) for (const mode of ["ok", "failure", "quota", "auth", "disabled", "invalid"]) {
      const page = await browser.newPage();
      let calls = 0;
      await page.route("**/supabase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.documentCheckerCloudConfig={url:'',publishableKey:''};" }));
      await page.route("**/api/proofread", async (route) => {
        calls++;
        assert.equal(await page.locator('#downloadInspection').isDisabled(), true, '외부 검사 진행 중 JSON 다운로드 금지');
        assert.equal(await page.evaluate(() => inspectionReport.externalProofreading.status), 'pending');
        if (mode === "invalid") return route.fulfill({ status: 200, contentType: "text/html", body: '<html>잘못된 배포 응답</html>' });
        if (mode === "failure" || mode === "quota") return route.fulfill({ status: mode === 'quota' ? 429 : 503, contentType: 'application/json', body: JSON.stringify({ providerCalls: 0, message: mode === 'quota' ? '테스트 할당량 초과' : '테스트 서비스 실패' }) });
        const chunks = route.request().postDataJSON().chunks;
        assert.ok(chunks.some((s) => s.includes('만낫습니다') && s.includes('뵈요')));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ providerCalls: chunks.length, results: chunks.map((s) => ({ ok: true, findings: [...s.matchAll(/만낫습니다|뵈요|할수있어요/g)].map((m) => ({ original: m[0], suggestion: { '만낫습니다': '만났습니다', '뵈요': '봬요', '할수있어요': '할 수 있어요' }[m[0]], offset: m.index, category: 'TYPO', reason: '모의 수정' })) })) }) });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.locator('#documentFile').setInputFiles({ name: `test.${format}`, mimeType: 'application/octet-stream', buffer: files[format] });
      await page.locator('[name="inspectionItem"][value="spelling"]').check();
      await page.getByRole('button', { name: '다음', exact: true }).click();
      await page.waitForURL('**/settings.html');
      await page.evaluate((mode) => {
        inspectionHistory.accessToken = async () => { if (mode === 'auth') throw new Error('테스트 인증 실패'); return 'test'; };
        inspectionSaving.save = (report) => { window.savedReport = JSON.parse(JSON.stringify(report)); };
      }, mode);
      if (mode !== 'disabled') await page.locator('#externalProofreading').check();
      await page.getByRole('button', { name: '검사 시작', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('settingsMessage').textContent.includes('검사가 완료'));
      const report = await page.evaluate(() => window.savedReport);
      const expected = mode === 'ok' ? 'completed' : mode === 'disabled' ? 'disabled' : 'failed';
      assert.equal(report.externalProofreading.status, expected, `${format} ${mode}`);
      assert.equal(calls, ['auth', 'disabled'].includes(mode) ? 0 : 1);
      assert.ok(report.items[0].details.some((row) => row.suggestion === '할 수 있어요'), '기본 규칙 유지');
      if (mode === 'ok') {
        assert.ok(report.items[0].details.some((row) => row.provider === 'bareun' && row.suggestion === '만났습니다'));
        assert.equal(report.items[0].details.filter((row) => row.suggestion === '봬요').length, 1, '중복 제거');
        assert.equal(report.externalProofreading.providerCalls, 1);
      }
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#downloadInspection').click();
      const exported = JSON.parse(fs.readFileSync(await (await downloadEvent).path(), 'utf8'));
      assert.deepEqual(exported.externalProofreading, report.externalProofreading);
      await page.evaluate((report) => renderInspection(JSON.parse(JSON.stringify(report))), report);
      assert.ok((await page.locator('#inspectionResults').textContent()).includes('바른 외부 검사 상태:'));
      console.log(`PASS mock API: ${format} / ${mode} / ${expected} / endpoint attempts ${calls}`);
      await page.close();
    }
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
