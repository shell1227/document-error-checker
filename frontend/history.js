const historyList = document.getElementById("historyList");
const historyMessage = document.getElementById("historyMessage");
const previousHistory = document.getElementById("previousHistory");
const nextHistory = document.getElementById("nextHistory");
const reloadHistory = document.getElementById("reloadHistory");
let offset = 0;
let selectedRecord = null;
let detailRequest = 0;
const dateLabel = (value) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));

function showCriteria(record) {
  const criteria = record.criteria;
  const fields = [
    ["fontFamily", "기준 글꼴", (value) => value],
    ["fontSize", "기준 글자 크기", (value) => `${value} pt`],
    ["alignment", "문단 정렬", (value) => ({ left: "왼쪽", center: "가운데", right: "오른쪽", justify: "양쪽" }[value] || value)],
    ["lineSpacing", "줄 간격", (value) => `${value}%`],
    ["lengthUnit", "문서 분량", (value) => `최소 ${criteria.minLength ?? "제한 없음"} / 최대 ${criteria.maxLength ?? "제한 없음"} (${value === "slides" ? "슬라이드" : "페이지"})`],
    ["requiredWords", "필수 단어", (value) => value.join(", ")]
  ];
  const list = document.getElementById("historyCriteria");
  list.replaceChildren();
  for (const [key, label, format] of fields) {
    if (!(key in criteria)) continue;
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = format(criteria[key]);
    list.append(term, description);
  }
  if (!list.children.length) list.textContent = "별도의 세부 기준이 없는 검사입니다.";
}

function closeDetail() {
  detailRequest++;
  selectedRecord = null;
  document.getElementById("historyDetail").hidden = true;
  document.getElementById("inspectionSection").hidden = true;
}
async function openRecord(id) {
  closeDetail();
  const request = detailRequest;
  historyMessage.textContent = "기록을 불러오는 중입니다.";
  try {
    const record = await inspectionHistory.get(id);
    if (request !== detailRequest) return;
    renderInspection(record.result);
    document.getElementById("historyRecordInfo").textContent = `${record.file_name} · ${record.file_format.toUpperCase()} · ${dateLabel(record.inspected_at)} (한국 시간)`;
    showCriteria(record);
    selectedRecord = record;
    document.getElementById("historyDetail").hidden = false;
    historyMessage.textContent = "저장된 결과를 불러왔습니다. 문서를 다시 검사한 결과는 아닙니다.";
  } catch (error) {
    if (request !== detailRequest) return;
    closeDetail();
    historyMessage.textContent = error.message || "기록을 표시하지 못했습니다.";
  }
}
async function loadHistory(nextOffset = 0) {
  closeDetail();
  previousHistory.disabled = nextHistory.disabled = reloadHistory.disabled = true;
  historyList.replaceChildren();
  if (!inspectionHistory.configured()) {
    historyMessage.textContent = "Supabase가 설정되지 않았습니다. 새 문서 검사는 계속 사용할 수 있습니다.";
    reloadHistory.disabled = false;
    return;
  }
  historyMessage.textContent = "기록 목록을 불러오는 중입니다.";
  try {
    const page = await inspectionHistory.list(nextOffset);
    offset = nextOffset;
    for (const record of page.records) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button history-open";
      button.textContent = `${record.file_name} · ${record.file_format.toUpperCase()} · ${dateLabel(record.inspected_at)}`;
      button.addEventListener("click", () => openRecord(record.id));
      const summary = document.createElement("p");
      summary.textContent = `기준 일치 ${record.summary.pass}건 · 불일치 ${record.summary.fail}건 · 검사 불가 ${record.summary.unknown}건`;
      li.append(button, summary);
      historyList.appendChild(li);
    }
    previousHistory.disabled = offset === 0;
    nextHistory.disabled = !page.hasMore;
    historyMessage.textContent = page.records.length ? `${offset + 1}~${offset + page.records.length}번째 기록 · 날짜는 한국 시간입니다.` : "저장된 검사 기록이 없습니다.";
  } catch (error) {
    historyMessage.textContent = error.message;
  } finally { reloadHistory.disabled = false; }
}
document.getElementById("downloadHistory").addEventListener("click", () => {
  if (!selectedRecord) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(selectedRecord, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selectedRecord.file_name}.history.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
previousHistory.addEventListener("click", () => loadHistory(Math.max(0, offset - inspectionHistory.pageSize)));
nextHistory.addEventListener("click", () => loadHistory(offset + inspectionHistory.pageSize));
reloadHistory.addEventListener("click", () => loadHistory());
loadHistory();
