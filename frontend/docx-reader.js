// DOCX: 본문(표·텍스트 상자 포함), 머리글·바닥글의 텍스트와 서식.
async function readDocx(read) {
  const { child: c, all, attr: a, number: n, merge } = documentReader;
  const doc = await read("word/document.xml", true);
  const stylesDoc = await read("word/styles.xml");
  const styles = new Map(all(stylesDoc, "w", "style").map((s) => [a(s, "styleId"), s]));
  const defaultStyle = [...styles.values()].find((s) => a(s, "type") === "paragraph" && ["1", "true"].includes(a(s, "default")));
  function runFormat(properties) {
    const fonts = c(properties, "w", "rFonts");
    const result = {};
    for (const key of ["ascii", "hAnsi", "eastAsia", "cs", "asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"]) {
      if (a(fonts, key) !== null) result[key] = a(fonts, key);
    }
    // 상위 스타일의 테마 참조와 하위 직접 글꼴이 함께 남지 않게 합니다.
    for (const [direct, theme] of [["ascii", "asciiTheme"], ["hAnsi", "hAnsiTheme"], ["eastAsia", "eastAsiaTheme"], ["cs", "cstheme"]]) {
      if (result[theme]) result[direct] = null;
      else if (result[direct]) result[theme] = null;
    }
    const size = n(a(c(properties, "w", "sz"), "val"), 2);
    if (size !== null) result.fontSizePt = size;
    return result;
  }
  function paragraphFormat(properties) {
    const result = {};
    const alignment = a(c(properties, "w", "jc"), "val");
    if (alignment !== null) result.alignment = alignment;
    const spacing = c(properties, "w", "spacing");
    for (const key of ["line", "lineRule", "before", "after"]) {
      if (a(spacing, key) !== null) result[key] = a(spacing, key);
    }
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
  function readPart(part, source) {
    all(part, "w", "p").forEach((p, index) => {
      const properties = c(p, "w", "pPr");
      const styleId = a(c(properties, "w", "pStyle"), "val") || a(defaultStyle, "styleId");
      const chain = styleChain(styleId);
      const pf = merge(defaultParagraph, ...chain.map((s) => paragraphFormat(c(s, "w", "pPr"))), paragraphFormat(properties));
      const runs = all(p, "w", "r").filter((r) => {
        let parent = r.parentElement;
        while (parent && parent.localName !== "p") parent = parent.parentElement;
        return parent === p;
      }).map((r) => {
        const rp = c(r, "w", "rPr");
        const format = merge(defaultRun, ...chain.map((s) => runFormat(c(s, "w", "rPr"))),
          ...styleChain(a(c(rp, "w", "rStyle"), "val")).map((s) => runFormat(c(s, "w", "rPr"))), runFormat(rp));
        const text = [...r.children].map((node) => node.localName === "t" ? node.textContent : node.localName === "tab" ? "\t" : ["br", "cr"].includes(node.localName) ? "\n" : "").join("");
        const fontFamily = format.eastAsiaTheme ? null : format.eastAsia || (format.asciiTheme ? null : format.ascii || format.hAnsi || null);
        return { text, fontFamily,
          fontSizePt: format.fontSizePt ?? null, fontSettings: format };
      }).filter((r) => r.text);
      const line = n(pf.line);
      paragraphs.push({ source, index: index + 1, styleId: styleId || null,
        text: runs.map((r) => r.text).join(""), alignment: pf.alignment ?? null,
        lineSpacing: line === null ? null : { value: line / ((pf.lineRule || "auto") === "auto" ? 2.4 : 20),
          unit: (pf.lineRule || "auto") === "auto" ? "percent" : "pt", rule: pf.lineRule || "auto" },
        spaceBeforePt: n(pf.before, 20), spaceAfterPt: n(pf.after, 20), runs });
    });
  }
  readPart(doc, "word/document.xml");
  // 관계 파일에 참조된 머리글·바닥글을 읽습니다.
  const rels = await read("word/_rels/document.xml.rels");
  for (const rel of [...(rels?.documentElement.children || [])]) {
    if (/\/(header|footer)$/.test(a(rel, "Type") || "") && a(rel, "TargetMode") !== "External") {
      const path = new URL(a(rel, "Target"), "https://document.local/word/document.xml").pathname.slice(1);
      readPart(await read(path), path);
    }
  }
  return { text: paragraphs.map((p) => p.text).join("\n"), paragraphs,
    pageCount: null, warnings: ["페이지 수는 문서를 실제 배치해야 정확하므로 추출하지 않습니다.",
      "스타일 상속과 직접 서식을 읽습니다. 테마 글꼴 참조는 fontSettings에 보존하며 최종 글꼴로 확정하지 않습니다.",
      "표·번호 목록의 조건부 서식, 변경 추적, 각주·미주·수식·이미지 텍스트는 완전하게 해석하지 않습니다. null은 확인할 수 없는 값입니다."] };
}
