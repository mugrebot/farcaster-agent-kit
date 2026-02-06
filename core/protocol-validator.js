/**
 * Protocol Validator - Validates DeFi protocols for safety
 * Checks audits, TVL, social verification, and protocol age
 */

const axios = require('axios');
const DeFiOracle = require('./defi-oracle');

class ProtocolValidator {
    constructor(provider) {
        this.provider = provider;
        this.oracle = new DeFiOracle(provider);
        this.cache = new Map();
        this.cacheTimeout = 3600000; // 1 hour

        // Minimum requirements for protocol interaction
        this.requirements = {
            minTVL: 1000000, // $1M minimum TVL
            minAge: 30, // 30 days minimum
            minTransactions: 1000,
            minHolders: 100
        };

        // Audit firms we trust
        this.trustedAuditors = [
            'OpenZeppelin', 'Trail of Bits', 'Quantstamp',
            'ConsenSys Diligence', 'Hacken', 'PeckShield', 'SlowMist',
            'Halborn', 'Code4rena', 'Sherlock', 'Spearbit'
        ];

        // Verified protocols database
        this.verifiedProtocols = {
            'aave': {
                name: 'Aave V3',
                audited: true,
                auditors: ['OpenZeppelin', 'Trail of Bits'],
                socialVerified: true,
                minTVL: 1000000000, // $1B
                trustScore: 10
            },
            'compound': {
                name: 'Compound V3',
                audited: true,
                auditors: ['OpenZeppelin', 'Trail of Bits'],
                socialVerified: true,
                minTVL: 500000000,
                trustScore: 10
            },
            'uniswap': {
                name: 'Uniswap V3',
                audited: true,
                auditors: ['Trail of Bits', 'ABDK'],
                socialVerified: true,
                minTVL: 1000000000,
                trustScore: 10
            },
            'aerodrome': {
                name: 'Aerodrome Finance',
                audited: true,
                auditors: ['Code4rena'],
                socialVerified: true,
                minTVL: 100000000,
                trustScore: 8
            },
            'curve': {
                name: 'Curve Finance',
                audited: true,
                auditors: ['Trail of Bits', 'Quantstamp'],
                socialVerified: true,
                minTVL: 500000000,
                trustScore: 9
            }
        };
    }

    /**
     * Comprehensive protocol validation
     */
    async validateProtocol(protocolName, contractAddress = null) {
        const cacheKey = `protocol_${protocolName}_${contractAddress}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        console.log(`🔎 Validating protocol: ${protocolName}`);

        // Check if it's a verified protocol
        const verified = this.verifiedProtocols[protocolName.toLowerCase()];
        if (verified) {
            const result = {
                protocol: protocolName,
                valid: true,
                verified: true,
                trustScore: verified.trustScore,
                audited: verified.audited,
                auditors: verified.auditors,
                warnings: [],
                recommendation: 'SAFE'
            };
            this.setCache(cacheKey, result);
            return result;
        }

        // Validate unknown protocol
        const [
            auditStatus,
            tvlData,
            socialVerification,
            protocolAge
        ] = await Promise.all([
            this.checkAuditStatus(protocolName),
            this.checkTVL(protocolName),
            this.checkSocialVerification(protocolName),
            this.getProtocolAge(protocolName)
        ]);

        // Calculate trust score
        let trustScore = 5; // Start neutral
        const warnings = [];

        if (auditStatus.audited) {
            trustScore += 3;
        } else {
            warnings.push('No audit found');
            trustScore -= 2;
        }

        if (tvlData.tvl < this.requirements.minTVL) {
            warnings.push(`Low TVL: $${(tvlData.tvl / 1e6).toFixed(2)}M`);
            trustScore -= 2;
        } else if (tvlData.tvl > 100000000) { // $100M+
            trustScore += 2;
        }

        if (!socialVerification.verified) {
            warnings.push('Not socially verified');
            trustScore -= 1;
        }

        if (protocolAge < this.requirements.minAge) {
            warnings.push(`New protocol (${protocolAge} days old)`);
            trustScore -= 2;
        }

        // Determine recommendation
        let recommendation = 'SAFE';
        if (trustScore < 3) recommendation = 'AVOID';
        else if (trustScore < 5) recommendation = 'HIGH_RISK';
        else if (trustScore < 7) recommendation = 'CAUTION';

        const result = {
            protocol: protocolName,
            valid: trustScore >= 5,
            verified: false,
            trustScore,
            audited: auditStatus.audited,
            auditors: auditStatus.auditors,
            tvl: tvlData.tvl,
            socialVerified: socialVerification.verified,
            protocolAge,
            warnings,
            recommendation
        };

        this.setCache(cacheKey, result);
        return result;
    }

    /**
     * Check audit status
     */
    async checkAuditStatus(protocol) {
        try {
            // Check DeFiSafety API
            const response = await axios.get(
                `https://api.defisafety.com/v1/protocols/${protocol.toLowerCase()}`,
                { timeout: 5000 }
            );

