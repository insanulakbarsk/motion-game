import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Game.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number }

interface Particle {
  id: number; x: number; y: number;
  vx: number; vy: number;
  life: number; color: string; size: number;
  type: 'spark' | 'ring' | 'star' | 'shockwave';
}

interface Trail { x: number; y: number; age: number }

interface Monster {
  id: number; x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  radius: number;
  type: 'grunt' | 'brute' | 'speeder' | 'boss';
  angle: number;
  hitFlash: number;
  spawnAge: number;
  deathAge: number;
  color: string;
}

interface FloatingText {
  id: number; x: number; y: number;
  text: string; color: string;
  age: number; vy: number;
}

interface GameData {
  score: number;
  highScore: number;
  wave: number;
  lives: number;
  combo: number;
  comboTimer: number;
  monsters: Monster[];
  particles: Particle[];
  trails: { left: Trail[]; right: Trail[]; head: Trail[] };
  floatingTexts: FloatingText[];
  waveTimer: number;
  waveActive: boolean;
}

type Screen = 'loading' | 'title' | 'playing' | 'gameover';

// ─── Constants ────────────────────────────────────────────────────────────────
let uid = 0;

const MONSTER_COLORS: Record<Monster['type'], string> = {
  grunt:   '#ff006e',
  brute:   '#bf00ff',
  speeder: '#39ff14',
  boss:    '#ff8c00',
};

const KILL_MSGS = ['NICE!', 'BOOM!', 'SMASH!', 'SLAYED!', 'CRUSHED!', 'PERFECT!'];

// ─── Particle helpers ─────────────────────────────────────────────────────────
function burst(x: number, y: number, n: number, spd: number, color: string): Particle[] {
  return Array.from({ length: n }, (): Particle => {
    const a = Math.random() * Math.PI * 2;
    const s = (Math.random() * 2 + 0.5) * spd;
    const r = Math.random();
    return {
      id: uid++, x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, color, size: Math.random() * 6 + 2,
      type: r > 0.6 ? 'star' : r > 0.35 ? 'ring' : 'spark',
    };
  });
}

function mkShockwave(x: number, y: number, color: string): Particle {
  return { id: uid++, x, y, vx: 0, vy: 0, life: 1, color, size: 10, type: 'shockwave' };
}

// ─── Monster factory ──────────────────────────────────────────────────────────
function mkMonster(W: number, H: number, wave: number): Monster {
  const roll = Math.random();
  let type: Monster['type'] = 'grunt';
  if (wave >= 5 && roll > 0.82) type = 'brute';
  else if (wave >= 3 && roll > 0.68) type = 'speeder';

  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = Math.random() * W; y = -70; }
  else if (edge === 1) { x = W + 70; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = H + 70; }
  else { x = -70; y = Math.random() * H; }

  const cx = W / 2, cy = H / 2;
  const dx = cx - x, dy = cy - y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const spd = type === 'speeder' ? 2.0 + wave * 0.12
            : type === 'brute'   ? 0.85 + wave * 0.06
            : 1.3 + wave * 0.09;

  return {
    id: uid++, x, y,
    vx: (dx / dist) * spd + (Math.random() - 0.5) * 0.4,
    vy: (dy / dist) * spd + (Math.random() - 0.5) * 0.4,
    hp: type === 'brute' ? 4 : type === 'speeder' ? 1 : 2,
    maxHp: type === 'brute' ? 4 : type === 'speeder' ? 1 : 2,
    radius: type === 'brute' ? 44 : type === 'speeder' ? 22 : 30,
    type, angle: Math.random() * Math.PI * 2,
    hitFlash: 0, spawnAge: 0, deathAge: -1,
    color: MONSTER_COLORS[type],
  };
}

