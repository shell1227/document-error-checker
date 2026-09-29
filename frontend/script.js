const fileInput = document.getElementById("documentFile");
const fileName = document.getElementById("fileName");
const form = document.getElementById("inspectionForm");
const message = document.getElementById("message");

fileInput.addEventListener("change", () => {
  if (fileInput.files.length === 0) {
    fileName.textContent = "선택된 파일 없음";
    return;
  }

  fileName.textContent = `선택된 파일: ${fileInput.files[0].name}`;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const selectedFile = fileInput.files[0];
  const selectedDocumentType = document.querySelector(
    'input[name="documentType"]:checked'
  );
  const selectedInspectionItems = [
    ...document.querySelectorAll('input[name="inspectionItem"]:checked')
  ];

  if (!selectedFile) {
    message.textContent = "문서 파일을 선택하세요.";
    return;
  }

  const extension = selectedFile.name.split(".").pop().toLowerCase();

  if (extension !== "docx" && extension !== "pptx") {
    message.textContent = "DOCX 또는 PPTX 파일만 선택할 수 있습니다.";
    return;
  }

  if (!selectedDocumentType) {
    message.textContent = "문서 종류를 선택하세요.";
    return;
  }

  if (selectedInspectionItems.length === 0) {
    message.textContent = "검사 항목을 하나 이상 선택하세요.";
    return;
  }

  const setupData = {
    fileName: selectedFile.name,
    extension,
    documentType: selectedDocumentType.value,
    inspectionItems: selectedInspectionItems.map((item) => item.value)
  };

  sessionStorage.setItem("documentCheckerSetup", JSON.stringify(setupData));
  window.location.href = "settings.html";
});
