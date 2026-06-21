#!/usr/bin/env node
// Killboard server — delegates to the main api server for a single kill pool/queue
process.env.PORT = process.env.PORT || '3000';
require('../api/token-exchange.js');
