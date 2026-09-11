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
