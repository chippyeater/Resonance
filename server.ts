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
const GH_SCRIPT_PATH = path.join(process.cwd(), 'desk.ghx');
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

// 璇诲彇 GHX 鏂囦欢锛堝惎鍔ㄦ椂鍔犺浇涓€娆★級
if (!fs.existsSync(GH_SCRIPT_PATH)) {
  throw new Error(`GHX file not found: ${GH_SCRIPT_PATH}`);
}
const ghScript = fs.readFileSync(GH_SCRIPT_PATH).toString('base64');

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
type StructureLevel = 'low' | 'medium' | 'high';
type StructureAssessment = {
  structure_level: StructureLevel;
  stability_score: number;
  risk_tags: string[];
  recommendations: string[];
};
type DesignParams = {
  length: number;
  width: number;
  round: number;
  leg_width: number;
  frame_edge_thickness: number;
  leg_height: number;
  leg_open: number;
  leg_tiptoe_degree: number;
  frame_thickness: number;
  lower_leg_depth: number;
  upper_leg_depth: number;
  leg_belly_depth: number;
  frame_inset: number;
};
type VariantScores = {
  lightness: number;
  stability: number;
  cost_efficiency: number;
  premium_feel: number;
};
type VariantSpec = {
  id: string;
  name: string;
  consumer_summary: string;
  params: DesignParams;
};
type VariantGenerationResponse = {
  message: string;
  variants: Array<{
    id: string;
    name: string;
    consumer_summary: string;
    params: Partial<DesignParams>;
  }>;
};
// 聊天接口按单方案/多方案两种模式返回，前端据此走不同展示分支。
type ChatApiResponse =
  | {
      mode: 'chat';
      text: string;
      functionCalls?: any[];
      debugRaw?: any;
    }
  | {
      // 多方案模式直接带回已求解的候选方案，避免前端再补一次请求。
      mode: 'variants';
      text: string;
      variants: Array<{
        id: string;
        name: string;
        consumer_summary: string;
        params: DesignParams;
        success: boolean;
        result?: any;
        error?: string;
        scores: VariantScores;
      }>;
      functionCalls?: any[];
      debugRaw?: any;
    };

const assertEnvValue = (value: string | undefined, label: string) => {
  if (!value) {
    throw new Error(`${label} is not configured.`);
  }
};

const DEFAULT_DESIGN_PARAMS: DesignParams = {
  length: 1.4,
  width: 0.65,
  round: 0.01,
  leg_width: 0.04,
  frame_edge_thickness: 0.019549,
  leg_height: 0.73,
  leg_open: 0,
  leg_tiptoe_degree: 0,
  frame_thickness: 0.04,
  lower_leg_depth: 0.362,
  upper_leg_depth: 0.076161,
  leg_belly_depth: 0,
  frame_inset: 0.012262,
};

const DESIGN_PARAM_LIMITS: Record<keyof DesignParams, { min: number; max: number }> = {
  length: { min: 0.6, max: 2.2 },
  width: { min: 0.6, max: 1.4 },
  round: { min: 0.001, max: 0.5 },
  leg_width: { min: 0.01, max: 0.2 },
  frame_edge_thickness: { min: 0.002, max: 0.025 },
  leg_height: { min: 0.5, max: 0.75 },
  leg_open: { min: 0, max: 0.22 },
  leg_tiptoe_degree: { min: 0, max: 1 },
  frame_thickness: { min: 0.01, max: 0.1 },
  lower_leg_depth: { min: 0, max: 1 },
  upper_leg_depth: { min: 0.004, max: 0.2 },
  leg_belly_depth: { min: 0, max: 0.19 },
  frame_inset: { min: 0, max: 0.2 },
};

