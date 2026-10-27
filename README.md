# document-error-checker
문서의 오탈자와 양식 오류를 자동 검사하는 웹 서비스

## 현재 구현

- 첫 화면에서 DOCX/PPTX, 문서 종류, 검사 항목 선택
- 세부 설정에서 검사 기준 검증 및 sessionStorage 저장
- '검사 시작'을 누르면 문서 정보를 추출하여 같은 화면 아래에 표시
- 추출 텍스트, 문단별 글꼴·크기·정렬·줄 간격 확인 및 전체 JSON 다운로드

아직 맞춤법이나 형식 오류를 판정하지 않습니다.

## 실행과 배포

로컬 HTTP 서버로 `frontend` 폴더를 열어 사용하세요. 파일을 더블 클릭하는
`file://` 방식은 브라우저 저장소 동작이 다를 수 있어 권장하지 않습니다.
Python이 있다면 저장소에서 `python -m http.server 8000 --directory frontend`를
실행하고 `http://localhost:8000`에 접속할 수 있습니다.

Vercel 설정: Root Directory `frontend`, Preset `Other`, Build Command 빈 값,
Output Directory `.`. 환경 변수는 필요하지 않습니다.

## 파일 전달과 코드 역할

- `file-store.js`: 파일을 브라우저 IndexedDB에 보관하고 탭의 파일 ID로 다시 읽음.
  같은 탭에서 새 파일을 선택하면 이전 파일을 교체합니다.
- `document-reader.js`: 공통 ZIP/XML 읽기와 형식별 추출 함수 연결
- `docx-reader.js`: DOCX 본문·표·텍스트 상자·머리글·바닥글의 문단과 텍스트
- `pptx-reader.js`: 실제 슬라이드 순서에 따라 텍스트 상자·표의 문단과 텍스트
- `settings.js`: 기존 기준 저장 및 추출 결과 표시

파일은 서버로 업로드하지 않습니다. IndexedDB는 탭을 닫아도 남을 수 있으며,
브라우저 사이트 데이터 삭제로 지울 수 있습니다. 새 탭에서 시작할 때는
첫 화면에서 파일을 다시 선택하세요. 현재 입력 파일 크기는 최대 20MB입니다.

## 추출 데이터와 한계

공통: `text`, `warnings`. 문단에는 `text`, `runs`, `alignment`, `lineSpacing`이 있고,
글자 묶음(run)에는 `text`, `fontFamily`, `fontSizePt`, `fontSettings`가 있습니다.
`fontSettings`에는 문자 종류별 글꼴과 테마 참조 등 원본 정보가 들어갑니다.
`null`은 확인 불가이며 정상 또는 오류라는 뜻이 아닙니다.

- DOCX: 기본 서식, 문단/문자 스타일의 basedOn 상속, 직접 서식을 읽습니다.
  글자 크기는 pt로, 줄 간격은 배수이면 %, 고정/최소이면 pt와 규칙으로 표시합니다.
  문단 앞뒤 간격도 pt로 보관합니다. 페이지 수는 계산하지 않아 `null`입니다.
- PPTX: `slides`에 슬라이드별 문단을 담고 `slideCount`를 제공합니다.
  직접 서식 및 텍스트 상자 내부 목록 수준 서식을 읽습니다.
  레이아웃·마스터·테마 상속은 아직 해석하지 않습니다.
- 테마 참조를 실제 글꼴로 변환하지 않으며 단일 글꼴 이름만으로 모든 문자의
  최종 표시 글꼴을 판단할 수 없습니다. DOCX의 조건부 표/번호 서식, 변경 추적,
  각주·미주·수식과 PPTX의 노트·차트·SmartArt 및 이미지 OCR은 지원하지 않습니다.
- 압축 해제와 XML 분석은 브라우저 메모리를 사용합니다. 복잡하거나 압축 해제 후
  매우 커지는 문서는 아직 처리 범위가 제한됩니다.

추출기를 확장할 때는 기존 공통 필드를 유지하면서 형식별 읽기 함수를 추가하세요.
검사 기준과의 비교는 별도 검사 함수로 추가할 예정입니다.

## 라이브러리와 테스트

`frontend/vendor/jszip.min.js`는 DOCX/PPTX의 ZIP 압축을 읽기 위한
[JSZip 3.10.1](https://github.com/Stuk/jszip/tree/v3.10.1)입니다.
MIT 라이선스로 사용하며 원본 라이선스를 같은 폴더에 포함했습니다.
로컬 파일로 제공하므로 실행 중 CDN 연결이 필요하지 않습니다.

`tests/extraction.cjs`는 테스트 ZIP을 메모리에서 만들고 Playwright와 Edge로
추출값·파일 전달·실패 안내를 확인합니다. Node.js, Playwright 및 Edge가 있는 환경에서
`node tests/extraction.cjs`로 실행합니다. Playwright가 별도 경로에 설치되어 있으면
`NODE_PATH`를 해당 `node_modules` 경로로 설정하세요. 서비스 실행에는 필요하지 않습니다.
