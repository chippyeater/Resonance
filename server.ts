import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import path from 'path';

import fs from 'fs';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const RHINO_COMPUTE_URL = process.env.RHINO_COMPUTE_URL || 'http://localhost:5000/grasshopper';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json());
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const allowAnyOrigin = ALLOWED_ORIGINS.length === 0;

  if (allowAnyOrigin && requestOrigin) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
  } else if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
  }

  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

// 读取 GH 文件（启动时加载一次）
const ghScript = fs.readFileSync('./desk.ghx').toString('base64');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const githubAi = new OpenAI({
  apiKey: process.env.GITHUB_TOKEN || '',
  baseURL: "https://models.inference.ai.azure.com"
});

const updateTableParamsFunction = {
  name: "update_table_params",
  description: "Update the 3D table parameters based on user request.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      length: { type: Type.NUMBER, description: "Table length in meters (0.6-2.2)" },
      width: { type: Type.NUMBER, description: "Table width in meters (0.6-1.0)" },
      round: { type: Type.NUMBER, description: "Tabletop corner radius in meters (0.01-0.5)" },
      leg_width: { type: Type.NUMBER, description: "Leg width in meters (0.01-0.2)" },
      frame_edge_thickness: { type: Type.NUMBER, description: "Frame edge thickness in meters (0.002-0.025)" },
      leg_height: { type: Type.NUMBER, description: "Leg height in meters (0.5-0.75)" },
      leg_open: { type: Type.NUMBER, description: "Leg opening distance in meters (0-0.22)" },
      leg_tiptoe_degree: { type: Type.NUMBER, description: "Leg tiptoe degree (0-1)" },
      frame_thickness: { type: Type.NUMBER, description: "Frame structural thickness in meters (0.01-0.1)" },
      lower_leg_depth: { type: Type.NUMBER, description: "Lower leg depth factor (0-1)" },
      upper_leg_depth: { type: Type.NUMBER, description: "Upper leg depth in meters (0.004-0.2)" },
      leg_belly_depth: { type: Type.NUMBER, description: "Leg belly depth in meters (0-0.19)" },
      frame_inset: { type: Type.NUMBER, description: "Frame inset in meters (0-0.1)" },
    },
  },
};

const githubUpdateTableParamsFunction = {
  type: "function" as const,
  function: {
    name: "update_table_params",
    description: "Update the 3D table parameters based on user request.",
    parameters: {
      type: "object",
      properties: {
        length: { type: "number", description: "Table length in meters (0.6-2.2)" },
        width: { type: "number", description: "Table width in meters (0.6-1.0)" },
        round: { type: "number", description: "Tabletop corner radius in meters (0.01-0.5)" },
        leg_width: { type: "number", description: "Leg width in meters (0.01-0.2)" },
        frame_edge_thickness: { type: "number", description: "Frame edge thickness in meters (0.002-0.025)" },
        leg_height: { type: "number", description: "Leg height in meters (0.5-0.75)" },
        leg_open: { type: "number", description: "Leg opening distance in meters (0-0.22)" },
        leg_tiptoe_degree: { type: "number", description: "Leg tiptoe degree (0-1)" },
        frame_thickness: { type: "number", description: "Frame structural thickness in meters (0.01-0.1)" },
        lower_leg_depth: { type: "number", description: "Lower leg depth factor (0-1)" },
        upper_leg_depth: { type: "number", description: "Upper leg depth in meters (0.004-0.2)" },
        leg_belly_depth: { type: "number", description: "Leg belly depth in meters (0-0.19)" },
        frame_inset: { type: "number", description: "Frame inset in meters (0-0.1)" },
      }
    }
  }
};

