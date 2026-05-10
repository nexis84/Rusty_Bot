// Express server for EVE SSO token exchange
// This keeps the client secret secure on the server

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the project root
app.use(express.static(path.join(__dirname, '..')));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'RustyBot SSO API' });
});

// Token exchange endpoint
app.post('/api/token-exchange', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ 
            error: 'Missing required parameter: code' 
        });
    }

    try {
        // Exchange authorization code for access token
        const tokenResponse = await fetch('https://login.eveonline.com/v2/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    '654cd1a4e1c24985a7771eb49ed2724a:eat_2kdwAwn4fcvgX7rxHAbTOziI4np750DVD_23q7S7'
                ).toString('base64')
            },
            body: new URLSearchParams({
                'grant_type': 'authorization_code',
                'code': code
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            console.error('Token exchange error:', errorData);
            return res.status(400).json({ 
                error: errorData.error_description || 'Token exchange failed' 
            });
        }

        const tokenData = await tokenResponse.json();

        // Decode the JWT to get character info
        const decodedJWT = decodeJWT(tokenData.access_token);
        
        if (!decodedJWT || !decodedJWT.sub) {
            return res.status(500).json({ error: 'Invalid access token' });
        }

        // Extract character ID from the subject (format: CHARACTER:EVE:12345678)
        const characterId = decodedJWT.sub.split(':').pop();
        console.log('Extracted character ID:', characterId);

        // Fetch character name from ESI
        const characterResponse = await fetch(
            `https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`
        );
        
        let characterName = 'Unknown';
        if (characterResponse.ok) {
            const characterData = await characterResponse.json();
            characterName = characterData.name;
            console.log('Fetched character name:', characterName);
        } else {
            console.error('Failed to fetch character name from ESI:', characterResponse.status);
        }

        // Return token data to the client
        return res.status(200).json({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            character_id: characterId,
            character_name: characterName
        });

    } catch (error) {
        console.error('Server error during token exchange:', error);
        return res.status(500).json({ 
            error: 'Internal server error during token exchange' 
        });
    }
});

// Helper function to decode JWT
function decodeJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('JWT decode error:', e);
        return null;
    }
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`RustyBot SSO API running on port ${PORT}`);
});
