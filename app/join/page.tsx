"use client";

import { useEffect, useRef, useState } from "react";

type QuizQuestion = { id: number; seq: number; question: string; options: string[] };
type VoteQuestion = { id: number; question: string; options: string[] };
type EventStateResp = {
  stage: "idle" | "quiz" | "closing_vote" | "closed";
  quiz?: QuizQuestion | null;
  vote?: VoteQuestion | null;
};

const PHONE_PLACEHOLDER = "01012345678";

export default function JoinPage() {
  const [registered, setRegistered] = useState<boolean | null>(null); // null = 로딩중
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [answeredIds, setAnsweredIds] = useState<Set<number>>(new Set());
  const [votedOption, setVotedOption] = useState<string | null>(null);

  const [state, setState] = useState<EventStateResp>({ stage: "idle" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 최초 로드: 등록 여부 확인
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.registered) {
          setRegistered(true);
          setDisplayName(data.name);
          setAnsweredIds(new Set<number>(data.answeredQuestionIds ?? []));
          setVotedOption(data.votedOption ?? null);
        } else {
          setRegistered(false);
        }
      })
      .catch(() => setRegistered(false));
  }, []);

  // 등록 후: 행사 상태 폴링
  useEffect(() => {
    if (!registered) return;
    const poll = () => {
      fetch("/api/state")
        .then((r) => r.json())
        .then((data: EventStateResp) => setState(data))
        .catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [registered]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, consent }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setDisplayName(name);
      setRegistered(true);
    } catch {
      setFormError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuizAnswer(questionId: number, selectedIndex: number) {
    if (answeredIds.has(questionId) || submittingAnswer) return;
    setSubmittingAnswer(true);
    setActionError(null);
    try {
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selectedIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "응답 제출에 실패했습니다.");
        return;
      }
      setAnsweredIds((prev) => new Set(prev).add(questionId));
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmittingAnswer(false);
    }
  }

  async function handleVote(selectedOption: string) {
    if (votedOption || submittingAnswer) return;
    setSubmittingAnswer(true);
    setActionError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOption }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "투표 제출에 실패했습니다.");
        return;
      }
      setVotedOption(selectedOption);
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmittingAnswer(false);
    }
  }

  if (registered === null) {
    return <Centered>불러오는 중...</Centered>;
  }

  if (!registered) {
    return (
      <Centered>
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-1">2026 SK임팩트부스터 데이</h1>
          <p className="text-center text-sm text-gray-500 mb-6">이벤트 참여를 위해 정보를 입력해주세요</p>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">이름</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">휴대폰 번호</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={PHONE_PLACEHOLDER}
                inputMode="numeric"
                required
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                [필수] 이벤트 참여 및 경품 당첨자 확인을 위해 이름, 휴대폰번호를 수집합니다. 수집된
                정보는 행사 종료 후 파기되며, 동의하지 않을 시 이벤트 참여가 제한됩니다.
              </span>
            </label>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white rounded-lg py-3 font-semibold disabled:opacity-50"
            >
              {submitting ? "등록 중..." : "참여하기"}
            </button>
          </form>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="w-full max-w-sm">
        <p className="text-center text-sm text-gray-500 mb-1">{displayName}님, 환영합니다</p>
        <h1 className="text-lg font-bold text-center mb-6">2026 SK임팩트부스터 데이</h1>

        {state.stage === "idle" && (
          <InfoBox>잠시 후 이벤트가 시작됩니다. 화면을 유지해주세요 🙂</InfoBox>
        )}

        {state.stage === "quiz" && state.quiz && (
          <QuizBlock
            quiz={state.quiz}
            answered={answeredIds.has(state.quiz.id)}
            onAnswer={handleQuizAnswer}
            submitting={submittingAnswer}
          />
        )}
        {state.stage === "quiz" && !state.quiz && (
          <InfoBox>다음 문제를 준비 중입니다...</InfoBox>
        )}

        {state.stage === "closing_vote" && state.vote && (
          <VoteBlock
            vote={state.vote}
            voted={votedOption}
            onVote={handleVote}
            submitting={submittingAnswer}
          />
        )}

        {state.stage === "closed" && (
          <InfoBox>참여해주셔서 감사합니다! 당첨자는 무대 화면에서 확인해주세요 🎉</InfoBox>
        )}

        {actionError && <p className="text-sm text-red-600 mt-3 text-center">{actionError}</p>}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-gray-50">{children}</main>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-6 text-center text-gray-600 bg-white">{children}</div>
  );
}

function QuizBlock({
  quiz,
  answered,
  onAnswer,
  submitting,
}: {
  quiz: QuizQuestion;
  answered: boolean;
  onAnswer: (questionId: number, index: number) => void;
  submitting: boolean;
}) {
  if (answered) {
    return <InfoBox>응답 완료! 다음 문제를 기다려주세요 ✅</InfoBox>;
  }
  return (
    <div className="border rounded-lg p-5 bg-white">
      <p className="text-xs text-gray-400 mb-1">문제 {quiz.seq}</p>
      <p className="font-semibold mb-4">{quiz.question}</p>
      <div className="space-y-2">
        {quiz.options.map((opt, idx) => (
          <button
            key={idx}
            disabled={submitting}
            onClick={() => onAnswer(quiz.id, idx)}
            className="w-full text-left border rounded-lg px-4 py-3 hover:bg-gray-50 disabled:opacity-50"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function VoteBlock({
  vote,
  voted,
  onVote,
  submitting,
}: {
  vote: VoteQuestion;
  voted: string | null;
  onVote: (option: string) => void;
  submitting: boolean;
}) {
  if (voted) {
    return <InfoBox>&quot;{voted}&quot;에 투표했어요. 결과 발표를 기다려주세요 🎉</InfoBox>;
  }
  return (
    <div className="border rounded-lg p-5 bg-white">
      <p className="font-semibold mb-4">{vote.question}</p>
      <div className="grid grid-cols-1 gap-2">
        {vote.options.map((opt) => (
          <button
            key={opt}
            disabled={submitting}
            onClick={() => onVote(opt)}
            className="w-full text-left border rounded-lg px-4 py-3 hover:bg-gray-50 disabled:opacity-50"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
