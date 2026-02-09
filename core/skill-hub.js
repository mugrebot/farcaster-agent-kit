/**
 * SkillHub — Dynamic skill discovery, embedding search, on-chain registry, auto-install.
 *
 * - Local index: embeds skill descriptions using LLM embeddings
 * - Search: findSkill(query) — cosine similarity over embedded descriptions
 * - On-chain registry: reads from Skills Registry contract for community-staked skills
 * - Auto-discovery: searches hub when agent can't handle a task
 * - Install: downloads, audits, loads via createSkill()
 * - Caching: embeddings saved to data/skill-embeddings.json
 */

const fs = require('fs').promises;
const path = require('path');

const SKILLS_REGISTRY_ADDRESS = '0x2A4F92cb77fA5205179777a329B27421C2a8f2c5';
const MIN_STAKE = 100; // Minimum CLANKNET stake to auto-trust a skill
const EMBEDDINGS_CACHE_PATH = path.join(__dirname, '..', 'data', 'skill-embeddings.json');

class SkillHub {
    constructor(opts = {}) {
        this.secretsClient = opts.secretsClient || null;
        this.toolsManager = opts.toolsManager || null;
        this.networkSafety = opts.networkSafety || null;
        this.eventBus = opts.eventBus || null;
        this.provider = opts.provider || null;  // ethers provider for on-chain reads

        this._index = new Map();       // name → { description, embedding, source }
        this._embeddingCache = {};     // name → float[]
        this._initialized = false;
    }

    /**
     * Initialize: load cache, index existing skills.
     */
    async initialize() {
        // Load cached embeddings
        try {
            const raw = await fs.readFile(EMBEDDINGS_CACHE_PATH, 'utf8');
            this._embeddingCache = JSON.parse(raw);
        } catch {
            this._embeddingCache = {};
        }

        // Index existing loaded skills from tools manager
        if (this.toolsManager) {
            const skills = this.toolsManager.getLoadedSkills?.() || [];
            for (const skill of skills) {
                await this.indexSkill(skill.name, skill.description || skill.name);
            }
        }

        this._initialized = true;
        console.log(`🔍 SkillHub initialized (${this._index.size} skills indexed)`);
    }

    /**
     * Index a skill (generate or retrieve embedding for its description).
     */
    async indexSkill(name, description) {
        let embedding = this._embeddingCache[name];

        if (!embedding) {
            embedding = await this._embed(description);
            if (embedding) {
                this._embeddingCache[name] = embedding;
                await this._saveCache();
            }
        }

        this._index.set(name, {
            description,
            embedding: embedding || null,
            source: 'local',
        });
    }

    /**
     * Search for a skill by query. Returns best match or null.
     */
    async findSkill(query) {
        const queryEmbedding = await this._embed(query);
        if (!queryEmbedding) {
            // Fallback: keyword match
            return this._keywordSearch(query);
        }

        let bestMatch = null;
        let bestScore = -1;

        for (const [name, entry] of this._index) {
            if (!entry.embedding) continue;
            const score = this._cosineSimilarity(queryEmbedding, entry.embedding);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { name, description: entry.description, score, source: entry.source };
            }
        }

        // Threshold: only return if similarity > 0.5
        if (bestMatch && bestScore > 0.5) {
            return bestMatch;
        }

        // Try on-chain registry
        const onChainResult = await this._searchOnChain(query);
        if (onChainResult) return onChainResult;

