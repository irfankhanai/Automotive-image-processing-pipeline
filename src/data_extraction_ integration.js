const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const getMake = require('../lib/getMake.js');
const { uploadImageFromUrlToR2: uploadImage } = require('../lib/r2.js');
const { PrismaClient } = require('@prisma/client');
const { delay } = require('./utils.js');
const { upsert } = require('../lib/upsert.js');
const prisma = new PrismaClient();
const logger = require('./logger.js')('burnsandco');

const SOURCE_NAME = 'burnsandco';
const BASE_URL = 'https://burnsandcoauctions.com.au/march-muscle-classic-collectable-car-motorcycle-auction/';
// const BASE_URL = 'https://burnsandcoauctions.com.au/april-muscle-classic-collectable-car-motorcycle-auction/';

async function run() {
    logger.info('Starting Burns & Co scraper...');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        logger.info(`Navigating to auction archive: ${BASE_URL}`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

        const html = await page.content();
        const $ = cheerio.load(html);

        const listings = [];

        // Selector based on Image 1 & 3: Extracting the portfolio/listing links
        $('.work-info').each((i, el) => {
            const link = $(el).find('a').attr('href');
            const title = $(el).find('h3').text().trim();

            // Only add links that go to specific car portfolios, not direct image files
            if (link && link.includes('/portfolio/') && title) {
                listings.push({ title, url: link });
            }
        });

        logger.info(`Found ${listings.length} listings to process.`);

        for (const item of listings) {
            try {
                // Check if we already have this URL to save resources
                const existing = await prisma.listings.findFirst({ where: { thirdPartyUrl: item.url } });
                if (existing) {
                    logger.info(`Skipping existing: ${item.title}`);
                    continue;
                }

                await processListing(page, item);
                await delay(3000); // Respectful crawl delay
            } catch (err) {
                logger.error(`Error processing ${item.url}: ${err.message}`);
            }
        }

    } catch (error) {
        logger.error(`Main execution error: ${error.message}`);
    } finally {
        await browser.close();
        await prisma.$disconnect();
    }
}

