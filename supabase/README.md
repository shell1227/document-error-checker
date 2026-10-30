# Supabase 설정 순서

## 기존 프로젝트에 HWPX·PDF 추가

이미 테이블을 만든 프로젝트는 SQL Editor → New query에서 `add-hwpx-pdf.sql` 전체를
붙여 넣고 Run을 누르세요. 기존 기록과 RLS 정책은 유지하고 파일 형식 제약만 확장합니다.
초기 `setup.sql`을 다시 실행하는 것만으로는 기존 테이블의 제약 조건이 바뀌지 않습니다.
이전에 HWPX SQL을 실행하지 않았어도 이 파일 하나로 두 형식을 허용합니다.
완료 후 HWPX와 PDF로 검사하여 저장 안내와 이전 기록의 상세 결과를 확인하세요.
오래된 `add-hwpx.sql` 대신 최신 파일을 사용하세요.

설정값이 비어 있거나 DB에 연결되지 않아도 DOCX/PPTX/HWPX/PDF 검사와 JSON 다운로드는 동작합니다.
아래 설정이 끝나면 검사 완료 시 자동 저장하며, 첫 화면/설정 화면의 '이전 검사 기록 보기'로 조회합니다.

## 1. 프로젝트 생성

1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인합니다.
2. New project를 선택하고 프로젝트를 만듭니다. 이름은 `document-error-checker`로 지정해도 됩니다.
3. Database password는 따로 보관합니다. 웹 코드에 입력하지 않습니다.
4. 프로젝트 준비가 끝날 때까지 기다립니다.

기존 프로젝트를 사용해도 되지만 아래 SQL은 이 프로그램의 새 테이블을 위한 초기 설정입니다.
같은 이름의 테이블이 이미 있다면 먼저 구조와 기존 RLS 정책을 확인하세요.

## 2. 익명 인증 활성화

1. 프로젝트의 Authentication에서 Sign In / Providers 또는 익명 로그인 설정을 엽니다.
2. **Anonymous Sign-Ins / Allow anonymous sign-ins**를 활성화하고 저장합니다.

이메일/비밀번호를 입력하는 사용자 로그인 화면은 만들지 않습니다. Supabase가 각 브라우저의
익명 사용자를 발급하고, SDK가 세션을 유지·갱신합니다. 익명 사용자도 `authenticated` 역할을
사용하며, 공개 `anon` 키 자체와는 다른 개념입니다.

브라우저의 사이트 데이터를 지우거나 다른 기기·브라우저·도메인으로 접속하면 이전 사용자를
복원할 수 없습니다. 로컬 개발 주소와 Vercel 주소, 미리보기 주소도 각각 다른 저장소입니다.
여러 기기에서 기록을 공유하려면 이후 이메일 등의 정식 계정 연결 기능이 필요합니다.

## 3. 테이블과 접근 정책 생성

1. 왼쪽 SQL Editor → New query를 엽니다.
2. 이 폴더의 `setup.sql` 전체를 붙여 넣고 Run을 누릅니다.
3. Table Editor에서 `inspection_records` 테이블이 생겼는지 확인합니다.
4. RLS가 활성화되어 있고 SELECT/INSERT 정책이 사용자 ID와 `auth.uid()`를 비교하는지 확인합니다.

SQL은 자신의 기록만 추가·조회하도록 허용합니다. 모든 사람이 읽을 수 있는 정책으로
변경하지 마세요. 원본 파일은 저장하지 않지만 결과에는 문서 일부 텍스트가 들어갈 수 있습니다.
재실행해도 데이터를 삭제하지 않으며, 기존의 같은 이름 테이블을 새 구조로 변경하지는 않습니다.
별도로 만든 공개 정책이 기존에 있다면 이 SQL만으로 제거되지 않으므로 확인이 필요합니다.

저장 컬럼:

| 컬럼 | 내용 |
|---|---|
| id | 검사별 UUID. 저장 재시도 때 같은 값을 사용 |
| user_id | Supabase가 현재 인증 사용자 ID를 자동 입력 |
| file_name / file_format | 파일명 / docx, pptx, hwpx 또는 pdf |
| inspected_at | 검사 완료 시각(브라우저 기준, UTC) |
| created_at | DB에 저장된 시각(서버 기준) |
| document_type / inspection_items | 문서 종류 / 선택 항목 |
| criteria / result / summary | 검사 기준 / 상세 결과 / 일치·불일치·검사 불가 건수 |
| result_version | 현재 저장 형식 버전 1 |

## 4. 공개 연결값 입력

1. 프로젝트의 Connect 또는 Settings / API 설정에서 **Project URL**을 복사합니다.
2. API Keys에서 **Publishable key** (`sb_publishable_...`)를 복사합니다.
3. `frontend/supabase-config.js`를 다음처럼 수정합니다.

