// 규칙 검사 결과와 무관하게 전체 추출 구간을 순서대로 외부 검사 대상으로 만듭니다.
const bareunProofreader = (() => {
  const cache = new Map();
  const unknown = (location, reason) => ({ status: "unknown", location, expected: "바른 추가 검사", actual: "검사 불가", reason });
  function plan(document) {
    const segments = koreanProofreader.segments(document);
    const batches = [];
    const coverage = segments.map((s) => ({ key: s.key, location: s.location, length: s.text.length,
      applicable: /\p{Script=Hangul}/u.test(s.text), completed: [], uninspected: [] }));
    for (const [i, segment] of segments.entries()) {
      if (!coverage[i].applicable) continue;
      let start = 0;
      while (start < segment.text.length) {
        let batch = batches.at(-1);
        if (!batch || batch.text.length >= 1000) {
          if (batches.length >= 10) break;
          batch = { text: "", parts: [] }; batches.push(batch);
        }
        const separator = batch.text ? "\n" : "";
        let available = 1000 - batch.text.length - separator.length;
        // 작은 잔여 공간 때문에 문단을 불필요하게 자르지 않습니다.
        if (start === 0 && segment.text.length <= 1000 && segment.text.length > available && batch.text) {
          if (batches.length >= 10) break;
          batch = { text: "", parts: [] }; batches.push(batch); available = 1000;
        }
        const prefix = batch.text ? "\n" : "";
        available = 1000 - batch.text.length - prefix.length;
        if (available <= 0) { batch.text += "\n"; continue; }
        let end = Math.min(segment.text.length, start + available);
        let forced = false;
        if (end < segment.text.length) {
          const text = segment.text.slice(start, end);
          const boundary = Math.max(text.lastIndexOf("\n"), text.lastIndexOf(" "));
          if (boundary >= Math.floor(available / 2)) end = start + boundary + 1;
          else {
            forced = true;
            if (/[\uD800-\uDBFF]/.test(segment.text[end - 1]) && /[\uDC00-\uDFFF]/.test(segment.text[end])) end--;
          }
        }
        const chunkStart = batch.text.length + prefix.length;
        if (end <= start) { batch.text += prefix; continue; }
        const piece = segment.text.slice(start, end);
        if (!piece.trim()) {
          const reason = "공백만 있는 분할 구간은 외부로 보내지 않았습니다.";
          const previous = coverage[i].uninspected.at(-1);
          if (previous?.end === start && previous.reason === reason) previous.end = end;
          else coverage[i].uninspected.push({ start, end, reason });
          start = end;
          if (!batch.parts.length) batches.pop();
          continue;
        }
        batch.text += prefix + piece;
        batch.parts.push({ segment: i, key: segment.key, location: segment.location, start, end, chunkStart, forced: forced || start > 0 || end < segment.text.length });
        start = end;
      }
      if (start < segment.text.length) coverage[i].uninspected.push({ start, end: segment.text.length, reason: "한 번에 최대 1만 자·10회 외부 검사 제한" });
    }
    return { segments, batches, coverage };
  }
  async function check(document, signal) {
    const { segments, batches, coverage } = plan(document);
    const rows = [];
    const results = new Array(batches.length);
    let requestedCalls = 0;
    let failure = "외부 검사 요청이 완료되지 않았습니다.";
    try {
      const missing = [];
      const pending = new Map();
      batches.forEach((b, i) => {
        if (cache.has(b.text)) results[i] = cache.get(b.text);
        else if (pending.has(b.text)) pending.get(b.text).push(i);
        else { pending.set(b.text, [i]); missing.push(i); }
      });
      if (missing.length) {
        const token = await inspectionHistory.accessToken();
        requestedCalls = missing.length;
        const response = await fetch("/api/proofread", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ consent: true, requestId: crypto.randomUUID(), chunks: missing.map((i) => batches[i].text) }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(125000)]) : AbortSignal.timeout(125000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "외부 검사 서버를 사용할 수 없습니다.");
        if (!Array.isArray(data.results) || data.results.length > missing.length) throw new Error("외부 검사 응답 형식 오류");
        missing.forEach((index, j) => {
          for (const target of pending.get(batches[index].text)) results[target] = data.results[j];
          if (data.results[j]?.ok === true) {
            if (cache.size >= 100) cache.delete(cache.keys().next().value);
            cache.set(batches[index].text, data.results[j]);
          }
        });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error.message === "Failed to fetch" ? "외부 검사에 연결하지 못했습니다. 기본 규칙 검사는 유지합니다." : error.message;
    }
    batches.forEach((batch, i) => {
      const result = results[i];
      const ok = result?.ok === true && Array.isArray(result.findings);
      for (const part of batch.parts) {
        const state = coverage[part.segment];
        if (ok) state.completed.push({ start: part.start, end: part.end });
        else state.uninspected.push({ start: part.start, end: part.end, reason: result?.message || failure });
      }
      if (!ok) return;
      for (const finding of result.findings) {
        const { original, suggestion, offset } = finding;
        const part = batch.parts.find((p) => Number.isInteger(offset) && offset >= p.chunkStart && offset + (original?.length || 0) <= p.chunkStart + p.end - p.start);
        if (!part || typeof original !== "string" || typeof suggestion !== "string" || batch.text.slice(offset, offset + original.length) !== original) {
          rows.push(unknown(`외부 검사 묶음 ${i + 1}`, "원문 위치가 일치하지 않거나 문단 경계를 넘는 수정이어서 확정하지 않았습니다.")); continue;
        }
        const localOffset = part.start + offset - part.chunkStart;
        const uncertain = document.textUncertain || part.forced || !["GRAMMER", "WORD", "SPACING", "STANDARD", "TYPO", "FOREIGN_WORD", "CONFUSABLE_WORDS", "SENTENCE"].includes(finding.category);
        rows.push({ status: uncertain ? "unknown" : "fail", location: `${part.location} · 위치 ${localOffset + 1}`,
          segmentKey: part.key, offset: localOffset, length: original.length, actual: original || "(빈 위치)", expected: suggestion,
          suggestion, provider: "bareun", category: finding.category,
          reason: `바른 API: ${finding.reason}${uncertain ? " 분할 문맥·최종 표시 또는 제안의 확인이 필요합니다." : ""}`,
          text: segments[part.segment].text.slice(Math.max(0, localOffset - 45), localOffset + original.length + 45) });
      }
      if (result.incomplete) rows.push(unknown(`외부 검사 묶음 ${i + 1}`, "API 응답은 받았지만 일부 수정 위치·공백 처리를 해석하지 못했습니다."));
      if (typeof result.wholeRevision === "string" && result.wholeRevision !== batch.text && result.wholeRevision.length <= 3000) {
        rows.push({ status: "unknown", location: `외부 검사 묶음 ${i + 1}`, actual: batch.text, expected: result.wholeRevision,
          suggestion: result.wholeRevision, provider: "bareun", category: "CONFIRM", reason: "부분 위치를 확정하지 못한 전체 교정문입니다. 원문과 직접 비교하세요.", text: batch.text });
      }
      if (batch.parts.some((p) => p.forced)) rows.push(unknown(`외부 검사 묶음 ${i + 1}`, "긴 문단을 나누어 검사했습니다. 분할 경계의 문맥은 완전하게 검사하지 못합니다."));
    });
    for (const state of coverage) {
      for (const range of state.uninspected) rows.push(unknown(`${state.location} · 위치 ${range.start + 1}~${range.end}`, range.reason));
    }
    const applicable = coverage.filter((s) => s.applicable);
    rows.coverage = { totalCharacters: applicable.reduce((n, s) => n + s.length, 0),
      completedCharacters: applicable.reduce((n, s) => n + s.completed.reduce((a, r) => a + r.end - r.start, 0), 0),
      excludedCharacters: coverage.filter((s) => !s.applicable).reduce((n, s) => n + s.length, 0), segments: coverage,
      plannedBatches: batches.length, completedBatches: results.filter((r) => r?.ok === true).length, requestedCalls };
    rows.push({ ...unknown("외부 검사 범위", "오류 후보가 없어도 전체 정상이라고 판정하지 않습니다. API 응답 수신 범위와 수정 해석의 불확실성은 별개입니다."), kind: "notice" });
    return rows;
  }
  // 같은 위치의 겹친 원문이 같은 교정 결과를 만들 때만 한 후보로 합칩니다.
  function sameCorrection(a, b) {
    if (!a.suggestion || !b.suggestion || !a.segmentKey || a.segmentKey !== b.segmentKey || !Number.isInteger(a.offset) || !Number.isInteger(b.offset)) return false;
    const endA = a.offset + a.length, endB = b.offset + b.length;
    if (a.offset >= endB || b.offset >= endA) return a.offset === b.offset && a.actual === b.actual && a.suggestion === b.suggestion;
    const start = Math.min(a.offset, b.offset), end = Math.max(endA, endB);
    const chars = new Array(end - start);
    for (const row of [a, b]) for (let i = 0; i < row.actual.length; i++) {
      const at = row.offset - start + i;
      if (chars[at] !== undefined && chars[at] !== row.actual[i]) return false;
      chars[at] = row.actual[i];
    }
    if (chars.includes(undefined)) return false;
    const original = chars.join("");
    const apply = (r) => original.slice(0, r.offset - start) + r.suggestion + original.slice(r.offset - start + r.length);
    return apply(a) === apply(b);
  }
  function merge(report, rows) {
    const item = report.items.find((i) => i.id === "spelling");
    if (!item) return;
    for (const row of rows) {
      const existing = item.details.find((r) => sameCorrection(r, row));
      if (existing) { existing.providers = [...new Set([...(existing.providers || ["local-rules"]), row.provider || "bareun"])]; continue; }
      item.details.push(row);
    }
    item.counts = { pass: 0, fail: 0, unknown: 0 };
    item.details.filter((r) => r.kind !== "notice").forEach((r) => item.counts[r.status]++);
    item.status = item.counts.fail ? "fail" : "unknown";
    item.providers = ["local-rules", "bareun"];
    item.coverage = rows.coverage;
  }
  return { check, merge, plan };
})();
