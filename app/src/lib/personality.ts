// MIMO's voice: curious, a little dramatic, warmly supportive, often sleepy.
// Lines are grouped by situation. pick() never repeats the last few lines,
// so MIMO doesn't sound like a broken record.
//
// Rules for writing lines: short (fits a bubble), friendly, never guilt-trips,
// never pretends to have done something it didn't do.

export const LINES = {
  greetMorning: ["Morning! I saved you a seat.", "Good morning! Let's make today a good one.", "You're up! I'm up. We're both up."],
  greetAfternoon: ["Hey there! What are we doing today?", "Afternoon! I've been very productive. I blinked a lot.", "Oh hi! Perfect timing."],
  greetEvening: ["Good evening! Cozy mode activated.", "Evening! Let's finish strong.", "Hi! The lamp's on, I'm ready."],
  greetLate: ["It's really late… but okay, I'm here.", "Night owl mode? I'll keep you company.", "Shh, everyone else is asleep. Hi!"],
  welcomeBack: ["You're back! I missed you a little.", "Welcome back! I kept your spot warm.", "Oh! There you are."],
  poke: ["Hehe, that tickles!", "Boop!", "Hi! Did you need something?", "I'm awake, I promise.", "Careful, I'm delicate. Kind of."],
  pokeMany: ["Okay okay! I'm paying attention!", "Are you testing my buttons? Literally?", "That's a lot of pokes."],
  wokenUp: ["Huh? I wasn't sleeping!", "Whoa! I was just… resting my screen.", "I'm up! What did I miss?"],
  idleChatter: ["*hums a little tune*", "I wonder what clouds feel like.", "Just vibing over here.", "Need anything? I'm good at timers."],
  lateNight: ["Don't forget to sleep, okay?", "My eyes are getting heavy…", "Maybe one more thing, then bed?"],
  focusStart: ["Glasses on. Let's focus.", "Focus time! I'll be very quiet.", "Okay, heads down. You've got this."],
  focusDone: ["Focus done! +10 coins. Break time!", "You did it! Stretch a little.", "Session complete! I'm proud of us."],
  longBreak: ["Four sessions! Take a real break, you earned it.", "That's a full cycle! Go get some air."],
  timerDone: ["Ding! Your timer is done.", "Time's up!", "Beep beep! That's the timer."],
  breakOver: ["Break's over. Ready for another round?", "Back to it? I'm ready when you are."],
  offline: ["My brain isn't connected yet… start the agent and I'll wake up."],
  mimoWins: ["Ha! I win! Again?", "Victory is mine! Want a rematch?", "Yesss! Did you let me win?"],
  youWin: ["Nooo! You got me. Rematch?", "Okay, you're good. Too good.", "You won?! I demand a rematch!"],
  draw: ["A draw! We're both geniuses.", "Nobody wins! Again?"],
  mimoTurn: ["Hmm… my turn.", "Let me think…", "Ooh, I know!"],
  memoryMatch: ["A pair!", "Nice!", "You found one!"],
  memoryDone: ["All pairs! Your memory is amazing.", "Done! That was fast!"],
  music: ["Ooh, I love this one!", "Dance time!", "Turn it up!"],
} as const;

export type Situation = keyof typeof LINES;

const recent: string[] = [];

export function pick(situation: Situation): string {
  const pool = LINES[situation] as readonly string[];
  const fresh = pool.filter((l) => !recent.includes(l));
  const options = fresh.length ? fresh : pool;
  const line = options[Math.floor(Math.random() * options.length)];
  recent.push(line);
  if (recent.length > 6) recent.shift();
  return line;
}

export function greetingFor(hour: number): Situation {
  if (hour < 5) return "greetLate";
  if (hour < 12) return "greetMorning";
  if (hour < 18) return "greetAfternoon";
  return "greetEvening";
}

export const isLateNight = (hour = new Date().getHours()) => hour >= 0 && hour < 5;
