# document-error-checker
문서의 오탈자와 양식 오류를 자동 검사하는 웹 서비스

## 현재 구현

- 첫 화면에서 DOCX/PPTX/HWPX/PDF, 문서 종류, 검사 항목 선택
- 세부 설정에서 검사 기준 검증 및 sessionStorage 저장
- '검사 시작'을 누르면 문서 정보를 추출하여 같은 화면 아래에 표시
- 추출 텍스트, 문단별 글꼴·크기·정렬·줄 간격 확인 및 전체 JSON 다운로드
- Supabase 연결 시 검사 완료 후 기록 자동 저장, 이전 기록의 기준·결과 조회

선택한 글꼴·글자 크기·정렬·줄 간격·분량·필수 단어 기준과 추출 정보를 비교합니다.
맞춤법·띄어쓰기는 제한된 한국어 규칙으로 수정 후보를 찾습니다. 오류 후보가 없어도 전체 정상으로 판정하지 않습니다.
규칙은 추출 텍스트 전체에 적용합니다. 동의한 바른 추가 검사는 오류 유무와 관계없이
문서를 순서대로 묶고 나누어 최대 1만 자까지 검사하고 응답 수신/미검사 범위를 표시합니다.
같은 위치에서 같은 교정 결과를 만드는 후보만 병합하며 기존 결과 JSON과 함께 저장합니다.

## 실행과 배포

로컬 HTTP 서버로 `frontend` 폴더를 열어 사용하세요. 파일을 더블 클릭하는
`file://` 방식은 브라우저 저장소 동작이 다를 수 있어 권장하지 않습니다.
Python이 있다면 저장소에서 `python -m http.server 8000 --directory frontend`를
실행하고 `http://localhost:8000`에 접속할 수 있습니다.

Vercel 설정: Root Directory `frontend`, Preset `Other`, Build Command 빈 값,
Output Directory `.`. 환경 변수는 필요하지 않습니다.
Supabase는 `frontend/supabase-config.js`의 공개 설정 두 개로 연결합니다.
바른 외부 검사는 선택 기능입니다. 사용하는 경우에만 서버 환경 변수와 호출 제한 SQL이 필요합니다.
설정 순서는 [바른 API 연결](supabase/BAREUN.md)을 참고하세요. 바른 키를 공개 설정 파일에 넣지 마세요.
설정이 비어 있거나 연결에 실패해도 문서 검사는 동작합니다.
프로젝트 생성부터 SQL/RLS·익명 인증·연결 확인까지는 [Supabase 설정 순서](supabase/README.md)를 참고하세요.

## 파일 전달과 코드 역할

- `file-store.js`: 파일을 브라우저 IndexedDB에 보관하고 탭의 파일 ID로 다시 읽음.
  같은 탭에서 새 파일을 선택하면 이전 파일을 교체합니다.
- `document-reader.js`: 공통 ZIP/XML 읽기와 형식별 추출 함수 연결
- `docx-reader.js`: DOCX 본문·표·텍스트 상자·머리글·바닥글의 문단과 텍스트
- `hwpx-reader.js`: HWPX 구역 순서, 글자·문단 서식 ID, 언어별 글꼴 및 상대 크기
- `pdf-reader.js`: PDF.js를 사용한 PDF 페이지·텍스트 조각·지정 글꼴·변환된 크기 추출
- `pptx-reader.js`: 실제 슬라이드 순서에 따라 텍스트 상자·표의 문단과 텍스트
- `pptx-styles.js`: PPTX 레이아웃·마스터·테마의 서식 상속 해석
- `settings.js`: 기존 기준 저장 및 추출 결과 표시
- `document-inspector.js`: 화면과 독립적인 기준 비교
- `korean-proofreader.js`: 네 형식의 추출 텍스트에 공통 적용하는 제한된 한국어 규칙 검사
- `bareun-proofreader.js`: 동의한 텍스트의 외부 검사·수정 위치 연결·기본 결과 병합
- `api/proofread.js`: Vercel 서버 함수. 비밀 키로 바른 CorrectError 호출 및 사용자 인증·DB 사용량 예약
- `inspection-view.js`: 항목별 결과와 불일치/검사 불가 사유 표시
- `history-store.js`: Supabase 익명 인증·자동 저장·기록 목록/상세 조회
- `history-save.js`: 검사 결과와 독립적인 저장 상태 및 재시도
- `history.html`, `history.js`: 이전 검사 기록 화면
- `supabase-config.js`: 공개 Project URL / publishable key
- `supabase/setup.sql`: 기록 테이블과 사용자별 SELECT/INSERT RLS 정책
- `supabase/add-hwpx.sql`: 기존 DB에 HWPX 허용 형식 추가 (기록·RLS 유지)
- `supabase/add-hwpx-pdf.sql`: 기존 DB에 HWPX와 PDF를 함께 허용하는 최신 변경 SQL

