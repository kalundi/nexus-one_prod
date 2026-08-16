from pathlib import Path
import asyncio
import json
import subprocess
import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "social-video" / "voice-segments-v5"
OUT.mkdir(parents=True, exist_ok=True)
STATES = json.loads((ROOT / "output" / "social-video" / "app-states" / "states.json").read_text())
STEP_SECONDS = 5.2

async def main():
    inputs = []
    for index, state in enumerate(STATES):
        output = OUT / f"voice-{index:02d}.mp3"
        speech = edge_tts.Communicate(state["voice"], "en-US-JennyNeural", rate="+18%")
        await speech.save(str(output))
        inputs.extend(["-i", str(output)])
        print(output)

    filters = []
    labels = []
    for index in range(len(STATES)):
        label = f"a{index}"
        filters.append(f"[{index + 1}:a]apad=pad_dur={STEP_SECONDS},atrim=0:{STEP_SECONDS}[{label}]")
        labels.append(f"[{label}]")
    filters.append(f"{''.join(labels)}concat=n={len(STATES)}:v=0:a=1[voice]")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    silent = ROOT / "assets" / "nexus-booking-app-walkthrough-v5-silent.mp4"
    narrated = ROOT / "assets" / "nexus-booking-app-walkthrough-v5-narrated.mp4"
    subprocess.run([
        ffmpeg, "-y", "-i", str(silent), *inputs,
        "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[voice]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
        "-movflags", "+faststart", str(narrated)
    ], check=True)
    print(narrated)

asyncio.run(main())
