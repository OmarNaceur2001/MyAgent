import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sfx";
import { gameOver, playBeat } from "../lib/store";

type Hand = "rock" | "paper" | "scissors";
const HANDS: Hand[] = ["rock", "paper", "scissors"];
const BEATS: Record<Hand, Hand> = { rock: "scissors", paper: "rock", scissors: "paper" };
const FIRST_TO = 2; // best of three

// Hand drawings as simple strokes: no emoji, so they match MyAgent's style.
function HandIcon({ hand }: { hand: Hand }) {
  return (
    <svg viewBox="0 0 48 48" className="rps-icon" aria-hidden>
      {hand === "rock" && <path d="M9 31c-2-9 5-17 14-18 9-2 17 5 17 13 1 8-6 13-15 13-8 0-14-2-16-8zM21 17l4 6-3 4M32 25l-4 3" />}
      {hand === "paper" && <path d="M14 8h16l6 6v26H14zM30 8v6h6M19 20h12M19 26h12M19 32h8" />}
      {hand === "scissors" && (
        <path d="M17 38a5 5 0 1 0 0-.1M31 38a5 5 0 1 0 0-.1M19 33L32 8M29 33L16 8" />
      )}
    </svg>
  );
}

export function RockPaperScissors() {
  const [score, setScore] = useState({ you: 0, myagent: 0 });
  const [round, setRound] = useState<{ you: Hand; myagent: Hand; result: "win" | "lose" | "draw" } | null>(null);
  const [count, setCount] = useState<number | null>(null); // 3-2-1 countdown
  const [picked, setPicked] = useState<Hand | null>(null);
  const reported = useRef(false);

  const matchOver = score.you >= FIRST_TO || score.myagent >= FIRST_TO;

  // countdown: "rock… paper… scissors… shoot!" with a nod on each beat
  useEffect(() => {
    if (count === null) return;
    if (count > 0) {
      playBeat("nod");
      sfx.play("tick");
      const t = setTimeout(() => setCount(count - 1), 420);
      return () => clearTimeout(t);
    }
    const myagent = HANDS[Math.floor(Math.random() * 3)];
    const you = picked as Hand;
    const result = you === myagent ? "draw" : BEATS[you] === myagent ? "win" : "lose";
    setRound({ you, myagent, result });
    setScore((s) => ({ you: s.you + (result === "win" ? 1 : 0), myagent: s.myagent + (result === "lose" ? 1 : 0) }));
    playBeat(result === "lose" ? "hop" : result === "win" ? "shake" : "nod");
    setCount(null);
  }, [count, picked]);

  useEffect(() => {
    if (matchOver && !reported.current) {
      reported.current = true;
      gameOver("rps", score.you > score.myagent ? "win" : "lose");
    }
  }, [matchOver, score]);

  const throwHand = (h: Hand) => {
    if (count !== null || matchOver) return;
    setPicked(h);
    setRound(null);
    setCount(3);
  };

  const again = () => {
    reported.current = false;
    setScore({ you: 0, myagent: 0 });
    setRound(null);
  };

  const words = ["Shoot!", "Scissors…", "Paper…", "Rock…"];
  const status =
    count !== null
      ? words[count]
      : matchOver
        ? score.you > score.myagent
          ? "You win the match!"
          : "MyAgent wins the match!"
        : round
          ? { win: "You win this round!", lose: "MyAgent wins this round!", draw: "Same hand! Again." }[round.result]
          : "Pick your hand. First to two wins.";

  return (
    <div className="game rps">
      <div className="game-score" aria-label="Score">
        <span>
          You <strong>{score.you}</strong>
        </span>
        <span className="muted">First to {FIRST_TO}</span>
        <span>
          MyAgent <strong>{score.myagent}</strong>
        </span>
      </div>
      <p className="game-status" aria-live="polite">
        {status}
      </p>

      <div className="rps-face-off" aria-hidden={!round}>
        <div className="rps-slot" data-result={round?.result === "win" ? "win" : undefined}>
          {round ? <HandIcon hand={round.you} /> : <span className="rps-q">?</span>}
          <small>You</small>
        </div>
        <span className="rps-vs">vs</span>
        <div className="rps-slot" data-result={round?.result === "lose" ? "win" : undefined}>
          {round ? <HandIcon hand={round.myagent} /> : <span className="rps-q">?</span>}
          <small>MyAgent</small>
        </div>
      </div>

      {matchOver ? (
        <button className="btn-primary" onClick={again}>
          Play again
        </button>
      ) : (
        <div className="rps-choices">
          {HANDS.map((h) => (
            <button key={h} className="rps-choice" onClick={() => throwHand(h)} disabled={count !== null}>
              <HandIcon hand={h} />
              {h[0].toUpperCase() + h.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
