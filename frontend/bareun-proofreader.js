// 동의한 경우에만 우리 서버 함수에 텍스트를 보냅니다. 키는 이 파일에 없습니다.
const bareunProofreader = (() => {
  const cache = new Map();
  const unknown = (reason) => ({ status: "unknown", location: "바른 외부 검사", expected: "한국어 맞춤법·띄어쓰기", actual: "검사 불가", reason });
  function chunks(document) {
    const segments = document.format === "pdf" ? document.pages.map((p) => ({ text: p.text, location: `페이지 ${p.number}` }))
      : document.format === "pptx" ? document.slides.flatMap((s) => s.paragraphs.map((p) => ({ text: p.text, location: `슬라이드 ${s.number} · 문단 ${p.index}` })))
        : document.paragraphs.map((p) => ({ text: p.text, location: `${p.source} · 문단 ${p.index}` }));
    const selected = [];
    let skipped = false;
    // 문단을 중간에서 잘라 문맥을 바꾸지 않습니다. 1,000자 초과 문단은 검사 불가로 남깁니다.
    for (const segment of segments) {
      if (!/[가-힣]/.test(segment.text)) continue;
      if (segment.text.length > 1000 || selected.length >= 3) { skipped = true; continue; }
      selected.push(segment);
    }
    return { selected, skipped };
  }
  async function check(document, signal) {
    const { selected, skipped } = chunks(document);
    const rows = [];
    if (!selected.length) return [unknown("검사 가능한 한국어 문단이 없습니다. 문단당 1,000자 이하만 보낼 수 있습니다.")];
    if (skipped) rows.push(unknown("최대 3개 문단·합계 3,000자까지만 외부 검사합니다. 긴 문단과 남은 내용은 기본 규칙으로만 검사했습니다."));
    try {
      const texts = selected.map((s) => s.text);
      const key = JSON.stringify(texts);
      let data = cache.get(key);
      if (!data) {
        const token = await inspectionHistory.accessToken();
        const response = await fetch("/api/proofread", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ consent: true, requestId: crypto.randomUUID(), chunks: texts }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
        data = await response.json();
        if (!response.ok) throw new Error(data.message || "외부 검사 서버를 사용할 수 없습니다.");
        if (!Array.isArray(data.results) || data.results.length > selected.length) throw new Error("외부 검사 응답 형식을 확인하지 못했습니다.");
        if (data.results.length === selected.length && data.results.every((r) => r.ok === true)) {
          if (cache.size >= 5) cache.delete(cache.keys().next().value);
          cache.set(key, data);
        }
      }
      selected.forEach((segment, i) => {
        const result = data.results[i];
        if (!result?.ok || !Array.isArray(result.findings)) { rows.push(unknown(result?.message || "일부 문단의 외부 검사가 완료되지 않았습니다.")); return; }
        let valid = 0;
        for (const finding of result.findings) {
          const { original, suggestion, offset } = finding;
          if (typeof original !== "string" || typeof suggestion !== "string" || !Number.isInteger(offset) || offset < 0 ||
            offset > segment.text.length || segment.text.slice(offset, offset + original.length) !== original) {
            rows.push(unknown("수정 후보와 원문 위치가 일치하지 않아 확정하지 않았습니다.")); continue;
          }
          valid++;
          const uncertain = document.textUncertain || !["GRAMMER", "WORD", "SPACING", "STANDARD", "TYPO", "FOREIGN_WORD", "CONFUSABLE_WORDS", "SENTENCE"].includes(finding.category);
          rows.push({ status: uncertain ? "unknown" : "fail", location: `${segment.location} · 위치 ${offset + 1}`,
            actual: original || "(빈 위치)", expected: suggestion, suggestion, offset, length: original.length,
            provider: "bareun", category: finding.category, reason: `바른 API: ${finding.reason}${uncertain ? " 최종 표시 또는 제안이 불확실하여 확인이 필요합니다." : ""}`,
            text: segment.text.slice(Math.max(0, offset - 45), Math.min(segment.text.length, offset + original.length + 45)) });
        }
        if (result.incomplete) rows.push(unknown("응답의 일부 수정 위치·공백 처리를 해석하지 못했습니다. 원문을 자동 수정하지 않습니다."));
        if (!valid) rows.push(unknown(`${segment.location}: API가 수정 후보를 반환하지 않았습니다. 문장 전체가 정확하다는 뜻은 아닙니다.`));
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      rows.push(unknown(error.message === "Failed to fetch" ? "외부 검사에 연결하지 못했습니다. 기본 규칙 검사 결과를 확인하세요." : error.message));
    }
    rows.push(unknown("외부 검사도 문맥·고유명사·추출 오류를 완전하게 판단하지 못합니다. 제안은 원문을 확인한 뒤 사용하세요."));
    return rows;
  }
  function merge(report, rows) {
    const item = report.items.find((i) => i.id === "spelling");
    if (!item) return;
    // 같은 원문/제안은 규칙 검사와 외부 검사에서 중복 표시하지 않습니다.
    for (const row of rows) {
      if (row.suggestion && item.details.some((r) => r.suggestion === row.suggestion && r.actual === row.actual && r.offset === row.offset &&
        r.location.split(/ · (?:\d+줄|위치)/)[0] === row.location.split(/ · (?:\d+줄|위치)/)[0])) continue;
      item.details.push(row);
    }
    item.counts = { pass: 0, fail: 0, unknown: 0 };
    item.details.forEach((r) => item.counts[r.status]++);
    item.status = item.counts.fail ? "fail" : "unknown";
    item.providers = ["local-rules", "bareun"];
  }
  return { check, merge };
})();
