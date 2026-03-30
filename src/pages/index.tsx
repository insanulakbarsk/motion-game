import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import styles from '../styles/Game.module.css';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number }

interface Particle {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
  size: number;
  type: 'spark' | 'ring' | 'star' | 'line';
  angle?: number;
}

interface Trail { x: number; y: number; age: number }

interface ScorePop { id: number; x: number; y: number; val: number }

interface GameState {
  score: number;
  combo: number;
  level: number;
  motionPower: number;
  particles: Particle[];
  trails: { left: Trail[]; right: Trail[]; head: Trail[] };
}

// ─── Constants ──────────────────────────────────────────────────────────────
const COLORS = ['#00f5ff', '#ff006e', '#ffe600', '#39ff14', '#bf00ff', '#ff8c00', '#fff'];
let pid = 0;

// ─── Particle Factory ────────────────────────────────────────────────────────
function spawnParticles(x: number, y: number, count: number, speed: number): Particle[] {
  return Array.from({ length: count }, (): Particle => {
    const angle = Math.random() * Math.PI * 2;
    const s = (Math.random() * 3 + 0.8) * speed;
    const typeR = Math.random();
    return {
      id: pid++,
      x, y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      life: 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: Math.random() * 5 + 2,
      type: typeR > 0.7 ? 'star' : typeR > 0.5 ? 'ring' : typeR > 0.3 ? 'line' : 'spark',
      angle,
    };
  });
}

