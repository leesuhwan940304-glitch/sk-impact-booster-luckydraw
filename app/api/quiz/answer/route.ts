import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const pid = request.cookies.get("pid")?.value;
  if (!pid) {
    return NextResponse.json({ error: "등록 정보가 없습니다. 새로고침 후 다시 시도해주세요." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const questionId = Number(body?.questionId);
  const selectedIndex = Number(body?.selectedIndex);
  if (!Number.isInteger(questionId) || !Number.isInteger(selectedIndex)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("quiz_responses")
      .upsert(
        { participant_id: pid, question_id: questionId, selected_index: selectedIndex },
        { onConflict: "participant_id,question_id", ignoreDuplicates: true }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 설정 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
