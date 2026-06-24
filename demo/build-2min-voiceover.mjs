/**
 * Generate Samantha TTS voiceover for the 2-min Design demo video.
 * Slower rate, brief script, auto-trims clips that exceed their section window.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const CUES_PATH = join(__dirname, "cues-2min.json");
const VOICE = process.env.DEMO_VOICE ?? "Samantha";
const RATE = process.env.DEMO_SPEECH_RATE ?? "120";
const VIDEO_END_MS = 120_000;

function run(cmd) {
  execSync(cmd, { stdio: "pipe" });
}

function probeDuration(file) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`,
    { encoding: "utf8" },
  );
  return parseFloat(out.trim());
}

function makeSilence(file, seconds) {
  if (seconds < 0.05) return;
  run(
    `ffmpeg -y -f lavfi -i anullsrc=r=22050:cl=mono -t ${seconds.toFixed(3)} "${file}" -loglevel error`,
  );
}

function main() {
  if (!existsSync(CUES_PATH)) {
    console.error(`Missing ${CUES_PATH}`);
    process.exit(1);
  }

  const cues = JSON.parse(readFileSync(CUES_PATH, "utf8"));
  const audioDir = join(OUTPUT_DIR, "narration-2min-clips");
  mkdirSync(audioDir, { recursive: true });

  const concatList = [];
  let timelineMs = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const nextAt = cues[i + 1]?.at_ms ?? VIDEO_END_MS;
    const windowSec = (nextAt - cue.at_ms) / 1000;

    const gapSec = Math.max(0, (cue.at_ms - timelineMs) / 1000);
    if (gapSec > 0.05) {
      const silence = join(audioDir, `silence-${String(i).padStart(2, "0")}.wav`);
      makeSilence(silence, gapSec);
      concatList.push(silence);
      timelineMs += gapSec * 1000;
    }

    const aiff = join(audioDir, `${String(i).padStart(2, "0")}-${cue.id}.aiff`);
    const wav = join(audioDir, `${String(i).padStart(2, "0")}-${cue.id}.wav`);
    const escaped = cue.text.replace(/"/g, '\\"');

    console.log(
      `TTS [${cue.id}] @ ${(cue.at_ms / 1000).toFixed(1)}s (window ${windowSec.toFixed(1)}s)`,
    );

    run(`say -v "${VOICE}" -r ${RATE} -o "${aiff}" "${escaped}"`);

    const rawDur = probeDuration(aiff);
    const tempo = rawDur > windowSec * 0.95 ? Math.min(1.4, rawDur / (windowSec * 0.9)) : 1;
    const af =
      tempo > 1.001
        ? `atempo=${tempo.toFixed(3)},highpass=f=90,lowpass=f=7500,loudnorm=I=-16:TP=-1.5:LRA=11`
        : "highpass=f=90,lowpass=f=7500,loudnorm=I=-16:TP=-1.5:LRA=11";

    run(`ffmpeg -y -i "${aiff}" -af "${af}" -ar 22050 -ac 1 "${wav}" -loglevel error`);
    try {
      unlinkSync(aiff);
    } catch {
      // ignore
    }

    const clipDur = probeDuration(wav);
    if (clipDur > windowSec) {
      console.warn(`  warn: clip ${clipDur.toFixed(1)}s in ${windowSec.toFixed(1)}s window`);
    }

    concatList.push(wav);
    timelineMs += clipDur * 1000;

    const padSec = Math.max(0, (nextAt - timelineMs) / 1000);
    if (padSec > 0.05) {
      const pad = join(audioDir, `pad-${String(i).padStart(2, "0")}.wav`);
      makeSilence(pad, padSec);
      concatList.push(pad);
      timelineMs += padSec * 1000;
    }
  }

  const listFile = join(OUTPUT_DIR, "narration-2min-concat.txt");
  writeFileSync(
    listFile,
    concatList.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
  );

  const narrationWav = join(OUTPUT_DIR, "narration-2min-samantha.wav");
  run(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -ar 22050 -ac 1 "${narrationWav}" -loglevel warning`,
  );

  console.log(`\nVoiceover: ${narrationWav} (${probeDuration(narrationWav).toFixed(1)}s)`);
}

main();
