// 문서 텍스트는 HTML로 해석하지 않고 textContent로만 표시합니다.
function renderInspection(report) {
  const names = { pass: "기준 일치", fail: "불일치", unknown: "검사 불가" };
  // 화면에는 읽기 쉬운 출처를, 다운로드 JSON에는 원래 파일 경로를 보존합니다.
  const sourceLabel = (source) => source
    .replace(/ppt\/presentation\.xml\/defaultTextStyle/g, "프레젠테이션 기본 서식")
    .replace(/ppt\/slideMasters\/[^/]+/g, "마스터")
    .replace(/ppt\/slideLayouts\/[^/]+/g, "레이아웃")
    .replace(/ppt\/slides\/[^/]+/g, "슬라이드")
    .replace(/ppt\/theme\/[^/]+/g, "테마")
    .replace(/titleStyle/g, "제목 스타일").replace(/bodyStyle/g, "본문 스타일").replace(/otherStyle/g, "기타 텍스트 스타일")
    .replace(/lvl(\d)pPr/g, "$1수준 서식").replace(/placeholder\[body\]/g, "본문 자리 표시자").replace(/placeholder\[title\]/g, "제목 자리 표시자")
    .replace(/DrawingML 기본값/g, "표준 기본값");
  const container = document.getElementById("inspectionResults");
  container.replaceChildren();
  const scope = document.createElement("p");
  scope.className = "help-text";
  scope.textContent = report.scope + " 항목 안에 검사 불가가 하나라도 있으면 전체 정상으로 표시하지 않습니다. 불일치와 검사 불가가 함께 있을 수도 있습니다.";
  container.appendChild(scope);
  const external = report.externalProofreading;
  const externalState = document.createElement("p");
  externalState.className = external && ["failed", "partial", "skipped"].includes(external.status) ? "error-message" : "help-text";
  const externalNames = { pending: "진행 중", disabled: "사용 안 함", completed: "완료", partial: "일부 완료·확인 필요", failed: "실패", skipped: "생략" };
  externalState.textContent = external ? `바른 외부 검사 상태: ${externalNames[external.status] || "확인 불가"} · ${external.reason}`
    + ` · 서버 요청 시도 ${external.requestAttempts ?? "확인 불가"}회 · 바른 호출 시도 ${external.providerCalls ?? "확인 불가"}회`
    + `${external.httpStatus ? ` · HTTP ${external.httpStatus}` : ""}${external.cachedBatches ? ` · 재사용 ${external.cachedBatches}묶음` : ""}`
    : "바른 외부 검사 상태: 이 기록에는 실행 상태 정보가 없습니다. 외부 호출 여부를 확인하려면 새로 검사하세요.";
  container.appendChild(externalState);
  const overview = document.createElement("div");
  overview.className = "inspection-overview";
  container.appendChild(overview);
  if (report.items.length && report.items.every((item) => item.status === "pass") && (!external || ["disabled", "completed"].includes(external.status))) {
    const message = document.createElement("p");
    message.className = "inspection-pass";
    message.textContent = "선택한 검사 항목에서 오류가 발견되지 않았습니다.";
    overview.appendChild(message);
  }
  for (const item of report.items) {
    // 이전 저장 기록도 안내 문구와 실제 미검사 위치를 구분해 표시합니다.
    const isNotice = (row) => row.kind === "notice" || item.id === "spelling" && !row.suggestion && ["검사 범위", "규칙 적용 범위", "PDF 추출 범위", "외부 검사 범위", "검사 제한"].includes(row.location);
    const notices = item.details.filter(isNotice);
    const findings = item.details.filter((row) => !isNotice(row));
    const counts = { pass: 0, fail: 0, unknown: 0 };
    findings.forEach((row) => counts[row.status]++);
    const section = document.createElement("section");
    section.className = "inspection-item";
    const heading = document.createElement("p");
    heading.className = `inspection-${item.status}`;
    const statusLabel = item.status === "unknown" && counts.pass > 0 ? "일부 검사 불가" : names[item.status];
    heading.textContent = `${item.label}: ${item.id === "spelling" ? counts.fail ? "수정 후보 발견" : counts.unknown ? "미검사·확인 필요 구간 있음" : "검사 범위 내 수정 후보 없음 (전체 정상 판정 아님)" : statusLabel}`;
    const summary = document.createElement("p");
    summary.textContent = item.id === "spelling" ? `수정 후보 ${counts.fail}건 · 미검사・판단 보류 ${counts.unknown}건 (기능 안내는 건수에서 제외)`
      : `기준 일치 ${counts.pass}건 · 불일치 ${counts.fail}건 · 검사 불가 ${counts.unknown}건`;
    const overviewItem = document.createElement("div");
    overviewItem.append(heading, summary);
    overview.appendChild(overviewItem);
    const problems = findings.filter((row) => row.status === "fail" || row.status === "unknown");
    if (!problems.length && !notices.length && !item.coverage) continue;
    const detailHeading = document.createElement("h3");
    detailHeading.textContent = `${item.label}${problems.length ? " 상세" : " 검사 범위 안내"}`;
    const disclosure = document.createElement("details");
    disclosure.open = item.status !== "pass";
    const title = document.createElement("summary");
    title.textContent = item.id === "spelling" ? "오류 후보·수정 제안·위치 확인" : "위치·기준값·추출값 확인";
    disclosure.appendChild(title);
    // 먼저 불일치와 검사 불가를 보여주고, 큰 문서는 다운로드로 확인합니다.
    const sorted = [...problems].sort((a, b) => ({ fail: 0, unknown: 1 }[a.status] - { fail: 0, unknown: 1 }[b.status]));
    const list = document.createElement("ul");
    for (const row of sorted.slice(0, 200)) {
      const li = document.createElement("li");
      const text = row.text ? ` · 텍스트: ${row.text.slice(0, 100)}` : "";
      li.textContent = item.id === "spelling" && row.suggestion
        ? `[${row.status === "fail" ? "수정 후보" : "검사 불가"}] ${row.location} · 원문: ${row.actual} → 수정 제안: ${row.suggestion} · 사유: ${row.reason}${text}`
        : `[${names[row.status]}] ${row.location} · 기준: ${row.expected} · 추출: ${row.actual}${row.reason ? ` · 사유: ${row.reason}` : ""}${row.source ? ` · 근거: ${sourceLabel(row.source)}` : ""}${text}`;
      list.appendChild(li);
    }
    disclosure.appendChild(list);
    if (sorted.length > 200) {
      const note = document.createElement("p");
      note.textContent = "화면에는 항목당 200건까지 표시합니다. 전체 내역은 검사 결과 다운로드로 확인하세요.";
      disclosure.appendChild(note);
    }
    section.append(detailHeading, disclosure);
    disclosure.hidden = !problems.length;
    const reasons = new Map();
    for (const row of findings.filter((r) => r.status === "unknown")) reasons.set(row.reason || "사유 정보 없음", (reasons.get(row.reason || "사유 정보 없음") || 0) + 1);
    if (reasons.size) {
      const reasonList = document.createElement("ul");
      for (const [reason, count] of reasons) {
        const li = document.createElement("li");
        li.textContent = `${reason} (${count}건)`;
        reasonList.appendChild(li);
      }
      const reasonTitle = document.createElement("p");
      reasonTitle.textContent = "검사 불가·판단 보류 사유";
      section.insertBefore(reasonTitle, disclosure);
      section.insertBefore(reasonList, disclosure);
    }
    if (notices.length) {
      const notes = document.createElement("details");
      const title = document.createElement("summary");
      title.textContent = "검사 범위·기능 한계 안내 (미검사 건수에 포함하지 않음)";
      notes.appendChild(title);
      for (const row of notices) {
        const p = document.createElement("p");
        p.textContent = `${row.location}: ${row.actual} · ${row.reason}`;
        notes.appendChild(p);
      }
      section.appendChild(notes);
    }
    if (item.id === "spelling" && item.coverage) {
      const coverage = document.createElement("p");
      const c = item.coverage;
      coverage.className = "help-text";
      coverage.textContent = `바른 검사 범위: 한국어 포함 구간 ${c.totalCharacters}자 중 ${c.completedCharacters}자 응답 수신 · ${c.totalCharacters - c.completedCharacters}자 미검사 · 한국어 없는 구간 ${c.excludedCharacters}자 제외. 응답 수신은 전체 정상 판정을 뜻하지 않습니다.`;
      section.insertBefore(coverage, disclosure);
    }
    container.appendChild(section);
  }
  document.getElementById("inspectionSection").hidden = false;
}
