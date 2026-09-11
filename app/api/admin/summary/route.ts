import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";
import { maskName, maskPhoneLast4 } from "@/lib/mask";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const supabase = getServiceClient();

  const [{ count: participantCount }, { data: state }, { data: questions }, { data: responses }, { data: voteQuestion }, { data: votes }, { data: winners }] =
    await Promise.all([
      supabase.from("participants").select("id", { count: "exact", head: true }),
      supabase.from("event_state").select("stage, current_quiz_seq").eq("id", 1).single(),
      supabase.from("quiz_questions").select("id, seq, question, options").order("seq"),
      supabase.from("quiz_responses").select("question_id, participant_id"),
      supabase.from("vote_question").select("question, options, correct_option").eq("id", 1).single(),
      supabase.from("votes").select("selected_option"),
      supabase
        .from("winners")
        .select("round, rank, prize_name, created_at, participants(name, phone)")
        .order("created_at", { ascending: false }),
    ]);

  const responseCountByQuestion: Record<number, number> = {};
  const respondentIds = new Set<string>();
  for (const r of responses ?? []) {
    responseCountByQuestion[r.question_id as number] =
      (responseCountByQuestion[r.question_id as number] ?? 0) + 1;
    respondentIds.add(r.participant_id as string);
  }

  const voteCountByOption: Record<string, number> = {};
  for (const v of votes ?? []) {
    voteCountByOption[v.selected_option as string] =
      (voteCountByOption[v.selected_option as string] ?? 0) + 1;
  }

  type WinnerRow = {
    round: string;
    rank: number | null;
    prize_name: string;
    created_at: string;
    participants: { name: string; phone: string } | { name: string; phone: string }[] | null;
  };

  const winnersOut = ((winners as WinnerRow[]) ?? []).map((w) => {
    const p = Array.isArray(w.participants) ? w.participants[0] : w.participants;
    return {
      round: w.round,
      rank: w.rank,
      prizeName: w.prize_name,
      createdAt: w.created_at,
      maskedName: p ? maskName(p.name) : "-",
      phoneLast4: p ? maskPhoneLast4(p.phone) : "-",
    };
  });

  return NextResponse.json({
    stage: state?.stage,
    currentQuizSeq: state?.current_quiz_seq,
    participantCount: participantCount ?? 0,
    quizRespondentCount: respondentIds.size,
    questions,
    responseCountByQuestion,
    voteQuestion,
    voteCountByOption,
    winners: winnersOut,
  });
}
