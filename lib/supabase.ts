import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 서버 전용 클라이언트. service_role 키를 쓰므로 절대 클라이언트 컴포넌트에서 import하지 말 것.
// API route(app/api/**/route.ts) 안에서만 사용한다.
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 Settings > Environment Variables 에서 설정해주세요."
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
