# WULAND

WULAND is a browser-playable 2D RPG-style village prototype for an RPA team. In Phase 1, a single local player creates a character, chooses an RPA team role as a class, enters the village, walks around, and visits buildings.

## Local Development

Install dependencies from the repository root:

```bash
npm install
```

Start the Phase 1 client:

```bash
npm run dev
```

Build the client:

```bash
npm run build
```

Run TypeScript checks across workspaces:

```bash
npm run typecheck
```

## Project Shape

- `client`: Phaser 3, TypeScript, and Vite browser game.
- `shared`: shared constants and types for player profiles, cosmetics, classes, buildings, and local progress.
- `server`: placeholder workspace for later multiplayer work.

## Phase Roadmap

Phase 1 is single-player only and stores save data in browser `localStorage`.

Phase 2 will add the multiplayer server and networking layer.

Phase 3 will add combat.

Phase 4 will add mobile controls and deployment hardening.
