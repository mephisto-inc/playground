# Performance diagnostics

## In-game profiler arguments

Append arguments to the game URL (`?` before the first one, `&` after):

| Argument     | Values                       | Default  | Effect                                                                                      |
|--------------|------------------------------|----------|---------------------------------------------------------------------------------------------|
| `profile`    | `1`                          | off      | Enables the text overlay with live performance counters.                                    |
| `wave`       | `1`–`5`                      | —        | Starts a run directly at wave N. Requires `profile=1`.                                      |
| `class`      | `pusher`, `dasher`, `anchor` | `pusher` | Selects the player class. Requires `profile=1`.                                             |
| `invincible` | `1`                          | off      | The player takes no damage. Requires `profile=1`.                                           |
| `quality`    | `high`, `medium`, `low`      | auto     | Pins the quality tier. Without it, mobile devices start at `medium` and desktops at `high`. |

Example: `/?profile=1&wave=5&class=dasher&invincible=1&quality=medium`

## Overlay fields

The overlay (`profile=1`) updates twice per second:

- 60-second rolling average FPS and 95th-percentile frame interval;
- average and latest JavaScript update/render-submission time;
- draw calls and triangles;
- enemies alive;
- geometries, textures, and JS heap when the browser exposes it;
- quality tier, DPR cap, shadow map size (or `off`) and auto-downgrade step count;
- detected device and viewport.

## Quality tiers

Selected at startup; `?quality=` overrides the automatic choice.

|                        | high         | medium   | low     |
|------------------------|--------------|----------|---------|
| Max device pixel ratio | 2            | 1.5      | 1.25    |
| Dynamic shadows        | 4096 PCFSoft | 1024 PCF | off     |
| Blob shadows           | –            | –        | on      |
| Antialiasing           | on           | on       | off     |
| Materials              | Standard     | Standard | Lambert |

During combat, whenever the 5-second rolling average stays below 30 FPS, the
game steps down one level at a time (it never steps back up): DPR cap in 0.25
steps down to 1.0, then the shadow map 4096→2048→1024→512, then dynamic
shadows off (blob shadows replace them). The ladder stops as soon as the
average recovers to 30 FPS. The current state shows in the overlay's
`Quality:` line.

## Automated suite

`tests/perf/run-perf.mjs`, run with:

```sh
npm run perf -- --tag=baseline
```

It builds the production bundle, serves `dist` on port 4173 with
`vite preview`, drives the installed Chrome through Playwright, and reads the
`?profile=1` overlay once per second. Each session writes `runs/*.json` (run
summary), `runs/*.jsonl` (1 Hz samples) and `summary.md` under
`tests/perf/results/<timestamp>-<tag>/`; `latest.txt` points at the newest
session. Use `--url=http://localhost:5173 --build=false` to run against an
already-running server.

Flags:

- `--profiles=pc,phone` (default `pc,phone`)
- `--scenarios=menu,early,boss,endless` (default all four)
- `--classes=pusher,dasher,anchor` (default `pusher`)
- `--repeats=N` (default 3)
- `--warmup=SECONDS` / `--capture=SECONDS` (default 60 / 60)
- `--throttle=N` (default 6; phone profile CPU throttle)
- `--quality=high|medium|low` (default auto)
- `--invincible=false` (default true)
- `--url=BASE` (skips build and server), `--port=4173`, `--serve=false`,
  `--build=false`
- `--headless=true` (default opens a window), `--tag=NAME`

Profiles:

- **pc**: 1920×1080 at DPR 1, no CPU throttle.
- **phone**: Pixel 7 viewport (412×915 CSS px, DPR 2.625, touch input) with
  the CDP CPU throttle. The GPU stays the desktop GPU.

Scenarios: `menu` (idle menu), `early` (wave 1), `boss` (wave 3) and
`endless` (wave 5). Combat scenarios warm up on the menu (`early`) or in-run (`boss`, `endless`) and then capture the
configured window; the autopilot
only orbits, uses the class ability on a fixed interval and picks the first
draft card.

`tests/perf/debug.mjs` is a manual companion that takes timed screenshots:
`node tests/perf/debug.mjs headed|headless pc|phone [base-url] [class] [seconds]`.
