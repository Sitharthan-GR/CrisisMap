/**
 * Mux screen recording with voiceover into final MP4.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const VIDEO = join(OUTPUT_DIR, "crisismap-full-demo.webm");
const NARRATION = join(OUTPUT_DIR, "narration.wav");
const OUT_MP4 = join(OUTPUT_DIR, "crisismap-full-demo.mp4");
const OUT_WEBM = join(OUTPUT_DIR, "crisismap-full-demo-with-audio.webm");

const MAX_SECONDS = Number(process.env.DEMO_MAX_SECONDS ?? 118);

function probeDuration(file) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`,
    { encoding: "utf8" },
  );
  return parseFloat(out.trim());
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  if (!existsSync(VIDEO)) {
    console.error(`Missing ${VIDEO}`);
    process.exit(1);
  }
  if (!existsSync(NARRATION)) {
    console.error(`Missing ${NARRATION} — run npm run voiceover first`);
    process.exit(1);
  }

  const videoDur = probeDuration(VIDEO);
  const audioDur = probeDuration(NARRATION);
  const targetDur = Math.min(MAX_SECONDS, videoDur, audioDur);
  console.log(
    `Muxing ${videoDur.toFixed(1)}s video + ${audioDur.toFixed(1)}s audio → ${targetDur.toFixed(1)}s`,
  );

  run(
    `ffmpeg -y -i "${VIDEO}" -i "${NARRATION}" ` +
      `-map 0:v:0 -map 1:a:0 ` +
      `-c:v libx264 -pix_fmt yuv420p -preset medium -crf 23 ` +
      `-c:a aac -b:a 128k ` +
      `-t ${targetDur.toFixed(3)} ` +
      `"${OUT_MP4}"`,
  );

  console.log(`\nFinal demo video:\n  ${OUT_MP4}`);

  try {
    run(
      `ffmpeg -y -i "${VIDEO}" -i "${NARRATION}" ` +
        `-map 0:v:0 -map 1:a:0 -c:v copy -c:a libopus ` +
        `-t ${targetDur.toFixed(3)} "${OUT_WEBM}"`,
    );
    console.log(`  ${OUT_WEBM}`);
  } catch {
    // webm mux optional
  }
}

main();
