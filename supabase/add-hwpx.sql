-- 기존 검사 기록과 RLS 권한은 유지하고 허용 파일 형식만 추가합니다.
-- 과거 HWPX 전용 파일입니다. PDF까지 지원하려면 add-hwpx-pdf.sql을 사용하세요.
begin;
alter table public.inspection_records
  drop constraint if exists inspection_records_file_format_check;
alter table public.inspection_records
  add constraint inspection_records_file_format_check
  check (file_format in ('docx', 'pptx', 'hwpx'));
commit;
