/**
 * LobbyManager.js - Lobby and room management
 * 
 * Handles:
 * - Creating lobbies with unique codes
 * - Player joining and leaving
 * - Host management
 * - Reconnection support
 */

/**
 * LobbyManager class - manages all active lobbies
 */
class LobbyManager {
    constructor() {
        // Map of roomCode -> lobby object
        this.lobbies = new Map();
        // Map of playerId -> roomCode for quick lookup
        this.playerRooms = new Map();
        // Map of playerName+roomCode -> playerId for reconnection
        this.disconnectedPlayers = new Map();
    }

    /**
     * Generate a unique 4-character room code
     * @returns {string} Room code
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
        let code;
        do {
            code = '';
            for (let i = 0; i < 4; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
        } while (this.lobbies.has(code));
        return code;
    }

    /**
     * Create a new lobby
     * @param {string} hostId - Socket ID of the host
     * @param {string} hostName - Name of the host
     * @returns {object} Lobby object
     */
    createLobby(hostId, hostName) {
        const roomCode = this.generateRoomCode();

        const lobby = {
            roomCode,
            hostId,
            players: [{
                id: hostId,
                name: hostName,
                connected: true
            }],
            gameState: null,
            createdAt: Date.now(),
            status: 'waiting' // waiting, playing, finished
        };

        this.lobbies.set(roomCode, lobby);
        this.playerRooms.set(hostId, roomCode);

        return lobby;
    }

    /**
     * Join an existing lobby
     * @param {string} roomCode - Room code to join
     * @param {string} playerId - Socket ID of joining player
     * @param {string} playerName - Name of joining player
     * @returns {{ success: boolean, lobby: object|null, error: string|null }}
     */
    joinLobby(roomCode, playerId, playerName) {
        const lobby = this.lobbies.get(roomCode.toUpperCase());

        if (!lobby) {
            return { success: false, lobby: null, error: 'Room not found' };
        }

        if (lobby.status !== 'waiting') {
            // Check if this is a reconnection
            const reconnectKey = `${playerName}:${roomCode}`;
            const oldPlayerId = this.disconnectedPlayers.get(reconnectKey);

            if (oldPlayerId) {
                return this.handleReconnect(roomCode, oldPlayerId, playerId, playerName);
            }

            return { success: false, lobby: null, error: 'Game already in progress' };
        }

        if (lobby.players.length >= 10) {
            return { success: false, lobby: null, error: 'Lobby is full (max 10 players)' };
        }

        // Check for duplicate name
        if (lobby.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            return { success: false, lobby: null, error: 'Name already taken in this lobby' };
        }

        lobby.players.push({
            id: playerId,
            name: playerName,
            connected: true
        });

        this.playerRooms.set(playerId, roomCode);

        return { success: true, lobby, error: null };
    }

    /**
     * Leave a lobby
     * @param {string} playerId - Socket ID of leaving player
     * @returns {{ success: boolean, lobby: object|null, wasHost: boolean, roomDeleted: boolean }}
     */
    leaveLobby(playerId) {
        const roomCode = this.playerRooms.get(playerId);
        if (!roomCode) {
            return { success: false, lobby: null, wasHost: false, roomDeleted: false };
        }

        const lobby = this.lobbies.get(roomCode);
        if (!lobby) {
            this.playerRooms.delete(playerId);
            return { success: false, lobby: null, wasHost: false, roomDeleted: false };
        }

        const playerIndex = lobby.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) {
            return { success: false, lobby: null, wasHost: false, roomDeleted: false };
        }

        const wasHost = lobby.hostId === playerId;
        const player = lobby.players[playerIndex];

        // If game is in progress, mark as disconnected instead of removing
        if (lobby.status === 'playing') {
            player.connected = false;
            this.disconnectedPlayers.set(`${player.name}:${roomCode}`, playerId);
            return { success: true, lobby, wasHost, roomDeleted: false };
        }

        // Remove player from lobby
        lobby.players.splice(playerIndex, 1);
        this.playerRooms.delete(playerId);

        // If lobby is empty, delete it
        if (lobby.players.length === 0) {
            this.lobbies.delete(roomCode);
            return { success: true, lobby: null, wasHost, roomDeleted: true };
        }

        // If host left, assign new host
        if (wasHost && lobby.players.length > 0) {
            lobby.hostId = lobby.players[0].id;
        }

