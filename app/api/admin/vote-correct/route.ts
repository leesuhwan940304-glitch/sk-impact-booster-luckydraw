import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const correctOption = (body?.correctOption ?? "").toString().trim();
  if (!correctOption) {
    return NextResponse.json({ error: "정답 기업을 선택해주세요." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("vote_question")
    .update({ correct_option: correctOption })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
