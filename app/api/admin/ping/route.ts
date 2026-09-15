import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";

// 관리자 로그인 여부만 가볍게 확인하는 엔드포인트 (DB 접근 없음)
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
