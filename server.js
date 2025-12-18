/**
 * server.js - Main UNO game server
 * 
 * Express server with Socket.IO for real-time multiplayer UNO.
 * All game logic is server-authoritative to prevent cheating.
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const LobbyManager = require('./lobby/LobbyManager');
const {
    createGameState,
    startRound,
    playCard,
    chooseColor,
    playerDrawCards,
    skipPlayDrawnCard,
    callUno,
    catchUno,
    startNextRound,
    handleDisconnect,
    getStateForPlayer
} = require('./game/GameState');

// Initialize Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    // Allow both transports, let client choose
    transports: ['polling', 'websocket'],
    // Increase timeouts for slower connections
    pingTimeout: 60000,
    pingInterval: 25000,
    // Allow upgrades from polling to websocket
    allowUpgrades: true,
    // Increase max payload for game state
    maxHttpBufferSize: 1e6
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize lobby manager
const lobbyManager = new LobbyManager();

// Cleanup old lobbies every 30 minutes
setInterval(() => {
    lobbyManager.cleanup();
}, 1800000);

/**
 * Broadcast game state to all players in a room
 * Each player receives their own view with hidden opponent hands
 * @param {string} roomCode - Room code
 */
function broadcastGameState(roomCode) {
    const lobby = lobbyManager.getLobby(roomCode);
    if (!lobby || !lobby.gameState) return;

    const state = lobby.gameState;

    for (const player of lobby.players) {
        const playerState = getStateForPlayer(state, player.id);
        io.to(player.id).emit('gameState', playerState);
    }
}

/**
 * Broadcast lobby state to all players in a room
 * @param {object} lobby - Lobby object
 */
