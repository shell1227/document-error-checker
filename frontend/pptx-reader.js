// PPTX: presentation.xml의 관계 순서대로 슬라이드를 읽습니다.
async function readPptx(read) {
  const { child: c, all, attr: a, number: n, merge } = documentReader;
  const presentation = await read("ppt/presentation.xml", true);
  const rels = await read("ppt/_rels/presentation.xml.rels", true);
  const relationships = new Map([...rels.documentElement.children].map((r) => [a(r, "Id"), r]));
  function runFormat(rp) {
    const result = {};
    for (const [tag, key] of [["latin", "latin"], ["ea", "eastAsia"], ["cs", "complexScript"]]) {
      const value = a(c(rp, "a", tag), "typeface");
      if (value) result[key] = value;
    }
    const size = n(a(rp, "sz"), 100);
    if (size !== null) result.fontSizePt = size;
    return result;
  }
  const slides = [];
  for (const id of all(presentation, "p", "sldId")) {
    const relationshipId = [...id.attributes].find((v) => v.localName === "id" && v.namespaceURI)?.value;
    const rel = relationships.get(relationshipId);
    if (!rel || a(rel, "TargetMode") === "External" || !/\/slide$/.test(a(rel, "Type") || "")) throw new Error("슬라이드 연결 정보가 올바르지 않습니다.");
    const path = new URL(a(rel, "Target"), "https://document.local/ppt/presentation.xml").pathname.slice(1);
    const slide = await read(path, true);
    const paragraphs = all(slide, "a", "p").map((p, index) => {
      const pp = c(p, "a", "pPr");
      const level = n(a(pp, "lvl")) ?? 0;
      const listStyle = c(p.parentElement, "a", "lstStyle");
      const levelProperties = c(listStyle, "a", `lvl${level + 1}pPr`) || c(listStyle, "a", "defPPr");
      const defaults = merge(runFormat(c(levelProperties, "a", "defRPr")), runFormat(c(pp, "a", "defRPr")));
      const runs = [...p.children].filter((node) => ["r", "fld", "br"].includes(node.localName)).map((r) => {
        const format = merge(defaults, runFormat(c(r, "a", "rPr")));
        const candidate = format.eastAsia || format.latin || null;
        return { text: r.localName === "br" ? "\n" : c(r, "a", "t")?.textContent || "",
          fontFamily: candidate?.startsWith("+") ? null : candidate,
          fontSizePt: format.fontSizePt ?? null, fontSettings: format };
      });
      const spacing = c(pp, "a", "lnSpc") || c(levelProperties, "a", "lnSpc");
      const percent = c(spacing, "a", "spcPct");
      const points = c(spacing, "a", "spcPts");
      return { index: index + 1, text: runs.map((r) => r.text).join(""), level,
        alignment: a(pp, "algn") || a(levelProperties, "algn"),
        lineSpacing: percent ? { value: n(a(percent, "val"), 1000), unit: "percent" } : points ? { value: n(a(points, "val"), 100), unit: "pt" } : null,
        runs };
    });
    slides.push({ number: slides.length + 1, source: path, text: paragraphs.map((p) => p.text).join("\n"), paragraphs });
  }
  return { text: slides.map((s) => s.text).join("\n\n"), slideCount: slides.length, slides,
    warnings: ["슬라이드의 텍스트 상자·표를 XML 순서로 읽습니다. 화면의 읽기 순서와 다를 수 있습니다.",
      "슬라이드에 저장된 직접 서식과 텍스트 상자 목록 서식만 읽습니다. 레이아웃·마스터·테마에서 상속되는 값은 확정하지 않으며 null로 표시합니다.",
      "노트·차트·SmartArt·이미지 안의 텍스트는 포함하지 않습니다. 테마 글꼴 참조는 fontSettings에 보존합니다."] };
}
