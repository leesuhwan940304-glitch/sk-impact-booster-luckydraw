"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";

const SLIDO_JOIN_URL = "https://qr.sli.do/5G2ZkEcBRPFavWaMmUgqxM";

// 클로징 등수별 완성 디자인 화면 (당첨자 영역만 비워서 받은 최종본, 1921x1081)
const RANK_CONFIG: Record<number, { name: string; count: number; bg: string }> = {
  1: { name: "에어팟 프로3", count: 1, bg: "/lucky/screen_rank1.png" },
  2: { name: "스타스테크 라보페 기초화장품 세트", count: 2, bg: "/lucky/screen_rank2.png" },
  3: { name: "엔티 나물투데이 제철나물 정기구독권", count: 2, bg: "/lucky/screen_rank3.png" },
};

type Winner = {
  round: string;
  rank: number | null;
  prizeName: string;
  maskedName: string;
  maskedEmail: string;
  phoneLast4?: string | null;
};

export default function ScreenPage() {
  return (
    <Suspense fallback={<main className="flex-1 bg-black" />}>
      <ScreenContent />
    </Suspense>
  );
}

function ScreenContent() {
  const searchParams = useSearchParams();
  const previewRank = Number(searchParams.get("previewRank"));
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);

  useEffect(() => {
    QRCode.toDataURL(SLIDO_JOIN_URL, { width: 480, margin: 1 }).then(setQrDataUrl);
  }, []);

  useEffect(() => {
    const poll = () => {
      fetch("/api/slido-winners")
        .then((r) => r.json())
        .then((d) => setWinners(d.winners ?? []))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const [latest, ...rest] = winners;

  // 클로징 등수 발표 중이면 경품별 전용 화면으로 전환
  // (?previewRank=1|2|3 을 URL에 붙이면 실제 추첨 없이 디자인만 미리 확인 가능)
  const isPreview = previewRank === 1 || previewRank === 2 || previewRank === 3;
  if (isPreview || (latest && latest.round === "closing" && latest.rank && RANK_CONFIG[latest.rank])) {
    const rank = isPreview ? previewRank : (latest!.rank as number);
    const cfg = RANK_CONFIG[rank];
    const group = isPreview
      ? Array.from({ length: cfg.count }, (_, i) => ({
          round: "closing",
          rank,
          prizeName: cfg.name,
          maskedName: `테스트당첨자${cfg.count > 1 ? i + 1 : ""}`,
          maskedEmail: "",
          phoneLast4: "1234",
        }))
      : winners.filter((w) => w.round === "closing" && w.rank === rank);

    return (
      <main className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        {/* 컨테이너를 항상 정확히 16:9로 유지 -> 아래 텍스트 좌표(%)가 이미지 위 실제 위치와 항상 일치 */}
        <div className="relative w-full h-full max-w-[177.78vh] max-h-[56.25vw]" style={{ aspectRatio: "1921 / 1081" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 완성 디자인 원본을 배경으로 그대로 표출 */}
          <img
            src={cfg.bg}
            alt={`${cfg.name} 럭키드로우`}
            className="absolute inset-0 w-full h-full object-contain"
          />

          {/* "당첨자" 레이블 아래 빈 공간에 실제 당첨자 이름을 좌표로 겹쳐서 표시 */}
          <div
            className="absolute flex flex-col items-center text-white"
            style={{ left: "58.9%", top: "53%", width: "38%", transform: "translateX(-50%)", gap: "1.8%" }}
          >
            {group.map((w, i) => (
              <p key={i} className="font-extrabold text-center" style={{ fontSize: "clamp(1.2rem, 3.4vh, 3.4vh)" }}>
                {w.maskedName}
                {w.phoneLast4 ? (
                  <span className="text-orange-300 font-semibold"> ({w.phoneLast4})</span>
                ) : null}
              </p>
            ))}
            {Array.from({ length: Math.max(0, cfg.count - group.length) }).map((_, i) => (
              <p key={`pending-${i}`} className="text-neutral-500" style={{ fontSize: "clamp(1rem, 2.6vh, 2.6vh)" }}>
                추첨 대기중…
              </p>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-black text-white flex flex-col p-10 gap-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold">2026 SK임팩트부스터 데이</h1>
        <p className="text-gray-400 mt-1">럭키드로우 이벤트</p>
      </header>

      <div className="flex-1 grid grid-cols-2 gap-10 items-center">
        <div className="flex flex-col items-center justify-center gap-4">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- 클라이언트에서 생성한 data URI라 next/image 최적화 대상이 아님
            <img src={qrDataUrl} alt="슬라이도 참여 QR코드" className="bg-white p-4 rounded-2xl w-[360px] h-[360px]" />
          )}
          <p className="text-xl font-semibold">이벤트 참여 QR</p>
        </div>

        <div className="flex flex-col justify-center gap-6">
          {!latest && <p className="text-2xl text-gray-300">곧 당첨자를 발표합니다 🎉</p>}

          {latest && (
            <div className="bg-white text-black rounded-2xl p-8 text-center shadow-lg">
              <p className="text-sm text-gray-500 mb-2">🎊 방금 발표된 당첨자</p>
              <p className="text-lg font-medium text-gray-700">
                {latest.round === "closing" && latest.rank ? `${latest.rank}등 · ` : ""}
                {latest.prizeName}
              </p>
              <p className="text-4xl font-extrabold mt-3">{latest.maskedName}</p>
            </div>
          )}

          {rest.length > 0 && (
            <div className="bg-white/10 rounded-xl p-5">
              <p className="text-sm text-gray-400 mb-3">이전 당첨자</p>
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {rest.map((w, i) => (
                  <li key={i} className="flex justify-between text-lg">
                    <span>
                      {w.round === "closing" && w.rank ? `${w.rank}등 · ` : ""}
                      {w.prizeName}
                    </span>
                    <span className="font-mono">{w.maskedName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