파일은 서버로 업로드하지 않습니다. IndexedDB는 탭을 닫아도 남을 수 있으며,
브라우저 사이트 데이터 삭제로 지울 수 있습니다. 새 탭에서 시작할 때는
첫 화면에서 파일을 다시 선택하세요. 현재 입력 파일 크기는 최대 20MB입니다.
Supabase가 설정된 경우 파일명·검사 시각·기준·상세 결과는 DB에 저장합니다.
상세 결과에는 문서 일부 텍스트가 포함됩니다. 원본 파일과 전체 추출 데이터는 전송하지 않습니다.
현재는 같은 브라우저/사이트 주소의 익명 인증 세션에서만 과거 기록을 볼 수 있습니다.

## 추출 데이터와 한계

공통: `text`, `warnings`. 문단에는 `text`, `runs`, `alignment`, `lineSpacing`이 있고,
글자 묶음(run)에는 `text`, `fontFamily`, `fontSizePt`, `fontSettings`가 있습니다.
`fontSettings`에는 문자 종류별 글꼴과 테마 참조 등 원본 정보가 들어갑니다.
`null`은 확인 불가이며 정상 또는 오류라는 뜻이 아닙니다.

- DOCX: 기본 서식, 문단/문자 스타일의 basedOn 상속, 직접 서식을 읽습니다.
  글자 크기는 pt로, 줄 간격은 배수이면 %, 고정/최소이면 pt와 규칙으로 표시합니다.
  문단 앞뒤 간격도 pt로 보관합니다. 페이지 수는 계산하지 않아 `null`입니다.
- HWPX: content.hpf의 spine 순서로 구역을 읽고 header.xml의 서식 ID를 연결합니다.
  본문과 중첩 표·글상자·머리글·바닥글에 저장된 문단을 읽습니다. 한글/영문/한자/가나별
  `fontByScript`, `sizeByScript`를 저장하며 글자 크기는 height와 relSz로 계산합니다.
  LEFT/RIGHT/CENTER/JUSTIFY 및 PERCENT 줄 간격을 비교합니다.
  고정·최소·여백 줄 간격, 위·아래 첨자 크기, 기타 문자, 바탕쪽·수식·이미지·필드의
  최종 표시 내용, 정확한 페이지 수는 검사 불가입니다. 새 라이브러리는 필요하지 않습니다.
  기존 Supabase는 SQL Editor에서 최신 `supabase/add-hwpx-pdf.sql` 실행 후 HWPX를 저장할 수 있습니다.
- PDF: 페이지 트리의 페이지 수(빈 페이지 포함)를 비교합니다. 텍스트 조각의 지정 글꼴과
  좌표 변환·UserUnit을 반영한 크기(pt)를 읽습니다. 서브셋 접두사(ABCDEF+)를 제외하고
  이름을 비교하며, 임시 폰트 ID나 serif 같은 대체 글꼴은 정답으로 사용하지 않습니다.
  원본 문단 정렬과 백분율 줄 간격은 복원하지 않습니다. 비균등 확대·기울임·세로쓰기·
  Type3 글꼴의 크기는 검사 불가입니다. 원본 편집기의 글자 크기를 보장하지 않습니다.
  스캔·그림·벡터 윤곽선의 OCR, 주석·입력 양식은 지원하지 않습니다. 미추출 내용이 있으면
  없는 단어를 미포함으로 확정하지 않습니다. 숨김·클리핑·선택 레이어가 있으면 필수 단어는
  검사 불가입니다. 다단 문서·줄바꿈·잘못된 Unicode 매핑은 검색 결과에 영향을 줄 수 있습니다.
  암호 PDF는 암호 없는 사본이 필요합니다. 최대 20MB/500페이지/텍스트 200만 자입니다.
  `vendor/pdfjs`에 Mozilla PDF.js 6.4.299, worker, CMaps, 기본 글꼴 및 라이선스를 포함했습니다.
  PDF만 처음 읽을 때 모듈을 불러오며 파일이나 검사 내용을 외부 서비스로 보내지 않습니다.
  최신 브라우저와 HTTP(S) 접속이 필요합니다. React나 빌드 도구는 추가하지 않았습니다.
  DB 저장 전 SQL Editor에서 `supabase/add-hwpx-pdf.sql`을 실행하세요. 기존 기록·RLS는 유지됩니다.
