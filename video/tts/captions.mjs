// Word timestamps for each narration line via whisper.cpp, in Remotion's Caption shape.
// Run inside video/: node tts/captions.mjs test
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { toCaptions } from "@remotion/install-whisper-cpp";

const name = process.argv[2] ?? "test";
const MODEL = process.env.WHISPER_MODEL ?? path.join(process.env.HOME, ".cache/whisper.cpp/ggml-large-v3-turbo.bin");
const manifest = JSON.parse(readFileSync(`src/generated/${name}.narration.json`, "utf8"));
const tmp = mkdtempSync(path.join(tmpdir(), "hm-captions-"));
const out = {};
for (const line of manifest) {
  const wav = path.join(tmp, `${line.id}.wav`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `public/${line.file}`, "-ar", "16000", "-ac", "1", wav]);
  const base = path.join(tmp, line.id);
  // The script text as prompt keeps the spelling of names ("happy map", "TTC") stable.
  execFileSync("whisper-cli", ["-m", MODEL, "-f", wav, "-l", "en", "-ojf", "-of", base, "-ml", "1", "-sow", "--dtw", "large.v3.turbo", "--prompt", line.text], { stdio: ["ignore", "ignore", "inherit"] });
  const { captions } = toCaptions({ whisperCppOutput: JSON.parse(readFileSync(`${base}.json`, "utf8")) });
  out[line.id] = captions;
  console.log(`${line.id.padStart(10)} ${captions.length} tokens: ${captions.map((c) => c.text).join("").trim().slice(0, 90)}`);
}
writeFileSync(`src/generated/${name}.captions.json`, JSON.stringify(out));
