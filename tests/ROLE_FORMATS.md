# 제목·소제목·본문별 글꼴/크기 검사

## 사용과 호환성

설정 화면의 ‘글꼴·글자 크기 검사 방식’은 기본적으로 ‘문서 전체 동일 기준’입니다. 이 모드에서는 기존 프리셋과 저장 형식을 그대로 사용합니다.

‘제목·소제목·본문별 기준’을 선택하면 활성화한 검사 항목에 대해서만 세 영역의 글꼴/크기를 입력합니다. 기준은 모두 직접 수정할 수 있습니다. 영역별 모드에서는 프리셋을 숨기고, 전체 모드로 돌아오면 기존 공통 입력값과 프리셋 선택 상태를 유지합니다. 정렬·줄 간격·분량·필수 단어·바른 동의는 바꾸지 않습니다.

영역별 모드의 기준은 `criteria.formatMode: "by-role"`, `criteria.roleFormats`에 저장합니다. 추출 문단에는 `role`, `roleReason`, 결과 상세에도 적용 영역과 근거가 들어갑니다. 실제 분류 불가만 검사 불가로 집계하며 정상 상세는 기존처럼 JSON에 보존합니다. 역할 구분 실패가 맞춤법/필수 단어 검사의 추출 실패로 취급되지는 않습니다.

Supabase의 기존 JSON 컬럼으로 저장하므로 SQL 변경은 필요 없습니다. 이전 기록에 영역 설정이 없으면 기존 전체 기준으로 표시합니다. 새 기준은 기록 상세 화면에도 표시합니다.

## 형식별 규칙

| 형식 | 제목 | 소제목·부제 | 본문 | 구분 불가 예 |
| --- | --- | --- | --- | --- |
| DOCX | 명시적인 Title/제목 스타일 | 상속된 개요 0~8, Heading/제목/개요 1~9, Subtitle/부제/소제목 스타일 | 직접 지정된 Normal/Body/Body Text/본문/바탕글 스타일 | 스타일 누락·순환, 임의 스타일(기본 Normal을 상속했다는 이유만으로 본문 처리하지 않음), 머리글/바닥글/텍스트 상자 |
| PPTX | title/ctrTitle 자리 표시자 | subTitle 자리 표시자(부제를 소제목 기준에 포함) | body, 또는 레이아웃→본문 마스터 연결을 확인한 obj 자리 표시자 | 일반 텍스트 상자, 연결이 확인되지 않은 obj, 표·날짜·쪽 번호, 모호한 연결 |
| HWPX | 제목/Title 스타일 이름 | OUTLINE 개요 0~8 또는 알려진 소제목 스타일 이름 | 바탕글/Normal/본문 등 스타일 이름 | 스타일·개요 누락/오류, 한글·영문 이름 충돌, 미지원 XML 분기, 머리말/꼬리말/주석/글상자 |
| PDF | Title 구조 태그 | H/H1~H6 구조 태그 | P 구조 태그 | 태그 없음, 구조 트리 오류, 텍스트와 연결되지 않음, 반복 ID, 태그 충돌, Artifact/지원하지 않는 태그 |

DOCX/HWPX 역할 판단은 `document-reader.js`의 작은 공통 함수 `styleRole`을 사용하고 형식별 추출기가 연결합니다. DOCX 개요 속성은 직접 서식과 스타일 상속을 따릅니다. Heading 1이나 PDF H1을 곧바로 문서 대표 제목으로 해석하지 않습니다. PPTX의 목록 들여쓰기 수준을 소제목으로 해석하지 않으며 기존 마스터/레이아웃 서식 상속 규칙도 유지합니다.

PDF는 PDF.js `getStructTree()`와 `getTextContent({includeMarkedContent:true})`의 ID를 연결합니다. 크기·위치·굵기만으로 역할을 추정하지 않습니다. 기존 텍스트 조각·순서·서식은 유지하므로 한 문단이 여러 조각으로 집계될 수 있습니다. 제목 태그가 없는 PDF에서 H1만 있으면 제목이 아닌 소제목으로 검사합니다. 태그의 의미가 원문 작성자의 의도와 같은지까지 검증하지는 못합니다.

