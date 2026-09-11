import { SupabaseClient } from "@supabase/supabase-js";

type Participant = { id: string; name: string; phone: string };

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
 * - 대상: 퀴즈 1문항 이상 응답한 참가자 전원 (정답 여부 무관)
 * - 가중치: 응답한 문항 수만큼 응모권 부여 (최대 3장) -> 다 풀수록 당첨확률 상승
 * - 이미 당첨된 사람은 제외
 */
export async function drawQuizWinners(
  supabase: SupabaseClient,
  count: number
): Promise<Participant[]> {
  const { data: responses, error: respErr } = await supabase
    .from("quiz_responses")
    .select("participant_id");
  if (respErr) throw respErr;

  const { data: alreadyWon, error: wonErr } = await supabase
    .from("winners")
    .select("participant_id");
  if (wonErr) throw wonErr;
  const wonSet = new Set((alreadyWon ?? []).map((w) => w.participant_id as string));

  // 참가자별 응모권 수 집계
  const weightMap = new Map<string, number>();
  for (const r of responses ?? []) {
    const pid = r.participant_id as string;
    if (wonSet.has(pid)) continue;
    weightMap.set(pid, (weightMap.get(pid) ?? 0) + 1);
  }
  if (weightMap.size === 0) return [];

  // 가중 응모권 풀 생성 (문항당 1장, 최대 3장)
  const pool: string[] = [];
  for (const [pid, weight] of weightMap.entries()) {
    for (let i = 0; i < weight; i++) pool.push(pid);
  }

  const shuffled = shuffle(pool);
  const pickedIds: string[] = [];
  const seen = new Set<string>();
  for (const pid of shuffled) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    pickedIds.push(pid);
    if (pickedIds.length >= count) break;
  }

  if (pickedIds.length === 0) return [];
  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, name, phone")
    .in("id", pickedIds);
  if (pErr) throw pErr;

  // 뽑힌 순서 유지
  const byId = new Map((participants ?? []).map((p) => [p.id as string, p as Participant]));
  return pickedIds.map((id) => byId.get(id)).filter((p): p is Participant => !!p);
}

/**
 * 클로징 투표 추첨.
 * - 대상: vote_question.correct_option 을 선택한 참가자만
 * - 1명씩 뽑아서 3등 -> 2등 -> 1등 순으로 호출
 * - 이미 당첨된 사람은 제외
 */
export async function drawClosingWinner(
  supabase: SupabaseClient
): Promise<Participant | null> {
  const { data: vq, error: vqErr } = await supabase
    .from("vote_question")
    .select("correct_option")
    .eq("id", 1)
    .single();
  if (vqErr) throw vqErr;
  if (!vq?.correct_option) {
    throw new Error("정답 기업(correct_option)이 아직 지정되지 않았습니다.");
  }

  const { data: votes, error: voteErr } = await supabase
    .from("votes")
    .select("participant_id")
    .eq("selected_option", vq.correct_option);
  if (voteErr) throw voteErr;

  const { data: alreadyWon, error: wonErr } = await supabase
    .from("winners")
    .select("participant_id");
  if (wonErr) throw wonErr;
  const wonSet = new Set((alreadyWon ?? []).map((w) => w.participant_id as string));

  const candidates = (votes ?? [])
    .map((v) => v.participant_id as string)
    .filter((pid) => !wonSet.has(pid));
  if (candidates.length === 0) return null;

  const pickedId = shuffle(candidates)[0];
  const { data: participant, error: pErr } = await supabase
    .from("participants")
    .select("id, name, phone")
    .eq("id", pickedId)
    .single();
  if (pErr) throw pErr;
  return participant as Participant;
}
