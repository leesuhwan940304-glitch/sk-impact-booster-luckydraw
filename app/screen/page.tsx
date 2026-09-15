"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const SLIDO_JOIN_URL = "https://qr.sli.do/5G2ZkEcBRPFavWaMmUgqxM";

type Winner = {
  round: string;
  rank: number | null;
  prizeName: string;
  maskedName: string;
  maskedEmail: string;
};

export default function ScreenPage() {
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
          <p className="text-xl font-semibold">QR 스캔하고 지금 참여하기</p>
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
              <p className="text-gray-500 mt-1 font-mono">{latest.maskedEmail}</p>
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
                    <span className="font-mono">
                      {w.maskedName} ({w.maskedEmail})
                    </span>
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
