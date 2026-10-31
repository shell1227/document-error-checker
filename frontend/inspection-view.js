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
  for (const item of report.items) {
    const section = document.createElement("section");
    section.className = "inspection-item";
    const heading = document.createElement("h3");
    heading.className = `inspection-${item.status}`;
    const statusLabel = item.status === "unknown" && item.counts.pass > 0 ? "일부 검사 불가" : names[item.status];
    heading.textContent = `${item.label}: ${item.id === "spelling" && item.counts.fail ? "수정 후보 발견" : statusLabel}`;
    const summary = document.createElement("p");
    summary.textContent = item.id === "spelling" ? `수정 후보 ${item.counts.fail}건 · 검사 불가 안내 ${item.counts.unknown}건 (전체 정상 여부는 판정하지 않음)`
      : `기준 일치 ${item.counts.pass}건 · 불일치 ${item.counts.fail}건 · 검사 불가 ${item.counts.unknown}건`;
    const disclosure = document.createElement("details");
    disclosure.open = item.status !== "pass";
    const title = document.createElement("summary");
    title.textContent = item.id === "spelling" ? "오류 후보·수정 제안·위치 확인" : "위치·기준값·추출값 확인";
    disclosure.appendChild(title);
    // 먼저 불일치와 검사 불가를 보여주고, 큰 문서는 다운로드로 확인합니다.
    const sorted = [...item.details].sort((a, b) => ({ fail: 0, unknown: 1, pass: 2 }[a.status] - { fail: 0, unknown: 1, pass: 2 }[b.status]));
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
    section.append(heading, summary, disclosure);
    container.appendChild(section);
  }
  document.getElementById("inspectionSection").hidden = false;
}
