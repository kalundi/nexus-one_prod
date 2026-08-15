from pathlib import Path
import math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio.v2 as imageio
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ROOT / "output" / "social-video"
OUT.mkdir(parents=True, exist_ok=True)

W, H, FPS, DURATION = 540, 960, 30, 42
NAVY, BLUE, CYAN, GREEN = "#082F49", "#0369A1", "#22D3EE", "#047857"
INK, MUTED, WHITE, PALE = "#102338", "#62758A", "#FFFFFF", "#F3F8FB"

def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
    ]
    for p in candidates:
        if p.exists(): return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()

def contain(im, maxw, maxh):
    s = min(maxw/im.width, maxh/im.height)
    return im.resize((max(1,int(im.width*s)), max(1,int(im.height*s))), Image.Resampling.LANCZOS)

logo = contain(Image.open(ROOT / "nexus-logo.png").convert("RGBA"), 430, 92)
guide = Image.open(ASSETS / "nexus-video-guide.png").convert("RGBA")
vehicle = Image.open(ASSETS / "nexus-accessible-bus-side.webp").convert("RGB")

def ease(x):
    x=max(0,min(1,x)); return x*x*(3-2*x)

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def center(draw, text, y, fnt, fill=INK):
    b=draw.textbbox((0,0),text,font=fnt); draw.text(((W-(b[2]-b[0]))/2,y),text,font=fnt,fill=fill)

def multiline_center(draw, lines, y, fnt, fill=INK, gap=5):
    for line in lines:
        center(draw,line,y,fnt,fill); y += fnt.size + gap

