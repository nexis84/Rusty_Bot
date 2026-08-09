const crypto = require('crypto');

const JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
const CACHE_TTL = 3600000; // 1 hour
const EXPECTED_ISS = 'login.eveonline.com';

let cachedKeys = [];
let cacheExpiry = 0;

async function fetchJwks() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(JWKS_URL, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
        const jwks = await res.json();
        cachedKeys = (jwks.keys || []).map(k => ({
            kid: k.kid,
            alg: k.alg || 'RS256',
            key: crypto.createPublicKey({
                key: {
                    kty: k.kty,
                    n: k.n,
                    e: k.e,
                },
                format: 'jwk',
            }),
        }));
        cacheExpiry = Date.now() + CACHE_TTL;
        return cachedKeys;
    } catch (e) {
        clearTimeout(timeout);
        console.error('[jwt-verify] JWKS fetch failed:', e.message);
        return cachedKeys.length ? cachedKeys : [];
    }
}

function decodeHeader(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return { header, payload, signature: parts[2], signed: parts[0] + '.' + parts[1] };
    } catch {
        return null;
    }
}

async function verifyJWT(token) {
    if (!token) return null;

    const decoded = decodeHeader(token);
    if (!decoded) return null;

    // Check expiry
    if (decoded.payload.exp) {
        const exp = typeof decoded.payload.exp === 'number'
            ? decoded.payload.exp
            : parseInt(decoded.payload.exp, 10);
        if (Date.now() / 1000 > exp) {
            console.warn('[jwt-verify] Token expired');
            return null;
        }
    }

    // Check issuer
    if (decoded.payload.iss && decoded.payload.iss !== EXPECTED_ISS) {
        console.warn('[jwt-verify] Invalid issuer:', decoded.payload.iss);
        return null;
    }

    // Refresh keys if cache expired
    if (Date.now() >= cacheExpiry || !cachedKeys.length) {
        await fetchJwks();
    }

    // Find matching key by kid
    const key = cachedKeys.find(k => k.kid === decoded.header.kid);
    if (!key) {
        // Kid not found — refresh and retry once
        await fetchJwks();
        const retryKey = cachedKeys.find(k => k.kid === decoded.header.kid);
        if (!retryKey) {
            console.warn('[jwt-verify] Unknown kid:', decoded.header.kid);
            return null;
        }
        return verifyWithKey(token, decoded, retryKey);
    }

    return verifyWithKey(token, decoded, key);
}

function verifyWithKey(token, decoded, key) {
    try {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(decoded.signed);
        verifier.end();
        const signature = Buffer.from(decoded.signature, 'base64');
        if (verifier.verify(key.key, signature)) {
            return decoded.payload;
        }
        console.warn('[jwt-verify] Signature verification failed');
        return null;
    } catch (e) {
        console.error('[jwt-verify] Verification error:', e.message);
        return null;
    }
}

module.exports = { verifyJWT };