app.post('/api/compute', async (req, res) => {
  try {
    const {
      length = 1400,
      width = 650,
      round = 10,
      leg_width = 40,
      frame_edge_thickness = 19.549,
      leg_height = 730,
      leg_open = 0,
      leg_tiptoe_degree = 0,
      frame_thickness = 40,
      lower_leg_depth = 0.362,
      upper_leg_depth = 76.161,
      leg_belly_depth = 0,
      frame_inset = 12.262,
    } = req.body;

    const payload = {
      algo: ghScript,
      pointer: null,
      values: [
        { ParamName: 'RH_IN:length', InnerTree: { '0': [{ type: 'System.Double', data: length }] } },
        { ParamName: 'RH_IN:width', InnerTree: { '0': [{ type: 'System.Double', data: width }] } },
        { ParamName: 'RH_IN:round', InnerTree: { '0': [{ type: 'System.Double', data: round }] } },
        { ParamName: 'RH_IN:leg_width', InnerTree: { '0': [{ type: 'System.Double', data: leg_width }] } },
        { ParamName: 'RH_IN:frame_edge_thickness', InnerTree: { '0': [{ type: 'System.Double', data: frame_edge_thickness }] } },
        { ParamName: 'RH_IN:leg_height', InnerTree: { '0': [{ type: 'System.Double', data: leg_height }] } },
        { ParamName: 'RH_IN:leg_open', InnerTree: { '0': [{ type: 'System.Double', data: leg_open }] } },
        { ParamName: 'RH_IN:leg_tiptoe_degree', InnerTree: { '0': [{ type: 'System.Double', data: leg_tiptoe_degree }] } },
        { ParamName: 'RH_IN:frame_thickness', InnerTree: { '0': [{ type: 'System.Double', data: frame_thickness }] } },
        { ParamName: 'RH_IN:lower_leg_depth', InnerTree: { '0': [{ type: 'System.Double', data: lower_leg_depth }] } },
        { ParamName: 'RH_IN:upper_leg_depth', InnerTree: { '0': [{ type: 'System.Double', data: upper_leg_depth }] } },
        { ParamName: 'RH_IN:leg_belly_depth', InnerTree: { '0': [{ type: 'System.Double', data: leg_belly_depth }] } },
        { ParamName: 'RH_IN:frame_inset', InnerTree: { '0': [{ type: 'System.Double', data: frame_inset }] } },
      ]
    };

    const response = await fetch(RHINO_COMPUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    // 暂时先返回原始数据
    res.json(result);

  } catch (error) {
    console.error('Compute error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Rhino.Compute failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, currentParams } = req.body;
    
    // Extract the latest user message
    const lastMessage = messages[messages.length - 1];
    const previousMessages = messages.slice(0, -1);
    
    let replyText = "";
    let replyFunctionCalls: any[] | undefined = undefined;
    const systemInstruction = "You are an expert furniture designer for 'Resonance.', a premium brand specializing in modern furniture. Your tone is elegant, professional, and helpful. Keep your responses concise, maximum 2-3 sentences. You can update the table parameters using the 'update_table_params' function. Available parameters are: length, width, round, leg_width, frame_edge_thickness, leg_height, leg_open, leg_tiptoe_degree, frame_thickness, lower_leg_depth, upper_leg_depth, leg_belly_depth, and frame_inset. All dimensional values are in meters unless they are normalized factors. Always explain your design choices briefly.";

    try {
      // 1. Try Gemini first
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [
          ...previousMessages.map((m: any) => ({ role: m.role, parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: lastMessage.content + `\n\nCurrent Table Params: ${JSON.stringify(currentParams)}` }] }
        ],
        config: {
          maxOutputTokens: 150,
          systemInstruction,
          tools: [{ functionDeclarations: [updateTableParamsFunction] }],
        }
      });
      replyText = response.text || "";
      replyFunctionCalls = response.functionCalls;
    } catch (geminiError) {
      console.warn("Gemini failing, falling back to GitHub Copilot models...", geminiError);
      
      // 2. Fallback to GitHub Models (OpenAI SDK)
      const githubMessages: any[] = [
        { role: "system", content: systemInstruction },
        ...previousMessages.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
        { role: 'user', content: lastMessage.content + `\n\nCurrent Table Params: ${JSON.stringify(currentParams)}` }
      ];

      const completion = await githubAi.chat.completions.create({
        model: "gpt-4o", // using gpt-4o as a strong default on GitHub models
        messages: githubMessages,
        max_tokens: 150,
        tools: [githubUpdateTableParamsFunction],
      });

      const choice = completion.choices[0].message;
      replyText = choice.content || "";
      
      if (choice.tool_calls && choice.tool_calls.length > 0) {
        replyFunctionCalls = choice.tool_calls
          .filter(tc => tc.type === 'function')
          .map(tc => {
            const funcTc = tc as any;
            return {
              name: funcTc.function.name,
              args: JSON.parse(funcTc.function.arguments)
            };
          });
      }
    }

    res.json({
      text: replyText,
      functionCalls: replyFunctionCalls
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
    console.log(`Rhino.Compute target: ${RHINO_COMPUTE_URL}`);
    console.log(
      `CORS origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'dynamic reflect (development mode)'}`,
    );
  });
}

startServer();
