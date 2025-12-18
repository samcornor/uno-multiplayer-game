/**
 * GameRules.js - UNO game rule validation and action handling
 * 
 * Implements official UNO rules with the following variants:
 * - Stacking: +2 stacks on +2, +4 stacks on +4
 * - No Wild Draw Four challenge
 * - UNO must be called BEFORE playing second-to-last card
 */

const { COLORS } = require('./Card');

/**
 * Check if a card can be played on the current discard pile
 * @param {Card} card - Card to play
 * @param {object} state - Current game state
 * @returns {{ canPlay: boolean, reason: string|null }}
 */
function canPlayCard(card, state) {
    const topCard = state.discardPile[state.discardPile.length - 1];
    const currentColor = state.currentColor;

    // If there's an active stack, only matching stack cards, Reverse, or Skip can be played
    if (state.stackedDrawCount > 0) {
        // Can stack matching draw cards
        if (state.stackType === 'drawTwo' && card.type === 'drawTwo') {
            return { canPlay: true, reason: null };
        }
        if (state.stackType === 'drawFour' && card.type === 'wildDrawFour') {
            return { canPlay: true, reason: null };
        }
        // Can play Reverse to deflect the stack back to previous player
        if (card.type === 'reverse') {
            return { canPlay: true, reason: null };
        }
        // Can play Skip to pass the stack to the next player
        if (card.type === 'skip') {
            return { canPlay: true, reason: null };
        }
        return {
            canPlay: false,
            reason: `You must play a ${state.stackType === 'drawTwo' ? 'Draw Two' : 'Wild Draw Four'}, Reverse, Skip, or draw ${state.stackedDrawCount} cards`
        };
    }

    // Wild cards can always be played (when no stack is active)
    if (card.isWild()) {
        return { canPlay: true, reason: null };
    }

    // Check color match
    if (card.color === currentColor) {
        return { canPlay: true, reason: null };
    }

    // Check value/type match (for number cards, match value; for action cards, match type)
    if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) {
        return { canPlay: true, reason: null };
    }

    if (card.type !== 'number' && card.type === topCard.type) {
        return { canPlay: true, reason: null };
    }

    return {
        canPlay: false,
        reason: `Card must match color (${currentColor}) or ${topCard.type === 'number' ? 'number (' + topCard.value + ')' : 'type (' + topCard.type + ')'}`
    };
}

/**
 * Check if a player has any playable cards
 * @param {Card[]} hand - Player's hand
 * @param {object} state - Current game state
 * @returns {boolean}
 */
function hasPlayableCard(hand, state) {
    return hand.some(card => canPlayCard(card, state).canPlay);
}

/**
 * Get all playable cards from a hand
 * @param {Card[]} hand - Player's hand
 * @param {object} state - Current game state
 * @returns {Card[]}
 */
function getPlayableCards(hand, state) {
    return hand.filter(card => canPlayCard(card, state).canPlay);
}

/**
 * Apply the effects of playing a card
 * @param {Card} card - Card being played
 * @param {object} state - Current game state (will be mutated)
 * @param {string|null} chosenColor - Color chosen for wild cards
 * @returns {object} Updated state
 */
function applyCardEffect(card, state, chosenColor = null) {
    // Add card to discard pile
    state.discardPile.push(card);

    // Update current color
    if (card.isWild()) {
        if (!chosenColor || !COLORS.includes(chosenColor)) {
            throw new Error('Must choose a valid color for wild card');
        }
        state.currentColor = chosenColor;
        card.color = chosenColor; // Set color on the card for display
    } else {
        state.currentColor = card.color;
    }

    // Handle card-specific effects
    switch (card.type) {
        case 'skip':
            // Skip is handled by advancing turn twice
            state.skipNextPlayer = true;
            break;

        case 'reverse':
            // Reverse direction
            state.direction *= -1;
            // In 2-player game, reverse acts like skip
            if (state.players.length === 2) {
                state.skipNextPlayer = true;
            }
            break;

        case 'drawTwo':
            // Add to stack
            state.stackedDrawCount += 2;
            state.stackType = 'drawTwo';
            break;

        case 'wildDrawFour':
            // Add to stack
            state.stackedDrawCount += 4;
            state.stackType = 'drawFour';
            break;

        // Number and wild cards have no additional effect
    }

    return state;
}

/**
 * Advance to the next player's turn
 * @param {object} state - Current game state (will be mutated)
 * @returns {object} Updated state
 */
function advanceTurn(state) {
    const playerCount = state.players.length;

    // Move to next player
    state.currentPlayerIndex = (state.currentPlayerIndex + state.direction + playerCount) % playerCount;

    // Handle skip
    if (state.skipNextPlayer) {
        state.currentPlayerIndex = (state.currentPlayerIndex + state.direction + playerCount) % playerCount;
        state.skipNextPlayer = false;
    }

    // Reset UNO call status for the new current player
    state.players[state.currentPlayerIndex].calledUno = false;

    return state;
}

/**
 * Process a player drawing cards (either forced or from stack)
 * @param {object} state - Current game state (will be mutated)
 * @param {number} playerIndex - Index of player drawing
 * @param {Card[]} drawnCards - Cards drawn
 * @returns {object} Updated state
 */
function processDrawnCards(state, playerIndex, drawnCards) {
    // Add cards to player's hand
    state.players[playerIndex].hand.push(...drawnCards);

    // Clear stacking if this was a stack draw
    if (state.stackedDrawCount > 0) {
        state.stackedDrawCount = 0;
        state.stackType = null;
    }

    return state;
}

/**
 * Apply first card effects when game starts
 * @param {Card} firstCard - The first card flipped
 * @param {object} state - Current game state (will be mutated)
 * @returns {object} Updated state with any required actions
 */
function applyFirstCardEffect(firstCard, state) {
    // Set the current color
    if (firstCard.isWild()) {
        // Wild card: First player chooses color (handled separately)
        state.awaitingColorChoice = true;
        state.currentColor = null;
    } else {
        state.currentColor = firstCard.color;
    }

    // Apply action card effects to first player
    switch (firstCard.type) {
        case 'skip':
            // First player is skipped
            state.currentPlayerIndex = (state.currentPlayerIndex + state.direction + state.players.length) % state.players.length;
            break;

        case 'reverse':
            // Reverse direction
            state.direction = -1;
            // In 2-player game, first player is skipped
            if (state.players.length === 2) {
                state.currentPlayerIndex = 1;
            } else {
                // In multiplayer, play goes to the player before the first player
                state.currentPlayerIndex = (state.players.length - 1);
            }
            break;

        case 'drawTwo':
            // First player draws 2 and is skipped
            state.stackedDrawCount = 2;
            state.stackType = 'drawTwo';
            break;
    }

    return state;
}

/**
 * Check if UNO call is valid (player has exactly 2 cards and is about to play)
 * @param {Card[]} hand - Player's hand
 * @returns {boolean}
 */
function canCallUno(hand) {
    return hand.length === 2;
}

/**
 * Check if a player can be caught for not calling UNO
 * @param {object} player - Player who just played
 * @returns {boolean}
 */
function canCatchUno(player) {
    // Can be caught if they have 1 card and didn't call UNO before playing
    return player.hand.length === 1 && !player.calledUno;
}

module.exports = {
    canPlayCard,
    hasPlayableCard,
    getPlayableCards,
    applyCardEffect,
    advanceTurn,
    processDrawnCards,
    applyFirstCardEffect,
    canCallUno,
    canCatchUno
};
