import sys, cv2, numpy as np
from PIL import Image

def process(src, out_prefix, scale):
    rgb = cv2.imread(src, cv2.IMREAD_COLOR)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_BGR2HSV)
    print(src, 'mean saturation', hsv[...,1].mean().round(2))
    g = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
    # 1) remove JPEG blocking/ringing while keeping edges
    g = cv2.fastNlMeansDenoising(g, None, h=6, templateWindowSize=7, searchWindowSize=21)
    # 2) upscale with Lanczos, then a gentle unsharp mask for crisp edges
    g = cv2.resize(g, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    blur = cv2.GaussianBlur(g, (0, 0), 1.2 * scale)
    g = np.clip(g + 0.4 * (g - blur), 0, 255)
    # 3) clean levels: true black background, true white highlights (shading kept as-is in between)
    lo, hi = 14.0, 246.0
    a = np.clip((g - lo) / (hi - lo), 0, 1)
    # 4) crop to the artwork with a small margin
    ys, xs = np.where(a > 0.02)
    pad = int(12 * scale)
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
    a = a[y0:y1, x0:x1]
    alpha = (a * 255 + 0.5).astype(np.uint8)
    # white artwork whose opacity is its brightness: identical to the original on black,
    # and tintable to any colour (black on light backgrounds) without changing the shape or shading
    rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
    Image.fromarray(rgba, 'RGBA').save(f'{out_prefix}.png', optimize=True)
    # check: composite back on black
    Image.fromarray(alpha, 'L').save(f'{out_prefix}-on-black.png')
    print(out_prefix, rgba.shape)
    return rgba

process('mark.jpg', 'planet-mark', 2)
process('full.jpg', 'planet-logo', 2)