function mkBoss(W: number, H: number, wave: number): Monster {
  return {
    id: uid++, x: W / 2, y: -120,
    vx: 0, vy: 1.0,
    hp: 10 + wave * 3, maxHp: 10 + wave * 3,
    radius: 72, type: 'boss', angle: 0,
    hitFlash: 0, spawnAge: 0, deathAge: -1,
    color: '#ff8c00',
  };
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function drawMonster(ctx: CanvasRenderingContext2D, m: Monster) {
  const alive = m.deathAge < 0;
  const alpha = alive
    ? Math.min(1, m.spawnAge / 20)
    : Math.max(0, 1 - m.deathAge / 16);
  if (alpha <= 0) return;

  const flash = m.hitFlash > 0;
  const col = flash ? '#ffffff' : m.color;
  const r = m.radius;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(m.x, m.y);
  ctx.rotate(m.angle);
  ctx.shadowColor = col;
  ctx.shadowBlur = flash ? 45 : 22;

  if (m.type === 'grunt') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, r * 0.65);
    ctx.lineTo(r * 0.25, r * 0.35);
    ctx.lineTo(0, r * 0.75);
    ctx.lineTo(-r * 0.25, r * 0.35);
    ctx.lineTo(-r * 0.85, r * 0.65);
    ctx.closePath(); ctx.fill();
    // Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.08, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.08, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffff00'; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.08, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.08, 2.5, 0, Math.PI * 2); ctx.fill();

  } else if (m.type === 'speeder') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.45, 0);
    ctx.lineTo(0, r);  ctx.lineTo(-r * 0.45, 0);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, r * 0.18 * i); ctx.lineTo(-r * 0.3 - i * 10, r * 0.18 * i);
      ctx.moveTo(r * 0.3, r * 0.18 * i);  ctx.lineTo(r * 0.3 + i * 10, r * 0.18 * i);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffff00'; ctx.shadowColor = '#ff0'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, -r * 0.2, 4, 0, Math.PI * 2); ctx.fill();

  } else if (m.type === 'brute') {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      i === 0 ? ctx.moveTo(r * Math.cos(a), r * Math.sin(a))
              : ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.18); ctx.lineTo(r * 0.45, -r * 0.18);
    ctx.moveTo(-r * 0.45, r * 0.18);  ctx.lineTo(r * 0.45, r * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#f00'; ctx.shadowColor = '#f00'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.06, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.06, 7, 0, Math.PI * 2); ctx.fill();

  } else if (m.type === 'boss') {
    // Body
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.88, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.55, 0, Math.PI); ctx.fill();
    // Eye sockets
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.12, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.12, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f00'; ctx.shadowColor = '#f00'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.12, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.12, 6, 0, Math.PI * 2); ctx.fill();
    // Restore for spikes
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle * 0.35);
    ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 3;
    ctx.shadowColor = '#ff8c00'; ctx.shadowBlur = 14;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      ctx.lineTo(Math.cos(a) * (r + 24), Math.sin(a) * (r + 24));
      ctx.stroke();
    }
    // HP bar
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    const bW = r * 2.4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(m.x - bW / 2, m.y - r - 26, bW, 9);
    const hpPct = m.hp / m.maxHp;
    ctx.fillStyle = hpPct > 0.5 ? '#ff8c00' : '#ff006e';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillRect(m.x - bW / 2, m.y - r - 26, bW * hpPct, 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
    ctx.strokeRect(m.x - bW / 2, m.y - r - 26, bW, 9);
  }

  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: Trail[], color: string) {
  for (let i = 1; i < trail.length; i++) {
    const a = Math.max(0, 1 - trail[i].age / 20) * 0.65;
    if (a <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = (1 - trail[i].age / 20) * 5;
    ctx.globalAlpha = a;
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const a = Math.max(0, p.life);
    ctx.save(); ctx.globalAlpha = a;
    ctx.shadowColor = p.color; ctx.shadowBlur = 12;
    if (p.type === 'spark') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'ring') {
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === 'star') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = p.x + p.size * 1.8 * Math.cos(ang);
        const py = p.y + p.size * 1.8 * Math.sin(ang);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    } else if (p.type === 'shockwave') {
      const sw = (1 - p.life) * 130;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3 * p.life;
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(p.x, p.y, sw, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHandMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, t: number) {
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.007);
  const r = 22;
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.0013);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = 0.7 * pulse;
    ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45 * pulse;
  ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.stroke(); ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.globalAlpha = 0.9; ctx.shadowColor = color; ctx.shadowBlur = 28; ctx.fill(); ctx.restore();
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  const g = 15, e = r + 10;
  ctx.beginPath();
  ctx.moveTo(x - e, y); ctx.lineTo(x - g, y);
  ctx.moveTo(x + g, y); ctx.lineTo(x + e, y);
  ctx.moveTo(x, y - e); ctx.lineTo(x, y - g);
  ctx.moveTo(x, y + g); ctx.lineTo(x, y + e);
  ctx.stroke(); ctx.restore();
  ctx.save();
  ctx.fillStyle = color; ctx.font = "bold 9px 'Share Tech Mono'";
  ctx.textAlign = 'center'; ctx.globalAlpha = 0.8;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fillText(label, x, y - r - 10); ctx.restore();
}

