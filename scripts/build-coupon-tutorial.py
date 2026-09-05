from pathlib import Path
import json, math, subprocess
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

root=Path(__file__).resolve().parents[1]; out=root/'output'/'coupon-tutorial'; states=json.loads((out/'states'/'states.json').read_text()); frames=out/'frames'; frames.mkdir(parents=True,exist_ok=True)
bold=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',22); small=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',15); body=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',17)
W,H,FPS,N=540,960,6,30
for i,state in enumerate(states):
 shot=Image.open(out/'states'/state['file']).convert('RGB').resize((445,790),Image.Resampling.LANCZOS); sx,sy=(W-445)//2,88; tx=sx+state['target']['x']*445/540; ty=sy+state['target']['y']*790/960
 for f in range(N):
  im=Image.new('RGB',(W,H),'#eaf1f7');d=ImageDraw.Draw(im);d.rounded_rectangle((14,78,W-14,894),26,fill='#09142f');im.paste(shot,(sx,sy));d.rounded_rectangle((20,12,W-20,80),18,fill='#101b45')
  heading='BOOK WITH A COUPON';box=d.textbbox((0,0),heading,font=bold);d.text(((W-box[2])/2,20),heading,font=bold,fill='white');step=f'Step {i+1} · {state["title"]}';box=d.textbbox((0,0),step,font=small);d.text(((W-box[2])/2,53),step,font=small,fill='#8cebf0')
  if f>=5:
   pulse=13+5*math.sin(f*.8)**2;d.ellipse((tx-pulse,ty-pulse,tx+pulse,ty+pulse),outline='#36d6e7',width=5);d.ellipse((tx-7,ty-7,tx+7,ty+7),fill='#d0202f',outline='white',width=2)
  d.rounded_rectangle((20,902,W-20,950),15,fill='#101b45');cap=state['caption'];box=d.textbbox((0,0),cap,font=body);d.text(((W-box[2])/2,916),cap,font=body,fill='white');im.save(frames/f'frame-{i*N+f:04d}.jpg',quality=92)
video=root/'assets'/'nexus-patient-coupon-booking-guide.mp4';ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();subprocess.run([ffmpeg,'-y','-framerate',str(FPS),'-i',str(frames/'frame-%04d.jpg'),'-frames:v',str(len(states)*N),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
print(video)
