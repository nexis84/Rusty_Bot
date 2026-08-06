// Generates Support/supporters.js from a Ko-fi supporters CSV export.
//
// Usage: node scripts/generate_supporters.js [path-to-csv]
// (defaults to the newest Support/Supporters_*.csv)
//
// Publishes only public-safe fields: name, support type, date and total.
// Emails and transaction IDs are never written to the output file.

const fs = require('fs');
const path = require('path');

const SUPPORT_DIR = path.join(__dirname, '..', 'Support');
const OUT_FILE = path.join(SUPPORT_DIR, 'supporters.js');

function findCsv() {
    const arg = process.argv[2];
    if (arg) {
        const p = path.resolve(arg);
        if (!fs.existsSync(p)) {
            console.error('CSV not found:', p);
            process.exit(1);
        }
        return p;
    }
    const csvs = fs.readdirSync(SUPPORT_DIR)
        .filter((f) => /^Supporters_.*\.csv$/i.test(f))
        .map((f) => path.join(SUPPORT_DIR, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!csvs.length) {
        console.error('No Supporters_*.csv found in', SUPPORT_DIR);
        process.exit(1);
    }
    return csvs[0];
}

// Minimal RFC4180-style parser for the quoted Ko-fi CSV format.
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (field.length || row.length) {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            }
        } else {
            field += c;
        }
    }
    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

function mapType(oneOff, monthly, commission, shop) {
    if (monthly === 'True') return 'member';
    if (oneOff === 'True') return 'oneoff';
    if (shop === 'True') return 'shop';
    if (commission === 'True') return 'commission';
    return 'member';
}

const TYPE_LABEL = {
    member: 'Member',
    oneoff: 'One-off',
    shop: 'Shop',
    commission: 'Commission',
};

function main() {
    const csvPath = findCsv();
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    if (!rows.length) {
        console.error('CSV is empty:', csvPath);
        process.exit(1);
    }

    const header = rows[0].map((h) => h.trim());
    const idx = (name) => header.indexOf(name);
    const cols = {
        name: idx('Name'),
        oneOff: idx('OneOff'),
        monthly: idx('Monthly'),
        commission: idx('Commission'),
        shop: idx('Shop'),
        date: idx('LastSupportedDateUTC'),
        total: idx('Total'),
    };
    if (Object.values(cols).some((i) => i < 0)) {
        console.error('CSV is missing expected columns. Found:', header.join(', '));
        process.exit(1);
    }

    const supporters = rows.slice(1)
        .filter((r) => r[cols.name] && r[cols.name].trim())
        .map((r) => {
            const name = r[cols.name].trim();
            const type = mapType(
                r[cols.oneOff], r[cols.monthly], r[cols.commission], r[cols.shop]
            );
            const date = (r[cols.date] || '').trim().slice(0, 10);
            const total = parseFloat(r[cols.total]) || 0;
            return { name, type, date, total };
        })
        .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : a.name.localeCompare(b.name)));

    const headerComment = `// Auto-generated from ${path.basename(csvPath)} - do not edit by hand.\n`;
    const body = `// Run: node scripts/generate_supporters.js\nwindow.SUPPORTERS = ${JSON.stringify(supporters, null, 2)};\n`;

    fs.writeFileSync(OUT_FILE, headerComment + body);

    const byType = {};
    for (const s of supporters) byType[s.type] = (byType[s.type] || 0) + 1;
    console.log('Source:', path.basename(csvPath));
    console.log('Output:', path.relative(process.cwd(), OUT_FILE));
    console.log('Supporters:', supporters.length);
    for (const [t, n] of Object.entries(byType)) {
        console.log(`  ${TYPE_LABEL[t]}: ${n}`);
    }
}

main();