        // Try remote API
        return this._searchRemote(query);
    }

    /**
     * Auto-discover and install a skill for a given query.
     * Returns true if skill was found and installed.
     */
    async findAndLoadSkill(query) {
        const match = await this.findSkill(query);
        if (!match) return null;

        // If it's already loaded locally, just return it
        if (match.source === 'local' && this.toolsManager) {
            return match;
        }

        // If from on-chain or remote, attempt to install
        if (match.code && this.toolsManager) {
            try {
                await this.toolsManager.createSkill(match.name, match.code, match.description);
                await this.indexSkill(match.name, match.description);

                if (this.eventBus) {
                    this.eventBus.publish('skill:executed', { skill: match.name, action: 'auto-installed' });
                }

                console.log(`🔍 Auto-installed skill: ${match.name} (source: ${match.source})`);
                return match;
            } catch (err) {
                console.warn(`🔍 Failed to install skill ${match.name}:`, err.message);
                return null;
            }
        }

        return match;
    }

    // ── Embedding ──

    async _embed(text) {
        if (!text) return null;

        // Route through secrets proxy for API key isolation
        if (this.secretsClient?.ready) {
            try {
                const result = await this.secretsClient.call('embedding', { text });
                return result.embedding;
            } catch {
                // Fallback: no embedding available
                return null;
            }
        }

        return null; // No embedding provider available
    }

    // ── Similarity ──

    _cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    // ── Keyword fallback search ──

    _keywordSearch(query) {
        const words = query.toLowerCase().split(/\s+/);
        let bestMatch = null;
        let bestScore = 0;

        for (const [name, entry] of this._index) {
            const desc = (entry.description || '').toLowerCase();
            const nameLower = name.toLowerCase();
            let score = 0;

            for (const word of words) {
                if (nameLower.includes(word)) score += 3;
                if (desc.includes(word)) score += 1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = { name, description: entry.description, score: score / 10, source: entry.source };
            }
        }

        return bestScore > 0 ? bestMatch : null;
    }

    // ── On-chain registry ──

    async _searchOnChain(query) {
        if (!this.provider) return null;

        try {
            const { ethers } = require('ethers');
            const abi = [
                'function getSkillCount() view returns (uint256)',
                'function getSkill(uint256 index) view returns (string name, string description, string ipfsHash, address author, uint256 stake)',
            ];
            const contract = new ethers.Contract(SKILLS_REGISTRY_ADDRESS, abi, this.provider);

            let count;
            try {
                count = await contract.getSkillCount();
            } catch {
                return null; // Contract might not be deployed or have this interface
            }

            const total = count.toNumber();
            const words = query.toLowerCase().split(/\s+/);

            for (let i = 0; i < Math.min(total, 50); i++) { // Cap at 50 skills
                try {
                    const skill = await contract.getSkill(i);
                    const nameMatch = words.some(w => skill.name.toLowerCase().includes(w));
                    const descMatch = words.some(w => skill.description.toLowerCase().includes(w));

                    if ((nameMatch || descMatch) && skill.stake.gte(ethers.utils.parseEther(String(MIN_STAKE)))) {
                        return {
                            name: skill.name,
                            description: skill.description,
                            ipfsHash: skill.ipfsHash,
                            author: skill.author,
                            stake: ethers.utils.formatEther(skill.stake),
                            source: 'on-chain',
                        };
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            // On-chain search failed — non-fatal
        }

        return null;
    }

    // ── Remote API ──

    async _searchRemote(query) {
        try {
            const axios = require('axios');
            const resp = await axios.get('https://clanknet.ai/api/skills?type=community', {
                timeout: 5000,
                params: { search: query },
            });

            if (resp.data?.skills?.length > 0) {
                const skill = resp.data.skills[0];
                return {
                    name: skill.name,
                    description: skill.description,
                    code: skill.code,
                    source: 'remote',
                    score: 0.6,
                };
            }
        } catch {
            // Remote search failed — non-fatal
        }

        return null;
    }

    // ── Cache persistence ──

    async _saveCache() {
        try {
            const dir = path.dirname(EMBEDDINGS_CACHE_PATH);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(EMBEDDINGS_CACHE_PATH, JSON.stringify(this._embeddingCache), 'utf8');
        } catch {
            // Best-effort
        }
    }

    /**
     * Get hub status.
     */
    status() {
        return {
            initialized: this._initialized,
            indexedSkills: this._index.size,
            cachedEmbeddings: Object.keys(this._embeddingCache).length,
        };
    }
}

module.exports = SkillHub;
