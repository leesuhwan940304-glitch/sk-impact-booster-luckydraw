import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// 공개 엔드포인트 (스크린 화면용)
export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("slido_winners")
      .select("round, rank, prize_name, masked_name, masked_email, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const winners = (data ?? []).map((w) => ({
      round: w.round,
      rank: w.rank,
      prizeName: w.prize_name,
      maskedName: w.masked_name,
      maskedEmail: w.masked_email,
      createdAt: w.created_at,
    }));

    return NextResponse.json({ winners });
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 설정 오류가 발생했습니다.";
    return NextResponse.json({ error: message, winners: [] }, { status: 500 });
  }
}
