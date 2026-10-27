# Valo Tactic

A Valorant strategy planner in the spirit of valoplant.gg. You plan on the real minimaps, using live game data from [valorant-api.com](https://valorant-api.com).

## Features

- **Real game data:** all competitive maps (minimaps, splash art, callouts placed with the API's world-to-minimap transform), every playable agent, and each agent's abilities with official icons and descriptions.
- **Board:** drag or click to place agents, abilities and markers (spike, danger, watch, kill). Draw freehand or straight lines (arrows/dashed), area circles and text. Erase, zoom (scroll), pan (Space/H), rotate the map (R).
- **Ability ranges at map scale:** smokes, walls and similar abilities render a radius or wall in meters, converted per map. Drag the handle to resize or aim. Defaults for common utility are approximate and editable.
- **Orientation & vision:** every agent has a facing direction (drag the aim handle or press `[` / `]`) and a vision cone (103° FOV, adjustable range). Cones are ray-cast against the minimap, so walls cut them off, and vision-blocking utility (smokes, walls) does too. A crosshair line runs through the middle of each cone to the first wall or smoke it hits. Agents seen by an opponent get a SPOTTED badge with sight lines; two or more viewers shows CROSSFIRE ×N. Height differences and boxes aren't modeled.
- **Steps:** build a strategy in steps. "Next step" copies the current one so you can move pieces. Play animates every piece from step to step, and the previous step shows as a ghost with movement arrows.
- **Save & share:** see below. Also exports the current step as PNG.
- Undo/redo, keyboard shortcuts for every tool and action (hover any button to see its keys, press `?` for the full list), and a narrow-screen layout with slide-out panels.

## Saving and sharing

- **Autosave:** every change is written to this browser's localStorage immediately. Closing the tab, reloading or restarting the browser keeps your work. Every strategy you've touched is listed in the **Library** (`Ctrl/⌘+O`). Open tabs keep their libraries in sync.
- **Share link** (`Ctrl/⌘+Shift+S`): copies a URL with the whole strategy compressed into it. Whoever opens it gets their own copy in their Library. Nothing is uploaded; the link is the data.
- **File export/import:** in the Library, export any strategy as a `.json` file and import it on another device or browser. Use this as a backup.

Saved data lives only in the browser profile that created it. Clearing site data, or using a private window, removes it. Use a share link or file to move strategies between devices.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

Stack: Vite, React 19, TypeScript, Konva (react-konva), Zustand, lz-string.

## Deploy (Dokploy + Nixpacks)

`nixpacks.toml` holds the build plan: Node 22, `npm ci --include=dev`, `npm run build`, then `npm start` serves `dist/` with [serve](https://github.com/vercel/serve) (SPA fallback, long-lived caching for hashed assets, `no-cache` for `index.html`, set in `public/serve.json`).

1. In Dokploy, create an **Application** and connect this repository.
2. Set **Build Type** to **Nixpacks**.
3. Under **Domains**, add your domain with container port **3000**. To use another port, set a `PORT` environment variable and use the same number for the domain.
4. Deploy.

To try the production server locally: `npm run build && npm start` (http://localhost:3000).

## Credits

- Game data and most images: [valorant-api.com](https://valorant-api.com).
- Corrode's Patch 13.08 minimap (`public/maps/corrode-13.08.webp`): from [ValoMapper](https://github.com/Shafin-A/ValoMapper) by Shafin Ahmed (MIT), rotated into valorant-api.com's frame. valorant-api.com still serves the pre-13.08 layout; remove the override in `src/api/valorant.ts` once it updates.
- VALORANT and its assets are trademarks of Riot Games. This project isn't endorsed by Riot Games.
