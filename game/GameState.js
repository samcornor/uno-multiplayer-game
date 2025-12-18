/**
 * GameState.js - UNO game state management
 * 
 * Manages the complete state of a game including:
 * - Players and their hands
 * - Draw and discard piles
 * - Current turn and direction
 * - Stacking state
 * - UNO call tracking
 * - Scoring
 */

const { createDeck, shuffle, dealHands, getStartingCard, drawCards } = require('./Deck');
const { applyFirstCardEffect, applyCardEffect, advanceTurn, processDrawnCards, canPlayCard, hasPlayableCard, canCatchUno } = require('./GameRules');
const { calculateRoundScores, checkGameOver } = require('./Scoring');

/**
 * Create a new game state
 * @param {string} roomCode - Room code for this game
 * @param {object[]} lobbyPlayers - Array of { id, name } from lobby
 * @param {number} targetScore - Score to win (default: 500)
 * @returns {object} Initial game state
 */
function createGameState(roomCode, lobbyPlayers, targetScore = 500) {
    // Initialize players with empty hands and zero score
    const players = lobbyPlayers.map(p => ({
        id: p.id,
        name: p.name,
        hand: [],
        score: 0,
        connected: true,
        calledUno: false
    }));

    return {
        roomCode,
        phase: 'starting', // starting, playing, roundEnd, gameOver
        players,
        currentPlayerIndex: 0,
        direction: 1, // 1 = clockwise, -1 = counter-clockwise
        discardPile: [],
        drawPile: [],
        currentColor: null,
        stackedDrawCount: 0,
        stackType: null, // 'drawTwo' or 'drawFour'
        skipNextPlayer: false,
        awaitingColorChoice: false,
        unoCallWindow: null, // { playerId, expiresAt } for catching
        hostId: lobbyPlayers[0]?.id,
        settings: { targetScore },
        roundNumber: 1,
        lastAction: null // For displaying what happened
    };
}

/**
 * Start a new round
 * @param {object} state - Current game state
 * @returns {object} Updated state ready for play
 */
function startRound(state) {
    // Create and shuffle deck
    let deck = shuffle(createDeck());

    // Deal 7 cards to each player
    const { hands, remainingDeck } = dealHands(deck, state.players.length, 7);

    // Assign hands to players
    for (let i = 0; i < state.players.length; i++) {
        state.players[i].hand = hands[i];
        state.players[i].calledUno = false;
    }

    // Get starting card (reshuffles if Wild Draw Four)
    const { startCard, deck: deckAfterStart } = getStartingCard(remainingDeck);

    state.drawPile = deckAfterStart;
    state.discardPile = [startCard];
    state.currentPlayerIndex = 0;
    state.direction = 1;
    state.stackedDrawCount = 0;
    state.stackType = null;
    state.skipNextPlayer = false;
    state.awaitingColorChoice = false;
    state.unoCallWindow = null;
    state.phase = 'playing';

    // Apply first card effects
    applyFirstCardEffect(startCard, state);

    state.lastAction = {
        type: 'roundStart',
        message: `Round ${state.roundNumber} started! First card: ${formatCard(startCard)}`
    };

    return state;
}

/**
 * Play a card from a player's hand
 * @param {object} state - Current game state
 * @param {string} playerId - ID of player playing
 * @param {string} cardId - ID of card to play
 * @param {string|null} chosenColor - Color choice for wild cards
 * @returns {{ success: boolean, state: object, error: string|null }}
 */
