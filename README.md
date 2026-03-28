# Go Move Cloud

PixiJS-based Go visualizer with:

- WebGL-rendered board
- WebGL-rendered organic move cloud
- Hover-to-preview node behavior
- Single-click commit for continuing play from any visible node
- Adjustable best-move generation count
- Optional local AI analysis endpoint

## KataGo Bridge (Start Here)

The app already supports custom analysis endpoints. A local KataGo bridge is included:

- `katago-bridge.js`
- `POST /analyze` (compatible with current frontend payload)
- `GET /health`

Installed locally in this project:

- `tools/katago/engine/` (OpenCL build)
- `tools/katago/engine-eigen/` (CPU build, default)
- Model: `kata1.bin.gz` in both folders

### 1) Prepare KataGo

Download:

- KataGo binary (`katago`)
- KataGo model file (`.bin.gz`)
- KataGo config file for analysis mode

### 2) Run bridge

If you used the included install in `tools/katago`, just run:

```powershell
node .\katago-bridge.js
```

or:

```powershell
.\start-katago-bridge.ps1
```

Optional (override paths/settings):

```powershell
$env:KATAGO_BIN="C:\path\to\katago.exe"
$env:KATAGO_MODEL="C:\path\to\model.bin.gz"
$env:KATAGO_CONFIG="C:\path\to\analysis.cfg"
$env:PORT="8080"
node .\katago-bridge.js
```

Optional env vars:

- `KATAGO_RULES` (default `Chinese`)
- `KATAGO_KOMI` (default `7.5`)
- `KATAGO_VISITS` (default `20`, recommended on CPU)
- `KATAGO_MAX_TIME` (default `2.5` seconds)
- `KATAGO_PV_LEN` (default `24`)

### 3) Connect frontend

In the app, set **Engine Endpoint** to:

`http://localhost:8080/analyze`

The app now auto-fills this endpoint on startup if the field is empty.

Then use **Suggest** as usual.


