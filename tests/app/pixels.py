"""Lit fraction and mean colour of screenshots, the numbers to compare between runs.

Usage: python3 pixels.py <png> [<png> ...]
lit: fraction of pixels brighter than the background; mean rgb: of the lit pixels;
saturation: mean of (max - min) over the channels of the lit pixels, low when grey.
"""
import sys
import numpy as np
from PIL import Image

for path in sys.argv[1:]:
    image = np.asarray(Image.open(path).convert('RGB')).astype(int)
    lit = image.sum(axis=2) > 40
    pixels = image[lit]
    mean_rgb = np.round(pixels.mean(axis=0)).astype(int).tolist()
    saturation = float((pixels.max(axis=1) - pixels.min(axis=1)).mean())
    print(f'{path}: lit {lit.mean():.4f}  mean rgb {mean_rgb}  saturation {saturation:.1f}')
