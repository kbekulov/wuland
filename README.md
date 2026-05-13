# WULAND

WULAND is a browser-playable 2D RPG-style village prototype for an RPA team. Phase 11 keeps multiplayer movement, sleeping players, multi-map interiors, enemies, server-authoritative combat, shared weapons, inventory, merchant shopping, cakes, dropped items, NPCs, persistent chat, Application Engineer, Data Analyst, and God Mode, then polishes item icons, NPC visuals, speech bubbles, and doorway labels.

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

- Phone-first controls:
  - Tap the map to move toward a location.
  - Use the on-screen joystick for precise movement around doors, buildings, and combat.
  - Tap a hotbar slot to select a weapon or cake.
  - In portrait, chat sits at the top, the 9-slot hotbar becomes a vertical right-side rail, movement stays bottom-left, and actions stay bottom-right.
  - In landscape, the hotbar sits at the top center, the player HP chip stays top-left, and the menu button stays top-right.
  - Tap an enemy, NPC, or player to select a target, then press the large primary button.
  - The large primary button changes context: Attack, Shop, Door, Pick, Eat, or Use.
  - `Act` opens the secondary action wheel for Use, Open, Gift, Chat, and Help.
  - The settings button opens the full status/help screen; the compact status card is hidden during portrait play.
- `WASD` or arrow keys: move.
- Mouse click or touchscreen tap: move toward a target.
- Mobile joystick: direct movement.
- Walk into a marked doorway or press `F` near it to enter a building.
- Press `F` near an interior exit door to return to WULAND.

Keyboard or joystick movement interrupts click/tap movement. The server remains authoritative for movement, map transitions, collision, and final position.

The HUD is now phone-centric: portrait play follows the attached sketch with a top chat panel, vertical right hotbar, bottom-left joystick, and bottom-right action cluster. Landscape play follows a 2D RPG layout with top hotbar plus bottom-corner movement/action zones.

## Multi-Map WULAND

The overworld is the main WULAND village. The five buildings now have separate interior maps:

- RPA CoE: automation office with desks, terminals, and bot/server stations.
- Bathroom: tiled room with sinks, stalls, and mirrors.
- Kitchen: counters, fridge, stove, coffee area, and tables.
- BusyBeet: busy workspace with desks, notice board, and productivity props.
- Din Break: relaxed break room with couches, vending machine, and coffee table.

The Cave is a separate dark location reached through the cave mouth at the top of the overworld. It now has multiple connected dungeon levels: The Cave, Lower Tunnels, and Deep Hollow. Each level is a long, winding set of strange tunnels and dead-end passages rather than a single room. Inside, visibility is deliberately tiny with a heavy dark vignette until the player buys a Flashlight from the Odd Merchant and selects that Flashlight in the hotbar. Selecting the Flashlight keeps a spooky vignette and shows a soft gradient beam in the player's facing direction, while the area behind the player is treated as real darkness. Selecting a weapon, cake, or any other item puts the cave back into low-visibility mode so the game teaches that the active hotbar item matters.

Ambient NPCs, cats, and dogs do not enter any cave level. The cave uses cave-only Zombies instead; they are human-shaped enemy sprites, wander through the dungeon when not chasing players, and actively pursue players in the same cave level. Each zombie bite deals 20% of the player's max HP; a player defeated by zombies respawns safely back in WULAND near the Odd Merchant. Zombies always respawn back at their cave spawn points.

Each overworld building has a doorway marker and hovering arrow. Each interior has an exit door with its own marker. Entering an interior marks that building as visited in localStorage progress.

Players, sleeping players, enemies, dropped items, and prompts are filtered by map. You only see online or sleeping players who are in the same map as you. Dropped items stay in the map where they were dropped, so a cake dropped in Kitchen remains in Kitchen until someone in Kitchen picks it up.

## Combat Controls

- Phone/touch:
  - Tap a target, then tap the large primary button.
  - The primary button performs the most relevant action: Attack, Door, Shop, Pick, Eat, or Use.
  - The primary Attack, Act, and Settings controls use soft white Lucide icons instead of text labels.
  - Interact uses a hand-style icon, while Act uses a sparkles menu icon.
  - Tap `Act` for the radial secondary menu, then choose Use, Open, Gift, Pet, Chat, or Help.
  - Tap the settings icon for full status, connection information, and controls help.
