"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ParsedSlido,
  SlidoParticipant,
  parseSlidoPivotRows,
  voteTally,
  drawQuizWinners,
  drawClosingWinners,
  isQuizType,
} from "@/lib/slido-draw";
import { maskEmail } from "@/lib/mask";

type WinnerView = { maskedName: string; maskedEmail: string };
type PublishEntry = {
  round: string;
  rank: number | null;
  prizeName: string;
  maskedName: string;
  maskedEmail: string;
  participantId: string | null;
};

// 화면을 "N등 추첨 대기중" 상태로 먼저 전환만 시켜두는 더미 항목 (실제 당첨자 아님)
const ACTIVATE_SENTINEL = "__ACTIVATE__";
type QuizBatch = { prizeName: string; winners: WinnerView[] };
type ClosingBatch = { rank: 3 | 2 | 1; prizeName: string; winners: WinnerView[] };

const RANK_TARGET: Record<3 | 2 | 1, number> = { 3: 2, 2: 2, 1: 1 };
const RANK_DEFAULT_PRIZE: Record<3 | 2 | 1, string> = {
  3: "엔티 나물투데이 정기구독권",
  2: "스타스테크 라보페 불가사리 콜라겐 기초화장품 세트",
  1: "에어팟 프로 3",
};

function toWinnerView(p: SlidoParticipant): WinnerView {
  return { maskedName: p.name, maskedEmail: maskEmail(p.email) };
}

function toPublishEntries(
  winners: SlidoParticipant[],
  round: string,
  rank: number | null,
  prizeName: string
): PublishEntry[] {
  return winners.map((p) => ({
    round,
    rank,
    prizeName,
    maskedName: p.name,
    maskedEmail: maskEmail(p.email),
    participantId: p.id,
  }));
}