function playCard(state, playerId, cardId, chosenColor = null) {
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex === -1) {
        return { success: false, state, error: 'Player not found' };
    }

    if (playerIndex !== state.currentPlayerIndex) {
        return { success: false, state, error: 'Not your turn' };
    }

    if (state.phase !== 'playing') {
        return { success: false, state, error: 'Game is not in playing phase' };
    }

    if (state.awaitingColorChoice) {
        return { success: false, state, error: 'Must choose a color first' };
    }

    const player = state.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
        return { success: false, state, error: 'Card not in hand' };
    }

    const card = player.hand[cardIndex];

    // Validate play
    const { canPlay, reason } = canPlayCard(card, state);
    if (!canPlay) {
        return { success: false, state, error: reason };
    }

    // Check UNO call requirement (must call BEFORE playing second-to-last card)
    // If player has 2 cards and is about to play one, they should have called UNO
    // We'll check this after the play for catch window

    // Remove card from hand
    player.hand.splice(cardIndex, 1);

    // Check if we need color choice BEFORE applying effects (for wild cards without color)
    if (card.isWild() && !chosenColor) {
        // Add card to discard pile but don't apply full effects yet
        state.discardPile.push(card);
        state.awaitingColorChoice = true;

        // For Wild Draw Four, set up the stack NOW
        if (card.type === 'wildDrawFour') {
            state.stackedDrawCount += 4;
            state.stackType = 'drawFour';
        }

        state.lastAction = {
            type: 'playCard',
            playerId: player.id,
            playerName: player.name,
            card: card.toJSON(),
            message: `${player.name} played ${formatCard(card)} - choosing color...`
        };

        // Check for round win
        if (player.hand.length === 0) {
            return endRound(state, playerIndex);
        }

        // Set UNO catch window if applicable
        if (player.hand.length === 1 && !player.calledUno) {
            state.unoCallWindow = {
                playerId: player.id,
                expiresAt: Date.now() + 3000
            };
        }

        return { success: true, state, error: null };
    }

    // Apply card effect (for non-wild cards, or wild cards WITH color already chosen)
    try {
        applyCardEffect(card, state, chosenColor);
    } catch (e) {
        // Put card back if error
        player.hand.push(card);
        return { success: false, state, error: e.message };
    }

    // Check for round win
    if (player.hand.length === 0) {
        return endRound(state, playerIndex);
    }

    // Set UNO catch window if player has 1 card and didn't call UNO
    if (player.hand.length === 1 && !player.calledUno) {
        state.unoCallWindow = {
            playerId: player.id,
            expiresAt: Date.now() + 3000 // 3 second window to catch
        };
    } else {
        state.unoCallWindow = null;
    }

    state.lastAction = {
        type: 'playCard',
        playerId: player.id,
        playerName: player.name,
        card: card.toJSON(),
        message: `${player.name} played ${formatCard(card)}${chosenColor ? ` and chose ${chosenColor}` : ''}`
    };

    // Advance to next turn
    advanceTurn(state);

    return { success: true, state, error: null };
}

/**
 * Choose a color for a wild card
 * @param {object} state - Current game state
 * @param {string} playerId - ID of player choosing
 * @param {string} color - Chosen color
 * @returns {{ success: boolean, state: object, error: string|null }}
 */
function chooseColor(state, playerId, color) {
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex !== state.currentPlayerIndex) {
        return { success: false, state, error: 'Not your turn' };
    }

    if (!state.awaitingColorChoice) {
        return { success: false, state, error: 'Not awaiting color choice' };
    }

    const validColors = ['red', 'yellow', 'green', 'blue'];
    if (!validColors.includes(color)) {
        return { success: false, state, error: 'Invalid color' };
    }

    state.currentColor = color;
    state.awaitingColorChoice = false;

    // Update the top card's color for display
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard) {
        topCard.color = color;
    }

    const player = state.players[playerIndex];

    // Check for round win
    if (player.hand.length === 0) {
        return endRound(state, playerIndex);
    }

    state.lastAction = {
        type: 'chooseColor',
        playerId: player.id,
        playerName: player.name,
        color,
        message: `${player.name} chose ${color}`
    };

    // Advance to next turn
    advanceTurn(state);

    return { success: true, state, error: null };
}

/**
 * Draw card(s) for the current player
 * @param {object} state - Current game state
 * @param {string} playerId - ID of player drawing
 * @returns {{ success: boolean, state: object, drawnCards: Card[], canPlayDrawn: boolean, error: string|null }}
 */
