# Valo Tactic

A Valorant strategy planner in the spirit of valoplant.gg. You plan on the real minimaps, using live game data from [valorant-api.com](https://valorant-api.com).

## Features

- **Real game data:** all competitive maps (minimaps, splash art, callouts placed with the API's world-to-minimap transform), every playable agent, and each agent's abilities with official icons and descriptions.
- **Board:** drag or click to place agents, abilities and markers (spike, danger, watch, kill). Draw freehand or straight lines (arrows/dashed), area circles, rectangles (B), polygon zones (G) and text. Add images with the toolbar button (I) or by pasting a screenshot; drag the corners to resize. Erase, zoom (scroll), pan (Space/H), rotate the map (R).
- **Ability shapes at map scale:** each ability can show a radius (smokes, mollies), a wall (Viper, Harbor, Sage), a cone (Spycam, turret, Rolling Thunder), an area strip (Fault Line, Fast Lane) or a line (Trapwire, Cosmic Divide), measured in meters and converted per map. Drag the handle to resize or aim. Defaults for common utility are approximate and editable.
- **Lineups** (U): save where to stand and where utility lands for each agent and map, with up to three screenshots, a video link and notes. Filter by agent and side, see them as markers on the map, and place one on the current step as an agent aimed at an ability. Export and import lineups as `.json` files.
- **Orientation & vision:** every agent has a facing direction (drag the aim handle or press `[` / `]`) and a vision cone (103° FOV, adjustable range). Cones are ray-cast against the minimap, so walls cut them off, and vision-blocking utility (smokes, walls) does too. A crosshair line runs through the middle of each cone to the first wall or smoke it hits. Boxes and half walls (the light outlines inside the floor on the minimap) also block sight, except right next to the viewer so an agent peeking over their own box still sees out. Mark an agent as **High ground** to let it see over boxes, or turn box blocking off under Display. Agents seen by an opponent get a SPOTTED badge with sight lines; two or more viewers shows CROSSFIRE ×N.
- **Floor only:** agents can only stand on the walkable floor. Dropping or dragging one onto a wall or outside the map snaps it to the nearest floor spot.
- **Steps & routes:** build a strategy in steps. "Next step" copies the current one so you can move pieces. Movement between steps follows walkable paths around walls (and around boxes where possible) instead of a straight line. Select a moved agent to choose its route: the Inspector lists the shortest path and up to two alternatives with the callouts they pass, distance and running time, and the faint alternatives on the map are clickable. Drag the white dot on the route to send the agent another way; double-click it to go back to the shortest path. Play animates every piece along its route, and the previous step shows as a ghost with route arrows.
- **Save & share:** see below. Also exports the current step as PNG.
- Undo/redo, keyboard shortcuts for every tool and action (hover any button to see its keys, press `?` for the full list), and a narrow-screen layout with slide-out panels.

## Saving and sharing

- **Autosave:** every change is written to this browser's localStorage immediately. Closing the tab, reloading or restarting the browser keeps your work. Every strategy you've touched is listed in the **Library** (`Ctrl/⌘+O`), where you can sort them into folders, tag them, and search or filter by map, side and tag. Open tabs keep their libraries in sync.
- **Share link** (`Ctrl/⌘+Shift+S`): copies a URL with the whole strategy compressed into it. Whoever opens it gets their own copy in their Library. Nothing is uploaded; the link is the data. Images are left out to keep links short, so use a file export to share a strategy with images.
- **File export/import:** in the Library, export any strategy as a `.json` file and import it on another device or browser. Use this as a backup.

Images are downscaled before they're stored, but localStorage is limited to a few megabytes per site. If it fills up you get a warning; delete old strategies, lineups or images to make room.

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