function drawHeadMarker(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const color = '#ffe600', rot = t * 0.0015;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    i === 0 ? ctx.moveTo(32 * Math.cos(a), 32 * Math.sin(a))
            : ctx.lineTo(32 * Math.cos(a), 32 * Math.sin(a));
  }
  ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8; ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(-rot * 0.6);
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(15, 0); ctx.lineTo(0, 15); ctx.lineTo(-15, 0);
  ctx.closePath();
  ctx.fillStyle = color; ctx.globalAlpha = 0.9; ctx.shadowColor = color; ctx.shadowBlur = 24; ctx.fill(); ctx.restore();
  ctx.save();
  ctx.fillStyle = color; ctx.font = "bold 9px 'Share Tech Mono'";
  ctx.textAlign = 'center'; ctx.globalAlpha = 0.85;
  ctx.fillText('HEAD', x, y - 44); ctx.restore();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MonsterSlayer() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const camRef    = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  const gdRef = useRef<GameData>({
    score: 0, highScore: 0, wave: 1, lives: 3, combo: 0, comboTimer: 0,
    monsters: [], particles: [], floatingTexts: [],
    trails: { left: [], right: [], head: [] },
    waveTimer: 120, waveActive: false,
  });
  const handsRef  = useRef<{ left: Vec2 | null; right: Vec2 | null }>({ left: null, right: null });
  const headRef   = useRef<Vec2 | null>(null);
  const prevHands = useRef<{ left: Vec2 | null; right: Vec2 | null }>({ left: null, right: null });
  const prevHead  = useRef<Vec2 | null>(null);
  const screenRef = useRef<Screen>('loading');

  const [screen, setScreen]             = useState<Screen>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStep, setLoadStep]         = useState('Initializing...');
  const [uiScore, setUiScore]           = useState(0);
  const [uiHigh, setUiHigh]             = useState(0);
  const [uiWave, setUiWave]             = useState(1);
  const [uiLives, setUiLives]           = useState(3);
  const [uiCombo, setUiCombo]           = useState(0);
  const [uiMons, setUiMons]             = useState(0);
  const [hasLeft, setHasLeft]           = useState(false);
  const [hasRight, setHasRight]         = useState(false);
  const [hasHead, setHasHead]           = useState(false);
  const [waveMsg, setWaveMsg]           = useState('');

  // ── Game / Canvas Loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let t = 0, lastHud = 0;

    function startWave(wave: number) {
      const gd = gdRef.current;
      const W = window.innerWidth, H = window.innerHeight;
      gd.waveActive = true;
      const isBoss = wave % 5 === 0;
      if (isBoss) {
        gd.monsters = [mkBoss(W, H, wave)];
        setWaveMsg(`⚠ BOSS WAVE ${wave} ⚠`);
      } else {
        const count = Math.min(4 + wave * 2, 20);
        gd.monsters = Array.from({ length: count }, () => mkMonster(W, H, wave));
        setWaveMsg(`WAVE ${wave}`);
      }
      setTimeout(() => setWaveMsg(''), 2500);
    }

    function tick() {
      t++;
      const W = window.innerWidth, H = window.innerHeight;
      canvas.width = W; canvas.height = H;
      const gd = gdRef.current;

      // BG
      ctx.fillStyle = 'rgba(2,0,16,0.74)';
      ctx.fillRect(0, 0, W, H);

      if (screenRef.current !== 'playing') {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // Wave timer
      if (!gd.waveActive) {
        gd.waveTimer--;
        if (gd.waveTimer <= 0) startWave(gd.wave);
        // countdown bar
        const pct = 1 - gd.waveTimer / 150;
        const bW = 260, bH = 5;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(0,245,255,0.08)';
        ctx.fillRect(W / 2 - bW / 2, H / 2 - 46, bW, bH);
        ctx.fillStyle = '#00f5ff'; ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 8;
        ctx.fillRect(W / 2 - bW / 2, H / 2 - 46, bW * pct, bH);
        ctx.font = "10px 'Share Tech Mono'"; ctx.fillStyle = 'rgba(0,245,255,0.55)';
        ctx.textAlign = 'center'; ctx.shadowBlur = 0; ctx.globalAlpha = 0.55;
        ctx.fillText(`NEXT WAVE IN ${Math.ceil(gd.waveTimer / 60)}s...`, W / 2, H / 2 - 54);
        ctx.restore();
      }

      // ── Monster logic ──
      const hands = handsRef.current;
      const head  = headRef.current;
      const cx = W / 2, cy = H / 2;

      gd.monsters = gd.monsters.map(m => {
        if (m.deathAge >= 0) return { ...m, deathAge: m.deathAge + 1 };

        // Move
        let nx = m.x + m.vx, ny = m.y + m.vy;
        const spinSpd = m.type === 'speeder' ? 0.11 : m.type === 'brute' ? 0.02 : 0.05;
        let newAngle = m.angle + spinSpd;
        let newHf = Math.max(0, m.hitFlash - 1);
        let newHp = m.hp;
        const newSA = m.spawnAge < 30 ? m.spawnAge + 1 : m.spawnAge;

        // Boss steering
        if (m.type === 'boss') {
          const bvx = m.vx + (cx - m.x) * 0.0018;
          const bvy = m.vy + (cy - m.y) * 0.0018;
          const bv = Math.sqrt(bvx * bvx + bvy * bvy);
          const maxV = 1.8;
          const scale = bv > maxV ? maxV / bv : 1;
          nx = m.x + bvx * scale;
          ny = m.y + bvy * scale;
        }

        // Hit detection
        if (newSA >= 20) {
          const trackers: Array<Vec2 | null> = [hands.left, hands.right, head];
          for (const pt of trackers) {
            if (!pt) continue;
            const dx = nx - pt.x, dy = ny - pt.y;
            if (Math.sqrt(dx * dx + dy * dy) < m.radius + 30) {
              newHp--;
              newHf = 10;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              nx += (dx / d) * 22;
              ny += (dy / d) * 22;
              gd.particles.push(...burst(nx, ny, 7, 3.5, m.color));
              break;
            }
          }
        }

        // Kill
        if (newHp <= 0) {
          // Score
          gd.combo++;
          gd.comboTimer = 100;
          const base = m.type === 'boss' ? 600 + gd.wave * 150
                     : m.type === 'brute' ? 150
                     : m.type === 'speeder' ? 80 : 100;
          const gain = base * Math.max(1, Math.floor(gd.combo / 3));
          gd.score += gain;
          gd.particles.push(...burst(nx, ny, 35, 5.5, m.color));
          gd.particles.push(mkShockwave(nx, ny, m.color));
          const msg = gd.combo >= 6
            ? `${gd.combo}× COMBO! +${gain}`
            : KILL_MSGS[Math.floor(Math.random() * KILL_MSGS.length)] + ` +${gain}`;
          gd.floatingTexts.push({
            id: uid++, x: nx, y: ny - 20,
            text: msg,
            color: gd.combo >= 6 ? '#ffe600' : m.color,
            age: 0, vy: -2.0,
          });
          return { ...m, x: nx, y: ny, hp: 0, deathAge: 0, angle: newAngle, hitFlash: newHf, spawnAge: newSA };
        }

        // Reached center — damage player
        const dist2c = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);
        if (dist2c < 65 && newSA > 30) {
          gd.lives = Math.max(0, gd.lives - 1);
          gd.combo = 0;
          gd.particles.push(mkShockwave(cx, cy, '#ff0000'));
          gd.particles.push(...burst(cx, cy, 25, 6, '#ff006e'));
          gd.floatingTexts.push({ id: uid++, x: cx, y: cy - 30, text: '— LIFE LOST!', color: '#ff0000', age: 0, vy: -2 });
          if (gd.lives <= 0) {
            gd.highScore = Math.max(gd.highScore, gd.score);
            screenRef.current = 'gameover';
            setScreen('gameover');
          }
          // Scatter the monster
          return {
            ...m, x: cx + (Math.random() - 0.5) * 250, y: cy + (Math.random() - 0.5) * 250,
            vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
            deathAge: 0, angle: newAngle, hitFlash: newHf, spawnAge: newSA, hp: newHp,
          };
        }

        return { ...m, x: nx, y: ny, hp: newHp, angle: newAngle, hitFlash: newHf, spawnAge: newSA };
      });

      // Combo decay
      if (gd.comboTimer > 0) gd.comboTimer--;
      else if (gd.combo > 0) gd.combo = 0;

      // Wave cleared?
      const alive = gd.monsters.filter(m => m.deathAge < 0);
      if (gd.waveActive && gd.monsters.length > 0 && alive.length === 0) {
        const allDone = gd.monsters.every(m => m.deathAge >= 18);
        if (allDone) {
          gd.waveActive = false;
          gd.wave++;
          gd.waveTimer = 150;
          gd.monsters = [];
          const bonus = 200 * gd.wave;
          gd.score += bonus;
          gd.floatingTexts.push({ id: uid++, x: W / 2, y: H / 2, text: `✓ WAVE CLEAR! +${bonus}`, color: '#00f5ff', age: 0, vy: -0.9 });
        }
      }

      // Motion trails
      const pH = prevHands.current;
      function d2v(a: Vec2, b: Vec2) { return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2); }
      if (hands.left) {
        gd.trails.left = [{ x: hands.left.x, y: hands.left.y, age: 0 }, ...gd.trails.left.slice(0, 22)];
        if (pH.left && d2v(hands.left, pH.left) > 5)
          gd.particles.push(...burst(hands.left.x, hands.left.y, 2, 2, '#00f5ff'));
      }
      if (hands.right) {
        gd.trails.right = [{ x: hands.right.x, y: hands.right.y, age: 0 }, ...gd.trails.right.slice(0, 22)];
        if (pH.right && d2v(hands.right, pH.right) > 5)
          gd.particles.push(...burst(hands.right.x, hands.right.y, 2, 2, '#ff006e'));
      }
      if (head) {
        gd.trails.head = [{ x: head.x, y: head.y, age: 0 }, ...gd.trails.head.slice(0, 16)];
      }
      prevHands.current = { left: hands.left ? { ...hands.left } : null, right: hands.right ? { ...hands.right } : null };
      prevHead.current = head ? { ...head } : null;

      // Draw trails
      drawTrail(ctx, gd.trails.left, '#00f5ff');
      drawTrail(ctx, gd.trails.right, '#ff006e');
      drawTrail(ctx, gd.trails.head, '#ffe600');

      // Update + draw particles
      gd.particles = gd.particles
        .map(p => ({
          ...p, x: p.x + p.vx, y: p.y + p.vy,
          vy: p.type === 'shockwave' ? p.vy : p.vy + 0.07,
          vx: p.vx * 0.97,
          life: p.life - (p.type === 'shockwave' ? 0.028 : 0.02),
        }))
        .filter(p => p.life > 0)
        .slice(0, 220);
      drawParticles(ctx, gd.particles);

      // Draw monsters
      for (const m of gd.monsters) drawMonster(ctx, m);

      // Draw player markers
      if (hands.left)  drawHandMarker(ctx, hands.left.x, hands.left.y, '#00f5ff', 'L.HAND', t);
      if (hands.right) drawHandMarker(ctx, hands.right.x, hands.right.y, '#ff006e', 'R.HAND', t);
      if (head)        drawHeadMarker(ctx, head.x, head.y, t);

      // Floating texts
      gd.floatingTexts = gd.floatingTexts
        .map(ft => ({ ...ft, y: ft.y + ft.vy, age: ft.age + 1 }))
        .filter(ft => ft.age < 75);
      for (const ft of gd.floatingTexts) {
        const a = Math.max(0, 1 - ft.age / 75);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = ft.color; ctx.shadowColor = ft.color; ctx.shadowBlur = 12;
        const fsize = ft.text.includes('WAVE') ? 22 : ft.text.includes('COMBO') ? 20 : 16;
        ctx.font = `bold ${fsize}px 'Orbitron', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // Throttled HUD
      const now = performance.now();
      if (now - lastHud > 100) {
        lastHud = now;
        setUiScore(gd.score); setUiHigh(gd.highScore);
        setUiWave(gd.wave);   setUiLives(gd.lives);
        setUiCombo(gd.combo); setUiMons(alive.length);
        setHasLeft(!!hands.left); setHasRight(!!hands.right); setHasHead(!!head);
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── MediaPipe Loader ─────────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false, camInst: any = null;
    async function init() {
      try {
        setLoadStep('Loading Hands model...'); setLoadProgress(15);
        const { Hands }    = await import('@mediapipe/hands');
        setLoadProgress(35);
        setLoadStep('Loading FaceMesh model...');
        const { FaceMesh } = await import('@mediapipe/face_mesh');
        setLoadProgress(58);
        setLoadStep('Loading Camera Utils...');
        setLoadProgress(72);
        if (destroyed) return;
        const vid = videoRef.current!;

        const hands = new Hands({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

        const face = new FaceMesh({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
        face.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

        setLoadProgress(82); setLoadStep('Starting camera...');

        hands.onResults((res: any) => {
          if (destroyed) return;
          const W = window.innerWidth, H = window.innerHeight;
          let left: Vec2 | null = null, right: Vec2 | null = null;
          if (res.multiHandLandmarks) {
            res.multiHandLandmarks.forEach((lm: any, i: number) => {
              const label = res.multiHandedness[i]?.label;
              const x = (1 - lm[9].x) * W, y = lm[9].y * H;
              if (label === 'Left') right = { x, y }; else left = { x, y };
            });
          }
          handsRef.current = { left, right };
        });

        face.onResults((res: any) => {
          if (destroyed) return;
          const W = window.innerWidth, H = window.innerHeight;
          if (res.multiFaceLandmarks?.length) {
            const n = res.multiFaceLandmarks[0][1];
            headRef.current = { x: (1 - n.x) * W, y: n.y * H };
          } else headRef.current = null;
        });

        // Get ONE stream, attach to both hidden video AND preview directly
        let stream: MediaStream | null = null;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        vid.srcObject = stream;
        vid.muted = true;
        await vid.play().catch(() => {});

        if (camRef.current) {
          camRef.current.srcObject = stream;
          camRef.current.muted = true;
          await camRef.current.play().catch(() => {});
        }

        // Feed frames to MediaPipe via RAF — no Camera util needed
        let lastSend = 0;
        let rafId2 = 0;
        let frameCount2 = 0;
       const sendFrame2 = async (ts: number) => {
  if (destroyed) return;

  if (ts - lastSend > 66 && vid.readyState >= 2) {
    lastSend = ts;
    frameCount2++;

    if (frameCount2 % 2 === 0) {
      await hands.send({ image: vid }).catch(() => {});
    } else {
      await face.send({ image: vid }).catch(() => {});
    }
  }

  rafId2 = requestAnimationFrame(sendFrame2);
};
        rafId2 = requestAnimationFrame(sendFrame2);

        setLoadProgress(100); setLoadStep('Ready!');
        screenRef.current = 'title'; setScreen('title');
      } catch (e) {
        console.error(e);
        screenRef.current = 'title'; setScreen('title');
      }
    }
    init();
    return () => { destroyed = true; };
  }, []);

  // Re-attach preview on screen change
  useEffect(() => {
    const vid = videoRef.current, cam = camRef.current;
    if (!cam || !vid?.srcObject) return;
    if (cam.srcObject !== vid.srcObject) {
      cam.srcObject = vid.srcObject;
      cam.play().catch(() => {});
    }
  }, [screen]);

  function startGame() {
    const gd = gdRef.current;
    gd.score = 0; gd.wave = 1; gd.lives = 3; gd.combo = 0; gd.comboTimer = 0;
    gd.monsters = []; gd.particles = []; gd.floatingTexts = [];
    gd.trails = { left: [], right: [], head: [] };
    gd.waveTimer = 90; gd.waveActive = false;
    setUiScore(0); setUiWave(1); setUiLives(3); setUiCombo(0); setUiMons(0);
    screenRef.current = 'playing'; setScreen('playing');
  }

  const lifeArr = [0, 1, 2].map(i => i < uiLives);

  return (
    <>
      <Head>
        <title>MONSTER SLAYER — AR Game</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.wrapper}>
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2 }} />

        {/* Corners */}
        <div className={styles.cornerTL} /><div className={styles.cornerTR} />
        <div className={styles.cornerBL} /><div className={styles.cornerBR} />

        {/* Cam Preview */}
        {(screen === 'playing' || screen === 'title') && (
          <div className={styles.camPreview}>
            <video ref={camRef} autoPlay playsInline muted className={styles.camVideo} />
            <div className={styles.camOverlay}>
              <span className={styles.camLabel}>LIVE CAM</span>
              <span className={`${styles.camDot} ${(hasLeft || hasRight || hasHead) ? styles.dotActive : ''}`} />
            </div>
          </div>
        )}

        {/* ══ LOADING ══ */}
        {screen === 'loading' && (
          <div className={styles.loadOverlay}>
            <div className={styles.loadBox}>
              <div className={styles.loadTitle}>MONSTER<br />SLAYER</div>
              <div className={styles.loadSub}>AR MOTION COMBAT ENGINE</div>
              <div className={styles.loadBarWrap}><div className={styles.loadBar} style={{ width: `${loadProgress}%` }} /></div>
              <div className={styles.loadPct}>{loadProgress}%</div>
              <div className={styles.loadSteps}>{loadStep}</div>
            </div>
          </div>
        )}

        {/* ══ TITLE ══ */}
        {screen === 'title' && (
          <div className={styles.titleOverlay}>
            <div className={styles.titleBox}>
              <div className={styles.titleMain}>MONSTER<br/>SLAYER</div>
              <div className={styles.titleSub}>AR MOTION COMBAT · ENDLESS WAVE</div>
              <div className={styles.titleDivider} />
              <div className={styles.titleInstructions}>
                <div className={styles.instrRow}><span className={styles.instrIcon}>✋</span><span>Gerakkan <b>tangan</b> ke arah monster untuk membunuhnya</span></div>
                <div className={styles.instrRow}><span className={styles.instrIcon}>🗣</span><span>Gerakan <b>kepala</b> juga bisa menyerang!</span></div>
                <div className={styles.instrRow}><span className={styles.instrIcon}>🌊</span><span>Monster makin kuat setiap wave — <b>Wave ke-5</b> ada BOSS</span></div>
                <div className={styles.instrRow}><span className={styles.instrIcon}>⚡</span><span>Bunuh cepat untuk membangun <b>COMBO</b> multiplier</span></div>
                <div className={styles.instrRow}><span className={styles.instrIcon}>💀</span><span>Jangan biarkan monster <b>mencapai tengah layar</b> (−1 nyawa)</span></div>
              </div>
              {uiHigh > 0 && <div className={styles.titleHigh}>🏆 HIGH SCORE: {uiHigh.toLocaleString()}</div>}
              <button className={styles.startBtn} onClick={startGame}>▶ MULAI GAME</button>
            </div>
          </div>
        )}

        {/* ══ PLAYING HUD ══ */}
        {screen === 'playing' && (
          <>
            <div className={styles.hudTopLeft}>
              <div className={styles.hudTag}>SCORE</div>
              <div className={styles.hudScore}>{uiScore.toLocaleString()}</div>
              <div className={styles.waveInfo}>
                <span className={styles.waveBadge}>WAVE {uiWave}</span>
                <span className={styles.monsCount}>{uiMons > 0 ? `${uiMons} MUSUH` : gdRef.current.waveActive ? '...' : 'BERSIAP...'}</span>
              </div>
            </div>

            <div className={styles.hudTopRight}>
              <div className={styles.livesRow}>
                {lifeArr.map((alive, i) => (
                  <span key={i} className={`${styles.heart} ${alive ? styles.heartAlive : styles.heartDead}`}>♥</span>
                ))}
              </div>
              {uiCombo >= 3 && (
                <div className={`${styles.comboBox} ${uiCombo >= 8 ? styles.comboHyper : ''}`}>
                  <div className={styles.comboNum}>{uiCombo}×</div>
                  <div className={styles.comboLabel}>COMBO</div>
                </div>
              )}
              <div className={styles.highRow}>
                <span className={styles.hudTag}>BEST </span>
                <span className={styles.highVal}>{uiHigh.toLocaleString()}</span>
              </div>
            </div>

            <div className={styles.hudBottom}>
              <div className={styles.statusRow}>
                <span className={`${styles.statusDot} ${hasLeft ? styles.dotActive : ''}`} />
                <span className={styles.statusText}>L.HAND</span>
                <span className={`${styles.statusDot} ${hasRight ? styles.dotActive : ''}`} />
                <span className={styles.statusText}>R.HAND</span>
                <span className={`${styles.statusDot} ${hasHead ? styles.dotActive : ''}`} />
                <span className={styles.statusText}>HEAD</span>
              </div>
              <div className={styles.hint}>
                {!hasLeft && !hasRight && !hasHead
                  ? '⚠ TUNJUKKAN TANGAN / WAJAH KE KAMERA'
                  : uiCombo >= 10 ? '🔥 ULTRA COMBO — TERUS BUNUH!'
                  : uiCombo >= 5 ? '⚡ COMBO STREAK!'
                  : '🎮 HANCURKAN SEMUA MONSTER!'}
              </div>
            </div>
          </>
        )}

        {/* Wave announce */}
        {waveMsg && <div className={styles.waveAnnounce}>{waveMsg}</div>}

        {/* ══ GAME OVER ══ */}
        {screen === 'gameover' && (
          <div className={styles.gameoverOverlay}>
            <div className={styles.gameoverBox}>
              <div className={styles.gameoverTitle}>GAME OVER</div>
              <div className={styles.gameoverStats}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>SCORE</span>
                  <span className={styles.statVal}>{uiScore.toLocaleString()}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>WAVE DICAPAI</span>
                  <span className={styles.statVal}>{uiWave}</span>
                </div>
                <div className={`${styles.statRow} ${styles.statRowHigh}`}>
                  <span className={styles.statLabel}>HIGH SCORE</span>
                  <span className={`${styles.statVal} ${styles.statHigh}`}>{Math.max(uiScore, uiHigh).toLocaleString()}</span>
                </div>
              </div>
              {uiScore > 0 && uiScore >= uiHigh && (
                <div className={styles.newRecord}>🏆 NEW HIGH SCORE!</div>
              )}
              <div className={styles.goButtons}>
                <button className={styles.startBtn} onClick={startGame}>↺ MAIN LAGI</button>
                <button className={styles.menuBtn} onClick={() => { screenRef.current = 'title'; setScreen('title'); }}>≡ MENU</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
