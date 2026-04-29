# WULAND

WULAND is a browser-playable 2D RPG-style village prototype for an RPA team. Phase 8 keeps multiplayer movement, sleeping players, multi-map interiors, enemies, server-authoritative combat, shared weapons, inventory, merchant shopping, cakes, and dropped items, then adds ambient NPCs, player chat, speech bubbles, and a prototype God Mode cleanup tool.

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
CLEAR_PLAYER_STORE_ON_START=false
ENEMY_AI_PAUSED=false
GOD_MODE_ENABLED=true
GOD_MODE_CODE=
```

`npm run dev` builds shared types first, then starts Vite and the Node/Colyseus server concurrently.

For the live GitHub Pages client, set the repository variable `VITE_SERVER_URL` to your production WebSocket server URL, for example:

```bash
VITE_SERVER_URL=wss://wuland-server.kbekulov.live
```

## Movement And World Controls

- `WASD` or arrow keys: move.
- Mouse click or touchscreen tap: move toward a target.
- Mobile joystick or D-pad: direct movement.
- Walk into a marked doorway or press `F` near it to enter a building.
- Press `F` near an interior exit door to return to WULAND.

Keyboard or joystick movement interrupts click/tap movement. The server remains authoritative for movement, map transitions, collision, and final position.

## Multi-Map WULAND

The overworld is the main WULAND village. The five buildings now have separate interior maps:

- RPA CoE: automation office with desks, terminals, and bot/server stations.
- Bathroom: tiled room with sinks, stalls, and mirrors.
- Kitchen: counters, fridge, stove, coffee area, and tables.
- BusyBeet: busy workspace with desks, notice board, and productivity props.
- Din Break: relaxed break room with couches, vending machine, and coffee table.

Each overworld building has a doorway marker and hovering arrow. Each interior has an exit door with its own marker. Entering an interior marks that building as visited in localStorage progress.

Players, sleeping players, enemies, dropped items, and prompts are filtered by map. You only see online or sleeping players who are in the same map as you. Dropped items stay in the map where they were dropped, so a cake dropped in Kitchen remains in Kitchen until someone in Kitchen picks it up.

## Combat Controls

- `1` through `9`: select a hotbar slot.
- `Space`: attack with the selected weapon.
- `E`: use the selected consumable.
- `F`: use a nearby door, pick up a nearby dropped item, or open the merchant shop when near the merchant.
- `G`: gift the selected cake to a nearby online player.
- Click or tap an enemy: select it as your weapon target.
- Drag a hotbar item to another slot to swap. Drag it outside the hotbar to drop it on the map.
- `Enter`: focus chat, then `Enter` again to send.
- `Escape`: leave chat input.

Combat is intentionally simple prototype combat. The server owns player HP, enemy HP, inventories, selected hotbar slots, dropped items, enemy movement, damage, defeats, and respawns. The browser only sends movement, inventory, pickup, and attack requests.

While typing in chat, gameplay movement and attack keys are ignored.

Class abilities, special skills, special cooldowns, and passive combat traits were replaced by shared weapons so every class has equal combat access.

Starter inventory:

- Slot 1: Rock
- Slot 2: Sword
- Slot 3: Magic Wand

Weapons:

- Sword: short-range melee arc with moderate damage.
- Magic Wand: longer-range magic projectile with medium damage.
- Rock: thrown blunt projectile with lower damage.

## Merchant and Cakes

The mysterious Odd Cart Merchant stands near the main WULAND village path around the center-left of town. Stand near the cart and press `F` to open the shop. On mobile, use the Interact button.

Currency is infinite in this prototype. The shop still shows prices as flavor, but buying does not spend money.

The merchant sells:

- Sword
- Magic Wand
- Rock
- Chocolate Cake
- Fruit Cake
- Honey Cake
- Cheese Cake
- Mystery Cake

Cakes are consumables. Select a cake with `1` through `9`, then press `E` to eat it and heal. Stand near another online player and press `G` to gift the selected cake. Cakes can also be dragged out of the hotbar to drop them on the map, then another player can pick them up with `F`.

For temporary live-world cleanup, the server also supports:

- `CLEAR_PLAYER_STORE_ON_START=true`: wipes persisted sleeping/offline players from the JSON store when the server starts.
- `ENEMY_AI_PAUSED=true`: freezes enemy wandering, chasing, and contact damage while keeping enemies visible and attackable.
- `GOD_MODE_ENABLED=true`: enables the prototype admin cleanup button.
- `GOD_MODE_CODE=secret`: optional code required before destructive God Mode actions work.

## NPCs And Chat

Ambient NPCs wander slowly around assigned maps, avoid obvious obstacles, and occasionally show speech bubbles. Current NPCs include:

- Cleaning Lady in Bathroom and Kitchen.
- Security Guard in WULAND and near the RPA CoE entrance.
- HR Specialist in BusyBeet and Din Break.
- Intern in WULAND.

The chat window is visible during gameplay and can be minimized. Chat is global in the chat window, with off-map messages labeled by map name. Speech bubbles only appear above players and NPCs in the same map. Messages are trimmed, capped at 140 characters, and rate-limited to about one message per second.

## God Mode

God Mode is a prototype/admin cleanup tool, not production security.

When enabled, click a dropped item in the current map to delete it from server state and JSON persistence. Click another player to delete their character from the map and persistent player records. God Mode cannot delete your own character.

If an online player is deleted, their client receives a deletion message, clears localStorage, and returns to character creation. Deleted offline/sleeping players are removed from the world. Deleted `playerId`s are saved in server JSON so the old localStorage identity cannot rejoin; the user must create a new character with a new `playerId`.

For a real public version, God Mode needs proper admin authentication and authorization. The current env switch and optional code are only prototype safeguards.

## Classes

Classes are now identity and flavor only. Class labels, colors, and icons remain visible, but all classes can use the same weapons and items.

- Developer
- Senior Developer
- Business Analyst
- Senior Business Analyst
- Product Owner
- Senior Product Owner
- Architect

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

Prototype player persistence is stored as JSON at `server/data/wuland-players.json`. The server creates `server/data` automatically, debounces disk writes, saves joins, current map, movement position updates, hotbar inventory, selected hotbar slot, purchased items, gifted cakes, dropped items, NPC state, deleted player IDs, pickups, discards, and disconnects, and removes expired offline players based on `OFFLINE_PLAYER_TTL_HOURS`.

Disconnected players remain visible as sleeping characters at their last saved map and position. If someone disconnects inside a building, they sleep inside that room and are only visible to players who enter the same room. If the same `playerId` returns, the sleeping character wakes up in the correct map and no duplicate is created. If the same `playerId` connects twice at the same time, the second connection is rejected with a clear error.

Dropped items are saved with their `mapId` and survive server restart if the JSON file remains available. Combat state itself is not permanent yet: player HP and enemies reset when the server restarts.

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
- `shared`: shared constants, validation helpers, movement rules, item definitions, player profile types, network state, map bounds, collision rectangles, map IDs, and portal definitions.
- `server`: Node.js, TypeScript, Express health endpoint, Colyseus room, JSON player store, and Docker deployment files.

The production build is deployed to GitHub Pages at `https://wuland.bekulov.com`. The repository includes a GitHub Actions Pages workflow and also keeps root-level built assets for the current branch-based Pages configuration.

## Phase Roadmap

Phase 1 added local character creation, profile/progress persistence, and the playable village.

Phase 2 adds multiplayer, server-authoritative movement, and offline sleeping player persistence.

Phase 3 added simple class abilities, enemies, HP, attacks, cooldowns, defeat, and respawn.

Phase 4 added mobile controls and deployment hardening.

Phase 5 replaces class abilities with shared weapons, a 9-slot inventory hotbar, item dropping, pickup, and dropped-item persistence.

Phase 6 adds the merchant shop, infinite prototype currency, purchasable weapons, multiple healing cakes, cake gifting, and persisted bought/dropped cake items.

Phase 7 adds multi-map WULAND, enterable building interiors, server-authoritative portal transitions, map-specific sleeping players, and map-specific dropped items.

Phase 8 adds ambient NPCs, global chat with same-map speech bubbles, and prototype God Mode deletion for players and dropped items.
