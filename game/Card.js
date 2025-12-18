/**
 * Card.js - UNO Card representation
 * 
 * Card Types:
 * - number: Cards with values 0-9
 * - skip: Skip the next player
 * - reverse: Reverse play direction
 * - drawTwo: Next player draws 2 (stackable)
 * - wild: Change color, can be played anytime
 * - wildDrawFour: Change color + next player draws 4 (stackable)
 */

const COLORS = ['red', 'yellow', 'green', 'blue'];
const NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ACTION_TYPES = ['skip', 'reverse', 'drawTwo'];

/**
 * Card class representing a single UNO card
 */
class Card {
    /**
     * @param {string} type - Card type: 'number', 'skip', 'reverse', 'drawTwo', 'wild', 'wildDrawFour'
     * @param {string|null} color - Card color: 'red', 'yellow', 'green', 'blue', or null for wilds
     * @param {number|null} value - Numeric value for number cards (0-9), null otherwise
     * @param {string} id - Unique identifier for this card instance
     */
    constructor(type, color, value, id) {
        this.type = type;
        this.color = color;
        this.value = value;
        this.id = id;
    }

    /**
     * Get the point value of this card for scoring
     * @returns {number} Point value
     */
    getPoints() {
        switch (this.type) {
            case 'number':
                return this.value;
            case 'skip':
            case 'reverse':
            case 'drawTwo':
                return 20;
            case 'wild':
            case 'wildDrawFour':
                return 50;
            default:
                return 0;
        }
    }

    /**
     * Check if this is an action card (skip, reverse, drawTwo)
     * @returns {boolean}
     */
    isAction() {
        return ACTION_TYPES.includes(this.type);
    }

    /**
     * Check if this is a wild card (wild or wildDrawFour)
     * @returns {boolean}
     */
    isWild() {
        return this.type === 'wild' || this.type === 'wildDrawFour';
    }

    /**
     * Check if this card causes draws (drawTwo or wildDrawFour)
     * @returns {boolean}
     */
    isDrawCard() {
        return this.type === 'drawTwo' || this.type === 'wildDrawFour';
    }

    /**
     * Get the draw amount for this card
     * @returns {number}
     */
    getDrawAmount() {
        if (this.type === 'drawTwo') return 2;
        if (this.type === 'wildDrawFour') return 4;
        return 0;
    }

    /**
     * Create a plain object representation (for sending to clients)
     * @param {boolean} hideForOpponent - If true, hide card details (for opponent hands)
     * @returns {object}
     */
    toJSON(hideForOpponent = false) {
        if (hideForOpponent) {
            return { id: this.id, hidden: true };
        }
        return {
            id: this.id,
            type: this.type,
            color: this.color,
            value: this.value
        };
    }
}

module.exports = { Card, COLORS, NUMBER_VALUES, ACTION_TYPES };
