/**
 * Tests for _shared/rate-limit.js
 */

// Mock kv module before requiring rate-limit
jest.mock('../../api/_shared/kv', () => ({
    getKV: jest.fn(() => null) // In-memory fallback
}));

const { checkRateLimit } = require('../../api/_shared/rate-limit');

describe('checkRateLimit (in-memory fallback)', () => {
    test('first request allowed', async () => {
        const result = await checkRateLimit('test-first-request');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4); // 5 max - 1 = 4
    });

    test('5th request allowed (at limit)', async () => {
        const id = 'test-at-limit';
        for (let i = 0; i < 4; i++) {
            await checkRateLimit(id);
        }
        const result = await checkRateLimit(id);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(0);
    });

    test('6th request blocked', async () => {
        const id = 'test-over-limit';
        for (let i = 0; i < 5; i++) {
            await checkRateLimit(id);
        }
        const result = await checkRateLimit(id);
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('different identifiers independent', async () => {
        const id1 = 'test-independent-a';
        const id2 = 'test-independent-b';
        for (let i = 0; i < 5; i++) {
            await checkRateLimit(id1);
        }
        // id1 should be blocked
        const r1 = await checkRateLimit(id1);
        expect(r1.allowed).toBe(false);

        // id2 should still be allowed
        const r2 = await checkRateLimit(id2);
        expect(r2.allowed).toBe(true);
    });

    test('Redis fallback to in-memory', async () => {
        const { getKV } = require('../../api/_shared/kv');
        getKV.mockReturnValue(null); // No Redis

        const result = await checkRateLimit('test-fallback');
        expect(result.allowed).toBe(true);
    });

    test('concurrent requests handled', async () => {
        const id = 'test-concurrent';
        const results = await Promise.all([
            checkRateLimit(id),
            checkRateLimit(id),
            checkRateLimit(id)
        ]);
        // All should return (some may be blocked if they fill up the window)
        expect(results).toHaveLength(3);
        results.forEach(r => {
            expect(r).toHaveProperty('allowed');
        });
    });

    test('custom limits respected', async () => {
        const id = 'test-custom-limits';
        const opts = { maxRequests: 2, windowMs: 60000, blockMs: 1000 };
        await checkRateLimit(id, opts);
        await checkRateLimit(id, opts);
        const result = await checkRateLimit(id, opts);
        expect(result.allowed).toBe(false);
    });
});