function playerDrawCards(state, playerId) {
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex === -1) {
        return { success: false, state, drawnCards: [], canPlayDrawn: false, error: 'Player not found' };
    }

    if (playerIndex !== state.currentPlayerIndex) {
        return { success: false, state, drawnCards: [], canPlayDrawn: false, error: 'Not your turn' };
    }

    if (state.phase !== 'playing') {
        return { success: false, state, drawnCards: [], canPlayDrawn: false, error: 'Game is not in playing phase' };
    }

    if (state.awaitingColorChoice) {
        return { success: false, state, drawnCards: [], canPlayDrawn: false, error: 'Must choose a color first' };
    }

    const player = state.players[playerIndex];

    // Determine how many cards to draw
    let drawCount = state.stackedDrawCount > 0 ? state.stackedDrawCount : 1;

    // Draw the cards
    const result = drawCards(state.drawPile, state.discardPile, drawCount);
    state.drawPile = result.drawPile;
    state.discardPile = result.discardPile;
    const drawnCards = result.drawnCards;

    // Process the drawn cards
    processDrawnCards(state, playerIndex, drawnCards);

    // Check if drawn card can be played (only for single draw, not stack)
    let canPlayDrawn = false;
    if (state.stackedDrawCount === 0 && drawnCards.length === 1) {
        canPlayDrawn = canPlayCard(drawnCards[0], state).canPlay;
    }

    // Clear stack
    if (state.stackedDrawCount > 0) {
        state.stackedDrawCount = 0;
        state.stackType = null;
    }

    state.lastAction = {
        type: 'draw',
        playerId: player.id,
        playerName: player.name,
        count: drawnCards.length,
        message: `${player.name} drew ${drawnCards.length} card${drawnCards.length > 1 ? 's' : ''}`
    };

    // If can't play drawn card (or it was a stack draw), end turn
    if (!canPlayDrawn) {
        advanceTurn(state);
    }

    return {
        success: true,
        state,
        drawnCards,
        canPlayDrawn,
        error: null
    };
}

/**
 * Skip playing the drawn card and end turn
 * @param {object} state - Current game state
 * @param {string} playerId - ID of player
 * @returns {{ success: boolean, state: object, error: string|null }}
 */
function skipPlayDrawnCard(state, playerId) {
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex !== state.currentPlayerIndex) {
        return { success: false, state, error: 'Not your turn' };
    }

    const player = state.players[playerIndex];

    state.lastAction = {
        type: 'skipPlay',
        playerId: player.id,
        playerName: player.name,
        message: `${player.name} kept the drawn card`
    };

    advanceTurn(state);

    return { success: true, state, error: null };
}

/**
 * Player calls UNO
 * @param {object} state - Current game state
 * @param {string} playerId - ID of player calling UNO
 * @returns {{ success: boolean, state: object, error: string|null }}
 */
function callUno(state, playerId) {
    const playerIndex = state.players.findIndex(p => p.id === playerId);

    if (playerIndex === -1) {
        return { success: false, state, error: 'Player not found' };
    }

    const player = state.players[playerIndex];

    // Can only call UNO when you have 2 cards (about to play to 1)
    if (player.hand.length !== 2) {
        return { success: false, state, error: 'You can only call UNO when you have 2 cards' };
    }

    // Must be your turn
    if (playerIndex !== state.currentPlayerIndex) {
        return { success: false, state, error: 'You can only call UNO on your turn' };
    }

    player.calledUno = true;

    state.lastAction = {
        type: 'callUno',
        playerId: player.id,
        playerName: player.name,
        message: `${player.name} called UNO!`
    };

    return { success: true, state, error: null };
}

/**
 * Catch a player who didn't call UNO
 * @param {object} state - Current game state
 * @param {string} catcherId - ID of player catching
 * @param {string} targetId - ID of player being caught
 * @returns {{ success: boolean, state: object, error: string|null }}
 */
function catchUno(state, catcherId, targetId) {
    // Check if there's an active catch window
    if (!state.unoCallWindow || state.unoCallWindow.playerId !== targetId) {
        return { success: false, state, error: 'Cannot catch this player' };
    }

    // Check if window has expired
    if (Date.now() > state.unoCallWindow.expiresAt) {
        state.unoCallWindow = null;
        return { success: false, state, error: 'Catch window has expired' };
    }

    const targetPlayer = state.players.find(p => p.id === targetId);
    const catcherPlayer = state.players.find(p => p.id === catcherId);

    if (!targetPlayer || !catcherPlayer) {
        return { success: false, state, error: 'Player not found' };
    }

    // Draw 4 penalty cards
    const result = drawCards(state.drawPile, state.discardPile, 4);
    state.drawPile = result.drawPile;
    state.discardPile = result.discardPile;
    targetPlayer.hand.push(...result.drawnCards);

    state.unoCallWindow = null;

    state.lastAction = {
        type: 'caughtUno',
        catcherId: catcherPlayer.id,
        catcherName: catcherPlayer.name,
        targetId: targetPlayer.id,
        targetName: targetPlayer.name,
        message: `${catcherPlayer.name} caught ${targetPlayer.name}! +4 penalty cards`
    };

    return { success: true, state, error: null };
}

