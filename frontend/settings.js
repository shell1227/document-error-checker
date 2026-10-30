const setupRaw = sessionStorage.getItem("documentCheckerSetup");
let setup = null;
try { setup = setupRaw ? JSON.parse(setupRaw) : null; }
catch { sessionStorage.removeItem("documentCheckerSetup"); }

const summaryFile = document.getElementById("summaryFile");
const summaryType = document.getElementById("summaryType");
const spellingSection = document.getElementById("spellingSection");
const textFormatSection = document.getElementById("textFormatSection");
const paragraphSection = document.getElementById("paragraphSection");
const lengthSection = document.getElementById("lengthSection");
const requiredWordsSection = document.getElementById("requiredWordsSection");
const noCriteriaMessage = document.getElementById("noCriteriaMessage");
const fontFamilyField = document.getElementById("fontFamilyField");
const fontSizeField = document.getElementById("fontSizeField");
const alignmentField = document.getElementById("alignmentField");
const lineSpacingField = document.getElementById("lineSpacingField");
const minLengthLabel = document.getElementById("minLengthLabel");
const maxLengthLabel = document.getElementById("maxLengthLabel");
const customWord = document.getElementById("customWord");
const addWordButton = document.getElementById("addWordButton");
const customWordList = document.getElementById("customWordList");
const backButton = document.getElementById("backButton");
const criteriaForm = document.getElementById("criteriaForm");
const settingsMessage = document.getElementById("settingsMessage");

const fontFamilyInput = document.getElementById("fontFamily");
const fontSizeInput = document.getElementById("fontSize");
const alignmentInput = document.getElementById("alignment");
const lineSpacingInput = document.getElementById("lineSpacing");
const minLengthInput = document.getElementById("minLength");
const maxLengthInput = document.getElementById("maxLength");

const typeNames = {
  report: "보고서",
  assignment: "수행평가",
  general: "일반 문서"
};

const allItems = [
  "spelling",
  "font-family",
  "font-size",
  "alignment",
  "line-spacing",
  "page-count",
  "required-words"
];

const selectedItems = setup?.inspectionItems ?? allItems;

if (setup) {
  summaryFile.textContent = setup.fileName;
  summaryType.textContent = typeNames[setup.documentType] ?? setup.documentType;
} else {
  summaryFile.textContent = "직접 연 화면";
  summaryType.textContent = "모든 설정 항목 표시";
}

const hasItem = (name) => selectedItems.includes(name);

spellingSection.hidden = !hasItem("spelling");

const showTextFormat = hasItem("font-family") || hasItem("font-size");
textFormatSection.hidden = !showTextFormat;
fontFamilyField.hidden = !hasItem("font-family");
fontSizeField.hidden = !hasItem("font-size");

const showParagraph = hasItem("alignment") || hasItem("line-spacing");
paragraphSection.hidden = !showParagraph;
alignmentField.hidden = !hasItem("alignment");
lineSpacingField.hidden = !hasItem("line-spacing");

lengthSection.hidden = !hasItem("page-count");
requiredWordsSection.hidden = !hasItem("required-words");

const hasConfigurableSection =
  showTextFormat || showParagraph || hasItem("page-count") || hasItem("required-words");

noCriteriaMessage.hidden = hasConfigurableSection;

if (setup?.extension === "pptx") {
  minLengthLabel.textContent = "최소 슬라이드 수";
  maxLengthLabel.textContent = "최대 슬라이드 수";
}

const customWords = [];

function showMessage(text, type = "error") {
  settingsMessage.textContent = text;
  settingsMessage.classList.toggle("success-message", type === "success");
  settingsMessage.classList.toggle("error-message", type === "error");
}

function clearMessage() {
  settingsMessage.textContent = "";
  settingsMessage.classList.remove("success-message", "error-message");
  document.getElementById("inspectionSection").hidden = true;
  inspectionReport = null;
  inspectionSaving.reset();
}