function broadcastLobbyState(lobby) {
    io.to(lobby.roomCode).emit('lobbyUpdate', {
        roomCode: lobby.roomCode,
        hostId: lobby.hostId,
        players: lobby.players.map(p => ({
            id: p.id,
            name: p.name,
            connected: p.connected,
            isHost: p.id === lobby.hostId
        })),
        status: lobby.status
    });
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    /**
     * Create a new lobby
     * @param {string} playerName - Name of the host player
     */
    socket.on('createLobby', (playerName, callback) => {
        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
            callback({ success: false, error: 'Invalid player name' });
            return;
        }

        const name = playerName.trim().substring(0, 20); // Limit name length
        const lobby = lobbyManager.createLobby(socket.id, name);

        socket.join(lobby.roomCode);

        callback({
            success: true,
            roomCode: lobby.roomCode,
            playerId: socket.id
        });

        broadcastLobbyState(lobby);
        console.log(`Lobby created: ${lobby.roomCode} by ${name}`);
    });

    /**
     * Join an existing lobby
     * @param {string} roomCode - Room code to join
     * @param {string} playerName - Name of the joining player
     */
    socket.on('joinLobby', (roomCode, playerName, callback) => {
        if (!roomCode || typeof roomCode !== 'string') {
            callback({ success: false, error: 'Invalid room code' });
            return;
        }

        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
            callback({ success: false, error: 'Invalid player name' });
            return;
        }

        const name = playerName.trim().substring(0, 20);
        const result = lobbyManager.joinLobby(roomCode, socket.id, name);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        socket.join(result.lobby.roomCode);

        callback({
            success: true,
            roomCode: result.lobby.roomCode,
            playerId: socket.id,
            reconnected: result.reconnected || false
        });

        // If reconnected to an active game, send game state
        if (result.reconnected && result.lobby.gameState) {
            const playerState = getStateForPlayer(result.lobby.gameState, socket.id);
            socket.emit('gameState', playerState);
            socket.emit('message', { type: 'info', text: 'Reconnected to game!' });
        }

        broadcastLobbyState(result.lobby);
        console.log(`Player ${name} joined lobby ${result.lobby.roomCode}`);
    });

    /**
     * Start the game (host only)
     */
    socket.on('startGame', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby) {
            callback({ success: false, error: 'Not in a lobby' });
            return;
        }

        const result = lobbyManager.startGame(lobby.roomCode, socket.id);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        // Create and start game state
        const gameState = createGameState(
            lobby.roomCode,
            lobby.players,
            500 // Target score
        );
        startRound(gameState);
        lobbyManager.setGameState(lobby.roomCode, gameState);

        callback({ success: true });

        // Broadcast initial game state to all players
        broadcastGameState(lobby.roomCode);

        console.log(`Game started in lobby ${lobby.roomCode}`);
    });

    /**
     * Play a card
     * @param {string} cardId - ID of the card to play
     * @param {string} chosenColor - Color choice for wild cards (optional)
     */
    socket.on('playCard', (cardId, chosenColor, callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        const result = playCard(lobby.gameState, socket.id, cardId, chosenColor);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        callback({ success: true });
        broadcastGameState(lobby.roomCode);

        // Broadcast last action
        if (result.state.lastAction) {
            io.to(lobby.roomCode).emit('action', result.state.lastAction);
        }
    });

    /**
     * Choose color for wild card
     * @param {string} color - Chosen color
     */
    socket.on('chooseColor', (color, callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        const result = chooseColor(lobby.gameState, socket.id, color);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        callback({ success: true });
        broadcastGameState(lobby.roomCode);

        if (result.state.lastAction) {
            io.to(lobby.roomCode).emit('action', result.state.lastAction);
        }
    });

    /**
     * Draw card(s)
     */
    socket.on('drawCard', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        const result = playerDrawCards(lobby.gameState, socket.id);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        callback({
            success: true,
            drawnCards: result.drawnCards.map(c => c.toJSON()),
            canPlayDrawn: result.canPlayDrawn
        });

        broadcastGameState(lobby.roomCode);

        if (result.state.lastAction) {
            io.to(lobby.roomCode).emit('action', result.state.lastAction);
        }
    });

    /**
     * Skip playing the drawn card
     */
    socket.on('skipPlayDrawn', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        const result = skipPlayDrawnCard(lobby.gameState, socket.id);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        callback({ success: true });
        broadcastGameState(lobby.roomCode);

        if (result.state.lastAction) {
            io.to(lobby.roomCode).emit('action', result.state.lastAction);
        }
    });

    /**
     * Call UNO
     */
    socket.on('callUno', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        const result = callUno(lobby.gameState, socket.id);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        callback({ success: true });

        if (result.state.lastAction) {
            io.to(lobby.roomCode).emit('action', result.state.lastAction);
        }

        broadcastGameState(lobby.roomCode);
    });

    /**
     * Catch a player who didn't call UNO
     * @param {string} targetId - ID of player to catch
     */
    socket.on('catchUno', (targetId, callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        const result = catchUno(lobby.gameState, socket.id, targetId);

        if (!result.success) {
            callback({ success: false, error: result.error });
            return;
        }

        callback({ success: true });
        broadcastGameState(lobby.roomCode);

        if (result.state.lastAction) {
            io.to(lobby.roomCode).emit('action', result.state.lastAction);
        }
    });

    /**
     * Start next round (after round end)
     */
    socket.on('nextRound', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby || !lobby.gameState) {
            callback({ success: false, error: 'No active game' });
            return;
        }

        if (lobby.hostId !== socket.id) {
            callback({ success: false, error: 'Only the host can start the next round' });
            return;
        }

        if (lobby.gameState.phase !== 'roundEnd') {
            callback({ success: false, error: 'Round is not over yet' });
            return;
        }

        startNextRound(lobby.gameState);

        callback({ success: true });
        broadcastGameState(lobby.roomCode);

        if (lobby.gameState.lastAction) {
            io.to(lobby.roomCode).emit('action', lobby.gameState.lastAction);
        }
    });

    /**
     * Return to lobby (after game over)
     */
    socket.on('returnToLobby', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby) {
            callback({ success: false, error: 'Not in a lobby' });
            return;
        }

        if (lobby.hostId !== socket.id) {
            callback({ success: false, error: 'Only the host can return to lobby' });
            return;
        }

        lobbyManager.endGame(lobby.roomCode);

        callback({ success: true });
        broadcastLobbyState(lobby);

        io.to(lobby.roomCode).emit('returnedToLobby');
    });

    /**
     * Leave lobby
     */
    socket.on('leaveLobby', (callback) => {
        const result = lobbyManager.leaveLobby(socket.id);

        if (result.lobby) {
            socket.leave(result.lobby.roomCode);
            broadcastLobbyState(result.lobby);
        }

        callback({ success: true });
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (lobby) {
            // Mark player as disconnected
            const result = lobbyManager.leaveLobby(socket.id);

            if (result.lobby && !result.roomDeleted) {
                // Update game state if game is in progress
                if (result.lobby.gameState) {
                    handleDisconnect(result.lobby.gameState, socket.id);
                    broadcastGameState(result.lobby.roomCode);
                }

                broadcastLobbyState(result.lobby);

                io.to(result.lobby.roomCode).emit('message', {
                    type: 'warning',
                    text: `A player has disconnected`
                });
            }
        }
    });

    /**
     * Get current state (for reconnection)
     */
    socket.on('getState', (callback) => {
        const lobby = lobbyManager.getLobbyByPlayer(socket.id);

        if (!lobby) {
            callback({ success: false, error: 'Not in a lobby' });
            return;
        }

        if (lobby.gameState) {
            const playerState = getStateForPlayer(lobby.gameState, socket.id);
            callback({ success: true, gameState: playerState, inGame: true });
        } else {
            callback({
                success: true,
                lobby: {
                    roomCode: lobby.roomCode,
                    hostId: lobby.hostId,
                    players: lobby.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        connected: p.connected,
                        isHost: p.id === lobby.hostId
                    })),
                    status: lobby.status
                },
                inGame: false
            });
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`UNO server running on http://localhost:${PORT}`);
});
