import { Cloud, Coffee, Gamepad2, Heart, Moon, Music, Star, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sfx";
import { gameMoment, gameOver } from "../lib/store";

const ICONS: { id: string; Icon: LucideIcon; color: string }[] = [
  { id: "star", Icon: Star, color: "#FFD66B" },
  { id: "heart", Icon: Heart, color: "#FFA8C5" },
  { id: "moon", Icon: Moon, color: "#C8B6FF" },
  { id: "music", Icon: Music, color: "#7EF2CF" },
  { id: "coffee", Icon: Coffee, color: "#FF8A7A" },
  { id: "game", Icon: Gamepad2, color: "#A9B4F5" },
  { id: "cloud", Icon: Cloud, color: "#BFE3FF" },
  { id: "zap", Icon: Zap, color: "#FFD66B" },
];
const PAIRS = 6;

type Card = { key: number; id: string; open: boolean; matched: boolean };

function deal(): Card[] {
  const chosen = [...ICONS].sort(() => Math.random() - 0.5).slice(0, PAIRS);
  return [...chosen, ...chosen]
    .map((c, i) => ({ key: i, id: c.id, open: false, matched: false }))
    .sort(() => Math.random() - 0.5);
}

export function Memory() {
  const [cards, setCards] = useState<Card[]>(deal);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const reported = useRef(false);

  const done = cards.every((c) => c.matched);

  useEffect(() => {
    if (done && !reported.current) {
      reported.current = true;
      gameOver("memory", "win");
    }
  }, [done]);

  const flip = (key: number) => {
    if (busy) return;
    const card = cards.find((c) => c.key === key);
    if (!card || card.open || card.matched) return;
    sfx.play("tick");
    const next = cards.map((c) => (c.key === key ? { ...c, open: true } : c));
    const open = next.filter((c) => c.open && !c.matched);
    setCards(next);
    if (open.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = open;
    if (a.id === b.id) {
      gameMoment("nice");
      setCards(next.map((c) => (c.id === a.id ? { ...c, matched: true, open: false } : c)));
    } else {
      setBusy(true);
      setTimeout(() => {
        setCards((cs) => cs.map((c) => (c.matched ? c : { ...c, open: false })));
        setBusy(false);
      }, 750);
    }
  };

  const again = () => {
    reported.current = false;
    setCards(deal());
    setMoves(0);
  };

  const found = cards.filter((c) => c.matched).length / 2;

  return (
    <div className="game memory">
      <div className="game-score" aria-label="Progress">
        <span>
          Pairs <strong>{found}</strong>/{PAIRS}
        </span>
        <span>
          Moves <strong>{moves}</strong>
        </span>
      </div>
      <p className="game-status" aria-live="polite">
        {done ? `All pairs in ${moves} moves!` : "Find all the matching pairs"}
      </p>
      <div className="memory-grid">
        {cards.map((c) => {
          const icon = ICONS.find((i) => i.id === c.id)!;
          const shown = c.open || c.matched;
          return (
            <button
              key={c.key}
              className="memory-card"
              data-shown={shown}
              data-matched={c.matched}
              onClick={() => flip(c.key)}
              aria-label={shown ? icon.id : "Hidden card"}
            >
              <span className="memory-inner">
                <span className="memory-back" aria-hidden />
                <span className="memory-front" style={{ background: icon.color }} aria-hidden>
                  <icon.Icon size={30} strokeWidth={2.5} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {done && (
        <button className="btn-primary" onClick={again}>
          Play again
        </button>
      )}
    </div>
  );
}