```javascript
window.documentCheckerCloudConfig = {
  url: "https://여기에-프로젝트주소.supabase.co",
  publishableKey: "sb_publishable_여기에공개키"
};
```

Legacy `anon` 키도 지원합니다. **secret 키, service_role 키, DB 비밀번호는 넣지 않습니다.**
이 두 값은 브라우저에 공개되는 설정이며 접근 통제는 익명 인증과 RLS가 담당합니다.
일반 HTML/JS 사이트라 Vercel 환경 변수만 설정하면 이 파일에 자동 반영되는 구조가 아닙니다.
현재 버전에서는 공개값을 이 파일에 입력하면 되며 별도 빌드는 필요하지 않습니다.

## 5. 저장·조회 확인

1. 로컬 HTTP 서버 또는 설정이 반영된 배포 주소를 엽니다.
2. DOCX/PPTX 검사를 완료하고 **'Supabase에 검사 기록을 저장했습니다.'**를 확인합니다.
3. '이전 검사 기록 보기'를 열어 파일명·형식·시각·건수를 확인합니다.
4. 기록을 선택해 당시 기준과 결과가 같은지 확인하고 다운로드도 확인합니다.
5. 페이지를 닫았다 다시 열어도 같은 브라우저/주소에서 기록이 남는지 확인합니다.
6. Supabase Table Editor에서 같은 id와 기준·결과가 저장됐는지 확인합니다.
7. 다른 브라우저 또는 시크릿 창에서 접속하면 기존 기록이 보이지 않아야 합니다.
8. 인터넷을 끊거나 잘못된 공개 키를 사용해도 기본 문서 검사가 끝나는지 확인합니다.
   저장 실패 시 재시도 버튼이 나오며 원래 결과는 JSON으로 다운로드할 수 있습니다.

설정 후 실제 API/RLS 자동 검증도 가능합니다. Playwright와 Edge가 설치된 환경에서
저장소 루트의 `node tests/supabase-live.cjs`를 실행합니다. 테스트는 연결 확인용 가상 기록
두 개를 실제 DB에 저장하고, 다른 사용자가 조회·추가할 수 없는지 확인합니다.
생성된 테스트 기록/익명 사용자는 자동 삭제하지 않습니다.

## 6. GitHub / Vercel 반영

로컬 확인 → GitHub Desktop에서 변경 확인 및 Commit → Push origin → Vercel Ready 확인 →
기존 배포 주소에서 다시 저장·조회 확인 순서로 진행합니다. Vercel의 빌드 설정은 그대로입니다.

## 제한과 오류 확인

- 프로젝트 미설정 시 저장/조회만 비활성화됩니다. 검사 기능과 JSON 다운로드는 그대로입니다.
- 저장은 결과 표시와 독립적으로 진행합니다. 실패는 검사 성공을 취소하지 않습니다.
- 같은 검사 저장 재시도는 같은 ID를 사용합니다. 다시 '검사 시작'을 누르면 새로운 검사 기록입니다.
- 실패 기록의 영구 로컬 대기열은 없습니다. 재시도 전에 화면을 닫으면 새 검사 또는 JSON 보관이 필요합니다.
- 저장 결과 전체는 2MB까지 지원하며 초과 시 잘라 저장하지 않고 실패 안내를 표시합니다.
- 기록 삭제·수정 UI, 정식 계정 연결, CAPTCHA 위젯은 아직 구현하지 않았습니다.
  Supabase에서 CAPTCHA를 필수로 켜면 현재 익명 인증에는 토큰이 없어 실패합니다.
  공개 서비스의 사용량이 늘어나면 CAPTCHA 연동과 익명 사용자 관리를 다음 단계로 추가해야 합니다.
- '익명 로그인 활성화' 안내: Anonymous Sign-Ins 설정을 확인합니다.
- '테이블 없음' 안내: setup.sql 실행 여부와 Data API의 public 스키마 노출 설정을 확인합니다.
- '접근 권한 없음' 안내: RLS 정책과 테이블 권한을 확인합니다. RLS를 끄는 방식으로 해결하지 않습니다.
- 검사 날짜는 브라우저 시계 기준이며 화면에는 한국 시간으로 표시합니다. 서버 저장 시각은 created_at입니다.
- `tests/history.cjs`는 **모의 API**를 이용한 프론트엔드 테스트입니다. 실제 Supabase SQL/RLS를 검증한 결과와 구분합니다.

공식 참고: [익명 인증](https://supabase.com/docs/guides/auth/auth-anonymous),
[공개 API 키](https://supabase.com/docs/guides/getting-started/api-keys),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
