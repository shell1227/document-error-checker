// 테마 언어·기본/문자 스타일·번호 수준·표의 직접 서식을 실제 XML로 검증합니다.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    for (const file of ["document-reader.js", "docx-reader.js", "document-inspector.js", "korean-proofreader.js", "inspection-view.js"])
      await page.addScriptTag({ path: path.resolve(__dirname, "../frontend", file) });
    const base = {
      "word/document.xml": `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:t>한글 “본문”</w:t></w:r></w:p></w:body></w:document>`,
      "word/styles.xml": `<w:styles xmlns:w="${w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsiaTheme="minorEastAsia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:jc w:val="center"/><w:spacing w:line="384"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`,
      "word/_rels/document.xml.rels": '<Relationships><Relationship Id="t" Type="x/theme" Target="theme/theme1.xml"/><Relationship Id="s" Type="x/settings" Target="settings.xml"/><Relationship Id="n" Type="x/numbering" Target="numbering.xml"/></Relationships>',
      "word/settings.xml": `<w:settings xmlns:w="${w}"><w:themeFontLang w:val="en-US" w:eastAsia="ko-KR"/></w:settings>`,
      "word/theme/theme1.xml": `<a:theme xmlns:a="${a}"><a:themeElements><a:fontScheme><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:font script="Hang" typeface="맑은 고딕"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
      "word/numbering.xml": `<w:numbering xmlns:w="${w}"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:pPr><w:jc w:val="right"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
    };
    async function inspect(files = base, criteria = {}, ids = ["font-family", "font-size", "alignment", "line-spacing"]) {
      return page.evaluate(async ({ files, criteria, ids }) => {
        const read = async (path) => files[path] ? new DOMParser().parseFromString(files[path], "application/xml") : null;
        const doc = { format: "docx", fileName: "styles.docx", ...await readDocx(read) };
        return { doc, report: documentInspector.inspect(doc, ids, { fontFamily: "맑은 고딕", fontSize: 12, alignment: "center", lineSpacing: 160, ...criteria }) };
      }, { files, criteria, ids });
    }
    const plain = await inspect();
    // 곡선 따옴표는 글꼴 선택 미확정, 글자 크기에는 영향 없음.
    assert.equal(plain.report.items[0].status, "unknown");
    assert.deepEqual(plain.report.items.slice(1).map((i) => i.status), ["pass", "pass", "pass"]);
    const hangul = { ...base, "word/document.xml": base["word/document.xml"].replace("한글 “본문”", "한글 본문") };
    assert.equal((await inspect(hangul)).report.items[0].status, "pass");
    assert.equal((await inspect(hangul, { fontFamily: "바탕" })).report.items[0].status, "fail");
    assert.equal((await inspect({ ...hangul, "word/settings.xml": "" })).report.items[0].status, "unknown");
    assert.equal((await inspect({ ...hangul, "word/theme/theme1.xml": "" })).report.items[0].status, "unknown");
    const noAlign = { ...hangul, "word/styles.xml": base["word/styles.xml"].replace('<w:jc w:val="center"/>', "") };
    assert.equal((await inspect(noAlign)).report.items[2].status, "unknown");
    const numbered = { ...hangul, "word/document.xml": hangul["word/document.xml"].replace("<w:p>", '<w:p><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr>') };
    assert.equal((await inspect(numbered, { alignment: "right" })).report.items[2].status, "pass");
    assert.equal((await inspect(numbered)).report.items[2].status, "fail");
    assert.equal((await inspect({ ...numbered, "word/numbering.xml": "" })).report.items[2].status, "unknown");
    const table = { ...hangul, "word/document.xml": `<w:document xmlns:w="${w}"><w:body><w:tbl><w:tr><w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="384" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="맑은 고딕"/><w:sz w:val="24"/></w:rPr><w:t>표 본문</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>` };
    assert.deepEqual((await inspect(table)).report.items.map((i) => i.status), ["pass", "pass", "pass", "pass"]);
    const character = { ...hangul, "word/styles.xml": hangul["word/styles.xml"].replace('</w:styles>', '<w:style w:type="character" w:styleId="DefaultChar" w:default="1"><w:rPr><w:sz w:val="28"/></w:rPr></w:style></w:styles>') };
    assert.equal((await inspect(character, { fontSize: 14 })).report.items[1].status, "pass");
    const styledTable = { ...table,
      "word/document.xml": table["word/document.xml"].replace("<w:tbl>", '<w:tbl><w:tblPr><w:tblStyle w:val="TableBase"/></w:tblPr>').replace('<w:pPr><w:jc w:val="center"/><w:spacing w:line="384" w:lineRule="auto"/></w:pPr>', '').replace('<w:rPr><w:rFonts w:eastAsia="맑은 고딕"/><w:sz w:val="24"/></w:rPr>', ''),
      "word/styles.xml": table["word/styles.xml"].replace('</w:styles>', '<w:style w:type="table" w:styleId="TableBase"><w:pPr><w:jc w:val="right"/></w:pPr><w:rPr><w:rFonts w:eastAsia="바탕"/></w:rPr></w:style></w:styles>') };
    assert.deepEqual((await inspect(styledTable, { fontFamily: "바탕", alignment: "right" })).report.items.map((i) => i.status), ["pass", "pass", "pass", "pass"]);
    const conditional = { ...styledTable, "word/styles.xml": styledTable["word/styles.xml"].replace('<w:style w:type="table" w:styleId="TableBase">', '<w:style w:type="table" w:styleId="TableBase"><w:tblStylePr w:type="firstRow"/>') };
    assert.equal((await inspect(conditional)).report.items[2].status, "unknown");
    const directional = { ...hangul, "word/document.xml": hangul["word/document.xml"].replace('<w:p>', '<w:p><w:pPr><w:jc w:val="start"/><w:bidi/></w:pPr>') };
    assert.equal((await inspect(directional, { alignment: "right" })).report.items[2].status, "pass");
    // 저장·재조회에 사용하는 JSON에서도 기능 안내와 실제 검사 불가를 구별합니다.
    const spelling = await inspect(hangul, {}, ["spelling"]);
    assert.equal(spelling.report.items[0].counts.unknown, 0);
    await page.setContent('<section id="inspectionSection"><div id="inspectionResults"></div></section>');
    await page.evaluate((report) => renderInspection(JSON.parse(JSON.stringify(report))), spelling.report);
    assert.ok((await page.locator('#inspectionResults').textContent()).includes("기능 한계 안내"));
    assert.ok((await page.locator('.inspection-overview').textContent()).includes("전체 정상 판정 아님"));
    const unknown = await inspect(noAlign);
    await page.evaluate((report) => renderInspection(report), unknown.report);
    assert.ok((await page.locator('#inspectionResults').textContent()).includes("검사 불가·판단 보류 사유"));
    console.log("PASS: DOCX theme language, missing theme, default/character styles, numbering alignment, direct table formats, unknown reasons and separate scope notices");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
