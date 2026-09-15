import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";

type Entry = {
  round: string;
  rank: number | null;
  prizeName: string;
  maskedName: string;
  maskedEmail: string;
};

// 슬라이도 추첨 도구(/admin/draw)에서 뽑힌 당첨자를 스크린 표출용으로 저장
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const entries: Entry[] = Array.isArray(body?.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ error: "entries가 비어있습니다." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const rows = entries.map((e) => ({
      round: e.round,
      rank: e.rank,
      prize_name: e.prizeName,
      masked_name: e.maskedName,
      masked_email: e.maskedEmail,
    }));
    const { error } = await supabase.from("slido_winners").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 설정 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 추첨 결과 전체 초기화 (재리허설/오타 정정용)
export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  try {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("slido_winners")
      .delete()
      .not("id", "is", null); // 전체 삭제
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 설정 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
