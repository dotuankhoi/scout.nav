/**
 * Educational metadata for every algorithm: shown in the Learn panel
 * and used for labels/colors throughout the UI.
 */

import type { AlgorithmId } from '@/types';

export interface AlgorithmMeta {
  id: AlgorithmId;
  name: string;
  shortName: string;
  tagline: string;
  category: 'grid' | 'sampling';
  /** Accent color used for chips, charts and labels. */
  color: string;
  overview: string;
  timeComplexity: string;
  spaceComplexity: string;
  complete: string;
  optimal: string;
  strengths: string[];
  weaknesses: string[];
  applications: string[];
  pseudocode: string;
}

export const ALGORITHM_META: Record<AlgorithmId, AlgorithmMeta> = {
  astar: {
    id: 'astar',
    name: 'A* Search',
    shortName: 'A*',
    tagline: 'Informed search — the workhorse of grid planning',
    category: 'grid',
    color: '#22d3ee',
    overview:
      'A* is best-first search guided by f(n) = g(n) + h(n), where g is the exact cost from the start and h is a heuristic estimate of the remaining cost to the goal. With an admissible heuristic (one that never overestimates), A* expands the fewest nodes of any algorithm guaranteed to find an optimal path. It is the default choice for grid-based robot navigation.',
    timeComplexity: 'O(E log V) — exponential in the worst case, but the heuristic prunes most of the space in practice',
    spaceComplexity: 'O(V) — stores g-values, parents, open and closed sets',
    complete: 'Yes — finds a path whenever one exists (finite grids)',
    optimal: 'Yes — with an admissible, consistent heuristic and weight = 1',
    strengths: [
      'Optimal and complete with an admissible heuristic',
      'Dramatically fewer expansions than Dijkstra on most maps',
      'Simple to implement and tune (heuristic weight trades quality for speed)',
      'Works with any edge-cost model (terrain weights, turn penalties…)',
    ],
    weaknesses: [
      'Paths are constrained to grid edges — characteristic 45°/90° staircase motion',
      'Memory grows with the explored region; large open sets on big maps',
      'Needs a well-chosen heuristic: too weak → Dijkstra, inadmissible → suboptimal paths',
      'Replanning after a map change means starting from scratch (see D* Lite)',
    ],
    applications: [
      'Indoor mobile-robot navigation on occupancy grids',
      'Warehouse AGV / AMR route planning',
      'Game AI and RTS unit movement',
      'High-level global planner in ROS nav2 (as navfn / smac planner)',
    ],
    pseudocode: `open ← {start}; g[start] ← 0
while open ≠ ∅:
    n ← node in open with lowest f = g + h
    if n = goal: return reconstruct_path(n)
    move n from open to closed
    for each neighbor m of n:
        if m ∈ closed: continue
        g' ← g[n] + cost(n, m)
        if g' < g[m]:
            g[m] ← g'
            parent[m] ← n
            f[m] ← g' + h(m)
            add/update m in open
return failure`,
  },

  dijkstra: {
    id: 'dijkstra',
    name: 'Dijkstra',
    shortName: 'Dijkstra',
    tagline: 'Uninformed uniform-cost search — explores in every direction',
    category: 'grid',
    color: '#818cf8',
    overview:
      'Dijkstra’s algorithm expands nodes strictly in order of their cost-so-far g(n), with no notion of where the goal is. The frontier grows as a uniform wavefront from the start until it touches the goal. It is exactly A* with h ≡ 0 — which makes it the perfect baseline for seeing how much work a heuristic saves.',
    timeComplexity: 'O(E log V) with a binary heap',
    spaceComplexity: 'O(V)',
    complete: 'Yes',
    optimal: 'Yes — for any non-negative edge costs',
    strengths: [
      'Optimal with zero tuning — no heuristic to design',
      'Computes shortest paths to every visited cell, not just the goal (useful for one-to-many queries)',
      'Foundation of flow fields and D*-family planners',
    ],
    weaknesses: [
      'Explores symmetrically in all directions — typically expands far more nodes than A*',
      'Slow on large maps where the goal direction is obvious',
      'Same staircase-path limitation as any grid search',
    ],
    applications: [
      'Cost-to-go fields for flow-field navigation (many robots, one goal)',
      'Network routing (OSPF/IS-IS link-state protocols)',
      'Baseline benchmark for evaluating heuristics',
      'Reachability and coverage analysis on occupancy grids',
    ],
    pseudocode: `open ← {start}; g[start] ← 0
while open ≠ ∅:
    n ← node in open with lowest g
    if n = goal: return reconstruct_path(n)
    move n from open to closed
    for each neighbor m of n:
        if m ∈ closed: continue
        g' ← g[n] + cost(n, m)
        if g' < g[m]:
            g[m] ← g'; parent[m] ← n
            add/update m in open
return failure`,
  },

  thetastar: {
    id: 'thetastar',
    name: 'Theta*',
    shortName: 'Theta*',
    tagline: 'Any-angle A* — paths that cut straight across the grid',
    category: 'grid',
    color: '#2dd4bf',
    overview:
      'Theta* runs the same search loop as A*, but when it relaxes a neighbor it also checks line-of-sight from the *grandparent*: if the current node’s parent can see the neighbor directly, the intermediate node is skipped and the neighbor connects straight to the grandparent. The result is taut, any-angle paths whose headings are not restricted to multiples of 45° — much closer to how a real robot drives.',
    timeComplexity: 'O(E log V) plus a line-of-sight check per relaxation (each O(path width))',
    spaceComplexity: 'O(V)',
    complete: 'Yes',
    optimal: 'No — near-optimal in practice; true any-angle shortest paths need e.g. visibility graphs or ANYA',
    strengths: [
      'Produces short, natural, any-angle paths directly — no post-smoothing step',
      'Same node expansion order and memory profile as A*',
      'Path length typically within 1% of the true Euclidean shortest path',
    ],
    weaknesses: [
      'Line-of-sight checks add constant-factor cost to every relaxation',
      'Not strictly optimal (the parent shortcut is greedy)',
      'Line-of-sight on a grid is conservative — clearance must be handled separately',
    ],
    applications: [
      'UAV and marine-vehicle route planning in open environments',
      'Any-angle global planning for differential-drive robots',
      'Games with free-angle character movement',
    ],
    pseudocode: `// identical to A* except relaxation:
for each neighbor m of n:
    if line_of_sight(parent[n], m):
        // Path 2: skip n entirely
        g' ← g[parent[n]] + dist(parent[n], m)
        if g' < g[m]:
            g[m] ← g'; parent[m] ← parent[n]
    else:
        // Path 1: ordinary A* relaxation
        g' ← g[n] + cost(n, m)
        if g' < g[m]:
            g[m] ← g'; parent[m] ← n`,
  },

  dstar: {
    id: 'dstar',
    name: 'D* Lite',
    shortName: 'D* Lite',
    tagline: 'Incremental replanning — repair the plan, don’t restart it',
    category: 'grid',
    color: '#f59e0b',
    overview:
      'D* Lite searches backwards from the goal and keeps two values per vertex: g (current cost-to-goal estimate) and rhs (a one-step lookahead). A vertex is consistent when g = rhs; inconsistent vertices sit in a priority queue ordered by a two-part key. When edge costs change (a new obstacle appears mid-drive), only affected vertices become inconsistent and get repaired — the robot replans in a fraction of a full search. This is the algorithm that drove NASA’s Mars rover route planners and countless field robots.',
    timeComplexity: 'Initial run ≈ A*; replanning touches only vertices whose costs changed',
    spaceComplexity: 'O(V) — g, rhs and the priority queue',
    complete: 'Yes',
    optimal: 'Yes — maintains optimal cost-to-goal values (admissible heuristic)',
    strengths: [
      'Replans orders of magnitude faster than re-running A* when the map changes',
      'Backward search means g-values stay valid as the robot moves',
      'Provably optimal, widely field-tested',
    ],
    weaknesses: [
      'Considerably trickier to implement correctly (keys, rhs, under/over-consistency)',
      'First search does the same work as A* — the payoff only comes on changes',
      'Stores two floats per vertex and a busier priority queue',
    ],
    applications: [
      'Planetary rovers (descendant of the D* used on Mars mission prototypes)',
      'Autonomous ground vehicles in unknown or partially known terrain',
      'Any robot that discovers obstacles with onboard sensors while driving',
    ],
    pseudocode: `key(s) = [min(g[s],rhs[s]) + h(start,s); min(g[s],rhs[s])]
rhs[goal] ← 0; queue ← {goal}
while top_key < key(start) or rhs[start] ≠ g[start]:
    u ← pop vertex with smallest key
    if g[u] > rhs[u]:            // over-consistent
        g[u] ← rhs[u]            // settle it
        for each predecessor p: update_vertex(p)
    else:                        // under-consistent
        g[u] ← ∞
        update_vertex(u) and all predecessors

update_vertex(u):
    if u ≠ goal: rhs[u] ← min over succ s of (c(u,s) + g[s])
    remove u from queue
    if g[u] ≠ rhs[u]: insert u with key(u)`,
  },

  rrt: {
    id: 'rrt',
    name: 'RRT',
    shortName: 'RRT',
    tagline: 'Rapidly-exploring Random Tree — throw darts, grow a tree',
    category: 'sampling',
    color: '#f472b6',
    overview:
      'RRT abandons the grid entirely. It grows a tree from the start by repeatedly sampling a random point in free space, finding the nearest tree node, and stepping toward the sample by a bounded distance — keeping the extension only if it is collision-free. The tree is biased toward large unexplored regions (Voronoi bias), so it finds *some* path very quickly, even in high-dimensional configuration spaces where grids are hopeless.',
    timeComplexity: 'O(n log n) with spatial indexing (O(n²) naive nearest-neighbor)',
    spaceComplexity: 'O(n) tree nodes',
    complete: 'Probabilistically complete — finds a path with probability → 1 as samples → ∞',
    optimal: 'No — first path found is typically far from optimal',
    strengths: [
      'Scales to high-dimensional spaces (arms, drones, cars with kinematics)',
      'No discretization: plans in continuous space with arbitrary collision checkers',
      'Very fast to a *feasible* answer; easy to add kinodynamic constraints',
    ],
    weaknesses: [
      'Paths are jagged and clearly suboptimal without post-processing',
      'Randomized: run time and path quality vary between seeds',
      'Struggles with narrow passages (low probability of sampling inside)',
      'No cost awareness at all — purely feasibility-driven',
    ],
    applications: [
      'Manipulator motion planning (6–7 DoF robot arms)',
      'Kinodynamic planning for drones and cars',
      'The default family in MoveIt / OMPL for arm planning',
    ],
    pseudocode: `tree ← {start}
for i = 1 … N:
    x_rand ← (goal with prob. p_bias) else random point
    x_near ← nearest node in tree to x_rand
    x_new  ← steer(x_near, x_rand, step)
    if segment x_near→x_new is collision-free:
        add x_new to tree with parent x_near
        if x_new within goal radius and sees goal:
            return path from root to x_new
return failure`,
  },

  rrtstar: {
    id: 'rrtstar',
    name: 'RRT*',
    shortName: 'RRT*',
    tagline: 'Asymptotically optimal RRT — the tree that keeps improving',
    category: 'sampling',
    color: '#a78bfa',
    overview:
      'RRT* adds two operations to every RRT iteration. Choose-parent: instead of wiring the new node to its nearest neighbor, it connects to whichever node in a neighborhood gives the cheapest total cost from the start. Rewire: existing neighbors that would become cheaper by routing *through* the new node are re-parented to it. These local optimizations make the tree cost converge to the optimum as samples accumulate — watch the path visibly straighten during a run.',
    timeComplexity: 'O(n log n) — a constant factor slower than RRT per iteration',
    spaceComplexity: 'O(n) tree nodes + child lists',
    complete: 'Probabilistically complete',
    optimal: 'Asymptotically optimal — path cost → optimum as iterations → ∞',
    strengths: [
      'Keeps all RRT advantages while converging toward the shortest path',
      'Anytime behavior: interrupt it whenever, take the best path so far',
      'Rewiring produces smooth, low-cost trees that are useful beyond a single query',
    ],
    weaknesses: [
      'Noticeably slower per iteration (neighborhood search + extra collision checks)',
      'Convergence to near-optimal can require many samples',
      'Same narrow-passage weakness as RRT',
    ],
    applications: [
      'Autonomous-driving maneuver planning (with kinodynamic variants)',
      'Optimal drone trajectories in cluttered environments',
      'Any offline planning where path quality matters more than latency',
    ],
    pseudocode: `tree ← {start}
for i = 1 … N:
    x_rand ← sample();  x_near ← nearest(tree, x_rand)
    x_new  ← steer(x_near, x_rand, step)
    if collision(x_near → x_new): continue
    X_near ← nodes within radius r of x_new
    // choose-parent
    parent ← argmin over X_near of  cost(x) + dist(x, x_new)  (collision-free)
    add x_new with that parent
    // rewire
    for x in X_near:
        if cost(x_new) + dist(x_new, x) < cost(x) and collision-free:
            parent[x] ← x_new   // propagate savings to descendants
return best path reaching goal region`,
  },
};

/** Convenience list in display order. */
export const ALGORITHM_LIST: AlgorithmMeta[] = [
  ALGORITHM_META.astar,
  ALGORITHM_META.dijkstra,
  ALGORITHM_META.thetastar,
  ALGORITHM_META.dstar,
  ALGORITHM_META.rrt,
  ALGORITHM_META.rrtstar,
];
