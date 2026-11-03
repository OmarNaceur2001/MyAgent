import { BEATS, Character, MOODS, MOOD_LABEL } from "../character";
import { playBeat, useMyAgent } from "../lib/store";

// Developer page: every mood side by side. Open with ?view=gallery.
export function MoodGallery() {
  const beat = useMyAgent((s) => s.beat);
  return (
    <div style={{ padding: 32, display: "grid", gap: 24 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {BEATS.map((b) => (
        <button key={b} className="chip" onClick={() => playBeat(b)}>
          {b}
        </button>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
      {MOODS.map((m) => (
        <figure
          key={m}
          style={{
            margin: 0,
            background: "var(--paper)",
            border: "var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--pop)",
            padding: "24px 12px 12px",
            display: "grid",
            justifyItems: "center",
            gap: 8,
          }}
        >
          <Character mood={m} size={150} beat={beat} />
          <figcaption style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{MOOD_LABEL[m]}</figcaption>
        </figure>
      ))}
    </div>
    </div>
  );
}
