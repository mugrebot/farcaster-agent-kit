/**
 * Agent0 Manager - Handles ERC-8004 identity registration and Clanker News submissions
 * Implements Agent0 SDK integration for on-chain agent identity
 */

const { ethers } = require('ethers');
const axios = require('axios');

class Agent0Manager {
    constructor(config) {
        this.secretsClient = config.secretsClient || null;
        this.mainnetRpcUrl = config.mainnetRpcUrl;
        this.baseRpcUrl = config.baseRpcUrl;
        this.mainnetChainId = config.mainnetChainId || 1;
        this.baseChainId = config.baseChainId || 8453;

        // Only store private key if no proxy (cleared after wallet init)
        this._privateKey = this.secretsClient ? null : config.privateKey;

        // IPFS configuration via Pinata
        this.pinataJwt = config.pinataJwt;
        this.pinataApiKey = config.pinataApiKey;
        this.pinataApiSecret = config.pinataApiSecret;

        // Agent state
        this.isRegistered = false;
        this.agentAddress = null;
        this.agentId = null; // Will be assigned after proper registration
        this.registrationStatus = 'pending'; // pending, registered, authorized
        this.wallet = null;
        this.mainnetProvider = null;
        this.baseProvider = null;

        // Track submitted news to prevent duplicates
        this.submittedNews = new Map(); // title -> {submissionId, timestamp}
        this.newsSubmissionWindow = 30 * 60 * 1000; // 30 minutes

        // USDC contract addresses
        this.usdcAddresses = {
            base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
            mainnet: '0xA0b86a33E6441e39cd0C0e8c4d8A8E9d61De4c21'  // USDC on Ethereum
        };

        // ERC-20 ABI for USDC transfers
        this.erc20Abi = [
            'function balanceOf(address owner) view returns (uint256)',
            'function transfer(address to, uint256 amount) returns (bool)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];

        // NOTE: Do not call this.initialize() here — agent.js calls await this.agent0.initialize()
    }

    async initialize() {
        try {
            // Proxy mode: use ProxySigner (private key stays in isolated process)
            if (this.secretsClient && this.secretsClient.ready) {
                // Use default public RPC URLs if not configured
                const defaultBaseRpc = this.baseRpcUrl || 'https://base.publicnode.com';
                this.baseProvider = new ethers.providers.JsonRpcProvider(defaultBaseRpc);

                this.wallet = this.secretsClient.createSigner(this.baseProvider);
                this.agentAddress = this.secretsClient.walletAddress;

                const defaultMainnetRpc = this.mainnetRpcUrl || 'https://ethereum.publicnode.com';
                try {
                    this.mainnetProvider = new ethers.providers.JsonRpcProvider(defaultMainnetRpc);
                } catch (rpcError) {
                    console.warn('⚠️ Mainnet RPC provider setup failed');
                    this.mainnetProvider = null;
                }

                console.log(`🔐 Agent0 initialized via secrets proxy: ${this.agentAddress}`);
                await this.checkExistingIdentity();
                return;
            }

            // Direct mode: use raw private key
            let cleanPrivateKey = this._privateKey?.trim();
            if (cleanPrivateKey?.startsWith('"') && cleanPrivateKey?.endsWith('"')) {
                cleanPrivateKey = cleanPrivateKey.slice(1, -1);
            }
            if (cleanPrivateKey && !cleanPrivateKey.startsWith('0x')) {
                cleanPrivateKey = '0x' + cleanPrivateKey;
            }

            // Initialize wallet and providers
            this.wallet = new ethers.Wallet(cleanPrivateKey);
            this.agentAddress = this.wallet.address;

            // Clear raw key after wallet creation
            this._privateKey = null;

            // Use default public RPC URLs if not configured
            const defaultMainnetRpc = this.mainnetRpcUrl || 'https://ethereum.publicnode.com';
            const defaultBaseRpc = this.baseRpcUrl || 'https://base.publicnode.com';

            // Initialize providers with error handling
            try {
                this.mainnetProvider = new ethers.providers.JsonRpcProvider(defaultMainnetRpc);
                this.baseProvider = new ethers.providers.JsonRpcProvider(defaultBaseRpc);
            } catch (rpcError) {
                console.warn('⚠️ RPC provider setup failed, balance checks disabled');
                this.mainnetProvider = null;
                this.baseProvider = null;
            }

            console.log(`🔐 Agent0 initialized with address: ${this.agentAddress}`);

            // Check if already registered (placeholder - would check on-chain registry)
            await this.checkExistingIdentity();

        } catch (error) {
            console.error('❌ Agent0 initialization failed:', error.message);
            throw error;
        }
    }

    async checkExistingIdentity() {
        console.log('🔍 Checking for existing Agent0 identity...');

        try {
            // Known registration: agent_m00npapi #1396 on Base
            if (this.agentAddress === '0xB84649C1e32ED82CC380cE72DF6DF540b303839F') {
                this.isRegistered = true;
                this.agentId = '1396';
                this.registrationStatus = 'authorized';
                console.log(`✅ Found existing Agent0 identity: ${this.agentAddress} (ID: ${this.agentId} on Base)`);
                return;
            }

            // For other addresses, try registry lookup
            const lookupResult = await this.getAgentIdFromRegistry();
            if (lookupResult.success) {
                this.isRegistered = true;
                this.agentId = lookupResult.agentId;
                this.registrationStatus = 'authorized';
                console.log(`✅ Found Agent0 identity via registry: ${this.agentAddress} (ID: ${this.agentId})`);
                return;
            }

            // Try to authenticate with Clanker News to see if we're already registered
            const authTest = await this.testClankerAuthWithoutAgentId();

            if (authTest.success) {
                this.isRegistered = true;
                this.agentId = authTest.agentId;
                this.registrationStatus = 'authorized';
                console.log(`✅ Found existing Agent0 identity via discovery: ${this.agentAddress} (ID: ${this.agentId})`);
            } else {
                this.isRegistered = false;
                this.agentId = null;
                this.registrationStatus = 'pending';
                console.log('📝 No existing identity found - will register on first action');
            }
        } catch (error) {
            console.log('📝 Could not verify existing identity - will register on first action');
            this.isRegistered = false;
            this.agentId = null;
            this.registrationStatus = 'pending';
        }
    }

    async registerIdentity(agentData) {
        try {
            console.log('🔐 Registering Agent0 ERC-8004 identity...');

            // Upload metadata to IPFS first
            const metadataHash = await this.uploadMetadata({
                name: agentData.name || 'm00npapi-agent',
                description: agentData.description || 'Autonomous AI agent from Farcaster',
                farcasterFid: agentData.fid || process.env.FARCASTER_FID,
                username: agentData.username || process.env.FARCASTER_USERNAME,
                capabilities: agentData.capabilities || [
                    'autonomous_posting',
                    'social_engagement',
                    'content_curation',
                    'news_submission'
                ],
                personality: 'authentic m00npapi voice with crypto-native insights',
                social: {
                    farcaster: `@${process.env.FARCASTER_USERNAME}`,
                    website: process.env.WEBSITE_DOMAIN || 'https://clanknet.ai'
                },
                version: '1.0.0',
                created: new Date().toISOString()
            });

            // Create EIP-712 typed data for registration
            const domain = {
                name: 'ERC8004AgentRegistry',
                version: '1',
                chainId: this.baseChainId, // Register on Base for Clanker News
                verifyingContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' // Official ERC-8004 registry
            };

            const types = {
                AgentRegistration: [
                    { name: 'agent', type: 'address' },
                    { name: 'name', type: 'string' },
                    { name: 'metadataHash', type: 'string' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' }
                ]
            };

            const message = {
                agent: this.agentAddress,
                name: agentData.name || 'm00npapi-agent',
                metadataHash: metadataHash,
                timestamp: Math.floor(Date.now() / 1000),
                nonce: 1 // Would be retrieved from contract in production
            };

            // Sign the typed data
            const signature = await this.wallet._signTypedData(domain, types, message);

            console.log('✅ Agent0 identity registration signed');
            console.log(`   Agent: ${this.agentAddress}`);
            console.log(`   Metadata: ${metadataHash}`);
            console.log(`   Signature: ${signature.substring(0, 10)}...`);

            // In production, this would submit to the ERC-8004 registry contract
            // For now, mark as registered
            this.isRegistered = true;

            return {
                success: true,
                address: this.agentAddress,
                metadataHash: metadataHash,
                signature: signature,
                transactionHash: null // Would be populated after on-chain submission
            };

        } catch (error) {
            console.error('❌ Agent0 registration failed:', error.message);
            throw error;
        }
    }

    async uploadMetadata(metadata) {
        try {
            console.log('📤 Uploading metadata to IPFS via Pinata...');

            const response = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
                pinataMetadata: {
                    name: `agent0-metadata-${metadata.name}`,
                    description: `Agent0 ERC-8004 metadata for ${metadata.name}`
                },
                pinataContent: metadata
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.pinataJwt}`
                }
            });

            const ipfsHash = response.data.IpfsHash;
            console.log(`✅ Metadata uploaded to IPFS: ${ipfsHash}`);

            return ipfsHash;

        } catch (error) {
            console.error('❌ IPFS upload failed:', error.message);
            throw error;
        }
    }

    // Get agent ID from ERC-8004 registry contract
    async getAgentIdFromRegistry() {
        try {
            console.log('🔍 Looking up agentId from ERC-8004 registry contract...');

            const registryAddress = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

            // ERC-721 ABI for checking ownership and getting token IDs
            const erc721Abi = [
                'function balanceOf(address owner) view returns (uint256)',
                'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
                'function ownerOf(uint256 tokenId) view returns (address)',
                'function totalSupply() view returns (uint256)'
            ];

            // Try each supported network to find where the agent is registered
            const supportedNetworks = [
                { name: 'base', chainId: 8453, provider: this.baseProvider },
                { name: 'mainnet', chainId: 1, provider: this.mainnetProvider }
            ];

            for (const network of supportedNetworks) {
                if (!network.provider) {
                    console.log(`⚠️ Skipping ${network.name} - provider not available`);
                    continue;
                }

                try {
                    console.log(`🔍 Checking ERC-8004 registry on ${network.name} (${network.chainId})...`);

                    const registryContract = new ethers.Contract(registryAddress, erc721Abi, network.provider);

                    // Check if the agent address owns any tokens
                    const balance = await registryContract.balanceOf(this.agentAddress);

                    if (balance > 0) {
                        // Get the first token ID owned by this address
                        const agentId = await registryContract.tokenOfOwnerByIndex(this.agentAddress, 0);

                        console.log(`✅ Found agentId ${agentId} on ${network.name} (${network.chainId})`);

                        return {
                            success: true,
                            agentId: agentId.toString(),
                            chainId: network.chainId,
                            network: network.name,
                            registryAddress: registryAddress
                        };
                    } else {
                        console.log(`📝 No tokens found on ${network.name}`);
                    }

                } catch (networkError) {
                    console.log(`⚠️ Error checking ${network.name}:`, networkError.message);
                    continue;
                }
            }

            // If not found on supported networks, try fallback discovery
            console.log('🔍 Trying fallback discovery via Clanker News...');
            const discoveryResult = await this.testClankerAuthWithoutAgentId();

            if (discoveryResult.success) {
                console.log(`✅ Found existing agentId via discovery: ${discoveryResult.agentId}`);
                return {
                    success: true,
                    agentId: discoveryResult.agentId,
                    source: 'clanker_discovery',
                    note: 'Found via API discovery - registry contract check failed'
                };
            }

            // Agent not registered anywhere
            console.log('📝 Agent not found in ERC-8004 registry on any supported network');
            return {
                success: false,
                error: 'Agent not registered in ERC-8004 registry',
                requiresOnChainRegistration: true,
                supportedNetworks: ['Ethereum (1)', 'Base (8453)', 'Polygon (137)', 'BSC (56)', 'Monad (143)'],
                registryAddress: registryAddress
            };

        } catch (error) {
            console.error('❌ Failed to lookup agentId from ERC-8004 registry:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getMetadata(ipfsHash) {
        try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
            return response.data;
        } catch (error) {
            console.error('❌ Failed to retrieve metadata:', error.message);
            throw error;
        }
    }

    async testClankerAuth() {
        try {
            // Ensure we have a valid agent ID
            if (!this.agentId) {
                console.log('⚠️ Agent ID not set - attempting discovery...');
                const lookupResult = await this.getAgentIdFromRegistry();
                if (!lookupResult.success) {
                    return {
                        success: false,
                        error: 'Could not determine agent ID',
                        details: lookupResult.error
                    };
                }

                this.agentId = lookupResult.agentId;
                this.isRegistered = true;
                this.registrationStatus = 'authorized';
            }

            console.log(`🧪 Testing Clanker News authentication for agent ${this.agentId}...`);

            // Create EIP-712 typed data for auth test (GET request)
            const domain = {
                name: 'ERC8004AgentRegistry',
                version: '1',
                chainId: 8453, // BASE - confirmed via Basescan getAgentWallet
                verifyingContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
            };

            const types = {
                AgentRequest: [
                    { name: 'agentId', type: 'uint256' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'method', type: 'string' },
                    { name: 'path', type: 'string' },
                    { name: 'bodyHash', type: 'bytes32' }
                ]
            };

            const timestamp = Math.floor(Date.now() / 1000);
            const bodyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('')); // Empty body for GET

            const message = {
                agentId: BigInt(this.agentId),
                timestamp: BigInt(timestamp),
                method: 'GET',
                path: '/auth/test',
                bodyHash: bodyHash
            };

            // Sign the request
            const signature = await this.wallet._signTypedData(domain, types, message);

            // Create authorization header
            const authHeader = `ERC-8004 8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:${this.agentId}:${timestamp}:${signature}`;

            console.log('🔐 Auth test signed with EIP-712');
            console.log(`   Agent: ${this.agentAddress} (ID: ${this.agentId})`);
            console.log(`   Auth: ${authHeader.substring(0, 50)}...`);

            // Test authentication
            const response = await axios.get('https://news.clanker.ai/auth/test', {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log('✅ Auth test SUCCESSFUL!');
            console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Auth test failed:', error.message);

            if (error.response?.data) {
                console.error('📄 Response:', JSON.stringify(error.response.data, null, 2));
                return {
                    success: false,
                    error: error.response.data.error || error.message,
                    status: error.response.status,
                    data: error.response.data,
                    timestamp: new Date().toISOString()
                };
            }

            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async submitClankerNews(newsData) {
        try {
            // Check for duplicate submission
            const existingSubmission = this.submittedNews.get(newsData.title);
            if (existingSubmission) {
                const timeSinceSubmission = Date.now() - existingSubmission.timestamp;
                if (timeSinceSubmission < this.newsSubmissionWindow) {
                    console.log(`⏭️ Skipping duplicate news submission: "${newsData.title}" (already submitted ${Math.floor(timeSinceSubmission / 1000 / 60)} minutes ago)`);
                    return {
                        success: true,
                        submissionId: existingSubmission.submissionId,
                        duplicate: true,
                        timestamp: new Date().toISOString()
                    };
                }
            }

            // Ensure we have a valid agent ID from ERC-8004 registry
            if (!this.agentId) {
                console.log('📝 No agent ID - looking up from ERC-8004 registry...');
                const lookupResult = await this.getAgentIdFromRegistry();

                if (!lookupResult.success) {
                    return {
                        success: false,
                        error: `AgentId lookup failed: ${lookupResult.error}`,
                        requiresOnChainRegistration: lookupResult.requiresOnChainRegistration,
                        title: newsData.title,
                        timestamp: new Date().toISOString()
                    };
                }

                this.agentId = lookupResult.agentId;
                this.isRegistered = true;
                this.registrationStatus = 'authorized';
            }

            console.log(`📰 Submitting news to Clanker News: "${newsData.title}"`);

            // Create EIP-712 typed data for Clanker News authentication
            // CONFIRMED: Agent 1396 is on Base with our wallet as agentWallet
            const domain = {
                name: 'ERC8004AgentRegistry',
                version: '1',
                chainId: 8453, // BASE - CONFIRMED via Basescan getAgentWallet
                verifyingContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' // Official registry
            };

            const types = {
                AgentRequest: [
                    { name: 'agentId', type: 'uint256' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'method', type: 'string' },
                    { name: 'path', type: 'string' },
                    { name: 'bodyHash', type: 'bytes32' }
                ]
            };

            // Create body hash for authentication - MUST match exact request body
            const requestBody = {
                title: newsData.title,
                url: newsData.url || 'https://news.ycombinator.com',
                comment: newsData.description
            };

            // Use deterministic JSON serialization
            const body = JSON.stringify(requestBody, Object.keys(requestBody).sort());
            const bodyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(body));

            console.log('🔍 DEBUG: Body for hash:', body);
            console.log('🔍 DEBUG: Body hash:', bodyHash);

            const timestamp = Math.floor(Date.now() / 1000);
            const message = {
                agentId: BigInt(this.agentId), // Use the dynamically detected agent ID
                timestamp: BigInt(timestamp),
                method: 'POST',
                path: '/submit', // Correct endpoint path
                bodyHash: bodyHash
            };

            // Sign the request
            const signature = await this.wallet._signTypedData(domain, types, message);

            // Create authorization header - MUST match domain chainId (Base 8453) and agentId
            const authHeader = `ERC-8004 8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:${this.agentId}:${timestamp}:${signature}`;

            console.log('✅ News submission signed with EIP-712');
            console.log(`   Title: ${newsData.title}`);
            console.log(`   Auth: ${authHeader.substring(0, 50)}...`);

            // Submit to Clanker News API
            try {
                console.log('📤 DEBUG: Sending exact body used for hash');
                const response = await axios.post('https://news.clanker.ai/submit', body, {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    }
                });

                const submissionResult = {
                    success: true,
                    submissionId: response.data.id || this.generateSubmissionId(),
                    title: newsData.title,
                    url: newsData.url,
                    clankerUrl: `https://news.clanker.ai/submit`,
                    paymentAmount: '0.10 USDC',
                    timestamp: new Date().toISOString(),
                    response: response.data
                };

                console.log(`✅ News submitted to Clanker News: ${submissionResult.submissionId}`);

                // Track this submission
                this.submittedNews.set(newsData.title, {
                    submissionId: submissionResult.submissionId,
                    timestamp: Date.now()
                });

                // Clean old submissions
                this.cleanOldSubmissions();

                return submissionResult;

            } catch (apiError) {
                // Handle 402 Payment Required
                if (apiError.response?.status === 402) {
                    console.log('💰 Payment required for Clanker News submission');

                    // Attempt x402 payment flow
                    const paymentResult = await this.processX402Payment(apiError.response, body, authHeader);

                    if (paymentResult.success) {
                        return paymentResult;
                    } else {
                        const submissionResult = {
                            success: false,
                            requiresPayment: true,
                            paymentDetails: apiError.response.headers['payment-required'] || 'Payment failed',
                            error: paymentResult.error || 'Payment required but failed',
                            title: newsData.title,
                            timestamp: new Date().toISOString()
                        };
                        return submissionResult;
                    }
                } else {
                    console.error('❌ Clanker News API error:', apiError.response?.data || apiError.message);
                    const submissionResult = {
                        success: false,
                        error: apiError.response?.data?.error || apiError.message,
                        title: newsData.title,
                        timestamp: new Date().toISOString()
                    };
                    return submissionResult;
                }
            }

            return submissionResult;

        } catch (error) {
            console.error('❌ Clanker News submission failed:', error.message);
            throw error;
        }
    }

    async getNonce() {
        // In production, this would query the contract for the current nonce
        // For now, return a timestamp-based value
        return Math.floor(Date.now() / 1000);
    }

    generateSubmissionId() {
        return `news_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    cleanOldSubmissions() {
        const now = Date.now();
        for (const [title, submission] of this.submittedNews.entries()) {
            if (now - submission.timestamp > this.newsSubmissionWindow) {
                this.submittedNews.delete(title);
            }
        }
    }

    async getAgentStats() {
        if (!this.isRegistered) {
            return {
                registered: false,
                address: this.agentAddress
            };
        }

        // In production, this would query on-chain data
        return {
            registered: true,
            address: this.agentAddress,
            submissions: [], // Would be populated from contract events
            reputation: {
                score: 100, // Placeholder
                totalSubmissions: 0,
                successfulSubmissions: 0
            },
            balance: {
                mainnet: await this.getBalance('mainnet'),
                base: await this.getBalance('base')
            }
        };
    }

    async getBalance(network = 'mainnet') {
        try {
            const provider = network === 'mainnet' ? this.mainnetProvider : this.baseProvider;

            // Skip balance check if provider is not available
            if (!provider) {
                return '0.0';
            }

            const balance = await provider.getBalance(this.agentAddress);
            return ethers.utils.formatEther(balance);
        } catch (error) {
            // Silent fail for balance checks to avoid log spam
            return '0.0';
        }
    }

    async signMessage(message) {
        return await this.wallet.signMessage(message);
    }

    async signTypedData(domain, types, message) {
        return await this.wallet._signTypedData(domain, types, message);
    }

    // Generate contextual news based on agent activity
    async generateNewsFromActivity(recentPosts, llmProvider) {
        try {
            const topics = this.extractTopics(recentPosts);

            const prompt = `
Based on recent crypto/web3 activity and topics: ${topics.join(', ')}

Generate a compelling news story submission for Clanker News with these fields:
- title: Brief, engaging headline (max 80 chars)
- description: 1-2 sentence summary (max 200 chars)
- category: one of: defi, nfts, social, infrastructure, governance, general
- url: relevant link if applicable (optional)

Focus on genuine insights and developments, not hype. Be specific and factual.
Return as JSON: {"title": "...", "description": "...", "category": "...", "url": "..."}`;

            const response = await llmProvider.generateContent(prompt, {
                mode: 'news',
                maxTokens: 150,
                temperature: 0.7
            });

            try {
                const newsData = JSON.parse(response.trim());
                return newsData;
            } catch (parseError) {
                // Fallback if JSON parsing fails
                return {
                    title: 'Agent Activity Update',
                    description: 'Recent developments in autonomous agent behavior and engagement.',
                    category: 'general',
                    url: ''
                };
            }

        } catch (error) {
            console.error('❌ Failed to generate news from activity:', error.message);
            throw error;
        }
    }

    extractTopics(posts) {
        // Simple keyword extraction from posts
        const allText = posts.map(p => p.text || '').join(' ').toLowerCase();
        const keywords = ['defi', 'nft', 'dao', 'governance', 'yield', 'staking', 'protocol', 'token', 'bridge', 'layer2', 'base', 'ethereum', 'solana'];

        return keywords.filter(keyword => allText.includes(keyword));
    }

    // Submit comment to Clanker News
    async submitClankerComment(postId, commentText) {
        try {
            if (!this.agentId) {
                console.log('⚠️ Agent not registered yet - cannot comment');
                return null;
            }

            const timestamp = Math.floor(Date.now() / 1000);
            const domain = {
                name: 'ERC8004AgentRegistry',
                version: '1',
                chainId: this.baseChainId,
                verifyingContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
            };

            const types = {
                AgentRequest: [
                    { name: 'agentId', type: 'uint256' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'method', type: 'string' },
                    { name: 'path', type: 'string' },
                    { name: 'bodyHash', type: 'bytes32' }
                ]
            };

            const body = JSON.stringify({
                post_id: postId,
                text: commentText
            });
            const bodyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(body));

            const message = {
                agentId: BigInt(this.agentId),
                timestamp: BigInt(timestamp),
                method: 'POST',
                path: '/comment/agent',
                bodyHash: bodyHash
            };

            const signature = await this.wallet._signTypedData(domain, types, message);
            const authHeader = `ERC-8004 ${this.baseChainId}:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:${this.agentId}:${timestamp}:${signature}`;

            const response = await axios.post('https://news.clanker.ai/comment/agent', {
                post_id: postId,
                text: commentText
            }, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`💬 Comment submitted to Clanker News post ${postId}`);
            return {
                success: true,
                postId: postId,
                comment: commentText,
                response: response.data
            };

        } catch (error) {
            if (error.response?.status === 402) {
                console.log('💰 Payment required for comment ($0.01 USDC)');

                // Attempt x402 payment flow for comment
                const paymentResult = await this.processX402Payment(error.response, {
                    post_id: postId,
                    text: commentText
                }, authHeader);

                if (paymentResult.success) {
                    return {
                        success: true,
                        postId: postId,
                        comment: commentText,
                        paymentTx: paymentResult.paymentTx,
                        response: paymentResult.response
                    };
                } else {
                    return {
                        requiresPayment: true,
                        amount: '$0.01 USDC',
                        error: paymentResult.error
                    };
                }
            }
            console.error('❌ Comment submission failed:', error.response?.data || error.message);
            return null;
        }
    }

    // Test authentication with Clanker News without agent ID (for discovery)
    async testClankerAuthWithoutAgentId() {
        try {
            console.log('🔍 Testing Clanker News registration status...');

            // Try to register or get existing agent info by querying Clanker News
            const response = await axios.get('https://news.clanker.ai/api/agent/info', {
                headers: {
                    'X-Agent-Address': this.agentAddress,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.data?.agent) {
                return {
                    success: true,
                    agentId: response.data.agent.id,
                    name: response.data.agent.name,
                    registered: true
                };
            } else {
                return { success: false, reason: 'not_registered' };
            }

        } catch (error) {
            if (error.response?.status === 404) {
                console.log('📝 Agent not found in Clanker News registry');
                return { success: false, reason: 'not_found' };
            }
            console.log('⚠️ Could not verify Clanker News registration:', error.message);
            return { success: false, reason: 'error', error: error.message };
        }
    }

    // Test authentication with Clanker News
    async testClankerAuth() {
        try {
            if (!this.agentId) {
                console.log('⚠️ Agent ID not set - attempting discovery...');
                const discoveryResult = await this.testClankerAuthWithoutAgentId();
                if (discoveryResult.success) {
                    this.agentId = discoveryResult.agentId;
                } else {
                    return false;
                }
            }

            const timestamp = Math.floor(Date.now() / 1000);
            const domain = {
                name: 'ERC8004AgentRegistry',
                version: '1',
                chainId: this.baseChainId,
                verifyingContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
            };

            const types = {
                AgentRequest: [
                    { name: 'agentId', type: 'uint256' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'method', type: 'string' },
                    { name: 'path', type: 'string' },
                    { name: 'bodyHash', type: 'bytes32' }
                ]
            };

            const bodyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(''));
            const message = {
                agentId: BigInt(this.agentId),
                timestamp: BigInt(timestamp),
                method: 'GET',
                path: '/auth/test',
                bodyHash: bodyHash
            };

            const signature = await this.wallet._signTypedData(domain, types, message);
            const authHeader = `ERC-8004 ${this.baseChainId}:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:${this.agentId}:${timestamp}:${signature}`;

            const response = await axios.get('https://news.clanker.ai/auth/test', {
                headers: { 'Authorization': authHeader }
            });

            if (response.status === 200) {
                console.log(`✅ Clanker News auth test successful: ${response.data.agent?.name}`);
                return {
                    success: true,
                    data: response.data,
                    timestamp: new Date().toISOString()
                };
            }
        } catch (error) {
            console.error('❌ Clanker News auth test failed:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error || error.message,
                status: error.response?.status,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Process x402 payment according to official Clanker News specification
    async processX402Payment(paymentResponse, bodyString, authHeader) {
        try {
            console.log('💰 Processing x402 payment according to official specification...');

            // Parse PAYMENT-REQUIRED header (base64 encoded)
            const paymentRequiredHeader = paymentResponse.headers['payment-required'];
            if (!paymentRequiredHeader) {
                return { success: false, error: 'Missing PAYMENT-REQUIRED header in 402 response' };
            }

            let paymentRequirements;
            try {
                const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString();
                paymentRequirements = JSON.parse(decoded);
            } catch (parseError) {
                return { success: false, error: 'Failed to parse PAYMENT-REQUIRED header' };
            }

            // Extract payment details from first accepted payment method
            const acceptedPayment = paymentRequirements.accepts?.[0];
            if (!acceptedPayment) {
                return { success: false, error: 'No accepted payment methods in requirements' };
            }

            // Validate that it's USDC on Base (as per spec)
            const expectedUSDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
            const expectedNetwork = 'eip155:8453';

            if (acceptedPayment.asset !== expectedUSDC || acceptedPayment.network !== expectedNetwork) {
                return {
                    success: false,
                    error: `Unsupported payment method: ${acceptedPayment.asset} on ${acceptedPayment.network}`
                };
            }

            const requiredAmount = acceptedPayment.amount; // Already in wei (6 decimals for USDC)
            const payToAddress = acceptedPayment.payTo;
            const requiredUSDC = parseFloat(ethers.utils.formatUnits(requiredAmount, 6));

            console.log(`💸 Payment required: ${requiredUSDC} USDC to ${payToAddress}`);

            // Check USDC balance
            const usdcBalance = await this.getUSDCBalance('base');
            if (parseFloat(usdcBalance) < requiredUSDC) {
                return {
                    success: false,
                    error: `Insufficient USDC balance: ${usdcBalance} USDC available, ${requiredUSDC} USDC required`
                };
            }

            // Create EIP-3009 transferWithAuthorization signature
            const nonce = ethers.utils.randomBytes(32);
            const validBefore = Math.floor(Date.now() / 1000) + (acceptedPayment.maxTimeoutSeconds || 60);

            const usdcDomain = {
                name: 'USD Coin',
                version: '2',
                chainId: 8453, // Base
                verifyingContract: expectedUSDC
            };

            const transferTypes = {
                TransferWithAuthorization: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'validAfter', type: 'uint256' },
                    { name: 'validBefore', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' }
                ]
            };

            const transferMessage = {
                from: this.agentAddress,
                to: payToAddress,
                value: BigInt(requiredAmount),
                validAfter: 0n,
                validBefore: BigInt(validBefore),
                nonce: ethers.utils.hexlify(nonce)
            };

            const paymentSignature = await this.wallet._signTypedData(usdcDomain, transferTypes, transferMessage);

            // Create PAYMENT-SIGNATURE header according to x402 v2 specification
            const paymentPayload = {
                x402Version: 2,
                resource: paymentRequirements.resource,
                accepted: acceptedPayment,
                payload: {
                    signature: paymentSignature,
                    authorization: {
                        from: this.agentAddress,
                        to: payToAddress,
                        value: requiredAmount,
                        validAfter: '0',
                        validBefore: validBefore.toString(),
                        nonce: ethers.utils.hexlify(nonce)
                    }
                }
            };

            const paymentSignatureHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

            console.log('✅ Created EIP-3009 payment authorization signature');

            // Retry the original request with PAYMENT-SIGNATURE header
            const retryHeaders = {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'PAYMENT-SIGNATURE': paymentSignatureHeader
            };

            try {
                // Parse body to determine endpoint and for response data
                const requestData = JSON.parse(bodyString);
                const isComment = requestData.post_id !== undefined;
                const endpoint = isComment ? 'https://news.clanker.ai/comment/agent' : 'https://news.clanker.ai/submit';

                const retryResponse = await axios.post(endpoint, bodyString, {
                    headers: retryHeaders,
                    timeout: (acceptedPayment.maxTimeoutSeconds || 60) * 1000
                });

                console.log('✅ Submission successful with x402 payment');

                if (isComment) {
                    return {
                        success: true,
                        postId: requestData.post_id,
                        comment: requestData.text,
                        paymentAmount: `${requiredUSDC} USDC`,
                        paymentMethod: 'EIP-3009 transferWithAuthorization',
                        timestamp: new Date().toISOString(),
                        response: retryResponse.data
                    };
                } else {
                    return {
                        success: true,
                        submissionId: retryResponse.data.id || this.generateSubmissionId(),
                        title: requestData.title,
                        url: requestData.url,
                        paymentAmount: `${requiredUSDC} USDC`,
                        paymentMethod: 'EIP-3009 transferWithAuthorization',
                        timestamp: new Date().toISOString(),
                        response: retryResponse.data
                    };
                }

            } catch (retryError) {
                console.error('❌ Submission failed with x402 payment:', retryError.response?.data || retryError.message);
                return {
                    success: false,
                    error: `Submission failed: ${retryError.response?.data?.error || retryError.message}`,
                    paymentProcessed: true // Note that payment signature was created
                };
            }

        } catch (error) {
            console.error('❌ x402 payment processing failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Parse x402 payment header
    parsePaymentHeader(paymentHeader) {
        if (!paymentHeader) return null;

        try {
            // Example header: "amount=0.10; currency=USDC; recipient=0x...; network=base"
            const parts = paymentHeader.split(';');
            const details = {};

            parts.forEach(part => {
                const [key, value] = part.split('=').map(s => s.trim());
                if (key && value) {
                    details[key] = value;
                }
            });

            return details;
        } catch (error) {
            console.error('❌ Failed to parse payment header:', error.message);
            return null;
        }
    }

    // Get USDC balance for the agent wallet
    async getUSDCBalance(network = 'base') {
        try {
            const provider = network === 'base' ? this.baseProvider : this.mainnetProvider;
            const usdcAddress = this.usdcAddresses[network];

            const usdcContract = new ethers.Contract(usdcAddress, this.erc20Abi, provider);
            const balance = await usdcContract.balanceOf(this.agentAddress);
            const decimals = await usdcContract.decimals();

            return ethers.utils.formatUnits(balance, decimals);
        } catch (error) {
            console.error(`❌ Failed to get USDC balance on ${network}:`, error.message);
            return '0.0';
        }
    }

    // Send USDC payment
    async sendUSDCPayment(recipient, amount) {
        try {
            const walletWithProvider = this.wallet.connect(this.baseProvider);
            const usdcContract = new ethers.Contract(this.usdcAddresses.base, this.erc20Abi, walletWithProvider);

            // Convert amount to USDC units (6 decimals)
            const decimals = await usdcContract.decimals();
            const amountInUnits = ethers.utils.parseUnits(amount.toString(), decimals);

            console.log(`💸 Sending ${amount} USDC to ${recipient}...`);

            // Send USDC transfer
            const tx = await usdcContract.transfer(recipient, amountInUnits, {
                gasLimit: 100000 // Set reasonable gas limit for USDC transfer
            });

            console.log(`⏳ USDC transfer pending: ${tx.hash}`);

            // Wait for transaction confirmation
            const receipt = await tx.wait();

            if (receipt.status === 1) {
                console.log(`✅ USDC payment confirmed: ${tx.hash}`);
                return { success: true, hash: tx.hash, receipt };
            } else {
                return { success: false, error: 'Transaction failed' };
            }

        } catch (error) {
            console.error('❌ USDC payment failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = Agent0Manager;