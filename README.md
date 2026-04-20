<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f4fa9677-2909-4b9c-9606-f69e90cf604d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## GitHub Pages frontend + local backend

If you want the frontend on GitHub Pages while the backend and Rhino/Grasshopper stay on your own computer, split the deployment like this:

1. Frontend:
   Build with `VITE_BASE_PATH="/Resonance/"` and `VITE_API_BASE_URL="https://your-public-backend.example.com"`.
2. Backend on your computer:
   Run `server.ts` locally, but expose it to the public internet with a tunnel or reverse proxy.
3. Rhino/Grasshopper on your computer:
   Keep Rhino.Compute reachable from the backend via `RHINO_COMPUTE_URL`.
4. CORS:
   Set `ALLOWED_ORIGINS="https://chippyeater.github.io"` so the published frontend can call your backend.

Example `.env.local` for this setup:

```env
GEMINI_API_KEY="..."
GITHUB_TOKEN="..."
VITE_BASE_PATH="/Resonance/"
VITE_API_BASE_URL="https://your-public-backend.example.com"
RHINO_COMPUTE_URL="http://localhost:5000/grasshopper"
ALLOWED_ORIGINS="https://chippyeater.github.io"
```

Important:

- `npm run dev` only serves your local machine. It does not power GitHub Pages.
- GitHub Pages can host only the frontend. Your Express API must stay reachable through a public URL.
- If your computer sleeps, shuts down, changes network, or the tunnel stops, the site loses live Rhino updates.
