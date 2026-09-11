import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const PID_COOKIE = "pid";
const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = (body?.name ?? "").toString().trim();
  const phoneRaw = (body?.phone ?? "").toString().trim();
  const consent = body?.consent === true;

  if (!name || name.length > 20) {
    return NextResponse.json({ error: "이름을 정확히 입력해주세요." }, { status: 400 });
  }
  if (!PHONE_RE.test(phoneRaw)) {
    return NextResponse.json({ error: "휴대폰 번호 형식을 확인해주세요." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "개인정보 수집·이용에 동의해주세요." }, { status: 400 });
  }

  const phone = phoneRaw.replace(/\D/g, "");
  const supabase = getServiceClient();

  // 이미 등록된 번호면 재등록(새로고침 등) 처리 — 기존 참가자 그대로 사용
  const { data: existing, error: findErr } = await supabase
    .from("participants")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  let participantId = existing?.id as string | undefined;

  if (!participantId) {
    const { data: inserted, error: insertErr } = await supabase
      .from("participants")
      .insert({ name, phone, consent: true })
      .select("id")
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    participantId = inserted.id as string;
  }

  const res = NextResponse.json({ id: participantId });
  res.cookies.set(PID_COOKIE, participantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 6, // 6시간 (행사 당일용)
    path: "/",
  });
  return res;
}