const DEFAULT_VARIANT_TEMPLATES = [
  { id: 'option-1', name: '方案 1', consumer_summary: '这是基于当前需求整理出的第一种方向。' },
  { id: 'option-2', name: '方案 2', consumer_summary: '这是基于当前需求整理出的第二种方向。' },
  { id: 'option-3', name: '方案 3', consumer_summary: '这是基于当前需求整理出的第三种方向。' },
  { id: 'option-4', name: '方案 4', consumer_summary: '这是基于当前需求整理出的第四种方向。' },
] as const;

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
    length,
    width,
    round,
    leg_width,
    frame_edge_thickness,
    leg_height,
    leg_open,
    leg_tiptoe_degree,
    frame_thickness,
    lower_leg_depth,
    upper_leg_depth,
    leg_belly_depth,
    frame_inset,
  };
};

type RhinoComputeResult = {
  success?: boolean;
  error?: string;
  warnings?: string[];
  modelunits?: string;
  values?: any[];
  metadata?: Record<string, unknown>;
};

const requestRhinoCompute = async (body: ComputeRequestBody): Promise<RhinoComputeResult> => {
  const payload = buildComputePayload(body);

  const response = await fetch(RHINO_COMPUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      algo: ghScript,
      pointer: null,
      values: [
        { ParamName: 'RH_IN:length', InnerTree: { '0': [{ type: 'System.Double', data: payload.length }] } },
        { ParamName: 'RH_IN:width', InnerTree: { '0': [{ type: 'System.Double', data: payload.width }] } },
        { ParamName: 'RH_IN:round', InnerTree: { '0': [{ type: 'System.Double', data: payload.round }] } },
        { ParamName: 'RH_IN:leg_width', InnerTree: { '0': [{ type: 'System.Double', data: payload.leg_width }] } },
        { ParamName: 'RH_IN:frame_edge_thickness', InnerTree: { '0': [{ type: 'System.Double', data: payload.frame_edge_thickness }] } },
        { ParamName: 'RH_IN:leg_height', InnerTree: { '0': [{ type: 'System.Double', data: payload.leg_height }] } },
        { ParamName: 'RH_IN:leg_open', InnerTree: { '0': [{ type: 'System.Double', data: payload.leg_open }] } },
        { ParamName: 'RH_IN:leg_tiptoe_degree', InnerTree: { '0': [{ type: 'System.Double', data: payload.leg_tiptoe_degree }] } },
        { ParamName: 'RH_IN:frame_thickness', InnerTree: { '0': [{ type: 'System.Double', data: payload.frame_thickness }] } },
        { ParamName: 'RH_IN:lower_leg_depth', InnerTree: { '0': [{ type: 'System.Double', data: payload.lower_leg_depth }] } },
        { ParamName: 'RH_IN:upper_leg_depth', InnerTree: { '0': [{ type: 'System.Double', data: payload.upper_leg_depth }] } },
        { ParamName: 'RH_IN:leg_belly_depth', InnerTree: { '0': [{ type: 'System.Double', data: payload.leg_belly_depth }] } },
        { ParamName: 'RH_IN:frame_inset', InnerTree: { '0': [{ type: 'System.Double', data: payload.frame_inset }] } },
      ],
    }),
  });

  const result = (await response.json()) as RhinoComputeResult;
  if (!response.ok) {
    throw new Error(result?.error || `Rhino.Compute request failed with status ${response.status}`);
  }
  if (result?.success === false) {
    throw new Error(result.error || 'Rhino.Compute reported failure.');
  }

  return result;
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

const clampDesignParams = (params: Partial<DesignParams>, base: DesignParams = DEFAULT_DESIGN_PARAMS): DesignParams => {
  const merged = { ...base, ...params };
  const output = {} as DesignParams;
  (Object.keys(DEFAULT_DESIGN_PARAMS) as Array<keyof DesignParams>).forEach((key) => {
    const nextValue = Number(merged[key]);
    const safeValue = Number.isFinite(nextValue) ? nextValue : base[key];
    output[key] = clamp(safeValue, DESIGN_PARAM_LIMITS[key].min, DESIGN_PARAM_LIMITS[key].max);
  });
  return output;
};

