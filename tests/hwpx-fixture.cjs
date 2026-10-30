// 서식과 참조가 명확한 최소 HWPX 테스트 패키지. 실제 한컴 문서 테스트와 함께 사용합니다.
const hh = "http://www.hancom.co.kr/hwpml/2011/head";
const hp = "http://www.hancom.co.kr/hwpml/2011/paragraph";
module.exports = function hwpxFixture() {
  const paragraph = (text, id = "0") => `<hp:p paraPrIDRef="${id}" styleIDRef="0"><hp:run charPrIDRef="${id}"><hp:t>${text}</hp:t></hp:run></hp:p>`;
  return {
    mimetype: "application/hwp+zip",
    "Contents/content.hpf": '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest><opf:item id="h" href="Contents/header.xml"/><opf:item id="s1" href="Contents/section1.xml"/><opf:item id="s0" href="Contents/section0.xml"/></opf:manifest><opf:spine><opf:itemref idref="h"/><opf:itemref idref="s1"/><opf:itemref idref="s0"/></opf:spine></opf:package>',
    "Contents/header.xml": `<hh:head xmlns:hh="${hh}" xmlns:hp="${hp}" secCnt="2"><hh:refList><hh:fontfaces>${["HANGUL", "LATIN", "HANJA", "JAPANESE"].map((lang) => `<hh:fontface lang="${lang}"><hh:font id="0" face="바탕"/></hh:fontface>`).join("")}</hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1200"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:lineSpacing type="PERCENT" value="160"/></hp:case><hp:default><hh:lineSpacing type="PERCENT" value="140"/></hp:default></hp:switch></hh:paraPr></hh:paraProperties><hh:styles><hh:style id="0" paraPrIDRef="0" charPrIDRef="0"/></hh:styles></hh:refList></hh:head>`,
    "Contents/section1.xml": `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="${hp}">${paragraph("서론ABC漢字かな")}<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:tbl><hp:tr><hp:tc><hp:subList>${paragraph("표 내용")}</hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`,
    "Contents/section0.xml": `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="${hp}">${paragraph("결론")}</hs:sec>`
  };
};
