# WULAND

WULAND is a browser-playable 2D RPG-style village prototype for an RPA team. Phase 3 keeps the character creation, local profile/progress save, multiplayer village movement, sleeping offline players, building visits, and collisions, then adds simple server-authoritative co-op combat.

## Local Development

Install dependencies from the repository root:

```bash
npm install
```

Start the client and multiplayer server together:

```bash
npm run dev
```

The client runs on `http://localhost:5173` and the Colyseus server runs on `ws://localhost:2567` by default. Open two browser tabs to create or continue characters and see both players in the same WULAND room.

Useful scripts:

```bash
npm run dev:client
npm run dev:server
npm run build
npm run build:client
npm run build:server
npm run start:server
npm run typecheck
npm run preview
npm run build:pages-root
```

## Multiplayer

The client connects through `VITE_SERVER_URL`. For local development, copy `client/.env.example` if you want to override it:

```bash
VITE_SERVER_URL=ws://localhost:2567
```

The server uses:

```bash
PORT=2567
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173,https://wuland.bekulov.com
OFFLINE_PLAYER_TTL_HOURS=168
```

`npm run dev` builds shared types first, then starts Vite and the Node/Colyseus server concurrently.

For the live GitHub Pages client, set the repository variable `VITE_SERVER_URL` to your production WebSocket server URL, for example:

```bash
VITE_SERVER_URL=wss://wuland-server.kbekulov.live
```

## Combat Controls

- `J`: basic attack in your facing direction or against the selected enemy.
- Left click an enemy: select it and basic attack if the server says it is in range.
- `K` or `Space`: class special ability.

Combat is intentionally simple prototype combat. The server owns player HP, enemy HP, ability cooldowns, enemy movement, damage, defeats, and respawns. The browser only sends movement and attack requests.

## Classes

- Developer: DPS / worker. `Code Strike`, `Implement Feature`, and bonus damage to Bugs, Task Slimes, and Broken Bots.
- Senior Developer: tank / rules guardian. `Standards Strike`, `Rule Shield`, and reduced incoming damage.
- Business Analyst: tactician / marker. `User Story Shot`, `Break Down Scope`, and marks that help Developers hit harder.
- Senior Business Analyst: senior tactician / coordinator. `Clarify Shot`, `Process Alignment`, and nearby ally range support.
- Product Owner: protector / quest giver. `Priority Command`, `Take the Hit`, and defense near BAs, Senior BAs, or Developers.
- Senior Product Owner: commander / morale leader. `Roadmap Command`, `Department Rally`, and longer buffs.
- Architect: system mage / engineer. `Blueprint Bolt`, `Platform Shift`, and bonus damage to Legacy System Golems.

## Enemies

Enemies spawn around WULAND, wander, chase nearby online players, deal contact damage, disappear when defeated, and respawn later.

- Bug
- Broken Bot
- Task Slime
- Edge Case
- Vague Requirement
- Scope Blob
- Angry Client
- Escalation Demon
- Legacy System Golem
- Standards Violation

## Server Persistence

Prototype player persistence is stored as JSON at `server/data/wuland-players.json`. The server creates `server/data` automatically, debounces disk writes, saves joins, movement position updates, and disconnects, and removes expired offline players based on `OFFLINE_PLAYER_TTL_HOURS`.

Disconnected players remain visible as sleeping characters at their last saved position. If the same `playerId` returns, the sleeping character wakes up and no duplicate is created. If the same `playerId` connects twice at the same time, the second connection is rejected with a clear error.

Combat state is not permanent yet. Player HP, cooldowns, shields, buffs, and enemies reset when the server restarts.

JSON file persistence is prototype-only. A production version needs real accounts/authentication and database-backed persistence such as SQLite, Redis, or Postgres.

## Synology NAS Server Deployment

The repository includes a NAS-ready Docker setup:

```txt
server/Dockerfile
docker-compose.yml
docker-compose.direct.yml
synology-compose.yml
.env.synology.example
NAS_DEPLOYMENT.md
```

Recommended setup:

```txt
GitHub Pages client: https://wuland.bekulov.com
Synology Docker server: wuland-server
Cloudflare Tunnel URL: wss://wuland-server.kbekulov.live
```

If Synology only lets you upload a YML file, use `synology-compose.yml`. It pulls the prebuilt `ghcr.io/kbekulov/wuland-server:latest` image and runs it with Cloudflare Tunnel.

If you use the source-build route, copy the repository to the NAS, copy `.env.synology.example` to `.env`, paste your Cloudflare Tunnel token, then start the project in Synology Container Manager using `docker-compose.yml`.

With Cloudflare Tunnel, no router port forwarding is required. If you choose direct router exposure instead, use `docker-compose.direct.yml`, forward TCP `2567` to the NAS, and put HTTPS/WSS in front of the server with a reverse proxy.

See `NAS_DEPLOYMENT.md` for the step-by-step checklist.

## Project Shape

- `client`: Phaser 3, TypeScript, Vite, localStorage save data, and Colyseus client networking.
- `shared`: shared constants, validation helpers, movement rules, combat data, player profile types, network state, map bounds, and collision rectangles.
- `server`: Node.js, TypeScript, Express health endpoint, Colyseus room, JSON player store, and Docker deployment files.

The production build is deployed to GitHub Pages at `https://wuland.bekulov.com`. The repository includes a GitHub Actions Pages workflow and also keeps root-level built assets for the current branch-based Pages configuration.

## Phase Roadmap

Phase 1 added local character creation, profile/progress persistence, and the playable village.

Phase 2 adds multiplayer, server-authoritative movement, and offline sleeping player persistence.

Phase 3 adds simple class abilities, enemies, HP, attacks, cooldowns, defeat, and respawn.

Phase 4 will add mobile controls and deployment hardening.