const designParamsToComputeBody = (params: DesignParams): ComputeRequestBody => ({
  length: params.length * 1000,
  width: params.width * 1000,
  round: params.round * 1000,
  leg_width: params.leg_width * 1000,
  frame_edge_thickness: params.frame_edge_thickness * 1000,
  leg_height: params.leg_height * 1000,
  leg_open: params.leg_open * 1000,
  leg_tiptoe_degree: params.leg_tiptoe_degree,
  frame_thickness: params.frame_thickness * 1000,
  lower_leg_depth: params.lower_leg_depth,
  upper_leg_depth: params.upper_leg_depth * 1000,
  leg_belly_depth: params.leg_belly_depth * 1000,
  frame_inset: params.frame_inset * 1000,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildStructureAssessment = (result: any, params: ComputeRequestBody): StructureAssessment => {
  const unitScale = getRhinoUnitScaleToMeters(result?.modelunits);
  const boundingLengthM = parseNumericOutput(result, 'RH_OUT:bounding_length') * unitScale;
  const boundingWidthM = parseNumericOutput(result, 'RH_OUT:bounding_width') * unitScale;

  const length = params.length ?? 1400;
  const width = params.width ?? 650;
  const legOpen = params.leg_open ?? 0;
  const legHeight = params.leg_height ?? 730;
  const legWidth = params.leg_width ?? 40;
  const frameThickness = params.frame_thickness ?? 40;

  const span_ratio = length / Math.max(width, 1);
  const footprint_ratio = legOpen / Math.max(length, 1);
  const leg_slenderness = legHeight / Math.max(legWidth, 1);
  const frame_support_score = frameThickness / Math.max(length, 1);
  const max_size_proximity = clamp((length - 1800) / 400, 0, 1);

  let stabilityScore = 92;
  const riskTags = new Set<string>();
  const recommendations: string[] = [];

  if (span_ratio >= 2.9) {
    stabilityScore -= 16;
    riskTags.add('large_span');
    recommendations.push('当前长宽比偏大，建议增加 frame_thickness 或 leg_width，避免桌面跨距过长。');
  } else if (span_ratio >= 2.55) {
    stabilityScore -= 8;
    riskTags.add('large_span');
    recommendations.push('当前桌面跨度已经进入偏大区间，建议配合更厚框架提升支撑感。');
  }

  if (leg_slenderness >= 18) {
    stabilityScore -= 18;
    riskTags.add('thin_legs');
    recommendations.push('当前腿部偏细，适合餐桌场景，不建议作为长期高频工作桌。');
  } else if (leg_slenderness >= 15.5) {
    stabilityScore -= 10;
    riskTags.add('thin_legs');
    recommendations.push('腿部细长比例偏高，建议增加 leg_width 以提升横向稳定性。');
  }

  if (frame_support_score <= 0.022) {
    stabilityScore -= 16;
    riskTags.add('weak_frame_support');
    recommendations.push('框架相对桌长偏薄，建议提高 frame_thickness 以增强中段支撑。');
  } else if (frame_support_score <= 0.028) {
    stabilityScore -= 8;
    riskTags.add('weak_frame_support');
    recommendations.push('框架支撑略轻，若用于工作桌可适度增加 frame_thickness。');
  } else if (frame_support_score >= 0.036) {
    stabilityScore += 4;
  }

  if (length >= 1900 && footprint_ratio <= 0.03) {
    stabilityScore -= 8;
    riskTags.add('narrow_footprint');
    recommendations.push('桌长较大但腿部展开较保守，建议适度增加 leg_open 改善落地稳定感。');
  } else if (footprint_ratio >= 0.05 && footprint_ratio <= 0.12) {
    stabilityScore += 3;
  }

  if (max_size_proximity > 0) {
    stabilityScore -= Math.round(max_size_proximity * 18);
    if (max_size_proximity >= 0.35) {
      riskTags.add('max_size_risk');
      recommendations.push('当前长度接近 2200，建议同步增加 frame_thickness 或 leg_width，控制大尺寸风险。');
    }
  }

  if (boundingLengthM >= 2.0 || boundingWidthM >= 0.9) {
    stabilityScore -= 6;
    riskTags.add('oversized_top');
    recommendations.push('整体外廓已经进入偏大区间，建议确认使用场景是否需要更强结构冗余。');
  }

  stabilityScore = clamp(Math.round(stabilityScore), 35, 96);

  let structureLevel: StructureLevel = 'low';
  if (stabilityScore >= 80) {
    structureLevel = 'high';
  } else if (stabilityScore >= 60) {
    structureLevel = 'medium';
  }

  if (recommendations.length === 0) {
    recommendations.push('当前结构比例较均衡，可作为常规使用场景的稳定配置继续深化。');
  }

  return {
    structure_level: structureLevel,
    stability_score: stabilityScore,
    risk_tags: Array.from(riskTags),
    recommendations: recommendations.slice(0, 4),
  };
};

const scoreVariant = (params: DesignParams): VariantScores => {
  const sizePenalty = clamp(((params.length - 1.6) / 0.6) * 12 + ((params.width - 0.8) / 0.4) * 8, 0, 18);
  const lightness =
    84
    - clamp(((params.leg_width - 0.04) / 0.12) * 34, 0, 34)
    - clamp(((params.frame_thickness - 0.04) / 0.06) * 28, 0, 28)
    + clamp((params.leg_open / 0.22) * 10, 0, 10)
    - sizePenalty;

  let stability =
    58
    + clamp(((params.leg_width - 0.04) / 0.12) * 24, 0, 24)
    + clamp(((params.frame_thickness - 0.04) / 0.06) * 24, 0, 24)
    + (params.leg_open >= 0.03 && params.leg_open <= 0.12 ? 8 : params.leg_open > 0.12 ? 3 : 0);
  if (params.length >= 1.9 && params.leg_width <= 0.045) {
    stability -= 14;
  }

  const costEfficiency =
    88
    - (params.width <= 0.8 ? 0 : clamp(((params.width - 0.8) / 0.6) * 18, 0, 18))
    - (params.length <= 1.8 ? 0 : clamp(((params.length - 1.8) / 0.4) * 16, 0, 16))
    - clamp(((params.round - 0.035) / 0.2) * 12, 0, 12)
    - clamp(((params.frame_edge_thickness - 0.018) / 0.007) * 10, 0, 10);

  const premiumFeel =
    48
    + (params.round >= 0.02 && params.round <= 0.08 ? 16 : params.round > 0.08 ? 10 : 4)
    + (params.frame_edge_thickness >= 0.012 && params.frame_edge_thickness <= 0.02 ? 14 : 6)
    + Math.max(0, 16 - Math.abs(params.length - 1.8) * 18 - Math.abs(params.width - 0.8) * 36);

  return {
    lightness: clamp(Math.round(lightness), 0, 100),
    stability: clamp(Math.round(stability), 0, 100),
    cost_efficiency: clamp(Math.round(costEfficiency), 0, 100),
    premium_feel: clamp(Math.round(premiumFeel), 0, 100),
  };
};

const solveTableByComputeParams = async (body: ComputeRequestBody, material: QuoteMaterial = 'blackwalnut') => {
  const result = await requestRhinoCompute(body);
  return {
    ...result,
    quote: buildQuoteFromCompute(result, material, body),
    structureAssessment: buildStructureAssessment(result, body),
  };
};

const solveTableByParams = async (params: DesignParams, material: QuoteMaterial = 'blackwalnut') => {
  return await solveTableByComputeParams(designParamsToComputeBody(params), material);
};

const toVariantSlug = (value: string, fallback: string) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const buildRuleBasedVariantSpecs = (prompt: string, baseParams: DesignParams, variantCount: number): VariantSpec[] => {
  const text = prompt.toLowerCase();
  const wantsMeeting = /浼氳|闁嬩細|浼氬|澶氫汉|meeting/.test(text);
  const wantsLight = /杞粅绗ㄩ噸|杞荤泩|绾ょ粏|airy|light/.test(text);
  const wantsStable = /绋硘绋冲畾|宸ヤ綔|浼氳|澶氫汉|stable/.test(text);

  const balanced = clampDesignParams({
    width: wantsMeeting ? Math.max(baseParams.width, 0.78) : baseParams.width,
    frame_thickness: wantsStable ? Math.max(baseParams.frame_thickness, 0.045) : baseParams.frame_thickness,
    leg_width: wantsStable ? Math.max(baseParams.leg_width, 0.045) : baseParams.leg_width,
    round: wantsLight ? Math.max(baseParams.round, 0.018) : baseParams.round,
  }, baseParams);

  const lightweight = clampDesignParams({
    length: wantsMeeting ? Math.min(baseParams.length, 1.9) : baseParams.length,
    width: Math.max(0.68, Math.min(baseParams.width, wantsMeeting ? 0.8 : 0.75)),
    round: Math.max(baseParams.round, 0.025),
    leg_width: Math.max(0.03, baseParams.leg_width - 0.008),
    frame_edge_thickness: Math.max(0.012, baseParams.frame_edge_thickness - 0.002),
    frame_thickness: Math.max(0.028, baseParams.frame_thickness - 0.008),
    leg_open: clamp(baseParams.leg_open + 0.03, 0, 0.12),
    frame_inset: Math.max(baseParams.frame_inset, 0.018),
  }, baseParams);

  const stable = clampDesignParams({
    length: wantsMeeting ? Math.max(baseParams.length, 1.8) : Math.max(baseParams.length, 1.6),
    width: Math.max(baseParams.width, wantsMeeting ? 0.82 : 0.74),
    leg_width: Math.max(baseParams.leg_width, 0.05),
    frame_edge_thickness: Math.max(baseParams.frame_edge_thickness, 0.018),
    frame_thickness: Math.max(baseParams.frame_thickness, 0.05),
    leg_open: wantsLight ? clamp(baseParams.leg_open + 0.02, 0, 0.1) : clamp(baseParams.leg_open + 0.012, 0, 0.08),
    round: Math.max(baseParams.round, 0.012),
  }, baseParams);

  const compact = clampDesignParams({
    length: Math.min(baseParams.length, 1.5),
    width: Math.min(baseParams.width, 0.72),
    round: Math.max(baseParams.round, 0.02),
    leg_width: Math.max(0.038, baseParams.leg_width),
    frame_thickness: Math.max(0.035, baseParams.frame_thickness),
  }, baseParams);

  const presets = [balanced, lightweight, stable, compact];
  return DEFAULT_VARIANT_TEMPLATES.slice(0, variantCount).map((template, index) => ({
    id: template.id,
    name: template.name,
    consumer_summary: template.consumer_summary,
    params: presets[index],
  }));
};

const sanitizeJsonText = (raw: string) => raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

const parseVariantGenerationResponse = (raw: string, baseParams: DesignParams, variantCount: number): VariantGenerationResponse => {
  const parsed = JSON.parse(sanitizeJsonText(raw)) as VariantGenerationResponse;
  const variants = (parsed.variants || []).slice(0, variantCount).map((variant, index) => ({
    id: typeof variant.id === 'string' && variant.id.trim()
      ? toVariantSlug(variant.id, `variant-${index + 1}`)
      : `variant-${index + 1}`,
    name: typeof variant.name === 'string' && variant.name.trim()
      ? variant.name.trim()
      : `方案 ${index + 1}`,
    consumer_summary: typeof variant.consumer_summary === 'string' && variant.consumer_summary.trim()
      ? variant.consumer_summary.trim()
      : `这是第 ${index + 1} 个备选方向。`,
    params: clampDesignParams(variant.params || {}, baseParams),
  }));

  return {
    message: typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : `我整理了 ${variantCount} 组方向不同的方案，方便你直接比较。`,
    variants,
  };
};

const buildVariantGenerationInstruction = (baseParams: DesignParams, variantCount: number) => [
  `You are generating ${variantCount} furniture parameter variants for a parametric table.`,
  "Return JSON only. No markdown. No extra commentary.",
  "The JSON schema is:",
  '{"message":"short chinese sentence","variants":[{"id":"option-1","name":"方案名称","consumer_summary":"...","params":{"length":1.8,"width":0.8,"round":0.03,"leg_width":0.05,"frame_edge_thickness":0.018,"leg_height":0.73,"leg_open":0.04,"leg_tiptoe_degree":0.1,"frame_thickness":0.05,"lower_leg_depth":0.36,"upper_leg_depth":0.08,"leg_belly_depth":0.01,"frame_inset":0.02}},{"id":"option-2","name":"方案名称","consumer_summary":"...","params":{...}}]}',
  "Use meters for all dimensional values.",
  `Return exactly ${variantCount} variants.`,
  "Each variant must be distinct, legal for the given ranges, and match the user intent.",
  "Choose variant directions dynamically from the user request instead of forcing fixed styles.",
  `Base params: ${JSON.stringify(baseParams)}`,
  "Parameter ranges:",
  JSON.stringify(DESIGN_PARAM_LIMITS),
].join('\n');

const runGeminiVariantGeneration = async (prompt: string, baseParams: DesignParams, variantCount: number) => {
  assertEnvValue(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY');
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 900,
      systemInstruction: buildVariantGenerationInstruction(baseParams, variantCount),
      responseMimeType: 'application/json',
    },
  });

  return parseVariantGenerationResponse(response.text || '', baseParams, variantCount);
};

