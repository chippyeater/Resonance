import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import path from 'path';

import fs from 'fs';

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const RHINO_COMPUTE_URL = process.env.RHINO_COMPUTE_URL || 'http://localhost:5000/grasshopper';
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'github').toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const GITHUB_MODEL = process.env.GITHUB_MODEL || 'gpt-4o';
const GITHUB_IMAGE_MODEL = process.env.GITHUB_IMAGE_MODEL || 'gpt-image-1';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json({ limit: '25mb' }));
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

type ComputeRequestBody = {
  length?: number;
  width?: number;
  round?: number;
  leg_width?: number;
  frame_edge_thickness?: number;
  leg_height?: number;
  leg_open?: number;
  leg_tiptoe_degree?: number;
  frame_thickness?: number;
  lower_leg_depth?: number;
  upper_leg_depth?: number;
  leg_belly_depth?: number;
  frame_inset?: number;
};

type QuoteMaterial = 'blackwalnut' | 'rosewood';

const assertEnvValue = (value: string | undefined, label: string) => {
  if (!value) {
    throw new Error(`${label} is not configured.`);
  }
};

const getRhinoUnitScaleToMeters = (modelUnits: string | undefined) => {
  switch (modelUnits) {
    case 'Millimeters':
      return 0.001;
    case 'Centimeters':
      return 0.01;
    case 'Meters':
      return 1;
    case 'Inches':
      return 0.0254;
    case 'Feet':
      return 0.3048;
    default:
      return 1;
  }
};

const buildComputePayload = (body: ComputeRequestBody) => {
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
  } = body;

  return {
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
};

const requestRhinoCompute = async (body: ComputeRequestBody) => {
  const response = await fetch(RHINO_COMPUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildComputePayload(body))
  });

  if (!response.ok) {
    throw new Error(`Rhino.Compute failed with status ${response.status}`);
  }

  return await response.json();
};

const getOutputBranchItems = (result: any, outputName: string) => {
  const values = Array.isArray(result?.values) ? result.values : [];
  const output = values.find((value: any) => value?.ParamName === outputName);
  const tree = output?.InnerTree;
  if (!tree || typeof tree !== 'object') return [];
  return Object.values(tree).flatMap((branch) => (Array.isArray(branch) ? branch : []));
};

const parseNumericOutput = (result: any, outputName: string) => {
  const items = getOutputBranchItems(result, outputName);
  for (const item of items) {
    const raw = item?.data;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      try {
        const jsonParsed = JSON.parse(raw);
        if (typeof jsonParsed === 'number' && Number.isFinite(jsonParsed)) {
          return jsonParsed;
        }
      } catch {
        // Ignore non-JSON scalar strings.
      }
    }
  }
  throw new Error(`Compute output ${outputName} was not found or was not numeric.`);
};

