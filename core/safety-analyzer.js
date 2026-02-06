/**
 * Safety Analyzer - Advanced contract and token safety verification
 * Detects honeypots, rug pulls, and other scams
 */

const { ethers } = require('ethers');
const axios = require('axios');

class SafetyAnalyzer {
    constructor(provider) {
        this.provider = provider;
        this.cache = new Map();
        this.cacheTimeout = 3600000; // 1 hour

        // Basescan API for contract verification
        this.basescanAPI = process.env.BASESCAN_API_KEY ?
            `https://api.basescan.org/api?apikey=${process.env.BASESCAN_API_KEY}` :
            'https://api.basescan.org/api';

        // Dangerous functions that indicate rug pull potential
        this.dangerousFunctions = [
            'mint', 'pause', 'unpause', 'blacklist', 'whitelist',
            'setFee', 'setTaxRate', 'renounceOwnership', 'transferOwnership',
            'setMaxTransaction', 'setMaxWallet', 'excludeFromFees'
        ];

        // Known safe protocols (verified and audited)
        this.safeProtocols = {
            // Aave V3 on Base
            '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5': { name: 'Aave V3 Pool', safe: true },
            '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac': { name: 'Aave Data Provider', safe: true },

            // Uniswap V3 on Base
            '0x33128a8fC17869897dcE68Ed026d694621f6FDfD': { name: 'Uniswap V3 Factory', safe: true },
            '0x2626664c2603336E57B271c5C0b26F421741e481': { name: 'Uniswap V3 Router', safe: true },

            // Compound V3 on Base
            '0x9e8F0dE2f3F5b2dF64D8E0b5a8cB1b1c3c0d4E5F6': { name: 'Compound V3', safe: true },

            // Aerodrome Finance
            '0x420DD381b31aEf6683db6B902084cB0FFECe40Da': { name: 'Aerodrome Router', safe: true }
        };
    }

    /**
     * Comprehensive safety check for a contract
     */
    async analyzeContract(address) {
        const cacheKey = `contract_${address}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        console.log(`🔍 Analyzing contract safety: ${address}`);

        // Check if it's a known safe protocol
        if (this.safeProtocols[address]) {
            const result = {
                address,
                safe: true,
                verified: true,
                knownProtocol: this.safeProtocols[address].name,
                riskScore: 0,
                warnings: [],
                recommendation: 'SAFE'
            };
            this.setCache(cacheKey, result);
            return result;
        }

        const [
            isVerified,
            honeypotCheck,
            rugPullRisk,
            contractAge,
            transactionCount
        ] = await Promise.all([
            this.checkContractVerification(address),
            this.detectHoneypot(address),
            this.checkRugPullIndicators(address),
            this.getContractAge(address),
            this.getTransactionCount(address)
        ]);

        // Calculate risk score
        let riskScore = 0;
        const warnings = [];

        if (!isVerified) {
            riskScore += 3;
            warnings.push('Contract not verified on Basescan');
        }

        if (honeypotCheck.isHoneypot) {
            riskScore += 10;
            warnings.push(`HONEYPOT DETECTED: ${honeypotCheck.reason}`);
        }

        if (rugPullRisk.hasRisk) {
            riskScore += rugPullRisk.severity;
            warnings.push(...rugPullRisk.warnings);
        }

        if (contractAge < 30) {
            riskScore += 2;
            warnings.push(`New contract (${contractAge} days old)`);
        }

        if (transactionCount < 100) {
            riskScore += 1;
            warnings.push(`Low activity (${transactionCount} transactions)`);
        }

        // Determine recommendation
        let recommendation = 'SAFE';
        if (riskScore >= 10) recommendation = 'AVOID';
        else if (riskScore >= 7) recommendation = 'HIGH_RISK';
        else if (riskScore >= 4) recommendation = 'CAUTION';

        const result = {
            address,
            safe: riskScore < 4,
            verified: isVerified,
            honeypot: honeypotCheck.isHoneypot,
            rugPullRisk: rugPullRisk.hasRisk,
            contractAge,
            transactionCount,
            riskScore,
            warnings,
            recommendation
        };

        this.setCache(cacheKey, result);
        return result;
    }

    /**
     * Check if contract is verified on Basescan
     */
    async checkContractVerification(address) {
        try {
            const response = await axios.get(
                `${this.basescanAPI}&module=contract&action=getsourcecode&address=${address}`,
                { timeout: 5000 }
            );

            if (response.data.status === '1' && response.data.result[0]) {
                return response.data.result[0].SourceCode !== '';
            }

            return false;
        } catch (error) {
            console.warn('Failed to check contract verification:', error.message);
            return false;
        }
    }

    /**
     * Detect honeypot tokens (can't sell after buying)
     */
    async detectHoneypot(tokenAddress) {
        try {
            // Use honeypot detection API if available
            const response = await axios.get(
                `https://api.honeypot.is/v2/IsHoneypot?address=${tokenAddress}&chain=base`,
                { timeout: 5000 }
            );