const runGithubVariantGeneration = async (prompt: string, baseParams: DesignParams, variantCount: number) => {
  assertEnvValue(process.env.GITHUB_TOKEN, 'GITHUB_TOKEN');
  const completion = await githubAi.chat.completions.create({
    model: GITHUB_MODEL,
    messages: [
      { role: 'system', content: buildVariantGenerationInstruction(baseParams, variantCount) },
      { role: 'user', content: prompt },
    ],
    max_tokens: 900,
  });

  return parseVariantGenerationResponse(completion.choices[0]?.message?.content || '', baseParams, variantCount);
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

const generateVariantsFunction = {
  name: "generate_variants",
  description: "Generate multiple parameter schemes when the user asks for several options, comparisons, or variants.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      variant_count: { type: Type.NUMBER, description: "How many schemes the user asked for, typically 2 to 4." },
    },
    required: ["variant_count"],
  },
};

const githubGenerateVariantsFunction = {
  type: "function" as const,
  function: {
    name: "generate_variants",
    description: "Generate multiple parameter schemes when the user asks for several options, comparisons, or variants.",
    parameters: {
      type: "object",
      properties: {
        variant_count: { type: "number", description: "How many schemes the user asked for, typically 2 to 4." },
      },
      required: ["variant_count"],
    },
  },
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
      tools: [{ functionDeclarations: [updateTableParamsFunction, generateVariantsFunction] }],
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
    tools: [githubUpdateTableParamsFunction, githubGenerateVariantsFunction],
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
    const material = (req.body?.material || 'blackwalnut') as QuoteMaterial;
    res.json(await solveTableByComputeParams(req.body, material));

  } catch (error) {
    console.error('Compute error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Rhino.Compute failed',
      warnings: [],
    });
  }
});