async function processListing(page, item) {
    logger.info(`Scraping detail page: ${item.url}`);
    await page.goto(item.url, { waitUntil: 'networkidle2' });

    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Image Extraction (Based on Image 3 gallery structure)
    const galleryImages = [];
    $('.work-item img').each((i, el) => {
        const src = $(el).attr('src');
        if (src) galleryImages.push(src.split('?')[0]);
    });

    // 2. Data Extraction (Based on Image 2 - <strong> tags in wpb_wrapper)
    const details = {};
    $('.wpb_wrapper p strong').each((i, el) => {
        const text = $(el).text();
        if (text.includes(':')) {
            const [key, ...valParts] = text.split(':');
            const value = valParts.join(':').trim();
            details[key.trim()] = value;
        }
    });

    // Mapping Burns & Co fields to your DB schema
    const title = item.title;

    // make 
    const rawMake = details['Build Year'] || '';
    const make = rawMake.includes('Make:') ? rawMake.split('Make:')[1].trim() : rawMake;

    const model = details['Model'] || '';

    // +++++++++++++++++++++++++++++
    // Example input from the <strong> block:
    // "Transmission: 4 Speed Manual Top Loader\nExterior / Interior Colour: G – Candy Apple Red / K – Dark Saddle Vinyl"
    const rawSpecs = details['Transmission'] || '';

    // --- 1. TRANSMISSION LOGIC ---
    // First, isolate the line containing the transmission
    let transLine = rawSpecs.includes('Transmission:')
        ? rawSpecs.split('Transmission:')[1].split('\n')[0]
        : rawSpecs;

    // Standardize to only 'Automatic' or 'Manual'
    const transmission = transLine.toLowerCase().includes('auto') ? 'Automatic' : 'Manual';


    // --- 2. COLOR LOGIC ---
    // Target the specific label for the full color string
    let colorPart = rawSpecs.includes('Exterior / Interior Colour:')
        ? rawSpecs.split('Exterior / Interior Colour:')[1]
        : '';

    // Take the first line after the label to capture the full value
    const color = colorPart.split('\n')[0].trim();
    // Result: "G – Candy Apple Red / K – Dark Saddle Vinyl"

    // +=++++++++++++++++++++++++++++

    const bodyStyle = details['Body Type'] || '';



    // const year = parseInt(details['Build Year']) || null;
    // const vin = details['VIN / Chassis No'] || '';
    const rawVin = details['VIN / Chassis No'] || '';

    // 1. Isolate the part after the label
    let vinPart = rawVin.includes('VIN / Chassis No:') ? rawVin.split('VIN / Chassis No:')[1] : rawVin;

    // 2. Split by line break and take the first line to exclude Engine and Fuel info
    const vin = vinPart.split('\n')[0].trim();

    // Example raw string: "VIN / Chassis No: JG33JG33014\nEngine Number: GL1538C\nFuel: Petrol"
    const rawFuel = details['VIN / Chassis No'] || '';

    // 1. Isolate the part after the 'Fuel:' label
    let fuelPart = rawFuel.includes('Fuel:') ? rawFuel.split('Fuel:')[1] : rawFuel;

    // 2. Split by line break and take the first line to ensure no trailing data remains
    const fuelType = fuelPart.split('\n')[0].trim();

    // Result: "Petrol"

    // Clean engine
    // Example input from the <strong> block:
    // "Engine Type: H-351W Windsor V8 4V\nEngine Size: 5.8 Litre\nOdometer: 28033 Miles Showing"
    const rawEngineData = details['Engine Type'] || '';

    // 1. Extract 'Engine Type' value
    const typePart = rawEngineData.includes('Engine Type:')
        ? rawEngineData.split('Engine Type:')[1].split('\n')[0].trim()
        : '';

    // 2. Extract 'Engine Size' value
    const sizePart = rawEngineData.includes('Engine Size:')
        ? rawEngineData.split('Engine Size:')[1].split('\n')[0].trim()
        : '';

    // 3. Combine them into the final constant
    const engine = `${typePart} ${sizePart}`.trim();

    // Clean engine


    // const odometerStr = details['Odometer'] || '';
    // const rawodo = details['Engine Type'] // '';
    // const odometer = rawodo.includes('Odometer:') ? rawodo.split('Odometer:')[1].trim() : rawodo;

    // Example raw data: "180105 Kms Showing" or "Odometer: 28033 Miles Showing"
    const rawodo = details['Engine Type'] || '';

    // 1. Isolate the part after "Odometer:" if it exists
    let odometerPart = rawodo.includes('Odometer:') ? rawodo.split('Odometer:')[1] : rawodo;

    // 2. Strip all non-numeric characters
    const odometer = odometerPart.replace(/[^0-9]/g, '');

    // Final Result for DB (ensuring it is a number type)
    const mileage = parseInt(odometer) || 0;

    // Parse mileage from "28033 Miles Showing"
    // let mileage = 0;
    // const milesMatch = odometerStr.match(/(\d+)\s*Miles/i);
    // const kmMatch = odometerStr.match(/(\d+)\s*Km/i);

    // if (milesMatch) {
    //     mileage = Math.round(parseInt(milesMatch[1]) * 1.60934);
    // } else if (kmMatch) {
    //     mileage = parseInt(kmMatch[1]);
    // }

    // Use your existing helper for make/model
    // const { make, model } = getMake(title, details['Make']);

    // 3. Upload Main Image to R2
    let mainImageUrl = null;
    let thumbnailUrl = null;
    if (galleryImages.length > 0) {
        try {
            const uploadResult = await uploadImage(galleryImages[0]);
            mainImageUrl = uploadResult.imageUrl;
            thumbnailUrl = uploadResult.thumbnailUrl;
        } catch (e) {
            logger.warn(`Image upload failed for ${title}`);
            mainImageUrl = galleryImages[0];
        }
    }

    const data = {
        source: SOURCE_NAME,
        title: title,
        // make: make || details['Make'],
        make: make,
        // model: model || details['Model'],
        model: model,
        year: parseInt(details['Build Year']) || null,
        vin: vin,
        engine: engine,
        transmission: transmission,
        mileage: mileage,
        // odometer: odometer,
        status: 'active', // Listings on this page are typically current/upcoming
        thirdPartyUrl: item.url,
        fuelType: fuelType,
        imageUrl: mainImageUrl,
        thumbnailUrl: thumbnailUrl,
        color: color,
        galleryImages: galleryImages,
        bodyStyle: bodyStyle,
        country: 'AU',
        city: 'Melbourne',
        regionCode: 'VIC',
        state: 'VIC',
        location: 'Melbourne, VIC',
        // Newcastle, NSW & Melbourne, VIC 
        isAuction: false,
        updatedAt: new Date()
    };

    await upsert(data, prisma);
    logger.info(`Saved: ${title}`);
}

run().catch(console.error);