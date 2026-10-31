// PDF.js로 저장된 텍스트와 배치 정보를 읽습니다. 원본 워드 문단은 추측하지 않습니다.
const pdfAssetBase = new URL("vendor/pdfjs/", document.currentScript?.src || document.baseURI);
async function readPdf(file) {
  let pdfjs;
  try { pdfjs = await import(new URL("pdf.min.mjs", pdfAssetBase).href); }
  catch { throw new Error("PDF 읽기 도구를 불러오지 못했습니다. HTTP 주소로 접속한 뒤 다시 시도하세요."); }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", pdfAssetBase).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: new URL("cmaps/", pdfAssetBase).href, cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", pdfAssetBase).href,
    fontExtraProperties: true, isEvalSupported: false, useWasm: false,
    stopAtErrors: true, enableXfa: false });
  const paragraphs = [], pages = [], limitations = new Set();
  let textUncertain = false, textLength = 0;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 500) throw new Error("현재 PDF는 500페이지 이하만 검사할 수 있습니다.");
    let optional;
    try { optional = await pdf.getOptionalContentConfig(); }
    catch { textUncertain = true; limitations.add("PDF 레이어 정보를 읽지 못했습니다."); }
    if (optional && [...optional].length) {
      textUncertain = true;
      limitations.add("선택적 레이어가 있어 최종 표시 텍스트를 확정하지 못합니다.");
    }
    if (pdf.isPureXfa) limitations.add("XFA 양식 내용은 읽지 못합니다.");
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let operators;
        try { operators = await page.getOperatorList(); } // 지정 글꼴 정보가 준비된 뒤 조회합니다.
        catch {
          operators = { fnArray: [], argsArray: [] };
          textUncertain = true;
          limitations.add(`페이지 ${pageNumber}: 그리기 정보를 읽지 못해 글꼴과 텍스트 표시 여부를 확정하지 못합니다.`);
        }
        if (operators.fnArray.length > 300000) throw new Error("PDF 페이지의 구성 요소가 너무 많습니다.");
        const ops = pdfjs.OPS;
        if (operators.fnArray.some((id) => [ops.paintImageXObject, ops.paintInlineImageXObject,
          ops.paintImageMaskXObject, ops.paintImageXObjectRepeat, ops.constructPath, ops.shadingFill].includes(id))) {
          limitations.add(`페이지 ${pageNumber}: 그림·벡터 도형 안의 글자는 OCR로 읽지 않습니다.`);
        }
        if (operators.fnArray.some((id, i) => id === ops.clip || id === ops.eoClip ||
          (id === ops.setTextRenderingMode && operators.argsArray[i][0] >= 3))) {
          textUncertain = true;
          limitations.add(`페이지 ${pageNumber}: 숨김·클리핑 텍스트의 실제 표시 여부를 확정하지 못합니다.`);
        }
        if ((await page.getAnnotations()).length) limitations.add(`페이지 ${pageNumber}: 주석·입력 양식의 텍스트는 검사 범위에서 제외됩니다.`);
        let pageText = "", previous = null, index = 0;
        for (const item of content.items) {
          if (typeof item.str !== "string") continue;
          const style = content.styles[item.fontName];
          let font;
          try { font = page.commonObjs.get(item.fontName); } catch { /* 지정 이름이 없으면 검사 불가 */ }
          const rawName = typeof font?.name === "string" ? font.name : null;
          const fontFamily = rawName?.replace(/^[A-Z]{6}\+/, "").trim() || null;
          const t = item.transform;
          const widthScale = Math.hypot(t[0], t[1]), heightScale = Math.hypot(t[2], t[3]);
          const orthogonal = widthScale > 0 && heightScale > 0 && Math.abs(t[0] * t[2] + t[1] * t[3]) / (widthScale * heightScale) < 0.001;
          const sizeKnown = orthogonal && Math.abs(widthScale - heightScale) < 0.001 && !style?.vertical && font && !font.isType3Font && !font.isInvalidPDFjsFont;
          const fontSizePt = sizeKnown ? Math.round(heightScale * page.userUnit * 1000) / 1000 : null;
          if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd\ue000-\uf8ff]/u.test(item.str)) {
            textUncertain = true;
            limitations.add(`페이지 ${pageNumber}: 일부 문자의 유니코드 변환을 확정하지 못합니다.`);
          }
          if (previous && !pageText.endsWith("\n")) {
            // 같은 가로줄의 인접 조각만 붙입니다. 다른 줄·세로쓰기 순서는 추측하지 않습니다.
            if (Math.abs(t[5] - previous.transform[5]) > 0.5 || t[1] !== 0 || t[2] !== 0) pageText += "\n";
            else if (t[4] - (previous.transform[4] + previous.width) > heightScale * 0.2 && !/\s$/.test(pageText)) pageText += " ";
          }
          pageText += item.str + (item.hasEOL ? "\n" : "");
          previous = item;
          if (!item.str.trim()) continue;
          const run = { text: item.str, fontFamily, rawFontName: rawName,
            fontSizeUnknownReason: !font ? "PDF 글꼴 리소스를 읽지 못했습니다." : style?.vertical ? "세로쓰기 PDF의 글자 크기는 확정하지 않습니다."
              : font.isType3Font || font.isInvalidPDFjsFont ? "Type3 또는 유효하지 않은 PDF 글꼴의 크기는 확정하지 않습니다."
                : !orthogonal ? "PDF 텍스트에 기울임·전단 변환이 적용되어 크기를 확정하지 못합니다."
                  : Math.abs(widthScale - heightScale) >= 0.001 ? "PDF 텍스트에 가로·세로 비균등 확대가 적용되어 원래 글자 크기를 확정하지 못합니다." : null,
            fontNameKnown: Boolean(fontFamily && !fontFamily.includes("\ufffd") && !/^(g_d\d|sans-serif$|serif$|monospace$)/i.test(fontFamily) && !font?.isType3Font && !font?.isInvalidPDFjsFont),
            fontSizePt, transform: [...t], x: t[4], y: t[5], width: item.width, height: item.height };
          paragraphs.push({ source: `페이지 ${pageNumber} · 텍스트 조각`, index: ++index,
            text: item.str, runs: [run], alignment: null, lineSpacing: null });
        }
        if (!pageText.trim()) limitations.add(`페이지 ${pageNumber}: 읽을 수 있는 텍스트가 없습니다. 스캔·윤곽선 글자 또는 빈 페이지일 수 있습니다.`);
        textLength += pageText.length;
        if (textLength > 2000000) throw new Error("PDF 추출 텍스트가 너무 큽니다.");
        pages.push({ number: pageNumber, text: pageText, userUnit: page.userUnit });
      } catch (error) {
        if (/너무/.test(error.message || "")) throw error;
        limitations.add(`페이지 ${pageNumber}: 일부 텍스트·서식을 읽지 못했습니다.`);
        pages.push({ number: pageNumber, text: "" });
      } finally { page.cleanup(); }
    }
    return { paragraphs, pages, text: pages.map((p) => p.text).join("\n"), pageCount: pdf.numPages,
      textUncertain, textLimitations: [...limitations], warnings: [
        "PDF 페이지 수는 실제 페이지 트리에서 확인합니다. 페이지에 표시된 쪽 번호와는 다릅니다.",
        "지정 글꼴 이름과 좌표 변환을 반영한 글자 크기(pt)를 비교합니다. 원본 편집기의 글자 크기나 실제 대체 글꼴은 확정하지 않습니다.",
        "PDF 텍스트 조각은 원본 문단이 아닙니다. 문단 정렬과 % 줄 간격은 검사 불가입니다.",
        "스캔·그림·윤곽선 글자 OCR은 지원하지 않습니다. 다단·읽기 순서·줄바꿈에 걸친 단어 검색은 제한됩니다.", ...limitations] };
  } catch (error) {
    if (error.name === "PasswordException") throw new Error("암호로 보호된 PDF는 현재 읽을 수 없습니다. 암호가 없는 사본을 선택하세요.");
    if (/너무|500페이지/.test(error.message || "")) throw error;
    if (["TypeError", "ReferenceError"].includes(error.name)) {
      throw new Error("PDF 읽기 도구에서 내부 오류가 발생했습니다. 페이지를 새로고침하고 최신 배포가 반영되었는지 확인하세요.", { cause: error });
    }
    if (error.name === "InvalidPDFException") throw new Error("PDF 파일 구조를 읽을 수 없습니다. 다른 PDF 뷰어에서 정상적으로 열리는지 확인하세요.", { cause: error });
    throw new Error("PDF 정보를 읽지 못했습니다. 파일 형식 또는 PDF 읽기 도구의 상태를 확인하세요.", { cause: error });
  } finally { await task.destroy(); }
}
