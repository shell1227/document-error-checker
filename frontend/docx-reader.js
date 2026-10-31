// DOCX: 본문(표·텍스트 상자 포함), 머리글·바닥글의 텍스트와 서식.
async function readDocx(read) {
  const { child: c, all, attr: a, number: n, merge } = documentReader;
  const doc = await read("word/document.xml", true);
  const stylesDoc = await read("word/styles.xml");
  const rels = await read("word/_rels/document.xml.rels");
  const relationships = new Map([...(rels?.documentElement.children || [])].map((rel) => [a(rel, "Id"), rel]));
  const related = async (kind) => {
    const matches = [...relationships.values()].filter((r) => (a(r, "Type") || "").endsWith(`/${kind}`));
    if (matches.length !== 1 || a(matches[0], "TargetMode") === "External" || !a(matches[0], "Target")) return null;
    return read(new URL(a(matches[0], "Target"), "https://document.local/word/document.xml").pathname.slice(1));
  };
  const theme = await related("theme"), settings = await related("settings"), numbering = await related("numbering");
  const themeLanguage = all(settings, "w", "themeFontLang")[0];
  function themeFont(token, key, textScript, runLanguage) {
    if (!/^(major|minor)(Ascii|HAnsi|EastAsia|Bidi)$/.test(token || "")) return null;
    const collection = all(theme, "a", token.startsWith("major") ? "majorFont" : "minorFont")[0];
    const language = runLanguage || a(themeLanguage, key === "eastAsia" ? "eastAsia" : key === "cs" ? "bidi" : "val");
    const languageScript = /^ko(-|$)/i.test(language || "") ? "Hang" : /^ja(-|$)/i.test(language || "") ? "Jpan"
      : /^zh-(CN|SG|Hans)(-|$)/i.test(language || "") ? "Hans" : /^zh-(TW|HK|MO|Hant)(-|$)/i.test(language || "") ? "Hant" : null;
    // 한글·가나는 문자 자체로 구분합니다. 공유 한자는 언어 설정이 필요합니다.
    const script = key === "eastAsia" ? ["Hang", "Jpan", "Hans", "Hant"].includes(textScript) ? textScript : languageScript : null;
    const fixed = a(c(collection, "a", key === "eastAsia" ? "ea" : key === "cs" ? "cs" : "latin"), "typeface");
    const supplemental = script ? all(collection, "a", "font").filter((f) => a(f, "script") === script) : [];
    const name = fixed || (script && supplemental.length === 1 ? a(supplemental[0], "typeface") : null);
    return name ? { name, source: `DOCX 테마 ${token} · ${fixed ? "영역 글꼴" : `문자 종류 ${script}`}${language ? ` · 언어 ${language}` : ""}` } : null;
  }
  const styles = new Map(all(stylesDoc, "w", "style").map((s) => [a(s, "styleId"), s]));
  const defaultStyle = [...styles.values()].find((s) => a(s, "type") === "paragraph" && ["1", "true"].includes(a(s, "default")));
  const defaultCharacter = [...styles.values()].find((s) => a(s, "type") === "character" && ["1", "true"].includes(a(s, "default")));
  function runFormat(properties) {
    const fonts = c(properties, "w", "rFonts");
    const result = {};
    const language = c(properties, "w", "lang");
    if (a(language, "eastAsia") !== null) result.eastAsiaLanguage = a(language, "eastAsia");
    if (a(language, "val") !== null) result.language = a(language, "val");
    for (const key of ["ascii", "hAnsi", "eastAsia", "cs", "asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"]) {
      if (a(fonts, key) !== null) result[key] = a(fonts, key);
    }
    // 상위 스타일의 테마 참조와 하위 직접 글꼴이 함께 남지 않게 합니다.
    for (const [direct, theme] of [["ascii", "asciiTheme"], ["hAnsi", "hAnsiTheme"], ["eastAsia", "eastAsiaTheme"], ["cs", "cstheme"]]) {
      if (result[theme]) result[direct] = null;
      else if (result[direct]) result[theme] = null;
    }
    const sizeElement = c(properties, "w", "sz");
    // 직접 값이 잘못되었으면 상위 스타일의 정상 값으로 덮지 않습니다.
    if (sizeElement) result.fontSizePt = n(a(sizeElement, "val"), 2);
    // 요소가 존재해도 val="0"/"false"이면 꺼진 설정입니다.
    for (const [tag, key] of [["cs", "useComplexScript"], ["rtl", "rightToLeft"]]) {
      const element = c(properties, "w", tag);
      if (!element) continue;
      const value = a(element, "val");
      result[key] = value === null || ["1", "true", "on"].includes(value) ? true
        : ["0", "false", "off"].includes(value) ? false : null;
    }
    return result;
  }
  function paragraphFormat(properties) {
    const result = {};
    const alignment = c(properties, "w", "jc");
    if (alignment) result.alignment = a(alignment, "val");
    const bidi = c(properties, "w", "bidi");
    if (bidi) result.bidirectional = a(bidi, "val") === null || ["1", "true", "on"].includes(a(bidi, "val")) ? true : ["0", "false", "off"].includes(a(bidi, "val")) ? false : null;
    const spacing = c(properties, "w", "spacing");
    for (const key of ["line", "lineRule", "before", "after"]) {
      if (a(spacing, key) !== null) result[key] = a(spacing, key);
    }
    return result;
  }
  function numberingProperties(properties) {
    const np = c(properties, "w", "numPr");
    const result = {};
    if (c(np, "w", "numId")) result.id = a(c(np, "w", "numId"), "val");
    if (c(np, "w", "ilvl")) result.level = a(c(np, "w", "ilvl"), "val");
    return result;
  }
  function styleChain(id, seen = new Set()) {
    if (!id || seen.has(id) || !styles.has(id)) return [];
    seen.add(id);
    const s = styles.get(id);
    return [...styleChain(a(c(s, "w", "basedOn"), "val"), seen), s];
  }
  const defaults = all(stylesDoc, "w", "docDefaults")[0];
  const defaultRun = runFormat(c(c(defaults, "w", "rPrDefault"), "w", "rPr"));
  const defaultParagraph = paragraphFormat(c(c(defaults, "w", "pPrDefault"), "w", "pPr"));
  const paragraphs = [];
  const textLimitations = new Set();
  let textUncertain = false;
  function hasAncestor(node, name) {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.localName === name) return true;
    }
    return false;
  }
  function incompleteStyle(id, seen = new Set()) {
    if (!id) return false;
    if (seen.has(id) || !styles.has(id)) return true;
    seen.add(id);
    return incompleteStyle(a(c(styles.get(id), "w", "basedOn"), "val"), seen);
  }
  function readPart(part, source) {
    if (!part) { textLimitations.add("참조된 문서 부분을 읽지 못했습니다."); return; }
    const unsupported = ["footnoteReference", "endnoteReference", "drawing", "pict", "object", "altChunk", "sym", "fldChar", "instrText"];
    if (unsupported.some((name) => all(part, "w", name).length) || part.getElementsByTagNameNS("*", "oMath").length) {
      textLimitations.add("각주·미주·그림·개체·필드·수식 등 일부 내용의 전체 텍스트는 확인하지 못합니다.");
    }
    if (["ins", "del", "moveFrom", "moveTo"].some((name) => all(part, "w", name).length)) {
      textUncertain = true;
      textLimitations.add("변경 추적의 최종 표시 내용을 확정하지 못합니다.");
    }
    all(part, "w", "p").forEach((p, index) => {
      const properties = c(p, "w", "pPr");
      const styleId = a(c(properties, "w", "pStyle"), "val") || a(defaultStyle, "styleId");
      const chain = styleChain(styleId);
      const formatUncertainReasons = [];
      let table = p.parentElement;
      while (table && table.localName !== "tbl") table = table.parentElement;
      const tableStyleId = table ? a(c(c(table, "w", "tblPr"), "w", "tblStyle"), "val") || a([...styles.values()].find((s) => a(s, "type") === "table" && ["1", "true"].includes(a(s, "default"))), "styleId") : null;
      const tableChain = styleChain(tableStyleId);
      const tableKnown = tableStyleId && !incompleteStyle(tableStyleId) && !tableChain.some((s) => all(s, "w", "tblStylePr").length);
      if (table && !tableKnown) formatUncertainReasons.push("표 스타일 연결 또는 조건부 서식을 해석하지 못합니다.");
      if (c(properties, "w", "numPr") || chain.some((s) => c(c(s, "w", "pPr"), "w", "numPr"))) formatUncertainReasons.push("번호 목록 서식 상속을 해석하지 못합니다.");
      if (incompleteStyle(styleId)) formatUncertainReasons.push("스타일 참조가 없거나 순환합니다.");
      if (all(p, "w", "pPrChange").length || ["ins", "del", "moveFrom", "moveTo"].some((name) => hasAncestor(p, name) || all(p, "w", name).length)) formatUncertainReasons.push("변경 추적 서식을 확정하지 못합니다.");
      const pf = merge(defaultParagraph, ...tableChain.map((s) => paragraphFormat(c(s, "w", "pPr"))), ...chain.map((s) => paragraphFormat(c(s, "w", "pPr"))), paragraphFormat(properties));
      const directParagraph = paragraphFormat(properties);
      const paragraphReasons = {
        alignment: Object.hasOwn(directParagraph, "alignment") ? formatUncertainReasons.filter((r) => !/표 스타일|번호 목록/.test(r)) : formatUncertainReasons,
        "line-spacing": Object.hasOwn(directParagraph, "line") && Object.hasOwn(directParagraph, "lineRule") ? formatUncertainReasons.filter((r) => !/표 스타일|번호 목록/.test(r)) : formatUncertainReasons
      };
      // 번호 수준의 문단 속성은 문단 스타일보다 뒤, 직접 속성보다 앞입니다.
      const num = merge(...chain.map((s) => numberingProperties(c(s, "w", "pPr"))), numberingProperties(properties));
      const instance = all(numbering, "w", "num").find((e) => a(e, "numId") === num.id);
      const abstract = all(numbering, "w", "abstractNum").find((e) => a(e, "abstractNumId") === a(c(instance, "w", "abstractNumId"), "val"));
      const level = num.level ?? "0";
      const override = all(instance, "w", "lvlOverride").find((e) => a(e, "ilvl") === level);
      const numberedLevel = c(override, "w", "lvl") || all(abstract, "w", "lvl").find((e) => a(e, "ilvl") === level);
      if (num.id === "0" || (numberedLevel && !c(abstract, "w", "numStyleLink"))) {
        if (num.id !== "0") Object.assign(pf, paragraphFormat(c(numberedLevel, "w", "pPr")), directParagraph);
        for (const key of Object.keys(paragraphReasons)) paragraphReasons[key] = paragraphReasons[key].filter((r) => !r.includes("번호 목록"));
      }
      const formatSources = {};
      // MS-OI29500 §17.3.1.13: Word는 전체 상속 계층에서 jc가 생략되면 왼쪽 정렬을 적용합니다.
      // 계층이 불완전하거나 RTL/표 조건이 미확정이면 이 규칙으로 보충하지 않습니다.
      if (!Object.hasOwn(pf, "alignment") && stylesDoc && !paragraphReasons.alignment.length && pf.bidirectional !== true && pf.bidirectional !== null) {
        pf.alignment = "left";
        formatSources.alignment = "Word 기본 정렬 규칙 (MS-OI29500 §17.3.1.13 · 전체 스타일 계층에서 정렬 생략)";
      }
      const runs = all(p, "w", "r").filter((r) => {
        let parent = r.parentElement;
        while (parent && parent.localName !== "p") parent = parent.parentElement;
        return parent === p;
      }).map((r) => {
        const rp = c(r, "w", "rPr");
        const characterId = a(c(rp, "w", "rStyle"), "val") || a(defaultCharacter, "styleId");
        const format = merge(defaultRun, ...tableChain.map((s) => runFormat(c(s, "w", "rPr"))), ...chain.map((s) => runFormat(c(s, "w", "rPr"))),
          ...styleChain(characterId).map((s) => runFormat(c(s, "w", "rPr"))), runFormat(rp));
        format.complexScript = !!(format.useComplexScript || format.rightToLeft);
        const text = [...r.children].map((node) => node.localName === "t" ? node.textContent : node.localName === "tab" ? "\t" : ["br", "cr"].includes(node.localName) ? "\n" : "").join("");
        const fontFamily = format.eastAsiaTheme ? null : format.eastAsia || (format.asciiTheme ? null : format.ascii || format.hAnsi || null);
        const runUncertainReasons = [...formatUncertainReasons];
        if (incompleteStyle(characterId)) runUncertainReasons.push("문자 스타일 참조를 해석하지 못합니다.");
        if (format.complexScript || format.useComplexScript === null || format.rightToLeft === null || all(r, "w", "rPrChange").length) runUncertainReasons.push("복합 문자 또는 변경 추적 서식을 해석하지 못합니다.");
        const directRun = runFormat(rp);
        const resolvedFonts = {};
        for (const key of ["ascii", "hAnsi", "eastAsia"]) {
          const token = format[`${key}Theme`];
          resolvedFonts[key] = token ? themeFont(token, key) : format[key] ? { name: format[key], source: "DOCX 직접 지정 또는 스타일 상속" } : null;
        }
        for (const script of ["Hang", "Jpan", "Hans", "Hant", "Han"]) {
          resolvedFonts[script] = format.eastAsiaTheme ? themeFont(format.eastAsiaTheme, "eastAsia", script, format.eastAsiaLanguage)
            : format.eastAsia ? { name: format.eastAsia, source: "DOCX 직접 지정 또는 스타일 상속" } : null;
        }
        const safeDirect = (key) => Object.hasOwn(directRun, key) || Object.hasOwn(directRun, `${key}Theme`);
        const formatReasons = {
          "font-family": (!/[!-~]/u.test(text) || safeDirect("ascii")) && (!/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) || safeDirect("eastAsia")) ? runUncertainReasons.filter((r) => !/표 스타일|번호 목록/.test(r)) : runUncertainReasons,
          "font-size": Object.hasOwn(directRun, "fontSizePt") ? runUncertainReasons.filter((r) => !/표 스타일|번호 목록/.test(r)) : runUncertainReasons
        };
        return { text, fontFamily, resolvedFonts, formatReasons, formatUncertainReasons: runUncertainReasons,
          fontSizePt: format.fontSizePt ?? null, fontSettings: format };
      }).filter((r) => r.text);
      const line = n(pf.line);
      paragraphs.push({ source, index: index + 1, styleId: styleId || null, formatUncertainReasons, formatReasons: paragraphReasons, formatSources,
        text: runs.map((r) => r.text).join(""), alignment: pf.alignment ?? null, bidirectional: pf.bidirectional ?? null,
        lineSpacing: line === null ? null : { value: line / ((pf.lineRule || "auto") === "auto" ? 2.4 : 20),
          unit: (pf.lineRule || "auto") === "auto" ? "percent" : "pt", rule: pf.lineRule || "auto" },
        spaceBeforePt: n(pf.before, 20), spaceAfterPt: n(pf.after, 20), runs });
    });
  }
  readPart(doc, "word/document.xml");
  // 관계 목록에 남은 미사용 부분이 아니라, 실제 섹션이 참조하는 부분만 읽습니다.
  const visited = new Set();
  for (const kind of ["header", "footer"]) {
    for (const reference of all(doc, "w", `${kind}Reference`)) {
      const id = a(reference, "id");
      const rel = relationships.get(id);
      if (!rel || !(a(rel, "Type") || "").endsWith(`/${kind}`) || a(rel, "TargetMode") === "External" || !a(rel, "Target")) {
        textLimitations.add("참조된 머리글·바닥글의 연결 정보를 확인하지 못했습니다.");
        continue;
      }
      const path = new URL(a(rel, "Target"), "https://document.local/word/document.xml").pathname.slice(1);
      if (!visited.has(path)) { readPart(await read(path), path); visited.add(path); }
    }
  }
  return { text: paragraphs.map((p) => p.text).join("\n"), paragraphs,
    textLimitations: [...textLimitations], textUncertain,
    pageCount: null, warnings: ["페이지 수는 문서를 실제 배치해야 정확하므로 추출하지 않습니다.",
      "기본·문단·문자 스타일, 번호 수준 문단 속성과 직접 서식을 읽습니다. 테마 글꼴은 연결된 테마와 언어 정보가 확인될 때 해석합니다.",
      "표·번호 목록의 조건부 서식, 변경 추적, 각주·미주·수식·이미지 텍스트는 완전하게 해석하지 않습니다. null은 확인할 수 없는 값입니다."] };
}