            if (response.data && response.data.audits) {
                const auditors = response.data.audits.map(a => a.auditor);
                const trustedAudits = auditors.filter(a =>
                    this.trustedAuditors.some(t => a.includes(t))
                );

                return {
                    audited: trustedAudits.length > 0,
                    auditors: trustedAudits,
                    score: response.data.score || 0
                };
            }
        } catch (error) {
            // Fallback to manual audit database
            return this.checkManualAuditDatabase(protocol);
        }

        return { audited: false, auditors: [], score: 0 };
    }

    /**
     * Manual audit database check
     */
    async checkManualAuditDatabase(protocol) {
        // Check GitHub repos for audit reports
        const auditRepos = {
            'aave': ['aave/aave-v3-core'],
            'compound': ['compound-finance/compound-protocol'],
            'uniswap': ['Uniswap/v3-core']
        };

        const protocolRepo = auditRepos[protocol.toLowerCase()];
        if (!protocolRepo) {
            return { audited: false, auditors: [], score: 0 };
        }

        try {
            const response = await axios.get(
                `https://api.github.com/repos/${protocolRepo[0]}/contents/audits`,
                { timeout: 5000 }
            );

            if (response.data && Array.isArray(response.data)) {
                const auditors = [];
                for (const file of response.data) {
                    for (const auditor of this.trustedAuditors) {
                        if (file.name.toLowerCase().includes(auditor.toLowerCase())) {
                            auditors.push(auditor);
                        }
                    }
                }

                return {
                    audited: auditors.length > 0,
                    auditors: [...new Set(auditors)],
                    score: auditors.length * 20
                };
            }
        } catch (error) {
            // Silent fail - repo might not have audits folder
        }

        return { audited: false, auditors: [], score: 0 };
    }

    /**
     * Check protocol TVL
     */
    async checkTVL(protocol) {
        try {
            // Get TVL from DeFiLlama
            const llamaData = await this.oracle.getDeFiLlamaData(protocol);
            if (llamaData && llamaData.tvl) {
                return { tvl: llamaData.tvl, chain: 'Base' };
            }

            // Fallback to on-chain TVL check
            return await this.getOnChainTVL(protocol);
        } catch (error) {
            console.warn('Failed to get TVL:', error.message);
            return { tvl: 0, chain: 'Base' };
        }
    }

    /**
     * Get on-chain TVL estimation
     */
    async getOnChainTVL(protocol) {
        // This would need protocol-specific logic
        // For now, return conservative estimate
        return { tvl: 0, chain: 'Base' };
    }

    /**
     * Check social media verification
     */
    async checkSocialVerification(protocol) {
        const verifications = {
            twitter: false,
            github: false,
            website: false,
            documentation: false
        };

        try {
            // Check Twitter verification (would need Twitter API)
            // For now, check against known verified accounts
            const verifiedTwitter = [
                'aave', 'compoundfinance', 'uniswap',
                'aerodromefi', 'curvefinance'
            ];

            verifications.twitter = verifiedTwitter.includes(protocol.toLowerCase());

            // Check GitHub
            const githubOrgs = {
                'aave': 'aave',
                'compound': 'compound-finance',
                'uniswap': 'Uniswap'
            };

            if (githubOrgs[protocol.toLowerCase()]) {
                const response = await axios.get(
                    `https://api.github.com/orgs/${githubOrgs[protocol.toLowerCase()]}`,
                    { timeout: 5000 }
                );
                verifications.github = response.data && response.data.id;
            }

            // Check for documentation
            verifications.documentation = verifications.github; // Simplified

            // Overall verification
            const verified = Object.values(verifications).filter(v => v).length >= 2;

            return {
                verified,
                platforms: verifications,
                score: Object.values(verifications).filter(v => v).length * 25
            };
        } catch (error) {
            return {
                verified: false,
                platforms: verifications,
                score: 0
            };
        }
    }

    /**
     * Get protocol age
     */
    async getProtocolAge(protocol) {
        // This would check deployment dates
        // For now, use known launch dates
        const launchDates = {
            'aave': new Date('2020-01-08'),
            'compound': new Date('2018-09-27'),
            'uniswap': new Date('2020-05-05'),
            'aerodrome': new Date('2023-08-28'),
            'curve': new Date('2020-01-03')
        };

        const launch = launchDates[protocol.toLowerCase()];
        if (launch) {
            const ageInDays = (Date.now() - launch.getTime()) / (1000 * 60 * 60 * 24);
            return Math.floor(ageInDays);
        }

        return 0; // Unknown age = new protocol
    }

    /**
     * Check if protocol is on emergency pause
     */
    async checkEmergencyStatus(protocol, contractAddress) {
        try {
            // Check common pause patterns
            const contract = new ethers.Contract(
                contractAddress,
                ['function paused() view returns (bool)'],
                this.provider
            );

            const isPaused = await contract.paused();
            return { paused: isPaused, reason: isPaused ? 'Protocol is paused' : null };
        } catch (error) {
            // Contract might not have pause function
            return { paused: false, reason: null };
        }
    }

    /**
     * Get protocol risk metrics
     */
    async getProtocolRisk(protocol) {
        const validation = await this.validateProtocol(protocol);

        // Risk factors
        let riskScore = 10 - validation.trustScore; // Invert trust to get risk

        // Additional risk adjustments
        if (!validation.audited) riskScore += 2;
        if (validation.tvl < 10000000) riskScore += 1; // <$10M
        if (validation.protocolAge < 90) riskScore += 1; // <90 days

        return {
            protocol,
            riskScore: Math.min(10, Math.max(0, riskScore)),
            riskLevel: riskScore > 7 ? 'HIGH' : riskScore > 4 ? 'MEDIUM' : 'LOW',
            factors: {
                auditRisk: !validation.audited,
                tvlRisk: validation.tvl < this.requirements.minTVL,
                ageRisk: validation.protocolAge < this.requirements.minAge,
                socialRisk: !validation.socialVerified
            }
        };
    }

    /**
     * Cache management
     */
    getCached(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
}

module.exports = ProtocolValidator;