"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// 클로징 등수별 완성 디자인 화면 (당첨자 영역만 비워서 받은 최종본, 1921x1081)
const RANK_CONFIG: Record<number, { name: string; count: number; bg: string }> = {
  1: { name: "에어팟 프로3", count: 1, bg: "/lucky/screen_rank1.png" },
  2: { name: "스타스테크 라보페 기초화장품 세트", count: 2, bg: "/lucky/screen_rank2.png" },
  3: { name: "엔티 나물투데이 제철나물 정기구독권", count: 2, bg: "/lucky/screen_rank3.png" },
};

// 중간세션(Break Talk 퀴즈) 경품별 완성 디자인 화면.
// admin/draw에서 경품명은 자유 입력 텍스트라 정확히 일치하지 않을 수 있어
// 브랜드명 포함 여부로 매칭한다.
const QUIZ_CONFIG: { match: string; name: string; count: number; bg: string }[] = [
  { match: "컨셔스웨어", name: "컨셔스웨어 친환경 바이오 레더 여권 지갑", count: 5, bg: "/lucky/screen_quiz1.png" },
  { match: "이온플러스", name: "이온플러스 여행용 샤워기 필터 셋트", count: 5, bg: "/lucky/screen_quiz2.png" },
];

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
  const previewQuiz = Number(searchParams.get("previewQuiz"));
  const previewCountParam = searchParams.get("previewCount");
  const [winners, setWinners] = useState<Winner[]>([]);

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

  const [latest] = winners;

  // 클로징 등수 / 중간세션 퀴즈 경품 발표 중이면 각각 전용 화면으로 전환
  // (?previewRank=1|2|3 또는 ?previewQuiz=1|2 를 URL에 붙이면 실제 추첨 없이 디자인만 미리 확인 가능)
  const isPreviewClosing = previewRank === 1 || previewRank === 2 || previewRank === 3;
  const isPreviewQuiz = previewQuiz === 1 || previewQuiz === 2;

  type RevealCfg = { name: string; count: number; bg: string };
  let reveal: { cfg: RevealCfg; group: Winner[] } | null = null;

  if (isPreviewClosing) {
    const cfg = RANK_CONFIG[previewRank];
    const previewCount = previewCountParam != null ? Math.max(0, Number(previewCountParam)) : cfg.count;
    reveal = {
      cfg,
      group: Array.from({ length: previewCount }, (_, i) => ({
        round: "closing",
        rank: previewRank,
        prizeName: cfg.name,
        maskedName: `테스트당첨자${cfg.count > 1 ? i + 1 : ""}`,
        maskedEmail: "",
        phoneLast4: "1234",
      })),
    };
  } else if (isPreviewQuiz) {
    const cfg = QUIZ_CONFIG[previewQuiz - 1];
    const previewCount = previewCountParam != null ? Math.max(0, Number(previewCountParam)) : cfg.count;
    reveal = {
      cfg,
      group: Array.from({ length: previewCount }, (_, i) => ({
        round: "quiz",
        rank: null,
        prizeName: cfg.name,
        maskedName: `테스트당첨자${i + 1}`,
        maskedEmail: "",
        phoneLast4: "1234",
      })),
    };
  } else if (latest && latest.round === "closing" && latest.rank && RANK_CONFIG[latest.rank]) {
    const rank = latest.rank;
    const cfg = RANK_CONFIG[rank];
    reveal = {
      cfg,
      group: winners.filter(
        (w) => w.round === "closing" && w.rank === rank && !!w.maskedName?.trim() && w.maskedName !== "__ACTIVATE__"
      ),
    };
  } else if (latest && latest.round === "quiz") {
    const qcfg = QUIZ_CONFIG.find((c) => latest.prizeName?.includes(c.match));
    if (qcfg) {
      reveal = {
        cfg: qcfg,
        group: winners.filter(
          (w) =>
            w.round === "quiz" &&
            w.prizeName?.includes(qcfg.match) &&
            !!w.maskedName?.trim() &&
            w.maskedName !== "__ACTIVATE__"
        ),
      };
    }
  }

  if (reveal) {
    const { cfg, group } = reveal;
    const manyWinners = cfg.count > 2;

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

          {/* "당첨자" 레이블 아래, 빨간 테두리 박스 안 남은 공간의 가로 가운데에 위쪽부터 정렬
              (라벨과 안 겹치도록 top을 충분히 아래로 잡고, 세로는 위에서부터 쌓음)
              퀴즈(최대 5명)처럼 인원이 많으면 글자를 좀 더 작게 */}
          <div
            className="absolute flex flex-col items-center text-white"
            style={{ left: "37.5%", width: "49%", top: manyWinners ? "50%" : "52%", gap: manyWinners ? "1.6%" : "3%" }}
          >
            {group.map((w, i) => (
              <p
                key={i}
                className="font-extrabold text-center leading-tight whitespace-nowrap"
                style={{ fontSize: manyWinners ? "clamp(1.1rem, 3vh, 3vh)" : "clamp(1.6rem, 4.4vh, 4.4vh)" }}
              >
                {w.maskedName}
                {w.phoneLast4 ? (
                  <span className="text-orange-300 font-semibold"> ({w.phoneLast4})</span>
                ) : null}
              </p>
            ))}
            {Array.from({ length: Math.max(0, cfg.count - group.length) }).map((_, i) => (
              <p
                key={`pending-${i}`}
                className="text-neutral-500 leading-tight"
                style={{ fontSize: manyWinners ? "clamp(1rem, 2.4vh, 2.4vh)" : "clamp(1.3rem, 3.6vh, 3.6vh)" }}
              >
                추첨 대기중…
              </p>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 대기화면 (아직 아무 발표도 시작되지 않았을 때 / 발표 사이 공백)
  return (
    <main className="flex-1 flex items-center justify-center bg-black overflow-hidden">
      <div className="relative w-full h-full max-w-[177.78vh] max-h-[56.25vw]" style={{ aspectRatio: "1672 / 941" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 메인 타이틀 디자인 원본을 배경으로 그대로 표출 */}
        <img src="/lucky/main_title.png" alt="2026 SK임팩트부스터 데이" className="absolute inset-0 w-full h-full object-contain" />
        <p
          className="absolute text-white font-semibold"
          style={{ left: "6%", bottom: "16%", fontSize: "clamp(1.2rem, 3.2vh, 3.2vh)" }}
        >
          곧 당첨자를 발표합니다
        </p>
      </div>
    </main>
  );
}
