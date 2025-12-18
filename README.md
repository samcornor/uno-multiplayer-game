# UNO Multiplayer Game

A real-time multiplayer UNO game playable in the browser with friends.

## Features

- **Official UNO Rules** with 108-card deck
- **Stacking**: +2 stacks on +2, +4 stacks on +4
- **Real-time Multiplayer** via WebSocket (Socket.IO)
- **Lobby System** with 4-character join codes
- **Reconnection Support** for dropped connections
- **Point Scoring** across multiple rounds (first to 500 wins)
- **Mobile-Friendly** responsive design

## Rule Variants

| Rule | Behavior |
|------|----------|
| Stacking | +2 stacks on +2, +4 stacks on +4 |
| Wild Draw Four | No challenge mechanic |
| UNO Call | Must call BEFORE playing second-to-last card |
| Forced Draw | Draw 1, may play immediately if valid |
| Scoring | First to 500 points wins |

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

## How to Play

1. **Create or Join a Game**
   - Enter your name
   - Click "Create Game" to host, or
   - Click "Join Game" and enter the room code

2. **In the Lobby**
   - Share the 4-character room code with friends
   - Host clicks "Start Game" when ready (2-10 players)

3. **Playing**
   - Click a highlighted card to play it
   - Click the draw pile to draw a card
   - Click "UNO!" when you have 2 cards, BEFORE playing
   - Click "CATCH!" on opponents who forget to call UNO

## File Structure

```
uno/
├── package.json          # Dependencies
├── server.js             # Main server with Socket.IO
├── game/
│   ├── Card.js           # Card class
│   ├── Deck.js           # Deck management
│   ├── GameRules.js      # Rule validation
│   ├── GameState.js      # Game state management
│   └── Scoring.js        # Point calculation
├── lobby/
│   └── LobbyManager.js   # Lobby system
└── public/
    ├── index.html        # Main HTML
    ├── css/styles.css    # Styling
    └── js/
        ├── main.js       # App entry point
        ├── lobby.js      # Lobby UI
        ├── game.js       # Game UI
        └── renderer.js   # Card rendering
```

## Hosting Publicly

1. **Deploy to a cloud platform** (Heroku, Railway, Render, etc.)
2. **Environment Variables**: Set `PORT` if required
3. **WebSocket Support**: Ensure your host supports WebSockets
4. **SSL**: Use HTTPS for production (Socket.IO works on wss://)

Example for Railway/Render:
```bash
# Just push to GitHub and connect the repo
# The platform will auto-detect Node.js and run npm start
```

## Technology Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **No external game engines or frameworks**

## License

MIT
