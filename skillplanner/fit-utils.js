// Fit-name normalisation and limited alias handling.
// ESI returns type IDs, but EFT clipboard fits only contain item names. EVE's
// names are mostly consistent, yet exports from third-party tools occasionally
// use a different spelling. Keep the fallbacks deliberately conservative: a
// wrong match would silently add the wrong skill requirements.
(function (root) {
    'use strict';

    // Explicit aliases for common spelling differences. Keys and values are
    // already normalised (lowercase, single spaces).
    const FIT_ALIASES = Object.freeze({
        'sensor dampener': 'remote sensor dampener',
        'sensor dampener i': 'remote sensor dampener i',
        'sensor dampener ii': 'remote sensor dampener ii',
        'inertial stabilizer i': 'inertial stabilizers i',
        'inertial stabilizer ii': 'inertial stabilizers ii',
        'reinforced bulkhead i': 'reinforced bulkheads i',
        'reinforced bulkhead ii': 'reinforced bulkheads ii'
    });

    function normalizeFitName(value) {
        return String(value || '')
            // Curly quotes appear in a handful of SDE item names.
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201c\u201d]/g, '"')
            // Treat en/em dashes as a normal hyphen.
            .replace(/[\u2010-\u2015]/g, '-')
            // Strip accents but leave non-Latin names intact.
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function canonicalForms(name) {
        const forms = new Set();
        const add = value => {
            if (value && !forms.has(value)) forms.add(value);
        };

        add(name);
        // Common one-word/two-word differences in EVE item names.
        add(name.replace(/microwarp\s+drive/g, 'microwarpdrive'));
        add(name.replace(/smart\s+bomb/g, 'smartbomb'));
        add(name.replace(/cargo\s+hold/g, 'cargohold'));
        add(name.replace(/armour/g, 'armor'));
        // "1600 mm" vs "1600mm" style measurements.
        add(name.replace(/(\d)\s+(mm|mn|m|km|gj|mj)\b/g, '$1$2'));

        // A small singular/plural fallback helps exports such as
        // "Shield Extenders" without trying unsafe fuzzy matching.
        Array.from(forms).forEach(form => {
            if (form.endsWith('s') && !form.endsWith('ss')) {
                add(form.slice(0, -1));
            } else {
                add(form + 's');
            }
        });

        return forms;
    }

    function keysFor(name) {
        const normalized = normalizeFitName(name);
        const keys = new Set();

        canonicalForms(normalized).forEach(form => {
            keys.add(form);
            if (FIT_ALIASES[form]) keys.add(FIT_ALIASES[form]);
        });

        return keys;
    }

    // Build a lookup keyed by our normalized names. The generated fit-data.json
    // uses a simpler lowercase/whitespace normalisation, so curly quotes and
    // dash variants would otherwise miss.
    const indexCache = new WeakMap();
    function getIndex(data) {
        if (!data || typeof data !== 'object') return null;
        if (indexCache.has(data)) return indexCache.get(data);

        const index = {};
        Object.values(data).forEach(entry => {
            const key = normalizeFitName(entry?.name);
            if (!key) return;
            const existing = index[key];
            if (!existing || Object.keys(entry.skills || {}).length > Object.keys(existing.skills || {}).length) {
                index[key] = entry;
            }
        });
        indexCache.set(data, index);
        return index;
    }

    function resolveFitEntry(data, name) {
        const index = getIndex(data);
        if (!index) return null;
        for (const key of keysFor(name)) {
            if (index[key]) return index[key];
        }
        return null;
    }

    const api = { normalizeFitName, resolveFitEntry, keysFor, FIT_ALIASES };
    root.FitUtils = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
