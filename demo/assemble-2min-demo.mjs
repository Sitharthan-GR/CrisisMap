/**
 * Mux the 2-min Design demo video with Samantha narration.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const VIDEO =
  process.env.DEMO_2MIN_VIDEO ??
  "/Users/sidhu/Documents/Design/CrisisMap_demo_2min_updated_history_createform.mp4";
const NARRATION = join(OUTPUT_DIR, "narration-2min-samantha.wav");
const OUT_MP4 = join(
  OUTPUT_DIR,
  "CrisisMap_demo_2min_updated_history_createform_with_voiceover.mp4",
);
const OUT_DESIGN = join(
  "/Users/sidhu/Documents/Design",
  "CrisisMap_demo_2min_updated_history_createform_with_voiceover.mp4",
);

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
    console.error(`Missing video: ${VIDEO}`);
    process.exit(1);
  }
  if (!existsSync(NARRATION)) {
    console.error(`Missing ${NARRATION} — run node build-2min-voiceover.mjs first`);
    process.exit(1);
  }

  const videoDur = probeDuration(VIDEO);
  const audioDur = probeDuration(NARRATION);
  const targetDur = videoDur;
  console.log(
    `Muxing ${videoDur.toFixed(1)}s video + ${audioDur.toFixed(1)}s audio → ${targetDur.toFixed(1)}s`,
  );

  run(
    `ffmpeg -y -i "${VIDEO}" -i "${NARRATION}" ` +
      `-map 0:v:0 -map 1:a:0 ` +
      `-c:v copy -c:a aac -b:a 160k ` +
      `-t ${targetDur.toFixed(3)} ` +
      `"${OUT_MP4}"`,
  );

  try {
    run(`cp "${OUT_MP4}" "${OUT_DESIGN}"`);
    console.log(`  ${OUT_DESIGN}`);
  } catch {
    // Design folder copy optional
  }

  console.log(`\nFinal demo video:\n  ${OUT_MP4}`);
}

main();
