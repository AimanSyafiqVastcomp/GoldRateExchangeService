const puppeteer = require('puppeteer');

async function extractData(site, url) {
    // Launch browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Set a longer timeout to ensure page loads fully
        await page.setDefaultNavigationTimeout(20000);

        // Go to website
        console.error(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Wait a bit longer for any dynamic content
        await page.waitForTimeout(3000);

        let result;

        if (site === 'tttbullion') {
            result = await extractTTTBullion(page);
        } else if (site === 'msgold') {
            result = await extractMSGold(page);
        } else {
            throw new Error(`Unknown site: ${site}`);
        }

        // Output as JSON to stdout
        console.log(JSON.stringify(result));

    } catch (error) {
        console.error(`Error: ${error.message}`);
    } finally {
        await browser.close();
    }
}

// Extract data from TTTBullion
async function extractTTTBullion(page) {
    const results = [];

    // Find all tables on the page
    const tables = await page.$$('table');
    console.error(`Found ${tables.length} tables`);

    for (const table of tables) {
        // Check if this table has gold rates
        const tableText = await page.evaluate(el => el.textContent, table);

        if (tableText.includes('Gold') && !tableText.includes('Silver')) {
            console.error('Found Gold table');

            // Get all rows
            const rows = await table.$$('tr');

            // Skip header row
            for (let i = 1; i < rows.length; i++) {
                const cells = await rows[i].$$('td');

                if (cells.length >= 3) {
                    const detail = await page.evaluate(el => el.textContent.trim(), cells[0]);
                    const weBuyText = await page.evaluate(el => el.textContent.trim(), cells[1]);
                    const weSellText = await page.evaluate(el => el.textContent.trim(), cells[2]);

                    console.error(`Row data: ${detail}, ${weBuyText}, ${weSellText}`);

                    // Extract numeric values using regex
                    const weBuyMatch = weBuyText.match(/[\d,\.]+/);
                    const weSellMatch = weSellText.match(/[\d,\.]+/);

                    if (weBuyMatch && weSellMatch) {
                        const weBuy = parseFloat(weBuyMatch[0].replace(/,/g, ''));
                        const weSell = parseFloat(weSellMatch[0].replace(/,/g, ''));

                        results.push({
                            DetailName: detail,
                            WeBuy: weBuy,
                            WeSell: weSell
                        });

                        console.error(`Extracted: ${detail}, ${weBuy}, ${weSell}`);
                    }
                }
            }

            // If we found data, stop processing tables
            if (results.length > 0) {
                break;
            }
        }
    }

    return results;
}

// Extract data from MSGold
async function extractMSGold(page) {
    const ourRates = [];
    const customerSell = [];

    // Find all tables on the page
    const tables = await page.$$('table');
    console.error(`Found ${tables.length} tables`);

    for (const table of tables) {
        // Check table content
        const tableText = await page.evaluate(el => el.textContent, table);

        // Process OurRates table
        if (tableText.includes('WE BUY') && tableText.includes('WE SELL')) {
            console.error('Found OurRates table');

            // Get all rows
            const rows = await table.$$('tr');

            for (const row of rows) {
                const cells = await row.$$('td');

                if (cells.length >= 3) {
                    const detail = await page.evaluate(el => el.textContent.trim(), cells[0]);

                    // Skip header rows
                    if (detail.includes('DETAILS') || detail.includes('WE BUY') || !detail) {
                        continue;
                    }

                    const weBuyText = await page.evaluate(el => el.textContent.trim(), cells[1]);
                    const weSellText = await page.evaluate(el => el.textContent.trim(), cells[2]);

                    console.error(`OurRates data: ${detail}, ${weBuyText}, ${weSellText}`);

                    // Extract numeric values using regex
                    const weBuyMatch = weBuyText.match(/[\d,\.]+/);
                    const weSellMatch = weSellText.match(/[\d,\.]+/);

                    if (weBuyMatch && weSellMatch) {
                        const weBuy = parseFloat(weBuyMatch[0].replace(/,/g, ''));
                        const weSell = parseFloat(weSellMatch[0].replace(/,/g, ''));

                        // Normalize detail name
                        let normalizedDetail = detail;
                        if (detail.includes('USD') && detail.includes('oz')) {
                            normalizedDetail = '999.9 Gold USD / Oz';
                        } else if (detail.includes('MYR') && detail.includes('kg')) {
                            normalizedDetail = '999.9 Gold MYR / KG';
                        } else if (detail.includes('MYR') && detail.includes('tael')) {
                            normalizedDetail = '999.9 Gold MYR / Tael';
                        } else if (detail.includes('MYR') && detail.includes('g')) {
                            normalizedDetail = '999.9 Gold MYR / Gram';
                        } else if (detail.includes('USD') && detail.includes('MYR')) {
                            normalizedDetail = 'USD / MYR';
                        }

                        ourRates.push({
                            DetailName: normalizedDetail,
                            WeBuy: weBuy,
                            WeSell: weSell
                        });

                        console.error(`Extracted OurRates: ${normalizedDetail}, ${weBuy}, ${weSell}`);
                    }
                }
            }
        }
        // Process CustomerSell table
        else if (tableText.includes('WE BUY') && !tableText.includes('WE SELL')) {
            console.error('Found CustomerSell table');

            // Get all rows
            const rows = await table.$$('tr');

            for (const row of rows) {
                const cells = await row.$$('td');

                if (cells.length >= 2) {
                    const detail = await page.evaluate(el => el.textContent.trim(), cells[0]);

                    // Skip header rows
                    if (detail.includes('DETAILS') || detail.includes('WE BUY') || !detail) {
                        continue;
                    }

                    const weBuyText = await page.evaluate(el => el.textContent.trim(), cells[1]);

                    console.error(`CustomerSell data: ${detail}, ${weBuyText}`);

                    // Extract numeric values using regex
                    const weBuyMatch = weBuyText.match(/[\d,\.]+/);

                    if (weBuyMatch) {
                        const weBuy = parseFloat(weBuyMatch[0].replace(/,/g, ''));

                        // Extract purity
                        let purity = '';
                        if (detail.includes('999.9')) {
                            purity = '999.9';
                        } else if (detail.includes('999')) {
                            purity = '999';
                        } else if (detail.includes('916')) {
                            purity = '916';
                        } else if (detail.includes('835')) {
                            purity = '835';
                        } else if (detail.includes('750')) {
                            purity = '750';
                        } else if (detail.includes('375')) {
                            purity = '375';
                        }

                        if (purity) {
                            const normalizedDetail = `${purity} MYR / Gram`;

                            customerSell.push({
                                DetailName: normalizedDetail,
                                WeBuy: weBuy
                            });

                            console.error(`Extracted CustomerSell: ${normalizedDetail}, ${weBuy}`);
                        }
                    }
                }
            }
        }
    }

    return { OurRates: ourRates, CustomerSell: customerSell };
}

// Check command line arguments
if (process.argv.length < 4) {
    console.error('Usage: node script.js [tttbullion|msgold] [url]');
    process.exit(1);
}

const site = process.argv[2].toLowerCase();
const url = process.argv[3];

// Run the extraction
extractData(site, url).catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});