- `1` through `9`: select a hotbar slot.
- `Space`: attack with the selected weapon.
- `E`: use the selected consumable.
- `F`: use a nearby door, pet a nearby cat or dog, pick up a nearby dropped item, or open the merchant shop when near the merchant.
- `G`: gift the selected cake to a nearby online player.
- Click or tap an enemy, NPC, or another player: select it as your weapon target.
- Drag a hotbar item to another slot to swap. Drag it outside the hotbar to drop one item from that slot onto the map.
- `Enter`: focus chat, then `Enter` again to send. After sending, the chat input loses focus and character controls resume.
- `Escape`: leave chat input without sending.

Combat is intentionally simple prototype combat. The server owns player HP, NPC HP, enemy HP, inventories, selected hotbar slots, dropped items, enemy movement, damage, defeats, and respawns. The browser only sends movement, inventory, pickup, and attack requests.

Weapon attacks can hit enemies, ambient NPCs, and other players in the same map. Sleeping offline players can be attacked too. The merchant is not attackable and remains fixed in the WULAND village. Defeated NPCs and players respawn with full HP at a random walkable place in their current map.

While typing in chat, gameplay movement, attack keys, and inventory hotkeys are ignored. Chat only captures keyboard input while its text input is focused.

Class abilities, special skills, special cooldowns, and passive combat traits were replaced by shared weapons so every class has equal combat access.

Starter inventory:

- Slot 1: Rock
- Slot 2: Sword
- Slot 3: Magic Wand

Weapons:

- Sword: short-range melee arc with moderate damage.
- Magic Wand: longer-range magic projectile with medium damage.
- Rock: thrown blunt projectile with lower damage.

Exploration items:

- Flashlight: sold by the Odd Merchant. Select it in The Cave to light the area; it only works while it is the selected hotbar item.

Item icons appear in the hotbar, merchant shop, dropped world items, and near a player when they select an item. Current item icons and pet sprites use CC0 assets from Kenney and OpenGameArt. Touch control icons use soft Lucide line icons. Credits live in `CREDITS.md` and `client/public/assets/CREDITS.md`.

## Merchant and Cakes

The mysterious Odd Merchant stands near the main WULAND village path around the center-left of town. Stand near the merchant and press `F` to open the shop. On mobile, use the Interact button.

Every new or returning character receives 999,999 WULAND coins for prototype testing. Money is stored on the server, persisted with the player record, and only the server can subtract it or add purchased items.

The merchant sells:

- Rock: 1,000 coins
- Sword: 3,000 coins
- Magic Wand: 4,500 coins
- Chocolate Cake: 1,500 coins
- Fruit Cake: 1,200 coins
- Honey Cake: 2,000 coins
- Cheese Cake: 1,800 coins
- Mystery Cake: 2,500 coins
- Flashlight: 3,500 coins

Buying is server-authoritative: click `Buy`, the server validates the item, money, and inventory space, subtracts the price, and adds the item to the authoritative hotbar. The shop now shows direct purchase feedback from the server, such as `Bought Sword`, `Inventory full`, or `Shop is too far away`. If the inventory is full, the purchase is blocked.

Cakes are consumables. Select a cake with `1` through `9`, then press `E` to eat it and heal. Stand near another online player and press `G` to gift the selected cake. Cakes can also be dragged out of the hotbar to drop them on the map, then another player can pick them up with `F`. If a slot contains a stack, dropping discards only one item at a time.

For temporary live-world cleanup, the server also supports:

- `CLEAR_PLAYER_STORE_ON_START=true`: wipes persisted sleeping/offline players from the JSON store when the server starts.
- `ENEMY_AI_PAUSED=true`: freezes normal enemy wandering, chasing, and contact damage while keeping enemies visible and attackable. Cave Zombies ignore this flag so the dungeon remains dangerous.
- `GOD_MODE_ENABLED=true`: enables the prototype admin cleanup button.
- `GOD_MODE_CODE=secret`: optional code required before destructive God Mode actions work.

## NPCs And Chat

Ambient NPCs are rendered as simple human-shaped characters with distinct outfits and small job props. They wander slowly, avoid obvious obstacles, and now randomly explore the overworld and building interiors instead of orbiting one tiny area forever. They occasionally show speech bubbles. Current NPCs include:

