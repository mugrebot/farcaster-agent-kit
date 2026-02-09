/**
 * ThinkingLevels — 6-level reasoning budget control for the CLANKNET agent.
 *
 * Maps thinking levels to LLM parameters (temperature, max_tokens, system behavior).
 * Per-session override via `/think:<level>` in TG. Per-request via gateway API.
 */

const LEVELS = {
    off: {
        temperature: 0,
        maxTokens: 100,
        systemSuffix: '',
        description: 'No reasoning — fastest, cheapest. Deterministic output.',
    },
    minimal: {
        temperature: 0.3,
        maxTokens: 200,
        systemSuffix: '',
        description: 'Light reasoning — quick assessments.',
    },
    low: {
        temperature: 0.5,
        maxTokens: 500,
        systemSuffix: '',
        description: 'Basic reasoning — standard responses.',
    },
    medium: {
        temperature: 0.7,
        maxTokens: 1000,
        systemSuffix: '',
        description: 'Balanced reasoning — default level.',
    },
    high: {
        temperature: 0.8,
        maxTokens: 2000,
        systemSuffix: '\n\nThink step-by-step before answering. Consider multiple angles and edge cases.',
        description: 'Deep reasoning — extended analysis.',
    },
    xhigh: {
        temperature: 0.9,
        maxTokens: 4000,
        systemSuffix: '\n\nThink step-by-step before answering. Consider multiple perspectives, edge cases, and potential failure modes. After forming your answer, critique it and revise if needed.',
        description: 'Maximum reasoning — chain-of-thought with self-critique.',
    },
};

const DEFAULT_LEVEL = 'medium';
const VALID_LEVELS = Object.keys(LEVELS);

/**
 * Get LLM parameters for a given thinking level.
 */
function getParams(level) {
    const normalized = (level || DEFAULT_LEVEL).toLowerCase();
    return LEVELS[normalized] || LEVELS[DEFAULT_LEVEL];
}

/**
 * Parse a `/think:<level>` command from text. Returns level string or null.
 */
function parseCommand(text) {
    const match = text.match(/^\/think:(\w+)/i);
    if (!match) return null;
    const level = match[1].toLowerCase();
    return VALID_LEVELS.includes(level) ? level : null;
}

/**
 * Apply thinking level params to an existing LLM options object.
 * Returns a new object (does not mutate).
 */
function applyToOptions(opts, level) {
    const params = getParams(level);
    return {
        ...opts,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        thinkingLevel: level || DEFAULT_LEVEL,
        _systemSuffix: params.systemSuffix,
    };
}

module.exports = {
    LEVELS,
    VALID_LEVELS,
    DEFAULT_LEVEL,
    getParams,
    parseCommand,
    applyToOptions,
};
