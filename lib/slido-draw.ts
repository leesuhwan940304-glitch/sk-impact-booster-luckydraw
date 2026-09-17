// 슬라이도 "Pivot All" 내보내기(엑셀) 기반 추첨 로직 — 전부 브라우저에서만 처리, 서버 전송 없음

export type SlidoParticipant = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  answers: Record<string, string | null>; // 문항명(컬럼 헤더) -> 응답값
};

export type ParsedSlido = {
  participants: SlidoParticipant[];
  questionColumns: string[]; // 참가자ID/이름/이메일/회사/총정답을 제외한 나머지 열(=문항)
  questionTypes: Record<string, string | null>; // 문항명 -> 슬라이도 문항 유형 ("퀴즈(단일 정답)", "객관식(단일 선택)" 등)
};

// 슬라이도 "퀴즈" 타입 문항 유형 판별 (정답 맞히면 응답값 뒤에 "(correct)"가 붙는 타입)
export function isQuizType(type: string | null | undefined): boolean {
  return !!type && type.includes("퀴즈");
}

// 퀴즈 문항 응답값이 정답인지 판별 ("... (correct)" 접미사로 표시됨)
export function isCorrectAnswer(value: string | null | undefined): boolean {
  return !!value && /\(correct\)\s*$/i.test(value.trim());
}

const FIXED_COLUMNS = new Set([
  "참가자 ID",
  "참가자 이름",
  "참가자 이메일",
  "참가자 회사",
  "총 정답",
]);

/**
 * SheetJS의 sheet_to_json(header: 1) 결과(2차원 배열)를 받아 파싱한다.
 * 1행 = 헤더, 이후 행 중 "참가자 ID"가 비어있는 행(문항 유형을 알려주는 서브헤더 등)은 건너뛴다.
 */
export function parseSlidoPivotRows(rows: unknown[][]): ParsedSlido {
  if (rows.length === 0) return { participants: [], questionColumns: [], questionTypes: {} };

  const header = (rows[0] ?? []).map((h) => (h == null ? "" : String(h).trim()));
  const idIdx = header.indexOf("참가자 ID");
  const nameIdx = header.indexOf("참가자 이름");
  const emailIdx = header.indexOf("참가자 이메일");
  const companyIdx = header.indexOf("참가자 회사");

  const questionColumns = header.filter((h) => h && !FIXED_COLUMNS.has(h));

  // 2행 = 문항 유형을 알려주는 서브헤더 (참가자 ID가 비어있는 행)
  const questionTypes: Record<string, string | null> = {};
  const subRow = rows[1] ?? [];
  const subId = idIdx >= 0 ? subRow[idIdx] : undefined;
  if (subId === undefined || subId === null || String(subId).trim() === "") {
    header.forEach((colName, i) => {
      if (!colName || FIXED_COLUMNS.has(colName)) return;
      const v = subRow[i];
      questionTypes[colName] = v == null ? null : String(v).trim();
    });
  }

  const participants: SlidoParticipant[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const id = idIdx >= 0 ? row[idIdx] : undefined;
    if (id === undefined || id === null || String(id).trim() === "") continue; // 서브헤더/빈 행 skip

    const answers: Record<string, string | null> = {};
    header.forEach((colName, i) => {
      if (!colName || FIXED_COLUMNS.has(colName)) return;
      const v = row[i];
      answers[colName] = v == null || String(v).trim() === "" ? null : String(v).trim();
    });

    participants.push({
      id: String(id),
      name: nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "",
      email: emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() : null,
      company: companyIdx >= 0 && row[companyIdx] ? String(row[companyIdx]).trim() : null,
      answers,
    });
  }

  return { participants, questionColumns, questionTypes };
}

export function uniqueOptionValues(participants: SlidoParticipant[], column: string): string[] {
  const set = new Set<string>();
  for (const p of participants) {
    const v = p.answers[column];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

// 보기별 득표수 집계, 득표 많은 순 정렬 (베스트 임팩트상 = 최다득표 기업 확인용)
export function voteTally(
  participants: SlidoParticipant[],
  column: string
): { option: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const v = p.answers[column];
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([option, count]) => ({ option, count }))
    .sort((a, b) => b.count - a.count);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 중간세션 퀴즈 추첨.
 * - 대상: 선택된 문항 컬럼 중 정답을 minCorrect개 이상 맞힌 참가자만
 *   (2026-09-17 클라이언트 확정: 정답 2개 이상 맞힌 분만 추첨 대상)
 * - 가중치: 맞힌 정답 개수만큼 응모권 부여 -> 더 많이 맞힐수록 당첨확률 상승
 */
export function drawQuizWinners(
  participants: SlidoParticipant[],
  quizColumns: string[],
  excludeIds: Set<string>,
  count: number,
  minCorrect: number = 2
): SlidoParticipant[] {
  const pool: string[] = [];
  const byId = new Map(participants.map((p) => [p.id, p]));

  for (const p of participants) {
    if (excludeIds.has(p.id)) continue;
    const correctCount = quizColumns.filter((col) => isCorrectAnswer(p.answers[col])).length;
    if (correctCount < minCorrect) continue;
    for (let i = 0; i < correctCount; i++) pool.push(p.id);
  }

  const shuffled = shuffle(pool);
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const id of shuffled) {
    if (seen.has(id)) continue;
    seen.add(id);
    picked.push(id);
    if (picked.length >= count) break;
  }

  return picked.map((id) => byId.get(id)).filter((p): p is SlidoParticipant => !!p);
}

/**
 * 클로징 투표 추첨.
 * - 대상: voteColumn에 응답(투표)한 참가자 전원 — 어느 기업에 투표했는지는 무관
 *   ("베스트 임팩트상"은 최다득표 기업에게 별도로 수여되는 것이고, 경품 추첨은
 *   투표 참여 여부만 본다 — 2026 SK임팩트부스터 데이 시나리오 v4 기준)
 */
export function drawClosingWinners(
  participants: SlidoParticipant[],
  voteColumn: string,
  excludeIds: Set<string>,
  count: number
): SlidoParticipant[] {
  const candidates = participants.filter((p) => !excludeIds.has(p.id) && !!p.answers[voteColumn]);
  return shuffle(candidates).slice(0, count);
}