export default function DrawToolPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // 두 세션에 걸쳐 공유되는 "이미 당첨된 사람" 목록 (중복당첨 방지)
  const [wonIds, setWonIds] = useState<Set<string>>(new Set());
  // 추첨 버튼 연타(더블클릭) 시 한 번에 두 배로 뽑히는 것을 막는 락.
  // React state는 재렌더 전까지 disabled가 안 걸리므로 ref로 즉시 잠금.
  const quizDrawingRef = useRef(false);
  const closingDrawingRef = useRef(false);

  // 중간세션 (퀴즈) 상태
  const [quizParsed, setQuizParsed] = useState<ParsedSlido | null>(null);
  const [quizFileName, setQuizFileName] = useState<string | null>(null);
  const [quizParseError, setQuizParseError] = useState<string | null>(null);
  const [quizCols, setQuizCols] = useState<Set<string>>(new Set());
  const QUIZ_PRIZE_PRESETS = ["컨셔스웨어 바이오 레더 여권지갑", "이온플러스 여행용 샤워기 필터 세트"];
  const [quizPrize, setQuizPrize] = useState(QUIZ_PRIZE_PRESETS[0]);
  const [quizCount, setQuizCount] = useState(5);
  const [quizBatches, setQuizBatches] = useState<QuizBatch[]>([]);

  // 클로징세션 (투표) 상태 — 완전히 별도 업로드/설정
  const [closingParsed, setClosingParsed] = useState<ParsedSlido | null>(null);
  const [closingFileName, setClosingFileName] = useState<string | null>(null);
  const [closingParseError, setClosingParseError] = useState<string | null>(null);
  const [voteCol, setVoteCol] = useState<string | null>(null);
  const [closingBatches, setClosingBatches] = useState<ClosingBatch[]>([]);
  const [revealOneByOne, setRevealOneByOne] = useState(true);
  // "추첨 시작" 버튼을 눌러 화면만 먼저 켜둔 등수 (실제 추첨 전 "추첨 대기중" 표시용)
  const [startedRanks, setStartedRanks] = useState<Set<3 | 2 | 1>>(new Set());

  useEffect(() => {
    fetch("/api/admin/ping").then((res) => setAuthed(res.ok));
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    // 새로고침/재접속 시에도 이전 당첨자를 다시 뽑지 않도록 서버 기록으로 복원
    fetch("/api/admin/slido-winners")
      .then((r) => r.json())
      .then((d) => {
        const ids: string[] = d.participantIds ?? [];
        if (ids.length > 0) setWonIds((prev) => new Set([...prev, ...ids]));
      })
      .catch(() => {});
  }, [authed]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLoginError(data.error ?? "로그인 실패");
      return;
    }
    setAuthed(true);
  }

  function parseFile(file: File): Promise<ParsedSlido> {
    return file.arrayBuffer().then((buf) => {
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.includes("Pivot All") ? "Pivot All" : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null }) as unknown[][];
      return parseSlidoPivotRows(rows);
    });
  }

  async function handleQuizFile(file: File) {
    setQuizParseError(null);
    try {
      const result = await parseFile(file);
      if (result.participants.length === 0) {
        setQuizParseError("참가자 데이터를 찾지 못했어요. '참가자별 취합(Pivot All)' 형식의 내보내기 파일이 맞는지 확인해주세요.");
        return;
      }
      setQuizParsed(result);
      setQuizFileName(file.name);
      // 기본값: "퀴즈" 유형 문항만 체크 (유형 정보가 없으면 전체를 폴백으로 보여줌)
      const quizTyped = result.questionColumns.filter((c) => isQuizType(result.questionTypes[c]));
      setQuizCols(new Set(quizTyped.length > 0 ? quizTyped : result.questionColumns));
      setQuizBatches([]);
    } catch {
      setQuizParseError("파일을 읽는 중 오류가 발생했어요. 엑셀(.xlsx) 파일이 맞는지 확인해주세요.");
    }
  }

  async function handleClosingFile(file: File) {
    setClosingParseError(null);
    try {
      const result = await parseFile(file);
      if (result.participants.length === 0) {
        setClosingParseError("참가자 데이터를 찾지 못했어요. '참가자별 취합(Pivot All)' 형식의 내보내기 파일이 맞는지 확인해주세요.");
        return;
      }
      setClosingParsed(result);
      setClosingFileName(file.name);
      // 일반 투표(비-퀴즈) 유형 문항이 하나뿐이면 자동 선택
      const nonQuiz = result.questionColumns.filter((c) => !isQuizType(result.questionTypes[c]));
      setVoteCol(nonQuiz.length === 1 ? nonQuiz[0] : null);
      setClosingBatches([]);
    } catch {
      setClosingParseError("파일을 읽는 중 오류가 발생했어요. 엑셀(.xlsx) 파일이 맞는지 확인해주세요.");
    }
  }

  async function publishToScreen(entries: PublishEntry[]) {
    try {
      await fetch("/api/admin/slido-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
    } catch {
      // 스크린 반영 실패해도 관제판 화면 결과는 이미 표시되므로 조용히 무시
    }
  }

  // 중간세션엔 "퀴즈" 유형 문항만, 클로징세션엔 그 외(일반 투표) 유형 문항만 노출
  const quizEligibleColumns = useMemo(() => {
    if (!quizParsed) return [];
    const quizTyped = quizParsed.questionColumns.filter((c) => isQuizType(quizParsed.questionTypes[c]));
    return quizTyped.length > 0 ? quizTyped : quizParsed.questionColumns;
  }, [quizParsed]);

  const closingEligibleColumns = useMemo(() => {
    if (!closingParsed) return [];
    const nonQuiz = closingParsed.questionColumns.filter((c) => !isQuizType(closingParsed.questionTypes[c]));
    return nonQuiz.length > 0 ? nonQuiz : closingParsed.questionColumns;
  }, [closingParsed]);

  const quizStats = useMemo(() => {
    if (!quizParsed) return null;
    const cols = Array.from(quizCols);
    const respondents = quizParsed.participants.filter((p) => cols.some((c) => !!p.answers[c])).length;
    const totalTickets = quizParsed.participants.reduce(
      (sum, p) => sum + cols.filter((c) => !!p.answers[c]).length,
      0
    );
    return { respondents, totalTickets };
  }, [quizParsed, quizCols]);

  const closingTally = useMemo(() => {
    if (!closingParsed || !voteCol) return [];
    return voteTally(closingParsed.participants, voteCol);
  }, [closingParsed, voteCol]);
  const closingRespondentCount = closingTally.reduce((s, t) => s + t.count, 0);

  function runQuizDraw() {
    if (quizDrawingRef.current) return;
    quizDrawingRef.current = true;
    try {
      if (!quizParsed) return;
      const winners = drawQuizWinners(quizParsed.participants, Array.from(quizCols), wonIds, quizCount);
      if (winners.length === 0) return;
      setWonIds((prev) => new Set([...prev, ...winners.map((w) => w.id)]));
      setQuizBatches((prev) => [...prev, { prizeName: quizPrize, winners: winners.map(toWinnerView) }]);
      publishToScreen(toPublishEntries(winners, "quiz", null, quizPrize));
    } finally {
      quizDrawingRef.current = false;
    }
  }

  const closingWonCount = (rank: 3 | 2 | 1) =>
    closingBatches.filter((b) => b.rank === rank).reduce((s, b) => s + b.winners.length, 0);
  const closingRemaining = (rank: 3 | 2 | 1) => RANK_TARGET[rank] - closingWonCount(rank);
  const closingRankUnlocked = (rank: 3 | 2 | 1) => {
    if (rank === 3) return true;
    if (rank === 2) return closingRemaining(3) === 0;
    return closingRemaining(3) === 0 && closingRemaining(2) === 0;
  };

  function startClosingRank(rank: 3 | 2 | 1, prizeName: string) {
    setStartedRanks((prev) => new Set([...prev, rank]));
    publishToScreen([
      {
        round: "closing",
        rank,
        prizeName,
        maskedName: ACTIVATE_SENTINEL,
        maskedEmail: "",
        participantId: null,
      },
    ]);
  }

  function runClosingDraw(rank: 3 | 2 | 1, prizeName: string) {
    if (closingDrawingRef.current) return;
    closingDrawingRef.current = true;
    try {
      if (!closingParsed || !voteCol) return;
      const remaining = closingRemaining(rank);
      if (remaining <= 0) return;
      const count = revealOneByOne ? 1 : remaining;
      const winners = drawClosingWinners(closingParsed.participants, voteCol, wonIds, count);
      if (winners.length === 0) return;
      setWonIds((prev) => new Set([...prev, ...winners.map((w) => w.id)]));
      setClosingBatches((prev) => [...prev, { rank, prizeName, winners: winners.map(toWinnerView) }]);
      publishToScreen(toPublishEntries(winners, "closing", rank, prizeName));
    } finally {
      closingDrawingRef.current = false;
    }
  }

  async function resetAll() {
    if (!confirm("모든 추첨 결과를 초기화할까요? 스크린 표시도 함께 지워지고, 되돌릴 수 없어요.")) return;
    setWonIds(new Set());
    setQuizBatches([]);
    setClosingBatches([]);
    setStartedRanks(new Set());
    try {
      await fetch("/api/admin/slido-winners", { method: "DELETE" });
    } catch {
      // 무시
    }
  }

  async function resetScreenOnly() {
    if (
      !confirm(
        "스크린에 표시된 당첨자 발표만 지울까요? (관제판의 추첨 기록·중복당첨 방지 대상자는 그대로 유지돼요)"
      )
    )
      return;
    try {
      await fetch("/api/admin/slido-winners", { method: "DELETE" });
    } catch {
      // 무시
    }
  }

  if (authed === null) {
    return <Shell><p className="text-[#5b5348]">확인 중...</p></Shell>;
  }

  if (!authed) {
    return (
      <Shell>
        <Card className="max-w-sm mx-auto mt-20">
          <h1 className="text-xl font-bold mb-4 text-center">관리자 로그인</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              className="w-full border border-[#e4ddd0] rounded-xl px-4 py-2.5 outline-none focus:border-[#198038]"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <GreenButton type="submit" full>로그인</GreenButton>
          </form>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">🎉 럭키드로우 추첨 도구</h1>
            <p className="text-[#5b5348] text-sm mt-1">
              중간세션 퀴즈와 클로징 투표는 완전히 별도 단계예요 — 각각 그 시점 슬라이도 내보내기 파일을 따로 업로드해서 진행해요.
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <a
              href="/screen"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm border border-[#198038] text-[#198038] rounded-full px-4 py-2 font-medium hover:bg-[#198038] hover:text-white transition-colors whitespace-nowrap"
            >
              🖥️ 무대 스크린 열기
            </a>
            <button
              type="button"
              onClick={resetScreenOnly}
              className="text-xs text-[#5b5348] underline whitespace-nowrap"
            >
              스크린 화면 초기화
            </button>
          </div>
        </div>

        {/* ========== 1부: 중간세션 퀴즈 추첨 ========== */}
        <SectionHeader step="1" title="중간세션 — 퀴즈 참여상 추첨" />

        <Card>
          <UploadBox
            label="중간세션 슬라이도 내보내기 파일"
            fileName={quizFileName}
            onFile={handleQuizFile}
            error={quizParseError}
            participantCount={quizParsed?.participants.length}
          />
        </Card>

        {quizParsed && (
          <Card>
            <h2 className="font-semibold mb-3">퀴즈 문항 선택</h2>
            <p className="text-xs text-[#5b5348] mb-3">퀴즈 유형 문항만 자동으로 걸러서 보여줘요. 기본으로 전체 체크돼 있고, 필요하면 해제하세요.</p>
            <div className="space-y-2">
              {quizEligibleColumns.map((col) => (
                <label key={col} className="flex items-center gap-2 border border-[#eee5d5] rounded-xl px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={quizCols.has(col)}
                    onChange={(e) => {
                      const next = new Set(quizCols);
                      if (e.target.checked) next.add(col);
                      else next.delete(col);
                      setQuizCols(next);
                    }}
                  />
                  <span className="truncate" title={col}>{col}</span>
                </label>
              ))}
            </div>
            {quizStats && (
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <Stat label="퀴즈 응답자" value={`${quizStats.respondents}명`} />
                <Stat label="가중 응모권" value={`${quizStats.totalTickets}장`} />
              </div>
            )}
          </Card>
        )}

        {quizParsed && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">퀴즈 참여상 추첨</h2>
              <span className="text-xs text-[#5b5348]">이미 당첨된 사람은 자동 제외</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-[#5b5348]">
                경품명
                <input
                  className="block border border-[#e4ddd0] rounded-lg px-3 py-1.5 text-sm mt-1"
                  value={quizPrize}
                  onChange={(e) => setQuizPrize(e.target.value)}
                />
              </label>
              <label className="text-xs text-[#5b5348]">
                인원수
                <input
                  type="number"
                  min={1}
                  className="block border border-[#e4ddd0] rounded-lg px-3 py-1.5 text-sm mt-1 w-24"
                  value={quizCount}
                  onChange={(e) => setQuizCount(Number(e.target.value))}
                />
              </label>
              <GreenButton onClick={runQuizDraw} disabled={quizCols.size === 0}>
                🎲 추첨하기
              </GreenButton>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {QUIZ_PRIZE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setQuizPrize(preset);
                    setQuizCount(5);
                  }}
                  className="text-xs border border-[#e4ddd0] rounded-full px-3 py-1 hover:bg-[#f5f1e8]"
                >
                  {preset} (5명)
                </button>
              ))}
            </div>
            {quizCols.size === 0 && (
              <p className="text-xs text-amber-600 mt-2">위에서 퀴즈 문항을 1개 이상 체크해주세요.</p>
            )}
            {quizBatches.map((batch, i) => (
              <ResultBlock key={i} title={`${batch.prizeName} (${batch.winners.length}명)`} winners={batch.winners} />
            ))}
          </Card>
        )}

        {/* ========== 2부: 클로징 세션 투표 추첨 ========== */}
        <SectionHeader step="2" title="클로징세션 — 투표 시상 추첨" note="행사 전체 종료 직전, 클로징 투표까지 끝난 뒤 진행" />

        <Card>
          <UploadBox
            label="클로징세션 슬라이도 내보내기 파일 (행사 막바지에 새로 내보내기)"
            fileName={closingFileName}
            onFile={handleClosingFile}
            error={closingParseError}
            participantCount={closingParsed?.participants.length}
          />
        </Card>

        {closingParsed && (
          <Card>
            <h2 className="font-semibold mb-3">클로징 투표 문항 선택</h2>
            <p className="text-xs text-[#5b5348] mb-3">중간세션 퀴즈 문항은 자동으로 제외했어요.</p>
            <div className="space-y-2">
              {closingEligibleColumns.map((col) => (
                <label key={col} className="flex items-center gap-2 border border-[#eee5d5] rounded-xl px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="voteCol"
                    checked={voteCol === col}
                    onChange={() => setVoteCol(col)}
                  />
                  <span className="truncate" title={col}>{col}</span>
                </label>
              ))}
            </div>

            {voteCol && closingTally.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-[#5b5348] mb-2">
                  득표 현황 (총 투표 {closingRespondentCount}명) — 🏆 베스트 임팩트상 발표용, 추첨과는 무관
                </p>
                <ul className="space-y-1">
                  {closingTally.map((t, i) => (
                    <li
                      key={t.option}
                      className={`flex justify-between text-sm border rounded-lg px-3 py-1.5 ${
                        i === 0 ? "border-[#198038] bg-[#f0f7f1] font-semibold" : "border-[#eee5d5]"
                      }`}
                    >
                      <span>{i === 0 ? "🏆 " : ""}{t.option}</span>
                      <span className="font-mono">{t.count}표</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {closingParsed && voteCol && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">클로징 시상 추첨 (3등 → 2등 → 1등 순서)</h2>
              <label className="flex items-center gap-2 text-xs text-[#5b5348]">
                <input
                  type="checkbox"
                  checked={revealOneByOne}
                  onChange={(e) => setRevealOneByOne(e.target.checked)}
                />
                한 명씩 발표 (버튼 누를 때마다 1명씩 공개)
              </label>
            </div>
            <div className="space-y-3">
              {([3, 2, 1] as const).map((rank) => (
                <ClosingRankRow
                  key={rank}
                  rank={rank}
                  target={RANK_TARGET[rank]}
                  wonCount={closingWonCount(rank)}
                  unlocked={closingRankUnlocked(rank)}
                  defaultPrize={RANK_DEFAULT_PRIZE[rank]}
                  oneByOne={revealOneByOne}
                  started={startedRanks.has(rank)}
                  onStart={startClosingRank}
                  onDraw={runClosingDraw}
                />
              ))}
            </div>

            {closingBatches
              .slice()
              .reverse()
              .map((b, i) => (
                <ResultBlock key={i} title={`${b.rank}등 · ${b.prizeName}`} winners={b.winners} highlight={b.rank === 1} />
              ))}
          </Card>
        )}

        {(quizBatches.length > 0 || closingBatches.length > 0) && (
          <div className="text-center">
            <button onClick={resetAll} className="text-xs text-red-600 underline">
              전체 추첨 결과 초기화
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 min-h-full p-6" style={{ background: "#FAF7F0", color: "#2b2620" }}>
      {children}
    </main>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#eee5d5] rounded-2xl p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ step, title, note }: { step: string; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#198038] text-white text-sm font-bold shrink-0">
        {step}
      </span>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {note && <p className="text-xs text-[#5b5348]">{note}</p>}
      </div>
    </div>
  );
}

function UploadBox({
  label,
  fileName,
  onFile,
  error,
  participantCount,
}: {
  label: string;
  fileName: string | null;
  onFile: (f: File) => void;
  error: string | null;
  participantCount?: number;
}) {
  return (
    <div>
      <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#cfc6b4] rounded-2xl py-8 cursor-pointer hover:border-[#198038] transition-colors bg-[#fdfbf6]">
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <span className="text-3xl mb-2">📂</span>
        <span className="font-medium text-sm text-center px-4">{label}</span>
        {fileName && <span className="text-xs text-[#5b5348] mt-2">현재 파일: {fileName}</span>}
      </label>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {participantCount != null && (
        <p className="text-sm text-[#198038] mt-3 font-medium">✅ 참가자 {participantCount}명 인식 완료</p>
      )}
    </div>
  );
}

function GreenButton({
  children,
  onClick,
  disabled,
  full,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`bg-[#198038] hover:bg-[#146a2e] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-full px-5 py-2.5 text-sm transition-colors ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#fdfbf6] border border-[#eee5d5] rounded-xl py-3">
      <div className="text-lg font-bold text-[#198038]">{value}</div>
      <div className="text-xs text-[#5b5348] mt-0.5">{label}</div>
    </div>
  );
}

function ClosingRankRow({
  rank,
  target,
  wonCount,
  unlocked,
  defaultPrize,
  oneByOne,
  started,
  onStart,
  onDraw,
}: {
  rank: 3 | 2 | 1;
  target: number;
  wonCount: number;
  unlocked: boolean;
  defaultPrize: string;
  oneByOne: boolean;
  started: boolean;
  onStart: (rank: 3 | 2 | 1, prizeName: string) => void;
  onDraw: (rank: 3 | 2 | 1, prizeName: string) => void;
}) {
  const [prize, setPrize] = useState(defaultPrize);
  const done = wonCount >= target;
  const enabled = unlocked && !done;
  // 한 명씩 발표 모드에서, 아직 "추첨 시작"을 안 눌렀고 아무도 안 뽑혔으면 화면 전환용 시작 버튼부터 노출
  const needsStart = oneByOne && !started && wonCount === 0 && !done;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium w-20">
        {rank}등 ({wonCount}/{target}명)
      </span>
      <input
        className="border border-[#e4ddd0] rounded-lg px-3 py-1.5 text-sm flex-1 disabled:bg-[#f5f1e8] disabled:text-[#a89f8f]"
        value={prize}
        disabled={!enabled}
        onChange={(e) => setPrize(e.target.value)}
      />
      {needsStart ? (
        <GreenButton onClick={() => onStart(rank, prize)} disabled={!enabled}>
          🎬 추첨 시작
        </GreenButton>
      ) : (
        <GreenButton onClick={() => onDraw(rank, prize)} disabled={!enabled}>
          {done ? "완료" : oneByOne ? "1명 추첨" : `${target - wonCount}명 추첨`}
        </GreenButton>
      )}
    </div>
  );
}

function ResultBlock({
  title,
  winners,
  highlight,
}: {
  title: string;
  winners: WinnerView[];
  highlight?: boolean;
}) {
  return (
    <div className={`mt-4 rounded-xl p-4 ${highlight ? "bg-[#198038] text-white" : "bg-[#f5f1e8]"}`}>
      <p className={`text-sm font-semibold mb-2 ${highlight ? "text-white" : "text-[#2b2620]"}`}>
        🎊 {title}
      </p>
      <ul className="space-y-1">
        {winners.map((w, i) => (
          <li
            key={i}
            className={`text-sm font-mono ${highlight ? "text-white" : "text-[#2b2620]"}`}
          >
            {w.maskedName}
          </li>
        ))}
      </ul>
    </div>
  );
}
