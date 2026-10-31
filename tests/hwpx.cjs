const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const fixture = require("./hwpx-fixture.cjs");
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    for (const file of ["vendor/jszip.min.js", "document-reader.js", "hwpx-reader.js", "document-inspector.js"]) await page.addScriptTag({ path: path.resolve(__dirname, "../frontend", file) });
    async function extract(files) {
      const zip = new JSZip();
      for (const [name, text] of Object.entries(files)) zip.file(name, text);
      return read(await zip.generateAsync({ type: "nodebuffer" }));
    }
    async function read(buffer) {
      return page.evaluate((bytes) => documentReader.extract(new File([new Uint8Array(bytes)], "sample.hwpx"), "hwpx"), [...buffer]);
    }
    const ids = ["font-family", "font-size", "alignment", "line-spacing", "page-count", "required-words"];
    const good = { fontFamily: "바탕", fontSize: 12, alignment: "left", lineSpacing: 160, lengthUnit: "pages", minLength: 1, requiredWords: ["서론", "결론", "표 내용"] };
    const inspect = (doc, criteria = good) => page.evaluate(({ doc, ids, criteria }) => documentInspector.inspect(doc, ids, criteria), { doc, ids, criteria });
    const doc = await extract(fixture());
    assert.equal(doc.text, "서론ABC漢字かな\n\n표 내용\n결론");
    assert.equal(doc.paragraphs[0].lineSpacing.value, 160);
    const pass = await inspect(doc);
    assert.deepEqual(pass.items.map((i) => i.status), ["pass", "pass", "pass", "pass", "unknown", "pass"]);
    const inherited = fixture();
    for (const name of ["Contents/section0.xml", "Contents/section1.xml"]) inherited[name] = inherited[name].replaceAll(' paraPrIDRef="0"', '').replaceAll(' charPrIDRef="0"', '');
    // 표를 감싼 빈 문단은 제외하고, 실제 텍스트 문단은 styleIDRef로 상속합니다.
    assert.deepEqual((await inspect(await extract(inherited))).items.map((i) => i.status), ["pass", "pass", "pass", "pass", "unknown", "pass"]);
    const fail = await inspect(doc, { ...good, fontFamily: "돋움", fontSize: 11, alignment: "center", lineSpacing: 150, requiredWords: ["없는단어"] });
    assert.deepEqual(fail.items.map((i) => i.status), ["fail", "fail", "fail", "fail", "unknown", "fail"]);
    const broken = fixture();
    broken["Contents/section1.xml"] = broken["Contents/section1.xml"].replaceAll('charPrIDRef="0"', 'charPrIDRef="missing"').replaceAll('paraPrIDRef="0"', 'paraPrIDRef="missing"');
    const unknown = await inspect(await extract(broken));
    for (const i of unknown.items.slice(0, 4)) assert.equal(i.status, "unknown");
    const fixed = fixture();
    fixed["Contents/header.xml"] = fixed["Contents/header.xml"].replaceAll('type="PERCENT"', 'type="FIXED"');
    assert.equal((await inspect(await extract(fixed))).items[3].status, "unknown");
    const relative = fixture();
    relative["Contents/header.xml"] = relative["Contents/header.xml"].replace('hangul="100"', 'hangul="80"');
    const relativeDoc = await extract(relative);
    assert.equal(relativeDoc.paragraphs[0].runs[0].sizeByScript.hangul, 9.6);
    assert.equal((await inspect(relativeDoc)).items[1].status, "fail");
    const special = fixture();
    special["Contents/section0.xml"] = special["Contents/section0.xml"].replace("</hs:sec>", '<hp:p><hp:run><hp:pic/></hp:run></hp:p></hs:sec>');
    const limited = await inspect(await extract(special), { ...good, requiredWords: ["없는단어"] });
    assert.equal(limited.items[5].status, "unknown");
    await assert.rejects(() => extract({ "Contents/header.xml": "<broken>" }));
    if (process.argv[2]) {
      const real = await read(fs.readFileSync(process.argv[2]));
      assert.ok(real.text.length > 100);
      assert.ok(real.paragraphs.some((p) => p.runs.some((r) => r.fontByScript.hangul)));
      assert.ok(real.paragraphs.some((p) => p.lineSpacing?.unit === "percent"));
      const nonempty = real.paragraphs.find((p) => /^[가-힣]+$/.test(p.text.trim()) && p.runs.every((r) => !r.text.trim() || r.sizeByScript.hangul > 0));
      assert.ok(nonempty, "실제 문서의 한글 문단을 찾지 못함");
      // 전체 문서의 자동 번호는 별도 검사 불가. 이 비교는 추출한 일반 텍스트 문단에만 한정합니다.
      if (real.textUncertain) assert.equal((await inspect(real)).items[5].status, "unknown");
      const one = { ...real, paragraphs: [nonempty], text: nonempty.text, textLimitations: [], textUncertain: false };
      const r = nonempty.runs.find((r) => r.text.trim());
      const actualCriteria = { ...good, fontFamily: r.fontByScript.hangul, fontSize: r.sizeByScript.hangul,
        alignment: ({ left: "left", right: "right", center: "center", both: "justify" })[nonempty.alignment],
        lineSpacing: nonempty.lineSpacing?.value, requiredWords: [nonempty.text.trim()] };
      const matched = await inspect(one, actualCriteria);
      assert.equal(matched.items[0].status, "pass");
      assert.equal(matched.items[1].status, "pass");
      assert.equal(matched.items[2].status, "pass");
      assert.equal(matched.items[3].status, "pass");
      assert.equal(matched.items[5].status, "pass");
      const mismatch = await inspect(one, { ...actualCriteria, fontFamily: "테스트용다른글꼴", fontSize: actualCriteria.fontSize + 1,
        alignment: actualCriteria.alignment === "left" ? "right" : "left", lineSpacing: actualCriteria.lineSpacing + 10, requiredWords: ["존재하지않는테스트단어"] });
      assert.deepEqual(mismatch.items.map((i) => i.status), ["fail", "fail", "fail", "fail", "unknown", "fail"]);
      console.log(`PASS: 실제 HWPX ${real.paragraphs.length}문단 / ${real.text.length}자, 글꼴 참조·줄 간격·필수 단어 검사`);
    }
    console.log("PASS: HWPX 기준 일치/불일치, 문자별 서식, 구역 순서, 표 중복 방지, switch 선택, 누락 참조, 상대 크기, 고정 간격 및 미추출 내용 처리");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