- PPTX: `slides`에 슬라이드별 문단을 담고 `slideCount`를 제공합니다.
  관계 파일을 따라 해당 슬라이드의 레이아웃·마스터·테마를 읽습니다.
  슬라이드→레이아웃 자리 표시자는 idx, 레이아웃→마스터는 종류로 대응합니다.
  기본 텍스트 스타일, 마스터의 제목/본문/기타 스타일, 대응 자리 표시자의
  수준별 스타일·문단 속성, 텍스트 상자 스타일, 직접 서식을 가까운 순서로 적용합니다.
  자리 표시자의 종류는 서식 상속에만 사용하며, 검사 기준은 여전히 문서 전체에 같습니다.
- PPTX 테마의 major/minor 참조를 실제 지정 이름으로 변환합니다. 빈 동아시아 글꼴은
  Hang/Jpan/Hans/Hant 보조 글꼴을 확인합니다. 한글과 영문을 분리하고, 한자는
  언어 정보로 구분할 수 있을 때만 테마 글꼴을 확정합니다. 테마 재정의도 읽습니다.
  DOCX의 테마 참조 해석은 여전히 지원하지 않습니다.
- 단일 글꼴 이름만으로 모든 문자의 실제 표시 글꼴을 판단할 수 없습니다.
  DOCX의 조건부 표/번호 서식, 변경 추적,
  각주·미주·수식과 PPTX의 노트·차트·SmartArt 및 이미지 OCR은 지원하지 않습니다.
- 압축 해제와 XML 분석은 브라우저 메모리를 사용합니다. 복잡하거나 압축 해제 후
  매우 커지는 문서는 아직 처리 범위가 제한됩니다.

추출기를 확장할 때는 기존 공통 필드를 유지하면서 형식별 읽기 함수를 추가하세요.
검사 기준과의 비교는 별도 `documentInspector.inspect` 함수로 수행합니다.

## 검사 결과 읽는 방법

각 항목은 `기준 일치`, `불일치`, `검사 불가`로 표시합니다. 불일치가 있으면
항목 상태는 불일치이며, 동시에 존재하는 검사 불가 건수도 별도로 표시합니다.
하나라도 검사 불가인 부분이 있으면 항목 전체를 기준 일치로 표시하지 않습니다.
일치한 부분과 검사 불가가 섞인 경우에는 `일부 검사 불가`로 표시합니다.
세부 내역에는 문서 부분/슬라이드, 문단, 글자 묶음, 기준값, 추출값, 사유와
텍스트 일부를 담습니다. 화면은 항목당 200건까지 표시하며 JSON 다운로드에는
전체 결과와 적용 기준을 담습니다. 기준을 수정하면 이전 검사 결과를 숨깁니다.

- 제목과 본문을 구분하지 않고 읽은 문단 전체에 기준을 적용합니다.
  빈 문단과 공백만 있는 글자 묶음은 제외하며 비교 대상이 없으면 검사 불가입니다.
- 글꼴: 한글·한자·가나와 기본 영문·기호의 지정 글꼴을 각각 비교합니다.
  해석하지 못한 테마 참조, 누락된 글꼴, 기타 문자 선택 규칙은 검사 불가입니다.
  이름 앞뒤 공백과 영문 대소문자는 무시하고, 맑은 고딕/Malgun Gothic,
  굴림/Gulim, 돋움/Dotum, 바탕/Batang, 나눔고딕/NanumGothic만 별칭으로 처리합니다.
  문서에 저장된 이름을 비교하며 실제 설치 글꼴·대체 렌더링은 확인하지 않습니다.
