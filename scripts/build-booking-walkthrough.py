from pathlib import Path
import json, math, subprocess
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

root=Path(__file__).resolve().parents[1]
out=root/'output'/'social-video'; states_dir=out/'app-states'; frame_dir=out/'walkthrough-frames'
frame_dir.mkdir(parents=True,exist_ok=True)
states=json.loads((states_dir/'states.json').read_text())
titles=['ENTER RIDER DETAILS','CONFIRM THE RIDER','ADD PICKUP + DESTINATION','CONFIRM THE ROUTE','CHOOSE THE RIDE TYPE','SET DATE + APPOINTMENT','BOOK MY RIDE','BOOKING CONFIRMED']
captions=['Enter the passenger information.','Confirm to unlock the next step.','Enter the real pickup and destination.','Confirm every required stop.','Choose the transportation support.','Set the appointment date and time.','Review the estimate and submit.','Save the reference for updates.']
font_path='C:/Windows/Fonts/segoeuib.ttf'
title_font=ImageFont.truetype(font_path,22); caption_font=ImageFont.truetype(font_path,16)
W,H,FPS,frames_per_step=540,960,5,14

for index,state in enumerate(states):
    shot=Image.open(states_dir/state['file']).convert('RGB').resize((445,790),Image.Resampling.LANCZOS)
    sx,sy=(W-shot.width)//2,88
    tx=sx+state['target']['x']*(shot.width/540); ty=sy+state['target']['y']*(shot.height/960)
    for phase in range(frames_per_step):
        canvas=Image.new('RGB',(W,H),'#EAF1F7'); draw=ImageDraw.Draw(canvas)
        draw.rounded_rectangle((14,78,W-14,894),26,fill='#09142F'); canvas.paste(shot,(sx,sy))
        draw.rounded_rectangle((20,18,W-20,76),18,fill='#101B45')
        title=f'{index+1}  {titles[index]}'; box=draw.textbbox((0,0),title,font=title_font)
        draw.text(((W-(box[2]-box[0]))/2,33),title,font=title_font,fill='white')
        progress=min(1,phase/5); progress=progress*progress*(3-2*progress)
        px=(W-42)+(tx-(W-42))*progress; py=(H-42)+(ty-(H-42))*progress
        pulse=13+6*math.sin(phase*math.pi/2)**2
        if phase>=4:
            draw.ellipse((px-pulse,py-pulse,px+pulse,py+pulse),outline='#36D6E7',width=5)
            draw.ellipse((px-7,py-7,px+7,py+7),fill='#D0202F',outline='white',width=2)
        draw.polygon([(px,py),(px+10,py+27),(px+17,py+17),(px+28,py+15)],fill='white',outline='#101B45')
        draw.rounded_rectangle((20,902,W-20,950),15,fill='#101B45')
        cap=captions[index]; cbox=draw.textbbox((0,0),cap,font=caption_font)
        draw.text(((W-(cbox[2]-cbox[0]))/2,917),cap,font=caption_font,fill='white')
        canvas.save(frame_dir/f'frame-{index*frames_per_step+phase:04d}.jpg',quality=91)

ffmpeg=imageio_ffmpeg.get_ffmpeg_exe(); video=root/'assets'/'nexus-booking-app-walkthrough-v3.mp4'
subprocess.run([ffmpeg,'-y','-framerate',str(FPS),'-i',str(frame_dir/'frame-%04d.jpg'),'-frames:v',str(len(states)*frames_per_step),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
sheet=Image.new('RGB',(1080,960),'white')
for i in range(8):
    thumb=Image.open(frame_dir/f'frame-{i*frames_per_step+9:04d}.jpg').resize((270,480),Image.Resampling.LANCZOS)
    sheet.paste(thumb,((i%4)*270,(i//4)*480))
sheet.save(out/'nexus-booking-flow-contact-sheet.jpg',quality=90)
print(video)
