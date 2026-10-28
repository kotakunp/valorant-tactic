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
- **Live sessions:** plan together in real time. See below.
- **Save & share:** see below. Also exports the current step as PNG.
- Undo/redo, keyboard shortcuts for every tool and action (hover any button to see its keys, press `?` for the full list), and a narrow-screen layout with slide-out panels.

## Saving and sharing

- **Autosave:** every change is written to this browser's localStorage immediately. Closing the tab, reloading or restarting the browser keeps your work. Every strategy you've touched is listed in the **Library** (`Ctrl/⌘+O`), where you can sort them into folders, tag them, and search or filter by map, side and tag. Open tabs keep their libraries in sync.
- **Share link** (`Ctrl/⌘+Shift+S`): copies a short link (`/s/…`) to a frozen copy of the strategy stored on the server, images included. Whoever opens it gets their own copy in their Library. Later edits don't change a link you already sent, so share again after changing the plan. If the server can't be reached, you get a long link with the whole strategy compressed into it instead (without images). Both kinds keep working.
- **File export/import:** in the Library, export any strategy as a `.json` file and import it on another device or browser. Use this as a backup.

Images are downscaled before they're stored, but localStorage is limited to a few megabytes per site. If it fills up you get a warning; delete old strategies, lineups or images to make room.

Saved data lives only in the browser profile that created it. Clearing site data, or using a private window, removes it. Use a share link or file to move strategies between devices.

## Live sessions

Press **Live** in the top bar and start a session. Copy the **edit link** for teammates who should change the plan, or the **view-only link** for people who should only watch.

- Every change syncs as you make it. Two people can move different pieces at the same time; if both move the same piece, the last move wins.
- You see everyone's cursor with their name, what they have selected, and pieces they are dragging, on the step you are looking at. Set your name and cursor color in the Live dialog. Avatars in the top bar show who is here.
- **Undo** only takes back your own changes.
- **Offline:** edits made without a connection are kept in the browser (IndexedDB), survive a reload, and sync when the connection is back. The top bar shows *Synced*, *Syncing* or *Offline*.
- Images added during a session are uploaded to the server instead of being stored in the plan. Images already on the board are uploaded when you start the session.
- **Leave** closes the session. The strategy stays in your Library with a *Live* badge; open it there to rejoin. **Personal copy** saves the current state as your own strategy that no longer syncs.
- Share links and exported files never include session links.

Links are signed with a server secret, so anyone who has a link keeps that access while the room exists. There are no accounts or revocation: to cut someone off, make a personal copy and start a new session.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:server   # live-session server on :3001 (Vite proxies /api, /media and /collab to it)
npm run build        # type-check, production build into dist/, precompressed .br/.gz assets
npm start            # production server on $PORT (default 3000)
```

Stack: Vite, React 19, TypeScript, Konva (react-konva), Zustand, lz-string, Yjs with Hocuspocus for live sessions.

`server/index.mjs` is a single Node process. It serves `dist/` (SPA fallback, immutable caching for hashed assets), the Hocuspocus WebSocket at `/collab`, `POST /api/rooms` (new room and its edit/view tokens), image uploads (`POST /api/rooms/:room/media`, editors only, WebP/JPEG/PNG up to 3 MB), share links (`POST /api/shares` stores a strategy and moves its embedded images to `/media`; `GET /api/shares/:id` reads it back) and `/media/*`. Rooms are saved as Yjs updates in `data/rooms/`, shared strategies as JSON in `data/shares/` (named by a hash of their content), images in `data/media/`. Set `DATA_DIR` to move that folder, and `COLLAB_SECRET` to choose the link-signing secret (otherwise one is generated in `data/secret`; losing it invalidates every link).

## Deploy (Dokploy + Nixpacks)

`nixpacks.toml` holds the build plan: Node 22, `npm ci --include=dev`, `npm run build`, then `npm start` runs `server/index.mjs`.

1. In Dokploy, create an **Application** and connect this repository.
2. Set **Build Type** to **Nixpacks**.
3. Under **Advanced → Volumes**, add a volume mounted at **`/app/data`**. Without it, live sessions, share links, uploaded images and the link secret are lost on every redeploy.
4. Under **Domains**, add your domain with container port **3000**. To use another port, set a `PORT` environment variable and use the same number for the domain. Traefik passes WebSockets through without extra settings.
5. Deploy.

To try the production server locally: `npm run build && npm start` (http://localhost:3000).

## Credits

- Game data and most images: [valorant-api.com](https://valorant-api.com).
- Corrode's Patch 13.08 minimap (`public/maps/corrode-13.08.webp`): from [ValoMapper](https://github.com/Shafin-A/ValoMapper) by Shafin Ahmed (MIT), rotated into valorant-api.com's frame. valorant-api.com still serves the pre-13.08 layout; remove the override in `src/api/valorant.ts` once it updates.
- VALORANT and its assets are trademarks of Riot Games. This project isn't endorsed by Riot Games.
