import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const updateTableParamsFunction = {
  name: "update_table_params",
  description: "Update the 3D table parameters based on user request.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      length: { type: Type.NUMBER, description: "Length in meters (0.8-2.0)" },
      width: { type: Type.NUMBER, description: "Width in meters (0.4-1.0)" },
      height: { type: Type.NUMBER, description: "Height in meters (0.5-0.9)" },
      legFamily: { type: Type.STRING, enum: ["hoof", "straight", "curved"], description: "The style of the legs" },
      legSection: { type: Type.STRING, enum: ["square", "round"], description: "The cross-section of the legs" },
      legThickness: { type: Type.NUMBER, description: "Leg thickness scale (0-1)" },
      woodLightness: { type: Type.NUMBER, description: "Wood tone lightness (0.15-0.75)" },
      edgeCurve: { type: Type.NUMBER, description: "Tabletop edge rounding (0-1)" },
      legTaper: { type: Type.NUMBER, description: "Leg taper amount (0-1)" },
      hoofIntensity: { type: Type.NUMBER, description: "Hoof kick/flare intensity (0-1)" },
      legCurve: { type: Type.NUMBER, description: "Leg curve strength (0-1)" },
      curveBalance: { type: Type.NUMBER, description: "Leg curve balance/emphasis (0-1)" },
      frameHeight: { type: Type.NUMBER, description: "Total frame height scale (0-1)" },
      waistHeight: { type: Type.NUMBER, description: "Waist height ratio (0-1)" },
      waistInset: { type: Type.NUMBER, description: "Waist inset from edge (0-1)" },
      waistLineHeight: { type: Type.NUMBER, description: "Waist molding line height (0-1)" },
      waistLineDepth: { type: Type.NUMBER, description: "Waist molding line depth (0-1)" },
      apronHeight: { type: Type.NUMBER, description: "Apron height ratio (0-1)" },
      apronThick: { type: Type.NUMBER, description: "Apron thickness (0-1)" },
      archDepth: { type: Type.NUMBER, description: "Apron lower arch depth (-1 to 1)" },
      archShape: { type: Type.NUMBER, description: "Apron arch shape roundness (0-1)" },
      woodType: { type: Type.STRING, enum: ["black-walnut", "traditional-rosewood"], description: "The type of wood" },
      lustre: { type: Type.STRING, enum: ["matte-silk", "high-gloss"], description: "The finish of the wood" },
    },
  },
};

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, currentParams } = req.body;
    
    // Extract the latest user message
    const lastMessage = messages[messages.length - 1];
    const previousMessages = messages.slice(0, -1);
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [
        ...previousMessages.map((m: any) => ({ role: m.role, parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: lastMessage.content + `\n\nCurrent Table Params: ${JSON.stringify(currentParams)}` }] }
      ],
      config: {
        maxOutputTokens: 150,
        systemInstruction: "You are an expert furniture designer for 'Resonance.', a premium brand specializing in modern, organic furniture. Your tone is elegant, professional, and helpful. Keep your responses concise, maximum 2-3 sentences. You can update the table parameters using the 'update_table_params' function. Parameters include dimensions (in meters), leg styles (hoof, straight, curved), leg sections (square, round), and advanced details like waist height, apron arch depth, and wood tone. Always explain your design choices briefly.",
        tools: [{ functionDeclarations: [updateTableParamsFunction] }],
      }
    });

    res.json({
      text: response.text,
      functionCalls: response.functionCalls
    });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Failed to process chat request" });
  }
});

// Vite middleware setup
async function startServer() {
  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
