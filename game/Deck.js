/**
 * Deck.js - UNO Deck management
 * 
 * Official 108-card deck composition:
 * - 4 colors (red, yellow, green, blue)
 * - Each color has:
 *   - One 0
 *   - Two each of 1-9
 *   - Two Skip cards
 *   - Two Reverse cards
 *   - Two Draw Two cards
 * - 4 Wild cards
 * - 4 Wild Draw Four cards
 */

const { Card, COLORS, NUMBER_VALUES, ACTION_TYPES } = require('./Card');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a complete 108-card UNO deck
 * @returns {Card[]} Array of 108 cards
 */
function createDeck() {
    const cards = [];

    // For each color
    for (const color of COLORS) {
        // One 0 card
        cards.push(new Card('number', color, 0, uuidv4()));

        // Two each of 1-9
        for (let value = 1; value <= 9; value++) {
            cards.push(new Card('number', color, value, uuidv4()));
            cards.push(new Card('number', color, value, uuidv4()));
        }

        // Two each of action cards
        for (const actionType of ACTION_TYPES) {
            cards.push(new Card(actionType, color, null, uuidv4()));
            cards.push(new Card(actionType, color, null, uuidv4()));
        }
    }

    // 4 Wild cards
    for (let i = 0; i < 4; i++) {
        cards.push(new Card('wild', null, null, uuidv4()));
    }

    // 4 Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
        cards.push(new Card('wildDrawFour', null, null, uuidv4()));
    }

    return cards;
}

/**
 * Fisher-Yates shuffle algorithm
 * @param {Card[]} cards - Array of cards to shuffle
 * @returns {Card[]} Shuffled array (mutates original)
 */
function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

/**
 * Reshuffle the discard pile to form a new draw pile
 * Keeps the top card of discard pile in place
 * @param {Card[]} discardPile - Current discard pile
 * @returns {{ newDrawPile: Card[], newDiscardPile: Card[] }}
 */
function reshuffleDiscardPile(discardPile) {
    if (discardPile.length <= 1) {
        // Cannot reshuffle if only one card or empty
        return { newDrawPile: [], newDiscardPile: discardPile };
    }

    // Keep the top card (last in array)
    const topCard = discardPile[discardPile.length - 1];

    // Take all other cards for the new draw pile
    const cardsToShuffle = discardPile.slice(0, -1);

    // Reset wild card colors to null before shuffling back
    for (const card of cardsToShuffle) {
        if (card.isWild()) {
            card.color = null;
        }
    }

    const newDrawPile = shuffle(cardsToShuffle);
    const newDiscardPile = [topCard];

    return { newDrawPile, newDiscardPile };
}

/**
 * Draw cards from the draw pile
 * Will trigger reshuffle if needed
 * @param {Card[]} drawPile - Current draw pile
 * @param {Card[]} discardPile - Current discard pile
 * @param {number} count - Number of cards to draw
 * @returns {{ drawnCards: Card[], drawPile: Card[], discardPile: Card[] }}
 */
function drawCards(drawPile, discardPile, count) {
    const drawnCards = [];

    for (let i = 0; i < count; i++) {
        // Check if we need to reshuffle
        if (drawPile.length === 0) {
            const { newDrawPile, newDiscardPile } = reshuffleDiscardPile(discardPile);
            drawPile = newDrawPile;
            discardPile = newDiscardPile;

            // If still no cards, we can't draw more
            if (drawPile.length === 0) {
                break;
            }
        }

        drawnCards.push(drawPile.pop());
    }

    return { drawnCards, drawPile, discardPile };
}

/**
 * Deal initial hands to all players
 * @param {Card[]} deck - Shuffled deck
 * @param {number} playerCount - Number of players
 * @param {number} cardsPerPlayer - Cards to deal to each player (default: 7)
 * @returns {{ hands: Card[][], remainingDeck: Card[] }}
 */
function dealHands(deck, playerCount, cardsPerPlayer = 7) {
    const hands = [];

    for (let i = 0; i < playerCount; i++) {
        hands.push([]);
    }

    // Deal cards one at a time to each player
    for (let card = 0; card < cardsPerPlayer; card++) {
        for (let player = 0; player < playerCount; player++) {
            if (deck.length > 0) {
                hands[player].push(deck.pop());
            }
        }
    }

    return { hands, remainingDeck: deck };
}

/**
 * Get a valid starting card from the deck
 * Wild Draw Four cards are not valid starting cards
 * @param {Card[]} deck - Draw pile
 * @returns {{ startCard: Card, deck: Card[] }}
 */
function getStartingCard(deck) {
    let startCard = deck.pop();

    // If Wild Draw Four, put it back and shuffle, repeat until valid
    while (startCard.type === 'wildDrawFour') {
        deck.unshift(startCard); // Put at bottom
        shuffle(deck);
        startCard = deck.pop();
    }

    return { startCard, deck };
}

module.exports = {
    createDeck,
    shuffle,
    reshuffleDiscardPile,
    drawCards,
    dealHands,
    getStartingCard
};
