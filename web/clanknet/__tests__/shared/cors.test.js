/**
 * Tests for _shared/cors.js
 */

const { setCORS } = require('../../api/_shared/cors');

function mockReqRes(origin = 'https://clanknet.ai', method = 'GET') {
    const headers = {};
    const req = { headers: { origin }, method };
    const res = {
        setHeader: jest.fn((key, value) => { headers[key] = value; }),
        _headers: headers
    };
    return { req, res, headers };
}

describe('setCORS', () => {
    test('allowed origin set correctly', () => {
        const { req, res, headers } = mockReqRes('https://clanknet.ai');
        setCORS(req, res);
        expect(headers['Access-Control-Allow-Origin']).toBe('https://clanknet.ai');
    });

    test('unknown origin blocked', () => {
        const { req, res, headers } = mockReqRes('https://evil.com');
        setCORS(req, res);
        expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    test('OPTIONS returns true (preflight)', () => {
        const { req, res } = mockReqRes('https://clanknet.ai', 'OPTIONS');
        const isPreflight = setCORS(req, res);
        expect(isPreflight).toBe(true);
    });

    test('public mode allows any origin', () => {
        const { req, res, headers } = mockReqRes('https://anything.com');
        setCORS(req, res, { isPublic: true });
        expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    test('headers include Payment-Signature in allowed headers', () => {
        const { req, res, headers } = mockReqRes('https://clanknet.ai');
        setCORS(req, res);
        expect(headers['Access-Control-Allow-Headers']).toContain('PAYMENT-SIGNATURE');
    });
});
