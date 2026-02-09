/**
 * EventBus — Unified event system for the CLANKNET agent.
 *
 * All subsystems emit typed events instead of ad-hoc console.log.
 * Maintains a ring buffer of the last 100 events for debugging.
 */

const { EventEmitter } = require('events');

const EVENT_TYPES = [
    'message:inbound',
    'message:outbound',
    'post:generated',
    'post:published',
    'tx:requested',
    'tx:approved',
    'tx:rejected',
    'skill:executed',
    'browser:snapshot',
    'agent:think',
    'agent:act',
    'agent:reflect',
    'gateway:request',
    'gateway:response',
    'error',
];

class EventBus extends EventEmitter {
    constructor(opts = {}) {
        super();
        this.setMaxListeners(50);
        this._history = [];
        this._maxHistory = opts.maxHistory || 100;
    }

    /**
     * Emit a typed event with metadata. Pushes to history ring buffer.
     */
    publish(type, payload = {}) {
        const event = {
            type,
            ts: Date.now(),
            payload,
        };

        this._history.push(event);
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }

        this.emit(type, event);
        this.emit('*', event); // wildcard listener
        return event;
    }

    /**
     * Subscribe to an event type. Returns unsubscribe function.
     */
    subscribe(type, handler) {
        this.on(type, handler);
        return () => this.off(type, handler);
    }

    /**
     * Get the last N events (or all if n omitted).
     */
    getHistory(n) {
        if (!n) return [...this._history];
        return this._history.slice(-n);
    }

    /**
     * Get events of a specific type from history.
     */
    getHistoryByType(type, n) {
        const filtered = this._history.filter(e => e.type === type);
        return n ? filtered.slice(-n) : filtered;
    }

    /**
     * Clear event history.
     */
    clearHistory() {
        this._history = [];
    }
}

EventBus.EVENT_TYPES = EVENT_TYPES;

module.exports = EventBus;
