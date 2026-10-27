const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../frontend/document-inspector.js"), "utf8") + "\nthis.inspect = documentInspector.inspect;", context);
const run = (text = "본문", extra = {}) => ({ text, fontSizePt: 10, fontSettings: { eastAsia: "맑은 고딕", ascii: "Arial" }, ...extra });
const paragraph = (extra = {}) => ({ source: "word/document.xml", index: 1, text: "본문", runs: [run()], alignment: "both", lineSpacing: { value: 160, unit: "percent" }, ...extra });
const docx = (extra = {}) => ({ fileName: "test.docx", format: "docx", text: "서론\n결론", paragraphs: [paragraph()], textLimitations: [], ...extra });
const item = (doc, id, criteria) => context.inspect(doc, [id], criteria).items[0];
assert.equal(item(docx(), "font-family", { fontFamily: "Malgun Gothic" }).status, "pass");
assert.equal(item(docx(), "font-family", { fontFamily: "바탕" }).status, "fail");
// 같은 글자 묶음에서도 영문 글꼴을 한글 글꼴로 대체하면 안 됩니다.
const mixed = docx({ paragraphs: [paragraph({ text: "본문ABC", runs: [run("본문ABC")] })] });
assert.equal(item(mixed, "font-family", { fontFamily: "맑은 고딕" }).counts.fail, 1);
const theme = docx({ paragraphs: [paragraph({ runs: [run("본문", { fontSettings: { eastAsiaTheme: "minorEastAsia" } })] })] });
assert.equal(item(theme, "font-family", { fontFamily: "맑은 고딕" }).status, "unknown");
assert.equal(item(docx(), "font-size", { fontSize: 10 }).status, "pass");
assert.equal(item(docx(), "font-size", { fontSize: 11 }).status, "fail");
const partial = docx({ paragraphs: [paragraph({ runs: [run(), run("추가", { fontSizePt: null })] })] });
assert.equal(item(partial, "font-size", { fontSize: 11 }).status, "fail");
assert.equal(item(partial, "font-size", { fontSize: 11 }).counts.unknown, 1);
assert.equal(item(partial, "font-size", { fontSize: 10 }).status, "unknown");
assert.equal(item(docx(), "alignment", { alignment: "justify" }).status, "pass");
assert.equal(item(docx(), "alignment", { alignment: "left" }).status, "fail");
assert.equal(item(docx({ paragraphs: [paragraph({ alignment: "start" })] }), "alignment", { alignment: "left" }).status, "unknown");
assert.equal(item(docx(), "line-spacing", { lineSpacing: 160 }).status, "pass");
assert.equal(item(docx(), "line-spacing", { lineSpacing: 150 }).status, "fail");
assert.equal(item(docx({ paragraphs: [paragraph({ lineSpacing: { value: 16, unit: "pt" } })] }), "line-spacing", { lineSpacing: 160 }).status, "unknown");
assert.equal(item(docx({ pageCount: 3 }), "page-count", { lengthUnit: "pages", minLength: 2 }).status, "unknown");
const pptx = { format: "pptx", text: "첫 슬라이드", slides: [{ number: 1, paragraphs: [paragraph({ alignment: "ctr" })] }], slideCount: 2, textLimitations: [] };
assert.equal(item(pptx, "alignment", { alignment: "center" }).status, "pass");
for (const [minLength, maxLength, status] of [[2, 2, "pass"], [3, null, "fail"], [null, 1, "fail"], [null, 2, "pass"], [2, null, "pass"]]) {
  assert.equal(item(pptx, "page-count", { lengthUnit: "slides", minLength, maxLength }).status, status);
}
const autoFit = { ...pptx, slides: [{ number: 1, paragraphs: [paragraph({ runs: [run("본문", { automaticFit: true })] })] }] };
assert.equal(item(autoFit, "font-size", { fontSize: 10 }).status, "unknown");
assert.equal(item(docx(), "required-words", { requiredWords: ["서론", "결론"] }).status, "pass");
assert.equal(item(docx(), "required-words", { requiredWords: ["참고문헌"] }).status, "fail");
const incomplete = docx({ textLimitations: ["이미지 텍스트 미추출"] });
assert.equal(item(incomplete, "required-words", { requiredWords: ["참고문헌"] }).status, "unknown");
assert.equal(item(incomplete, "required-words", { requiredWords: ["서론"] }).status, "pass");
assert.equal(item(incomplete, "font-size", { fontSize: 10 }).status, "unknown");
assert.equal(item(docx({ textUncertain: true }), "required-words", { requiredWords: ["서론"] }).status, "unknown");
for (const id of ["font-family", "font-size", "alignment", "line-spacing"]) {
  const table = docx({ paragraphs: [paragraph({ formatUncertainReasons: ["표 조건부 서식"] })] });
  assert.equal(item(table, id, { fontFamily: "맑은 고딕", fontSize: 10, alignment: "justify", lineSpacing: 160 }).status, "unknown");
  assert.equal(item(docx({ paragraphs: [] }), id, {}).status, "unknown");
}
assert.equal(item(docx(), "spelling", {}).status, "unknown");
assert.equal(context.inspect(docx(), ["font-size"], { fontSize: 10 }).items.length, 1);
console.log("PASS: inspection comparisons, inclusive limits, mixed scripts, partial failures, unknown values, units and incomplete extraction");
