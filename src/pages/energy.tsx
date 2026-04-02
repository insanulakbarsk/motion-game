import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number }

interface PlayerScore {
  id: number;
  name: string;
  energy: number;       // 0–100
  motionTotal: number;  // accumulated motion delta
  color: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; color: string; size: number;
}

type Phase = 'loading' | 'setup' | 'countdown' | 'measuring' | 'result'

const MEASURE_DURATION = 10  // seconds of energy measurement
const PLAYER_COLORS = ['#00f5ff', '#ff006e', '#39ff14', '#ffe600', '#bf00ff', '#ff8c00']

const ENERGY_LABELS = [
  { min: 85, label: '🔥 ULTRA HYPER!',    sub: 'Tim hari ini LUAR BIASA!',        color: '#ff006e' },
  { min: 65, label: '⚡ HIGH ENERGY!',     sub: 'Siap tempur hari ini!',            color: '#ffe600' },
  { min: 45, label: '✅ GOOD VIBES',       sub: 'Energi cukup, mari mulai!',        color: '#39ff14' },
  { min: 25, label: '😐 CUKUP',           sub: 'Butuh kopi mungkin...',            color: '#00f5ff' },
  { min: 0,  label: '😴 BUTUH SEMANGAT',  sub: 'Yuk gerak dulu sebelum mulai!',   color: '#bf00ff' },
]

function getEnergyLabel(score: number) {
  return ENERGY_LABELS.find(e => score >= e.min) ?? ENERGY_LABELS[ENERGY_LABELS.length - 1]
}

