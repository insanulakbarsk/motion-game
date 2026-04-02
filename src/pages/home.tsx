import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Home() {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const modes = [
    {
      id: 'monster',
      href: '/monster',
      icon: '👾',
      title: 'MONSTER SLAYER',
      sub: 'AR COMBAT GAME',
      desc: 'Hancurkan monster dengan gerakan tangan & kepala. Endless wave, boss setiap 5 wave.',
      color: '#ff006e',
      badge: 'GAME',
    },
    {
      id: 'standup',
      href: '/standup',
      icon: '⏱',
      title: 'STANDUP TIMER',
      sub: 'MORNING BRIEFING',
      desc: 'Timer 2 menit per orang. Angkat tangan = mulai, turunkan = stop. Perfect untuk daily standup.',
      color: '#00f5ff',
      badge: 'BRIEFING',
    },
    {
      id: 'energy',
      href: '/energy',
      icon: '⚡',
      title: 'TEAM ENERGY',
      sub: 'MORNING ENERGIZER',
      desc: 'Ukur energi tim hari ini! Semua gerak tangan selama 10 detik, lihat siapa paling semangat.',
      color: '#39ff14',
      badge: 'BRIEFING',
    },
  ];

  return (
    <>
      <Head>
        <title>LIBRARY INSANUL - AR MOTION HUB</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{
        position: 'fixed', inset: 0,
        background: '#020010',
        fontFamily: "'Share Tech Mono', monospace",
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 48,
        overflow: 'hidden',
      }}>
        {/* Grid bg */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(0,245,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.05) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
          pointerEvents: 'none',
        }} />

        {/* Scanlines */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        }} />

        {/* Title */}
        <div style={{ zIndex: 2, textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: 'clamp(28px, 5vw, 52px)',
            fontWeight: 900,
            letterSpacing: 14,
            color: '#00f5ff',
            textShadow: '0 0 20px #00f5ff, 0 0 60px rgba(0,245,255,0.4)',
          }}>LIBRARY INSANUL <br />AR MOTION HUB</div>
          <div style={{
            fontSize: 10,
            letterSpacing: 6,
            color: 'rgba(0,245,255,0.4)',
            marginTop: 8,
          }}>PILIH MODE</div>
        </div>

        {/* Mode Cards */}
        <div style={{
          zIndex: 2,
          display: 'flex',
          gap: 28,
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '0 24px',
        }}>
          {modes.map(m => (
            <div
              key={m.id}
              onClick={() => router.push(m.href)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: 280,
                padding: '32px 28px',
                border: `1.5px solid ${hovered === m.id ? m.color : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                background: hovered === m.id
                  ? m.color === '#ff006e' ? 'rgba(255,0,110,0.05)'
                  : m.color === '#39ff14' ? 'rgba(57,255,20,0.05)'
                  : 'rgba(0,245,255,0.05)'
                  : 'rgba(0,0,10,0.7)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                boxShadow: hovered === m.id ? `0 0 30px ${m.color}30, 0 0 60px ${m.color}10` : 'none',
                transform: hovered === m.id ? 'translateY(-4px)' : 'translateY(0)',
              }}
            >
              {/* Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: 9, letterSpacing: 3,
                  color: m.color, opacity: 0.7,
                  border: `1px solid ${m.color}44`,
                  padding: '2px 8px', borderRadius: 2,
                }}>{m.badge}</span>
                <span style={{ fontSize: 32 }}>{m.icon}</span>
              </div>

              {/* Title */}
              <div>
                <div style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 20, fontWeight: 900,
                  color: m.color,
                  textShadow: `0 0 12px ${m.color}88`,
                  letterSpacing: 2,
                  lineHeight: 1.2,
                }}>{m.title}</div>
                <div style={{
                  fontSize: 9, letterSpacing: 4,
                  color: `${m.color}66`,
                  marginTop: 4,
                }}>{m.sub}</div>
              </div>

              {/* Divider */}
              <div style={{
                height: 1,
                background: `linear-gradient(90deg, ${m.color}33, transparent)`,
              }} />

              {/* Desc */}
              <div style={{
                fontSize: 11, lineHeight: 1.6,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: 0.5,
              }}>{m.desc}</div>

              {/* CTA */}
              <div style={{
                marginTop: 4,
                fontSize: 11,
                color: m.color,
                letterSpacing: 3,
                opacity: hovered === m.id ? 1 : 0.4,
                transition: 'opacity 0.2s',
              }}>▶ BUKA MODE</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          zIndex: 2,
          fontSize: 9, letterSpacing: 3,
          color: 'rgba(255,255,255,0.15)',
        }}>AR MOTION HUB · REQUIRES WEBCAM ACCESS</div>
      </div>
    </>
  );
}
