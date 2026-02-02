/**
 * Anti-Clanker Protection Module
 * Prevents agents from interacting with @clanker to avoid spam
 */

class AntiClankerProtection {
    constructor() {
        this.bannedPatterns = [
            /@clanker/i,
            /launch.*token/i,
            /deploy.*token/i,
            /create.*token/i,
            /token.*launch/i,
            /ticker.*\$/i,
            /symbol.*\$/i
        ];

        this.clankerFids = [
            11517, // Known clanker FID
        ];

        this.warningMessages = [
            "⚠️ Agent cannot interact with @clanker",
            "🚫 Token launching is forbidden for agents",
            "❌ Clanker interactions are blocked"
        ];
    }

    /**
     * Check if content violates anti-clanker rules
     */
    scanContent(text) {
        const violations = [];

        for (const pattern of this.bannedPatterns) {
            if (pattern.test(text)) {
                violations.push({
                    type: 'content',
                    pattern: pattern.toString(),
                    text: text.substring(0, 100) + '...'
                });
            }
        }

        return {
            isViolation: violations.length > 0,
            violations,
            severity: violations.length > 2 ? 'high' : 'medium'
        };
    }

    /**
     * Check if trying to reply to clanker
     */
    scanReply(parentCast) {
        if (!parentCast || !parentCast.author) {
            return { isViolation: false };
        }

        const authorFid = parentCast.author.fid;
        const authorUsername = parentCast.author.username?.toLowerCase();

        const isViolation =
            this.clankerFids.includes(authorFid) ||
            authorUsername === 'clanker';

        return {
            isViolation,
            reason: isViolation ? 'Attempted reply to @clanker' : null,
            severity: 'high'
        };
    }

    /**
     * Filter content to remove violations
     */
    filterContent(text) {
        let filtered = text;

        for (const pattern of this.bannedPatterns) {
            filtered = filtered.replace(pattern, '[FILTERED]');
        }

        return {
            original: text,
            filtered,
            wasModified: filtered !== text
        };
    }

    /**
     * Log violation for monitoring
     */
    logViolation(agentUsername, violation) {
        const timestamp = new Date().toISOString();

        console.warn('🚨 CLANKER VIOLATION DETECTED:');
        console.warn(`   Agent: ${agentUsername}`);
        console.warn(`   Time: ${timestamp}`);
        console.warn(`   Type: ${violation.type}`);
        console.warn(`   Severity: ${violation.severity}`);

        if (violation.violations) {
            violation.violations.forEach(v => {
                console.warn(`   Pattern: ${v.pattern}`);
                console.warn(`   Content: ${v.text}`);
            });
        }

        // In production, this could send to monitoring service
        return {
            timestamp,
            agent: agentUsername,
            violation,
            action: 'blocked'
        };
    }

    /**
     * Get random warning message
     */
    getWarningMessage() {
        return this.warningMessages[
            Math.floor(Math.random() * this.warningMessages.length)
        ];
    }
}

module.exports = AntiClankerProtection;