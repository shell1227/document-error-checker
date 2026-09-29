const setupRaw = sessionStorage.getItem("documentCheckerSetup");
const setup = setupRaw ? JSON.parse(setupRaw) : null;

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
    });

    item.append(text, removeButton);
    customWordList.appendChild(item);
  });
}

function addCustomWord() {
  const word = customWord.value.trim();

  if (!word) {
    return;
  }

  if (!customWords.includes(word)) {
    customWords.push(word);
  }

  customWord.value = "";
  renderCustomWords();
}

addWordButton.addEventListener("click", addCustomWord);

customWord.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomWord();
  }
});

backButton.addEventListener("click", () => {
  window.location.href = "index.html";
});

criteriaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  settingsMessage.textContent = "기준 입력이 완료되었습니다. 실제 문서 검사는 아직 구현되지 않았습니다.";
});