function renderCustomWords() {
  customWordList.innerHTML = "";

  customWords.forEach((word, index) => {
    const item = document.createElement("div");
    item.className = "word-chip";

    const text = document.createElement("span");
    text.textContent = word;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "삭제";
    removeButton.addEventListener("click", () => {
      customWords.splice(index, 1);
      renderCustomWords();
      clearMessage();
    });

    item.append(text, removeButton);
    customWordList.appendChild(item);
  });
}

function addCustomWord() {
  const word = customWord.value.trim();

  if (!word) {
    showMessage("추가할 필수 단어를 입력하세요.");
    customWord.focus();
    return;
  }

  if (!customWords.includes(word)) {
    customWords.push(word);
  }

  customWord.value = "";
  renderCustomWords();
  clearMessage();
}

function getSelectedRequiredWords() {
  const checkedWords = [
    ...document.querySelectorAll('input[name="requiredWord"]:checked')
  ].map((item) => item.value);

  return [...new Set([...checkedWords, ...customWords])];
}

function validateCriteria() {
  if (hasItem("font-family") && !fontFamilyInput.value.trim()) {
    return {
      valid: false,
      message: "기준 글꼴을 입력하세요.",
      field: fontFamilyInput
    };
  }

  if (hasItem("font-size")) {
    const value = fontSizeInput.value.trim();
    const fontSize = Number(value);

    if (!value) {
      return {
        valid: false,
        message: "기준 글자 크기를 입력하세요.",
        field: fontSizeInput
      };
    }

    if (!Number.isFinite(fontSize) || fontSize <= 0) {
      return {
        valid: false,
        message: "기준 글자 크기는 0보다 큰 값으로 입력하세요.",
        field: fontSizeInput
      };
    }
  }

  if (hasItem("alignment") && !alignmentInput.value) {
    return {
      valid: false,
      message: "기준 문단 정렬을 선택하세요.",
      field: alignmentInput
    };
  }

  if (hasItem("line-spacing")) {
    const value = lineSpacingInput.value.trim();
    const lineSpacing = Number(value);

    if (!value) {
      return {
        valid: false,
        message: "기준 줄 간격을 입력하세요.",
        field: lineSpacingInput
      };
    }

    if (!Number.isFinite(lineSpacing) || lineSpacing <= 0) {
      return {
        valid: false,
        message: "기준 줄 간격은 0보다 큰 값으로 입력하세요.",
        field: lineSpacingInput
      };
    }
  }

  if (hasItem("page-count")) {
    const minText = minLengthInput.value.trim();
    const maxText = maxLengthInput.value.trim();
    const unitName = setup?.extension === "pptx" ? "슬라이드 수" : "페이지 수";

    if (!minText && !maxText) {
      return {
        valid: false,
        message: `최소 또는 최대 ${unitName}를 하나 이상 입력하세요.`,
        field: minLengthInput
      };
    }

    if (minText) {
      const minValue = Number(minText);

      if (!Number.isInteger(minValue) || minValue < 1) {
        return {
          valid: false,
          message: `최소 ${unitName}는 1 이상의 정수로 입력하세요.`,
          field: minLengthInput
        };
      }
    }

    if (maxText) {
      const maxValue = Number(maxText);

      if (!Number.isInteger(maxValue) || maxValue < 1) {
        return {
          valid: false,
          message: `최대 ${unitName}는 1 이상의 정수로 입력하세요.`,
          field: maxLengthInput
        };
      }
    }

    if (minText && maxText && Number(minText) > Number(maxText)) {
      return {
        valid: false,
        message: `최소 ${unitName}는 최대 ${unitName}보다 클 수 없습니다.`,
        field: minLengthInput
      };
    }
  }

  if (hasItem("required-words") && getSelectedRequiredWords().length === 0) {
    return {
      valid: false,
      message: "확인할 필수 단어를 하나 이상 선택하거나 추가하세요.",
      field: document.querySelector('input[name="requiredWord"]')
    };
  }

  return { valid: true };
}

