# PDF 검증

PDF.js 6.4.299를 고정하여 module/worker/CMaps/기본 글꼴을 같은 버전으로 포함했습니다.
배포에 npm 설치나 빌드 명령은 필요하지 않습니다.
공식 API: https://mozilla.github.io/pdf.js/api/draft/api.js.html

테스트는 Python(reportlab, pypdf, Pillow), Windows 맑은 고딕 글꼴과 Node Playwright가 필요합니다.
Python으로 실제 파일을 생성하며, PDF.js 브라우저 추출과 검사 결과를 검증합니다.

```powershell
python tests/generate-pdf-samples.py "$env:TEMP/document-checker-pdf-tests"
node tests/pdf.cjs "$env:TEMP/document-checker-pdf-tests"
node tests/history.cjs
```

테스트 범위:
- 실제 PDF 8종: 영문 2페이지, 한글 임베디드 서브셋, 스캔, 빈 페이지, 좌표 변환,
  숨김 텍스트, 암호 보호, UserUnit=2
- 기준 일치·불일치·검사 불가, 필수 단어, 서브셋 이름과 비균등 변형의 보수적 처리
- 업로드→IndexedDB 유지/새로고침→기준 설정→검사 결과→JSON 다운로드
- module/worker/CMaps/기본 글꼴을 외부 접속 없이 읽는지 확인
- 실제 Supabase SDK + 모의 API로 PDF 자동 저장·조회·기록 상세·DB 제약 실패/재시도

W3C가 공개한 PDF도 확인했습니다. 필요하면 같은 폴더에 받아 테스트합니다.

```powershell
Invoke-WebRequest 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' -OutFile "$env:TEMP/document-checker-pdf-tests/w3c.pdf"
node tests/pdf.cjs "$env:TEMP/document-checker-pdf-tests"
```

스캔은 텍스트 검사 불가여도 페이지 수를 비교합니다. Word 문단을 좌표로 추측하지 않습니다.
글자 크기는 PDF 배치상 크기이며 원본 편집기의 글자 크기와 다를 수 있습니다.
글꼴은 저장된 이름을 비교합니다. Arial-BoldMT 등 일부 알려진 PostScript 이름은
Arial 같은 가족 이름으로 대응합니다. 임의의 접미사는 잘라서 같은 글꼴로 판정하지 않습니다.

실제 Supabase는 SQL Editor에서 `supabase/add-hwpx-pdf.sql` 실행이 필요합니다.
프론트엔드 테스트의 모의 API는 실제 DB 제약이나 RLS를 증명하지 않습니다.
SQL 실행 후 실제 사이트에서 HWPX/PDF 저장 및 이전 기록 상세를 확인해야 합니다.

개별 파일의 문제를 재현할 때는 다음 명령을 사용합니다. 원본 PDF는 수정하거나 외부로 보내지 않습니다.

```powershell
node tests/pdf-file.cjs "C:/경로/검사할문서.pdf"
```

두 번째 인수에 다른 `pdf-reader.js` 경로를 지정하면 같은 라이브러리로 이전 코드와 비교할 수 있습니다.
2026-10-30 확인한 배포본은 PDF.js 6.4.299에서 없는 `getGroups()`를 호출했습니다.
로컬 수정본은 iterator를 사용합니다. `Ready` 여부뿐 아니라 최신 커밋이 Production으로 배포됐는지 확인해야 합니다.