// ─── Particle helpers ─────────────────────────────────────────────────────────
let pid2 = 0
function mkP(x: number, y: number, n: number, color: string): Particle[] {
  return Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2
    const s = Math.random() * 4 + 1
    return { x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, color, size: Math.random()*6+2 }
  })
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EnergyMeter() {
  const router = useRouter()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const camRef    = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

  const handsRef    = useRef<{ left: Vec2|null; right: Vec2|null }>({ left: null, right: null })
  const prevHands   = useRef<{ left: Vec2|null; right: Vec2|null }>({ left: null, right: null })
  const particlesRef = useRef<Particle[]>([])
  const phaseRef    = useRef<Phase>('loading')
  const timeLeftRef = useRef(MEASURE_DURATION)
  const playersRef  = useRef<PlayerScore[]>([])

  const [phase, setPhase]           = useState<Phase>('loading')
  const [loadPct, setLoadPct]       = useState(0)
  const [camReady, setCamReady]     = useState(false)
  const [players, setPlayers]       = useState<PlayerScore[]>([
    { id: 1, name: 'Anggota 1', energy: 0, motionTotal: 0, color: PLAYER_COLORS[0] },
    { id: 2, name: 'Anggota 2', energy: 0, motionTotal: 0, color: PLAYER_COLORS[1] },
    { id: 3, name: 'Anggota 3', energy: 0, motionTotal: 0, color: PLAYER_COLORS[2] },
  ])
  const [newName, setNewName]       = useState('')
  const [editingId, setEditingId]   = useState<number|null>(null)
  const [timeLeft, setTimeLeft]     = useState(MEASURE_DURATION)
  const [countdown, setCountdown]   = useState(3)
  const [teamEnergy, setTeamEnergy] = useState(0)
  const [hasHands, setHasHands]     = useState(false)
  const [liveMotion, setLiveMotion] = useState(0) // live motion power 0-100

  // Keep refs in sync
  playersRef.current = players

  // ── Canvas loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let t = 0

    function tick() {
      t++
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = W; canvas.height = H

      ctx.fillStyle = 'rgba(2,0,16,0.76)'
      ctx.fillRect(0, 0, W, H)

      const ph = phaseRef.current
      const hands = handsRef.current
      const pH = prevHands.current

      // ── Motion detection & scoring ──
      if (ph === 'measuring') {
        let delta = 0
        function d2(a: Vec2, b: Vec2) { return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2) }

        if (hands.left && pH.left) {
          const d = d2(hands.left, pH.left)
          if (d > 3) {
            delta += d
            particlesRef.current.push(...mkP(hands.left.x, hands.left.y, Math.min(Math.ceil(d/12), 5), '#00f5ff'))
          }
        }
        if (hands.right && pH.right) {
          const d = d2(hands.right, pH.right)
          if (d > 3) {
            delta += d
            particlesRef.current.push(...mkP(hands.right.x, hands.right.y, Math.min(Math.ceil(d/12), 5), '#ff006e'))
          }
        }

        if (delta > 0) {
          const gain = Math.min(delta * 0.18, 3)
          playersRef.current = playersRef.current.map(p => ({
            ...p,
            motionTotal: p.motionTotal + gain,
            energy: Math.min(100, p.energy + gain * 0.4),
          }))
          setPlayers([...playersRef.current])
          setLiveMotion(Math.min(100, delta * 1.5))
        } else {
          setLiveMotion(prev => Math.max(0, prev - 3))
        }
      }

      prevHands.current = {
        left:  hands.left  ? { ...hands.left }  : null,
        right: hands.right ? { ...hands.right } : null,
      }

      // ── Draw measuring phase visuals ──
      if (ph === 'measuring') {
        const cx = W / 2, cy = H / 2

        // Pulse ring based on live motion
        const motionPow = liveMotion / 100
        const ringR = 160 + motionPow * 80
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.1)
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, ringR * pulse, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(57,255,20,${0.15 + motionPow * 0.4})`
        ctx.lineWidth = 3 + motionPow * 8
        ctx.shadowColor = '#39ff14'
        ctx.shadowBlur = 20 + motionPow * 30
        ctx.stroke()
        ctx.restore()

        // Second inner ring
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, (ringR * 0.6) * (1 + 0.05 * Math.sin(t * 0.15 + 1)), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0,245,255,${0.1 + motionPow * 0.3})`
        ctx.lineWidth = 2
        ctx.shadowColor = '#00f5ff'
        ctx.shadowBlur = 14
        ctx.stroke()
        ctx.restore()

        // Hand markers
        if (hands.left) drawHandDot(ctx, hands.left.x,  hands.left.y,  '#00f5ff', t)
        if (hands.right) drawHandDot(ctx, hands.right.x, hands.right.y, '#ff006e', t)
        setHasHands(!!(hands.left || hands.right))
      }

      // ── Particles ──
      particlesRef.current = particlesRef.current
        .map(p => ({ ...p, x: p.x+p.vx, y: p.y+p.vy, vy: p.vy+0.08, vx: p.vx*0.97, life: p.life-0.024 }))
        .filter(p => p.life > 0)
        .slice(0, 200)

      for (const p of particlesRef.current) {
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2); ctx.fill()
        ctx.restore()
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [liveMotion])

  // ── MediaPipe ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false
    let rafId = 0
    let stream: MediaStream | null = null

    async function init() {
      try {
        setLoadPct(20)
        const { Hands } = await import('@mediapipe/hands')
        setLoadPct(60)
        if (destroyed) return

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        })

        const vid = videoRef.current!
        vid.srcObject = stream; vid.muted = true
        await vid.play().catch(() => {})

        if (camRef.current) {
          camRef.current.srcObject = stream; camRef.current.muted = true
          await camRef.current.play().catch(() => {})
        }

        setLoadPct(80)

        const hands = new Hands({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        })
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 })

        hands.onResults((res: any) => {
          if (destroyed) return
          const W = window.innerWidth, H = window.innerHeight
          let left: Vec2|null = null, right: Vec2|null = null
          if (res.multiHandLandmarks) {
            res.multiHandLandmarks.forEach((lm: any, i: number) => {
              const label = res.multiHandedness[i]?.label
              const x = (1 - lm[9].x) * W, y = lm[9].y * H
              if (label === 'Left') right = { x, y }; else left = { x, y }
            })
          }
          handsRef.current = { left, right }
        })

        let last = 0
        async function frame(ts: number) {
          if (destroyed) return
          if (ts - last > 80 && videoRef.current!.readyState >= 2) {
            last = ts
            await hands.send({ image: videoRef.current! }).catch(() => {})
          }
          rafId = requestAnimationFrame(frame)
        }
        rafId = requestAnimationFrame(frame)

        setLoadPct(100)
        setCamReady(true)
        phaseRef.current = 'setup'
        setPhase('setup')
      } catch (e) {
        console.error(e)
        setCamReady(true)
        phaseRef.current = 'setup'
        setPhase('setup')
      }
    }

    init()
    return () => {
      destroyed = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Re-attach cam preview on phase change
  useEffect(() => {
    const vid = videoRef.current, cam = camRef.current
    if (!cam || !vid?.srcObject) return
    if (cam.srcObject !== vid.srcObject) {
      cam.srcObject = vid.srcObject
      cam.play().catch(() => {})
    }
  }, [phase, camReady])

  // ── Start countdown then measure ────────────────────────────────────────────
  const startMeasure = useCallback(() => {
    // Reset all player energies
    setPlayers(prev => prev.map(p => ({ ...p, energy: 0, motionTotal: 0 })))
    setTeamEnergy(0)
    setLiveMotion(0)
    particlesRef.current = []

    phaseRef.current = 'countdown'
    setPhase('countdown')
    setCountdown(3)

    let c = 3
    const cd = setInterval(() => {
      c--
      setCountdown(c)
      if (c <= 0) {
        clearInterval(cd)
        phaseRef.current = 'measuring'
        setPhase('measuring')
        timeLeftRef.current = MEASURE_DURATION
        setTimeLeft(MEASURE_DURATION)

        // Measure timer
        const timer = setInterval(() => {
          timeLeftRef.current -= 1
          setTimeLeft(timeLeftRef.current)
          if (timeLeftRef.current <= 0) {
            clearInterval(timer)
            finishMeasure()
          }
        }, 1000)
      }
    }, 1000)
  }, [])

  const finishMeasure = useCallback(() => {
    const final = playersRef.current
    const avg = final.length > 0
      ? Math.round(final.reduce((s, p) => s + p.energy, 0) / final.length)
      : 0

    // Normalize each player 0-100 based on max motion
    const maxMotion = Math.max(...final.map(p => p.motionTotal), 1)
    const normalized = final.map(p => ({
      ...p,
      energy: Math.round((p.motionTotal / maxMotion) * 100),
    }))

    setPlayers(normalized)
    playersRef.current = normalized
    setTeamEnergy(Math.round(normalized.reduce((s, p) => s + p.energy, 0) / normalized.length))

    // Burst celebration
    particlesRef.current.push(...mkP(window.innerWidth/2, window.innerHeight/2, 60, '#ffe600'))
    particlesRef.current.push(...mkP(window.innerWidth/2, window.innerHeight/2, 40, '#39ff14'))
    particlesRef.current.push(...mkP(window.innerWidth/2, window.innerHeight/2, 30, '#ff006e'))

    phaseRef.current = 'result'
    setPhase('result')
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function addPlayer() {
    if (players.length >= 6) return
    const name = newName.trim() || `Anggota ${players.length + 1}`
    const newP: PlayerScore = {
      id: Date.now(), name, energy: 0, motionTotal: 0,
      color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
    }
    setPlayers(prev => [...prev, newP])
    setNewName('')
  }

  function removePlayer(id: number) {
    setPlayers(prev => prev.filter(p => p.id !== id))
  }

  function updateName(id: number, name: string) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p))
    setEditingId(null)
  }

  const energyLabel = getEnergyLabel(teamEnergy)
  const sortedPlayers = [...players].sort((a, b) => b.energy - a.energy)

  return (
    <>
      <Head>
        <title>TEAM ENERGY METER</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ position:'fixed', inset:0, background:'#020010', fontFamily:"'Share Tech Mono',monospace", overflow:'hidden' }}>

        {/* Grid bg */}
        <div style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
          backgroundImage:'linear-gradient(rgba(57,255,20,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,20,0.04) 1px,transparent 1px)',
          backgroundSize:'50px 50px' }} />

        {/* Scanlines */}
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
          background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)' }} />

        <video ref={videoRef} style={{ display:'none' }} autoPlay playsInline muted />
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:2 }} />

        {/* ── LOADING ── */}
        {phase === 'loading' && (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', gap:18, background:'rgba(2,0,16,0.97)' }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(28px,5vw,52px)',
              fontWeight:900, letterSpacing:8, color:'#39ff14',
              textShadow:'0 0 25px #39ff14, 0 0 60px rgba(57,255,20,0.4)',
              textAlign:'center', lineHeight:1.2 }}>
              TEAM<br/>ENERGY
            </div>
            <div style={{ fontSize:10, letterSpacing:6, color:'rgba(57,255,20,0.4)' }}>LOADING CAMERA...</div>
            <div style={{ width:280, height:4, background:'rgba(57,255,20,0.08)',
              border:'1px solid rgba(57,255,20,0.15)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', background:'linear-gradient(90deg,#39ff14,#00f5ff)',
                width:`${loadPct}%`, transition:'width 0.3s', boxShadow:'0 0 10px #39ff14' }} />
            </div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:'rgba(57,255,20,0.5)', letterSpacing:4 }}>{loadPct}%</div>
          </div>
        )}

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex',
            alignItems:'center', justifyContent:'center',
            background:'rgba(2,0,16,0.88)', backdropFilter:'blur(4px)' }}>

            <div style={{ width:'min(560px,92vw)', background:'rgba(0,5,0,0.9)',
              border:'1px solid rgba(57,255,20,0.2)', borderRadius:8, padding:'36px 40px',
              display:'flex', flexDirection:'column', gap:22,
              boxShadow:'0 0 60px rgba(57,255,20,0.1)' }}>

              {/* Header */}
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:28, fontWeight:900,
                  color:'#39ff14', letterSpacing:4, textShadow:'0 0 16px #39ff14' }}>
                  TEAM ENERGY METER
                </div>
                <div style={{ fontSize:9, letterSpacing:5, color:'rgba(57,255,20,0.4)', marginTop:4 }}>
                  MORNING BRIEFING · UKUR ENERGI TIM HARI INI
                </div>
              </div>

              <div style={{ height:1, background:'linear-gradient(90deg,rgba(57,255,20,0.2),transparent)' }} />

              {/* How it works */}
              <div style={{ padding:'12px 16px', background:'rgba(57,255,20,0.04)',
                border:'1px solid rgba(57,255,20,0.12)', borderRadius:4 }}>
                <div style={{ fontSize:9, letterSpacing:3, color:'rgba(57,255,20,0.6)', marginBottom:8 }}>CARA MAIN</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {[
                    ['⏱', `Semua bergerak selama ${MEASURE_DURATION} detik`],
                    ['🙌', 'Gerakkan tangan sebanyak-banyaknya di depan kamera'],
                    ['📊', 'Sistem mengukur intensitas gerakan tiap orang'],
                    ['🏆', 'Hasil energi tim muncul setelah waktu habis'],
                  ].map(([icon, text]) => (
                    <div key={icon as string} style={{ display:'flex', gap:10, fontSize:11,
                      color:'rgba(255,255,255,0.6)', alignItems:'flex-start' }}>
                      <span style={{ fontSize:14, flexShrink:0 }}>{icon}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Members */}
              <div>
                <div style={{ fontSize:9, letterSpacing:4, color:'rgba(57,255,20,0.45)', marginBottom:10 }}>
                  ANGGOTA TIM ({players.length}/6)
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:200, overflowY:'auto' }}>
                  {players.map((p, i) => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'8px 12px', background:'rgba(57,255,20,0.04)',
                      border:'1px solid rgba(57,255,20,0.1)', borderRadius:4 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:p.color,
                        boxShadow:`0 0 6px ${p.color}`, flexShrink:0 }} />
                      {editingId === p.id ? (
                        <input autoFocus defaultValue={p.name}
                          onBlur={e => updateName(p.id, e.target.value)}
                          onKeyDown={e => e.key==='Enter' && updateName(p.id,(e.target as HTMLInputElement).value)}
                          style={{ flex:1, background:'transparent', border:'none',
                            borderBottom:'1px solid rgba(57,255,20,0.4)',
                            color:'#fff', fontFamily:"'Share Tech Mono',monospace",
                            fontSize:13, outline:'none', padding:'2px 0' }} />
                      ) : (
                        <span onClick={() => setEditingId(p.id)}
                          style={{ flex:1, fontSize:13, color:'rgba(255,255,255,0.8)',
                            cursor:'pointer', letterSpacing:1 }}>{p.name}</span>
                      )}
                      <button onClick={() => removePlayer(p.id)}
                        style={{ background:'none', border:'none', cursor:'pointer',
                          color:'rgba(255,0,110,0.45)', fontSize:16, lineHeight:1,
                          transition:'color 0.15s' }}
                        onMouseEnter={e=>(e.currentTarget.style.color='#ff006e')}
                        onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,0,110,0.45)')}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add member */}
              {players.length < 6 && (
                <div style={{ display:'flex', gap:8 }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && addPlayer()}
                    placeholder="Nama anggota baru..."
                    style={{ flex:1, background:'rgba(57,255,20,0.05)',
                      border:'1px solid rgba(57,255,20,0.2)', borderRadius:4,
                      color:'#fff', fontFamily:"'Share Tech Mono',monospace",
                      fontSize:12, padding:'9px 12px', outline:'none', letterSpacing:1 }} />
                  <button onClick={addPlayer}
                    style={{ background:'rgba(57,255,20,0.1)',
                      border:'1px solid rgba(57,255,20,0.3)', borderRadius:4,
                      color:'#39ff14', fontFamily:"'Orbitron',monospace",
                      fontSize:11, fontWeight:700, letterSpacing:2, padding:'0 16px', cursor:'pointer' }}>
                    + ADD
                  </button>
                </div>
              )}

              {/* Cam preview small */}
              {camReady && (
                <div style={{ position:'relative', width:'100%', height:120, borderRadius:4, overflow:'hidden',
                  border:'1px solid rgba(57,255,20,0.2)' }}>
                  <video ref={camRef} autoPlay playsInline muted
                    style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', opacity:0.8 }} />
                  <div style={{ position:'absolute', top:6, left:8, fontSize:9,
                    letterSpacing:3, color:'rgba(57,255,20,0.7)' }}>PREVIEW KAMERA</div>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => router.push('/home')}
                  style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
                    borderRadius:4, color:'rgba(255,255,255,0.3)',
                    fontFamily:"'Orbitron',monospace", fontSize:10, letterSpacing:3,
                    padding:'10px 16px', cursor:'pointer' }}>← MENU</button>
                <button onClick={startMeasure} disabled={players.length === 0}
                  style={{ flex:1, background: players.length > 0 ? '#39ff14' : 'rgba(57,255,20,0.15)',
                    border:'none', borderRadius:4,
                    color: players.length > 0 ? '#020010' : 'rgba(57,255,20,0.3)',
                    fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:900,
                    letterSpacing:4, padding:'14px', cursor: players.length > 0 ? 'pointer' : 'default',
                    boxShadow: players.length > 0 ? '0 0 20px rgba(57,255,20,0.5)' : 'none',
                    transition:'all 0.15s' }}>
                  ⚡ UKUR ENERGI
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── COUNTDOWN ── */}
        {phase === 'countdown' && (
          <div style={{ position:'absolute', inset:0, zIndex:10,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16,
            background:'rgba(2,0,16,0.7)' }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:16, letterSpacing:8,
              color:'rgba(57,255,20,0.6)' }}>BERSIAP...</div>
            <div style={{ fontFamily:"'Orbitron',monospace",
              fontSize:'clamp(100px,20vw,200px)', fontWeight:900, lineHeight:1,
              color:'#39ff14',
              textShadow:'0 0 40px #39ff14, 0 0 100px rgba(57,255,20,0.6)',
              animation:'countPulse 0.9s ease-in-out infinite alternate' }}>
              {countdown}
            </div>
            <div style={{ fontSize:14, letterSpacing:5, color:'rgba(255,255,255,0.5)' }}>
              GERAKKAN TANGAN SAAT MULAI!
            </div>
            <style>{`@keyframes countPulse { from{transform:scale(1)} to{transform:scale(1.1)} }`}</style>
          </div>
        )}

        {/* ── MEASURING ── */}
        {phase === 'measuring' && (
          <>
            {/* Cam preview */}
            {camReady && (
              <div style={{ position:'absolute', bottom:20, right:20, width:220, height:165,
                border:'2px solid rgba(57,255,20,0.4)', borderRadius:6, overflow:'hidden', zIndex:20,
                boxShadow:'0 0 24px rgba(57,255,20,0.2)' }}>
                <video ref={camRef} autoPlay playsInline muted
                  style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', opacity:0.85 }} />
                <div style={{ position:'absolute', top:0, left:0, right:0, padding:'6px 10px',
                  background:'linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)',
                  display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:9, letterSpacing:3, color:'rgba(57,255,20,0.8)' }}>LIVE CAM</span>
                  <div style={{ width:7, height:7, borderRadius:'50%', marginLeft:'auto',
                    background: hasHands ? '#39ff14' : 'rgba(255,255,255,0.2)',
                    boxShadow: hasHands ? '0 0 8px #39ff14' : 'none' }} />
                </div>
              </div>
            )}

            {/* Timer center top */}
            <div style={{ position:'absolute', top:24, left:'50%', transform:'translateX(-50%)',
              zIndex:20, textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',monospace",
                fontSize:'clamp(48px,8vw,80px)', fontWeight:900,
                color: timeLeft <= 3 ? '#ff006e' : '#39ff14',
                textShadow:`0 0 24px ${timeLeft<=3?'#ff006e':'#39ff14'}`,
                letterSpacing:4, lineHeight:1,
                animation: timeLeft <= 3 ? 'countPulse 0.3s ease-in-out infinite alternate' : 'none' }}>
                {timeLeft}
              </div>
              <div style={{ fontSize:9, letterSpacing:4, color:'rgba(255,255,255,0.3)', marginTop:4 }}>DETIK</div>
            </div>

            {/* Center instruction */}
            <div style={{ position:'absolute', top:'50%', left:'50%',
              transform:'translate(-50%,-50%)', zIndex:5, textAlign:'center',
              pointerEvents:'none' }}>
              <div style={{ fontFamily:"'Orbitron',monospace",
                fontSize:'clamp(18px,3vw,28px)', fontWeight:900, letterSpacing:4,
                color:'rgba(57,255,20,0.55)',
                animation:'breathe 1.5s ease-in-out infinite alternate' }}>
                🙌 GERAK SEKARANG!
              </div>
              <style>{`
                @keyframes breathe { from{opacity:0.4;transform:scale(0.97)} to{opacity:1;transform:scale(1.03)} }
                @keyframes countPulse { from{transform:scale(1)} to{transform:scale(1.08)} }
              `}</style>
            </div>

            {/* Live motion power bar */}
            <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)',
              zIndex:20, width:'clamp(200px,40vw,400px)', display:'flex', flexDirection:'column', gap:6,
              alignItems:'center' }}>
              <div style={{ fontSize:9, letterSpacing:4, color:'rgba(57,255,20,0.5)' }}>MOTION POWER</div>
              <div style={{ width:'100%', height:8, background:'rgba(57,255,20,0.08)',
                border:'1px solid rgba(57,255,20,0.15)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4,
                  width:`${liveMotion}%`,
                  background:`linear-gradient(90deg,#39ff14,${liveMotion>70?'#ffe600':'#00f5ff'})`,
                  boxShadow:`0 0 12px #39ff14`,
                  transition:'width 0.15s ease' }} />
              </div>
            </div>

            {/* Player energy bars - right side */}
            <div style={{ position:'absolute', right:260, top:'50%', transform:'translateY(-50%)',
              zIndex:20, display:'flex', flexDirection:'column', gap:10, minWidth:180 }}>
              {players.map(p => (
                <div key={p.id} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:p.color,
                        boxShadow:`0 0 6px ${p.color}` }} />
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)', letterSpacing:1 }}>{p.name}</span>
                    </div>
                    <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11,
                      color:p.color, letterSpacing:1 }}>{Math.round(p.energy)}%</span>
                  </div>
                  <div style={{ height:5, background:'rgba(255,255,255,0.06)',
                    border:'1px solid rgba(255,255,255,0.08)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, background:p.color,
                      width:`${p.energy}%`, boxShadow:`0 0 6px ${p.color}`,
                      transition:'width 0.2s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && (
          <div style={{ position:'absolute', inset:0, zIndex:10,
            display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(2,0,16,0.88)', backdropFilter:'blur(5px)',
            animation:'fadeIn 0.5s ease' }}>

            <div style={{ width:'min(580px,92vw)', background:'rgba(0,5,0,0.92)',
              border:`1px solid ${energyLabel.color}33`, borderRadius:8,
              padding:'36px 40px', display:'flex', flexDirection:'column', gap:22,
              boxShadow:`0 0 80px ${energyLabel.color}15` }}>

              {/* Team score */}
              <div style={{ textAlign:'center', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:9, letterSpacing:5, color:'rgba(255,255,255,0.35)' }}>
                  ENERGI TIM HARI INI
                </div>

                {/* Big energy gauge */}
                <div style={{ position:'relative', margin:'8px auto', width:180, height:180 }}>
                  <svg width="180" height="180" style={{ transform:'rotate(-90deg)' }}>
                    <circle cx="90" cy="90" r="76" fill="none"
                      stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
                    <circle cx="90" cy="90" r="76" fill="none"
                      stroke={energyLabel.color} strokeWidth="14"
                      strokeDasharray={`${2 * Math.PI * 76}`}
                      strokeDashoffset={`${2 * Math.PI * 76 * (1 - teamEnergy / 100)}`}
                      strokeLinecap="round"
                      style={{ filter:`drop-shadow(0 0 8px ${energyLabel.color})`,
                        transition:'stroke-dashoffset 1s ease' }} />
                  </svg>
                  <div style={{ position:'absolute', inset:0, display:'flex',
                    flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:44, fontWeight:900,
                      color:energyLabel.color,
                      textShadow:`0 0 20px ${energyLabel.color}`,
                      lineHeight:1 }}>{teamEnergy}</div>
                    <div style={{ fontSize:9, letterSpacing:3, color:'rgba(255,255,255,0.4)' }}>/ 100</div>
                  </div>
                </div>

                <div style={{ fontFamily:"'Orbitron',monospace",
                  fontSize:'clamp(20px,3vw,28px)', fontWeight:900,
                  color:energyLabel.color, letterSpacing:3,
                  textShadow:`0 0 16px ${energyLabel.color}` }}>
                  {energyLabel.label}
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', letterSpacing:2 }}>
                  {energyLabel.sub}
                </div>
              </div>

              <div style={{ height:1, background:`linear-gradient(90deg,transparent,${energyLabel.color}33,transparent)` }} />

              {/* Individual results */}
              <div>
                <div style={{ fontSize:9, letterSpacing:4, color:'rgba(255,255,255,0.3)', marginBottom:12 }}>
                  ENERGI PER ANGGOTA
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {sortedPlayers.map((p, i) => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12,
                      padding:'10px 14px', background:'rgba(255,255,255,0.03)',
                      border:`1px solid ${p.color}22`, borderRadius:4 }}>

                      {/* Rank */}
                      <span style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700,
                        color: i===0?'#ffe600':i===1?'rgba(255,255,255,0.5)':i===2?'#ff8c00':'rgba(255,255,255,0.25)',
                        minWidth:22 }}>
                        {i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}
                      </span>

                      {/* Color dot + name */}
                      <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:p.color,
                          boxShadow:`0 0 6px ${p.color}`, flexShrink:0 }} />
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.8)', letterSpacing:1 }}>{p.name}</span>
                      </div>

                      {/* Bar + pct */}
                      <div style={{ display:'flex', alignItems:'center', gap:8, width:140 }}>
                        <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.06)',
                          borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:3, background:p.color,
                            width:`${p.energy}%`, boxShadow:`0 0 6px ${p.color}` }} />
                        </div>
                        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700,
                          color:p.color, minWidth:38, textAlign:'right' }}>{p.energy}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={startMeasure}
                  style={{ flex:1, background:'rgba(57,255,20,0.1)',
                    border:'1px solid rgba(57,255,20,0.3)', borderRadius:4,
                    color:'#39ff14', fontFamily:"'Orbitron',monospace",
                    fontSize:12, fontWeight:700, letterSpacing:4, padding:'13px', cursor:'pointer',
                    transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(57,255,20,0.2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(57,255,20,0.1)'}}>
                  ↺ ULANGI
                </button>
                <button onClick={() => { phaseRef.current='setup'; setPhase('setup') }}
                  style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
                    borderRadius:4, color:'rgba(255,255,255,0.4)',
                    fontFamily:"'Orbitron',monospace", fontSize:11, letterSpacing:3,
                    padding:'13px 20px', cursor:'pointer' }}>
                  ✎ EDIT TIM
                </button>
                <button onClick={() => router.push('/home')}
                  style={{ flex:1, background:'#39ff14', border:'none', borderRadius:4,
                    color:'#020010', fontFamily:"'Orbitron',monospace",
                    fontSize:12, fontWeight:900, letterSpacing:4, padding:'13px', cursor:'pointer',
                    boxShadow:'0 0 20px rgba(57,255,20,0.5)' }}>
                  ≡ MENU
                </button>
              </div>
            </div>

            <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Hand dot helper ──────────────────────────────────────────────────────────
function drawHandDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number) {
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.1)
  ctx.save()
  ctx.beginPath(); ctx.arc(x, y, 20 * pulse, 0, Math.PI * 2)
  ctx.strokeStyle = color; ctx.lineWidth = 2
  ctx.globalAlpha = 0.5 * pulse; ctx.shadowColor = color; ctx.shadowBlur = 18
  ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.globalAlpha = 0.9; ctx.shadowBlur = 26
  ctx.fill()
  ctx.restore()
}
