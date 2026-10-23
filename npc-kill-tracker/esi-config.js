// EVE SSO configuration for Rusty NPC Tracker.
//
// Create a dedicated EVE application at https://developers.eveonline.com/applications
// with:
//   Callback URL: https://www.rustybot.co.uk/npc-kill-tracker/sso-callback.html
//   Scope:        esi-location.read_location.v1
//                 esi-location.read_ship_type.v1
//                 esi-location.read_online.v1
//
// Then paste its public Client ID below. Never put a client secret in this file:
// the tracker is a public PKCE client and does not need one.
window.RNPC_ESI_CONFIG = {
    clientId: '8b3bc32d9f634edf9ce07fde6930d905',
    // Optional override for local testing, e.g.
    // 'http://localhost:8781/npc-kill-tracker/sso-callback.html'
    redirectUri: '',
};