app.post('/api/quote', async (req, res) => {
  try {
    const material = (req.body?.material || 'blackwalnut') as QuoteMaterial;
    const computeResult = await solveTableByComputeParams(req.body, material);
    res.json(computeResult.quote);
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Quote generation failed',
      warnings: [],
    });
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

app.post('/api/generate-variants', async (req, res) => {
  try {
    const promptSource = req.body?.prompt ?? req.body?.['提示词'];
    const prompt = typeof promptSource === 'string' ? promptSource.trim() : '';
    if (!prompt) {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    const material = (req.body?.material || 'blackwalnut') as QuoteMaterial;
    const baseParams = clampDesignParams((req.body?.baseParams || {}) as Partial<DesignParams>);
    const desiredCount = clamp(Number(req.body?.variantCount ?? req.body?.variant_count ?? 3), 1, 4);

    // 这里单独记录方案生成请求，便于在 npm run dev 终端追踪 LLM 往返。
    console.log('[LLM][variants] request', {
      prompt,
      desiredCount,
      material,
      baseParams,
    });

    let generated: VariantGenerationResponse;
    try {
      if (LLM_PROVIDER === 'gemini') {
        generated = await runGeminiVariantGeneration(prompt, baseParams, desiredCount);
      } else if (LLM_PROVIDER === 'github') {
        generated = await runGithubVariantGeneration(prompt, baseParams, desiredCount);
      } else {
        try {
          generated = await runGithubVariantGeneration(prompt, baseParams, desiredCount);
        } catch {
          generated = await runGeminiVariantGeneration(prompt, baseParams, desiredCount);
        }
      }
    } catch {
      generated = {
        message: '我先整理出几组方向不同的参数方案，方便你直接比较。',
        variants: buildRuleBasedVariantSpecs(prompt, baseParams, desiredCount),
      };
    }

    const variantSpecs: VariantSpec[] = generated.variants.slice(0, desiredCount).map((variant, index) => ({
      id: typeof variant.id === 'string' && variant.id.trim() ? toVariantSlug(variant.id, `variant-${index + 1}`) : `variant-${index + 1}`,
      name: typeof variant.name === 'string' && variant.name.trim() ? variant.name.trim() : `方案 ${index + 1}`,
      consumer_summary: variant.consumer_summary,
      params: clampDesignParams(variant.params || {}, baseParams),
    }));

    const variants = [];
    for (const spec of variantSpecs) {
      try {
        const result = await solveTableByParams(spec.params, material);
        variants.push({
          id: spec.id,
          name: spec.name,
          consumer_summary: spec.consumer_summary,
          params: spec.params,
          success: true,
          result,
          scores: scoreVariant(spec.params),
        });
      } catch (error) {
        variants.push({
          id: spec.id,
          name: spec.name,
          consumer_summary: spec.consumer_summary,
          params: spec.params,
          success: false,
          error: error instanceof Error ? error.message : 'Variant solve failed',
          scores: scoreVariant(spec.params),
        });
      }
    }

    res.json({
      success: true,
      message: generated.message,
      variants,
    });

    console.log('[LLM][variants] response', {
      message: generated.message,
      variantCount: variants.length,
      variants: variants.map((variant: any) => ({
        id: variant.id,
        name: variant.name,
        success: variant.success,
      })),
    });
  } catch (error) {
    console.error('Generate variants error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate variants',
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, currentParams } = req.body;
    
    // Extract the latest user message
    const lastMessage = messages[messages.length - 1];
    const previousMessages = messages.slice(0, -1);

    // 记录聊天入口的原始上下文，便于确认模型到底收到了什么。
    console.log('[LLM][chat] request', {
      messageCount: Array.isArray(messages) ? messages.length : 0,
      lastMessage,
      currentParams,
    });
    
    // 没明确说“几套/多套”时，默认只出一套并走参数更新。
    const systemInstruction = "You are an expert furniture designer for 'Resonance.', a premium brand specializing in modern furniture. Your tone is elegant, professional, and helpful. Keep your responses concise, maximum 2-3 sentences. Use the 'update_table_params' function when the user wants one refined scheme. If the user does not explicitly ask for multiple schemes or specify a quantity, default to one scheme only and do not call 'generate_variants'. Use the 'generate_variants' function only when the user clearly asks for multiple options, comparisons, or several schemes in natural language, and set variant_count to the requested number. Available parameters are: length, width, round, leg_width, frame_edge_thickness, leg_height, leg_open, leg_tiptoe_degree, frame_thickness, lower_leg_depth, upper_leg_depth, leg_belly_depth, and frame_inset. All dimensional values are in meters unless they are normalized factors. Always explain your design choices briefly. Always respond in Simplified Chinese unless the user explicitly requests another language.";
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

    console.log('[LLM][chat] raw response', result.debugRaw);
    console.log('[LLM][chat] parsed response', {
      text: result.text,
      functionCalls: result.functionCalls,
    });

    // 只有模型显式发出多方案工具调用时，才进入前端方案卡片链路。
    const generateVariantsCall = Array.isArray(result.functionCalls)
      ? result.functionCalls.find((call: any) => call?.name === 'generate_variants')
      : undefined;

    if (generateVariantsCall) {
      const variantCount = clamp(Number(generateVariantsCall.args?.variant_count ?? 3), 1, 4);
      const prompt = typeof lastMessage?.content === 'string' ? lastMessage.content.trim() : '';
      const baseParams = clampDesignParams((currentParams || {}) as Partial<DesignParams>);
      const material = (req.body?.material || 'blackwalnut') as QuoteMaterial;

      console.log('[LLM][chat] executing generate_variants', {
        prompt,
        variantCount,
        material,
        baseParams,
      });

      let generated: VariantGenerationResponse;
      try {
        if (LLM_PROVIDER === 'gemini') {
          generated = await runGeminiVariantGeneration(prompt, baseParams, variantCount);
        } else if (LLM_PROVIDER === 'github') {
          generated = await runGithubVariantGeneration(prompt, baseParams, variantCount);
        } else {
          try {
            generated = await runGithubVariantGeneration(prompt, baseParams, variantCount);
          } catch {
            generated = await runGeminiVariantGeneration(prompt, baseParams, variantCount);
          }
        }
      } catch {
        generated = {
          message: '我先整理出几组方向不同的参数方案，方便你直接比较。',
          variants: buildRuleBasedVariantSpecs(prompt, baseParams, variantCount),
        };
      }

      // 先把 LLM 返回归一化，再统一走求解和打分。
      const variantSpecs: VariantSpec[] = generated.variants.slice(0, variantCount).map((variant, index) => ({
        id: typeof variant.id === 'string' && variant.id.trim() ? toVariantSlug(variant.id, `variant-${index + 1}`) : `variant-${index + 1}`,
        name: typeof variant.name === 'string' && variant.name.trim() ? variant.name.trim() : `方案 ${index + 1}`,
        consumer_summary: variant.consumer_summary,
        params: clampDesignParams(variant.params || {}, baseParams),
      }));

      const variants = [];
      for (const spec of variantSpecs) {
        try {
          const solveResult = await solveTableByParams(spec.params, material);
          variants.push({
            id: spec.id,
            name: spec.name,
            consumer_summary: spec.consumer_summary,
            params: spec.params,
            success: true,
            result: solveResult,
            scores: scoreVariant(spec.params),
          });
        } catch (error) {
          variants.push({
            id: spec.id,
            name: spec.name,
            consumer_summary: spec.consumer_summary,
            params: spec.params,
            success: false,
            error: error instanceof Error ? error.message : 'Variant solve failed',
            scores: scoreVariant(spec.params),
          });
        }
      }

      const payload: ChatApiResponse = {
        mode: 'variants',
        text: generated.message,
        variants,
        functionCalls: result.functionCalls,
        debugRaw: result.debugRaw,
      };

      console.log('[LLM][chat] variants response', {
        text: payload.text,
        variantCount: payload.variants.length,
        variants: payload.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          success: variant.success,
        })),
      });

      res.json(payload);
      return;
    }

    // 单方案模式保持原有聊天返回结构。
    const payload: ChatApiResponse = {
      mode: 'chat',
      text: result.text,
      functionCalls: result.functionCalls,
      debugRaw: result.debugRaw,
    };

    res.json(payload);
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







