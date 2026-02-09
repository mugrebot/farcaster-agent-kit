/**
 * Unified CORS handler
 */

const { ALLOWED_ORIGINS } = require('./constants');

/**
 * Set CORS headers on the response.
 * @param {object} req
 * @param {object} res
 * @param {object} [opts]
 * @param {boolean} [opts.isPublic=false] — if true, allows any origin (for docs/health/examples)
 * @returns {boolean} true if this was a preflight OPTIONS request (caller should return early)
 */
function setCORS(req, res, opts = {}) {
    if (opts.isPublic) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
        const origin = req.headers.origin;
        if (ALLOWED_ORIGINS.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, PAYMENT-SIGNATURE');

    return req.method === 'OPTIONS';
}

module.exports = { setCORS };
