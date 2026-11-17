// 구조가 명시된 작은 XML 패키지와 유효 tagged PDF. 외부 서비스 없이 테스트합니다.
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const families = ["맑은 고딕", "바탕", "굴림"];
function docx(unknown = false) {
  const paragraph = (id, text) => `<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
  return {
    "word/document.xml": `<w:document xmlns:w="${w}"><w:body>${paragraph("Title", "문서 제목")}${paragraph("CustomHeading", "소제목")}${paragraph("Normal", "본문 내용")}${unknown ? paragraph("Fancy", "직접 꾸민 문단") : ""}</w:body></w:document>`,
    "word/styles.xml": `<w:styles xmlns:w="${w}">${["Title", "Heading1", "Normal"].map((id, i) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:pPr>${i === 1 ? '<w:outlineLvl w:val="0"/>' : ""}</w:pPr><w:rPr><w:rFonts w:eastAsia="${families[i]}"/><w:sz w:val="${[48, 32, 22][i]}"/></w:rPr></w:style>`).join("")}<w:style w:type="paragraph" w:styleId="CustomHeading"><w:name w:val="내 소제목"/><w:basedOn w:val="Heading1"/></w:style><w:style w:type="paragraph" w:styleId="Fancy"><w:name w:val="임의 스타일"/><w:basedOn w:val="Normal"/></w:style></w:styles>`
  };
}
function pptx(unknown = false) {
  const shape = (type, i) => `<p:sp><p:nvSpPr><p:nvPr>${type ? `<p:ph type="${type}" idx="${i}"/>` : ""}</p:nvPr></p:nvSpPr><p:txBody><a:bodyPr><a:noAutofit/></a:bodyPr><a:p><a:r><a:rPr sz="${[2400, 1600, 1100, 1100][i]}"><a:ea typeface="${families[i] || families[2]}"/></a:rPr><a:t>${["문서 제목", "소제목", "본문 내용", "임의 상자"][i]}</a:t></a:r></a:p></p:txBody></p:sp>`;
  return {
    "ppt/presentation.xml": `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="s" Type="${r}/slide" Target="slides/slide1.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree>${["ctrTitle", "subTitle", "body", ...(unknown ? [null] : [])].map(shape).join("")}</p:spTree></p:cSld></p:sld>`
  };
}
function hwpx(unknown = false) {
  const hh = "http://www.hancom.co.kr/hwpml/2011/head", hp = "http://www.hancom.co.kr/hwpml/2011/paragraph";
  return {
    "Contents/content.hpf": '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest><opf:item id="s" href="section0.xml"/></opf:manifest><opf:spine><opf:itemref idref="s"/></opf:spine></opf:package>',
    "Contents/header.xml": `<hh:head xmlns:hh="${hh}" secCnt="1"><hh:fontface lang="HANGUL">${families.map((f, i) => `<hh:font id="${i}" face="${f}"/>`).join("")}</hh:fontface>${[0, 1, 2, 3].map((i) => `<hh:charPr id="${i}" height="${[2400, 1600, 1100, 1100][i]}"><hh:fontRef hangul="${Math.min(i, 2)}"/><hh:relSz hangul="100"/></hh:charPr><hh:paraPr id="${i}">${i === 1 ? '<hh:heading type="OUTLINE" level="1"/>' : ""}</hh:paraPr><hh:style id="${i}" name="${["제목", "사용자 개요", "바탕글", "임의 스타일"][i]}" charPrIDRef="${i}" paraPrIDRef="${i}"/>`).join("")}</hh:head>`,
    "Contents/section0.xml": `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="${hp}">${[0, 1, 2, ...(unknown ? [3] : [])].map((i) => `<hp:p styleIDRef="${i}"><hp:run><hp:t>${["문서 제목", "소제목", "본문 내용", "임의 문단"][i]}</hp:t></hp:run></hp:p>`).join("")}</hs:sec>`
  };
}
function pdf(unknown = false, tagged = true, conflict = false) {
  const texts = ["Document Title", "Section Heading", "Body text", ...(unknown ? ["Unknown text"] : [])];
  let stream = texts.map((text, i) => `${tagged && i < 3 ? `/${["Title", "H1", "P"][i]} << /MCID ${i} >> BDC` : ""} BT /F${Math.min(i + 1, 3)} ${[24, 16, 11, 11][i]} Tf 30 ${450 - i * 60} Td (${text}) Tj ET ${tagged && i < 3 ? "EMC" : ""}`).join("\n");
  if (conflict) stream += '\n/P << /MCID 2 >> BDC BT /F3 11 Tf 30 200 Td (Repeated content) Tj ET EMC';
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${tagged ? "/StructTreeRoot 8 0 R /MarkInfo << /Marked true >>" : ""} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /StructParents 0 /MediaBox [0 0 500 500] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /StructTreeRoot /K [9 0 R] /ParentTree 13 0 R >>",
    `<< /Type /StructElem /S /Document /P 8 0 R /K [10 0 R 11 0 R 12 0 R ${conflict ? "14 0 R" : ""}] >>`,
    "<< /Type /StructElem /S /Title /P 9 0 R /Pg 3 0 R /K 0 >>",
    "<< /Type /StructElem /S /H1 /P 9 0 R /Pg 3 0 R /K 1 >>",
    "<< /Type /StructElem /S /P /P 9 0 R /Pg 3 0 R /K 2 >>",
    "<< /Nums [0 [10 0 R 11 0 R 12 0 R]] >>",
    ...(conflict ? ["<< /Type /StructElem /S /H2 /P 9 0 R /Pg 3 0 R /K 2 >>"] : [])
  ];
  let result = "%PDF-2.0\n";
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const start = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}
module.exports = { docx, pptx, hwpx, pdf };
