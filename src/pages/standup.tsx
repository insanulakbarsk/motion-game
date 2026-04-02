import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number }
interface Member { id: number; name: string; done: boolean; timeUsed: number }
type TimerState = 'idle' | 'running' | 'paused' | 'done' | 'overtime'

const STANDUP_DURATION = 120; // 2 minutes in seconds
const COLORS = {
  cyan:   '#00f5ff',
  pink:   '#ff006e',
  yellow: '#ffe600',
  green:  '#39ff14',
  purple: '#bf00ff',
  orange: '#ff8c00',
}

// ─── Gesture Detection ───────────────────────────────────────────────────────
// Returns true if hand wrist is above shoulder (approx top 35% of screen)
function isHandRaised(pos: Vec2 | null, H: number): boolean {
  if (!pos) return false;
  return pos.y < H * 0.38;
}

function isHandLowered(pos: Vec2 | null, H: number): boolean {
  if (!pos) return false;
  return pos.y > H * 0.55;
}

// ─── Particle system for canvas ──────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; color: string; size: number;
}
let pid = 0;

function mkParticles(x: number, y: number, n: number, color: string): Particle[] {
  return Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 3 + 1;
    return { x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, color, size: Math.random()*5+2 };
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StandupTimer() {
  const router = useRouter();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const camRef    = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  // MediaPipe tracking
  const handsRef  = useRef<{ left: Vec2|null; right: Vec2|null }>({ left: null, right: null });
  const headRef   = useRef<Vec2|null>(null);

  // Timer state (refs for canvas loop)
  const timerStateRef  = useRef<TimerState>('idle');
  const secondsLeftRef = useRef(STANDUP_DURATION);
  const intervalRef    = useRef<NodeJS.Timeout | null>(null);
  const particlesRef   = useRef<Particle[]>([]);
  const gestureRef     = useRef<{ raised: boolean; lowered: boolean; holdFrames: number }>({ raised: false, lowered: false, holdFrames: 0 });
  const screenRef      = useRef<'setup' | 'timer'>('setup');

  // React state for UI
  const [screen, setScreen]             = useState<'setup' | 'timer'>('setup');
  const [timerState, setTimerState]     = useState<TimerState>('idle');
  const [secondsLeft, setSecondsLeft]   = useState(STANDUP_DURATION);
  const [members, setMembers]           = useState<Member[]>([
    { id: 1, name: 'Anggota 1', done: false, timeUsed: 0 },
    { id: 2, name: 'Anggota 2', done: false, timeUsed: 0 },
    { id: 3, name: 'Anggota 3', done: false, timeUsed: 0 },
  ]);
  const [currentIdx, setCurrentIdx]     = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [camReady, setCamReady]         = useState(false);
  const [hasHands, setHasHands]         = useState(false);
  const [gestureHint, setGestureHint]   = useState('');
  const [newName, setNewName]           = useState('');
  const [editingId, setEditingId]       = useState<number|null>(null);
  const [allDone, setAllDone]           = useState(false);
  const [summary, setSummary]           = useState<Member[]>([]);

  const membersRef   = useRef(members);
  const currentIdxRef = useRef(currentIdx);
  const timerStateSt  = useRef(timerState);
  membersRef.current   = members;
  currentIdxRef.current = currentIdx;
  timerStateSt.current  = timerState;

  // ── Timer tick ───────────────────────────────────────────────────────────
  const startTick = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      secondsLeftRef.current -= 1;
      const s = secondsLeftRef.current;
      setSecondsLeft(s);
      if (s <= 0) {
        timerStateRef.current = 'overtime';
        setTimerState('overtime');
      }
    }, 1000);
  }, []);

  const stopTick = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    secondsLeftRef.current = STANDUP_DURATION;
    setSecondsLeft(STANDUP_DURATION);
    timerStateRef.current = 'running';
    setTimerState('running');
    startTick();
    particlesRef.current.push(...mkParticles(window.innerWidth/2, window.innerHeight/2, 20, COLORS.green));
  }, [startTick]);

  const pauseTimer = useCallback(() => {
    stopTick();
    timerStateRef.current = 'paused';
    setTimerState('paused');
  }, [stopTick]);

  const resumeTimer = useCallback(() => {
    timerStateRef.current = 'running';
    setTimerState('running');
    startTick();
  }, [startTick]);

  const nextSpeaker = useCallback(() => {
    stopTick();
    const idx = currentIdxRef.current;
    const mems = membersRef.current;
    const timeUsed = STANDUP_DURATION - secondsLeftRef.current;

    // Mark current as done
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, done: true, timeUsed: Math.max(0, timeUsed) } : m));

    const nextIdx = idx + 1;
    if (nextIdx >= mems.length) {
      // All done
      const finalMembers = mems.map((m, i) => i === idx ? { ...m, done: true, timeUsed: Math.max(0, timeUsed) } : m);
      setSummary(finalMembers);
      setAllDone(true);
      timerStateRef.current = 'done';
      setTimerState('done');
      particlesRef.current.push(...mkParticles(window.innerWidth/2, window.innerHeight/2, 40, COLORS.yellow));
    } else {
      setCurrentIdx(nextIdx);
      secondsLeftRef.current = STANDUP_DURATION;
      setSecondsLeft(STANDUP_DURATION);
      timerStateRef.current = 'idle';
      setTimerState('idle');
      particlesRef.current.push(...mkParticles(window.innerWidth/2, window.innerHeight/2, 15, COLORS.cyan));
    }
  }, [stopTick]);

  // ── Gesture handler (called from canvas loop) ────────────────────────────
  const processGesture = useCallback(() => {
    const H = window.innerHeight;
    const hands = handsRef.current;
    const state = timerStateRef.current;
    const scr = screenRef.current;
    if (scr !== 'timer') return;

    const leftRaised  = isHandRaised(hands.left, H);
    const rightRaised = isHandRaised(hands.right, H);
    const anyRaised   = leftRaised || rightRaised;
    const leftLow     = isHandLowered(hands.left, H);
    const rightLow    = isHandLowered(hands.right, H);
    const anyLow      = leftLow || rightLow;

    const g = gestureRef.current;

    if (anyRaised && !g.raised) {
      g.raised = true; g.lowered = false; g.holdFrames = 0;
    } else if (anyRaised && g.raised) {
      g.holdFrames++;
      if (g.holdFrames === 20) { // held ~0.33s at 60fps
        if (state === 'idle') { startTimer(); setGestureHint('🙌 Timer dimulai!'); }
        else if (state === 'paused') { resumeTimer(); setGestureHint('▶ Dilanjutkan!'); }
      }
    } else if (!anyRaised) {
      g.raised = false;
    }

    if (anyLow && !g.lowered && (state === 'running' || state === 'overtime')) {
      g.lowered = true; g.raised = false; g.holdFrames = 0;
    } else if (anyLow && g.lowered && (state === 'running' || state === 'overtime')) {
      g.holdFrames++;
      if (g.holdFrames === 20) {
        nextSpeaker();
        setGestureHint('✅ Selesai! Giliran berikutnya');
        setTimeout(() => setGestureHint(''), 2000);
      }
    } else if (!anyLow) {
      if (g.lowered) g.lowered = false;
    }
  }, [startTimer, resumeTimer, nextSpeaker]);

  // ── Canvas loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    function tick() {
      t++;
      const W = window.innerWidth, H = window.innerHeight;
      canvas.width = W; canvas.height = H;

      // BG
      ctx.fillStyle = 'rgba(2,0,16,0.78)';
      ctx.fillRect(0, 0, W, H);

      if (screenRef.current !== 'timer') {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      processGesture();

      const hands = handsRef.current;
      const state = timerStateRef.current;
      const sLeft = secondsLeftRef.current;
      const pct   = Math.max(0, sLeft / STANDUP_DURATION);

      // ── Circular progress arc ──
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.28;

      // BG arc
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI/2, Math.PI*1.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.restore();

      // Progress arc
      const arcColor = sLeft <= 0 ? COLORS.pink
                     : sLeft <= 30 ? COLORS.orange
                     : sLeft <= 60 ? COLORS.yellow
                     : COLORS.cyan;
      const endAngle = -Math.PI/2 + pct * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI/2, endAngle);
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.shadowColor = arcColor;
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.restore();

      // Tick marks
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const inner = R - 22, outer = R + 22;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
        ctx.lineTo(cx + outer * Math.cos(a), cy + outer * Math.sin(a));
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ── Gesture zones (visual guide) ──
      // Raise zone (top)
      if (state === 'idle' || state === 'paused') {
        const zoneA = 0.3 + 0.1 * Math.sin(t * 0.05);
        ctx.save();
        ctx.globalAlpha = zoneA;
        ctx.fillStyle = COLORS.green;
        ctx.shadowColor = COLORS.green; ctx.shadowBlur = 20;
        ctx.font = "bold 28px 'Share Tech Mono'";
        ctx.textAlign = 'center';
        ctx.fillText('🙌 ANGKAT TANGAN UNTUK MULAI', W/2, H * 0.14);
        // Arrow up
        ctx.font = "36px 'Share Tech Mono'";
        ctx.fillText('↑', W/2, H * 0.21);
        ctx.restore();
      }

      // Lower zone (bottom hint) — when running
      if (state === 'running' || state === 'overtime') {
        const zoneA = 0.25 + 0.1 * Math.sin(t * 0.05);
        ctx.save();
        ctx.globalAlpha = zoneA;
        ctx.fillStyle = COLORS.pink;
        ctx.shadowColor = COLORS.pink; ctx.shadowBlur = 18;
        ctx.font = "bold 22px 'Share Tech Mono'";
        ctx.textAlign = 'center';
        ctx.fillText('↓  TURUNKAN TANGAN JIKA SELESAI  ↓', W/2, H * 0.88);
        ctx.restore();
      }

      // ── Hand markers ──
      if (hands.left || hands.right) {
        setHasHands(true);
        if (hands.left)  drawHandDot(ctx, hands.left.x,  hands.left.y,  COLORS.cyan, t);
        if (hands.right) drawHandDot(ctx, hands.right.x, hands.right.y, COLORS.pink, t);
      } else {
        setHasHands(false);
      }

      // ── Particles ──
      particlesRef.current = particlesRef.current
        .map(p => ({ ...p, x: p.x+p.vx, y: p.y+p.vy, vy: p.vy+0.07, vx: p.vx*0.97, life: p.life-0.025 }))
        .filter(p => p.life > 0);
      for (const p of particlesRef.current) {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [processGesture]);

  // ── MediaPipe + Camera ───────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    let rafId = 0;
    let stream: MediaStream | null = null;

    async function init() {
      try {
        setLoadProgress(20);
        const { Hands } = await import('@mediapipe/hands');
        setLoadProgress(60);
        if (destroyed) return;

        // Step 1: get ONE stream and attach to BOTH videos directly
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });

        const vid = videoRef.current!;
        vid.srcObject = stream;
        vid.muted = true;
        await vid.play().catch(() => {});

        // Preview gets the exact same stream object — no sharing issues
        if (camRef.current) {
          camRef.current.srcObject = stream;
          camRef.current.muted = true;
          await camRef.current.play().catch(() => {});
        }

        setLoadProgress(80);

        // Step 2: setup MediaPipe Hands
        const hands = new Hands({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        hands.onResults((res: any) => {
          if (destroyed) return;
          const W = window.innerWidth, H = window.innerHeight;
          let left: Vec2 | null = null, right: Vec2 | null = null;
          if (res.multiHandLandmarks) {
            res.multiHandLandmarks.forEach((lm: any, i: number) => {
              const label = res.multiHandedness[i]?.label;
              const x = (1 - lm[0].x) * W, y = lm[0].y * H;
              if (label === 'Left') right = { x, y }; else left = { x, y };
            });
          }
          handsRef.current = { left, right };
        });

        setLoadProgress(90);

        // Step 3: feed frames to MediaPipe via RAF — no Camera util needed
        let lastSend = 0;
        const sendFrame = async (ts: number) => {
  if (destroyed) return;

  if (ts - lastSend > 80 && vid.readyState >= 2) {
    lastSend = ts;
    await hands.send({ image: vid }).catch(() => {});
  }

  rafId = requestAnimationFrame(sendFrame);
};
        rafId = requestAnimationFrame(sendFrame);

        setLoadProgress(100);
        setCamReady(true);
      } catch (e) {
        console.error('Camera error:', e);
        setCamReady(true);
      }
    }

    init();
    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach(t => t.stop());
      stopTick();
    };
  }, [stopTick]);

  // Re-attach preview if React remounts the video element (e.g. screen change)
  useEffect(() => {
    const vid = videoRef.current;
    const cam = camRef.current;
    if (!cam || !vid?.srcObject) return;
    if (cam.srcObject !== vid.srcObject) {
      cam.srcObject = vid.srcObject;
      cam.play().catch(() => {});
    }
  }, [screen, camReady]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function addMember() {
    const name = newName.trim() || `Anggota ${members.length + 1}`;
    setMembers(prev => [...prev, { id: Date.now(), name, done: false, timeUsed: 0 }]);
    setNewName('');
  }

  function removeMember(id: number) {
    setMembers(prev => prev.filter(m => m.id !== id));
  }

  function updateName(id: number, name: string) {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, name } : m));
    setEditingId(null);
  }

  function goTimer() {
    if (members.length === 0) return;
    setCurrentIdx(0);
    setAllDone(false);
    setMembers(prev => prev.map(m => ({ ...m, done: false, timeUsed: 0 })));
    secondsLeftRef.current = STANDUP_DURATION;
    setSecondsLeft(STANDUP_DURATION);
    timerStateRef.current = 'idle';
    setTimerState('idle');
    screenRef.current = 'timer';
    setScreen('timer');
  }

  function resetAll() {
    stopTick();
    setAllDone(false);
    setCurrentIdx(0);
    setMembers(prev => prev.map(m => ({ ...m, done: false, timeUsed: 0 })));
    secondsLeftRef.current = STANDUP_DURATION;
    setSecondsLeft(STANDUP_DURATION);
    timerStateRef.current = 'idle';
    setTimerState('idle');
    screenRef.current = 'setup';
    setScreen('setup');
  }

  const mins = Math.floor(Math.abs(secondsLeft) / 60);
  const secs = Math.abs(secondsLeft) % 60;
  const timeStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const isOvertime = timerState === 'overtime';
  const pct = Math.max(0, secondsLeft / STANDUP_DURATION) * 100;
  const arcColor = secondsLeft <= 0 ? COLORS.pink
                 : secondsLeft <= 30 ? COLORS.orange
                 : secondsLeft <= 60 ? COLORS.yellow
                 : COLORS.cyan;
  const currentMember = members[currentIdx];

  return (
    <>
      <Head>
        <title>STANDUP TIMER</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ position:'fixed', inset:0, background:'#020010', fontFamily:"'Share Tech Mono', monospace", overflow:'hidden' }}>
        {/* Grid */}
        <div style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
          backgroundImage:'linear-gradient(rgba(0,245,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.05) 1px,transparent 1px)',
          backgroundSize:'50px 50px' }} />
        {/* Scanlines */}
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
          background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)' }} />

        {/* Hidden capture */}
        <video ref={videoRef} style={{ display:'none' }} autoPlay playsInline muted />

        {/* Canvas */}
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:2 }} />

        {/* ── SETUP SCREEN ── */}
        {screen === 'setup' && (
          <div style={{
            position:'absolute', inset:0, zIndex:10,
            display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(2,0,16,0.88)', backdropFilter:'blur(4px)',
          }}>
            <div style={{
              width:'min(520px, 92vw)',
              background:'rgba(0,0,10,0.9)',
              border:'1px solid rgba(0,245,255,0.2)',
              borderRadius:8,
              padding:'36px 40px',
              display:'flex', flexDirection:'column', gap:22,
              boxShadow:'0 0 60px rgba(0,245,255,0.1)',
            }}>
              {/* Header */}
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:28, fontWeight:900,
                  color:COLORS.cyan, letterSpacing:6,
                  textShadow:`0 0 16px ${COLORS.cyan}` }}>STANDUP TIMER</div>
                <div style={{ fontSize:9, letterSpacing:5, color:'rgba(0,245,255,0.4)', marginTop:4 }}>MORNING BRIEFING · 2 MIN PER ORANG</div>
              </div>

              <div style={{ height:1, background:'linear-gradient(90deg,rgba(0,245,255,0.2),transparent)' }} />

              {/* Member list */}
              <div>
                <div style={{ fontSize:9, letterSpacing:4, color:'rgba(0,245,255,0.45)', marginBottom:10 }}>DAFTAR ANGGOTA TIM</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:240, overflowY:'auto' }}>
                  {members.map((m, i) => (
                    <div key={m.id} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'8px 12px',
                      background:'rgba(0,245,255,0.04)',
                      border:'1px solid rgba(0,245,255,0.1)',
                      borderRadius:4,
                    }}>
                      <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11,
                        color:'rgba(0,245,255,0.4)', minWidth:20 }}>{i+1}</span>
                      {editingId === m.id ? (
                        <input
                          autoFocus
                          defaultValue={m.name}
                          onBlur={e => updateName(m.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && updateName(m.id, (e.target as HTMLInputElement).value)}
                          style={{
                            flex:1, background:'transparent',
                            border:'none', borderBottom:'1px solid rgba(0,245,255,0.4)',
                            color:'#fff', fontFamily:"'Share Tech Mono',monospace",
                            fontSize:13, outline:'none', padding:'2px 0',
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => setEditingId(m.id)}
                          style={{ flex:1, fontSize:13, color:'rgba(255,255,255,0.8)', cursor:'pointer',
                            letterSpacing:1 }}
                          title="Klik untuk edit"
                        >{m.name}</span>
                      )}
                      <button onClick={() => removeMember(m.id)} style={{
                        background:'none', border:'none', cursor:'pointer',
                        color:'rgba(255,0,110,0.5)', fontSize:16, lineHeight:1,
                        transition:'color 0.15s',
                      }} onMouseEnter={e=>(e.currentTarget.style.color='#ff006e')}
                         onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,0,110,0.5)')}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add member */}
              <div style={{ display:'flex', gap:8 }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addMember()}
                  placeholder="Nama anggota baru..."
                  style={{
                    flex:1, background:'rgba(0,245,255,0.05)',
                    border:'1px solid rgba(0,245,255,0.2)', borderRadius:4,
                    color:'#fff', fontFamily:"'Share Tech Mono',monospace",
                    fontSize:12, padding:'9px 12px', outline:'none',
                    letterSpacing:1,
                  }}
                />
                <button onClick={addMember} style={{
                  background:'rgba(0,245,255,0.1)',
                  border:'1px solid rgba(0,245,255,0.3)',
                  borderRadius:4, color:COLORS.cyan,
                  fontFamily:"'Orbitron',monospace", fontSize:11,
                  fontWeight:700, letterSpacing:2, padding:'0 16px',
                  cursor:'pointer', transition:'all 0.15s',
                }} onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,245,255,0.2)'}}
                   onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,245,255,0.1)'}}>
                  + TAMBAH
                </button>
              </div>

              {/* Gesture guide */}
              <div style={{
                padding:'12px 16px',
                background:'rgba(57,255,20,0.05)',
                border:'1px solid rgba(57,255,20,0.15)',
                borderRadius:4,
              }}>
                <div style={{ fontSize:9, letterSpacing:3, color:'rgba(57,255,20,0.6)', marginBottom:8 }}>KONTROL GESTURE</div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  {[
                    ['🙌 Angkat tangan', 'Mulai / Lanjutkan timer'],
                    ['👇 Turunkan tangan', 'Selesai, giliran berikutnya'],
                    ['⌨️  Keyboard SPACE', 'Mulai/Pause (backup)'],
                    ['⌨️  Keyboard →', 'Skip ke orang berikutnya'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display:'flex', gap:10, fontSize:11 }}>
                      <span style={{ color:'rgba(255,255,255,0.7)', minWidth:170 }}>{k}</span>
                      <span style={{ color:'rgba(255,255,255,0.4)' }}>— {v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nav buttons */}
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => router.push('/home')} style={{
                  background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:4, color:'rgba(255,255,255,0.35)',
                  fontFamily:"'Orbitron',monospace", fontSize:11,
                  letterSpacing:3, padding:'10px 16px', cursor:'pointer',
                  transition:'all 0.15s',
                }}>← MENU</button>
                <button
                  onClick={goTimer}
                  disabled={members.length === 0}
                  style={{
                    flex:1,
                    background: members.length > 0 ? COLORS.cyan : 'rgba(0,245,255,0.15)',
                    border:'none', borderRadius:4,
                    color: members.length > 0 ? '#020010' : 'rgba(0,245,255,0.3)',
                    fontFamily:"'Orbitron',monospace", fontSize:14,
                    fontWeight:900, letterSpacing:4,
                    padding:'14px', cursor: members.length > 0 ? 'pointer' : 'default',
                    boxShadow: members.length > 0 ? `0 0 20px ${COLORS.cyan}66` : 'none',
                    transition:'all 0.15s',
                  }}
                >▶ MULAI BRIEFING</button>
              </div>
            </div>
          </div>
        )}

        {/* ── TIMER SCREEN ── */}
        {screen === 'timer' && !allDone && (
          <>
            {/* Cam preview */}
            {camReady && (
              <div style={{
                position:'absolute', bottom:90, right:24,
                width:280, height:210,
                border:`2px solid rgba(0,245,255,0.35)`,
                borderRadius:6, overflow:'hidden', zIndex:20,
                boxShadow:'0 0 24px rgba(0,245,255,0.15)',
              }}>
                <video ref={camRef} autoPlay playsInline muted
                  style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', opacity:0.85 }} />
                <div style={{
                  position:'absolute', top:0, left:0, right:0,
                  padding:'6px 10px', display:'flex', alignItems:'center', gap:6,
                  background:'linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)',
                }}>
                  <span style={{ fontSize:9, letterSpacing:3, color:'rgba(0,245,255,0.75)' }}>LIVE CAM</span>
                  <div style={{
                    width:7, height:7, borderRadius:'50%', marginLeft:'auto',
                    background: hasHands ? '#39ff14' : 'rgba(255,255,255,0.15)',
                    boxShadow: hasHands ? '0 0 8px #39ff14' : 'none',
                  }} />
                </div>
                {/* Gesture zones indicator */}
                <div style={{
                  position:'absolute', bottom:0, left:0, right:0,
                  padding:'4px 8px',
                  background:'linear-gradient(to top,rgba(0,0,0,0.6),transparent)',
                  display:'flex', flexDirection:'column', gap:3,
                }}>
                  <div style={{ fontSize:8, color:'rgba(57,255,20,0.7)', letterSpacing:1 }}>
                    ↑ ZONA MULAI (atas 38%)
                  </div>
                  <div style={{ fontSize:8, color:'rgba(255,0,110,0.7)', letterSpacing:1 }}>
                    ↓ ZONA SELESAI (bawah 45%)
                  </div>
                </div>
              </div>
            )}

            {/* Members list — left side */}
            <div style={{
              position:'absolute', left:24, top:'50%',
              transform:'translateY(-50%)',
              zIndex:20, display:'flex', flexDirection:'column', gap:8,
              maxHeight:'70vh', overflowY:'auto',
            }}>
              {members.map((m, i) => {
                const isCurrent = i === currentIdx;
                const isDone    = m.done;
                return (
                  <div key={m.id} style={{
                    padding:'10px 16px',
                    background: isCurrent
                      ? 'rgba(0,245,255,0.1)'
                      : isDone ? 'rgba(57,255,20,0.05)' : 'rgba(0,0,0,0.4)',
                    border: `1px solid ${isCurrent ? COLORS.cyan : isDone ? 'rgba(57,255,20,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius:4,
                    display:'flex', alignItems:'center', gap:12,
                    minWidth:180,
                    transition:'all 0.3s',
                    boxShadow: isCurrent ? `0 0 16px rgba(0,245,255,0.25)` : 'none',
                  }}>
                    <span style={{ fontSize:12,
                      color: isCurrent ? COLORS.cyan : isDone ? '#39ff14' : 'rgba(255,255,255,0.2)',
                      fontFamily:"'Orbitron',monospace", fontWeight:700 }}>
                      {isDone ? '✓' : isCurrent ? '▶' : `${i+1}`}
                    </span>
                    <div>
                      <div style={{ fontSize:12, color: isCurrent ? '#fff' : isDone ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.4)',
                        letterSpacing:1 }}>{m.name}</div>
                      {isDone && (
                        <div style={{ fontSize:9, color:'rgba(57,255,20,0.6)', letterSpacing:2, marginTop:2 }}>
                          {String(Math.floor(m.timeUsed/60)).padStart(2,'0')}:{String(m.timeUsed%60).padStart(2,'0')} digunakan
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Center — current speaker + timer */}
            <div style={{
              position:'absolute', left:'50%', top:'50%',
              transform:'translate(-50%,-50%)',
              zIndex:10, textAlign:'center',
              display:'flex', flexDirection:'column', alignItems:'center', gap:12,
            }}>
              {/* Speaker name */}
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(18px,3vw,28px)',
                fontWeight:900, letterSpacing:4, color:'#fff',
                textShadow:'0 0 20px rgba(255,255,255,0.3)' }}>
                {currentMember?.name}
              </div>
              <div style={{ fontSize:9, letterSpacing:5, color:'rgba(255,255,255,0.3)',
                marginBottom:8 }}>SEDANG BICARA</div>

              {/* Big time */}
              <div style={{
                fontFamily:"'Orbitron',monospace",
                fontSize:'clamp(52px,10vw,110px)',
                fontWeight:900,
                color: isOvertime ? COLORS.pink : arcColor,
                textShadow: `0 0 30px ${isOvertime ? COLORS.pink : arcColor}, 0 0 70px ${isOvertime ? COLORS.pink : arcColor}55`,
                lineHeight:1,
                letterSpacing:4,
                animation: isOvertime ? 'none' : undefined,
              }}>
                {isOvertime ? `+${timeStr}` : timeStr}
              </div>

              {isOvertime && (
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:900,
                  letterSpacing:6, color:COLORS.pink,
                  textShadow:`0 0 12px ${COLORS.pink}`,
                  animation:'pulse 0.6s ease-in-out infinite alternate' }}>
                  ⚠ OVERTIME
                </div>
              )}

              {/* Progress bar (linear) */}
              <div style={{ width:'clamp(200px,30vw,320px)', marginTop:8 }}>
                <div style={{ height:6, background:'rgba(255,255,255,0.07)', borderRadius:3, overflow:'hidden',
                  border:'1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{
                    height:'100%', borderRadius:3,
                    width:`${pct}%`,
                    background:arcColor,
                    boxShadow:`0 0 10px ${arcColor}`,
                    transition:'width 0.5s linear, background 0.5s',
                  }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4,
                  fontSize:9, color:'rgba(255,255,255,0.2)', letterSpacing:2 }}>
                  <span>0:00</span><span>2:00</span>
                </div>
              </div>

              {/* Status */}
              <div style={{ fontSize:11, letterSpacing:4, marginTop:4,
                color: timerState === 'idle' ? COLORS.green
                     : timerState === 'paused' ? COLORS.yellow
                     : timerState === 'overtime' ? COLORS.pink
                     : COLORS.cyan }}>
                {timerState === 'idle'     && '● SIAP — ANGKAT TANGAN UNTUK MULAI'}
                {timerState === 'running'  && '● BERJALAN'}
                {timerState === 'paused'   && '⏸ DIJEDA — ANGKAT TANGAN LAGI'}
                {timerState === 'overtime' && '⚠ MELEBIHI BATAS — TURUNKAN TANGAN'}
              </div>
            </div>

            {/* Keyboard controls */}
            <div style={{
              position:'absolute', bottom:24, left:'50%', transform:'translateX(-50%)',
              zIndex:20, display:'flex', gap:10, alignItems:'center',
            }}>
              <KbdBtn label="SPACE" desc={timerState === 'running' ? 'Pause' : 'Mulai'}
                onClick={() => {
                  if (timerState === 'idle') startTimer();
                  else if (timerState === 'running') pauseTimer();
                  else if (timerState === 'paused') resumeTimer();
                }} />
              <KbdBtn label="→" desc="Skip/Selesai" onClick={nextSpeaker} />
              <KbdBtn label="R" desc="Reset" onClick={resetAll} />
            </div>

            {/* Gesture hint toast */}
            {gestureHint && (
              <div style={{
                position:'absolute', top:20, left:'50%', transform:'translateX(-50%)',
                zIndex:30, padding:'10px 24px',
                background:'rgba(0,245,255,0.15)', border:'1px solid rgba(0,245,255,0.4)',
                borderRadius:30, fontSize:13, letterSpacing:3, color:COLORS.cyan,
                textShadow:`0 0 10px ${COLORS.cyan}`,
                animation:'fadeIn 0.2s ease',
              }}>{gestureHint}</div>
            )}

            {/* Back */}
            <button onClick={resetAll} style={{
              position:'absolute', top:20, left:20, zIndex:20,
              background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:4, color:'rgba(255,255,255,0.3)',
              fontFamily:"'Orbitron',monospace", fontSize:10, letterSpacing:3,
              padding:'7px 14px', cursor:'pointer',
            }}>← KELUAR</button>

            {/* Wave indicator */}
            <div style={{ position:'absolute', top:20, right:20, zIndex:20, textAlign:'right' }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, letterSpacing:3,
                color:'rgba(0,245,255,0.5)' }}>
                {currentIdx + 1} / {members.length}
              </div>
              <div style={{ fontSize:9, letterSpacing:2, color:'rgba(255,255,255,0.2)', marginTop:2 }}>GILIRAN</div>
            </div>
          </>
        )}

        {/* ── SUMMARY SCREEN ── */}
        {screen === 'timer' && allDone && (
          <div style={{
            position:'absolute', inset:0, zIndex:30,
            display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(2,0,16,0.92)', backdropFilter:'blur(5px)',
          }}>
            <div style={{
              width:'min(500px,90vw)', padding:'40px 44px',
              background:'rgba(0,0,10,0.9)',
              border:'1px solid rgba(0,245,255,0.2)', borderRadius:8,
              display:'flex', flexDirection:'column', gap:22,
              boxShadow:'0 0 60px rgba(0,245,255,0.12)',
            }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:36 }}>✅</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:24, fontWeight:900,
                  letterSpacing:6, color:COLORS.cyan,
                  textShadow:`0 0 16px ${COLORS.cyan}`, marginTop:8 }}>BRIEFING SELESAI!</div>
                <div style={{ fontSize:9, letterSpacing:5, color:'rgba(0,245,255,0.4)', marginTop:4 }}>RINGKASAN WAKTU</div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(summary.length > 0 ? summary : members).map((m, i) => {
                  const over = m.timeUsed > STANDUP_DURATION;
                  const pct2 = Math.min(1, m.timeUsed / STANDUP_DURATION);
                  return (
                    <div key={m.id} style={{
                      padding:'10px 14px',
                      background:'rgba(0,245,255,0.04)',
                      border:'1px solid rgba(0,245,255,0.1)', borderRadius:4,
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,0.75)', letterSpacing:1 }}>
                          {i+1}. {m.name}
                        </span>
                        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:12,
                          color: over ? COLORS.pink : COLORS.green,
                          textShadow:`0 0 8px ${over ? COLORS.pink : COLORS.green}` }}>
                          {String(Math.floor(m.timeUsed/60)).padStart(2,'0')}:{String(m.timeUsed%60).padStart(2,'0')}
                          {over && ' ⚠'}
                        </span>
                      </div>
                      <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{
                          height:'100%', borderRadius:2,
                          width:`${pct2*100}%`,
                          background: over ? COLORS.pink : COLORS.green,
                          boxShadow:`0 0 6px ${over ? COLORS.pink : COLORS.green}`,
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={resetAll} style={{
                  flex:1, background:'transparent',
                  border:'1px solid rgba(0,245,255,0.2)', borderRadius:4,
                  color:COLORS.cyan, fontFamily:"'Orbitron',monospace",
                  fontSize:12, fontWeight:700, letterSpacing:4, padding:'12px',
                  cursor:'pointer',
                }}>↺ ULANGI</button>
                <button onClick={() => router.push('/home')} style={{
                  flex:1, background:COLORS.cyan, border:'none', borderRadius:4,
                  color:'#020010', fontFamily:"'Orbitron',monospace",
                  fontSize:12, fontWeight:900, letterSpacing:4, padding:'12px',
                  cursor:'pointer',
                  boxShadow:`0 0 20px ${COLORS.cyan}55`,
                }}>≡ MENU</button>
              </div>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {!camReady && (
          <div style={{
            position:'fixed', inset:0, zIndex:100,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16,
            background:'rgba(2,0,16,0.97)',
          }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:28, fontWeight:900,
              letterSpacing:8, color:COLORS.cyan, textShadow:`0 0 20px ${COLORS.cyan}` }}>
              STANDUP TIMER
            </div>
            <div style={{ fontSize:10, letterSpacing:5, color:'rgba(0,245,255,0.4)' }}>LOADING CAMERA...</div>
            <div style={{ width:280, height:4, background:'rgba(0,245,255,0.08)',
              border:'1px solid rgba(0,245,255,0.15)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', background:`linear-gradient(90deg,${COLORS.cyan},${COLORS.purple})`,
                width:`${loadProgress}%`, transition:'width 0.3s', boxShadow:`0 0 10px ${COLORS.cyan}` }} />
            </div>
            <div style={{ fontSize:11, fontFamily:"'Orbitron',monospace", color:'rgba(0,245,255,0.5)',
              letterSpacing:3 }}>{loadProgress}%</div>
          </div>
        )}

        <style>{`
          @keyframes pulse {
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 0.6; transform: scale(1.04); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>
      </div>
    </>
  );
}

// ─── Small keyboard button component ─────────────────────────────────────────
function KbdBtn({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', flexDirection:'column', alignItems:'center', gap:3,
      background:'rgba(255,255,255,0.04)',
      border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:4, padding:'8px 16px', cursor:'pointer',
      transition:'all 0.15s',
    }}
    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(0,245,255,0.35)'}}
    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.1)'}}>
      <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700,
        letterSpacing:2, color:'rgba(255,255,255,0.7)' }}>{label}</span>
      <span style={{ fontSize:9, letterSpacing:1, color:'rgba(255,255,255,0.3)' }}>{desc}</span>
    </button>
  );
}

// ─── Hand dot drawing ─────────────────────────────────────────────────────────
function drawHandDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number) {
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.08);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 14 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5 * pulse; ctx.shadowColor = color; ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.shadowBlur = 25;
  ctx.fill();
  ctx.restore();
}
