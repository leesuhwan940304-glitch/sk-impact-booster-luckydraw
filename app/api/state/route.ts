import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getServiceClient();

    const { data: state, error } = await supabase
      .from("event_state")
      .select("stage, current_quiz_seq")
      .eq("id", 1)
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload: Record<string, unknown> = { stage: state.stage };

    if (state.stage === "quiz" && state.current_quiz_seq) {
      const { data: q } = await supabase
        .from("quiz_questions")
        .select("id, seq, question, options")
        .eq("seq", state.current_quiz_seq)
        .maybeSingle();
      payload.quiz = q ?? null;
    }

    if (state.stage === "closing_vote") {
      const { data: vq } = await supabase
        .from("vote_question")
        .select("id, question, options")
        .eq("id", 1)
        .maybeSingle();
      payload.vote = vq ?? null;
    }

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 설정 오류가 발생했습니다.";
    return NextResponse.json({ error: message, stage: "idle" }, { status: 500 });
  }
}