        return { success: true, lobby, wasHost, roomDeleted: false };
    }

    /**
     * Handle player reconnection
     * @param {string} roomCode - Room code
     * @param {string} oldPlayerId - Original player ID
     * @param {string} newPlayerId - New socket ID
     * @param {string} playerName - Player name
     * @returns {{ success: boolean, lobby: object|null, error: string|null, reconnected: boolean }}
     */
    handleReconnect(roomCode, oldPlayerId, newPlayerId, playerName) {
        const lobby = this.lobbies.get(roomCode.toUpperCase());

        if (!lobby) {
            return { success: false, lobby: null, error: 'Room not found', reconnected: false };
        }

        const player = lobby.players.find(p => p.id === oldPlayerId);
        if (!player) {
            return { success: false, lobby: null, error: 'Player not found', reconnected: false };
        }

        // Update player ID and connected status
        player.id = newPlayerId;
        player.connected = true;

        // Update room tracking
        this.playerRooms.delete(oldPlayerId);
        this.playerRooms.set(newPlayerId, roomCode);

        // Clean up disconnected player entry
        this.disconnectedPlayers.delete(`${playerName}:${roomCode}`);

        // If this player was host, update host ID
        if (lobby.hostId === oldPlayerId) {
            lobby.hostId = newPlayerId;
        }

        // Update game state if game is in progress
        if (lobby.gameState) {
            const gamePlayer = lobby.gameState.players.find(p => p.id === oldPlayerId);
            if (gamePlayer) {
                gamePlayer.id = newPlayerId;
                gamePlayer.connected = true;
            }
            if (lobby.gameState.hostId === oldPlayerId) {
                lobby.gameState.hostId = newPlayerId;
            }
        }

        return { success: true, lobby, error: null, reconnected: true };
    }

    /**
     * Get lobby by room code
     * @param {string} roomCode - Room code
     * @returns {object|null} Lobby object or null
     */
    getLobby(roomCode) {
        return this.lobbies.get(roomCode.toUpperCase()) || null;
    }

    /**
     * Get lobby by player ID
     * @param {string} playerId - Socket ID
     * @returns {object|null} Lobby object or null
     */
    getLobbyByPlayer(playerId) {
        const roomCode = this.playerRooms.get(playerId);
        return roomCode ? this.lobbies.get(roomCode) : null;
    }

    /**
     * Start the game in a lobby
     * @param {string} roomCode - Room code
     * @param {string} requesterId - Socket ID of requester
     * @returns {{ success: boolean, error: string|null }}
     */
    startGame(roomCode, requesterId) {
        const lobby = this.lobbies.get(roomCode.toUpperCase());

        if (!lobby) {
            return { success: false, error: 'Room not found' };
        }

        if (lobby.hostId !== requesterId) {
            return { success: false, error: 'Only the host can start the game' };
        }

        if (lobby.players.length < 2) {
            return { success: false, error: 'Need at least 2 players to start' };
        }

        if (lobby.status !== 'waiting') {
            return { success: false, error: 'Game already started' };
        }

        lobby.status = 'playing';
        return { success: true, error: null };
    }

    /**
     * Set game state for a lobby
     * @param {string} roomCode - Room code
     * @param {object} gameState - Game state object
     */
    setGameState(roomCode, gameState) {
        const lobby = this.lobbies.get(roomCode.toUpperCase());
        if (lobby) {
            lobby.gameState = gameState;
        }
    }

    /**
     * End the game and return to lobby
     * @param {string} roomCode - Room code
     */
    endGame(roomCode) {
        const lobby = this.lobbies.get(roomCode.toUpperCase());
        if (lobby) {
            lobby.status = 'waiting';
            lobby.gameState = null;
        }
    }

    /**
     * Clean up old lobbies (call periodically)
     * @param {number} maxAgeMs - Maximum age in milliseconds (default: 2 hours)
     */
    cleanup(maxAgeMs = 7200000) {
        const now = Date.now();
        for (const [roomCode, lobby] of this.lobbies.entries()) {
            if (now - lobby.createdAt > maxAgeMs && lobby.status !== 'playing') {
                // Remove all player mappings
                for (const player of lobby.players) {
                    this.playerRooms.delete(player.id);
                }
                this.lobbies.delete(roomCode);
            }
        }
    }

    /**
     * Get statistics for monitoring
     * @returns {object} Stats
     */
    getStats() {
        return {
            totalLobbies: this.lobbies.size,
            totalPlayers: this.playerRooms.size,
            lobbiesByStatus: {
                waiting: [...this.lobbies.values()].filter(l => l.status === 'waiting').length,
                playing: [...this.lobbies.values()].filter(l => l.status === 'playing').length
            }
        };
    }
}

module.exports = LobbyManager;
