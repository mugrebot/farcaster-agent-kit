/**
 * Scam Registry - Maintains database of known scams and dangerous contracts
 * Updates from community reports and security feeds
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ScamRegistry {
    constructor() {
        this.registryPath = path.join(__dirname, '../data/scam-registry.json');
        this.registry = this.loadRegistry();
        this.lastUpdate = Date.now();
        this.updateInterval = 3600000; // Update every hour

        // Scam detection patterns
        this.scamPatterns = [
            { pattern: /elon/i, weight: 2, reason: 'Celebrity impersonation' },
            { pattern: /musk/i, weight: 2, reason: 'Celebrity impersonation' },
            { pattern: /100x/i, weight: 3, reason: 'Unrealistic returns promise' },
            { pattern: /1000x/i, weight: 4, reason: 'Unrealistic returns promise' },
            { pattern: /guaranteed.*profit/i, weight: 3, reason: 'Guaranteed profit claim' },
            { pattern: /risk.*free/i, weight: 3, reason: 'Risk-free claim' },
            { pattern: /pump/i, weight: 2, reason: 'Pump scheme indicator' },
            { pattern: /moon.*shot/i, weight: 2, reason: 'Speculative language' },
            { pattern: /get.*rich/i, weight: 3, reason: 'Get-rich-quick scheme' },
            { pattern: /limited.*time/i, weight: 1, reason: 'Urgency tactic' },
            { pattern: /act.*now/i, weight: 1, reason: 'Urgency tactic' }
        ];

        // Initialize with known scams
        this.initializeKnownScams();
    }

    /**
     * Load registry from file
     */
    loadRegistry() {
        try {
            if (fs.existsSync(this.registryPath)) {
                return JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
            }
        } catch (error) {
            console.warn('Failed to load scam registry:', error.message);
        }

        return {
            blacklist: [],
            greylist: [],
            patterns: [],
            reports: [],
            lastUpdated: Date.now()
        };
    }

    /**
     * Save registry to file
     */
    saveRegistry() {
        try {
            const dir = path.dirname(this.registryPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(
                this.registryPath,
                JSON.stringify(this.registry, null, 2)
            );
        } catch (error) {
            console.error('Failed to save scam registry:', error);
        }
    }

    /**
     * Initialize with known scams
     */
    initializeKnownScams() {
        // Add known scam addresses (these would be real scam addresses)
        const knownScams = [
            {
                address: '0x0000000000000000000000000000000000000001',
                reason: 'Example scam token',
                type: 'honeypot',
                reportedAt: Date.now()
            }
            // Add real scam addresses here as they're discovered
        ];

        // Merge with existing blacklist
        for (const scam of knownScams) {
            if (!this.registry.blacklist.find(s => s.address === scam.address)) {
                this.registry.blacklist.push(scam);
            }
        }
    }

    /**
     * Check if address is blacklisted
     */
    isBlacklisted(address) {
        return this.registry.blacklist.some(
            entry => entry.address.toLowerCase() === address.toLowerCase()
        );
    }

    /**
     * Check if address is greylisted (suspicious but not confirmed)
     */
    isGreylisted(address) {
        return this.registry.greylist.some(
            entry => entry.address.toLowerCase() === address.toLowerCase()
        );
    }

    /**
     * Add address to blacklist
     */
    addToBlacklist(address, reason, type = 'unknown') {
        if (this.isBlacklisted(address)) {
            return false;
        }

        this.registry.blacklist.push({
            address: address.toLowerCase(),
            reason,
            type,
            reportedAt: Date.now()
        });

        this.saveRegistry();
        console.log(`⛔ Added to blacklist: ${address} - ${reason}`);
        return true;
    }

    /**
     * Add address to greylist
     */
    addToGreylist(address, reason, confidence = 50) {
        if (this.isBlacklisted(address) || this.isGreylisted(address)) {
            return false;
        }

        this.registry.greylist.push({
            address: address.toLowerCase(),
            reason,
            confidence,
            reportedAt: Date.now()
        });

        this.saveRegistry();
        console.log(`⚠️ Added to greylist: ${address} - ${reason}`);
        return true;
    }

    /**
     * Check token name/symbol for scam patterns
     */
    checkScamPatterns(name, symbol = '') {
        const text = `${name} ${symbol}`.toLowerCase();
        const detectedPatterns = [];
        let totalWeight = 0;

        for (const { pattern, weight, reason } of this.scamPatterns) {
            if (pattern.test(text)) {
                detectedPatterns.push(reason);
                totalWeight += weight;
            }
        }

        return {
            isScam: totalWeight >= 5,
            suspicious: totalWeight >= 3,
            weight: totalWeight,
            patterns: detectedPatterns
        };
    }

    /**
     * Report suspicious activity
     */
    reportSuspiciousActivity(address, details) {
        this.registry.reports.push({
            address: address.toLowerCase(),
            details,
            timestamp: Date.now(),
            status: 'pending'
        });

        // Auto-greylist if multiple reports
        const reportCount = this.registry.reports.filter(
            r => r.address === address.toLowerCase()
        ).length;

        if (reportCount >= 3) {
            this.addToGreylist(address, 'Multiple suspicious activity reports', 70);
        }

        this.saveRegistry();
        return reportCount;
    }

    /**
     * Update from external security feeds
     */
    async updateFromSecurityFeeds() {
        if (Date.now() - this.lastUpdate < this.updateInterval) {
            return; // Don't update too frequently
        }

        console.log('📡 Updating scam registry from security feeds...');

        try {
            // Update from multiple sources
            const [
                goPlus,
                tokenSniffer,
                honeypotIs
            ] = await Promise.all([
                this.fetchGoPlusData(),
                this.fetchTokenSnifferData(),
                this.fetchHoneypotData()
            ]);

            // Merge data from all sources
            this.mergeSecurityData(goPlus, tokenSniffer, honeypotIs);

            this.lastUpdate = Date.now();
            this.registry.lastUpdated = Date.now();
            this.saveRegistry();

            console.log('✅ Scam registry updated successfully');
        } catch (error) {
            console.error('Failed to update security feeds:', error);
        }
    }

    /**
     * Fetch data from GoPlus Security API
     */
    async fetchGoPlusData() {
        try {
            // GoPlus provides security detection for tokens
            const response = await axios.get(
                'https://api.gopluslabs.io/api/v1/token_security/8453', // Base chain ID
                {
                    params: { contract_addresses: this.registry.greylist.map(g => g.address).join(',') },
                    timeout: 5000
                }
            );

            const results = [];
            if (response.data && response.data.result) {
                for (const [address, data] of Object.entries(response.data.result)) {
                    if (data.is_honeypot === '1' || data.is_blacklisted === '1') {
                        results.push({
                            address,
                            type: 'honeypot',
                            source: 'GoPlus'
                        });
                    }
                }
            }

            return results;
        } catch (error) {
            return [];
        }
    }

    /**
     * Fetch data from Token Sniffer
     */
    async fetchTokenSnifferData() {
        try {
            // Token Sniffer API for scam detection
            const response = await axios.get(
                'https://tokensniffer.com/api/v2/tokens/base/flagged',
                { timeout: 5000 }
            );

            if (response.data && response.data.tokens) {
                return response.data.tokens.map(token => ({
                    address: token.address,
                    type: token.type || 'scam',
                    source: 'TokenSniffer'
                }));
            }

            return [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Fetch data from Honeypot.is
     */
    async fetchHoneypotData() {
        // This would fetch from honeypot.is API
        // For now, return empty array
        return [];
    }

    /**
     * Merge security data from multiple sources
     */
    mergeSecurityData(...sources) {
        const allScams = sources.flat();

        for (const scam of allScams) {
            if (!this.isBlacklisted(scam.address)) {
                this.addToBlacklist(
                    scam.address,
                    `Detected by ${scam.source}`,
                    scam.type
                );
            }
        }
    }

    /**
     * Check comprehensive safety
     */
    async checkSafety(address, name = '', symbol = '') {
        // Check blacklist
        if (this.isBlacklisted(address)) {
            return {
                safe: false,
                reason: 'Address is blacklisted',
                severity: 'CRITICAL'
            };
        }

        // Check greylist
        if (this.isGreylisted(address)) {
            const entry = this.registry.greylist.find(
                e => e.address.toLowerCase() === address.toLowerCase()
            );
            return {
                safe: false,
                reason: `Suspicious: ${entry.reason}`,
                severity: 'HIGH',
                confidence: entry.confidence
            };
        }

        // Check name/symbol patterns
        const patternCheck = this.checkScamPatterns(name, symbol);
        if (patternCheck.isScam) {
            return {
                safe: false,
                reason: `Scam patterns detected: ${patternCheck.patterns.join(', ')}`,
                severity: 'HIGH'
            };
        }

        if (patternCheck.suspicious) {
            return {
                safe: true,
                warnings: patternCheck.patterns,
                severity: 'MEDIUM'
            };
        }

        return {
            safe: true,
            severity: 'LOW'
        };
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return {
            blacklisted: this.registry.blacklist.length,
            greylisted: this.registry.greylist.length,
            reports: this.registry.reports.length,
            lastUpdated: new Date(this.registry.lastUpdated).toISOString()
        };
    }

    /**
     * Clean old entries (greylist items older than 30 days)
     */
    cleanOldEntries() {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        this.registry.greylist = this.registry.greylist.filter(
            entry => entry.reportedAt > thirtyDaysAgo
        );

        this.registry.reports = this.registry.reports.filter(
            report => report.timestamp > thirtyDaysAgo
        );

        this.saveRegistry();
    }
}

module.exports = ScamRegistry;