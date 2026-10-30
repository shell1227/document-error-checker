-- 기존 검사 기록과 RLS 권한을 보존하며 HWPX와 PDF 저장을 허용합니다.
-- 이전 add-hwpx.sql 실행 여부와 관계없이 이 파일만 실행하면 됩니다.
begin;
alter table public.inspection_records
  drop constraint if exists inspection_records_file_format_check;
alter table public.inspection_records
  add constraint inspection_records_file_format_check
  check (file_format in ('docx', 'pptx', 'hwpx', 'pdf'));
commit;
