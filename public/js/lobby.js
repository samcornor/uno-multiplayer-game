/**
 * lobby.js - Lobby management UI
 * 
 * Handles lobby creation, joining, and player list management
 */

const LobbyUI = {
    socket: null,
    roomCode: null,
    isHost: false,
    playerName: null,
    playerId: null,

    /**
     * Initialize lobby UI with socket connection
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
        // Create lobby button
        document.getElementById('create-lobby-btn').addEventListener('click', () => {
            const name = this.getPlayerName();
            if (!name) return;
            this.createLobby(name);
        });

        // Show join code input
        document.getElementById('join-lobby-btn').addEventListener('click', () => {
            document.getElementById('join-code-input').classList.toggle('hidden');
            document.getElementById('room-code').focus();
        });

        // Submit join
        document.getElementById('submit-join-btn').addEventListener('click', () => {
            const name = this.getPlayerName();
            const code = document.getElementById('room-code').value.trim().toUpperCase();
            if (!name || !code) {
                this.showError('menu-error', 'Please enter your name and room code');
                return;
            }
            this.joinLobby(code, name);
        });

        // Enter key on room code input
        document.getElementById('room-code').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('submit-join-btn').click();
            }
        });

        // Enter key on name input
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const joinInput = document.getElementById('join-code-input');
                if (joinInput.classList.contains('hidden')) {
                    document.getElementById('create-lobby-btn').click();
                } else {
                    document.getElementById('submit-join-btn').click();
                }
            }
        });

        // Copy room code
        document.getElementById('copy-code-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(this.roomCode).then(() => {
                Renderer.showToast('Room code copied!', 'success');
            });
        });

        // Start game
        document.getElementById('start-game-btn').addEventListener('click', () => {
            this.startGame();
        });

        // Leave lobby
        document.getElementById('leave-lobby-btn').addEventListener('click', () => {
            this.leaveLobby();
        });
    },

    /**
     * Bind socket events
     */
    bindSocketEvents() {
        // Lobby update
        this.socket.on('lobbyUpdate', (data) => {
            this.updateLobby(data);
        });

        // Message from server
        this.socket.on('message', (data) => {
            Renderer.showToast(data.text, data.type || 'info');
        });

        // Returned to lobby from game
        this.socket.on('returnedToLobby', () => {
            App.showScreen('lobby-screen');
            Renderer.showToast('Returned to lobby', 'info');
        });
    },

    /**
     * Get validated player name
     * @returns {string|null}
     */
    getPlayerName() {
        const name = document.getElementById('player-name').value.trim();
        if (!name) {
            this.showError('menu-error', 'Please enter your name');
            return null;
        }
        if (name.length > 20) {
            this.showError('menu-error', 'Name must be 20 characters or less');
            return null;
        }
        return name;
    },

    /**
     * Create a new lobby
     * @param {string} playerName - Host's name
     */
    createLobby(playerName) {
        this.hideError('menu-error');

        this.socket.emit('createLobby', playerName, (response) => {
            if (response.success) {
                this.roomCode = response.roomCode;
                this.playerId = response.playerId;
                this.playerName = playerName;
                this.isHost = true;
                App.showScreen('lobby-screen');
            } else {
                this.showError('menu-error', response.error);
            }
        });
    },

    /**
     * Join an existing lobby
     * @param {string} roomCode - Room code
     * @param {string} playerName - Player's name
     */
    joinLobby(roomCode, playerName) {
        this.hideError('menu-error');

        this.socket.emit('joinLobby', roomCode, playerName, (response) => {
            if (response.success) {
                this.roomCode = response.roomCode;
                this.playerId = response.playerId;
                this.playerName = playerName;
                this.isHost = false;

                if (response.reconnected) {
                    Renderer.showToast('Reconnected to game!', 'success');
                }

                App.showScreen('lobby-screen');
            } else {
                this.showError('menu-error', response.error);
            }
        });
    },

    /**
     * Update lobby display
     * @param {object} data - Lobby data
     */
    updateLobby(data) {
        this.roomCode = data.roomCode;
        this.isHost = data.hostId === this.playerId;

        // Update room code display
        document.getElementById('display-room-code').textContent = data.roomCode;

        // Update player count
        document.getElementById('player-count').textContent = `(${data.players.length}/10)`;

        // Update player list
        const playerList = document.getElementById('player-list');
        playerList.innerHTML = '';

        data.players.forEach(player => {
            const li = document.createElement('li');
            if (!player.connected) {
                li.classList.add('disconnected');
            }

            let badges = '';
            if (player.isHost) {
                badges += '<span class="host-badge">HOST</span>';
            }
            if (player.id === this.playerId) {
                badges += '<span class="you-badge">YOU</span>';
            }

            li.innerHTML = `
                <span class="player-name">${player.name} ${badges}</span>
                <span class="player-status">${player.connected ? '🟢' : '🔴'}</span>
            `;

            playerList.appendChild(li);
        });

        // Show/hide start button based on host status
        const startBtn = document.getElementById('start-game-btn');
        const waitingText = document.getElementById('waiting-text');

        if (this.isHost) {
            startBtn.classList.remove('hidden');
            waitingText.classList.add('hidden');

            // Disable if less than 2 players
            startBtn.disabled = data.players.length < 2;
        } else {
            startBtn.classList.add('hidden');
            waitingText.classList.remove('hidden');
        }
    },

    /**
     * Start the game (host only)
     */
    startGame() {
        this.socket.emit('startGame', (response) => {
            if (!response.success) {
                this.showError('lobby-error', response.error);
            }
            // Game state will be received via gameState event
        });
    },

    /**
     * Leave the current lobby
     */
    leaveLobby() {
        this.socket.emit('leaveLobby', () => {
            this.roomCode = null;
            this.isHost = false;
            App.showScreen('menu-screen');
        });
    },

    /**
     * Show error message
     * @param {string} elementId - Error element ID
     * @param {string} message - Error message
     */
    showError(elementId, message) {
        const el = document.getElementById(elementId);
        el.textContent = message;
        el.classList.remove('hidden');
    },

    /**
     * Hide error message
     * @param {string} elementId - Error element ID
     */
    hideError(elementId) {
        document.getElementById(elementId).classList.add('hidden');
    }
};

// Export for use in main.js
window.LobbyUI = LobbyUI;
