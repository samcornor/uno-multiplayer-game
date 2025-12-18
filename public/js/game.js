/**
 * game.js - Game UI and interaction handler
 * 
 * Manages game state display, card interactions, and game actions
 */

const GameUI = {
    socket: null,
    gameState: null,
    playerId: null,
    canPlayDrawnCard: false,
    drawnCardId: null,

    /**
     * Initialize game UI with socket connection
     * @param {Socket} socket - Socket.IO socket
     */
    init(socket) {
        this.socket = socket;
        this.bindEvents();
        this.bindSocketEvents();
    },

    /**
     * Bind DOM events
     */
    bindEvents() {
        // Draw pile click
        document.getElementById('draw-pile').addEventListener('click', () => {
            this.drawCard();
        });

        // UNO button
        document.getElementById('uno-button').addEventListener('click', () => {
            this.callUno();
        });

        // Skip playing drawn card
        document.getElementById('skip-draw-btn').addEventListener('click', () => {
            this.skipPlayDrawnCard();
        });

        // Color picker buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.chooseColor(color);
            });
        });

        // Next round button
        document.getElementById('next-round-btn').addEventListener('click', () => {
            this.nextRound();
        });

        // Return to lobby button
        document.getElementById('return-lobby-btn').addEventListener('click', () => {
            this.returnToLobby();
        });
    },

    /**
     * Bind socket events
     */
    bindSocketEvents() {
        // Game state update
        this.socket.on('gameState', (state) => {
            this.gameState = state;
            this.playerId = LobbyUI.playerId;
            this.renderGame();

            // Switch to game screen if not already there
            if (!document.getElementById('game-screen').classList.contains('active')) {
                App.showScreen('game-screen');
            }
        });

        // Action feedback
        this.socket.on('action', (action) => {
            this.showActionFeedback(action);
        });
    },

    /**
     * Render the entire game state
     */
    renderGame() {
        const state = this.gameState;
        if (!state) return;

        // Find current player (me)
        const me = state.players.find(p => p.id === this.playerId);
        if (!me) return;

        // Render my hand
        this.renderHand(me.hand);

        // Render opponents
        Renderer.renderOpponents(
            document.getElementById('opponents-area'),
            state.players,
            this.playerId,
            state.unoCallWindow,
            (targetId) => this.catchUno(targetId)
        );

        // Update top card
        Renderer.updateTopCard(
            document.getElementById('top-card'),
            state.topCard
        );

        // Update color indicator
        Renderer.updateColorIndicator(
            document.getElementById('current-color-indicator'),
            state.currentColor
        );

        // Update turn indicator
        const currentPlayer = state.players.find(p => p.isCurrentPlayer);
        document.getElementById('current-player-name').textContent =
            currentPlayer ? (currentPlayer.id === this.playerId ? "Your Turn!" : `${currentPlayer.name}'s Turn`) : 'Waiting...';

        // Update direction indicator
        const dirIndicator = document.getElementById('direction-indicator');
        dirIndicator.textContent = state.direction === 1 ? '↻' : '↺';
        dirIndicator.classList.toggle('reversed', state.direction === -1);

        // Update stack indicator
        const stackIndicator = document.getElementById('stack-indicator');
        if (state.stackedDrawCount > 0) {
            stackIndicator.classList.remove('hidden');
            document.getElementById('stack-count').textContent = `+${state.stackedDrawCount}`;
        } else {
            stackIndicator.classList.add('hidden');
        }

        // Update draw pile count
        document.getElementById('draw-count').textContent = state.drawPile.count;

        // Update player info bar
        document.getElementById('your-name').textContent = me.name;
        document.getElementById('your-score').textContent = `Score: ${me.score}`;
        document.getElementById('card-count').textContent = `Cards: ${me.cardCount}`;

        // Update UNO button state
        this.updateUnoButton(me);

        // Update skip button visibility
        document.getElementById('skip-draw-btn').classList.toggle('hidden', !this.canPlayDrawnCard);

        // Handle overlays
        this.handleOverlays(state, me);
    },

    /**
     * Render player's hand
     * @param {object[]} cards - Cards in hand
     */
    renderHand(cards) {
        const container = document.getElementById('player-hand');

        Renderer.renderHand(
            container,
            cards,
            this.gameState,
            (card) => this.playCard(card)
        );
    },

    /**
     * Update UNO button state
     * @param {object} me - Current player data
     */
    updateUnoButton(me) {
        const unoBtn = document.getElementById('uno-button');
        const isMyTurn = me.isCurrentPlayer;
        const hasTwoCards = me.hand && me.hand.length === 2;
        const alreadyCalled = me.calledUno;

        // Can call UNO if it's my turn, I have 2 cards, and haven't called yet
        unoBtn.disabled = !(isMyTurn && hasTwoCards && !alreadyCalled);

        if (alreadyCalled && hasTwoCards) {
            unoBtn.textContent = 'UNO! ✓';
        } else {
            unoBtn.textContent = 'UNO!';
        }
    },

    /**
     * Handle game overlays (color picker, round end, game over)
     * @param {object} state - Game state
     * @param {object} me - Current player
     */
    handleOverlays(state, me) {
        const overlay = document.getElementById('game-overlay');
        const colorPicker = document.getElementById('color-picker');
        const roundEndPanel = document.getElementById('round-end-panel');
        const gameOverPanel = document.getElementById('game-over-panel');

        // Hide all panels first
        colorPicker.classList.add('hidden');
        roundEndPanel.classList.add('hidden');
        gameOverPanel.classList.add('hidden');

        // Color picker
        if (state.awaitingColorChoice && me.isCurrentPlayer) {
            overlay.classList.remove('hidden');
            colorPicker.classList.remove('hidden');
            return;
        }

        // Round end
        if (state.phase === 'roundEnd') {
            overlay.classList.remove('hidden');
            roundEndPanel.classList.remove('hidden');

            const lastAction = state.lastAction;
            if (lastAction && lastAction.type === 'roundEnd') {
                document.getElementById('round-winner').textContent =
                    `${lastAction.winnerName} wins the round!`;
                document.getElementById('round-scores').innerHTML =
                    Renderer.renderScoreTable(state.players, lastAction.roundScores);
            }

            // Show next round button for host
            const isHost = state.hostId === this.playerId;
            document.getElementById('next-round-btn').classList.toggle('hidden', !isHost);
            document.getElementById('wait-next-round').classList.toggle('hidden', isHost);
            return;
        }

        // Game over
        if (state.phase === 'gameOver') {
            overlay.classList.remove('hidden');
            gameOverPanel.classList.remove('hidden');

            const lastAction = state.lastAction;
            if (lastAction && lastAction.type === 'gameOver') {
                document.getElementById('game-winner').textContent =
                    `🏆 ${lastAction.winnerName} wins! 🏆`;
                document.getElementById('final-scores').innerHTML =
                    Renderer.renderScoreTable(state.players);
            }

            // Show return button for host
            const isHost = state.hostId === this.playerId;
            document.getElementById('return-lobby-btn').classList.toggle('hidden', !isHost);
            document.getElementById('wait-lobby').classList.toggle('hidden', isHost);
            return;
        }

        // Hide overlay if none of the above
        overlay.classList.add('hidden');
    },

    /**
     * Show action feedback
     * @param {object} action - Action data
     */
    showActionFeedback(action) {
        const feedback = document.getElementById('action-feedback');
        feedback.textContent = action.message;
        feedback.classList.add('highlight');

        setTimeout(() => {
            feedback.classList.remove('highlight');
        }, 2000);

        // Also show as toast for important actions
        if (action.type === 'caughtUno' || action.type === 'callUno') {
            Renderer.showToast(action.message, action.type === 'caughtUno' ? 'warning' : 'success');
        }
    },

    /**
     * Play a card
     * @param {object} card - Card to play
     */
    playCard(card) {
        // Check if it's my turn
        const me = this.gameState.players.find(p => p.id === this.playerId);
        if (!me || !me.isCurrentPlayer) {
            Renderer.showToast("It's not your turn!", 'error');
            return;
        }

        // Check if awaiting color choice
        if (this.gameState.awaitingColorChoice) {
            Renderer.showToast("Choose a color first!", 'error');
            return;
        }

        // For wild cards, don't send color yet (will be asked via overlay)
        const isWild = card.type === 'wild' || card.type === 'wildDrawFour';

        this.socket.emit('playCard', card.id, null, (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            } else {
                // Clear drawn card state
                this.canPlayDrawnCard = false;
                this.drawnCardId = null;
            }
        });
    },

    /**
     * Choose color for wild card
     * @param {string} color - Chosen color
     */
    chooseColor(color) {
        this.socket.emit('chooseColor', color, (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            }
        });
    },

    /**
     * Draw a card
     */
    drawCard() {
        // Check if it's my turn
        const me = this.gameState.players.find(p => p.id === this.playerId);
        if (!me || !me.isCurrentPlayer) {
            Renderer.showToast("It's not your turn!", 'error');
            return;
        }

        // Check if awaiting color choice
        if (this.gameState.awaitingColorChoice) {
            Renderer.showToast("Choose a color first!", 'error');
            return;
        }

        this.socket.emit('drawCard', (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            } else {
                const count = response.drawnCards.length;
                if (count > 1) {
                    Renderer.showToast(`Drew ${count} cards`, 'info');
                }

                // Check if can play the drawn card
                if (response.canPlayDrawn && response.drawnCards.length === 1) {
                    this.canPlayDrawnCard = true;
                    this.drawnCardId = response.drawnCards[0].id;
                    Renderer.showToast('You can play the drawn card or keep it', 'info');
                } else {
                    this.canPlayDrawnCard = false;
                    this.drawnCardId = null;
                }
            }
        });
    },

    /**
     * Skip playing the drawn card
     */
    skipPlayDrawnCard() {
        this.socket.emit('skipPlayDrawn', (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            }
            this.canPlayDrawnCard = false;
            this.drawnCardId = null;
        });
    },

    /**
     * Call UNO
     */
    callUno() {
        this.socket.emit('callUno', (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            } else {
                Renderer.showToast('UNO!', 'success');
            }
        });
    },

    /**
     * Catch a player who didn't call UNO
     * @param {string} targetId - Target player ID
     */
    catchUno(targetId) {
        this.socket.emit('catchUno', targetId, (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            }
        });
    },

    /**
     * Start next round
     */
    nextRound() {
        this.socket.emit('nextRound', (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            }
        });
    },

    /**
     * Return to lobby
     */
    returnToLobby() {
        this.socket.emit('returnToLobby', (response) => {
            if (!response.success) {
                Renderer.showToast(response.error, 'error');
            }
        });
    }
};

// Export for use in main.js
window.GameUI = GameUI;
