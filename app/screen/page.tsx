"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type StateResp = {
  stage: "idle" | "quiz" | "closing_vote" | "closed";
  quiz?: { seq: number; question: string; options: string[] } | null;
  vote?: { question: string; options: string[] } | null;
};

type Winner = {
  round: string;
  rank: number | null;
  prizeName: string;
  maskedName: string;
  phoneLast4: string;
};

export default function ScreenPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [state, setState] = useState<StateResp>({ stage: "idle" });
  const [winners, setWinners] = useState<Winner[]>([]);

  useEffect(() => {
    const joinUrl = `${window.location.origin}/join`;
    QRCode.toDataURL(joinUrl, { width: 480, margin: 1 }).then(setQrDataUrl);
  }, []);

  useEffect(() => {
    const poll = () => {
      fetch("/api/state")
        .then((r) => r.json())
        .then(setState)
        .catch(() => {});
      fetch("/api/winners")
        .then((r) => r.json())
        .then((d) => setWinners(d.winners ?? []))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const latestWinners = winners.slice(0, 5);

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
            <img src={qrDataUrl} alt="참여 QR코드" className="bg-white p-4 rounded-2xl w-[360px] h-[360px]" />
          )}
          <p className="text-xl font-semibold">QR 스캔하고 지금 참여하기</p>
        </div>

        <div className="flex flex-col justify-center gap-6">
          {state.stage === "idle" && (
            <p className="text-2xl text-gray-300">곧 이벤트가 시작됩니다</p>
          )}

          {state.stage === "quiz" && state.quiz && (
            <div>
              <p className="text-sm text-gray-400 mb-2">중간세션 퀴즈 {state.quiz.seq}</p>
              <p className="text-3xl font-bold leading-snug">{state.quiz.question}</p>
              <ul className="mt-4 space-y-2 text-lg text-gray-300">
                {state.quiz.options.map((o, i) => (
                  <li key={i}>
                    {i + 1}. {o}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.stage === "closing_vote" && state.vote && (
            <div>
              <p className="text-sm text-gray-400 mb-2">클로징 투표</p>
              <p className="text-3xl font-bold leading-snug">{state.vote.question}</p>
            </div>
          )}

          {state.stage === "closed" && (
            <p className="text-2xl text-gray-300">참여해주셔서 감사합니다! 🎉</p>
          )}

          {latestWinners.length > 0 && (
            <div className="mt-6 bg-white/10 rounded-xl p-5">
              <p className="text-sm text-gray-400 mb-3">당첨자 발표</p>
              <ul className="space-y-2">
                {latestWinners.map((w, i) => (
                  <li key={i} className="flex justify-between text-lg">
                    <span>
                      {w.round === "closing" && w.rank ? `${w.rank}등 · ` : ""}
                      {w.prizeName}
                    </span>
                    <span className="font-mono">
                      {w.maskedName} ({w.phoneLast4})
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
