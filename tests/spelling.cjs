const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
for (const file of ["korean-proofreader.js", "document-inspector.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../frontend", file), "utf8"), context);
vm.runInContext("this.inspect=documentInspector.inspect", context);
function doc(text, format = "docx", extra = {}) {
  const p = { source: "본문", index: 1, text, runs: [{ text }] };
  return { fileName: `sample.${format}`, format, text, paragraphs: [p], slides: [{ number: 1, paragraphs: [p] }], pages: [{ number: 1, text }], ...extra };
}
const check = (document) => context.inspect(document, ["spelling"], {}).items[0];
const wrong = "그렇게 해도 되요. 내일 뵈요. 그건 아니예요. 일이 됬습니다. 저는 할수있어요.";
for (const format of ["docx", "pptx", "hwpx", "pdf"]) {
  const item = check(doc(wrong, format));
  assert.equal(item.status, "fail");
  assert.equal(item.counts.fail, 5);
  assert.equal(item.counts.unknown, 0, "일반 기능 한계를 실제 미검사로 집계하면 안 됨");
  assert.ok(item.details.some((r) => r.kind === "notice"));
  for (const row of item.details.filter((r) => r.status === "fail")) {
    assert.ok(row.suggestion && row.text.includes(row.actual));
    assert.equal(wrong.slice(row.offset, row.offset + row.length), row.actual);
  }
  assert.ok(item.details.some((r) => r.suggestion === "할 수 있어요"));
}
for (const sentence of ["그렇게 해도 돼요. 내일 봬요. 그건 아니에요. 일이 됐습니다. 저는 할 수 있어요.",
  "나는 오늘 학교에 갔다.", "기술 용어와 고유명사는 문맥을 확인해야 한다.", "먹을수있다.", "김되요 아니예요님 뵈요씨", "할\n수있다.", "되요ABC", "ABC되요", "https://example.com/되요 test@example.com `뵈요`", ""]) {
  const item = check(doc(sentence));
  assert.equal(item.counts.fail, 0, sentence);
  assert.equal(item.status, "unknown", "규칙 미검출을 정상으로 판정함");
}
for (const text of ["할수있다", "할 수있다", "할수 있다", "할  수있다"]) {
  assert.equal(check(doc(text)).details.find((r) => r.status === "fail").suggestion, "할 수 있다");
}
const repeated = check(doc("되요.\n되요."));
assert.equal(repeated.counts.fail, 2);
assert.ok(repeated.details.some((r) => r.location.includes("2줄")));
const uncertain = check(doc(wrong, "pdf", { textUncertain: true }));
assert.equal(uncertain.counts.fail, 0);
assert.equal(uncertain.status, "unknown");
assert.ok(uncertain.details.some((r) => r.suggestion));
assert.ok(check(doc("되요. ".repeat(600))).details.some((r) => r.location === "검사 제한"));
assert.equal(check(doc("가".repeat(300001) + " 뵈요.")).counts.fail, 1, "긴 문단 뒤쪽을 검사하지 않음");
console.log("PASS: Korean sentences across four formats, spelling/spacing suggestions, correct/unsupported text stays unknown, boundaries, URL/code exclusions, positions, uncertain extraction and limits");