def base():
    im=Image.new("RGB",(W,H),WHITE); d=ImageDraw.Draw(im)
    for x in range(0,W,90): d.line((x,0,x,H),fill="#EAF2F7",width=1)
    for y in range(0,H,90): d.line((0,y,W,y),fill="#EAF2F7",width=1)
    d.ellipse((310,610,750,1050),fill="#E4F4FA")
    d.ellipse((-260,760,300,1140),fill="#D6EEF7")
    im.paste(logo,((W-logo.width)//2,24),logo)
    return im

def add_guide(im, t, x=295, y=410, h=470):
    g=contain(guide,235,h)
    bob=int(math.sin(t*4)*4)
    im.paste(g,(x,y+bob),g)

def phone_mock(im, title, fields, button="CONTINUE", confirm=False):
    d=ImageDraw.Draw(im)
    x0,y0,x1,y1=54,175,365,805
    rounded(d,(x0,y0,x1,y1),30,WHITE,"#C9DCE8",3)
    rounded(d,(x0+100,y0+12,x0+210,y0+25),8,NAVY)
    d.text((x0+26,y0+52),title,font=font(26,True),fill=NAVY)
    yy=y0+115
    if confirm:
        d.ellipse((x0+92,yy,x0+164,yy+72),fill=GREEN)
        d.line((x0+112,yy+38,x0+130,yy+55),fill=WHITE,width=7)
        d.line((x0+129,yy+55,x0+151,yy+25),fill=WHITE,width=7)
        multiline_center(d,["RIDE REQUEST","RECEIVED"],yy+95,font(22,True),GREEN,3)
        d.text((x0+30,yy+170),"We’ll keep you updated.",font=font(17),fill=MUTED)
        d.text((x0+30,yy+205),"Open Livecare to track",font=font(17),fill=MUTED)
        d.text((x0+30,yy+230),"your ride status.",font=font(17),fill=MUTED)
    else:
        for label,value in fields:
            d.text((x0+25,yy),label,font=font(15,True),fill=MUTED)
            rounded(d,(x0+22,yy+24,x1-22,yy+79),12,PALE,"#D4E2EA",2)
            d.text((x0+38,yy+40),value,font=font(16),fill=INK)
            yy+=105
        rounded(d,(x0+24,min(yy+10,y1-82),x1-24,min(yy+68,y1-24)),14,BLUE)
        center_x=(x0+x1)//2
        b=d.textbbox((0,0),button,font=font(18,True)); d.text((center_x-(b[2]-b[0])/2,min(yy+27,y1-65)),button,font=font(18,True),fill=WHITE)

def caption(im, text):
    d=ImageDraw.Draw(im)
    rounded(d,(25,845,W-25,935),18,NAVY)
    lines=[]; words=text.split(); line=""
    for word in words:
        test=(line+" "+word).strip()
        if d.textbbox((0,0),test,font=font(20,True))[2] > W-80:
            lines.append(line); line=word
        else: line=test
    if line: lines.append(line)
    y=858 if len(lines)>1 else 875
    multiline_center(d,lines,y,font(20,True),WHITE,3)

def frame(t):
    im=base(); d=ImageDraw.Draw(im)
    if t < 5:
        multiline_center(d,["NEED A RIDE TO","YOUR APPOINTMENT?"],150,font(38,True),NAVY,4)
        d.text((50,270),"Nexus makes booking simple.",font=font(23,True),fill=GREEN)
        add_guide(im,t,285,340,480)
        caption(im,"Let’s book your non-emergency medical ride.")
    elif t < 10:
        center(d,"CHOOSE WHAT WORKS FOR YOU",145,font(28,True),NAVY)
        rounded(d,(42,230,498,365),24,WHITE,"#C9DCE8",3)
        d.ellipse((62,252,150,340),fill=GREEN); d.text((88,270),"☎",font=font(44,True),fill=WHITE)
        d.text((170,247),"CALL TO SCHEDULE",font=font(19,True),fill=GREEN)
        d.text((170,284),"(888) 639-5766",font=font(29,True),fill=NAVY)
        rounded(d,(42,390,498,525),24,NAVY)
        d.text((70,414),"BOOK ONLINE",font=font(24,True),fill=WHITE)
        d.text((70,458),"nexusmt.com/booking-app.html",font=font(16,True),fill=CYAN)
        add_guide(im,t,305,490,330)
        caption(im,"Call us, or book online anytime.")
    elif t < 16:
        phone_mock(im,"Book a Ride",[("PICKUP","Enter pickup address"),("DESTINATION","Enter appointment address"),("DATE & TIME","Choose your ride time")])
        add_guide(im,t,345,310,470)
        caption(im,"Start with pickup, destination, date, and time.")
    elif t < 22:
        phone_mock(im,"Ride Details",[("SERVICE","Wheelchair transportation"),("TRIP TYPE","Round trip"),("PASSENGERS","1 passenger")])
        add_guide(im,t,345,310,470)
        caption(im,"Tell us the service and support you need.")
    elif t < 28:
        phone_mock(im,"Rider Details",[("RIDER","Enter rider information"),("CONTACT","Phone or email updates"),("NOTES","Add helpful ride notes")],"REVIEW RIDE")
        add_guide(im,t,345,310,470)
        caption(im,"Add contact details, then review your request.")
    elif t < 34:
        phone_mock(im,"Confirmation",[],confirm=True)
        add_guide(im,t,345,310,470)
        caption(im,"Submit once and receive confirmation and updates.")
    elif t < 38:
        crop=vehicle.resize((W,300),Image.Resampling.LANCZOS)
        im.paste(crop,(0,180))
        rounded(d,(35,505,W-35,760),28,WHITE)
        multiline_center(d,["READY FOR","THE ROAD"],540,font(40,True),NAVY,2)
        center(d,"Safe. Reliable. Accessible.",660,font(24,True),GREEN)
        caption(im,"It’s just that easy to ride with us.")
    else:
        center(d,"BOOK YOUR RIDE TODAY",180,font(34,True),NAVY)
        rounded(d,(45,275,W-45,410),25,WHITE,"#C9DCE8",3)
        center(d,"(888) 639-5766",315,font(38,True),NAVY)
        rounded(d,(45,435,W-45,570),25,NAVY)
        center(d,"nexusmt.com/booking-app.html",475,font(20,True),WHITE)
        center(d,"Maryland • Washington, DC",650,font(20,True),GREEN)
        center(d,"Northern Virginia",680,font(20,True),GREEN)
        caption(im,"Nexus Medical Transit. Access drives equity.")
    return im

silent = OUT / "nexus-booking-flow-silent.mp4"
writer=imageio.get_writer(str(silent),fps=FPS,codec="libx264",quality=8,pixelformat="yuv420p",ffmpeg_log_level="warning")
for i in range(FPS*DURATION): writer.append_data(np.asarray(frame(i/FPS)))
writer.close()

audio=OUT / "nexus-booking-voiceover.wav"
final=OUT / "nexus-booking-flow.mp4"
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
if audio.exists() and audio.stat().st_size > 44 and audio.read_bytes()[:4] == b"RIFF":
    subprocess.run([ffmpeg,"-y","-i",str(silent),"-i",str(audio),"-c:v","copy","-c:a","aac","-b:a","160k","-shortest",str(final)],check=True)
else:
    final.write_bytes(silent.read_bytes())
print(final)
