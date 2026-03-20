#!/usr/bin/env node
"use strict";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ─── ANSI ─────────────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
};

const paint = (code, t) => `${code}${t}${C.reset}`;
const bold = t => paint(C.bold, t);
const dim = t => paint(C.dim, t);
const cyan = t => paint(C.brightCyan, t);
const yellow = t => paint(C.brightYellow, t);
const green = t => paint(C.brightGreen, t);
const red = t => paint(C.brightRed, t);
const gray = t => paint(C.gray, t);

// ─── TERMINAL ─────────────────────────────────────────────────────────────────
const W = () => Math.min(process.stdout.columns || 80, 100);
const clear = () => process.stdout.write("\x1b[2J\x1b[H");

const hr = (ch = "─", color = C.gray) => paint(color, ch.repeat(W()));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function center(text, width) {
  const raw = text.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, Math.floor((width - raw.length) / 2));
  return " ".repeat(pad) + text;
}

function wrap(text, indent = 2, width = null) {
  const w = (width || W()) - indent;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > w) { lines.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines.map(l => " ".repeat(indent) + l).join("\n");
}

async function typewrite(text, delay = 16) {
  for (const ch of text) {
    process.stdout.write(ch);
    if (ch !== " " && Math.random() > 0.3) await sleep(delay);
  }
  process.stdout.write("\n");
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

// ─── STATE ───────────────────────────────────────────────────────────────────
const SAVE = path.join(__dirname, ".save.json");

function loadState() {
  try { return JSON.parse(fs.readFileSync(SAVE, "utf8")); }
  catch { return { solved: {}, score: 0, hintsUsed: {}, startedAt: Date.now() }; }
}

function saveState(s) {
  fs.writeFileSync(SAVE, JSON.stringify(s, null, 2));
}

// ─── DATA ────────────────────────────────────────────────────────────────────
// challenges.js now exports PLANETS[], each with challenges[]
const PLANETS = require("./challenges.js");

// Flatten all challenges for totals / progress counting
const ALL_CHALLENGES = PLANETS.flatMap(p => p.challenges);
const TOTAL_POINTS = ALL_CHALLENGES.reduce((s, c) => s + c.points, 0);
const TOTAL_CHALLENGES = ALL_CHALLENGES.length;

// ─── DIFFICULTY BADGE ────────────────────────────────────────────────────────
function diffBadge(d) {
  const map = {
    easy: paint(C.brightGreen, " EASY   "),
    medium: paint(C.brightYellow, " MEDIUM "),
    hard: paint(C.brightRed, " HARD   "),
    expert: paint(C.brightMagenta, " EXPERT "),
  };
  return map[d] || d;
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────
function countSolved(state) {
  return ALL_CHALLENGES.filter(c => state.solved[c.id]).length;
}

function progressBar(state) {
  const solved = countSolved(state);
  const w = Math.min(W() - 36, 36);
  const filled = Math.round((solved / TOTAL_CHALLENGES) * w);
  const bar = paint(C.brightCyan, "█".repeat(filled)) + paint(C.gray, "░".repeat(w - filled));
  const pct = Math.round((solved / TOTAL_CHALLENGES) * 100);
  return `  ${bar}  ${paint(C.brightWhite, solved + "/" + TOTAL_CHALLENGES)} challenges  ${paint(C.brightYellow, state.score + "pts")}  ${gray(pct + "%")}`;
}

function printStatus(state) {
  console.log();
  console.log(progressBar(state));
  // Show planet-level summary
  for (const planet of PLANETS) {
    const total = planet.challenges.length;
    const done = planet.challenges.filter(c => state.solved[c.id]).length;
    const status = done === total
      ? paint(planet.color, "✦ complete")
      : done > 0
        ? paint(C.brightYellow, `${done}/${total} done`)
        : paint(C.gray, "locked");
    console.log(`  ${planet.icon}  ${paint(planet.color, planet.name.padEnd(14))}  ${status}`);
  }
  console.log();
}

// ─── WARP ANIMATION ──────────────────────────────────────────────────────────
async function warpAnimation(fromName, toName, toColor) {
  const w = W();
  const frames = [
    ["      ·  ·  ·  ·  ·       ", "    ·              ·      ", "  ·                  ·    "],
    ["     ──  ──  ──  ──       ", "   ──                ──   ", " ──                    ── "],
    ["    ════════════════      ", "  ══                  ══  ", "══                      ══"],
    ["   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     ", " ▓▓▓                ▓▓▓   ", "▓▓▓                   ▓▓▓ "],
    ["  ████████████████████    ", " ██                  ██   ", "██    ················  ██"],
    ["  ████████████████████    ", " ██    ············  ██   ", "██   · · · · · · · ·  ██  "],
    ["   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     ", " ▓▓▓                ▓▓▓   ", "▓▓▓                   ▓▓▓ "],
    ["    ════════════════      ", "  ══                  ══  ", "══                      ══"],
    ["     ──  ──  ──  ──       ", "   ──                ──   ", " ──                    ── "],
    ["      ·  ·  ·  ·  ·       ", "    ·              ·      ", "  ·                  ·    "],
  ];

  clear();
  console.log();
  console.log(center(gray("INITIATING WARP DRIVE"), w));
  console.log(center(gray(`${fromName}  ──▶  ${toName}`), w));
  console.log();

  for (const frame of frames) {
    if (frames.indexOf(frame) > 0) process.stdout.write("\x1b[3A");
    for (const line of frame) console.log(center(paint(toColor, line), w));
    await sleep(80);
  }

  await sleep(100);
  console.log();
  const speedLines = [
    "  · · · · · · · ════════════════════════ · · · ▶",
    "  · · · · ═══════════════════════════════ · · · ▶",
    "  · ════════════════════════════════════════ · · ▶",
    "  ══════════════════════════════════════════════ ▶",
  ];
  for (const line of speedLines) {
    console.log(center(paint(toColor + C.bold, line), w));
    await sleep(55);
  }
  await sleep(200);
  clear();
}

// ─── PLANET LANDING SCREEN ───────────────────────────────────────────────────
async function planetLanding(planet, planetIdx, state) {
  const w = W();
  const totalOnPlanet = planet.challenges.length;
  const doneOnPlanet = planet.challenges.filter(c => state.solved[c.id]).length;

  console.log(paint(planet.color, "▄".repeat(w)));
  await sleep(40);
  console.log(paint(planet.color + C.bold, "█".repeat(w)));
  await sleep(40);

  const label = `  PLANET ${planetIdx + 1} OF ${PLANETS.length}  ·  ${planet.system}  ·  ${totalOnPlanet} challenge${totalOnPlanet > 1 ? "s" : ""}  `;
  console.log(center(paint(planet.color, label), w));
  await sleep(60);

  console.log(center(paint(planet.color + C.bold, `${planet.icon}   ${planet.name.toUpperCase()}   ${planet.icon}`), w));
  await sleep(80);

  console.log(paint(planet.color + C.bold, "█".repeat(w)));
  await sleep(40);
  console.log(paint(planet.color, "▀".repeat(w)));
  await sleep(60);

  console.log();
  process.stdout.write(paint(C.gray, "  ▶ INCOMING TRANSMISSION: "));
  await typewrite(paint(C.dim, planet.flavour), 11);
  console.log();
  await sleep(200);

  // Show challenge list for this planet
  console.log(gray(`  ${totalOnPlanet} challenge${totalOnPlanet > 1 ? "s" : ""} on this planet:`));
  for (let i = 0; i < planet.challenges.length; i++) {
    const ch = planet.challenges[i];
    const done = state.solved[ch.id];
    const num = paint(C.gray, `  [${i + 1}]`);
    const tick = done ? green("✔") : paint(C.gray, "○");
    console.log(`${num} ${tick}  ${done ? gray(ch.title) : paint(C.brightWhite, ch.title)}  ${diffBadge(ch.difficulty)}  ${gray("+" + ch.points + "pts")}`);
  }
  console.log();
  await sleep(200);
}

// ─── CHALLENGE CLEARED ───────────────────────────────────────────────────────
async function challengeCleared(planet, ch, isLastOnPlanet) {
  const w = W();
  await sleep(300);
  console.log();

  if (isLastOnPlanet) {
    // Full launch sequence — leaving the planet
    const frames = [
      "       [■■■■■■■■■■]  LAUNCH READY",
      "       [▓▓▓▓▓▓▓▓░░]  CHARGING   ",
      "       [▓▓▓▓▓▓░░░░]  ENGINES HOT",
      "       [▓▓▓▓░░░░░░]  T-MINUS 3  ",
      "       [▓▓░░░░░░░░]  T-MINUS 2  ",
      "       [▓░░░░░░░░░]  T-MINUS 1  ",
      "       [░░░░░░░░░░]  LIFTOFF  🚀 ",
    ];
    for (const frame of frames) {
      process.stdout.write("\r" + paint(planet.color, frame) + "   ");
      await sleep(90);
    }
    process.stdout.write("\r" + " ".repeat(55) + "\r");
    console.log();
    console.log(center(paint(planet.color + C.bold, `  ✦  ${planet.name.toUpperCase()} CLEARED  ✦  `), w));
  } else {
    // Quieter — just advancing to the next challenge on the same planet
    console.log(center(paint(planet.color, `  ✔  "${ch.title}" solved — next challenge unlocked  `), w));
  }

  console.log();
  await sleep(500);
}

// ─── RENDER CHALLENGE ────────────────────────────────────────────────────────
function renderChallenge(ch, planet, chIdxOnPlanet, totalOnPlanet, state) {
  const w = W();
  const hintsRevealed = state.hintsUsed[ch.id] || 0;

  console.log();
  console.log(hr("─", planet.color));
  console.log();

  // Header: challenge N of M on this planet
  const chLabel = totalOnPlanet > 1
    ? gray(`  challenge ${chIdxOnPlanet + 1}/${totalOnPlanet} on ${planet.name}  ·  `)
    : gray(`  ${planet.name}  ·  `);
  console.log(`  ${bold(ch.title)}  ${diffBadge(ch.difficulty)}  ${gray("+" + ch.points + "pts")}`);
  console.log(chLabel + gray(ch.category));
  console.log();

  // Description
  for (const line of ch.description.split("\n")) {
    if (line.trim() === "") { console.log(); continue; }
    if (line.startsWith("  ") || line.match(/[│┌┐└┘├┤┼─║╔╗╚╝═╠╣╦╩╬]/)) {
      console.log(paint(C.brightCyan, line));
    } else {
      console.log(wrap(line, 2, w));
    }
  }
  console.log();

  // Examples
  if (ch.examples && ch.examples.length > 0) {
    console.log(gray("  ┌─ example " + "─".repeat(Math.max(0, w - 14))));
    for (const ex of ch.examples) {
      if (ex.input !== undefined) console.log(`  ${gray("│")} ${gray("in:")}  ${cyan(String(ex.input))}`);
      console.log(`  ${gray("│")} ${gray("out:")} ${green(String(ex.output))}`);
      if (ex.explanation) console.log(`  ${gray("│")} ${gray(ex.explanation)}`);
    }
    console.log(gray("  └" + "─".repeat(w - 3)));
    console.log();
  }

  // Already-revealed hints
  if (hintsRevealed > 0) {
    for (let i = 0; i < hintsRevealed && i < ch.hints.length; i++) {
      console.log(`  ${yellow("◈")} ${paint(C.yellow, ch.hints[i])}`);
    }
    console.log();
  }
}

// ─── COMMANDS ────────────────────────────────────────────────────────────────
function printCommands(ch, hintsLeft, alreadySolved) {
  const hintCost = Math.floor(ch.points * 0.1);
  const cmds = [
    cyan("answer") + gray(" (or just type it)"),
    yellow("scan") + gray(` (${hintsLeft} left, -${hintCost}pts)`),
    gray("skip"),
    gray("status"),
    gray("quit"),
  ];
  if (alreadySolved) cmds.unshift(green("next") + gray(" — already solved!"));
  console.log();
  console.log(gray("  nav: ") + cmds.join(gray("  ·  ")));
  console.log();
}

// ─── RUN ONE CHALLENGE ───────────────────────────────────────────────────────
// Returns: "solved" | "skip" | "quit"
async function runChallenge(ch, planet, chIdxOnPlanet, totalOnPlanet, state) {
  renderChallenge(ch, planet, chIdxOnPlanet, totalOnPlanet, state);

  const alreadySolved = !!state.solved[ch.id];
  if (alreadySolved) {
    console.log(green("  ✔  Already in your mission log."));
    console.log();
  }

  let hintsUsed = state.hintsUsed[ch.id] || 0;

  while (true) {
    const hintsLeft = ch.hints.length - hintsUsed;
    printCommands(ch, hintsLeft, alreadySolved);

    const raw = await prompt(paint(planet.color + C.bold, "  ❯ "));
    const input = raw.trim();
    const lower = input.toLowerCase();

    if (lower === "quit" || lower === "q" || lower === "exit") {
      console.log(); console.log(gray("  Mission state saved. Safe travels.")); console.log();
      process.exit(0);
    }

    if (lower === "status" || lower === "st") {
      printStatus(state);
      continue;
    }

    if (lower === "skip") {
      console.log();
      console.log(yellow("  ⤷  Skipping challenge...") + gray(" (logged in mission log)"));
      await sleep(600);
      return "skip";
    }

    if ((lower === "next" || lower === "n") && alreadySolved) {
      return "solved";
    }

    if (lower === "scan" || lower === "hint" || lower === "h") {
      if (hintsUsed < ch.hints.length) {
        hintsUsed++;
        state.hintsUsed[ch.id] = hintsUsed;
        saveState(state);
        console.log();
        console.log(`  ${yellow("◈  SCAN RESULT:")} ${paint(C.yellow, ch.hints[hintsUsed - 1])}`);
        console.log(gray(`     (scan ${hintsUsed}/${ch.hints.length} — -${Math.floor(ch.points * 0.1)}pts)`));
        console.log();
      } else {
        console.log(); console.log(gray("  No further scan data available.")); console.log();
      }
      continue;
    }

    let answerText = input;
    if (lower === "answer" || lower === "a") {
      answerText = await prompt(paint(C.brightWhite + C.bold, "  Transmit answer: "));
    }

    if (!answerText) continue;

    const result = await ch.validator(answerText);
    console.log();

    if (result.ok) {
      console.log(paint(C.bgGreen + C.bold + C.brightWhite, "  ✓  SIGNAL CONFIRMED  "));
      console.log();
      if (result.message) console.log(`  ${green(result.message)}`);
      console.log();

      if (!state.solved[ch.id]) {
        const deduction = hintsUsed * Math.floor(ch.points * 0.1);
        const earned = Math.max(1, ch.points - deduction);
        state.solved[ch.id] = { solvedAt: Date.now(), earned, hintsUsed };
        state.hintsUsed[ch.id] = hintsUsed;
        state.score += earned;
        saveState(state);
        console.log(
          `  ${yellow("★  +" + earned + " credits")}` +
          (deduction > 0 ? gray(` (${deduction}cr scan deduction)`) : "")
        );
        console.log();
      } else {
        console.log(gray("  (already logged — no credits added)")); console.log();
      }

      return "solved";
    } else {
      console.log(paint(C.bgRed + C.bold + C.brightWhite, "  ✗  SIGNAL REJECTED  "));
      if (result.message) console.log(`\n  ${red(result.message)}`);
      console.log();
    }
  }
}

// ─── RUN ONE PLANET ──────────────────────────────────────────────────────────
// Runs all challenges on the planet in order.
// Returns "cleared" when all are solved, "skip" if player skips the planet.
async function runPlanet(planet, planetIdx, state, fromName) {
  await warpAnimation(fromName || "Deep Space", planet.name, planet.color);
  await planetLanding(planet, planetIdx, state);

  // Find the first unsolved challenge on this planet
  let chIdx = planet.challenges.findIndex(c => !state.solved[c.id]);
  if (chIdx === -1) chIdx = 0; // all done — start from top for review

  const total = planet.challenges.length;

  while (chIdx < total) {
    const ch = planet.challenges[chIdx];
    const isLast = chIdx === total - 1;
    const allDoneAfter = () => planet.challenges.every(c => state.solved[c.id]);

    const result = await runChallenge(ch, planet, chIdx, total, state);

    if (result === "solved") {
      const isLastOnPlanet = allDoneAfter();
      await challengeCleared(planet, ch, isLastOnPlanet);

      if (isLastOnPlanet) return "cleared";

      // Advance to next unsolved on this planet
      const next = planet.challenges.findIndex(c => !state.solved[c.id]);
      if (next === -1) return "cleared";
      chIdx = next;

    } else if (result === "skip") {
      // Skip this individual challenge, move to next on planet
      chIdx++;
      if (chIdx >= total) {
        // Skipped the last challenge on the planet
        console.log(yellow("  ⤷  All challenges on this planet bypassed."));
        await sleep(700);
        return "skip";
      }
    }
  }

  return "cleared";
}

// ─── TITLE SCREEN ────────────────────────────────────────────────────────────
async function titleScreen() {
  clear();
  const w = W();
  await sleep(80);

  let stars = "";
  for (let j = 0; j < w; j++) stars += Math.random() < 0.04 ? (Math.random() < 0.3 ? "✦" : "·") : " ";
  for (let i = 0; i < 3; i++) { console.log(paint(C.gray, stars)); await sleep(30); }

  const art = [
    paint(C.brightCyan + C.bold,
      "██╗  ██╗ ██████╗ ██╗ ██╗  █████╗  ██████╗ ███████╗██████╗ "),
    paint(C.cyan,
      "██║  ██║██╔═══██╗╚██╗██╔╝██╔══██╗██╔════╝ ██╔════╝██╔══██╗"),
    paint(C.brightCyan,
      "██║  ██║██║   ██║ ╚███╔╝ ███████║██║  ███╗█████╗  ██████╔╝"),
    paint(C.cyan,
      "╚██╗██╔╝██║   ██║  ██╔╝  ██╔══██║██║   ██║██╔══╝  ██╔══██╗"),
    paint(C.brightCyan + C.bold,
      " ╚████╔╝╚██████╔╝  ██║   ██║  ██║╚██████╔╝███████╗██║  ██║"),
    paint(C.gray,
      "  ╚══╝   ╚═════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝"),
  ];

  console.log();
  for (const line of art) { console.log(center(line, w)); await sleep(45); }
  console.log();
  console.log(center(paint(C.brightMagenta + C.bold, "G A L A X Y   M I S S I O N"), w));
  console.log(center(gray(`${PLANETS.length} planets  ·  ${TOTAL_CHALLENGES} challenges  ·  sequential`), w));
  console.log();
  console.log(hr("─", C.gray));
}

// ─── MISSION BRIEFING ────────────────────────────────────────────────────────
async function missionBriefing() {
  const w = W();
  console.log();
  await typewrite(paint(C.dim, "  Your ship's comms crackle to life."), 14);
  await sleep(150);
  await typewrite(paint(C.dim, "  A transmission arrives from Mission Control:"), 14);
  await sleep(350);
  console.log();

  console.log(paint(C.brightCyan, "  ┌" + "─".repeat(w - 4) + "┐"));
  const lines = [
    `  MISSION: GALAXY TRAVERSE — ${PLANETS.length} PLANETS, ${TOTAL_CHALLENGES} CHALLENGES`,
    "",
    "  Agent, you are being deployed across multiple star systems.",
    "  Each planet holds one or more computational locks.",
    "  Solve every challenge on a planet to charge the warp drive",
    "  and jump to the next destination.",
    "",
    "  Planetary scanners can assist — but drain your credits.",
    "  Planets must be visited in sequence.",
    "  There is no turning back.",
    "",
    "  Complete the mission. Reach Sol Prime.",
    "                        — Mission Control",
  ];
  for (const l of lines) {
    console.log(paint(C.brightCyan, "  │") + "  " + paint(C.brightWhite, l));
    await sleep(55);
  }
  console.log(paint(C.brightCyan, "  └" + "─".repeat(w - 4) + "┘"));
  console.log();
  await sleep(400);
}

// ─── RESUME SCREEN ───────────────────────────────────────────────────────────
async function resumeScreen(state) {
  console.log();
  console.log(paint(C.brightGreen, "  ◉  MISSION LOG FOUND"));
  console.log();
  console.log(progressBar(state));
  console.log();

  // Find current planet
  const curPlanetIdx = PLANETS.findIndex(p => p.challenges.some(c => !state.solved[c.id]));
  const cur = PLANETS[curPlanetIdx === -1 ? PLANETS.length - 1 : curPlanetIdx];
  console.log(gray(`  Current destination: ${cur.icon} ${cur.name}  (${cur.system})`));
  console.log();

  const choice = await prompt(
    `  ${cyan("c")} ${gray("continue")}    ${cyan("r")} ${gray("restart")}    ${cyan("q")} ${gray("quit")}  ❯ `
  );

  if (choice === "r" || choice === "restart") {
    const confirm = await prompt(gray("  Erase ALL mission data? Type RESET to confirm: "));
    if (confirm === "RESET") {
      const fresh = { solved: {}, score: 0, hintsUsed: {}, startedAt: Date.now() };
      saveState(fresh);
      return fresh;
    }
  }
  if (choice === "q" || choice === "quit") process.exit(0);
  return state;
}

// ─── VICTORY SCREEN ──────────────────────────────────────────────────────────
async function victoryScreen(state) {
  clear();
  const w = W();
  const elapsed = Math.round((Date.now() - state.startedAt) / 1000 / 60);
  await sleep(200);
  console.log();
  console.log(hr("═", C.brightYellow));
  console.log();

  const rocket = [
    "           /\\          ",
    "          /  \\         ",
    "         |    |        ",
    "         |    |        ",
    "        /|    |\\       ",
    "       / |    | \\      ",
    "      /  |    |  \\     ",
    "     | __|    |__ |    ",
    "     |/          \\|   ",
    "      \\    /\\    /    ",
    "       \\  /  \\  /     ",
    "        \\/    \\/      ",
    "        | |  | |       ",
    "       /   \\/  \\      ",
    "      /  flames  \\     ",
    "     /             \\   ",
  ];
  for (const line of rocket) { console.log(center(paint(C.brightYellow, line), w)); await sleep(35); }

  console.log();
  console.log(center(paint(C.brightYellow + C.bold, "M I S S I O N   C O M P L E T E"), w));
  console.log();
  console.log(center(paint(C.brightCyan, `All ${PLANETS.length} planets, all ${TOTAL_CHALLENGES} challenges conquered.`), w));
  console.log();
  console.log(hr("─", C.gray));
  console.log();
  console.log(center(
    paint(C.brightWhite + C.bold, "Final Score: ") + yellow(state.score + " / " + TOTAL_POINTS + " credits"),
    w
  ));
  console.log(center(gray(`Mission duration: ~${elapsed} minutes`), w));
  console.log();

  const totalScans = Object.values(state.hintsUsed).reduce((a, b) => a + b, 0);
  const perfectSolves = ALL_CHALLENGES.filter(c => !state.hintsUsed[c.id]).length;
  console.log(center(gray(`Scans used: ${totalScans}   ·   Unassisted solves: ${perfectSolves}`), w));
  console.log();
  console.log(hr("═", C.brightYellow));
  console.log();

  await prompt(gray("  Press Enter to return to Earth..."));
  process.exit(0);
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
async function main() {
  let state = loadState();
  const fresh = !state.solved || Object.keys(state.solved).length === 0;

  await titleScreen();

  if (fresh) {
    await missionBriefing();
    await prompt(gray("  Press Enter to initiate warp to Planet 1..."));
  } else {
    state = await resumeScreen(state);
  }

  // Find the first planet that still has unsolved challenges
  let planetIdx = PLANETS.findIndex(p => p.challenges.some(c => !state.solved[c.id]));
  if (planetIdx === -1) {
    await victoryScreen(state);
    return;
  }

  let fromName = "Deep Space";

  while (planetIdx < PLANETS.length) {
    const planet = PLANETS[planetIdx];
    const result = await runPlanet(planet, planetIdx, state, fromName);
    fromName = planet.name;

    if (result === "cleared") {
      if (planetIdx === PLANETS.length - 1) {
        await victoryScreen(state);
        return;
      }
      planetIdx++;
      const next = PLANETS[planetIdx];
      console.log();
      console.log(center(
        paint(next.color, `  Plotting course: ${next.icon}  ${next.name}  —  ${next.system}  `),
        W()
      ));
      console.log();
      await prompt(gray("  Press Enter to engage warp drive..."));

    } else if (result === "skip") {
      planetIdx++;
      if (planetIdx >= PLANETS.length) {
        console.log(yellow("  No more planets. Return to complete skipped challenges."));
        await sleep(1000);
        break;
      }
    }
  }

  // Check if everything's done after loop
  if (ALL_CHALLENGES.every(c => state.solved[c.id])) {
    await victoryScreen(state);
  }
}

main().catch(err => {
  console.error(red("\nCritical system failure: " + err.message));
  console.error(paint(C.gray, err.stack));
  process.exit(1);
});