- Cleaning Lady in Bathroom and Kitchen.
- Security Guard in WULAND and near the RPA CoE entrance.
- HR Specialist in BusyBeet and Din Break.
- Intern in WULAND.

WULAND also has ambient cats and dogs. They wander, run between rooms, nap, meow, purr, bark, and react to players. Stand near a cat or dog and use `F` on desktop or `Act > Pet` on touch devices. Pet reactions include happy purrs/wags, running away, licking, or a tiny bite.

The chat window is visible during gameplay and can be minimized. Chat is global in the chat window, with off-map messages labeled by map name. Speech bubbles only appear above players, NPCs, and the merchant in the same map. They stay anchored to the speaker while the speaker moves, then fade out. Messages are trimmed, capped at 140 characters, and rate-limited to about one message per second.

The server keeps and persists the latest 100 chat messages in JSON storage. Returning players receive recent chat history when they join, and chat history survives server restart if `server/data/wuland-players.json` remains available. The client safely renders chat text as text, not HTML.

The local player sidebar is compact by default on desktop and expands while hovered, keeping Help, God Mode, Edit, player name, class, location, and HP visible in the minimized state.

## Doorways

Each overworld building keeps one permanent building title and one animated doorway arrow. Permanent `Enter [Building]` arrow labels were removed; the contextual `Press F to enter...` or `Press F to exit to WULAND` prompt appears in the HUD only when the player is near a doorway.

## God Mode

God Mode is a prototype/admin cleanup tool, not production security.

When enabled, click a dropped item in the current map to delete it from server state and JSON persistence. Click another player to delete their character from the map and persistent player records. God Mode also shows a Clear Chat button that removes persisted chat history for everyone. God Mode cannot delete your own character.

If an online player is deleted, their client receives a deletion message, clears localStorage, and returns to character creation. Deleted offline/sleeping players are removed from the world. Deleted `playerId`s are saved in server JSON so the old localStorage identity cannot rejoin; the user must create a new character with a new `playerId`.

For a real public version, God Mode needs proper admin authentication and authorization. The current env switch and optional code are only prototype safeguards.

## Classes

Classes are now identity and flavor only. In-world class labels use readable titles such as `Sr Developer` or `App Engineer`, while all classes can use the same weapons and items.

- Developer
- Senior Developer
- Business Analyst
- Senior Business Analyst
- Product Owner
- Senior Product Owner
- Architect
- Application Engineer
- Controller
- Data Analyst

Application Engineers are application delivery specialists. They build, configure, integrate, and support the applications that keep teams moving. Like every other class, they use the shared weapon and inventory system.

Data Analysts are insight / metrics specialists. They analyze data, find patterns, and turn raw numbers into useful decisions. Like every other class, they use the shared weapon and inventory system.

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

Phase 6 added the merchant shop, purchasable weapons, multiple healing cakes, cake gifting, and persisted bought/dropped cake items. Phase 10 replaces the old free prototype buying flow with server-authoritative test money.

Phase 7 adds multi-map WULAND, enterable building interiors, server-authoritative portal transitions, map-specific sleeping players, and map-specific dropped items.

Phase 8 adds ambient NPCs, global chat with same-map speech bubbles, and prototype God Mode deletion for players and dropped items.

Phase 9 adds persistent server chat history, the Data Analyst class, and safer JSON persistence migrations that skip or repair malformed records instead of discarding the whole store.

Phase 10 fixes merchant buying, adds persisted prototype money, item prices, purchase logs, and stricter inventory repair for bought, dropped, picked-up, and reconnected items.

Phase 11 adds CC0 item icons, icon-based hotbar/shop/drop visuals, simple held-item sprites, human-shaped NPCs, anchored speech bubbles, and cleaner doorway labels.

The current gameplay patch lets NPCs explore all maps, allows attacks against NPCs and other players including sleeping players, respawns defeated NPCs/players at random walkable map locations, and drops only one item from stacked inventory slots.

The current mobile polish patch makes WULAND phone-first by using a gacha-style draggable joystick, portrait chat-at-top/right-hotbar layout, compact circular icon action buttons, a settings/status screen, cached hotbar icons to prevent mobile flicker, a reference-style landscape layout, and a centered ACT radial menu.
