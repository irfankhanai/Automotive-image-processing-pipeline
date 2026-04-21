import sys
sys.path.append('src')

from pathlib import Path
from image_processor import download_and_process, save_image


def main():
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)

    urls = [
        "https://burnsandcoauctions.com.au/wp-content/uploads/sample.jpg",
    ]

    for url in urls:
        try:
            img, stem, suffix = download_and_process(url)
            output_path = output_dir / f"{stem}{suffix}"
            save_image(img, output_path, suffix)
            print(f"Saved: {output_path}")
        except Exception as e:
            print(f"Failed: {url} - {e}")


if __name__ == "__main__":
    main()