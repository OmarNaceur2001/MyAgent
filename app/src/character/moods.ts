// Every mood MIMO can show. The UI never picks a mood at random:
// moods are derived from real events (see lib/store.ts → moodFor).
export const MOODS = [
  "idle",
  "listening",
  "thinking",
  "working",
  "speaking",
  "happy",
  "excited",
  "confused",
  "sad",
  "sleepy",
  "celebrating",
  "focus",
] as const;

export type Mood = (typeof MOODS)[number];

export const MOOD_LABEL: Record<Mood, string> = {
  idle: "Hanging out",
  listening: "Listening",
  thinking: "Thinking",
  working: "Working on it",
  speaking: "Talking",
  happy: "Happy",
  excited: "Excited",
  confused: "Confused",
  sad: "A bit sad",
  sleepy: "Sleepy",
  celebrating: "Celebrating",
  focus: "Focus mode",
};