- 글자 크기: 확인 가능한 저장 크기(pt)를 비교합니다. PPTX 자동 맞춤은
  fontScale을 반영하며, 해당 속성 생략 시 표준 기본값 100%를 사용합니다.
  원래 크기는 declaredFontSizePt에 보존합니다. 축소율 값이 잘못되었거나
  상속 연결을 확정하지 못하면 검사 불가입니다. PowerPoint의 재배치 결과는 재현하지 않습니다.
- 정렬: DOCX left/center/right/both와 PPTX l/ctr/r/just를 공통 기준에 대응합니다.
  값 누락, 방향에 따라 달라지는 start/end, 배분 정렬 등은 검사 불가입니다.
- 줄 간격: % 단위로 확정된 값만 비교합니다. 고정/최소 pt 값은 %로 임의 변환하지 않습니다.
  PPTX는 상속 연결을 모두 확인하고도 값이 생략되었으면 기본 100%로 해석합니다.
  자동 맞춤의 lnSpcReduction도 반영하며 원래 값은 declaredLineSpacing에 보존합니다.
  정렬도 전체 상속 확인 후 생략된 경우 DrawingML 기본 왼쪽 정렬을 적용합니다.
  근거 파일/속성은 formatSources에 보관하고 결과 세부 내역에도 표시합니다.
- 분량: PPTX 슬라이드 수(숨김 슬라이드 포함)의 최소/최대 경계를 포함해 비교합니다.
  DOCX 페이지 수는 저장된 통계를 신뢰하지 않고 검사 불가로 표시합니다.
- 필수 단어: NFC 유니코드 정규화 후 대소문자와 띄어쓰기를 유지한 부분 문자열
  검색입니다. 의미를 판단하지 않습니다. 미추출 내용이 있으면 찾은 단어는 포함으로,
  찾지 못한 단어는 검사 불가로 표시합니다. 변경 추적이 있으면 최종 텍스트가 불명확해
  포함 여부도 검사 불가입니다. PPTX 노트는 본문 검사 범위에서 제외합니다.
- DOCX 표·번호 목록·불완전한 스타일 참조·변경 추적의 서식은 현재 비교하지 않습니다.
  PPTX 표 스타일, 모호한 자리 표시자, 미해석 언어/테마와 끊어진 상속 연결도 검사 불가입니다.
  endParaRPr는 이후 입력할 글자의 속성이므로 기존 글자의 서식으로 추정하지 않습니다.
  일부 내용을 읽지 못하면
  서식 검사에도 추출 범위 밖의 검사 불가 사유를 추가합니다.

## 라이브러리와 테스트

