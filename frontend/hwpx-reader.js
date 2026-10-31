// HWPX: 패키지의 구역 순서와 헤더의 서식 ID를 연결합니다.
async function readHwpx(read) {
  const { attr: a, number: n } = documentReader;
  const uri = (role) => [`http://www.hancom.co.kr/hwpml/2011/${role}`,
    `http://www.owpml.org/owpml/2021/${role}`, `http://www.owpml.org/owpml/2024/${role}`];
  const is = (node, role, name) => node?.localName === name && uri(role).includes(node.namespaceURI);
  const all = (node, role, name) => [...(node?.getElementsByTagNameNS("*", name) || [])].filter((e) => is(e, role, name));
  const child = (node, role, name) => [...(node?.children || [])].find((e) => is(e, role, name));
  const opf = "http://www.idpf.org/2007/opf/";
  const packageDoc = await read("Contents/content.hpf", true);
  const items = new Map([...packageDoc.getElementsByTagNameNS(opf, "item")].map((e) => [a(e, "id"), e]));
  const limitations = new Set();
  let textUncertain = false;
  function path(item) {
    const href = a(item, "href");
    if (!href || /[?#\\]|(^|\/)\.\.(\/|$)|^[a-z]+:/i.test(href)) throw new Error("HWPX 내부 파일 경로가 올바르지 않습니다.");
    // 한컴 파일은 패키지 루트 기준 Contents/... 경로를 사용합니다.
    return href.replace(/^\.\//, "").replace(/^\//, "").startsWith("Contents/")
      ? href.replace(/^\.\//, "").replace(/^\//, "") : `Contents/${href.replace(/^\.\//, "")}`;
  }
  const ordered = [...packageDoc.getElementsByTagNameNS(opf, "itemref")].map((e) => {
    const item = items.get(a(e, "idref"));
    if (!item) throw new Error("HWPX 구역 순서의 파일 참조가 없습니다.");
    return path(item);
  });
  const header = await read("Contents/header.xml", true);
  // switch의 case/default를 모두 읽으면 같은 본문을 중복 추출하게 됩니다.
  function selectBranches(node) {
    for (const sw of [...node.getElementsByTagNameNS("*", "switch")].reverse()) {
      if (!is(sw, "paragraph", "switch")) continue;
      const cases = [...sw.children].filter((e) => e.localName === "case");
      const known = cases.find((e) => a(e, "required-namespace") === "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar");
      const selected = known || [...sw.children].find((e) => e.localName === "default");
      if (!known && cases.length) {
        textUncertain = true;
        limitations.add("지원하지 않는 XML 분기는 기본 내용을 읽지만 최종 표시 내용을 확정하지 않습니다.");
      }
      if (!selected) { limitations.add("지원하지 않는 대체 XML 분기의 내용을 읽지 못했습니다."); sw.remove(); }
      else sw.replaceWith(...selected.childNodes);
    }
  }
  selectBranches(header);
  const maps = (name) => new Map(all(header, "head", name).map((e) => [a(e, "id"), e]));
  const chars = maps("charPr"), paras = maps("paraPr"), styles = maps("style");
  const fonts = new Map(all(header, "head", "fontface").map((face) => [a(face, "lang")?.toLowerCase(),
    new Map(all(face, "head", "font").map((font) => [a(font, "id"), a(font, "face")]))]));
  const paragraphs = [];
  let sectionCount = 0;
  for (const filename of ordered) {
    if (filename === "Contents/header.xml") continue;
    const section = await read(filename, true);
    if (!uri("section").includes(section.documentElement.namespaceURI) || section.documentElement.localName !== "sec") continue;
    sectionCount++;
    selectBranches(section);
    if (["pic", "ole", "equation", "chart", "video", "textart", "compose"].some((tag) => all(section, "paragraph", tag).length)) {
      limitations.add("그림·수식·OLE·차트·글맵시·겹친 글자의 전체 텍스트와 서식은 확인하지 못합니다.");
    }
    if (all(section, "paragraph", "fieldBegin").some((e) => a(e, "type") !== "HYPERLINK")) {
      limitations.add("자동 번호·날짜 등 필드의 최신 표시 값은 확정할 수 없습니다.");
      textUncertain = true;
    }
    if (["autoNum", "pageNum"].some((tag) => all(section, "paragraph", tag).length)) {
      limitations.add("자동 번호의 표시 텍스트는 추출하지 않습니다.");
    }
    if (["hiddenComment", "memo"].some((tag) => all(section, "paragraph", tag).length)) {
      textUncertain = true;
      limitations.add("메모·숨긴 내용이 있어 최종 표시 텍스트를 확정하지 못합니다.");
    }
    if ([...section.getElementsByTagNameNS("*", "secPr")].some((e) => Number(a(e, "masterPageCnt")) > 0)) limitations.add("별도 바탕쪽의 내용은 추출하지 않습니다.");
    if ([...section.getElementsByTagNameNS("*", "*")].some((e) => /^(insert|delete|trackChange)/i.test(e.localName))) {
      textUncertain = true;
      limitations.add("변경 추적의 최종 표시 내용을 확정할 수 없습니다.");
    }
    const nearest = (node, name) => { for (let p = node.parentElement; p; p = p.parentElement) if (is(p, "paragraph", name)) return p; return null; };
    for (const [index, p] of all(section, "paragraph", "p").entries()) {
      const style = styles.get(a(p, "styleIDRef"));
      const pp = paras.get(a(p, "paraPrIDRef") ?? a(style, "paraPrIDRef"));
      const align = a(child(pp, "head", "align"), "horizontal");
      const spacing = child(pp, "head", "lineSpacing");
      const spacingType = a(spacing, "type");
      const runs = all(p, "paragraph", "run").filter((r) => nearest(r, "p") === p).map((r) => {
        const cp = chars.get(a(r, "charPrIDRef") ?? a(style, "charPrIDRef"));
        const fontRef = child(cp, "head", "fontRef");
        const relSize = child(cp, "head", "relSz");
        const fontByScript = {}, sizeByScript = {};
        for (const script of ["hangul", "latin", "hanja", "japanese"]) {
          const name = fonts.get(script)?.get(a(fontRef, script));
          fontByScript[script] = name && !name.includes("\ufffd") ? name : null;
          const ratio = n(a(relSize, script));
          const base = n(a(cp, "height"), 100);
          sizeByScript[script] = base > 0 && ratio > 0 ? base * ratio / 100 : null;
        }
        if (child(cp, "head", "supscript") || child(cp, "head", "subscript")) {
          for (const script of Object.keys(sizeByScript)) sizeByScript[script] = null;
        }
        const text = all(r, "paragraph", "t").filter((t) => nearest(t, "run") === r && nearest(t, "p") === p).map((t) => {
          if ([...t.children].some((e) => !["tab", "lineBreak", "nbSpace", "fwSpace"].some((tag) => is(e, "paragraph", tag)))) {
            limitations.add("일부 특수 텍스트 요소는 추출하지 못했습니다.");
          }
          // 필드 명령이나 표의 내부 문단은 바깥 문단 텍스트로 합치지 않습니다.
          return [...t.childNodes].map((e) => e.nodeType === 3 ? e.textContent : is(e, "paragraph", "tab") ? "\t"
            : is(e, "paragraph", "lineBreak") ? "\n" : is(e, "paragraph", "nbSpace") ? "\u00a0"
              : is(e, "paragraph", "fwSpace") ? "\u3000" : "").join("");
        }).join("");
        return { text, fontByScript, sizeByScript, fontSizePt: n(a(cp, "height"), 100),
          formatSources: { fontSizePt: `HWPX 글자 서식 ${a(cp, "id") ?? "누락"}${a(r, "charPrIDRef") === null ? " · 문단 스타일 상속" : " · 직접 참조"}` },
          charPrId: a(cp, "id"), formatUncertainReasons: cp ? [] : ["글자 서식 ID를 찾을 수 없습니다."] };
      });
      paragraphs.push({ source: `구역 ${sectionCount} (${filename})`, index: index + 1,
        text: runs.map((r) => r.text).join(""), runs,
        formatSources: { alignment: `HWPX 문단 서식 ${a(pp, "id") ?? "누락"}${a(p, "paraPrIDRef") === null ? " · 스타일 상속" : " · 직접 참조"}`,
          lineSpacing: `HWPX 문단 서식 ${a(pp, "id") ?? "누락"} · 줄 간격 ${spacingType ?? "누락"}` },
        alignment: ({ LEFT: "left", RIGHT: "right", CENTER: "center", JUSTIFY: "both" })[align] || null,
        lineSpacing: spacingType === "PERCENT" ? { unit: "percent", value: n(a(spacing, "value")) }
          : spacing ? { unit: "hwpunit", value: n(a(spacing, "value")), rule: spacingType } : null,
        formatUncertainReasons: pp ? [] : ["문단 서식 ID를 찾을 수 없습니다."] });
    }
  }
  if (!sectionCount) throw new Error("HWPX 본문 구역을 찾을 수 없습니다.");
  if (n(a(header.documentElement, "secCnt")) !== sectionCount) limitations.add("헤더의 구역 수와 읽은 구역 수가 다릅니다.");
  return { paragraphs, text: paragraphs.map((p) => p.text).join("\n"), pageCount: null,
    textLimitations: [...limitations], textUncertain,
    warnings: ["HWPX의 저장된 서식 ID와 문자 종류별 글꼴·상대 크기를 비교합니다.",
      "페이지 수는 실제 배치가 필요하므로 검사 불가입니다. 구역 수나 쪽 시작 번호를 페이지 수로 사용하지 않습니다.",
      "고정·최소·여백 줄 간격은 %로 비교하지 않습니다. 글꼴 대체·바탕쪽·수식·이미지·일부 특수문자는 확인하지 못합니다.", ...limitations] };
}
