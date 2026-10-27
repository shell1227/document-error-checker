// 문서 텍스트는 HTML로 해석하지 않고 textContent로만 표시합니다.
function renderInspection(report) {
  const names = { pass: "기준 일치", fail: "불일치", unknown: "검사 불가" };
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
    heading.textContent = `${item.label}: ${names[item.status]}`;
    const summary = document.createElement("p");
    summary.textContent = `기준 일치 ${item.counts.pass}건 · 불일치 ${item.counts.fail}건 · 검사 불가 ${item.counts.unknown}건`;
    const disclosure = document.createElement("details");
    disclosure.open = item.status !== "pass";
    const title = document.createElement("summary");
    title.textContent = "위치·기준값·추출값 확인";
    disclosure.appendChild(title);
    // 먼저 불일치와 검사 불가를 보여주고, 큰 문서는 다운로드로 확인합니다.
    const sorted = [...item.details].sort((a, b) => ({ fail: 0, unknown: 1, pass: 2 }[a.status] - { fail: 0, unknown: 1, pass: 2 }[b.status]));
    const list = document.createElement("ul");
    for (const row of sorted.slice(0, 200)) {
      const li = document.createElement("li");
      const text = row.text ? ` · 텍스트: ${row.text.slice(0, 100)}` : "";
      li.textContent = `[${names[row.status]}] ${row.location} · 기준: ${row.expected} · 추출: ${row.actual}${row.reason ? ` · 사유: ${row.reason}` : ""}${text}`;
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