const buildQuoteFromCompute = (result: any, material: QuoteMaterial, params: ComputeRequestBody) => {
  const unitScale = getRhinoUnitScaleToMeters(result?.modelunits);
  const areaScale = unitScale ** 2;
  const volumeScale = unitScale ** 3;

  const woodVolumeM3 = parseNumericOutput(result, 'RH_OUT:wood_volume') * volumeScale;
  const surfaceAreaM2 = parseNumericOutput(result, 'RH_OUT:surface_area_total') * areaScale;
  const boundingHeightM = parseNumericOutput(result, 'RH_OUT:bounding_height') * unitScale;
  const boundingLengthM = parseNumericOutput(result, 'RH_OUT:bounding_length') * unitScale;
  const boundingWidthM = parseNumericOutput(result, 'RH_OUT:bounding_width') * unitScale;

  const materialProfile =
    material === 'rosewood'
      ? {
          woodRate: 54000,
          finishRate: 950,
          packagingRate: 520,
          baseFabrication: 5200,
          defaultLeadDays: [18, 24] as const,
        }
      : {
          woodRate: 36000,
          finishRate: 760,
          packagingRate: 380,
          baseFabrication: 4200,
          defaultLeadDays: [14, 19] as const,
        };

  const materialWasteFactor = material === 'rosewood' ? 1.24 : 1.18;
  const footprintM2 = boundingLengthM * boundingWidthM;
  const shapeComplexity =
    1 +
    Math.min(0.24, (params.round ?? 0) / 80) +
    Math.min(0.12, ((params.leg_open ?? 0) / 220) * 0.12) +
    Math.min(0.14, (params.leg_tiptoe_degree ?? 0) * 0.14) +
    Math.min(0.1, ((params.leg_belly_depth ?? 0) / 120) * 0.1) +
    Math.min(0.08, ((params.frame_inset ?? 0) / 80) * 0.08);

  const materialCost = woodVolumeM3 * materialProfile.woodRate * materialWasteFactor;
  const finishCost = surfaceAreaM2 * materialProfile.finishRate;
  const structureCost = materialProfile.baseFabrication * Math.max(0.86, footprintM2 / 0.91);
  const logisticsCost =
    materialProfile.packagingRate +
    footprintM2 * 260 +
    Math.max(0, boundingHeightM - 0.72) * 850;
  const craftsmanshipCost = (materialCost + finishCost + structureCost) * (shapeComplexity - 1) * 0.38;

  const totalPrice = Math.round(materialCost + finishCost + structureCost + logisticsCost + craftsmanshipCost);
  const extraLeadDays = Math.max(0, Math.ceil((shapeComplexity - 1) * 12 + Math.max(0, footprintM2 - 0.95) * 4));
  const leadTimeMin = materialProfile.defaultLeadDays[0] + extraLeadDays;
  const leadTimeMax = materialProfile.defaultLeadDays[1] + extraLeadDays;

  return {
    totalPrice,
    currency: 'CNY',
    leadTime: `${leadTimeMin}-${leadTimeMax} DAYS`,
    metrics: {
      woodVolumeM3: Number(woodVolumeM3.toFixed(4)),
      surfaceAreaM2: Number(surfaceAreaM2.toFixed(3)),
      boundingLengthM: Number(boundingLengthM.toFixed(3)),
      boundingWidthM: Number(boundingWidthM.toFixed(3)),
      boundingHeightM: Number(boundingHeightM.toFixed(3)),
      shapeComplexity: Number(shapeComplexity.toFixed(3)),
    },
    breakdown: [
      { label: 'Base fabrication', value: Math.round(structureCost) },
      { label: 'Material volume', value: Math.round(materialCost) },
      { label: 'Surface finishing', value: Math.round(finishCost) },
      { label: 'Craft complexity', value: Math.round(craftsmanshipCost) },
      { label: 'Packing and logistics', value: Math.round(logisticsCost) },
    ],
    sourceOutputs: [
      'RH_OUT:wood_volume',
      'RH_OUT:surface_area_total',
      'RH_OUT:bounding_height',
      'RH_OUT:bounding_length',
      'RH_OUT:bounding_width',
    ],
    version: 'quote-v1',
  };
};

const parseDataUrlImage = (dataUrl: string, fallbackName: string) => {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL.');
  }

  const [, mimeType, base64Data] = match;
  const extension = mimeType.split('/')[1] || 'png';
  return new File([Buffer.from(base64Data, 'base64')], `${fallbackName}.${extension}`, { type: mimeType });
};

const buildShowroomPrompt = (material: QuoteMaterial) =>
  `Create one photorealistic interior visualization using the first image as the room scene and the second image as the furniture reference. Place the table naturally in the room with correct scale, believable perspective, grounded contact shadows, and premium editorial styling. Preserve the original architecture, lighting direction, and camera composition of the room image. The table should feel like a calm luxury bespoke furniture product in ${material === 'rosewood' ? 'rosewood' : 'black walnut'} with subtle realism, not an illustrated collage. Output a single polished staged image.`;

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

