import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sfx";
import { gameMoment, gameOver } from "../lib/store";
import { isFull, mimoMove, winner, type Board } from "./ticTacToeAI";

const EMPTY: Board = Array(9).fill(null);

// You are X and go first; MIMO is O and "thinks" before each move.
export function TicTacToe() {
  const [board, setBoard] = useState<Board>(EMPTY);
  const [mimoTurn, setMimoTurn] = useState(false);
  const [score, setScore] = useState({ you: 0, mimo: 0, draw: 0 });
  const [round, setRound] = useState(1);
  const done = useRef(false);

  const result = winner(board);
  const over = !!result || isFull(board);

  // end of round: score + MIMO's reaction (once)
  useEffect(() => {
    if (!over || done.current) return;
    done.current = true;
    const outcome = result ? (result.who === "X" ? "win" : "lose") : "draw";
    setScore((s) => ({
      you: s.you + (outcome === "win" ? 1 : 0),
      mimo: s.mimo + (outcome === "lose" ? 1 : 0),
      draw: s.draw + (outcome === "draw" ? 1 : 0),
    }));
    gameOver("tictactoe", outcome);
  }, [over, result]);

  // MIMO's move, after a short "thinking" pause
  useEffect(() => {
    if (!mimoTurn || over) return;
    gameMoment("thinking");
    const t = setTimeout(() => {
      setBoard((b) => {
        const i = mimoMove(b);
        if (i < 0) return b;
        const next = b.slice();
        next[i] = "O";
        sfx.play("tick");
        return next;
      });
      setMimoTurn(false);
    }, 650 + Math.random() * 500);
    return () => clearTimeout(t);
  }, [mimoTurn, over]);

  const play = (i: number) => {
    if (board[i] || mimoTurn || over) return;
    const next = board.slice();
    next[i] = "X";
    sfx.play("tick");
    setBoard(next);
    if (!winner(next) && !isFull(next)) setMimoTurn(true);
  };

  const again = () => {
    done.current = false;
    setBoard(EMPTY);
    setRound((r) => r + 1);
    // take turns starting: MIMO opens every other round
    setMimoTurn(round % 2 === 1);
  };

  const status = result
    ? result.who === "X"
      ? "You win!"
      : "MIMO wins!"
    : over
      ? "It's a draw"
      : mimoTurn
        ? "MIMO is thinking…"
        : "Your turn";

  return (
    <div className="game ttt">
      <div className="game-score" aria-label="Score">
        <span>
          You <strong>{score.you}</strong>
        </span>
        <span className="muted">Draws {score.draw}</span>
        <span>
          MIMO <strong>{score.mimo}</strong>
        </span>
      </div>
      <p className="game-status" aria-live="polite">
        {status}
      </p>
      <div className="ttt-board" role="grid" aria-label="Tic-tac-toe board">
        {board.map((c, i) => (
          <button
            key={i}
            className="ttt-cell"
            data-mark={c ?? ""}
            data-win={result?.line.includes(i) ?? false}
            onClick={() => play(i)}
            disabled={!!c || mimoTurn || over}
            aria-label={`Square ${i + 1}${c ? `, ${c}` : ""}`}
          >
            {c === "X" && (
              <svg viewBox="0 0 40 40" aria-hidden>
                <path d="M10 10 L30 30 M30 10 L10 30" />
              </svg>
            )}
            {c === "O" && (
              <svg viewBox="0 0 40 40" aria-hidden>
                <circle cx="20" cy="20" r="11" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {over && (
        <button className="btn-primary" onClick={again}>
          Play again
        </button>
      )}
    </div>
  );
}