/**
 * End the current round
 * @param {object} state - Current game state
 * @param {number} winnerIndex - Index of winning player
 * @returns {{ success: boolean, state: object, error: string|null }}
 */
function endRound(state, winnerIndex) {
    state.phase = 'roundEnd';
    state.unoCallWindow = null;

    const winner = state.players[winnerIndex];

    // Calculate scores
    const { roundScores, newTotalScores } = calculateRoundScores(state.players, winnerIndex);

    // Update player scores
    for (let i = 0; i < state.players.length; i++) {
        state.players[i].score = newTotalScores[i];
    }

    // Check for game over
    const { gameOver, winnerIndex: gameWinnerIndex } = checkGameOver(state.players, state.settings.targetScore);

    if (gameOver) {
        state.phase = 'gameOver';
        const gameWinner = state.players[gameWinnerIndex];
        state.lastAction = {
            type: 'gameOver',
            winnerId: gameWinner.id,
            winnerName: gameWinner.name,
            roundScores,
            message: `Game Over! ${gameWinner.name} wins with ${gameWinner.score} points!`
        };
    } else {
        state.lastAction = {
            type: 'roundEnd',
            winnerId: winner.id,
            winnerName: winner.name,
            roundScores,
            message: `${winner.name} wins the round! +${roundScores[winnerIndex]} points`
        };
    }

    return { success: true, state, error: null };
}

/**
 * Start the next round
 * @param {object} state - Current game state
 * @returns {object} Updated state for new round
 */
function startNextRound(state) {
    if (state.phase !== 'roundEnd') {
        return state;
    }

    state.roundNumber++;
    return startRound(state);
}

/**
 * Handle player disconnect
 * @param {object} state - Current game state
 * @param {string} playerId - ID of disconnected player
 * @returns {object} Updated state
 */
function handleDisconnect(state, playerId) {
    const player = state.players.find(p => p.id === playerId);
    if (player) {
        player.connected = false;
    }
    return state;
}

/**
 * Handle player reconnect
 * @param {object} state - Current game state
 * @param {string} oldPlayerId - Original player ID
 * @param {string} newPlayerId - New socket ID
 * @returns {object} Updated state
 */
function handleReconnect(state, oldPlayerId, newPlayerId) {
    const player = state.players.find(p => p.id === oldPlayerId);
    if (player) {
        player.id = newPlayerId;
        player.connected = true;
    }
    return state;
}

/**
 * Get state safe for sending to a specific player
 * Hides other players' hands
 * @param {object} state - Full game state
 * @param {string} playerId - ID of player receiving state
 * @returns {object} Sanitized state
 */
function getStateForPlayer(state, playerId) {
    return {
        ...state,
        drawPile: { count: state.drawPile.length }, // Only send count
        players: state.players.map(p => ({
            id: p.id,
            name: p.name,
            cardCount: p.hand.length,
            score: p.score,
            connected: p.connected,
            calledUno: p.calledUno,
            // Only include full hand for requesting player
            hand: p.id === playerId ? p.hand.map(c => c.toJSON()) : undefined,
            isCurrentPlayer: state.players.indexOf(p) === state.currentPlayerIndex
        })),
        topCard: state.discardPile.length > 0
            ? state.discardPile[state.discardPile.length - 1].toJSON()
            : null
    };
}

/**
 * Format a card for display in messages
 * @param {Card} card - Card to format
 * @returns {string} Formatted string
 */
function formatCard(card) {
    if (card.type === 'number') {
        return `${card.color} ${card.value}`;
    } else if (card.type === 'wild') {
        return 'Wild';
    } else if (card.type === 'wildDrawFour') {
        return 'Wild Draw Four';
    } else {
        return `${card.color} ${card.type.replace(/([A-Z])/g, ' $1').trim()}`;
    }
}

module.exports = {
    createGameState,
    startRound,
    playCard,
    chooseColor,
    playerDrawCards,
    skipPlayDrawnCard,
    callUno,
    catchUno,
    endRound,
    startNextRound,
    handleDisconnect,
    handleReconnect,
    getStateForPlayer
};
