"""Narration for the demo video: one WAV per script line, in the author's own voice.

Zero-shot cloning with Fish Audio S2 Pro running locally through mlx-audio. Nothing
leaves the machine. The reference recording lives outside the repo on purpose.

  .venv/bin/python synthesize.py ../script/test.json            # Fish Audio S2 Pro (default)
  .venv/bin/python synthesize.py ../script/x.json --model qwen --out x-qwen
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio
from scipy.io import wavfile

VIDEO = Path(__file__).resolve().parents[1]
# The reference clip and its transcript stay outside the repo: ~/.happy-map/voice-reference.wav
# (10-30 s of clean speech) and voice-reference.txt (exactly what is said in it).
REF = Path(os.environ.get("HM_VOICE_REF", "~/.happy-map/voice-reference.wav")).expanduser()
REF_TEXT = os.environ.get("HM_VOICE_REF_TEXT") or REF.with_suffix(".txt").read_text().strip()
PAD_S = 0.12      # silence kept around each line after trimming
TRIM_THRESHOLD = 0.02


def trim(audio: np.ndarray, sr: int) -> np.ndarray:
    loud = np.flatnonzero(np.abs(audio) > TRIM_THRESHOLD)
    if loud.size == 0:
        return audio
    pad = int(PAD_S * sr)
    a, b = max(0, loud[0] - pad), min(len(audio), loud[-1] + pad)
    return audio[a:b]


MODELS = {
    "fish": "mlx-community/fish-audio-s2-pro",
    "qwen": "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--model", choices=MODELS, default="fish")
    ap.add_argument("--out", help="output name (default: script stem)")
    ap.add_argument("--only", help="comma-separated line ids to (re)generate; others keep their existing audio")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    script = Path(args.script).resolve()
    name = args.out or script.stem
    lines = json.loads(script.read_text())
    out_dir = VIDEO / "public" / "audio" / name
    out_dir.mkdir(parents=True, exist_ok=True)
    gen_dir = VIDEO / "src" / "generated"
    gen_dir.mkdir(parents=True, exist_ok=True)

    model = load_model(MODELS[args.model])
    reference = load_audio(str(REF), sample_rate=model.sample_rate, volume_normalize=False)

    manifest_path = gen_dir / f"{name}.narration.json"
    previous = {m["id"]: m for m in json.loads(manifest_path.read_text())} if only and manifest_path.exists() else {}
    manifest = []
    for i, line in enumerate(lines):
        if only and line["id"] not in only and line["id"] in previous:
            manifest.append(previous[line["id"]]); continue
        if args.model == "fish":
            results = list(model.generate(
                text=line["text"], ref_audio=reference, ref_text=REF_TEXT,
                temperature=0.7, top_p=0.7, top_k=30, max_tokens=2048, chunk_length=300, verbose=False,
            ))
        else:
            results = list(model.generate(text=line["text"], ref_audio=str(REF), ref_text=REF_TEXT, language="English", verbose=False))
        if not results:
            raise RuntimeError(f"no audio for line {line['id']}")
        sr = results[0].sample_rate
        audio = np.concatenate([np.asarray(r.audio, dtype=np.float32) for r in results])
        audio = trim(audio, sr)
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = audio * (0.9 / peak)
        file = out_dir / f"{i:02d}-{line['id']}.wav"
        wavfile.write(file, sr, audio.astype(np.float32))
        dur = len(audio) / sr
        manifest.append({"id": line["id"], "file": f"audio/{name}/{file.name}", "text": line["text"], "durationSec": round(dur, 3)})
        print(f"{line['id']:>10} {dur:5.2f} s  {file.name}", flush=True)

    manifest_path.write_text(json.dumps(manifest, indent=1))
    print(f"total {sum(m['durationSec'] for m in manifest):.1f} s -> {manifest_path}")


if __name__ == "__main__":
    main()
