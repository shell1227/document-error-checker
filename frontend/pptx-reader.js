// PPTX: presentation.xml의 관계 순서대로 슬라이드를 읽습니다.
async function readPptx(read) {
  const { child: c, all, attr: a } = documentReader;
  const presentation = await read("ppt/presentation.xml", true);
  const rels = await read("ppt/_rels/presentation.xml.rels", true);
  const relationships = new Map([...rels.documentElement.children].map((r) => [a(r, "Id"), r]));
  const slides = [];
  const textLimitations = new Set();
  for (const id of all(presentation, "p", "sldId")) {
    const relationshipId = [...id.attributes].find((v) => v.localName === "id" && v.namespaceURI)?.value;
    const rel = relationships.get(relationshipId);
    if (!rel || a(rel, "TargetMode") === "External" || !/\/slide$/.test(a(rel, "Type") || "")) throw new Error("슬라이드 연결 정보가 올바르지 않습니다.");
    const path = new URL(a(rel, "Target"), "https://document.local/ppt/presentation.xml").pathname.slice(1);
    const slide = await read(path, true);
    const styles = await readPptxStyles(read, presentation, path, slide);
    if (["pic", "oleObj"].some((name) => all(slide, "p", name).length) ||
      all(slide, "p", "graphicFrame").some((frame) => !all(frame, "a", "tbl").length)) {
      textLimitations.add("차트·SmartArt·그림·개체 안의 텍스트는 전체 확인하지 못합니다. 표의 일반 텍스트는 포함됩니다.");
    }
    const paragraphs = all(slide, "a", "p").map((p, index) => {
      const state = styles.forParagraph(p);
      const runs = [...p.children].filter((node) => ["r", "fld", "br"].includes(node.localName)).map((r) => {
        return { text: r.localName === "br" ? "\n" : c(r, "a", "t")?.textContent || "",
          ...styles.forRun(state, r) };
      });
      return { index: index + 1, text: runs.map((r) => r.text).join(""), level: state.level,
        placeholderType: state.placeholderType, placeholderIndex: state.placeholderIndex,
        alignment: state.paragraph.alignment ?? null, formatSources: state.sources,
        declaredLineSpacing: state.paragraph.lineSpacing ?? null,
        lineSpacing: styles.spacing(state),
        runs };
    });
    slides.push({ number: slides.length + 1, source: path, text: paragraphs.map((p) => p.text).join("\n"), paragraphs });
  }
  return { text: slides.map((s) => s.text).join("\n\n"), slideCount: slides.length, slides,
    textLimitations: [...textLimitations], textUncertain: false,
    warnings: ["슬라이드의 텍스트 상자·표를 XML 순서로 읽습니다. 화면의 읽기 순서와 다를 수 있습니다.",
      "레이아웃·마스터 자리 표시자, 문단 수준 스타일, 테마 글꼴을 따라 읽습니다. 연결이 불완전하거나 모호하면 값을 확정하지 않습니다.",
      "자동 맞춤은 저장된 축소율과 속성 생략 시의 표준 기본값을 반영합니다. PowerPoint가 다시 배치할 때의 결과는 보장하지 않습니다.",
      "노트·차트·SmartArt·이미지 안의 텍스트와 표 스타일의 상속은 완전히 해석하지 않습니다. 서식 출처는 formatSources에 보존합니다."] };
}
