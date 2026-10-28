// DB 응답을 기다리지 않고 문서 검사 결과를 먼저 보여줍니다.
const inspectionSaving = (() => {
  const message = document.getElementById("saveHistoryMessage");
  const retry = document.getElementById("retrySaveHistory");
  let pending = null;
  function reset() {
    pending = null;
    message.textContent = "";
    retry.hidden = true;
  }
  async function attempt(record) {
    retry.hidden = true;
    message.textContent = "검사 기록을 저장하고 있습니다. 문서 검사는 완료되었습니다.";
    try {
      await inspectionHistory.save(record);
      if (pending?.id !== record.id) return;
      message.textContent = "Supabase에 검사 기록을 저장했습니다.";
    } catch (error) {
      if (pending?.id !== record.id) return;
      message.textContent = `문서 검사는 완료되었지만 기록을 저장하지 못했습니다. ${error.message}`;
      retry.hidden = false;
    }
  }
  function save(report, setup) {
    reset();
    if (!inspectionHistory.configured()) {
      message.textContent = "Supabase가 설정되지 않아 기록을 저장하지 않았습니다. 문서 검사 결과와 JSON 다운로드는 사용할 수 있습니다.";
      return;
    }
    try {
      pending = inspectionHistory.createRecord(report, setup);
      void attempt(pending);
    } catch {
      message.textContent = "문서 검사는 완료되었지만 저장할 기록을 만들지 못했습니다. 결과를 JSON으로 다운로드하세요.";
    }
  }
  retry.addEventListener("click", () => { if (pending) void attempt(pending); });
  return { save, reset };
})();
