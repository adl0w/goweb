# Go Move Cloud

PixiJS-based Go visualizer with:

- WebGL-rendered board
- WebGL-rendered organic move cloud
- Hover-to-preview node behavior
- Single-click commit for continuing play from any visible node
- Adjustable best-move generation count
- Optional local AI analysis endpoint

## Run It

Serve the folder from `C:\Users\mraid\Desktop\goweb` with a static server:

```powershell
cd C:\Users\mraid\Desktop\goweb
npx serve .
```

Then open the local URL it prints.

The front end imports PixiJS from a CDN, so serving over `http://localhost` is recommended instead of opening the file directly.

## Analysis Endpoint Contract

Leave the endpoint blank to use the built-in demo analyzer, or point it to a local HTTP bridge such as `http://127.0.0.1:8080/analyze`.

Request body:

```json
{
  "size": 19,
  "nextPlayer": "B",
  "moveNumber": 34,
  "stones": [
    { "color": "B", "x": 3, "y": 3, "sgf": "dd" },
    { "color": "W", "x": 15, "y": 15, "sgf": "pp" }
  ],
  "topN": 10
}
```

Response body:

```json
{
  "source": "KataGo",
  "moves": [
    { "rank": 1, "move": "D16", "scoreLead": 3.8 },
    { "rank": 2, "move": { "x": 15, "y": 3 }, "scoreLead": 3.2 }
  ]
}
```

Accepted move formats:

- `"D16"`
- `"pass"`
- `{ "x": 3, "y": 3 }`
- `{ "pass": true }`
