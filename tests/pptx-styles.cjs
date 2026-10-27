// 자리 표시자/테마 상속을 가진 테스트 문서를 만들고 브라우저에서 읽습니다.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const JSZip = require("../frontend/vendor/jszip.min.js");
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rels = (...items) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
const part = (tag, contents) => `<p:${tag} xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}">${contents}</p:${tag}>`;
const shape = (ph, props, paragraphs, style = "") => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="테스트"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>${style}<p:txBody>${props}${paragraphs}</p:txBody></p:sp>`;
const ph = (idx, type = "") => `<p:ph idx="${idx}"${type ? ` type="${type}"` : ""}/>`;
const paragraph = (text, props = "", runProps = "") => `<a:p>${props}<a:r>${runProps}<a:t>${text}</a:t></a:r><a:endParaRPr sz="9900"/></a:p>`;
const noFit = "<a:bodyPr><a:noAutofit/></a:bodyPr>";
const list = (levels) => `<a:lstStyle>${levels}</a:lstStyle>`;
const theme = (korean = "맑은 고딕", latin = "Arial") => `<a:theme xmlns:a="${a}" name="test"><a:themeElements><a:fontScheme name="test"><a:majorFont><a:latin typeface="${latin} Display"/><a:ea typeface=""/><a:font script="Hang" typeface="${korean}"/><a:font script="Jpan" typeface="Yu Gothic"/><a:font script="Hans" typeface="SimSun"/></a:majorFont><a:minorFont><a:latin typeface="${latin}"/><a:ea typeface=""/><a:font script="Hang" typeface="${korean}"/><a:font script="Jpan" typeface="Yu Gothic"/><a:font script="Hans" typeface="SimSun"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
function fixture() {
  return {
    "ppt/presentation.xml": part("presentation", `<p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst><p:defaultTextStyle><a:lvl1pPr algn="r"><a:defRPr sz="1500" lang="ko-KR"><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle>`),
    "ppt/_rels/presentation.xml.rels": rels(["slide", "slide", "slides/slide1.xml"]),
    "ppt/slides/_rels/slide1.xml.rels": rels(["layout", "slideLayout", "../slideLayouts/layout9.xml"]),
    "ppt/slideLayouts/_rels/layout9.xml.rels": rels(["master", "slideMaster", "../slideMasters/master7.xml"]),
    "ppt/slideMasters/_rels/master7.xml.rels": rels(["theme", "theme", "../theme/theme8.xml"]),
    "ppt/theme/theme8.xml": theme(),
    "ppt/slideMasters/master7.xml": part("sldMaster", `<p:cSld><p:spTree>${shape(ph(123, "body"), noFit + list('<a:lvl1pPr><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:lvl1pPr>'), '<a:p><a:pPr><a:lnSpc><a:spcPct val="125000"/></a:lnSpc></a:pPr></a:p>')}${shape(ph(7, "title"), noFit, "<a:p/>")}</p:spTree></p:cSld><p:txStyles><p:bodyStyle><a:lvl1pPr algn="l"><a:lnSpc><a:spcPct val="110000"/></a:lnSpc><a:defRPr sz="3200"><a:latin typeface="+mj-lt"/><a:ea typeface="+mn-ea"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles>`),
    "ppt/slideLayouts/layout9.xml": part("sldLayout", `<p:cSld><p:spTree>${shape(ph(7, "body"), noFit + list('<a:lvl1pPr><a:defRPr sz="2200"/></a:lvl1pPr><a:lvl2pPr algn="r"><a:defRPr sz="2000"/></a:lvl2pPr>'), '<a:p><a:pPr algn="ctr"/></a:p>')}${shape(ph(99, "body"), noFit + list('<a:lvl1pPr><a:defRPr sz="9900"/></a:lvl1pPr>'), "<a:p/>")}</p:spTree></p:cSld>`),
    "ppt/slides/slide1.xml": part("sld", `<p:cSld><p:spTree>${shape(ph(7), "<a:bodyPr/><a:lstStyle/>", paragraph("본문ABC"))}${shape(ph(7), "<a:bodyPr/><a:lstStyle/>", paragraph("두번째", '<a:pPr lvl="1"/>'))}${shape("", noFit + list('<a:defPPr><a:defRPr sz="2100"/></a:defPPr><a:lvl1pPr algn="l"/>'), paragraph("일반 텍스트"), '<p:style><a:fontRef idx="minor"/></p:style>')}${shape(ph(7), '<a:bodyPr><a:normAutofit fontScale="80000" lnSpcReduction="10000"/></a:bodyPr>', paragraph("직접서식", '<a:pPr algn="r"><a:lnSpc><a:spcPct val="175000"/></a:lnSpc><a:defRPr sz="2400"/></a:pPr>', '<a:rPr sz="2600"><a:ea typeface="궁서"/></a:rPr>'))}</p:spTree></p:cSld>`)
  };
}
async function buffer(files) {
  const zip = new JSZip();
  for (const [name, xml] of Object.entries(files)) zip.file(name, xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
async function main() {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage();
    for (const name of ["vendor/jszip.min.js", "document-reader.js", "pptx-styles.js", "pptx-reader.js", "document-inspector.js"]) {
      await page.addScriptTag({ path: path.resolve(__dirname, "../frontend", name) });
    }
    const extract = async (files) => page.evaluate(async (bytes) => documentReader.extract(new File([new Uint8Array(bytes)], "test.pptx"), "pptx"), [...await buffer(files)]);
    const data = await extract(fixture());
    const ps = data.slides[0].paragraphs;
    assert.equal(ps[0].runs[0].fontSizePt, 22);
    assert.equal(ps[0].alignment, "ctr");
    assert.equal(ps[0].lineSpacing.value, 125);
    assert.equal(ps[0].runs[0].resolvedFonts.Hang.name, "맑은 고딕");
    assert.equal(ps[0].runs[0].resolvedFonts.latin.name, "Arial Display");
    assert.ok(ps[0].runs[0].resolvedFonts.Hang.source.includes("theme8.xml"));
    assert.equal(ps[1].runs[0].fontSizePt, 20);
    assert.equal(ps[1].alignment, "r");
    assert.equal(ps[2].runs[0].fontSizePt, 21); // 기본 문단 속성과 수준별 속성을 함께 적용
    assert.equal(ps[2].lineSpacing.value, 100);
    assert.ok(ps[2].formatSources.lineSpacing.includes("기본값"));
    assert.equal(ps[3].runs[0].declaredFontSizePt, 26);
    assert.equal(ps[3].runs[0].fontSizePt, 20.8);
    assert.equal(ps[3].runs[0].resolvedFonts.Hang.name, "궁서");
    assert.equal(ps[3].alignment, "r");
    assert.equal(ps[3].lineSpacing.value, 157.5);
    // 연결 누락/모호함은 하위 기본값으로 덮지 않습니다.
    const missing = fixture();
    delete missing["ppt/slideLayouts/layout9.xml"];
    const missingData = await extract(missing);
    assert.equal(missingData.slides[0].paragraphs[0].runs[0].fontSizePt, null);
    assert.equal(missingData.slides[0].paragraphs[0].alignment, null);
    assert.equal(missingData.slides[0].paragraphs[3].runs[0].fontSizePt, 20.8);
    const missingMaster = fixture();
    delete missingMaster["ppt/slideMasters/master7.xml"];
    const partialInheritance = (await extract(missingMaster)).slides[0].paragraphs[0];
    assert.equal(partialInheritance.runs[0].fontSizePt, 22); // 레이아웃의 명시 값은 사용 가능
    assert.equal(partialInheritance.alignment, "ctr");
    assert.equal(partialInheritance.lineSpacing, null); // 마스터가 없으므로 기본 100%로 추정 금지
    assert.equal(partialInheritance.runs[0].resolvedFonts.Hang, null);
    const duplicate = fixture();
    duplicate["ppt/slideLayouts/layout9.xml"] = duplicate["ppt/slideLayouts/layout9.xml"].replace('idx="99"', 'idx="7"');
    assert.equal((await extract(duplicate)).slides[0].paragraphs[0].runs[0].fontSizePt, null);
    const missingTheme = fixture();
    delete missingTheme["ppt/theme/theme8.xml"];
    const noTheme = (await extract(missingTheme)).slides[0].paragraphs;
    assert.equal(noTheme[0].runs[0].resolvedFonts.Hang, null);
    assert.equal(noTheme[0].runs[0].fontSizePt, 22);
    assert.equal(noTheme[3].runs[0].resolvedFonts.Hang.name, "궁서");
    const override = fixture();
    override["ppt/slideLayouts/_rels/layout9.xml.rels"] = rels(["master", "slideMaster", "../slideMasters/master7.xml"], ["override", "themeOverride", "../theme/override.xml"]);
    override["ppt/theme/override.xml"] = theme("굴림", "Override");
    assert.equal((await extract(override)).slides[0].paragraphs[0].runs[0].resolvedFonts.Hang.name, "굴림");
    const omittedScale = fixture();
    omittedScale["ppt/slides/slide1.xml"] = omittedScale["ppt/slides/slide1.xml"].replace(' fontScale="80000"', "");
    assert.equal((await extract(omittedScale)).slides[0].paragraphs[3].runs[0].fontSizePt, 26);
    const autoFitUnknown = fixture();
    autoFitUnknown["ppt/slides/slide1.xml"] = autoFitUnknown["ppt/slides/slide1.xml"].replace('fontScale="80000"', 'fontScale="invalid"');
    const fitMissing = (await extract(autoFitUnknown)).slides[0].paragraphs[3];
    assert.equal(fitMissing.runs[0].fontSizePt, null);
    assert.equal(fitMissing.lineSpacing, null);
    const twoMasters = fixture();
    twoMasters["ppt/presentation.xml"] = twoMasters["ppt/presentation.xml"].replace("</p:sldIdLst>", '<p:sldId id="257" r:id="slideB"/></p:sldIdLst>');
    twoMasters["ppt/_rels/presentation.xml.rels"] = rels(["slide", "slide", "slides/slide1.xml"], ["slideB", "slide", "slides/slide2.xml"]);
    twoMasters["ppt/slides/slide2.xml"] = twoMasters["ppt/slides/slide1.xml"];
    twoMasters["ppt/slides/_rels/slide2.xml.rels"] = rels(["layout", "slideLayout", "../slideLayouts/layoutB.xml"]);
    twoMasters["ppt/slideLayouts/layoutB.xml"] = twoMasters["ppt/slideLayouts/layout9.xml"];
    twoMasters["ppt/slideLayouts/_rels/layoutB.xml.rels"] = rels(["master", "slideMaster", "../slideMasters/masterB.xml"]);
    twoMasters["ppt/slideMasters/masterB.xml"] = twoMasters["ppt/slideMasters/master7.xml"];
    twoMasters["ppt/slideMasters/_rels/masterB.xml.rels"] = rels(["theme", "theme", "../theme/themeB.xml"]);
    twoMasters["ppt/theme/themeB.xml"] = theme("굴림");
    const multi = await extract(twoMasters);
    assert.equal(multi.slides[0].paragraphs[0].runs[0].resolvedFonts.Hang.name, "맑은 고딕");
    assert.equal(multi.slides[1].paragraphs[0].runs[0].resolvedFonts.Hang.name, "굴림");
    const strict = Object.fromEntries(Object.entries(fixture()).map(([name, xml]) => [name, xml
      .replaceAll(a, "http://purl.oclc.org/ooxml/drawingml/main")
      .replaceAll(p, "http://purl.oclc.org/ooxml/presentationml/main")
      .replaceAll(r, "http://purl.oclc.org/ooxml/officeDocument/relationships")
      .replace('val="175000"', 'val="175%"')]));
    const strictData = await extract(strict);
    assert.equal(strictData.slides[0].paragraphs[0].runs[0].fontSizePt, 22);
    assert.equal(strictData.slides[0].paragraphs[3].lineSpacing.value, 157.5);
    // 저장된 파일을 선택적으로 추가 검증합니다 (예: python-pptx 기본 템플릿).
    if (process.env.PPTX_SAMPLE) {
      const sample = await page.evaluate(async (bytes) => documentReader.extract(new File([new Uint8Array(bytes)], "sample.pptx"), "pptx"), [...fs.readFileSync(process.env.PPTX_SAMPLE)]);
      console.log("SAMPLE:", JSON.stringify(sample.slides.map((s) => s.paragraphs.map((p) => ({ text: p.text, size: p.runs[0]?.fontSizePt, font: p.runs[0]?.resolvedFonts.Hang?.name, alignment: p.alignment, lineSpacing: p.lineSpacing })))));
      if (process.env.PPTX_DEFAULT_SAMPLE === "1") {
        const sampleParagraphs = sample.slides[0].paragraphs;
        assert.deepEqual(sampleParagraphs.map((p) => p.runs[0].fontSizePt), [44, 32, 28, 18]);
        for (const p of sampleParagraphs) {
          assert.equal(p.runs[0].resolvedFonts.Hang.name, "맑은 고딕");
          assert.equal(p.lineSpacing.value, 100);
          assert.ok(p.alignment);
        }
        const report = await page.evaluate((document) => documentInspector.inspect(document, ["font-family", "font-size", "alignment", "line-spacing"], { fontFamily: "맑은 고딕", fontSize: 32, alignment: "left", lineSpacing: 100 }), sample);
        assert.equal(report.items[0].status, "pass");
        assert.equal(report.items[1].status, "fail");
        assert.equal(report.items[2].status, "fail");
        assert.equal(report.items[3].status, "pass");
        assert.ok(report.items.every((item) => item.counts.unknown === 0));
      }
    }
    console.log("PASS: layout/master/theme inheritance, placeholder matching, levels, direct overrides, fontScale, defaults and unknown fallbacks");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
