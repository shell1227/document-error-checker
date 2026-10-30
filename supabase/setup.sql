-- 새 Supabase 프로젝트의 SQL Editor에서 실행하세요. 원본 문서 파일은 저장하지 않습니다.
create table if not exists public.inspection_records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 512),
  file_format text not null check (file_format in ('docx', 'pptx', 'hwpx', 'pdf')),
  inspected_at timestamptz not null,
  created_at timestamptz not null default now(),
  document_type text not null check (document_type in ('report', 'assignment', 'general')),
  inspection_items text[] not null,
  criteria jsonb not null check (jsonb_typeof(criteria) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 2097152),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  result_version integer not null default 1 check (result_version = 1)
);

create index if not exists inspection_records_user_date_idx
  on public.inspection_records (user_id, inspected_at desc, id desc);

alter table public.inspection_records enable row level security;
revoke all on public.inspection_records from public, anon, authenticated;
grant select, insert on public.inspection_records to authenticated;

drop policy if exists "read own inspection records" on public.inspection_records;
create policy "read own inspection records" on public.inspection_records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert own inspection records" on public.inspection_records;
create policy "insert own inspection records" on public.inspection_records
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- 수정·삭제 권한과 모든 사용자에게 공개하는 접근 정책은 만들지 않습니다.
