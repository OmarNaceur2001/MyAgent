import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { GameId } from "../lib/events";
import { closeGame, useMimo } from "../lib/store";
import { Memory } from "./Memory";
import { RockPaperScissors } from "./RockPaperScissors";
import { TicTacToe } from "./TicTacToe";
import "./games.css";

export const GAME_INFO: Record<GameId, { name: string; blurb: string }> = {
  tictactoe: { name: "Tic-tac-toe", blurb: "Three in a row. MIMO is good, but not perfect." },
  rps: { name: "Rock, paper, scissors", blurb: "First to two wins. He can't read your mind. Probably." },
  memory: { name: "Memory match", blurb: "Flip cards and find the pairs." },
};

// The game table: slides in next to MIMO on his stage.
export function GameStage() {
  const game = useMimo((s) => s.game);
  return (
    <AnimatePresence>
      {game && (
        <motion.section
          key={game}
          className="game-table"
          aria-label={GAME_INFO[game].name}
          initial={{ opacity: 0, x: 40, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        >
          <header className="game-head">
            <h2>{GAME_INFO[game].name}</h2>
            <button className="icon-btn soft" onClick={closeGame} aria-label="Close game">
              <X size={18} strokeWidth={3} />
            </button>
          </header>
          {game === "tictactoe" && <TicTacToe />}
          {game === "rps" && <RockPaperScissors />}
          {game === "memory" && <Memory />}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
