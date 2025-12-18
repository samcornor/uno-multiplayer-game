/**
 * main.js - Application entry point
 * 
 * Initializes Socket.IO connection and coordinates UI modules
 */

const App = {
    socket: null,

    /**
     * Initialize the application
     */
    init() {
        // Connect to Socket.IO server
        // Use polling transport for better compatibility with tunnels/proxies
        this.socket = io({
            transports: ['polling', 'websocket'], // Start with polling, upgrade to websocket
            upgrade: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 20000
        });

        // Initialize UI modules
        LobbyUI.init(this.socket);
        GameUI.init(this.socket);

        // Setup connection handlers
        this.setupConnectionHandlers();

        // Show menu when connected
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.showScreen('menu-screen');

            // Check if we were in a game (for reconnection)
            this.checkPreviousSession();
        });
    },

    /**
     * Setup connection event handlers
     */
    setupConnectionHandlers() {
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            Renderer.showToast('Connection error. Retrying...', 'error');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            if (reason === 'io server disconnect') {
                // Server disconnected us, try to reconnect
                this.socket.connect();
            }
            Renderer.showToast('Disconnected from server', 'warning');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            Renderer.showToast('Reconnected!', 'success');
            this.checkPreviousSession();
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log('Reconnection attempt', attemptNumber);
        });

        this.socket.on('reconnect_failed', () => {
            Renderer.showToast('Failed to reconnect. Please refresh the page.', 'error');
        });
    },

    /**
     * Check for previous session and attempt to rejoin
     */
    checkPreviousSession() {
        const savedSession = this.getSavedSession();
        if (savedSession) {
            // Try to rejoin with saved info
            this.socket.emit('joinLobby', savedSession.roomCode, savedSession.playerName, (response) => {
                if (response.success) {
                    LobbyUI.roomCode = response.roomCode;
                    LobbyUI.playerId = response.playerId;
                    LobbyUI.playerName = savedSession.playerName;

                    if (response.reconnected) {
                        Renderer.showToast('Rejoined game!', 'success');
                    }
                } else {
                    // Clear saved session if can't rejoin
                    this.clearSavedSession();
                }
            });
        }
    },

    /**
     * Save current session for reconnection
     * @param {string} roomCode - Room code
     * @param {string} playerName - Player name
     */
    saveSession(roomCode, playerName) {
        try {
            sessionStorage.setItem('uno_session', JSON.stringify({ roomCode, playerName }));
        } catch (e) {
            console.warn('Could not save session:', e);
        }
    },

    /**
     * Get saved session
     * @returns {object|null}
     */
    getSavedSession() {
        try {
            const data = sessionStorage.getItem('uno_session');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Clear saved session
     */
    clearSavedSession() {
        try {
            sessionStorage.removeItem('uno_session');
        } catch (e) {
            console.warn('Could not clear session:', e);
        }
    },

    /**
     * Show a specific screen
     * @param {string} screenId - ID of screen to show
     */
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show requested screen
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
        }

        // Save session when entering lobby
        if (screenId === 'lobby-screen' && LobbyUI.roomCode) {
            this.saveSession(LobbyUI.roomCode, LobbyUI.playerName);
        }

        // Clear session when returning to menu
        if (screenId === 'menu-screen') {
            this.clearSavedSession();
        }
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other modules
window.App = App;
