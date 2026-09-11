import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const pid = request.cookies.get("pid")?.value;
  if (!pid) {
    return NextResponse.json({ registered: false });
  }

  try {
    const supabase = getServiceClient();
    const { data: participant } = await supabase
      .from("participants")
      .select("id, name")
      .eq("id", pid)
      .maybeSingle();

    if (!participant) {
      return NextResponse.json({ registered: false });
    }

    const { data: responses } = await supabase
      .from("quiz_responses")
      .select("question_id")
      .eq("participant_id", pid);

    const { data: vote } = await supabase
      .from("votes")
      .select("selected_option")
      .eq("participant_id", pid)
      .maybeSingle();

    return NextResponse.json({
      registered: true,
      name: participant.name,
      answeredQuestionIds: (responses ?? []).map((r) => r.question_id),
      votedOption: vote?.selected_option ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 설정 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
