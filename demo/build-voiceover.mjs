/**
 * Generate voiceover audio from cues.json using macOS text-to-speech.
 * Uses sequential concat (low disk use) instead of amix filter.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const CUES_PATH = join(OUTPUT_DIR, "cues.json");
const VOICE = process.env.DEMO_VOICE ?? "Samantha";
const RATE = process.env.DEMO_SPEECH_RATE ?? "165";

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
    console.error(`Missing ${CUES_PATH} — run npm run record:full first`);
    process.exit(1);
  }

  const cues = JSON.parse(readFileSync(CUES_PATH, "utf8"));
  const audioDir = join(OUTPUT_DIR, "narration-clips");
  mkdirSync(audioDir, { recursive: true });

  const concatList = [];
  let timelineMs = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
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
    console.log(`TTS [${cue.id}] @ ${(cue.at_ms / 1000).toFixed(1)}s`);

    run(`say -v "${VOICE}" -r ${RATE} -o "${aiff}" "${escaped}"`);
    run(`ffmpeg -y -i "${aiff}" "${wav}" -loglevel error`);
    try {
      unlinkSync(aiff);
    } catch {
      // ignore
    }

    const duration = probeDuration(wav);
    concatList.push(wav);
    timelineMs += duration * 1000;
  }

  const listFile = join(OUTPUT_DIR, "narration-concat.txt");
  writeFileSync(
    listFile,
    concatList.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
  );

  const narrationWav = join(OUTPUT_DIR, "narration.wav");
  run(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${narrationWav}" -loglevel warning`,
  );

  console.log(`\nVoiceover: ${narrationWav}`);
}

main();
