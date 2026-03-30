# 🎮 MOTION GAME — AR Hand & Head Tracker

Cyberpunk-styled Next.js game that tracks your **hands** and **head** via webcam and responds with real-time particle explosions, neon trails, combo scoring, and a full HUD.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open browser
# → http://localhost:3000
# → Allow camera access when prompted
```

## 🎯 How to Play

1. Allow webcam access when the browser asks
2. Wait for the loading bar to finish (MediaPipe models download from CDN)
3. Show your hands and/or face in frame
4. **Move your hands and head** to generate particles and score points!
5. Build combos by keeping continuous movement
6. Fill the **MOTION POWER** bar to enter **HYPER MODE 🔥**

## ✨ Features

| Feature | Detail |
|---|---|
| **Hand Tracking** | Left & right hands tracked simultaneously (cyan + pink) |
| **Head Tracking** | Nose position tracked (yellow), 1.5× bonus power |
| **Particles** | Sparks, stars, rings, lines — burst on movement |
| **Motion Trails** | Glowing neon trails follow each tracked point |
| **Combo System** | Continuous motion builds score multiplier |
| **Motion Power Bar** | Intensity meter → HYPER MODE at 65%+ |
| **Score Popups** | Big moves trigger floating score notifications |
| **Live Cam Preview** | Mirrored webcam in bottom-right corner |
| **Cyberpunk HUD** | Full game HUD with Orbitron font, neon glows |

## 🏗 Tech Stack

- **Next.js 14** (Pages Router, TypeScript)
- **MediaPipe Hands** — real-time hand landmark detection
- **MediaPipe FaceMesh** — head/nose position tracking
- **MediaPipe Camera Utils** — webcam frame feeding
- **Canvas API** — custom 60fps game renderer
- **CSS Modules** — scoped cyberpunk styles
- **Google Fonts** — Orbitron + Share Tech Mono

## 💡 Tips

- **Good lighting** = better detection accuracy
- Move **both hands** simultaneously for double score
- **Head bobs** give 1.5× power bonus
- Keep combos going — the multiplier stacks fast!
- Works best on desktop/laptop with front-facing camera

## 📁 Project Structure

```
motion-game/
├── src/
│   ├── pages/
│   │   ├── _app.tsx       # App wrapper
│   │   ├── _document.tsx  # Font loading
│   │   └── index.tsx      # Main game page (all logic + canvas)
│   └── styles/
│       ├── globals.css    # Global styles, grid bg, scanlines
│       └── Game.module.css # HUD, loading screen, animations
├── package.json
├── next.config.js
└── tsconfig.json
```
