import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { maskName, maskPhoneLast4 } from "@/lib/mask";

// 공개 엔드포인트 (스크린 화면용) — 마스킹된 당첨자 정보만 노출
export async function GET() {
  const supabase = getServiceClient();

  type WinnerRow = {
    round: string;
    rank: number | null;
    prize_name: string;
    created_at: string;
    participants: { name: string; phone: string } | { name: string; phone: string }[] | null;
  };

  const { data: winners, error } = await supabase
    .from("winners")
    .select("round, rank, prize_name, created_at, participants(name, phone)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const out = ((winners as WinnerRow[]) ?? []).map((w) => {
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

  return NextResponse.json({ winners: out });
}
