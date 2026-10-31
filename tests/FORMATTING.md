# 서식 추출 및 검사 범위 점검

## 개선한 부분

- DOCX: 관계 파일이 가리키는 테마와 설정의 themeFontLang을 연결해 글꼴을 해석합니다. 기본 문단/문자 스타일, basedOn 상속, 조건부 서식이 없는 표 스타일, 번호 수준의 문단 속성을 읽습니다. 표·목록의 미지원 상속이 있어도 해당 항목에 직접 지정된 값이 확인되면 비교합니다.
- DOCX: 한글은 Hang, 가나는 Jpan 테마 항목을 선택합니다. 공유 한자는 문자 서식의 동아시아 언어와 테마 기본 언어로 구분하며 모호하면 검사 불가입니다. 문서 기본 언어가 일본어여도 한글을 Jpan으로 판정하지 않습니다.
- DOCX: 전체 스타일 계층이 확인되고 정렬이 생략된 일반 문단은 Microsoft의 Word 구현 규칙에 따라 왼쪽 정렬로 비교하며 근거를 기록합니다. 스타일 누락·조건부 표·미해석 목록·RTL·잘못된 정렬 값에는 이 규칙을 적용하지 않습니다. start/end 정렬은 문단 방향이 명시적으로 확인될 때만 비교합니다. 곡선 따옴표 등의 문자별 글꼴 선택이 미확정이어도 일반 문자 크기까지 일괄 제외하지 않습니다.
- PPTX: 레이아웃/마스터/테마/문단 수준/자동 맞춤의 기존 상속을 재검증했습니다. 글꼴·크기 미확정 시 누락된 상속 근거를 표시합니다.
- HWPX: 직접 ID와 문단 스타일의 서식 ID 상속을 모두 테스트했습니다. 문단 서식 출처와 줄 간격 종류를 결과에 보존합니다.
- PDF: 기존 지정 글꼴·등비 변환 크기·페이지 수 비교를 유지합니다. 글꼴 리소스 누락, 세로쓰기, Type3, 전단/비등비 변환을 크기 미확정 사유로 구분합니다.
- 맞춤법: kind=notice인 기능 한계/적용 범위 안내는 unknown 집계에서 제외합니다. 미응답 구간, 추출 누락, 위치 해석 실패와 판단 보류 후보는 계속 unknown으로 집계합니다. 후보가 없더라도 전체 정상으로 판정하지 않습니다. 이전 기록의 상세 화면도 알려진 범위 안내를 별도로 표시합니다.
- 각 검사 항목에 검사 불가 사유별 건수를 표시합니다. 전체 JSON은 기존 저장·다운로드 흐름을 그대로 사용하며 DB 스키마 변경은 필요 없습니다.

## 재현 테스트

Playwright가 설치된 NODE_PATH를 설정한 뒤 실행합니다. 실제 서비스/API 사용량을 소비하지 않습니다.

```text
node tests/docx-styles.cjs
node tests/document-matrix.cjs
node tests/pptx-styles.cjs
node tests/hwpx.cjs [실제 HWPX 파일 경로]
node tests/pdf.cjs
node tests/inspection.cjs
node tests/spelling.cjs
node tests/extraction.cjs
node tests/history.cjs
node tests/bareun-client.cjs
node tests/bareun-server.cjs
```

각 형식의 일치/불일치/검사 불가, 직접·상속·누락 서식과 저장·재조회 흐름을 확인합니다. history는 모의 Supabase 서버를 사용하며 실제 DB를 변경하지 않습니다. bareun-client/server도 모의 API를 사용합니다.

## 남은 한계

- DOCX/HWPX 정확한 페이지 수는 실제 배치 엔진 없이는 확정하지 않습니다.
- DOCX 조건부 표 서식, 복잡한 번호 스타일 연결, 변경 추적, 테마 언어 매핑 누락과 일부 문자 종류는 미확정입니다.
- PPTX 표 스타일/모호한 자리 표시자 상속 및 파일에 저장되지 않은 자동 재배치 결과는 미확정입니다.
- HWPX 위·아래 첨자, 일부 특수문자, 미지원 서식 참조는 미확정이며 고정/최소 간격은 %로 환산하지 않습니다.
- PDF 문단 정렬과 % 줄 간격은 원본 문단 속성이 없으므로 검사 불가입니다. 스캔 OCR은 지원하지 않습니다.
- 모든 형식에서 지정 글꼴 이름을 비교하며 실제 렌더링 시 글꼴 대체 여부는 판정하지 않습니다.
- 규칙/외부 맞춤법 검사 모두 전체 언어 정확성을 보장하지 않습니다. 외부 미검사 범위와 사용량 제한은 유지됩니다.

DOCX 테마 매핑 근거: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.themefontlanguages

DOCX 정렬 생략 및 상속 근거: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.justification

Word 구현의 기본 왼쪽 정렬 근거: https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/7e293042-3036-4d9b-aaaa-1cc714554db0

`DOCX_THEME_SAMPLE` 환경 변수로 `inspection_test_docx.docx` 경로를 지정하면 실제 문서의 한국어 글자 묶음 12개와 생략된 기본 정렬 5개를 추가 검증합니다.
