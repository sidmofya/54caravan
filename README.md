# The 54 Caravan

A mobile-first cinematic portal experience.

## Stack

- **Next.js 16** — App Router
- **React 19**
- **Tailwind CSS v4**
- **TypeScript**

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  globals.css       # Global styles, cinematic palette, grain overlay
  layout.tsx        # Root layout with metadata
  page.tsx          # Entry route
components/
  NavBar.tsx        # Fixed top nav with mobile drawer
  HeroPortal.tsx    # Full-screen cinematic hero
lib/
  utils.ts          # cn() and formatDate() helpers
public/
  audio/            # Ambient sound files
  images/           # Photos and poster frames
  textures/         # Grain, dust, and overlay textures
  video/            # Background video (hero.mp4)
```

## Deployment

Deploy to [Vercel](https://vercel.com) with zero config — Next.js is auto-detected.

For the hero background video, place `hero.mp4` in `public/video/` and a
`hero-poster.jpg` in `public/images/` before deploying to production.

## Design Language

- **Palette**: near-black `#0a0905`, warm amber `#c8924a`, dust `#8c7355`
- **Type**: serif (Georgia) — unhurried, analog
- **Motion**: slow drift, fade-in — cinematic not snappy
- **Grain overlay**: SVG turbulence, always on, 35% opacity
