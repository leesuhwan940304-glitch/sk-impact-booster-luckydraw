import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";

const VALID_STAGES = ["idle", "quiz", "closing_vote", "closed"];

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const stage = (body?.stage ?? "").toString();
  const currentQuizSeq = body?.currentQuizSeq != null ? Number(body.currentQuizSeq) : null;

  if (!VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: "잘못된 stage 값입니다." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("event_state")
    .update({ stage, current_quiz_seq: stage === "quiz" ? currentQuizSeq : null })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
