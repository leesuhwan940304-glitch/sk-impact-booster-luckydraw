-- 2026 SK임팩트부스터 데이 럭키드로우
-- Supabase SQL Editor에서 이 파일 전체를 붙여넣고 Run 하면 됨

create extension if not exists "pgcrypto";

-- 참가자 (QR 접속 시 최초 1회 등록)
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  consent boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists participants_phone_idx on participants(phone);

-- 중간세션 퀴즈 문항 (최대 3개)
create table if not exists quiz_questions (
  id int primary key,
  seq int not null,
  question text not null,
  options jsonb not null,
  active boolean not null default false
);

-- 퀴즈 응답 (참가자당 문항당 1회)
create table if not exists quiz_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  question_id int not null references quiz_questions(id),
  selected_index int not null,
  created_at timestamptz not null default now(),
  unique (participant_id, question_id)
);

-- 클로징 투표 문항 (1개, 정답 기업은 호스트가 현장에서 지정/변경)
create table if not exists vote_question (
  id int primary key default 1,
  question text not null,
  options jsonb not null,
  correct_option text,
  active boolean not null default false
);

-- 투표 응답 (참가자당 1회)
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references participants(id) on delete cascade,
  selected_option text not null,
  created_at timestamptz not null default now()
);

-- 당첨자 기록
create table if not exists winners (
  id uuid primary key default gen_random_uuid(),
  round text not null,           -- 'quiz' | 'closing'
  rank int,                      -- closing: 3/2/1, quiz는 null
  participant_id uuid not null references participants(id),
  prize_name text not null,
  created_at timestamptz not null default now()
);

-- 행사 진행 상태 (관리자 화면에서 제어, 참가자/스크린 화면이 폴링)
create table if not exists event_state (
  id int primary key default 1,
  stage text not null default 'idle',  -- idle | quiz | closing_vote | closed
  current_quiz_seq int                 -- stage='quiz'일 때 현재 열려있는 문항 순번 (1/2/3)
);
insert into event_state (id, stage, current_quiz_seq) values (1, 'idle', null)
  on conflict (id) do nothing;

-- 초기 퀴즈 문항 3개 (문구/보기는 실제 확정본으로 나중에 UPDATE)
insert into quiz_questions (id, seq, question, options) values
  (1, 1, '이번 임팩트부스터 선발 과정에서 스타트업 협업을 검토한 멤버사는 몇 개일까요?', '["10개","20개","30개","40개"]'),
  (2, 2, '소셜벤처가 아니면 지원할 수 없다 (O/X)', '["O","X"]'),
  (3, 3, '멤버사가 가장 많이 선택했던 기업의 특징은 무엇일까요?', '["대표자 이력이 뛰어난 곳","투자를 많이 유치한 기업","멤버사의 니즈와 부합하는 제안을 한 기업","매출 성과가 좋은 기업"]')
on conflict (id) do nothing;

-- 클로징 투표 문항 (보기=발표기업 9개, 실제 확정본으로 UPDATE 필요)
insert into vote_question (id, question, options) values
  (1, '오늘 발표 기업 중 가장 인상 깊었던 기업에 투표해주세요', '["퍼스트랩","테라클","엔츠","스타스테크","올도완","엔티","딥핑소스","제클린","에임인텔리전스"]')
on conflict (id) do nothing;
