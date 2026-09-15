"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Summary = {
  stage: string;
  currentQuizSeq: number | null;
  participantCount: number;
  quizRespondentCount: number;
  questions: { id: number; seq: number; question: string; options: string[] }[];
  responseCountByQuestion: Record<number, number>;
  voteQuestion: { question: string; options: string[]; correct_option: string | null } | null;
  voteCountByOption: Record<string, number>;
  winners: {
    round: string;
    rank: number | null;
    prizeName: string;
    createdAt: string;
    maskedName: string;
    phoneLast4: string;
  }[];
};

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/summary");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = await res.json();
    setSummary(data);
    setAuthed(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 최초 로드 + 폴링 시작 (표준 데이터 페칭 패턴)
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

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
    load();
  }

  async function setStage(stage: string, currentQuizSeq: number | null = null) {
    setBusy(true);
    setMessage(null);
    await fetch("/api/admin/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, currentQuizSeq }),
    });
    await load();
    setBusy(false);
  }

  async function saveCorrectOption(option: string) {
    setBusy(true);
    await fetch("/api/admin/vote-correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctOption: option }),
    });
    await load();
    setBusy(false);
  }

  async function drawQuiz(count: number, prizeName: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: "quiz", count, prizeName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`오류: ${data.error}`);
    } else {
      setMessage(
        `당첨: ${data.winners.map((w: { maskedName: string; phoneLast4: string }) => `${w.maskedName}(${w.phoneLast4})`).join(", ")}`
      );
    }
    await load();
    setBusy(false);
  }

  async function drawClosing(rank: number, prizeName: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: "closing", rank, prizeName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`오류: ${data.error}`);
    } else {
      setMessage(`${rank}등 당첨: ${data.winner.maskedName}(${data.winner.phoneLast4})`);
    }
    await load();
    setBusy(false);
  }

  if (authed === null) return <main className="p-8">불러오는 중...</main>;

  if (!authed) {
    return (
      <main className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-3">
          <h1 className="text-lg font-bold text-center mb-4">관리자 로그인</h1>
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button className="w-full bg-black text-white rounded-lg py-2 font-semibold">
            로그인
          </button>
        </form>
      </main>
    );
  }

  if (!summary) return <main className="p-8">불러오는 중...</main>;

  return (
    <main className="flex-1 bg-gray-50 p-6 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">럭키드로우 관제판</h1>
        <Link href="/admin/draw" className="text-sm text-blue-600 underline">
          🎲 슬라이도 결과 추첨 도구 →
        </Link>
      </div>
      {message && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm">
          {message}
        </div>
      )}

      <Section title={`진행 상태: ${summary.stage} (참가자 ${summary.participantCount}명)`}>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setStage("idle")} disabled={busy}>
            대기
          </Btn>
          {[1, 2, 3].map((seq) => (
            <Btn key={seq} onClick={() => setStage("quiz", seq)} disabled={busy}>
              퀴즈 {seq}번 열기
            </Btn>
          ))}
          <Btn onClick={() => setStage("closing_vote")} disabled={busy}>
            클로징 투표 시작
          </Btn>
          <Btn onClick={() => setStage("closed")} disabled={busy}>
            행사 종료
          </Btn>
        </div>
      </Section>

      <Section title={`퀴즈 응답 현황 (응답자 ${summary.quizRespondentCount}명)`}>
        <ul className="text-sm space-y-1">
          {summary.questions.map((q) => (
            <li key={q.id} className="flex justify-between border-b py-1">
              <span>
                {q.seq}. {q.question}
              </span>
              <span className="font-mono">{summary.responseCountByQuestion[q.id] ?? 0}명</span>
            </li>
          ))}
        </ul>
        <DrawForm
          label="퀴즈 참여상 추첨"
          defaultPrize="퀴즈 참여상"
          defaultCount={5}
          onSubmit={(count, prize) => drawQuiz(count, prize)}
          busy={busy}
        />
      </Section>

      {summary.voteQuestion && (
        <Section title="클로징 투표 결과">
          <p className="text-sm mb-2">{summary.voteQuestion.question}</p>
          <ul className="text-sm space-y-1 mb-3">
            {summary.voteQuestion.options.map((opt) => (
              <li key={opt} className="flex justify-between border-b py-1">
                <span>
                  {opt}
                  {summary.voteQuestion?.correct_option === opt && (
                    <span className="ml-2 text-green-600 text-xs">(정답 지정됨)</span>
                  )}
                </span>
                <span className="font-mono">{summary.voteCountByOption[opt] ?? 0}표</span>
              </li>
            ))}
          </ul>
          <CorrectOptionPicker
            options={summary.voteQuestion.options}
            current={summary.voteQuestion.correct_option}
            onSave={saveCorrectOption}
            busy={busy}
          />
          <div className="mt-4 space-y-2">
            {[3, 2, 1].map((rank) => (
              <ClosingDrawRow key={rank} rank={rank} onDraw={drawClosing} busy={busy} />
            ))}
          </div>
        </Section>
      )}

      <Section title="당첨자 목록">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">라운드</th>
              <th>등수</th>
              <th>경품</th>
              <th>이름</th>
              <th>연락처(뒤4)</th>
            </tr>
          </thead>
          <tbody>
            {summary.winners.map((w, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{w.round === "quiz" ? "중간세션" : "클로징"}</td>
                <td>{w.rank ?? "-"}</td>
                <td>{w.prizeName}</td>
                <td>{w.maskedName}</td>
                <td className="font-mono">{w.phoneLast4}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border rounded-lg p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="border rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function DrawForm({
  label,
  defaultPrize,
  defaultCount,
  onSubmit,
  busy,
}: {
  label: string;
  defaultPrize: string;
  defaultCount: number;
  onSubmit: (count: number, prize: string) => void;
  busy: boolean;
}) {
  const [count, setCount] = useState(defaultCount);
  const [prize, setPrize] = useState(defaultPrize);
  return (
    <div className="flex flex-wrap items-end gap-2 mt-3 border-t pt-3">
      <label className="text-xs text-gray-500">
        경품명
        <input
          className="block border rounded px-2 py-1 text-sm"
          value={prize}
          onChange={(e) => setPrize(e.target.value)}
        />
      </label>
      <label className="text-xs text-gray-500">
        인원수
        <input
          type="number"
          min={1}
          className="block border rounded px-2 py-1 text-sm w-20"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <Btn onClick={() => onSubmit(count, prize)} disabled={busy}>
        {label}
      </Btn>
    </div>
  );
}

function ClosingDrawRow({
  rank,
  onDraw,
  busy,
}: {
  rank: number;
  onDraw: (rank: number, prize: string) => void;
  busy: boolean;
}) {
  const [prize, setPrize] = useState(
    rank === 1 ? "애플 에어팟 프로 3" : rank === 2 ? "스타스테크 콜라겐 세트" : "엔티 정기구독권"
  );
  return (
    <div className="flex items-end gap-2">
      <span className="text-sm w-8">{rank}등</span>
      <input
        className="border rounded px-2 py-1 text-sm flex-1"
        value={prize}
        onChange={(e) => setPrize(e.target.value)}
      />
      <Btn onClick={() => onDraw(rank, prize)} disabled={busy}>
        추첨
      </Btn>
    </div>
  );
}

function CorrectOptionPicker({
  options,
  current,
  onSave,
  busy,
}: {
  options: string[];
  current: string | null;
  onSave: (opt: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(current ?? options[0]);
  return (
    <div className="flex items-end gap-2 border-t pt-3">
      <label className="text-xs text-gray-500">
        정답 기업 지정
        <select
          className="block border rounded px-2 py-1 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
      <Btn onClick={() => onSave(selected)} disabled={busy}>
        저장
      </Btn>
    </div>
  );
}
