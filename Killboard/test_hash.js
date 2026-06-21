const fetch = require('node-fetch');
const id = process.argv[2] || 135711583;
(async () => {
    // Try following the ESI redirect
    const r = await fetch('https://zkillboard.com/kill/' + id + '/redirect/esi/', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual'
    });
    console.log('Redirect status:', r.status);
    console.log('Location:', r.headers.get('location'));
    // Parse hash from ESI URL
    const loc = r.headers.get('location');
    if (loc) {
        const hashMatch = loc.match(/killmails\/\d+\/([a-f0-9]+)\//);
        console.log('Hash:', hashMatch ? hashMatch[1] : 'NOT FOUND');
    }
})();
