from pathlib import Path
from urllib.parse import urlparse, unquote
from io import BytesIO
import csv
import mimetypes

import requests
from PIL import Image


CROP_BOTTOM = 200
TIMEOUT = 30


def filename_from_url(url):
    path = unquote(urlparse(url).path)
    name = Path(path).name
    stem = Path(name).stem
    suffix = Path(name).suffix or ".jpg"
    return stem, suffix


def crop_bottom_only(image_bytes, crop_bottom):
    img = Image.open(BytesIO(image_bytes))

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    width, height = img.size
    new_height = max(1, height - crop_bottom)
    return img.crop((0, 0, width, new_height))


def download_and_process(url, crop_bottom=CROP_BOTTOM):
    response = requests.get(url, timeout=TIMEOUT)
    response.raise_for_status()

    stem, suffix = filename_from_url(url)
    cropped = crop_bottom_only(response.content, crop_bottom)

    return cropped, stem, suffix


def save_image(img, output_path, suffix):
    save_kwargs = {}
    if suffix.lower() in (".jpg", ".jpeg"):
        save_kwargs["quality"] = 95

    img.save(output_path, **save_kwargs)