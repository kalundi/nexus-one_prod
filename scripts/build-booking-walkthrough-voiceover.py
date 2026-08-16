from pathlib import Path
import asyncio
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "social-video" / "voice-segments-v4"
OUT.mkdir(parents=True, exist_ok=True)

LINES = [
    "Enter the passenger name, phone number, and email.",
    "Select Confirm Details to unlock the next section.",
    "Enter the pickup and destination addresses.",
    "Select Confirm Details to confirm the route.",
    "Choose the transportation support the passenger needs.",
    "Set the trip date and appointment time.",
    "Review the details, then select Book My Ride.",
    "Your booking is confirmed. Save the reference number for updates.",
]

async def main():
    for index, line in enumerate(LINES):
        output = OUT / f"voice-{index:02d}.mp3"
        speech = edge_tts.Communicate(line, "en-US-JennyNeural", rate="+18%")
        await speech.save(str(output))
        print(output)

asyncio.run(main())
