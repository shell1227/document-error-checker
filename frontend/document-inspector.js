// 추출과 비교를 분리합니다. 확인할 수 없는 값은 절대 일치로 세지 않습니다.
const documentInspector = (() => {
  const labels = {
    "font-family": "글꼴", "font-size": "글자 크기", alignment: "문단 정렬",
    "line-spacing": "줄 간격", "page-count": "문서 분량",
    "required-words": "필수 단어", spelling: "맞춤법·띄어쓰기"
  };
  const alignmentNames = { left: "왼쪽 정렬", center: "가운데 정렬", right: "오른쪽 정렬", justify: "양쪽 정렬" };
  const aliases = { "맑은 고딕": "malgun gothic", "굴림": "gulim", "돋움": "dotum", "바탕": "batang", "나눔고딕": "nanumgothic" };
  const fontName = (name) => {
    const key = name.normalize("NFC").trim().toLowerCase();
    return aliases[key] || key;
  };
  const equalNumber = (left, right) => Math.abs(left - right) < 0.001;
  const validNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
  const unknown = (location, expected, reason, text = "") => ({ status: "unknown", location, expected, actual: "확인 불가", reason, text });
  const compare = (location, expected, actual, equal, text = "") => ({ status: equal ? "pass" : "fail", location, expected, actual, text });
  function pdfFontName(name) {
    const compact = fontName(name).replace(/[\s_-]/g, "");
    // 알려진 PostScript 이름만 글꼴 가족 이름에 대응합니다. 임의의 접미사는 자르지 않습니다.
    const known = { arialmt: "arial", arialboldmt: "arial", arialitalicmt: "arial", arialbolditalicmt: "arial",
      helveticabold: "helvetica", helveticaoblique: "helvetica", helveticaboldoblique: "helvetica",
      timesroman: "times", timesbold: "times", timesitalic: "times", timesbolditalic: "times",
      timesnewromanpsmt: "timesnewroman", timesnewromanpsboldmt: "timesnewroman", timesnewromanpsitalicmt: "timesnewroman", timesnewromanpsbolditalicmt: "timesnewroman",
      courierbold: "courier", courieroblique: "courier", courierboldoblique: "courier",
      malgungothicbold: "malgungothic", "맑은고딕": "malgungothic" };
    return known[compact] || compact;
  }

  function paragraphs(document) {
    if (document.format === "pptx") {
      return document.slides.flatMap((s) => s.paragraphs.map((p) => ({ ...p, location: `슬라이드 ${s.number} · 문단 ${p.index}` })));
    }
    return document.paragraphs.map((p) => ({ ...p, location: `${p.source} · 문단 ${p.index}` }));
  }

  // 한글/한자/가나와 기본 영문·기호를 구분합니다. 그 밖의 문자 선택 규칙은 보수적으로 처리합니다.
  function fontGroups(text) {
    const groups = new Set();
    for (const character of text) {
      if (/\s/u.test(character)) continue;
      if (/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) groups.add("eastAsia");
      else if (character.codePointAt(0) >= 33 && character.codePointAt(0) <= 126) groups.add("latin");
      else groups.add("other");
    }
    return [...groups];
  }

  function pptxScripts(text, settings) {
    const scripts = new Set();
    // 한자의 테마 글꼴은 언어 정보가 있어야 한국어/일본어/중국어를 구분할 수 있습니다.
    const language = [settings.altLang, settings.lang].find((value) => /^(ko|ja|zh)(-|$)/i.test(value || "")) || "";
    const han = /^ko/i.test(language) ? "Hang" : /^ja/i.test(language) ? "Jpan"
      : /^zh-(CN|SG|Hans)(-|$)/i.test(language) ? "Hans" : /^zh-(TW|HK|MO|Hant)(-|$)/i.test(language) ? "Hant" : "Han";
    for (const character of text) {
      if (/\s/u.test(character)) continue;
      if (/\p{Script=Hangul}/u.test(character)) scripts.add("Hang");
      else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) scripts.add("Jpan");
      else if (/\p{Script=Han}/u.test(character)) scripts.add(han);
      else if (character.codePointAt(0) >= 33 && character.codePointAt(0) <= 126) scripts.add("latin");
      else scripts.add("other");
    }
    return [...scripts];
  }

  function checkFonts(document, list, criteria) {
    const rows = [];
    const expected = criteria.fontFamily;
    for (const p of list) {
      p.runs.forEach((run, index) => {
        if (!run.text.trim()) return;
        const location = `${p.location} · 글자 묶음 ${index + 1}`;
        const reasons = run.formatUncertainReasons || p.formatUncertainReasons || [];
        if (reasons.length || !expected) {
          rows.push(unknown(location, expected, reasons.join(" ") || "글꼴 기준이 없습니다.", run.text));
          return;
        }
        const fonts = run.fontSettings || {};
        if (document.format === "pdf") {
          rows.push(run.fontNameKnown && expected ? compare(location, expected, run.fontFamily,
            pdfFontName(expected) === pdfFontName(run.fontFamily), run.text)
            : unknown(location, expected, "PDF에 지정된 글꼴 이름을 확정하지 못했습니다. 대체 글꼴 이름은 비교하지 않습니다.", run.text));
          return;
        }
        if (document.format === "hwpx") {
          for (const script of hwpxScripts(run.text)) {
            const actual = run.fontByScript?.[script];
            rows.push(actual ? compare(`${location} (${script})`, expected, actual, fontName(expected) === fontName(actual), run.text)
              : unknown(location, expected, "문자 종류별 HWPX 글꼴 참조를 확인할 수 없습니다.", run.text));
          }
          return;
        }
        if (document.format === "pptx" && run.resolvedFonts) {
          const scriptNames = { Hang: "한글", Jpan: "일본어", Hans: "중국어 간체", Hant: "중국어 번체", latin: "기본 영문·기호", Han: "언어 미확정 한자", other: "기타 문자" };
          for (const script of pptxScripts(run.text, fonts)) {
            const resolved = run.resolvedFonts[script];
            const scope = `${location} (${scriptNames[script]})`;
            rows.push(resolved?.name
              ? { ...compare(scope, expected, resolved.name, fontName(expected) === fontName(resolved.name), run.text), source: resolved.source }
              : unknown(scope, expected, "문자별 테마 글꼴·언어 또는 상속 연결을 확정할 수 없습니다.", run.text));
          }
          return;
        }
        for (const group of fontGroups(run.text)) {
          const key = document.format === "docx" && group === "latin" ? "ascii" : group;
          const theme = document.format === "docx" ? fonts[`${key}Theme`] : null;
          const actual = fonts[key];
          const scope = `${location} (${group === "eastAsia" ? "한글·한자·가나" : group === "latin" ? "기본 영문·기호" : "기타 문자"})`;
          if (group === "other" || fonts.complexScript || theme || !actual || actual.startsWith("+") ||
            (document.format === "docx" && key === "eastAsia" && actual.toLowerCase() === "times new roman")) {
            rows.push(unknown(scope, expected, "문자별 글꼴이 없거나 테마·복합 문자 선택 규칙을 확정할 수 없습니다.", run.text));
          } else {
            rows.push(compare(scope, expected, actual, fontName(expected) === fontName(actual), run.text));
          }
        }
      });
    }
    return rows;
  }

  function hwpxScripts(text) {
    return [...new Set([...text].filter((c) => !/\s/u.test(c)).map((c) => /\p{Script=Hangul}/u.test(c) ? "hangul"
      : /\p{Script=Han}/u.test(c) ? "hanja" : /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c) ? "japanese"
        : /^[\x21-\x7e]$/.test(c) ? "latin" : "unknown"))];
  }

  function checkFormatting(id, document, list, criteria) {
    if (id === "font-family") return checkFonts(document, list, criteria);
    if (document.format === "pdf" && ["alignment", "line-spacing"].includes(id)) {
      return [unknown("PDF 전체", id === "alignment" ? alignmentNames[criteria.alignment] : `${criteria.lineSpacing}%`,
        "PDF 좌표만으로 원본 문단의 정렬이나 % 줄 간격을 정확히 복원할 수 없습니다.")];
    }
    const rows = [];
    for (const p of list) {
      if (!p.text.trim()) continue;
      const expected = id === "font-size" ? `${criteria.fontSize} pt` : id === "alignment" ? alignmentNames[criteria.alignment] : `${criteria.lineSpacing}%`;
      if (id === "font-size") {
        p.runs.forEach((run, index) => {
          if (!run.text.trim()) return;
          const location = `${p.location} · 글자 묶음 ${index + 1}`;
          const reasons = run.formatUncertainReasons || p.formatUncertainReasons || [];
          if (document.format === "hwpx") {
            for (const script of hwpxScripts(run.text)) {
              const size = run.sizeByScript?.[script];
              rows.push(!reasons.length && validNumber(size) && validNumber(criteria.fontSize)
                ? compare(`${location} (${script})`, expected, `${size} pt`, equalNumber(size, criteria.fontSize), run.text)
                : unknown(location, expected, reasons.join(" ") || "문자별 상대 크기 또는 위·아래 첨자 크기를 확정할 수 없습니다.", run.text));
            }
            return;
          }
          if (reasons.length || (run.automaticFit && !run.fontSizeResolved) || !validNumber(run.fontSizePt) || !validNumber(criteria.fontSize) || (document.format === "docx" && fontGroups(run.text).includes("other"))) {
            rows.push(unknown(location, expected, reasons.join(" ") || "글자 크기 누락, 자동 맞춤 또는 지원하지 않는 문자 서식으로 크기를 확정할 수 없습니다.", run.text));
          } else rows.push({ ...compare(location, expected, `${run.fontSizePt} pt`, equalNumber(run.fontSizePt, criteria.fontSize), run.text),
            source: run.formatSources?.fontSizePt ? `${run.formatSources.fontSizePt}${run.automaticFit ? ` · 파일 기준 축소율 ${run.fontScale * 100}% · ${run.formatSources.fit}` : ""}` : undefined });
        });
        continue;
      }
      if (p.formatUncertainReasons?.length) {
        rows.push(unknown(p.location, expected, p.formatUncertainReasons.join(" "), p.text));
        continue;
      }
      if (id === "alignment") {
        const map = document.format !== "pptx"
          ? { left: "left", center: "center", right: "right", both: "justify" }
          : { l: "left", ctr: "center", r: "right", just: "justify" };
        const actual = map[p.alignment];
        rows.push({ ...(actual && expected
          ? compare(p.location, expected, alignmentNames[actual], actual === criteria.alignment, p.text)
          : unknown(p.location, expected, "정렬 값이 없거나 방향 의존·배분 정렬 등 현재 비교하지 않는 값입니다.", p.text)), source: p.formatSources?.alignment });
      } else {
        const spacing = p.lineSpacing;
        rows.push({ ...(spacing?.unit === "percent" && validNumber(spacing.value) && validNumber(criteria.lineSpacing)
          ? compare(p.location, expected, `${spacing.value}%`, equalNumber(spacing.value, criteria.lineSpacing), p.text)
          : unknown(p.location, expected, spacing?.unit === "pt" ? "고정·최소 줄 간격(pt)은 사용자가 입력한 % 기준으로 정확히 환산할 수 없습니다." : "줄 간격 또는 자동 맞춤 축소율을 확인할 수 없습니다.", p.text)), source: p.formatSources?.lineSpacing });
      }
    }
    return rows;
  }

  function inspect(document, selectedItems, criteria) {
    const list = paragraphs(document);
    const items = selectedItems.map((id) => {
      let details = [];
      if (["font-family", "font-size", "alignment", "line-spacing"].includes(id)) {
        details = checkFormatting(id, document, list, criteria);
        for (const limitation of document.textLimitations || []) {
          details.push(unknown("추출 범위 밖", "문서 전체 기본 형식", limitation));
        }
      } else if (id === "page-count") {
        const expected = `${criteria.minLength ?? "제한 없음"} ~ ${criteria.maxLength ?? "제한 없음"} ${document.format === "pptx" ? "슬라이드" : "페이지"}`;
        if (document.format === "pdf") {
          const count = document.pageCount;
          const limitsValid = [criteria.minLength, criteria.maxLength].every((v) => v == null || (Number.isInteger(v) && v >= 1)) &&
            (criteria.minLength != null || criteria.maxLength != null) &&
            (criteria.minLength == null || criteria.maxLength == null || criteria.minLength <= criteria.maxLength);
          details.push(Number.isInteger(count) && count > 0 && criteria.lengthUnit === "pages" && limitsValid
            ? compare("PDF 전체 (빈 페이지 포함)", expected, `${count} 페이지`,
              (criteria.minLength == null || count >= criteria.minLength) && (criteria.maxLength == null || count <= criteria.maxLength))
            : unknown("PDF 전체", expected, "PDF 페이지 수 또는 분량 기준을 확인할 수 없습니다."));
        }
        else if (document.format !== "pptx") details.push(unknown("문서 전체", expected, `${document.format.toUpperCase()}의 정확한 페이지 수는 실제 문서 배치가 필요합니다. 저장된 통계·구역 수를 정답으로 사용하지 않습니다.`));
        else if (!Number.isInteger(document.slideCount) || document.slideCount < 0 || criteria.lengthUnit !== "slides" ||
          (criteria.minLength == null && criteria.maxLength == null)) details.push(unknown("문서 전체", expected, "슬라이드 수 또는 분량 기준을 확인할 수 없습니다."));
        else details.push(compare("문서 전체 (숨김 슬라이드 포함)", expected, `${document.slideCount} 슬라이드`,
          (criteria.minLength == null || document.slideCount >= criteria.minLength) && (criteria.maxLength == null || document.slideCount <= criteria.maxLength)));
      } else if (id === "required-words") {
        for (const word of criteria.requiredWords || []) {
          const found = document.text.normalize("NFC").includes(word.normalize("NFC"));
          if (document.textUncertain || (!found && document.textLimitations?.length)) {
            details.push(unknown("문서 텍스트", word, document.textUncertain ? "변경 추적·자동 필드·숨긴 내용 또는 XML 분기로 최종 텍스트를 확정할 수 없습니다." : "추출되지 않은 내용이 있어 문서 전체에서 단어가 없다고 확정할 수 없습니다."));
          } else details.push(compare("추출한 문서 텍스트", word, found ? "포함" : "미포함", found));
        }
      } else details.push(unknown("문서 전체", "맞춤법·띄어쓰기", "맞춤법·띄어쓰기 검사기는 아직 구현하지 않았습니다."));
      if (!details.length) details.push(unknown("문서 전체", labels[id], "비교할 텍스트·서식 또는 검사 기준이 없습니다."));
      const counts = { pass: 0, fail: 0, unknown: 0 };
      details.forEach((row) => counts[row.status]++);
      return { id, label: labels[id] || id, status: counts.fail ? "fail" : counts.unknown ? "unknown" : "pass", counts, details };
    });
    return { fileName: document.fileName, format: document.format, criteria, items,
      scope: document.format === "pdf" ? "PDF의 추출 가능한 텍스트 조각, 지정 글꼴 이름, 좌표 변환을 반영한 글자 크기(pt), 페이지 수를 비교합니다. 원본 문단 정렬과 % 줄 간격은 복원하지 않습니다. 읽기 순서와 OCR·그림·주석·필드에는 제한이 있으며 실제 화면 표시나 원본 편집 서식을 보장하지 않습니다."
        : "추출 가능한 본문·표·텍스트 상자·머리글·바닥글 또는 슬라이드의 저장 서식을 비교합니다. 제목·본문을 구분하지 않으며 빈 문단·공백만 있는 글자 묶음은 제외합니다. 글꼴은 설치 여부나 실제 렌더링 결과가 아닌 문서에 지정된 이름을 비교합니다." };
  }
  return { inspect };
})();