`frontend/vendor/jszip.min.js`는 DOCX/PPTX의 ZIP 압축을 읽기 위한
[JSZip 3.10.1](https://github.com/Stuk/jszip/tree/v3.10.1)입니다.
MIT 라이선스로 사용하며 원본 라이선스를 같은 폴더에 포함했습니다.
로컬 파일로 제공하므로 실행 중 CDN 연결이 필요하지 않습니다.

`frontend/vendor/supabase.min.js`는 공식 `@supabase/supabase-js` 2.118.0 브라우저 번들입니다.
인증·세션 갱신·DB 요청을 직접 구현하지 않기 위해 추가했으며 MIT 라이선스를 함께 포함합니다.
프로젝트 실행에 npm 설치나 별도 빌드는 필요하지 않습니다.

`node tests/history.cjs`는 실제 SDK와 모의 Auth/PostgREST API로 DOCX/PPTX 자동 저장,
목록/상세/다운로드, 세션 갱신, 페이지 이동, 재시도·중복 방지, 연결 실패와 검사 기능의
독립성을 확인합니다. 실제 Supabase DB에 접속하거나 SQL/RLS 정책을 검증하는 테스트는 아닙니다.
연결 설정 후에는 `node tests/supabase-live.cjs`로 실제 저장/조회와 두 사용자의 RLS 격리를
검증할 수 있습니다. 현재 공개 연결값이 없어 실제 API 테스트는 아직 실행할 수 없습니다.

`tests/extraction.cjs`는 테스트 ZIP을 메모리에서 만들고 Playwright와 Edge로
추출값·파일 전달·실패 안내를 확인합니다. Node.js, Playwright 및 Edge가 있는 환경에서
`node tests/extraction.cjs`로 실행합니다. Playwright가 별도 경로에 설치되어 있으면
`NODE_PATH`를 해당 `node_modules` 경로로 설정하세요. 서비스 실행에는 필요하지 않습니다.

`node tests/inspection.cjs`는 추가 라이브러리 없이 비교 함수의 일치/불일치/검사 불가,
혼합 문자 글꼴, 분량 경계, 미추출 텍스트와 단위 차이를 확인합니다.

`node tests/pptx-styles.cjs`는 Playwright/Edge로 자리 표시자 대응, 상속 우선순위,
목록 수준, 테마/테마 재정의, 여러 마스터, Strict XML, 자동 맞춤,
누락·모호한 참조의 검사 불가 처리를 확인합니다.

선택적 실파일 테스트: `python tests/generate-pptx-sample.py <임시 PPTX 경로>`로
python-pptx 기본 템플릿의 제목·본문·일반 텍스트 상자가 있는 파일을 만듭니다.
`PPTX_SAMPLE` 환경 변수에 경로를 넣으면 브라우저 테스트 두 개가 이 파일도 읽습니다.
이 스크립트로 생성한 기본 샘플이면 `PPTX_DEFAULT_SAMPLE=1`로 44/32/28/18pt,
한글 테마 글꼴, 정렬, 100% 줄 간격의 기대값과 UI 결과도 검증할 수 있습니다.
Python/python-pptx는 이 선택적 테스트에만 필요합니다.

### 여섯 항목 통합 검증

`node tests/document-matrix.cjs`는 DOCX/PPTX ZIP을 메모리에서 생성해 실제 추출기와
비교기를 함께 검증합니다. 글꼴·크기·정렬·줄 간격·분량·필수 단어에 대해 일치,
불일치, 검사 불가를 확인하며, DOCX 페이지 수는 항상 검사 불가를 기대합니다.
숨김 슬라이드를 포함한 분량, 글자 묶음 사이에 나뉜 단어, 빈 텍스트, 고정 pt 간격,
잘못된 직접 크기, 복합 문자 설정의 on/off, 머리글의 실제 참조/누락도 검증합니다.

DOCX 실파일 샘플은 `python tests/generate-docx-sample.py <임시 DOCX 경로>`로 만듭니다.
이 선택적 생성에는 python-docx가 필요합니다. `DOCX_SAMPLE` 환경 변수에 생성 경로를
설정하면 통합 검증과 업로드 화면 테스트가 이 파일도 사용합니다.
DOCX 샘플에는 12pt·왼쪽 정렬·160%의 본문과 같은 기본 서식을 사용하는 머리글이 있습니다.
PPTX 샘플과 함께 사용하면 두 형식의 파일 선택→기준 설정→결과 표시 흐름을 확인합니다.

2026-10-27 검증 중 DOCX 세 가지 문제를 수정했습니다.
- 잘못된 직접 글자 크기를 상위 스타일 값으로 대체해 일치로 오판하던 문제
- 섹션이 참조하지 않는 머리글/바닥글의 내용을 단어 검사에 포함하던 문제
- cs/rtl 설정이 명시적으로 꺼져 있어도 요소 존재만으로 검사 불가 처리하던 문제

모든 테스트는 로컬 브라우저에서 수행합니다. 생성 샘플은 Office의 모든 문서를
대표하지 않으며, Word/PowerPoint의 실제 렌더링 결과와 비교하는 테스트는 아닙니다.

서식 해석 참고: [자리 표시자 상속](https://python-pptx.readthedocs.io/en/latest/user/placeholders-understanding.html),
[Microsoft 자동 맞춤 축소율 규격](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.normalautofit.fontscale),
[Apache POI 문단 서식 구현](https://github.com/apache/poi/blob/trunk/poi-ooxml/src/main/java/org/apache/poi/xslf/usermodel/XSLFTextParagraph.java).
