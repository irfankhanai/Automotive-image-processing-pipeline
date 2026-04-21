# Auto Market Image Pipeline

A automated image processing and deployment pipeline for Australian specialty automotive marketplace integration.

## Features

- Automated image scraping from multiple sources
- Image processing (cropping, optimization, filtering)
- Cloud storage deployment to Supabase
- RESTful image API for marketplace integration

## Tech Stack

- **Python** - Scraping & image processing
- **Supabase** - Cloud storage & database
- **PIL/Pillow** - Image manipulation
- **Pandas** - Data handling

## Project Structure

```
auctopia-images/
├── .github/
│   └── workflows/
│       └── keep-alive.yml      # GitHub Actions for Supabase keep-alive
├── notebooks/
│   └── image_pipeline.ipynb    # Main image processing notebook
├── data/
│   └── sample_links.csv       # Sample image links data
├── src/
│   └── image_processor.py      # Core image processing module
├── requirements.txt           # Python dependencies
└── README.md
```

## Setup

```bash
pip install -r requirements.txt
```

## Usage

1. Configure Supabase credentials
2. Run the image pipeline notebook
3. Images are automatically scraped, processed, and uploaded

## AutoMarkets Australia

This project was built for integration with [AutoMarkets Australia](https://automarkets.com.au/) - a specialized search engine for the Australian automotive market.

## License

MIT