import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-auth";
import { drawQuizWinners, drawClosingWinner } from "@/lib/draw";
import { maskName, maskPhoneLast4 } from "@/lib/mask";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const round = (body?.round ?? "").toString(); // 'quiz' | 'closing'
  const prizeName = (body?.prizeName ?? "").toString().trim();
  const rank = body?.rank != null ? Number(body.rank) : null; // closing 전용: 3/2/1
  const count = body?.count != null ? Number(body.count) : 1; // quiz 전용: 한 번에 뽑을 인원

  if (!prizeName) {
    return NextResponse.json({ error: "경품명을 입력해주세요." }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    if (round === "quiz") {
      const winners = await drawQuizWinners(supabase, count);
      if (winners.length === 0) {
        return NextResponse.json({ error: "추첨 대상자가 없습니다." }, { status: 400 });
      }
      const rows = winners.map((w) => ({
        round: "quiz",
        rank: null,
        participant_id: w.id,
        prize_name: prizeName,
      }));
      const { error: insErr } = await supabase.from("winners").insert(rows);
      if (insErr) throw insErr;

      return NextResponse.json({
        winners: winners.map((w) => ({
          maskedName: maskName(w.name),
          phoneLast4: maskPhoneLast4(w.phone),
        })),
      });
    }

    if (round === "closing") {
      const winner = await drawClosingWinner(supabase);
      if (!winner) {
        return NextResponse.json({ error: "추첨 대상자가 없습니다. (정답자가 없거나 모두 이미 당첨됨)" }, { status: 400 });
      }
      const { error: insErr } = await supabase.from("winners").insert({
        round: "closing",
        rank,
        participant_id: winner.id,
        prize_name: prizeName,
      });
      if (insErr) throw insErr;

      return NextResponse.json({
        winner: { maskedName: maskName(winner.name), phoneLast4: maskPhoneLast4(winner.phone) },
      });
    }

    return NextResponse.json({ error: "round 값이 올바르지 않습니다. ('quiz' | 'closing')" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "추첨 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
