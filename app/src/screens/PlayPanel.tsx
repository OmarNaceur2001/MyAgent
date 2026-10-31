import { Brain, Grid3x3, Hand, Music } from "lucide-react";
import { GAME_INFO } from "../games/GameStage";
import type { GameId } from "../lib/events";
import { openGame, sayToMimo, useMimo } from "../lib/store";

const ICON: Record<GameId, typeof Grid3x3> = { tictactoe: Grid3x3, rps: Hand, memory: Brain };
const SONG_IDEAS = ["lofi hip hop", "relaxing piano", "upbeat study music"];

export function PlayPanel() {
  const game = useMimo((s) => s.game);
  const coins = useMimo((s) => s.stats.coins);
  const music = useMimo((s) => (s.music && s.music.until > s.now ? s.music.title : null));

  return (
    <div className="panel-body">
      <header className="panel-head">
        <h2>Play</h2>
        <p className="muted">Wins earn coins. You have {coins}.</p>
      </header>

      <div className="game-list">
        {(Object.keys(GAME_INFO) as GameId[]).map((id) => {
          const Icon = ICON[id];
          return (
            <button key={id} className="game-pick" aria-pressed={game === id} onClick={() => openGame(id)}>
              <span className="game-pick-icon" aria-hidden>
                <Icon size={28} strokeWidth={2.5} />
              </span>
              <span>
                <strong>{GAME_INFO[id].name}</strong>
                <span>{GAME_INFO[id].blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="sub">
        <Music size={16} strokeWidth={2.5} /> Music
      </h3>
      {music && <p className="now-playing">Now playing: {music}</p>}
      <p className="muted" style={{ margin: "-6px 0 0" }}>
        Say “play” and a song name. It opens on YouTube in your browser.
      </p>
      <div className="quick-row">
        {SONG_IDEAS.map((s) => (
          <button key={s} className="chip" onClick={() => sayToMimo(`play ${s}`)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
