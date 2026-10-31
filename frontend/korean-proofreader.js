// 제한된 한국어 규칙 검사. 사전·형태소 분석이나 문맥 전체의 정확성을 보장하지 않습니다.
const koreanProofreader = (() => {
  const conjugationSource = "https://www.korean.go.kr/nkview/nknews/200211/52_3.html";
  const spacingSource = "https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=&pageIndex=1&qna_seq=324370";
  const rules = [
    { id: "dwaeyo", pattern: "되요", replacement: "돼요", reason: "'되어요'의 준말은 '돼요'입니다.", source: "https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6761&mn_id=90&pageIndex=1" },
    { id: "bwaeyo", pattern: "뵈요", replacement: "봬요", reason: "'뵈어요'의 준말은 '봬요'입니다.", source: conjugationSource },
    { id: "anieyo", pattern: "아니예요", replacement: "아니에요", reason: "'아니다'의 활용형은 '아니에요'로 씁니다.", source: "https://www.scourt.go.kr/portal/gongbo/PeoplePopupView.work?gubun=24&sDate=201902&seqNum=2238" },
    { id: "dwaet", pattern: "됬(다|어요|습니다|네|네요|죠|나요)", replacement: (m) => `됐${m[1]}`, reason: "'되었-'의 준말은 '됐-'입니다.", source: "https://www.korean.go.kr/kornorms/m/m_regltn.do" },
    { id: "su-spacing", pattern: "(할|될|볼|갈|올|알|줄) *수 *(있다|있어요|있습니다|있었다|있었어요|있는|있을|없다|없어요|없습니다|없었다|없었어요|없는|없을)",
      replacement: (m) => `${m[1]} 수 ${m[2]}`, reason: "가능성을 나타내는 의존 명사 '수'는 앞뒤 말과 띄어 씁니다.", source: spacingSource }
  ];
  function segments(document) {
    const list = document.format === "pdf" ? (document.pages || []).map((p) => ({ text: p.text, location: `페이지 ${p.number}` }))
      : document.format === "pptx" ? document.slides.flatMap((s) => s.paragraphs.map((p) => ({ text: p.text, location: `슬라이드 ${s.number} · 문단 ${p.index}` })))
        : (document.paragraphs || []).map((p) => ({ text: p.text, location: `${p.source} · 문단 ${p.index}` }));
    return list.map((p, i) => ({ ...p, text: String(p.text || ""), key: `segment:${i}` }));
  }
  function check(document) {
    const rows = [];
    let processed = 0;
    let detected = 0;
    for (const segment of segments(document)) {
      // 문단을 이어 붙이거나 줄바꿈을 제거하여 없던 오류를 만들지 않습니다.
      const text = String(segment.text || "");
      processed += text.length;
      // 이메일을 찾는 긴 역추적 정규식 대신 @가 있는 어절을 제외합니다.
      const protectedRanges = [...text.matchAll(/https?:\/\/[^\s]+|`[^`]*`/gu),
        ...[...text.matchAll(/\S+/gu)].filter((m) => m[0].includes("@"))].map((m) => [m.index, m.index + m[0].length]);
      for (const rule of rules) {
        // 완전한 어절/구문만 비교합니다. 인명·긴 단어 안의 부분 문자열은 바꾸지 않습니다.
        const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${rule.pattern})(?![\\p{L}\\p{N}_])`, "gu");
        for (const match of text.matchAll(regex)) {
          const start = match.index, end = start + match[0].length;
          if (protectedRanges.some(([a, b]) => start < b && end > a)) continue;
          const suggestion = typeof rule.replacement === "function" ? rule.replacement(match) : rule.replacement;
          if (suggestion === match[0]) continue;
          detected++;
          if (rows.length >= 500) continue; // 상세 표시만 제한하고 이후 구간도 계속 검사합니다.
          const uncertain = Boolean(document.textUncertain);
          const line = text.slice(0, start).split("\n").length;
          rows.push({ status: uncertain ? "unknown" : "fail", location: `${segment.location} · ${line}줄 · 글자 ${start + 1}`,
            actual: match[0], expected: suggestion, suggestion, ruleId: rule.id, source: rule.source,
            reason: `${rule.reason} ${uncertain ? "추출 텍스트의 최종 표시가 불확실하여 오류로 확정하지 않습니다." : "규칙 기반 수정 후보입니다. 인용·고유명사 등은 원문 문맥을 확인하세요."}`,
            text: text.slice(Math.max(0, start - 45), Math.min(text.length, end + 45)), segmentKey: segment.key, offset: start, length: match[0].length });
        }
      }
    }
    rows.sort((a, b) => a.location.localeCompare(b.location, "ko") || a.offset - b.offset);
    rows.push({ status: "unknown", location: "검사 범위", expected: "한국어 맞춤법·띄어쓰기 전체 검사", actual: "제한된 규칙만 검사",
      reason: "되요·뵈요·아니예요·일부 됬- 활용과 '할 수 있다' 형태의 일부 띄어쓰기만 확인합니다. 오류 후보가 없어도 정상 판정하지 않습니다. 문맥·고유명사·형태소·새 어휘·그 밖의 띄어쓰기는 검사 불가입니다.",
      text: "" });
    for (const reason of document.textLimitations || []) rows.push({ status: "unknown", location: "추출 범위 밖", expected: "문서 전체 텍스트", actual: "일부 내용 확인 불가", reason });
    if (document.format === "pdf") rows.push({ status: "unknown", location: "PDF 추출 범위", expected: "원본 문장", actual: "배치된 텍스트 조각",
      reason: "PDF의 읽기 순서·줄바꿈·스캔/OCR·Unicode 매핑에 따라 일부 오류를 찾지 못하거나 수정 후보가 달라질 수 있습니다." });
    rows.push({ status: "unknown", location: "규칙 적용 범위", expected: "추출 텍스트 전체", actual: `${processed}자에 규칙 적용`,
      reason: `등록된 규칙을 전체 추출 구간에 적용했습니다. 수정 후보 ${detected}개를 찾았습니다. 원문에서 추출하지 못한 내용과 규칙 밖의 오류는 판단하지 못합니다.` });
    if (detected > 500) rows.push({ status: "unknown", location: "검사 제한", expected: "전체 후보 상세", actual: "상세 500개 보관",
      reason: `전체 텍스트를 검사했지만 추가 후보 ${detected - 500}개의 상세는 결과 크기를 제한하기 위해 보관하지 않았습니다.` });
    return rows;
  }
  return { check, segments };
})();
