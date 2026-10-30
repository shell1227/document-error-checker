# Mozilla PDF.js

- 고정 버전: pdfjs-dist 6.4.299
- 출처: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.4.299.tgz
- 공식 API: https://mozilla.github.io/pdf.js/api/draft/
- 라이선스: Apache-2.0 (`LICENSE`), 기본 글꼴 및 CMaps의 개별 라이선스도 해당 폴더에 포함

`build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `cmaps/`, `standard_fonts/`를 원본 그대로 포함합니다.
PDF 추출용이므로 뷰어 UI, 이미지 렌더링용 WASM, 스크립트 실행용 sandbox는 포함하지 않습니다.
PDF 문서의 JavaScript를 실행하지 않습니다. 검사에는 브라우저와 로컬 파일 데이터만 사용합니다.

버전을 올릴 때 module/worker/보조 파일을 함께 교체하고 PDF 테스트를 실행하세요.
지정 글꼴 이름은 `fontExtraProperties`와 `page.commonObjs`를 통해 읽습니다.
이 메타정보 접근은 버전 변경에 영향을 받을 수 있어 원래 이름을 얻지 못하면 검사 불가로 처리합니다.
