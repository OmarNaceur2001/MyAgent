// Public entry point of the character layer.
// The rest of the app imports ONLY from here, never from skins/.
// To change MyAgent's design: add a folder in skins/ and change the line below.

export { OmarSkin as Character } from "./skins/omar/OmarSkin";

export { MOODS, MOOD_LABEL, type Mood } from "./moods";
export { BEATS, BEAT_MS, type Beat, type BeatCue, type CharacterProps, type Gaze } from "./types";