const runGeminiChat = async (previousMessages: any[], lastMessage: any, currentParams: any, systemInstruction: string) => {
  assertEnvValue(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY');
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
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

  const debugRaw = {
    text: response.text || "",
    functionCalls: response.functionCalls,
    candidates: (response as any).candidates,
    usageMetadata: (response as any).usageMetadata,
  };

  return {
    text: response.text || "",
    functionCalls: response.functionCalls,
    debugRaw,
  };
};

const runGithubChat = async (previousMessages: any[], lastMessage: any, currentParams: any, systemInstruction: string) => {
  assertEnvValue(process.env.GITHUB_TOKEN, 'GITHUB_TOKEN');
  const githubMessages: any[] = [
    { role: "system", content: systemInstruction },
    ...previousMessages.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
    { role: 'user', content: lastMessage.content + `\n\nCurrent Table Params: ${JSON.stringify(currentParams)}` }
  ];

  const completion = await githubAi.chat.completions.create({
    model: GITHUB_MODEL,
    messages: githubMessages,
    max_tokens: 150,
    tools: [githubUpdateTableParamsFunction],
  });

  const choice = completion.choices[0].message;
  const functionCalls = choice.tool_calls && choice.tool_calls.length > 0
    ? choice.tool_calls
        .filter(tc => tc.type === 'function')
        .map(tc => {
          const funcTc = tc as any;
          return {
            name: funcTc.function.name,
            args: JSON.parse(funcTc.function.arguments)
          };
        })
    : undefined;

  const debugRaw = {
    role: choice.role,
    content: choice.content,
    tool_calls: choice.tool_calls,
    finish_reason: completion.choices[0]?.finish_reason,
    usage: completion.usage,
  };

  return {
    text: choice.content || "",
    functionCalls,
    debugRaw,
  };
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
    // 暂时先返回原始数
    res.json(result);

  } catch (error) {
    console.error('Compute error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Rhino.Compute failed' });
  }
});

app.post('/api/quote', async (req, res) => {
  try {
    const material = (req.body?.material || 'blackwalnut') as QuoteMaterial;
    const computeResult = await requestRhinoCompute(req.body);
    const quote = buildQuoteFromCompute(computeResult, material, req.body);
    res.json(quote);
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Quote generation failed' });
  }
});
app.post('/api/showroom', async (req, res) => {
  try {
    assertEnvValue(process.env.GITHUB_TOKEN, 'GITHUB_TOKEN');

    const { roomImageDataUrl, tableImageDataUrl, material = 'blackwalnut' } = req.body;
    if (typeof roomImageDataUrl !== 'string' || typeof tableImageDataUrl !== 'string') {
      res.status(400).json({ error: 'roomImageDataUrl and tableImageDataUrl are required.' });
      return;
    }

    const response = await githubAi.images.edit({
      model: GITHUB_IMAGE_MODEL,
      image: [
        parseDataUrlImage(roomImageDataUrl, 'room-reference'),
        parseDataUrlImage(tableImageDataUrl, 'table-reference'),
      ],
      prompt: buildShowroomPrompt(material as QuoteMaterial),
      size: '1536x1024',
    });

    const imageBase64 = response.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error('Image model did not return b64_json output.');
    }

    res.json({ imageDataUrl: 'data:image/png;base64,' + imageBase64 });
  } catch (error) {
    console.error('Showroom error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Showroom generation failed' });
  }
});
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, currentParams } = req.body;
    
    // Extract the latest user message
    const lastMessage = messages[messages.length - 1];
    const previousMessages = messages.slice(0, -1);
    
    const systemInstruction = "You are an expert furniture designer for 'Resonance.', a premium brand specializing in modern furniture. Your tone is elegant, professional, and helpful. Keep your responses concise, maximum 2-3 sentences. You can update the table parameters using the 'update_table_params' function. Available parameters are: length, width, round, leg_width, frame_edge_thickness, leg_height, leg_open, leg_tiptoe_degree, frame_thickness, lower_leg_depth, upper_leg_depth, leg_belly_depth, and frame_inset. All dimensional values are in meters unless they are normalized factors. Always explain your design choices briefly. Always respond in Simplified Chinese unless the user explicitly requests another language.";
    let result;
    if (LLM_PROVIDER === 'gemini') {
      result = await runGeminiChat(previousMessages, lastMessage, currentParams, systemInstruction);
    } else if (LLM_PROVIDER === 'github') {
      result = await runGithubChat(previousMessages, lastMessage, currentParams, systemInstruction);
    } else if (LLM_PROVIDER === 'auto') {
      try {
        result = await runGithubChat(previousMessages, lastMessage, currentParams, systemInstruction);
      } catch (githubError) {
        console.warn("GitHub Models failing, falling back to Gemini...", githubError);
        result = await runGeminiChat(previousMessages, lastMessage, currentParams, systemInstruction);
      }
    } else {
      throw new Error(`Unsupported LLM_PROVIDER: ${LLM_PROVIDER}`);
    }

    res.json({
      text: result.text,
      functionCalls: result.functionCalls,
      debugRaw: result.debugRaw,
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
    console.log(`LLM provider: ${LLM_PROVIDER}`);
    console.log(
      `CORS origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'dynamic reflect (development mode)'}`,
    );
  });
}

startServer();





