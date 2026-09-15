"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ParsedSlido,
  SlidoParticipant,
  parseSlidoPivotRows,
  uniqueOptionValues,
  drawQuizWinners,
  drawClosingWinners,
} from "@/lib/slido-draw";
import { maskSlidoName, maskEmail } from "@/lib/mask";

type WinnerView = { maskedName: string; maskedEmail: string };
type QuizBatch = { prizeName: string; winners: WinnerView[] };
type ClosingResult = { rank: 3 | 2 | 1; prizeName: string; winners: WinnerView[] };

export default function DrawToolPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [parsed, setParsed] = useState<ParsedSlido | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [quizCols, setQuizCols] = useState<Set<string>>(new Set());
  const [voteCol, setVoteCol] = useState<string | null>(null);
  const [correctOption, setCorrectOption] = useState<string | null>(null);

  const [wonIds, setWonIds] = useState<Set<string>>(new Set());
  const [quizBatches, setQuizBatches] = useState<QuizBatch[]>([]);
  const [closingResults, setClosingResults] = useState<ClosingResult[]>([]);
  const QUIZ_PRIZE_PRESETS = ["LABO+VARDE 여권 케이스", "출장/여행용 필터샤워기 세트"];
  const [quizPrize, setQuizPrize] = useState(QUIZ_PRIZE_PRESETS[0]);
  const [quizCount, setQuizCount] = useState(5);

  useEffect(() => {
    fetch("/api/admin/ping").then((res) => setAuthed(res.ok));
  }, []);

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

  async function handleFile(file: File) {
    setParseError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.includes("Pivot All") ? "Pivot All" : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null }) as unknown[][];
      const result = parseSlidoPivotRows(rows);
      if (result.participants.length === 0) {
        setParseError("참가자 데이터를 찾지 못했어요. '참가자별 취합(Pivot All)' 형식의 내보내기 파일이 맞는지 확인해주세요.");
        return;
      }
      setParsed(result);
      setFileName(file.name);
      setQuizCols(new Set());
      setVoteCol(null);
      setCorrectOption(null);
      setWonIds(new Set());
      setQuizBatches([]);
      setClosingResults([]);
    } catch {
      setParseError("파일을 읽는 중 오류가 발생했어요. 엑셀(.xlsx) 파일이 맞는지 확인해주세요.");
    }
  }

  const stats = useMemo(() => {
    if (!parsed) return null;
    const quizColsArr = Array.from(quizCols);
    const quizRespondents = parsed.participants.filter((p) =>
      quizColsArr.some((c) => !!p.answers[c])
    ).length;
    const totalTickets = parsed.participants.reduce(
      (sum, p) => sum + quizColsArr.filter((c) => !!p.answers[c]).length,
      0
    );
    const closingRespondents =
      voteCol && correctOption
        ? parsed.participants.filter((p) => p.answers[voteCol] === correctOption).length
        : 0;
    return { quizRespondents, totalTickets, closingRespondents };
  }, [parsed, quizCols, voteCol, correctOption]);

  function toView(p: SlidoParticipant): WinnerView {
    return { maskedName: maskSlidoName(p.name), maskedEmail: maskEmail(p.email) };
  }