// ─── Renderer ────────────────────────────────────────────────────────────────
function renderFrame(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  gs: GameState,
  hands: { left: Vec2 | null; right: Vec2 | null },
  head: Vec2 | null
) {
  // Background
  ctx.fillStyle = `rgba(2,0,16,0.72)`;
  ctx.fillRect(0, 0, W, H);

  // Edge glow when powered
  if (gs.motionPower > 0.4) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, `rgba(0,245,255,${gs.motionPower * 0.12})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Trails
  drawTrail(ctx, gs.trails.left, '#00f5ff', 22);
  drawTrail(ctx, gs.trails.right, '#ff006e', 22);
  drawTrail(ctx, gs.trails.head, '#ffe600', 16);

  // Particles
  for (const p of gs.particles) {
    const a = Math.max(0, p.life);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;

    if (p.type === 'spark') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2 * (1 - p.life * 0.3), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.type === 'star') {
      drawStar(ctx, p.x, p.y, p.size * 1.8, p.color);
    } else if (p.type === 'line') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 5, p.y - p.vy * 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Hand markers
  const t = Date.now();
  if (hands.left) drawHandMarker(ctx, hands.left.x, hands.left.y, '#00f5ff', 'L', t, gs.motionPower);
  if (hands.right) drawHandMarker(ctx, hands.right.x, hands.right.y, '#ff006e', 'R', t, gs.motionPower);
  if (head) drawHeadMarker(ctx, head.x, head.y, t);
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: Trail[], color: string, maxAge: number) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const a = Math.max(0, 1 - trail[i].age / maxAge) * 0.65;
    if (a <= 0) continue;
    const w = (1 - trail[i].age / maxAge) * 5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.globalAlpha = a;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

function drawHandMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, t: number, power: number) {
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.006);
  const r = 20 + power * 14;

  // Rotating outer ring
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.001);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7 * pulse;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
  }
  ctx.restore();

  // Outer circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.4 * pulse;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();

  // Inner filled dot
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.restore();

  // Crosshair
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  const gap = 13, ext = r + 8;
  ctx.beginPath();
  ctx.moveTo(x - ext, y); ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y); ctx.lineTo(x + ext, y);
  ctx.moveTo(x, y - ext); ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap); ctx.lineTo(x, y + ext);
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 10px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(`${label}.HAND`, x, y - r - 12);
  ctx.restore();
}

function drawHeadMarker(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const color = '#ffe600';
  const rot = t * 0.0015;

  // Outer hexagon
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 30;
    i === 0 ? ctx.moveTo(r * Math.cos(a), r * Math.sin(a))
            : ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.75;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();

  // Inner counter-rotating diamond
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-rot * 0.7);
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(15, 0);
  ctx.lineTo(0, 15);  ctx.lineTo(-15, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.restore();

  // Label
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 10px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.85;
  ctx.fillText('HEAD', x, y - 42);
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function MotionGame() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const animRef     = useRef<number>(0);
  const gsRef       = useRef<GameState>({
    score: 0, combo: 0, level: 1, motionPower: 0,
    particles: [],
    trails: { left: [], right: [], head: [] },
  });
  const handsRef    = useRef<{ left: Vec2 | null; right: Vec2 | null }>({ left: null, right: null });
  const headRef     = useRef<Vec2 | null>(null);
  const prevHands   = useRef<{ left: Vec2 | null; right: Vec2 | null }>({ left: null, right: null });
  const prevHead    = useRef<Vec2 | null>(null);

  const [status, setStatus]           = useState<'loading' | 'ready' | 'tracking' | 'error'>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStep, setLoadStep]       = useState('Initializing...');
  const [displayScore, setDisplayScore] = useState(0);
  const [displayCombo, setDisplayCombo] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [displayPower, setDisplayPower] = useState(0);
  const [isHyper, setIsHyper]         = useState(false);
  const [scorePopups, setScorePopups] = useState<ScorePop[]>([]);
  const [hasLeft, setHasLeft]         = useState(false);
  const [hasRight, setHasRight]       = useState(false);
  const [hasHead, setHasHead]         = useState(false);
  const camVideoRef = useRef<HTMLVideoElement>(null);

  // ── Canvas render loop ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let lastHudUpdate = 0;

    function tick() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;

      // Motion update
      const hands = handsRef.current;
      const head  = headRef.current;
      const pH    = prevHands.current;
      const pHd   = prevHead.current;
      const gs    = gsRef.current;

      let totalDelta = 0;
      const newParticles: Particle[] = [];

      function d2(a: Vec2, b: Vec2) { return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2); }

      // Left hand motion
      if (hands.left && pH.left) {
        const d = d2(hands.left, pH.left);
        if (d > 4) {
          totalDelta += d;
          const cnt = Math.min(Math.ceil(d / 10), 8);
          newParticles.push(...spawnParticles(hands.left.x, hands.left.y, cnt, d / 50));
          gs.trails.left = [{ x: hands.left.x, y: hands.left.y, age: 0 }, ...gs.trails.left.slice(0, 24)];
        }
      } else if (hands.left) {
        gs.trails.left = [{ x: hands.left.x, y: hands.left.y, age: 0 }, ...gs.trails.left.slice(0, 24)];
      }

      // Right hand motion
      if (hands.right && pH.right) {
        const d = d2(hands.right, pH.right);
        if (d > 4) {
          totalDelta += d;
          const cnt = Math.min(Math.ceil(d / 10), 8);
          newParticles.push(...spawnParticles(hands.right.x, hands.right.y, cnt, d / 50));
          gs.trails.right = [{ x: hands.right.x, y: hands.right.y, age: 0 }, ...gs.trails.right.slice(0, 24)];
        }
      } else if (hands.right) {
        gs.trails.right = [{ x: hands.right.x, y: hands.right.y, age: 0 }, ...gs.trails.right.slice(0, 24)];
      }

      // Head motion (1.5× bonus)
      if (head && pHd) {
        const d = d2(head, pHd);
        if (d > 3) {
          totalDelta += d * 1.5;
          const cnt = Math.min(Math.ceil(d / 7), 10);
          newParticles.push(...spawnParticles(head.x, head.y, cnt, d / 35));
          gs.trails.head = [{ x: head.x, y: head.y, age: 0 }, ...gs.trails.head.slice(0, 18)];
        }
      } else if (head) {
        gs.trails.head = [{ x: head.x, y: head.y, age: 0 }, ...gs.trails.head.slice(0, 18)];
      }

      prevHands.current = { left: hands.left ? { ...hands.left } : null, right: hands.right ? { ...hands.right } : null };
      prevHead.current  = head ? { ...head } : null;

      // Update game state
      const power       = Math.min(totalDelta / 70, 1);
      gs.motionPower    = gs.motionPower * 0.92 + power * 0.28;
      gs.combo          = totalDelta > 8 ? gs.combo + 0.4 : Math.max(0, gs.combo - 0.08);
      const scoreGain   = totalDelta > 8 ? Math.floor(totalDelta * (1 + Math.floor(gs.combo) * 0.15)) : 0;
      gs.score         += scoreGain;
      gs.level          = Math.floor(gs.score / 1500) + 1;

      // Update particles & trails
      gs.particles = [
        ...newParticles,
        ...gs.particles.slice(0, 150).map(p => ({
          ...p,
          x: p.x + p.vx, y: p.y + p.vy,
          vy: p.vy + 0.09, vx: p.vx * 0.97,
          life: p.life - 0.022,
        })).filter(p => p.life > 0),
      ];

      gs.trails.left  = gs.trails.left.map(t => ({ ...t, age: t.age + 1 })).filter(t => t.age < 22);
      gs.trails.right = gs.trails.right.map(t => ({ ...t, age: t.age + 1 })).filter(t => t.age < 22);
      gs.trails.head  = gs.trails.head.map(t => ({ ...t, age: t.age + 1 })).filter(t => t.age < 16);

      // Render
      renderFrame(ctx, W, H, gs, hands, head);

      // HUD update (throttled)
      const now = performance.now();
      if (now - lastHudUpdate > 80) {
        lastHudUpdate = now;
        setDisplayScore(gs.score);
        setDisplayCombo(Math.floor(gs.combo));
        setDisplayLevel(gs.level);
        const pct = Math.round(gs.motionPower * 100);
        setDisplayPower(pct);
        setIsHyper(pct > 65);
        setHasLeft(!!hands.left);
        setHasRight(!!hands.right);
        setHasHead(!!head);

        // Score popup
        if (scoreGain > 80) {
          const pos = hands.right || hands.left || head;
          if (pos) {
            const popup: ScorePop = { id: pid++, x: pos.x, y: pos.y - 20, val: scoreGain };
            setScorePopups(prev => [...(prev || []).slice(-5), popup]);
            setTimeout(() => setScorePopups(prev => (prev || []).filter(p => p.id !== popup.id)), 900);
          }
        }
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── MediaPipe Loader ────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    let camInstance: any = null;

    async function init() {
      try {
        setLoadStep('Loading MediaPipe Hands...');
        setLoadProgress(15);
        const { Hands }     = await import('@mediapipe/hands');
        setLoadProgress(30);
        setLoadStep('Loading FaceMesh...');
        const { FaceMesh }  = await import('@mediapipe/face_mesh');
        setLoadProgress(50);
        setLoadStep('Loading Camera Utils...');
        const { Camera }    = await import('@mediapipe/camera_utils');
        setLoadProgress(65);

        if (destroyed) return;
        const videoEl = videoRef.current!;

        // Hands
        const hands = new Hands({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

        // FaceMesh
        const face = new FaceMesh({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
        });
        face.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

        setLoadProgress(75);
        setLoadStep('Starting camera...');

        hands.onResults((res: any) => {
          if (destroyed) return;
          const W = window.innerWidth, H = window.innerHeight;
          let left: Vec2 | null = null, right: Vec2 | null = null;
          if (res.multiHandLandmarks) {
            res.multiHandLandmarks.forEach((lm: any, i: number) => {
              const label = res.multiHandedness[i]?.label;
              const x = (1 - lm[9].x) * W;
              const y = lm[9].y * H;
              if (label === 'Left') right = { x, y };
              else left = { x, y };
            });
          }
          handsRef.current = { left, right };
          if (left || right) setStatus('tracking');
        });

        face.onResults((res: any) => {
          if (destroyed) return;
          const W = window.innerWidth, H = window.innerHeight;
          if (res.multiFaceLandmarks?.length) {
            const nose = res.multiFaceLandmarks[0][1];
            headRef.current = { x: (1 - nose.x) * W, y: nose.y * H };
            setStatus('tracking');
          } else {
            headRef.current = null;
          }
        });

        let frame = 0;
        camInstance = new Camera(videoEl, {
          onFrame: async () => {
            if (destroyed) return;
            frame++;
            if (frame % 2 === 0) await hands.send({ image: videoEl });
            else await face.send({ image: videoEl });
          },
          width: 640, height: 480,
        });

        await camInstance.start();

        // Mirror cam preview
        if (camVideoRef.current && videoEl.srcObject) {
          camVideoRef.current.srcObject = videoEl.srcObject;
        }

        setLoadProgress(100);
        setLoadStep('Ready!');
        setStatus('ready');
      } catch (e) {
        console.error(e);
        setStatus('error');
      }
    }

    init();
    return () => { destroyed = true; camInstance?.stop(); };
  }, []);

  // ── Cam preview srcObject sync ──────────────────────────────────────────
  useEffect(() => {
    if (status === 'ready' || status === 'tracking') {
      const videoEl = videoRef.current;
      const camEl   = camVideoRef.current;
      if (videoEl && camEl && videoEl.srcObject) {
        camEl.srcObject = videoEl.srcObject;
        camEl.play().catch(() => {});
      }
    }
  }, [status]);

  const pct = displayPower;
  const isCrazy = pct > 88;

  return (
    <>
      <Head>
        <title>MOTION GAME</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.wrapper}>
        {/* Hidden capture video */}
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted />

        {/* Main game canvas */}
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2 }}
        />

        {/* Corner decorations */}
        <div className={styles.cornerTL} />
        <div className={styles.cornerTR} />
        <div className={styles.cornerBL} />
        <div className={styles.cornerBR} />

        {/* Hyper border glow */}
        {isHyper && <div className={styles.hyperBorder} />}

        {/* Webcam preview */}
        {(status === 'ready' || status === 'tracking') && (
          <div className={styles.camPreview}>
            <video
              ref={camVideoRef}
              autoPlay playsInline muted
              className={styles.camVideo}
            />
            <div className={styles.camOverlay}>
              <span className={styles.camLabel}>LIVE CAM</span>
              <span className={`${styles.camDot} ${status === 'tracking' ? styles.dotActive : ''}`} />
            </div>
          </div>
        )}

        {/* ── HUD Top-Left: Score ── */}
        <div className={styles.hudTopLeft}>
          <div className={styles.hudTag}>SCORE</div>
          <div className={styles.hudScore}>{displayScore.toLocaleString()}</div>
          <div className={styles.hudLevel}>
            LVL {displayLevel}
            <div className={styles.levelBar}>
              <div className={styles.levelFill} style={{ width: `${((displayScore % 1500) / 1500) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* ── HUD Top-Right: Combo + Power ── */}
        <div className={styles.hudTopRight}>
          {displayCombo > 3 && (
            <div className={`${styles.comboBox} ${isHyper ? styles.comboHyper : ''}`}>
              <div className={styles.comboNum}>{displayCombo}×</div>
              <div className={styles.comboLabel}>COMBO</div>
            </div>
          )}

          <div className={styles.powerBox}>
            <div className={styles.powerLabel}>MOTION POWER</div>
            <div className={styles.powerBarWrap}>
              <div
                className={`${styles.powerFill} ${isHyper ? styles.powerHyper : ''} ${isCrazy ? styles.powerCrazy : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className={styles.powerNum}>{pct}%</div>
            {isHyper && <div className={styles.hyperLabel}>⚡ HYPER MODE</div>}
          </div>
        </div>

        {/* ── Score popups ── */}
        {(scorePopups || []).map(p => (
          <div
            key={p.id}
            className={styles.scorePop}
            style={{ left: p.x, top: p.y }}
          >
            +{p.val}
          </div>
        ))}

        {/* ── HUD Bottom: Status bar ── */}
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
            {status === 'loading' && `⚙ ${loadStep}`}
            {status === 'ready'   && '✦ MOVE YOUR HANDS & HEAD TO START'}
            {status === 'tracking' && isCrazy
              ? '🔥 MAXIMUM OVERDRIVE!'
              : status === 'tracking' && isHyper
              ? '⚡ HYPER MODE — KEEP MOVING!'
              : status === 'tracking'
              ? '🎮 MOTION DETECTED — SCORE MULTIPLYING'
              : ''}
            {status === 'error'   && '❌ CAMERA ACCESS REQUIRED — CHECK BROWSER PERMISSIONS'}
          </div>
        </div>

        {/* ── Loading overlay ── */}
        {status === 'loading' && (
          <div className={styles.loadOverlay}>
            <div className={styles.loadBox}>
              <div className={styles.loadTitle}>MOTION GAME</div>
              <div className={styles.loadSub}>AR MOTION TRACKING ENGINE</div>
              <div className={styles.loadBarWrap}>
                <div className={styles.loadBar} style={{ width: `${loadProgress}%` }} />
              </div>
              <div className={styles.loadPct}>{loadProgress}%</div>
              <div className={styles.loadSteps}>{loadStep}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
