/**
 * Minimal dependency-free confetti burst, rendered on its own overlay
 * canvas. Fired when a planner connects to the goal.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  life: number;
}

const COLORS = ['#22d3ee', '#818cf8', '#f472b6', '#facc15', '#4ade80', '#fb923c'];

/**
 * Fire a confetti burst centered at (x, y) in canvas pixel coordinates.
 * Manages its own animation loop; safe to call repeatedly.
 */
export function fireConfetti(canvas: HTMLCanvasElement, x: number, y: number, count = 120): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 9;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.35,
      size: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    });
  }

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      alive++;
      p.vy += 18 * dt; // gravity
      p.vx *= 0.985;
      p.x += p.vx * 60 * dt * 0.4;
      p.y += p.vy * 60 * dt * 0.4;
      p.rot += p.vrot;
      p.life -= dt * 0.55;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (alive > 0) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  requestAnimationFrame(tick);
}