async function publishToScreen(
    entries: { round: string; rank: number | null; prizeName: string; maskedName: string; maskedEmail: string }[]
  ) {
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

  function runQuizDraw() {
    if (!parsed) return;
    const winners = drawQuizWinners(parsed.participants, Array.from(quizCols), wonIds, quizCount);
    if (winners.length === 0) return;
    setWonIds((prev) => new Set([...prev, ...winners.map((w) => w.id)]));
    const views = winners.map(toView);
    setQuizBatches((prev) => [...prev, { prizeName: quizPrize, winners: views }]);
    publishToScreen(
      views.map((v) => ({ round: "quiz", rank: null, prizeName: quizPrize, maskedName: v.maskedName, maskedEmail: v.maskedEmail }))
    );
  }

  function runClosingDraw(rank: 3 | 2 | 1, prizeName: string, count: number) {
    if (!parsed || !voteCol || !correctOption) return;
    const winners = drawClosingWinners(parsed.participants, voteCol, correctOption, wonIds, count);
    setWonIds((prev) => new Set([...prev, ...winners.map((w) => w.id)]));
    const views = winners.map(toView);
    setClosingResults((prev) => [...prev, { rank, prizeName, winners: views }]);
    publishToScreen(
      views.map((v) => ({ round: "closing", rank, prizeName, maskedName: v.maskedName, maskedEmail: v.maskedEmail }))
    );
  }

  async function resetAll() {
    if (!confirm("모든 추첨 결과를 초기화할까요? 스크린 표시도 함께 지워지고, 되돌릴 수 없어요.")) return;
    setWonIds(new Set());
    setQuizBatches([]);
    setClosingResults([]);
    try {
      await fetch("/api/admin/slido-winners", { method: "DELETE" });
    } catch {
      // 무시 — 관제판 로컬 상태는 이미 초기화됨
    }
  }

  const closingDrawnRanks = new Set(closingResults.map((r) => r.rank));
  const canDraw3 = !closingDrawnRanks.has(3);
  const canDraw2 = closingDrawnRanks.has(3) && !closingDrawnRanks.has(2);
  const canDraw1 = closingDrawnRanks.has(2) && !closingDrawnRanks.has(1);

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
              슬라이도 &quot;참가자별 취합(Pivot All)&quot; 내보내기 파일을 업로드해서 추첨을 진행해요.
            </p>
          </div>
          <a
            href="/screen"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm border border-[#198038] text-[#198038] rounded-full px-4 py-2 font-medium hover:bg-[#198038] hover:text-white transition-colors whitespace-nowrap"
          >
            🖥️ 무대 스크린 열기
          </a>
        </div>

        <Card>
          <h2 className="font-semibold mb-3">1. 슬라이도 결과 파일 업로드</h2>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#cfc6b4] rounded-2xl py-10 cursor-pointer hover:border-[#198038] transition-colors bg-[#fdfbf6]">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <span className="text-3xl mb-2">📂</span>
            <span className="font-medium">엑셀 파일 선택 (.xlsx)</span>
            {fileName && <span className="text-xs text-[#5b5348] mt-2">현재 파일: {fileName}</span>}
          </label>
          {parseError && <p className="text-sm text-red-600 mt-3">{parseError}</p>}
          {parsed && (
            <p className="text-sm text-[#198038] mt-3 font-medium">
              ✅ 참가자 {parsed.participants.length}명 인식 완료
            </p>
          )}
        </Card>

        {parsed && (
          <Card>
            <h2 className="font-semibold mb-3">2. 문항 설정</h2>
            <p className="text-xs text-[#5b5348] mb-3">
              중간세션 퀴즈로 쓸 문항(다중 선택 가능)과, 클로징 투표 문항 + 정답(당첨 기준) 보기를 지정해주세요.
            </p>
            <div className="space-y-2">
              {parsed.questionColumns.map((col) => (
                <div key={col} className="flex items-center gap-3 border border-[#eee5d5] rounded-xl px-3 py-2">
                  <label className="flex items-center gap-2 text-sm flex-1">
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
                    <span className="text-[#5b5348]">퀴즈 문항</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm flex-1">
                    <input
                      type="radio"
                      name="voteCol"
                      checked={voteCol === col}
                      onChange={() => {
                        setVoteCol(col);
                        setCorrectOption(null);
                      }}
                    />
                    <span className="text-[#5b5348]">클로징 투표 문항</span>
                  </label>
                  <span className="text-sm truncate flex-[2]" title={col}>{col}</span>
                </div>
              ))}
            </div>

            {voteCol && parsed && (
              <div className="mt-4 flex items-end gap-2">
                <label className="text-xs text-[#5b5348]">
                  정답(당첨 기준) 보기
                  <select
                    className="block border border-[#e4ddd0] rounded-lg px-2 py-1.5 text-sm mt-1"
                    value={correctOption ?? ""}
                    onChange={(e) => setCorrectOption(e.target.value || null)}
                  >
                    <option value="">선택 안 함</option>
                    {uniqueOptionValues(parsed.participants, voteCol).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {stats && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Stat label="퀴즈 응답자" value={`${stats.quizRespondents}명`} />
                <Stat label="가중 응모권" value={`${stats.totalTickets}장`} />
                <Stat label="클로징 정답자" value={`${stats.closingRespondents}명`} />
              </div>
            )}
          </Card>
        )}

        {parsed && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">3. 중간세션 퀴즈 참여상 추첨</h2>
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

        {parsed && voteCol && correctOption && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">4. 클로징 시상 추첨 (3등 → 2등 → 1등 순서)</h2>
            </div>
            <div className="space-y-3">
              <ClosingRow rank={3} label="3등 (2명)" defaultPrize="엔티 나물투데이 제철나물 정기구독권" count={2} enabled={canDraw3} onDraw={runClosingDraw} />
              <ClosingRow rank={2} label="2등 (2명)" defaultPrize="스타스테크 라보페 불가사리 콜라겐 리커버리 세트" count={2} enabled={canDraw2} onDraw={runClosingDraw} />
              <ClosingRow rank={1} label="1등 (1명)" defaultPrize="애플 에어팟 프로 3" count={1} enabled={canDraw1} onDraw={runClosingDraw} />
            </div>

            {closingResults
              .slice()
              .sort((a, b) => b.rank - a.rank)
              .map((r, i) => (
                <ResultBlock key={i} title={`${r.rank}등 · ${r.prizeName}`} winners={r.winners} highlight={r.rank === 1} />
              ))}
          </Card>
        )}

        {(quizBatches.length > 0 || closingResults.length > 0) && (
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

function ClosingRow({
  rank,
  label,
  defaultPrize,
  count,
  enabled,
  onDraw,
}: {
  rank: 3 | 2 | 1;
  label: string;
  defaultPrize: string;
  count: number;
  enabled: boolean;
  onDraw: (rank: 3 | 2 | 1, prizeName: string, count: number) => void;
}) {
  const [prize, setPrize] = useState(defaultPrize);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium w-20">{label}</span>
      <input
        className="border border-[#e4ddd0] rounded-lg px-3 py-1.5 text-sm flex-1 disabled:bg-[#f5f1e8] disabled:text-[#a89f8f]"
        value={prize}
        disabled={!enabled}
        onChange={(e) => setPrize(e.target.value)}
      />
      <GreenButton onClick={() => onDraw(rank, prize, count)} disabled={!enabled}>
        추첨
      </GreenButton>
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
    <div
      className={`mt-4 rounded-xl p-4 ${highlight ? "bg-[#198038] text-white" : "bg-[#f5f1e8]"}`}
    >
      <p className={`text-sm font-semibold mb-2 ${highlight ? "text-white" : "text-[#2b2620]"}`}>
        🎊 {title}
      </p>
      <ul className="space-y-1">
        {winners.map((w, i) => (
          <li
            key={i}
            className={`text-sm flex justify-between font-mono ${highlight ? "text-white" : "text-[#2b2620]"}`}
          >
            <span>{w.maskedName}</span>
            <span>{w.maskedEmail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