function buildCriteriaData() {
  const criteria = {};

  if (hasItem("font-family")) {
    criteria.fontFamily = fontFamilyInput.value.trim();
  }

  if (hasItem("font-size")) {
    criteria.fontSize = Number(fontSizeInput.value);
  }

  if (hasItem("alignment")) {
    criteria.alignment = alignmentInput.value;
  }

  if (hasItem("line-spacing")) {
    criteria.lineSpacing = Number(lineSpacingInput.value);
  }

  if (hasItem("page-count")) {
    criteria.lengthUnit = setup?.extension === "pptx" ? "slides" : "pages";
    criteria.minLength = minLengthInput.value.trim()
      ? Number(minLengthInput.value)
      : null;
    criteria.maxLength = maxLengthInput.value.trim()
      ? Number(maxLengthInput.value)
      : null;
  }

  if (hasItem("required-words")) {
    criteria.requiredWords = getSelectedRequiredWords();
  }

  return criteria;
}

addWordButton.addEventListener("click", addCustomWord);

customWord.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomWord();
  }
});

criteriaForm.addEventListener("input", clearMessage);
criteriaForm.addEventListener("change", clearMessage);

backButton.addEventListener("click", () => {
  window.location.href = "index.html";
});

let extractedDocument = null;
let inspectionReport = null;
function downloadJson(data, name) {
  if (!data) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.getElementById("downloadExtraction").addEventListener("click", () => {
  downloadJson(extractedDocument, `${setup.fileName}.json`);
});
document.getElementById("downloadInspection").addEventListener("click", () => {
  downloadJson(inspectionReport, `${setup.fileName}.inspection.json`);
});

criteriaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const validation = validateCriteria();

  if (!validation.valid) {
    showMessage(validation.message);

    if (validation.field) {
      validation.field.focus();
    }

    return;
  }

  const criteriaData = buildCriteriaData();

  const button = criteriaForm.querySelector('button[type="submit"]');
  button.disabled = true;
  extractedDocument = null;
  document.getElementById("extractionSection").hidden = true;
  try {
    sessionStorage.setItem(
      "documentCheckerCriteria",
      JSON.stringify(criteriaData)
    );

    sessionStorage.setItem(
      "documentCheckerInspectionConfig",
      JSON.stringify({
        setup,
        criteria: criteriaData
      })
    );

    showMessage("검사 기준이 저장되었습니다. 문서 정보를 읽고 있습니다.", "success");
    const file = await documentFileStore.load(setup?.fileId);
    extractedDocument = await documentReader.extract(file, setup?.extension);
    if (JSON.stringify(criteriaData) !== JSON.stringify(buildCriteriaData())) {
      throw new Error("문서를 읽는 동안 검사 기준이 변경되었습니다. 다시 검사 시작을 눌러주세요.");
    }
    document.getElementById("extractedText").value = extractedDocument.text;
    document.getElementById("extractionSummary").textContent = extractedDocument.format === "pptx"
      ? `슬라이드 ${extractedDocument.slideCount}개 · 텍스트 ${extractedDocument.text.length}자`
      : extractedDocument.format === "pdf" ? `페이지 ${extractedDocument.pageCount}개 · 텍스트 조각 ${extractedDocument.paragraphs.length}개 · 텍스트 ${extractedDocument.text.length}자`
      : `문단 ${extractedDocument.paragraphs.length}개 · 텍스트 ${extractedDocument.text.length}자`;
    const warnings = document.getElementById("extractionWarnings");
    warnings.replaceChildren();
    extractedDocument.warnings.forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      warnings.appendChild(item);
    });
    const json = JSON.stringify(extractedDocument, null, 2);
    document.getElementById("extractionData").textContent = json.length > 100000
      ? json.slice(0, 100000) + "\n… 화면 표시를 줄였습니다. 전체 정보는 다운로드하세요." : json;
    document.getElementById("extractionSection").hidden = false;
    inspectionReport = documentInspector.inspect(extractedDocument, selectedItems, criteriaData);
    renderInspection(inspectionReport);
    showMessage("검사가 완료되었습니다. 불일치와 검사 불가 항목을 확인하세요.", "success");
    inspectionSaving.save(inspectionReport, setup);
  } catch (error) {
    showMessage(error.message || "문서 정보를 읽지 못했습니다.");
  } finally { button.disabled = false; }
});
