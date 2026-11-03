// MyAgent's tic-tac-toe brain. Pure functions, no UI, so it's easy to test.
// He plays well but not perfectly: perfect play makes the game unwinnable,
// which isn't fun. He always takes a winning move and usually blocks yours.

export type Cell = "X" | "O" | null;
export type Board = Cell[];

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winner(b: Board): { who: "X" | "O"; line: number[] } | null {
  for (const l of LINES) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a] as "X" | "O", line: l };
  }
  return null;
}

export const isFull = (b: Board) => b.every((c) => c !== null);
const empty = (b: Board) => b.flatMap((c, i) => (c ? [] : [i]));

function minimax(b: Board, turn: "X" | "O"): number {
  const w = winner(b);
  if (w) return w.who === "O" ? 10 : -10;
  if (isFull(b)) return 0;
  const scores = empty(b).map((i) => {
    const next = b.slice();
    next[i] = turn;
    return minimax(next, turn === "O" ? "X" : "O");
  });
  return turn === "O" ? Math.max(...scores) : Math.min(...scores);
}

function winningMove(b: Board, who: "X" | "O"): number | null {
  for (const i of empty(b)) {
    const next = b.slice();
    next[i] = who;
    if (winner(next)?.who === who) return i;
  }
  return null;
}

/** MyAgent plays "O". mistakeRate: chance he plays a random move instead of the best one. */
export function myAgentMove(b: Board, mistakeRate = 0.25, rand = Math.random): number {
  const moves = empty(b);
  if (!moves.length) return -1;
  const win = winningMove(b, "O");
  if (win !== null) return win; // never misses a win
  const block = winningMove(b, "X");
  if (block !== null && rand() > mistakeRate / 2) return block; // rarely misses a block
  if (rand() < mistakeRate) return moves[Math.floor(rand() * moves.length)];
  let best = moves[0];
  let bestScore = -Infinity;
  for (const i of moves) {
    const next = b.slice();
    next[i] = "O";
    const s = minimax(next, "X");
    if (s > bestScore) [best, bestScore] = [i, s];
  }
  return best;
}
