import { useEffect, useState } from "react";
import { sfx } from "../lib/sfx";
import { setPref, useMyAgent } from "../lib/store";
import { Toggle } from "./Toggle";

// Voice & sound switches. Wake word and spoken replies live in the agent
// (they control the mic and speaker there); sound effects are per window.
export function VoiceSettings() {
  const prefs = useMyAgent((s) => s.prefs);
  const features = useMyAgent((s) => s.features);
  const [muted, setMuted] = useState(sfx.muted);
  useEffect(() => {
    const off = sfx.onChange(setMuted);
    return () => {
      off();
    };
  }, []);

  return (
    <section className="settings" aria-label="Voice and sound">
      <h3 className="sub">Voice and sound</h3>
      <Toggle
        label="“Hey MyAgent”"
        hint={features?.wake ? "Say his name to talk, no button needed" : "Needs the voice setup (see README)"}
        checked={!!prefs?.wake_word && !!features?.wake}
        disabled={!features?.wake || !prefs}
        onChange={(v) => setPref("wake_word", v)}
      />
      <Toggle
        label="Speak replies"
        hint={features?.tts ? "MyAgent answers out loud" : "Needs the voice setup (see README)"}
        checked={!!prefs?.speak_replies && !!features?.tts}
        disabled={!features?.tts || !prefs}
        onChange={(v) => setPref("speak_replies", v)}
      />
      <Toggle label="Sound effects" hint="Boops, clicks and jingles" checked={!muted} onChange={(v) => sfx.setMuted(!v)} />
      <p className="kbd-hint muted">
        <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> talk from anywhere · <kbd>Esc</kbd> stop
      </p>
    </section>
  );
}
