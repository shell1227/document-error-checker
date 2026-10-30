// 사용법: node tests/pdf-file.cjs <PDF 경로> [비교할 pdf-reader.js 경로]
// 문서는 로컬에서만 읽고 Supabase에는 저장하지 않습니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../frontend");
async function main() {
  const input = process.argv[2];
  assert.ok(input, "PDF 파일 경로를 입력하세요.");
  const server = http.createServer((req, res) => {
    if (req.url === "/") return res.end("<!doctype html><title>Local PDF test</title>");
    const filename = req.url === "/pdf-reader.js" && process.argv[3] ? path.resolve(process.argv[3])
      : path.resolve(root, "." + new URL(req.url, "http://local").pathname);
    if (!(req.url === "/pdf-reader.js" && process.argv[3]) && !filename.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(filename, (error, data) => {
      if (error) return res.writeHead(404).end();
      res.setHeader("Content-Type", /\.m?js$/.test(filename) ? "text/javascript" : "application/octet-stream");
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    for (const script of ["document-reader.js", "pdf-reader.js", "document-inspector.js"]) await page.addScriptTag({ url: `${base}/${script}` });
    const result = await page.evaluate(async ({ bytes, name }) => {
      try {
        const doc = await documentReader.extract(new File([new Uint8Array(bytes)], name), "pdf");
        const report = documentInspector.inspect(doc, ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words"],
          { fontFamily: "맑은 고딕", fontSize: 12, alignment: "left", lineSpacing: 160, lengthUnit: "pages", minLength: 1, maxLength: 1, requiredWords: ["서론", "결론"] });
        return { ok: true, pageCount: doc.pageCount, characters: doc.text.length,
          items: report.items.map(({ id, status, counts }) => ({ id, status, counts })) };
      } catch (e) { return { ok: false, message: e.message, cause: e.cause?.message || null }; }
    }, { name: path.basename(input), bytes: [...fs.readFileSync(input)] });
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.ok, true, result.cause || result.message);
    assert.ok(result.pageCount > 0);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
