# cuts a print page into overlapping strips of the main text block, wide enough to read the vowel marks
import sys,glob,os
from PIL import Image
import numpy as np
src,dst=sys.argv[1],sys.argv[2];os.makedirs(dst,exist_ok=True)
for f in sorted(glob.glob(src+'/*.jpg')):
    im=Image.open(f).convert('L');a=np.asarray(im)<128;h,w=a.shape
    col=a[int(h*.08):int(h*.9)].mean(0)
    # the text block: the longest run of columns with ink, gaps under 3% of the width bridged
    on=col>0.01;runs=[];s=None;gap=0
    for x,v in enumerate(on):
        if v:
            if s is None: s=x
            gap=0;e=x
        elif s is not None:
            gap+=1
            if gap>w*.03: runs.append((s,e));s=None;gap=0
    if s is not None: runs.append((s,e))
    x0,x1=max(runs,key=lambda r:r[1]-r[0])
    row=a[:,x0:x1].mean(1);ys=np.where(row>0.01)[0];y0,y1=ys[0],ys[-1]
    n=max(1,round((y1-y0)/380));st=(y1-y0)/n
    base=os.path.basename(f)[:-4]
    for k in range(n):
        t=int(y0+k*st-45);b=int(y0+(k+1)*st+45)
        im.crop((max(0,x0-10),max(0,t),min(w,x1+10),min(h,b))).save(f'{dst}/{base}_{k}.jpg',quality=88)
    print(base,x0,x1,n)
