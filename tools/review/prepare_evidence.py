"""Copy calibrated, undistorted review evidence into the local browser bundle."""
import argparse
import json
from pathlib import Path
import shutil
import cv2
import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('project', type=Path)
p.add_argument('output', type=Path)
a = p.parse_args()
r, out = a.project, a.output
(out/'views').mkdir(parents=True, exist_ok=True)
kdata = json.loads((r/'data/survey/calibration.json').read_text())['/realsense/color_image/camera_info']
k = np.array(kdata['k']).reshape(3,3)
d = np.array(kdata['d'])
labels = {24:'Upper office', 110:'Rear stairs', 124:'Reception', 178:'Snack counter', 240:'Hall seating', 268:'Robotics workshop', 320:'Packing & dispatch', 462:'Lower room', 500:'Stores', 520:'Front entrance', 544:'Front stairs', 550:'Stair landing', 562:'Kitchen window', 580:'Kitchen island', 600:'Kitchen & lounge', 640:'Meeting room', 708:'Raised lounge'}
reviewed = set(json.loads((r/'data/reconstruction/v11_review_seconds.json').read_text()))
views=[]
for camera in json.loads((r/'data/reconstruction/cameras.json').read_text()):
 second=camera['second']
 source=r/camera['source']
 if not source.exists(): continue
 rgb=np.array(Image.open(source).convert('RGB'))
 # cv2.undistort is channel-agnostic: keep RGB throughout, save with PIL.
 undistorted=cv2.undistort(rgb,k,d,None,k)
 Image.fromarray(undistorted).save(out/f'views/{second:04d}.jpg',quality=92)
 thumb=Image.fromarray(undistorted);thumb.thumbnail((240,135));thumb.save(out/f'views/{second:04d}_thumb.jpg',quality=80)
 render=r/f'review/reconstruction/v11_{second:04d}.png'
 detail=r/f'review/reconstruction/v11_detail_{second:04d}.png'
 if detail.exists(): render=detail
 render_file=None
 if render.exists():
  render_file=f'views/{second:04d}_cycles.jpg'
  Image.open(render).convert('RGB').save(out/render_file,quality=94)
 views.append({**camera,'image':f'views/{second:04d}.jpg','thumbnail':f'views/{second:04d}_thumb.jpg',
               'render':render_file,'reviewed':second in reviewed,'label':labels.get(second),
               'level':'ground' if camera['location'][2]<3.8 else 'upper'})
(out/'evidence.json').write_text(json.dumps({'calibration':kdata,'views':views,'rgb':'Original RGB decoded with PIL; undistorted using original K,D and unchanged K.'},indent=2)+'\n')
print(f'EVIDENCE_READY {len(views)} cameras, {sum(bool(v["render"]) for v in views)} Cycles renders')
