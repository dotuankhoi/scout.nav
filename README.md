# scout.nav

scout.nav is an interactive robotics sandbox for learning how navigation algorithms work in realistic situations.

Choose a mission, run a planner, watch it make decisions step by step, and compare the results with another algorithm. It is built for students, robotics clubs, and anyone who learns better by seeing an algorithm in action.

## What you can do

- Run A*, Dijkstra, Theta*, D* Lite, RRT, and RRT*
- Watch the search with play, pause, scrub, and step controls
- Use the Algorithm Inspector to see why a planner made each decision
- Try Warehouse Robot, Mars Rover, Search and Rescue, Hospital Delivery, City Flood Response, Maze Escape, or Open Sandbox
- Draw obstacles, move the robot and goal, make random maps, and generate mazes
- Use weighted terrain such as rough ground, sand, and hazards
- Compare two algorithms on the same map
- Review results in the Coach and Stats panels
- Run benchmark tests across generated maps and get a recommendation
- Save maps as JSON and export the current view as PNG

## Quick start

You will need Node.js 20 or newer.

```bash
git clone https://github.com/dotuankhoi/scout.nav.git
cd scout.nav
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

To make a production build:

```bash
npm run build
```

## A good first experiment

1. Open the app and choose Warehouse Robot.
2. Run A*.
3. Turn on compare mode.
4. Try A* against D* Lite or RRT*.
5. Open the Coach and Stats panels to compare the results.

For a terrain-focused example, try Mars Rover. Sand, rough ground, and hazards cost more energy, so the shortest-looking route is not always the cheapest route.

## Included algorithms

### A*

A good default for static grid maps. It is fast and finds an optimal path when the heuristic is admissible.

### Dijkstra

Explores based only on cost. It is useful for learning and for building complete cost-to-go fields, but usually expands more nodes than A*.

### Theta*

Builds smoother, any-angle routes when there is clear line of sight between nodes.

### D* Lite

Designed for maps that change. It can repair a plan instead of always starting from scratch.

### RRT

Grows a random tree through the map and can find a feasible route quickly. Its paths are not guaranteed to be optimal.

### RRT*

Improves its random tree over time to find better routes.

## How it works

The planners run in a Web Worker so the interface stays responsive. Each planner produces a trace of its actions, including opened nodes, closed nodes, rejected samples, tree rewires, and the final path.

The canvas, playback controls, Inspector, Coach, heatmaps, and statistics all use that same trace.

```text
Scenario or map
  -> path planner in a Web Worker
  -> trace events
  -> canvas, playback, Inspector, Coach, and statistics
```

## Tech stack

- React 19 and TypeScript
- Vite
- Tailwind CSS
- Zustand
- HTML Canvas
- Framer Motion
- Recharts
- Web Workers

## Project structure

```text
src/
  algorithms/   planner implementations and metadata
  canvas/       camera, replay state, and rendering
  components/   canvas, panels, and UI primitives
  hooks/        playback and keyboard controls
  store/        Zustand application state
  themes/       classic and minimal UI themes
  types/        shared domain types
  utils/        scenarios, benchmarks, map IO, and helpers
  workers/      planner worker and typed client
```

## Roadmap

- Dynamic obstacles during playback
- Battery budgets and charging behavior
- Multi-robot warehouse coordination
- PRM, Hybrid A*, DWA, Jump Point Search, and potential fields
- Drone coverage planning
- SLAM and fog-of-war exploration
- Build-your-own-planner mode
- CSV benchmark exports

## Contributing

Contributions are welcome. Feedback is especially appreciated, as I am still learning and improving this project.

## License

MIT
