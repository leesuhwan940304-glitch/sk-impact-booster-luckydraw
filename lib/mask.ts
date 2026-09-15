// 당첨자 식별용 마스킹: "홍길동" -> "홍*동", "김수" -> "김*", 휴대폰 뒷 4자리만 노출
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const middle = "*".repeat(trimmed.length - 2);
  return `${first}${middle}${last}`;
}

export function maskPhoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4);
}

// 슬라이도 참가자 이름 마스킹: "나희(2962)" -> "나*(2962)" (뒤 괄호 번호는 식별용으로 그대로 노출)
export function maskSlidoName(rawName: string): string {
  const trimmed = rawName.trim();
  const match = trimmed.match(/^(.*?)(\s*\([^)]*\))?$/);
  const namePart = match?.[1]?.trim() || trimmed;
  const suffix = match?.[2]?.trim() || "";
  return `${maskName(namePart)}${suffix}`;
}

// 이메일 마스킹: "abcde@example.com" -> "a***e@example.com"
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "-";
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return maskName(trimmed);
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) return `${local[0]}*${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}${domain}`;
}
