# HWPX 검사 확인

`NODE_PATH`에 Playwright 경로를 지정한 뒤 다음 테스트를 실행합니다.

```powershell
node tests/hwpx.cjs
node tests/history.cjs
```

첫 테스트는 서식이 명확한 ZIP/XML로 일치·불일치·검사 불가를 확인합니다.
두 번째는 실제 SDK와 모의 API로 업로드 → 설정 → 검사 → 저장 → 기록 상세 조회를 확인합니다.
모의 API 테스트는 실제 데이터베이스 제약 조건이나 RLS를 검증하지 않습니다.

한컴 2020 저장 공개 문서도 다음처럼 임시 폴더에 받아 확인했습니다.
문서는 저장소에 재배포하지 않습니다.

```powershell
Invoke-WebRequest 'https://raw.githubusercontent.com/edwardkim/rhwp/main/tests/fixtures/issue7174/SO-SUEOP-hancom2020.hwpx' -OutFile "$env:TEMP/document-checker-hancom.hwpx"
node tests/hwpx.cjs "$env:TEMP/document-checker-hancom.hwpx"
```

원본: https://github.com/edwardkim/rhwp/blob/main/tests/fixtures/issue7174/SO-SUEOP-hancom2020.hwpx

확인한 파일 SHA-256: `CF1AC18087D4DC9DD3AD3BC4E97C265A23F76E4F1C52522CCB9DBB110BFC3585`

참고한 한컴 자료:
- https://tech.hancom.com/python-hwpx-parsing-1/
- https://tech.hancom.com/python-hwpx-parsing-2/

실제 DB는 기존 프로젝트에서 `supabase/add-hwpx.sql` 실행이 필요합니다.
그다음 같은 브라우저에서 HWPX를 검사해 저장 안내와 기록 목록/상세를 확인하세요.
RLS를 끄거나 전체 사용자 공개 정책을 추가할 필요는 없습니다.
