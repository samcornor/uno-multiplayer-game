/**
 * Scoring.js - UNO point calculation
 * 
 * Scoring values:
 * - Number cards (0-9): Face value
 * - Skip, Reverse, Draw Two: 20 points each
 * - Wild, Wild Draw Four: 50 points each
 * 
 * Round winner scores the sum of all opponents' hands.
 * First player to reach target score (default 500) wins the game.
 */

/**
 * Calculate the total point value of a hand
 * @param {Card[]} hand - Array of cards
 * @returns {number} Total points
 */
function calculateHandValue(hand) {
    return hand.reduce((total, card) => total + card.getPoints(), 0);
}

/**
 * Calculate round scores after a player wins
 * @param {object[]} players - Array of player objects with hand arrays
 * @param {number} winnerIndex - Index of the winning player
 * @returns {{ roundScores: number[], newTotalScores: number[] }}
 */
function calculateRoundScores(players, winnerIndex) {
    const roundScores = players.map(() => 0);

    // Sum all opponents' hands for the winner
    let winnerRoundScore = 0;
    for (let i = 0; i < players.length; i++) {
        if (i !== winnerIndex) {
            winnerRoundScore += calculateHandValue(players[i].hand);
        }
    }

    roundScores[winnerIndex] = winnerRoundScore;

    // Calculate new total scores
    const newTotalScores = players.map((player, index) => {
        return player.score + roundScores[index];
    });

    return { roundScores, newTotalScores };
}

/**
 * Check if any player has won the overall game
 * @param {object[]} players - Array of player objects with score property
 * @param {number} targetScore - Score needed to win (default: 500)
 * @returns {{ gameOver: boolean, winnerIndex: number|null }}
 */
function checkGameOver(players, targetScore = 500) {
    for (let i = 0; i < players.length; i++) {
        if (players[i].score >= targetScore) {
            return { gameOver: true, winnerIndex: i };
        }
    }
    return { gameOver: false, winnerIndex: null };
}

/**
 * Get final rankings sorted by score (descending)
 * @param {object[]} players - Array of player objects
 * @returns {object[]} Players sorted by score with rank property added
 */
function getFinalRankings(players) {
    const ranked = players.map((player, index) => ({
        ...player,
        originalIndex: index
    }));

    ranked.sort((a, b) => b.score - a.score);

    return ranked.map((player, index) => ({
        ...player,
        rank: index + 1
    }));
}

module.exports = {
    calculateHandValue,
    calculateRoundScores,
    checkGameOver,
    getFinalRankings
};