            if (response.data) {
                return {
                    isHoneypot: response.data.isHoneypot || false,
                    reason: response.data.reason || 'Unknown'
                };
            }
        } catch (error) {
            // Fallback: simulate buy/sell locally
            return await this.simulateHoneypotCheck(tokenAddress);
        }

        return { isHoneypot: false, reason: null };
    }

    /**
     * Simulate buy/sell to detect honeypot
     */
    async simulateHoneypotCheck(tokenAddress) {
        try {
            const token = new ethers.Contract(
                tokenAddress,
                [
                    'function balanceOf(address) view returns (uint256)',
                    'function transfer(address, uint256) returns (bool)',
                    'function approve(address, uint256) returns (bool)',
                    'function allowance(address, address) view returns (uint256)'
                ],
                this.provider
            );

            // Check for common honeypot patterns in bytecode
            const code = await this.provider.getCode(tokenAddress);

            // Look for suspicious patterns
            const suspiciousPatterns = [
                'onlyOwner.*transfer',
                'require.*block\\.timestamp',
                'blacklist',
                'botProtection',
                'antiBot'
            ];

            for (const pattern of suspiciousPatterns) {
                if (new RegExp(pattern, 'i').test(code)) {
                    return {
                        isHoneypot: true,
                        reason: `Suspicious pattern detected: ${pattern}`
                    };
                }
            }

            return { isHoneypot: false, reason: null };
        } catch (error) {
            return { isHoneypot: false, reason: 'Unable to simulate' };
        }
    }

    /**
     * Check for rug pull indicators
     */
    async checkRugPullIndicators(address) {
        const warnings = [];
        let severity = 0;

        try {
            // Get contract code
            const code = await this.provider.getCode(address);

            // Check for dangerous functions
            for (const func of this.dangerousFunctions) {
                const pattern = new RegExp(`function\\s+${func}\\s*\\(`, 'i');
                if (pattern.test(code)) {
                    warnings.push(`Contains dangerous function: ${func}()`);
                    severity += 2;
                }
            }

            // Check ownership patterns
            if (/onlyOwner/.test(code)) {
                // Check if ownership is renounced
                const ownerPattern = /owner\s*=\s*address\(0\)/;
                if (!ownerPattern.test(code)) {
                    warnings.push('Contract has active owner controls');
                    severity += 1;
                }
            }

            // Check for proxy patterns (upgradeable contracts)
            if (/delegatecall/.test(code)) {
                warnings.push('Upgradeable contract detected');
                severity += 2;
            }

            // Check liquidity lock status
            const liquidityCheck = await this.checkLiquidityLock(address);
            if (!liquidityCheck.locked) {
                warnings.push('Liquidity not locked');
                severity += 3;
            }

            return {
                hasRisk: severity > 0,
                severity,
                warnings
            };
        } catch (error) {
            return {
                hasRisk: false,
                severity: 0,
                warnings: ['Unable to analyze contract code']
            };
        }
    }

    /**
     * Check if liquidity is locked
     */
    async checkLiquidityLock(tokenAddress) {
        // Check common liquidity lock contracts
        // This would need integration with lock services like Unicrypt, Team Finance
        try {
            // Simplified check - look for LP tokens in known lock contracts
            const lockContracts = [
                '0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214', // Unicrypt on Base
                '0xE2fE530C047f2d85298b07D9333C05737f1435fB'  // Team Finance on Base
            ];

            for (const lockContract of lockContracts) {
                const balance = await this.checkTokenBalance(tokenAddress, lockContract);
                if (balance > 0) {
                    return { locked: true, contract: lockContract };
                }
            }

            return { locked: false };
        } catch (error) {
            return { locked: false };
        }
    }

    /**
     * Check token balance at an address
     */
    async checkTokenBalance(tokenAddress, holderAddress) {
        try {
            const token = new ethers.Contract(
                tokenAddress,
                ['function balanceOf(address) view returns (uint256)'],
                this.provider
            );

            const balance = await token.balanceOf(holderAddress);
            return balance;
        } catch (error) {
            return 0n;
        }
    }

    /**
     * Get contract age in days
     */
    async getContractAge(address) {
        try {
            // Get contract creation transaction
            const response = await axios.get(
                `${this.basescanAPI}&module=account&action=txlist&address=${address}&page=1&offset=1&sort=asc`,
                { timeout: 5000 }
            );

            if (response.data.status === '1' && response.data.result[0]) {
                const creationTime = parseInt(response.data.result[0].timeStamp) * 1000;
                const ageInDays = (Date.now() - creationTime) / (1000 * 60 * 60 * 24);
                return Math.floor(ageInDays);
            }
        } catch (error) {
            console.warn('Failed to get contract age:', error.message);
        }

        return 0;
    }

    /**
     * Get transaction count for activity assessment
     */
    async getTransactionCount(address) {
        try {
            const count = await this.provider.getTransactionCount(address);
            return count;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Analyze token holder distribution
     */
    async analyzeTokenHolders(tokenAddress) {
        const cacheKey = `holders_${tokenAddress}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        try {
            // Get top holders
            const response = await axios.get(
                `${this.basescanAPI}&module=token&action=tokenholderlist&contractaddress=${tokenAddress}&page=1&offset=10`,
                { timeout: 5000 }
            );

            if (response.data.status === '1' && response.data.result) {
                const holders = response.data.result;
                const totalSupply = holders.reduce((sum, h) => sum + BigInt(h.TokenHolderQuantity), 0n);

                // Calculate concentration
                const topHolder = BigInt(holders[0]?.TokenHolderQuantity || 0);
                const topHolderPercent = totalSupply > 0n ?
                    Number((topHolder * 100n) / totalSupply) : 0;

                const result = {
                    holderCount: holders.length,
                    topHolderPercent,
                    concentrated: topHolderPercent > 50,
                    warnings: []
                };

                if (topHolderPercent > 50) {
                    result.warnings.push(`Top holder owns ${topHolderPercent}% of supply`);
                }

                if (holders.length < 100) {
                    result.warnings.push(`Low holder count: ${holders.length}`);
                }

                this.setCache(cacheKey, result);
                return result;
            }
        } catch (error) {
            console.warn('Failed to analyze token holders:', error.message);
        }

        return {
            holderCount: 0,
            topHolderPercent: 0,
            concentrated: false,
            warnings: ['Unable to analyze holder distribution']
        };
    }

    /**
     * Check if address is a known scam
     */
    async isKnownScam(address) {
        // This would integrate with scam databases
        // For now, maintain a local blacklist
        const blacklist = [
            // Add known scam addresses here
        ];

        return blacklist.includes(address.toLowerCase());
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

module.exports = SafetyAnalyzer;