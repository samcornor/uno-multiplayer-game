/**
 * renderer.js - Card and UI rendering utilities
 * 
 * Handles visual representation of cards and game elements
 */

const Renderer = {
    /**
     * Create a card DOM element
     * @param {object} cardData - Card data from server
     * @param {boolean} playable - Whether the card can be played
     * @returns {HTMLElement}
     */
    createCardElement(cardData, playable = false) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.cardId = cardData.id;

        if (cardData.hidden) {
            card.classList.add('card-back');
            card.innerHTML = '<span class="card-back-logo">UNO</span>';
            return card;
        }

        // Add color class
        if (cardData.color) {
            card.classList.add(cardData.color);
        } else if (cardData.type === 'wild' || cardData.type === 'wildDrawFour') {
            card.classList.add('wild');
        }

        // Add playable state
        if (playable) {
            card.classList.add('playable');
        } else {
            card.classList.add('not-playable');
        }

        // Card content
        let valueDisplay = '';
        let typeDisplay = '';

        switch (cardData.type) {
            case 'number':
                valueDisplay = cardData.value;
                break;
            case 'skip':
                valueDisplay = '⊘';
                typeDisplay = 'Skip';
                break;
            case 'reverse':
                valueDisplay = '⟲';
                typeDisplay = 'Reverse';
                break;
            case 'drawTwo':
                valueDisplay = '+2';
                typeDisplay = 'Draw Two';
                break;
            case 'wild':
                valueDisplay = '★';
                typeDisplay = 'Wild';
                break;
            case 'wildDrawFour':
                valueDisplay = '+4';
                typeDisplay = 'Wild';
                break;
        }

        card.innerHTML = `
            <span class="card-value">${valueDisplay}</span>
            ${typeDisplay ? `<span class="card-type">${typeDisplay}</span>` : ''}
        `;

        return card;
    },

    /**
     * Create a discard pile card (larger)
     * @param {object} cardData - Card data from server
     * @returns {HTMLElement}
     */
    createDiscardCard(cardData) {
        const card = this.createCardElement(cardData, false);
        card.classList.remove('not-playable');
        return card;
    },

    /**
     * Render player's hand
     * @param {HTMLElement} container - Hand container
     * @param {object[]} cards - Array of card data
     * @param {object} gameState - Current game state
     * @param {function} onCardClick - Click handler
     */
    renderHand(container, cards, gameState, onCardClick) {
        container.innerHTML = '';

        if (!cards || cards.length === 0) return;

        // Determine which cards are playable
        const isMyTurn = gameState.players.some(p => p.hand && p.isCurrentPlayer);
        const awaitingColor = gameState.awaitingColorChoice;

        cards.forEach(cardData => {
            const playable = isMyTurn && !awaitingColor && this.isCardPlayable(cardData, gameState);
            const cardEl = this.createCardElement(cardData, playable);

            if (playable) {
                cardEl.addEventListener('click', () => onCardClick(cardData));
            }

            // Add draw animation for new cards
            cardEl.classList.add('drawing');
            container.appendChild(cardEl);
        });
    },

    /**
     * Check if a card is playable based on game state
     * @param {object} card - Card data
     * @param {object} state - Game state
     * @returns {boolean}
     */
    isCardPlayable(card, state) {
        const topCard = state.topCard;
        if (!topCard) return true;

        // If there's an active stack
        if (state.stackedDrawCount > 0) {
            if (state.stackType === 'drawTwo' && card.type === 'drawTwo') {
                return true;
            }
            if (state.stackType === 'drawFour' && card.type === 'wildDrawFour') {
                return true;
            }
            // Reverse can deflect the stack
            if (card.type === 'reverse') {
                return true;
            }
            // Skip can pass the stack to next player
            if (card.type === 'skip') {
                return true;
            }
            return false;
        }

        // Wild cards are always playable
        if (card.type === 'wild' || card.type === 'wildDrawFour') {
            return true;
        }

        // Color match
        if (card.color === state.currentColor) {
            return true;
        }

        // Value/type match
        if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) {
            return true;
        }

        if (card.type !== 'number' && card.type === topCard.type) {
            return true;
        }

        return false;
    },

    /**
     * Render opponents area
     * @param {HTMLElement} container - Opponents container
     * @param {object[]} players - All players
     * @param {string} myId - Current player's ID
     * @param {object} unoCallWindow - UNO catch window info
     * @param {function} onCatchClick - Catch button handler
     */
    renderOpponents(container, players, myId, unoCallWindow, onCatchClick) {
        container.innerHTML = '';

        const opponents = players.filter(p => p.id !== myId);

        opponents.forEach(player => {
            const slot = document.createElement('div');
            slot.className = 'opponent-slot';

            if (player.isCurrentPlayer) {
                slot.classList.add('current-turn');
            }

            if (!player.connected) {
                slot.classList.add('disconnected');
            }

            // Check if this player can be caught
            const canCatch = unoCallWindow &&
                unoCallWindow.playerId === player.id &&
                Date.now() < unoCallWindow.expiresAt;

            if (canCatch) {
                slot.classList.add('catching');
            }

            let badges = '';
            if (player.calledUno && player.cardCount === 1) {
                badges += '<span class="uno-called-badge">UNO!</span>';
            }

            let catchBtn = '';
            if (canCatch) {
                catchBtn = `<button class="catch-btn" data-player-id="${player.id}">CATCH!</button>`;
            }

            slot.innerHTML = `
                <span class="opponent-name" title="${player.name}">${player.name}</span>
                <div class="opponent-cards">
                    <div class="mini-card"></div>
                    <span class="opponent-card-count">×${player.cardCount}</span>
                </div>
                <span class="opponent-score">${player.score} pts</span>
                ${badges}
                ${catchBtn}
            `;

            if (canCatch) {
                const catchButton = slot.querySelector('.catch-btn');
                catchButton.addEventListener('click', () => onCatchClick(player.id));
            }

            container.appendChild(slot);
        });
    },

    /**
     * Update the top card display
     * @param {HTMLElement} container - Top card container
     * @param {object} cardData - Card data
     */
    updateTopCard(container, cardData) {
        container.innerHTML = '';
        if (cardData) {
            const cardEl = this.createDiscardCard(cardData);
            container.appendChild(cardEl);
        }
    },

    /**
     * Update color indicator
     * @param {HTMLElement} indicator - Color indicator element
     * @param {string} color - Current color
     */
    updateColorIndicator(indicator, color) {
        indicator.className = 'color-indicator';
        if (color) {
            indicator.classList.add(color);
        }
    },

    /**
     * Show toast notification
     * @param {string} message - Message to show
     * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Remove after animation
        setTimeout(() => {
            toast.remove();
        }, 3000);
    },

    /**
     * Render score table for round/game end
     * @param {object[]} players - Players with scores
     * @param {number[]} roundScores - Scores earned this round
     * @returns {string} HTML string
     */
    renderScoreTable(players, roundScores = null) {
        let html = '';

        // Sort by total score descending
        const sorted = [...players].sort((a, b) => b.score - a.score);

        sorted.forEach((player, index) => {
            const roundScore = roundScores ? roundScores[players.findIndex(p => p.id === player.id)] : 0;
            html += `
                <div class="score-row">
                    <span class="player-name">${index + 1}. ${player.name}</span>
                    ${roundScores ? `<span class="round-score">+${roundScore}</span>` : ''}
                    <span class="total-score">${player.score} pts</span>
                </div>
            `;
        });

        return html;
    }
};

// Export for use in other modules
window.Renderer = Renderer;
