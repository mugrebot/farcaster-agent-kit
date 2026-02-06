const fs = require('fs').promises;
const path = require('path');

/**
 * Simple persistent news tracking to prevent duplicates
 * Uses JSON file for simplicity and portability
 */
class NewsTracker {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.trackingFile = path.join(dataDir, 'submitted_news.json');
        this.submissions = new Map();
        this.retentionDays = 30; // Keep records for 30 days
    }

    async init() {
        try {
            // Ensure data directory exists
            await fs.mkdir(this.dataDir, { recursive: true });

            // Load existing submissions
            try {
                const data = await fs.readFile(this.trackingFile, 'utf8');
                const parsed = JSON.parse(data);

                // Load into Map and clean old entries
                const now = Date.now();
                const cutoff = now - (this.retentionDays * 24 * 60 * 60 * 1000);

                for (const [title, timestamp] of Object.entries(parsed)) {
                    if (timestamp > cutoff) {
                        this.submissions.set(title, timestamp);
                    }
                }

                console.log(`📰 Loaded ${this.submissions.size} news submissions from tracking file`);
            } catch (error) {
                // File doesn't exist yet, that's ok
                console.log('📰 Starting fresh news tracking');
            }
        } catch (error) {
            console.error('Failed to initialize news tracker:', error.message);
        }
    }

    /**
     * Check if a news title has been recently submitted
     */
    isRecentlySubmitted(title, windowHours = 24) {
        if (!title) return false;

        const normalizedTitle = this.normalizeTitle(title);
        const submission = this.submissions.get(normalizedTitle);

        if (!submission) return false;

        const windowMs = windowHours * 60 * 60 * 1000;
        const age = Date.now() - submission;

        return age < windowMs;
    }

    /**
     * Record a news submission
     */
    async recordSubmission(title, submissionId = null) {
        if (!title) return;

        const normalizedTitle = this.normalizeTitle(title);
        const timestamp = Date.now();

        this.submissions.set(normalizedTitle, timestamp);

        // Also track by submission ID if provided
        if (submissionId) {
            this.submissions.set(`id:${submissionId}`, timestamp);
        }

        // Save to file
        await this.save();

        console.log(`📰 Recorded news submission: "${title}"`);
    }

    /**
     * Get a list of alternative news that hasn't been submitted recently
     */
    getUnsubmittedFromPool(newsPool, windowHours = 24) {
        return newsPool.filter(news => !this.isRecentlySubmitted(news.title, windowHours));
    }

    /**
     * Clean old entries and save
     */
    async save() {
        try {
            // Clean old entries
            const now = Date.now();
            const cutoff = now - (this.retentionDays * 24 * 60 * 60 * 1000);

            for (const [key, timestamp] of this.submissions.entries()) {
                if (timestamp < cutoff) {
                    this.submissions.delete(key);
                }
            }

            // Convert Map to object for JSON
            const data = {};
            for (const [key, value] of this.submissions.entries()) {
                data[key] = value;
            }

            await fs.writeFile(this.trackingFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save news tracking:', error.message);
        }
    }

    /**
     * Normalize title for comparison
     */
    normalizeTitle(title) {
        return title.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Get statistics about submissions
     */
    getStats() {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;

        let last24h = 0;
        let last7d = 0;
        let total = 0;

        for (const timestamp of this.submissions.values()) {
            total++;
            const age = now - timestamp;
            if (age < day) last24h++;
            if (age < day * 7) last7d++;
        }

        return {
            total,
            last24h,
            last7d,
            oldestDays: Math.floor((now - Math.min(...this.submissions.values())) / day)
        };
    }
}

module.exports = NewsTracker;