## 테스트

```powershell
node tests/roles.cjs
```

네 형식 각각에서 제목/소제목/본문의 서로 다른 글꼴·크기가 일치하는 경우와 한 영역의 기준만 바꾼 경우를 검사합니다. 구분 불가·태그 없는 PDF·반복 구조 ID·전체 기준 호환·필수 단어/맞춤법 독립성·프리셋 복귀·선택한 검사만 입력·최종 JSON/세션/기록 표시도 검증합니다. API와 DB는 실제로 호출하지 않습니다.

테스트용 Office 파일 생성(테스트용 Python/python-docx/python-pptx만 필요):

```powershell
python tests/generate-role-samples.py "$env:TEMP/document-checker-role-office"
$env:ROLE_OFFICE_DIR = "$env:TEMP/document-checker-role-office"
node tests/roles.cjs
```

`ROLE_HWPX_SAMPLE`에 실제 HWPX 경로를 지정하면 추출과 분류 건수 일관성을 추가 확인합니다. 실제 샘플의 시각적 의미를 자동으로 정답 판정하는 테스트는 아닙니다.

이번 구현 중 생성한 DOCX/PPTX 실파일은 세 영역 모두 기준 일치를 확인했습니다. 구조가 명시된 HWPX 패키지와 tagged PDF 파일에서도 일치/불일치/구분 불가를 확인했습니다. 실제 `inspection_test_hwpx.hwpx`는 본문 스타일 문단 6개로 분류됐으며 시각적 제목 여부는 확인하지 않았습니다.

### 최종 재점검 (2026-11-17)

- 네 형식에서 제목 24pt·소제목 16pt·본문 11pt와 서로 다른 글꼴을 적용해 모두 일치하는지 확인했습니다. 각 영역의 글꼴만/크기만/둘 다 기준이 다를 때 해당 항목·영역만 불일치인지도 확인했습니다.
- 네 형식의 제목 서식이 잘못된 문서 파일을 별도로 만들어 동일한 기준으로 검사했습니다. python-docx/python-pptx로 생성한 Office 파일은 정상 2개와 제목/소제목/본문 각각의 불일치 파일 6개를 검증했습니다.
- 역할 근거가 없는 문단을 60pt로 크게 꾸며도 제목으로 임의 분류되지 않는지 확인했습니다. DOCX는 가운데 정렬도 함께 적용했습니다.
- 전체 동일 기준·프리셋(실제 DOCX 12개 포함)·규칙 맞춤법·외부 검사 실패 대응·JSON·모의 Supabase 저장/조회 등 회귀 테스트도 통과했습니다.
- 이번 점검에서 앱 실행 코드는 추가 수정하지 않았고 테스트를 보강했습니다. 실제 바른/Supabase 서비스와 Vercel 배포, Office/한글 화면 렌더링 대조는 수행하지 않았습니다.

## 남은 한계

- 문서가 Normal/바탕글을 사용해 수동으로 제목을 꾸몄다면 해당 스타일의 본문 기준이 적용될 수 있습니다. 임의 스타일이나 역할 정보가 없는 텍스트는 구분 불가입니다. 시각적 의미를 자동 추정하거나 사용자 정의 스타일을 직접 매핑하는 UI는 포함하지 않습니다.
- 소제목의 깊이마다 서로 다른 기준을 설정하지 않고 하나로 묶습니다. 부제도 소제목 기준을 사용합니다.
- PDF의 태그가 잘못 작성되거나 PDF.js가 복구/생략한 구조는 모두 탐지할 수 없습니다. OCR·태그 자동 생성은 지원하지 않습니다.
- 글꼴 대체 렌더링, DOCX/HWPX 정확한 페이지 수, PDF 원본 정렬/% 줄 간격 등 기존 형식별 한계는 그대로입니다.

근거: [Microsoft 개요 수준](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.outlinelevel), [Microsoft 자리 표시자](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.placeholdervalues), [한컴 스타일](https://help.hancom.com/hoffice/multi/ko_kr/hwp/format/style/style.htm), [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html).
