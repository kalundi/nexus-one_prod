from pathlib import Path
import json, math, subprocess
from PIL import Image, ImageDraw, ImageFont
import imageio.v2 as imageio
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT, STATES = ROOT / "output" / "social-video", ROOT / "output" / "social-video" / "app-states"
W, H, FPS = 540, 960, 5
NAVY, RED, WHITE, CYAN = "#101B45", "#D0202F", "#FFFFFF", "#36D6E7"

def font(size, bold=False):
    path = Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()

def ease(v):
    v = max(0, min(1, v)); return v*v*(3-2*v)

meta = json.loads((STATES / "states.json").read_text())
print("Loading captured app states", flush=True)
screens = []
for state in meta:
    source = Image.open(STATES / state["file"]).convert("RGB")
    scale = min(500/source.width, 790/source.height)
    screen = source.resize((int(source.width*scale), int(source.height*scale)), Image.Resampling.LANCZOS)
    x, y = (W-screen.width)//2, 88
    target = (x + state["target"]["x"]*scale, y + state["target"]["y"]*scale)
    screens.append((screen, target))

labels = [
    ("1  ENTER RIDER DETAILS", "Start as a guest or sign in to save 5%."),
    ("2  CONFIRM THE RIDER", "The next step unlocks after confirmation."),
    ("3  ADD PICKUP + DESTINATION", "Use the real address fields and suggestions."),
    ("4  CONFIRM THE ROUTE", "Nexus checks that every required stop is present."),
    ("5  CHOOSE THE RIDE TYPE", "Select the transportation support you need."),
    ("6  SET DATE + APPOINTMENT", "Pickup time and fare update automatically."),
    ("7  BOOK MY RIDE", "Review the live estimate, then submit once."),
    ("8  BOOKING CONFIRMED", "Keep the reference number for trip updates."),
]

step_seconds = 2.8
video_only = OUT / "nexus-booking-flow-actual-app.mp4"
frame_dir = OUT / "actual-app-frames"
frame_dir.mkdir(parents=True, exist_ok=True)
for frame_no in range(round(step_seconds*len(screens)*FPS)):
    if frame_no % 20 == 0: print(f"Rendering frame {frame_no}", flush=True)
    t = frame_no/FPS
    index = min(len(screens)-1, int(t/step_seconds))
    local = (t % step_seconds)/step_seconds
    screen, target = screens[index]
    canvas = Image.new("RGB", (W,H), "#EAF1F7"); draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((14,78,W-14,894), radius=26, fill="#09142F")
    canvas.paste(screen, ((W-screen.width)//2,88))
    draw.rounded_rectangle((20,18,W-20,76), radius=18, fill=NAVY)
    title = labels[index][0]; box = draw.textbbox((0,0),title,font=font(22,True))
    draw.text(((W-(box[2]-box[0]))/2,33),title,font=font(22,True),fill=WHITE)
    arrival = ease(min(1,local/.38)); start=(W-42,H-42)
    px=start[0]+(target[0]-start[0])*arrival; py=start[1]+(target[1]-start[1])*arrival
    pulse=12+8*(1+math.sin(local*math.pi*10))/2
    if local>.28:
        draw.ellipse((px-pulse,py-pulse,px+pulse,py+pulse),outline=CYAN,width=5)
        draw.ellipse((px-7,py-7,px+7,py+7),fill=RED,outline=WHITE,width=2)
    draw.polygon([(px,py),(px+10,py+27),(px+17,py+17),(px+28,py+15)],fill=WHITE,outline=NAVY)
    draw.rounded_rectangle((20,902,W-20,950),radius=15,fill=NAVY)
    caption=labels[index][1]; cbox=draw.textbbox((0,0),caption,font=font(16,True))
    draw.text(((W-(cbox[2]-cbox[0]))/2,917),caption,font=font(16,True),fill=WHITE)
    canvas.save(frame_dir / f"frame-{frame_no:04d}.png", optimize=False)

subprocess.run([
    imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-framerate", str(FPS),
    "-i", str(frame_dir / "frame-%04d.png"), "-frames:v", str(round(step_seconds*len(screens)*FPS)),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video_only)
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

voice, final = OUT/"nexus-booking-voiceover.wav", OUT/"nexus-booking-flow.mp4"
if voice.exists() and voice.stat().st_size > 44:
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-y","-i",str(video_only),"-i",str(voice),"-c:v","copy","-c:a","aac","-shortest",str(final)],check=True)
else:
    final.write_bytes(video_only.read_bytes())

sheet=Image.new("RGB",(1080,960),WHITE)
for i in range(len(screens)):
    frame=Image.open(frame_dir/f"frame-{round((i*step_seconds+1.8)*FPS):04d}.png")
    thumb=frame.resize((270,480),Image.Resampling.LANCZOS)
    sheet.paste(thumb,((i%4)*270,(i//4)*480))
sheet.save(OUT/"nexus-booking-flow-contact-sheet.jpg",quality=90)
print(final)
