# Altivis Point Field Prototype

Standalone Three.js prototype for the new Altivis homepage hero direction:
a dark `#111111` background with a white perspective point field.

The current scene intentionally has no terrain rise or local deformation yet.
Those systems are exposed as future hooks in `src/pointFieldHero.js`.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL, usually:

```text
http://127.0.0.1:5173/
```

## Current Visual Rules

- Dark background: `#111111`
- White dot matrix
- Denser grid than the initial stage
- Perspective camera looking across a flat field
- No height/terrain deformation in this first version
- Subtle breathing through point size only
- Point sizes are capped so overlapping optical/radar effects do not overgrow
- Point and X glyph edges are hard-edged instead of softly feathered
- Three abstract optical devices represented by smaller black-filled white outline circles
- Three abstract radar devices represented by black-filled white outline squares
- FOV sector fill is hidden, but sector-driven point scaling remains active
- Radar coverage emits faster outward ripple bands that also scale point size
- Radar ripple amplitude fades down toward the coverage edge
- Dots outside the combined coverage area render as small grey X marks
- Dots inside the combined coverage area remain white dots
- Optical and radar ranges are drawn as one pale boolean-union outline, so overlaps merge visually

## Extension Hooks

The returned API from `createPointFieldHero()` already exposes:

- `setStyleState()`: reserved for color and point-size states
- `setDensityState()`: reserved for health/density changes
- `setDeformationState()`: reserved for local dents, pulses, and sensing-skin motion
- `setOpticDevices()`: reserved for future runtime device/data updates
- `dispose()`: cleanup for future embedding in a website route or component

The scene should stay deterministic so the same module can later drive both:

- desktop interactive WebGL
- mobile fallback video export
