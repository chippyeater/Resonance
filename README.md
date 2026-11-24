# Resonance

An AI-assisted parametric furniture design prototype for customizing desks through natural language and direct parameter editing.

## Features

- Interactive 3D preview and adjustable desk dimensions and geometry.
- AI-assisted design generation and comparison of alternative configurations.
- Rhino / Grasshopper integration for precise geometry generation.
- Estimated pricing, structural complexity, and model export.

**Tech stack:** React, TypeScript, Vite, Three.js, Express, Rhino.Compute, Grasshopper, Gemini / GitHub Models.

## Run locally

Requires Node.js and a compatible Rhino.Compute / Grasshopper endpoint for precise geometry generation.

```bash
npm install
cp .env.example .env.local
```

Configure `RHINO_COMPUTE_URL`, `LLM_PROVIDER` and the corresponding API credentials in `.env.local`. Then run:

```bash
npm run dev
```

Open http://localhost:3000.

The frontend can be built with `npm run build`. Live AI and Rhino features require a running backend; static hosting alone is insufficient.

## Status

Design course prototype for exploring AI-assisted furniture customization. Cost and structural estimates are indicative, not engineering validation.
