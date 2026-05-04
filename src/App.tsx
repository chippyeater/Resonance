/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/// <reference types="vite/client" />

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import rhino3dm from 'rhino3dm';
import rhino3dmWasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import { Box, Loader2, Send } from 'lucide-react';
import { cn } from './lib/utils';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const buildApiUrl = (path: string) => (API_BASE_URL ? `${API_BASE_URL}${path}` : path);

interface OrdinaryTableParams {
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
}

type DesktopZone = {
  id: string;
  shape?: 'rect';
  x_ratio: number;
  z_ratio: number;
  width_ratio: number;
  depth_ratio: number;
  color?: string | null;
  opacity?: number | null;
  border_color?: string | null;
  border_opacity?: number | null;
  border_width?: number | null;
  label?: string | null;
};

type DesktopInsert =
  | {
      id: string;
      kind: 'grommet';
      x_ratio: number;
      z_ratio: number;
      radius?: number | null;
      color?: string | null;
    }
  | {
      id: string;
      kind: 'cup_holder';
      x_ratio: number;
      z_ratio: number;
      radius?: number | null;
      color?: string | null;
    }
  | {
      id: string;
      kind: 'power_socket';
      x_ratio: number;
      z_ratio: number;
      width?: number | null;
      depth?: number | null;
      color?: string | null;
    }
  | {
      id: string;
      kind: 'tablet_slot';
      x_ratio: number;
      z_ratio: number;
      width?: number | null;
      depth?: number | null;
      length?: number | null;
      rotation?: number | null;
      color?: string | null;
    };

// 桌面定制层参数先独立定义，后续接入 Three.js 渲染时不影响 Rhino 主体参数。
type DesktopCustomizationParams = {
  zones?: DesktopZone[] | null;
  // inserts 统一承载线孔盖、杯孔、电源插槽、平板槽等桌面嵌件。
  inserts?: DesktopInsert[] | null;
};

// 前端运行态参数：主体桌子参数之外，再挂桌面定制开关和配置。
type TableParams = OrdinaryTableParams & {
  enable_desktop_customization: boolean;
  desktop_customization: DesktopCustomizationParams | null;
};

interface PreciseMeshData {
  vertices: number[];
  faces: number[];
}

interface PreciseModelData {
  outputName: string;
  modelUnits?: string;
  unitScale: number;
  branchCount: number;
  meshItemCount: number;
  meshes: PreciseMeshData[];
}

interface TableCanvasHandle {
  captureTransparentSnapshot: () => string | null;
}

interface HudChangeItem {
  key: keyof OrdinaryTableParams;
  label: string;
  previousValue: string;
  nextValue: string;
}

interface QuoteBreakdownItem {
  label: string;
  value: number;
}

interface QuoteData {
  totalPrice: number;
  currency: string;
  leadTime: string;
  breakdown: QuoteBreakdownItem[];
  version: string;
}

interface StructureAssessment {
  structure_level: 'low' | 'medium' | 'high';
  stability_score: number;
  risk_tags: string[];
  recommendations: string[];
}
interface VariantScores {
  lightness: number;
  stability: number;
  cost_efficiency: number;
  premium_feel: number;
}

interface VariantApiItem {
  id: string;
  name: string;
  consumer_summary: string;
  params: OrdinaryTableParams;
  success: boolean;
  result?: any;
  error?: string;
  scores: VariantScores;
}

interface VariantCardData {
  id: string;
  name: string;
  consumer_summary: string;
  params: OrdinaryTableParams;
  success: boolean;
  error?: string;
  scores: VariantScores;
  model: PreciseModelData | null;
  quote: QuoteData | null;
  structureAssessment: StructureAssessment | null;
}

interface ComputeApiResponse {
  quote?: QuoteData;
  structureAssessment?: StructureAssessment;
}
interface GenerateVariantsApiResponse {
  success: boolean;
  message?: string;
  variants?: VariantApiItem[];
  error?: string;
}
interface ChatApiResponse {
  mode?: 'chat' | 'variants';
  text?: string;
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  debugRaw?: unknown;
  variants?: VariantApiItem[];
}
const QUOTE_BREAKDOWN_LABELS: Record<string, string> = {
  'Base fabrication': '基础制作',
  'Material volume': '材料用量',
  'Surface finishing': '表面处理',
  'Craft complexity': '工艺复杂度',
  'Packing and logistics': '包装与运输',
};

const STRUCTURE_RISK_LABELS: Record<string, string> = {
  large_span: '大跨度',
  thin_legs: '腿部偏细',
  weak_frame_support: '框架偏弱',
  narrow_footprint: '落地偏窄',
  max_size_risk: '尺寸上限风险',
  oversized_top: '桌面偏大',
  complex_assembly: '装配复杂',
};

const VARIANT_SCORE_LABELS: Array<{ key: keyof VariantScores; label: string }> = [
  { key: 'lightness', label: '轻盈' },
  { key: 'stability', label: '稳定性' },
  { key: 'cost_efficiency', label: '效率' },
  { key: 'premium_feel', label: '质感' },
];

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  variants?: VariantCardData[];
};


type LeftTab = 'dimensions' | 'frame' | 'legs';
type BottomTab = 'design'  | 'quote';
type Material = 'blackwalnut' | 'rosewood';

const ORDINARY_DEFAULTS: OrdinaryTableParams = {
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

// 默认不带任何桌面定制元素，Three.js 看到 null 时直接不渲染叠加层。
const DEFAULT_DESKTOP_CUSTOMIZATION: DesktopCustomizationParams | null = null;

// 默认关闭桌面定制层；后续即使写入配置，也可以由布尔开关统一控制启停。
const DEFAULT_TABLE_PARAMS: TableParams = {
  ...ORDINARY_DEFAULTS,
  enable_desktop_customization: false,
  desktop_customization: DEFAULT_DESKTOP_CUSTOMIZATION,
};

const ORDINARY_LIMITS = {
  length: { min: 0.6, max: 2.2, step: 0.01 },
  width: { min: 0.6, max: 1.4, step: 0.01 },
  round: { min: 0.001, max: 0.5, step: 0.001 },
  leg_width: { min: 0.01, max: 0.2, step: 0.001 },
  frame_edge_thickness: { min: 0.002, max: 0.025, step: 0.0001 },
  leg_height: { min: 0.5, max: 0.75, step: 0.001 },
  leg_open: { min: 0, max: 0.22, step: 0.001 },
  leg_tiptoe_degree: { min: 0, max: 1, step: 0.01 },
  frame_thickness: { min: 0.01, max: 0.1, step: 0.001 },
  lower_leg_depth: { min: 0, max: 1.0, step: 0.001 },
  upper_leg_depth: { min: 0.004, max: 0.2, step: 0.001 },
  leg_belly_depth: { min: 0, max: 0.19, step: 0.001 },
  frame_inset: { min: 0, max: 0.2, step: 0.001 },
} as const;

const LEFT_TABS: Array<{ id: LeftTab; label: string }> = [
  { id: 'dimensions', label: 'BASE' },
  { id: 'frame', label: 'FRAME' },
  { id: 'legs', label: 'LEGS' },
];

const BOTTOM_NAV_ITEMS: Array<{ id: BottomTab; label: string }> = [
  { id: 'design', label: 'DESIGN' },
  { id: 'quote', label: 'QUOTE' },
];

const SLIDER_SECTIONS: Record<
  LeftTab,
  Array<{
    key: keyof OrdinaryTableParams;
    label: string;
    unit: string;
    displayMul?: number;
  }>
> = {
  dimensions: [
    { key: 'length', label: 'LENGTH', unit: 'CM', displayMul: 100 },
    { key: 'width', label: 'WIDTH', unit: 'CM', displayMul: 100 },
    { key: 'leg_height', label: 'HEIGHT', unit: 'CM', displayMul: 100 },
    { key: 'round', label: 'ROUND', unit: 'MM', displayMul: 1000 },
  ],
  frame: [
    { key: 'frame_thickness', label: 'THICKNESS', unit: 'MM', displayMul: 1000 },
    { key: 'frame_edge_thickness', label: 'EDGE', unit: 'MM', displayMul: 1000 },
    { key: 'frame_inset', label: 'INSET', unit: 'MM', displayMul: 1000 },
  ],
  legs: [
    { key: 'leg_width', label: 'LEG WIDTH', unit: 'MM', displayMul: 1000 },
    { key: 'leg_open', label: 'LEG OPEN', unit: 'MM', displayMul: 1000 },
    { key: 'leg_tiptoe_degree', label: 'TIPTOE', unit: '' },
    { key: 'upper_leg_depth', label: 'UPPER DEPTH', unit: 'MM', displayMul: 1000 },
    { key: 'lower_leg_depth', label: 'LOWER DEPTH', unit: '', displayMul: 1 },
    { key: 'leg_belly_depth', label: 'BELLY DEPTH', unit: 'MM', displayMul: 1000 },
  ],
};

const PARAM_LABELS: Record<keyof OrdinaryTableParams, { label: string; unit?: string; displayMul?: number }> = {
  length: { label: 'Length', unit: 'cm', displayMul: 100 },
  width: { label: 'Width', unit: 'cm', displayMul: 100 },
  round: { label: 'Round', unit: 'mm', displayMul: 1000 },
  leg_width: { label: 'Leg Width', unit: 'mm', displayMul: 1000 },
  frame_edge_thickness: { label: 'Edge', unit: 'mm', displayMul: 1000 },
  leg_height: { label: 'Height', unit: 'cm', displayMul: 100 },
  leg_open: { label: 'Leg Open', unit: 'mm', displayMul: 1000 },
  leg_tiptoe_degree: { label: 'Tiptoe', displayMul: 1 },
  frame_thickness: { label: 'Thickness', unit: 'mm', displayMul: 1000 },
  lower_leg_depth: { label: 'Lower Depth', displayMul: 1 },
  upper_leg_depth: { label: 'Upper Depth', unit: 'mm', displayMul: 1000 },
  leg_belly_depth: { label: 'Belly Depth', unit: 'mm', displayMul: 1000 },
  frame_inset: { label: 'Inset', unit: 'mm', displayMul: 1000 },
};

const MATERIAL_OPTIONS: Array<{ id: Material; label: string; note: string }> = [
  { id: 'blackwalnut', label: '黑胡桃木', note: 'BLACK WALNUT' },
  { id: 'rosewood', label: '红木', note: 'ROSEWOOD' },
];
const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: 'assistant' as const,
    content: '欢迎来到 Resonance。我可以根据你的使用场景、尺寸偏好和桌作风格，协助完成桌子的定制。',
  },
];

const rhinoModulePromise = (
  rhino3dm as unknown as (config?: { locateFile?: (fileName: string) => string }) => Promise<any>
)({
  locateFile: (fileName: string) => {
    if (fileName.endsWith('.wasm')) {
      return rhino3dmWasmUrl;
    }
    return fileName;
  },
});

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

const getRhinoListCount = (list: any) => {
  if (!list) return 0;
  if (typeof list.count === 'number') return list.count;
  if (typeof list.count === 'function') return list.count();
  if (typeof list.length === 'number') return list.length;
  return 0;
};

const getRhinoNumber = (value: any, keys: Array<string | number>, fallback = 0) => {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === 'number') return candidate;
  }
  return fallback;
};

const isRhinoMesh = (value: any, rhino: any) => Boolean(value && rhino?.Mesh && value instanceof rhino.Mesh);

const extractPreciseMeshData = (mesh: any, unitScale = 1): PreciseMeshData => {
  const vertices = mesh.vertices();
  const faces = mesh.faces();
  const vertexCount = getRhinoListCount(vertices);
  const faceCount = getRhinoListCount(faces);
  const flattenedVertices: number[] = [];
  const flattenedFaces: number[] = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const vertex = vertices.get(i);
    const x = getRhinoNumber(vertex, ['x', 'X', 0]) * unitScale;
    const y = getRhinoNumber(vertex, ['y', 'Y', 1]) * unitScale;
    const z = getRhinoNumber(vertex, ['z', 'Z', 2]) * unitScale;
    flattenedVertices.push(x, z, -y);
  }

  for (let i = 0; i < faceCount; i += 1) {
    const face = faces.get(i);
    const a = getRhinoNumber(face, ['a', 'A', 0]);
    const b = getRhinoNumber(face, ['b', 'B', 1]);
    const c = getRhinoNumber(face, ['c', 'C', 2]);
    const d = getRhinoNumber(face, ['d', 'D', 3], c);
    flattenedFaces.push(a, b, c);
    if (d !== c) {
      flattenedFaces.push(a, c, d);
    }
  }

  return {
    vertices: flattenedVertices,
    faces: flattenedFaces,
  };
};

const extractCustomMeshData = (rawMesh: any, unitScale = 1): PreciseMeshData => {
  const sourceVertices = Array.isArray(rawMesh?.vertices) ? rawMesh.vertices : [];
  const sourceFaces = Array.isArray(rawMesh?.faces) ? rawMesh.faces : [];
  const vertices: number[] = [];
  const faces: number[] = [];

  for (let i = 0; i + 2 < sourceVertices.length; i += 3) {
    const x = Number(sourceVertices[i]) * unitScale;
    const y = Number(sourceVertices[i + 1]) * unitScale;
    const z = Number(sourceVertices[i + 2]) * unitScale;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    vertices.push(x, z, -y);
  }

  for (let i = 0; i + 2 < sourceFaces.length; i += 3) {
    const a = Number(sourceFaces[i]);
    const b = Number(sourceFaces[i + 1]);
    const c = Number(sourceFaces[i + 2]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) continue;
    faces.push(a, b, c);
  }

  return { vertices, faces };
};

const decodeComputeMeshOutput = async (outputItem: any, unitScale: number) => {
  if (outputItem?.type === 'mesh_data') {
    const rawMesh =
      typeof outputItem?.data === 'string'
        ? JSON.parse(outputItem.data)
        : outputItem?.data;
    const meshData = extractCustomMeshData(rawMesh, unitScale);
    if (meshData.vertices.length === 0 || meshData.faces.length === 0) {
      throw new Error('Custom mesh output did not contain vertices/faces.');
    }
    return meshData;
  }

  if (outputItem?.type !== 'Rhino.Geometry.Mesh') {
    throw new Error(`Expected Rhino.Geometry.Mesh, received ${outputItem?.type ?? 'unknown output type'}.`);
  }

  if (typeof outputItem?.data !== 'string') {
    throw new Error('Compute response did not include serialized mesh data.');
  }

  const rhino = await rhinoModulePromise;
  const meshObject = rhino.CommonObject.decode(JSON.parse(outputItem.data));

  if (!isRhinoMesh(meshObject, rhino)) {
    throw new Error('rhino3dm decoded the output, but it was not a Rhino mesh.');
  }

  const preciseMeshData = extractPreciseMeshData(meshObject, unitScale);
  if (preciseMeshData.vertices.length === 0 || preciseMeshData.faces.length === 0) {
    throw new Error('Decoded Rhino mesh did not contain vertices/faces.');
  }
  return preciseMeshData;
};

const parsePreciseMeshFromComputeResponse = async (result: any): Promise<PreciseModelData> => {
  const unitScale = getRhinoUnitScaleToMeters(result?.modelunits);
  const values = Array.isArray(result?.values) ? result.values : [];
  const deskOutput =
    values.find((value: any) => value?.ParamName === 'RH_OUT:desk') ??
    values.find((value: any) => typeof value?.ParamName === 'string' && value.ParamName.startsWith('RH_OUT:')) ??
    values[0];

  const tree = deskOutput?.InnerTree;
  const paths = tree && typeof tree === 'object' ? Object.keys(tree) : [];
  const meshes: PreciseMeshData[] = [];
  let meshItemCount = 0;

  for (const path of paths) {
    const branchItems = Array.isArray(tree?.[path]) ? tree[path] : [];
    for (const outputItem of branchItems) {
      if (outputItem?.type !== 'Rhino.Geometry.Mesh' && outputItem?.type !== 'mesh_data') {
        continue;
      }
      meshItemCount += 1;
      const meshData = await decodeComputeMeshOutput(outputItem, unitScale);
      meshes.push(meshData);
    }
  }

  if (meshes.length === 0) {
    throw new Error('Compute response did not include a usable mesh output.');
  }

  return {
    outputName: deskOutput?.ParamName ?? 'unknown',
    modelUnits: result?.modelunits,
    unitScale,
    branchCount: paths.length,
    meshItemCount,
    meshes,
  };
};

const parseComputeApiResponse = async (
  result: any,
): Promise<{ model: PreciseModelData; quote: QuoteData | null; structureAssessment: StructureAssessment | null }> => {
  const model = await parsePreciseMeshFromComputeResponse(result);
  const quote = result?.quote ?? null;
  const structureAssessment = result?.structureAssessment ?? null;
  return { model, quote, structureAssessment };
};

const parseVariantApiResponse = async (result: GenerateVariantsApiResponse): Promise<VariantCardData[]> => {
  const variants = Array.isArray(result?.variants) ? result.variants : [];
  return await Promise.all(
    variants.map(async (variant) => {
      if (!variant.success || !variant.result) {
        return {
          id: variant.id,
          name: variant.name,
          consumer_summary: variant.consumer_summary,
          params: variant.params,
          success: false,
          error: variant.error,
          scores: variant.scores,
          model: null,
          quote: null,
          structureAssessment: null,
        };
      }

      try {
        const parsed = await parseComputeApiResponse(variant.result);
        return {
          id: variant.id,
          name: variant.name,
          consumer_summary: variant.consumer_summary,
          params: variant.params,
          success: true,
          scores: variant.scores,
          model: parsed.model,
          quote: parsed.quote,
          structureAssessment: parsed.structureAssessment,
        };
      } catch (error) {
        return {
          id: variant.id,
          name: variant.name,
          consumer_summary: variant.consumer_summary,
          params: variant.params,
          success: false,
          error: error instanceof Error ? error.message : 'Variant preview parse failed',
          scores: variant.scores,
          model: null,
          quote: null,
          structureAssessment: null,
        };
      }
    }),
  );
};

// 仅提取 Rhino / LLM 当前需要的主体桌体参数，桌面定制字段保留在前端本地。
const extractBaseTableParams = (params: TableParams): OrdinaryTableParams => ({
  length: params.length,
  width: params.width,
  round: params.round,
  leg_width: params.leg_width,
  frame_edge_thickness: params.frame_edge_thickness,
  leg_height: params.leg_height,
  leg_open: params.leg_open,
  leg_tiptoe_degree: params.leg_tiptoe_degree,
  frame_thickness: params.frame_thickness,
  lower_leg_depth: params.lower_leg_depth,
  upper_leg_depth: params.upper_leg_depth,
  leg_belly_depth: params.leg_belly_depth,
  frame_inset: params.frame_inset,
});

const buildComputePayload = (nextParams: OrdinaryTableParams) => ({
  length: nextParams.length * 1000,
  width: nextParams.width * 1000,
  round: nextParams.round * 1000,
  leg_width: nextParams.leg_width * 1000,
  frame_edge_thickness: nextParams.frame_edge_thickness * 1000,
  leg_height: nextParams.leg_height * 1000,
  leg_open: nextParams.leg_open * 1000,
  leg_tiptoe_degree: nextParams.leg_tiptoe_degree,
  frame_thickness: nextParams.frame_thickness * 1000,
  lower_leg_depth: nextParams.lower_leg_depth,
  upper_leg_depth: nextParams.upper_leg_depth * 1000,
  leg_belly_depth: nextParams.leg_belly_depth * 1000,
  frame_inset: nextParams.frame_inset * 1000,
});

const formatSliderValue = (value: number, displayMul = 1) => {
  const scaled = value * displayMul;
  if (displayMul === 1) {
    return scaled.toFixed(2);
  }
  return `${Math.round(scaled)}`;
};

const formatHudValue = (key: keyof OrdinaryTableParams, value: number) => {
  const config = PARAM_LABELS[key];
  const displayMul = config.displayMul ?? 1;
  const scaled = value * displayMul;
  const formatted = displayMul === 1 ? scaled.toFixed(2) : `${Math.round(scaled)}`;
  return config.unit ? `${formatted} ${config.unit}` : formatted;
};

const getChangedParamEntries = (prev: OrdinaryTableParams, nextPartial: Partial<OrdinaryTableParams>) => {
  const changes: HudChangeItem[] = [];
  for (const [rawKey, rawValue] of Object.entries(nextPartial)) {
    const key = rawKey as keyof OrdinaryTableParams;
    const value = rawValue as number | undefined;
    if (typeof value !== 'number') continue;
    if (prev[key] === value) continue;
    changes.push({
      key,
      label: PARAM_LABELS[key].label,
      previousValue: formatHudValue(key, prev[key]),
      nextValue: formatHudValue(key, value),
    });
  }
  return changes;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

// 用 Shape 挤出一个完整圆角的长槽截面，避免 tablet_slot 看起来像普通矩形块。
const createRoundedSlotGeometry = (length: number, depth: number, height: number) => {
  const radius = Math.min(depth / 2, length / 2);
  const halfLength = length / 2;
  const halfDepth = depth / 2;
  const shape = new THREE.Shape();

  shape.moveTo(-halfLength + radius, -halfDepth);
  shape.lineTo(halfLength - radius, -halfDepth);
  shape.absarc(halfLength - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-halfLength + radius, halfDepth);
  shape.absarc(-halfLength + radius, 0, radius, Math.PI / 2, (Math.PI * 3) / 2, false);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height / 2, 0);
  return geometry;
};

const FAKE_DESKTOP_ZONES: DesktopZone[] = [
  {
    id: 'focus-zone',
    shape: 'rect',
    x_ratio: -0.12,
    z_ratio: 0,
    width_ratio: 0.38,
    depth_ratio: 0.62,
    color: '#ffffff',
    opacity: 0.3,
    border_color: '#324456',
    border_opacity: 0.92,
    border_width: 0.003,
    label: '主工作区',
  },
];

const FAKE_DESKTOP_INSERTS: DesktopInsert[] = [
  {
    id: 'rear-left-grommet',
    kind: 'grommet',
    x_ratio: -0.28,
    z_ratio: 0.34,
    radius: 0.028,
    color: '#1e1d1b',
  },
  {
    id: 'rear-right-power',
    kind: 'power_socket',
    x_ratio: 0.24,
    z_ratio: 0.32,
    width: 0.16,
    depth: 0.085,
    color: '#2a2724',
  },
  {
    id: 'front-center-tablet-slot',
    kind: 'tablet_slot',
    x_ratio: 0,
    z_ratio: -0.18,
    length: 0.24,
    depth: 0.018,
    width: 0.24,
    rotation: 0,
    color: '#2f2b27',
  },
  {
    id: 'front-right-cup-holder',
    kind: 'cup_holder',
    x_ratio: 0.28,
    z_ratio: -0.16,
    radius: 0.04,
    color: '#25211d',
  },
];

// 桌面定制层挂在主体桌子 group 下方，后续 overlay 和各类桌面嵌件都挂到这里。
const createDesktopCustomizationLayer = (params: TableParams, tabletopBounds: THREE.Box3) => {
  const group = new THREE.Group();
  group.name = 'desktop-customization-layer';

  // 这里先用假数据验证桌面分区的坐标和视觉，后续再切回真实配置。
  if (!params.enable_desktop_customization) {
    return group;
  }

  const zones = FAKE_DESKTOP_ZONES;
  const inserts = FAKE_DESKTOP_INSERTS;
  // 高度直接贴当前主体 mesh 的顶面，而不是再用参数去猜。
  const topSurfaceY = tabletopBounds.max.y;
  const tableLength = tabletopBounds.max.x - tabletopBounds.min.x;
  const tableDepth = tabletopBounds.max.z - tabletopBounds.min.z;
  const tableCenterX = (tabletopBounds.max.x + tabletopBounds.min.x) / 2;
  const tableCenterZ = (tabletopBounds.max.z + tabletopBounds.min.z) / 2;
  const overlayLift = 0.0015;
  const overlayHeight = 0.02;
  const safeInsetBase = Math.max(params.round, 0.01);

  for (const zone of zones) {
    const borderWidth = zone.border_width ?? 0.003;
    const safeInset = Math.max(safeInsetBase, borderWidth * 2);
    const usableLength = Math.max(tableLength - safeInset * 2, tableLength * 0.2);
    const usableDepth = Math.max(tableDepth - safeInset * 2, tableDepth * 0.2);
    const zoneWidth = usableLength * zone.width_ratio;
    const zoneDepth = usableDepth * zone.depth_ratio;
    const zoneCenterX = tableCenterX + usableLength * zone.x_ratio;
    const zoneCenterZ = tableCenterZ + usableDepth * zone.z_ratio;

    // 先做一个略有厚度的半透明实体块，方便确认桌面分区的体积感。
    const overlay = new THREE.Mesh(
      new THREE.BoxGeometry(zoneWidth, overlayHeight, zoneDepth),
      new THREE.MeshStandardMaterial({
        color: zone.color ?? '#708396',
        transparent: true,
        opacity: zone.opacity ?? 0.1,
        depthWrite: false,
        roughness: 0.42,
        metalness: 0.02,
      }),
    );
    overlay.position.set(zoneCenterX, topSurfaceY + overlayLift + overlayHeight / 2, zoneCenterZ);
    group.add(overlay);
  }

  for (const insert of inserts) {
    if (insert.kind === 'grommet') {
      const radius = insert.radius ?? 0.028;
      const safeInset = Math.max(safeInsetBase, radius + 0.008);
      const usableLength = Math.max(tableLength - safeInset * 2, tableLength * 0.2);
      const usableDepth = Math.max(tableDepth - safeInset * 2, tableDepth * 0.2);
      const centerX = tableCenterX + usableLength * insert.x_ratio;
      const centerZ = tableCenterZ + usableDepth * insert.z_ratio;

      // grommet 先用深色圆片表示，只做桌面视觉标记，不修改主体 mesh。
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.004, 40),
        new THREE.MeshStandardMaterial({
          color: insert.color ?? '#1e1d1b',
          roughness: 0.55,
          metalness: 0.08,
        }),
      );
      cap.position.set(centerX, topSurfaceY + 0.0025, centerZ);
      group.add(cap);
      continue;
    }

    if (insert.kind === 'power_socket') {
      const socketWidth = insert.width ?? 0.16;
      const socketDepth = insert.depth ?? 0.085;
      const safeInset = Math.max(safeInsetBase, Math.max(socketWidth, socketDepth) / 2 + 0.008);
      const usableLength = Math.max(tableLength - safeInset * 2, tableLength * 0.2);
      const usableDepth = Math.max(tableDepth - safeInset * 2, tableDepth * 0.2);
      const centerX = tableCenterX + usableLength * insert.x_ratio;
      const centerZ = tableCenterZ + usableDepth * insert.z_ratio;

      // power_socket 先做成贴桌面的矩形面板，后续再补圆角和插孔细节。
      const socketPanel = new THREE.Mesh(
        new THREE.BoxGeometry(socketWidth, 0.006, socketDepth),
        new THREE.MeshStandardMaterial({
          color: insert.color ?? '#2a2724',
          roughness: 0.52,
          metalness: 0.1,
        }),
      );
      socketPanel.position.set(centerX, topSurfaceY + 0.003, centerZ);
      group.add(socketPanel);
      continue;
    }

    if (insert.kind === 'tablet_slot') {
      const slotLength = insert.length ?? insert.width ?? 0.24;
      const slotDepth = insert.depth ?? 0.018;
      const slotRotation = insert.rotation ?? 0;
      const safeInset = Math.max(safeInsetBase, Math.max(slotLength, slotDepth) / 2 + 0.008);
      const usableLength = Math.max(tableLength - safeInset * 2, tableLength * 0.2);
      const usableDepth = Math.max(tableDepth - safeInset * 2, tableDepth * 0.2);
      const centerX = tableCenterX + usableLength * insert.x_ratio;
      const centerZ = tableCenterZ + usableDepth * insert.z_ratio;

      // tablet_slot 先做成细长槽位标记：深色底槽 + 两侧浅边。
      const slotGroup = new THREE.Group();
      slotGroup.position.set(centerX, topSurfaceY + 0.0018, centerZ);
      slotGroup.rotation.y = slotRotation;

      const slotBody = new THREE.Mesh(
        createRoundedSlotGeometry(slotLength, slotDepth, 0.005),
        new THREE.MeshStandardMaterial({
          color: insert.color ?? '#2f2b27',
          roughness: 0.6,
          metalness: 0.06,
        }),
      );
      slotGroup.add(slotBody);

      const lipMaterial = new THREE.MeshStandardMaterial({
        color: '#4a433c',
        roughness: 0.48,
        metalness: 0.04,
      });
      const lipWidth = 0.003;
      const halfDepth = slotDepth / 2;

      const nearLip = new THREE.Mesh(
        new THREE.BoxGeometry(slotLength, 0.003, lipWidth),
        lipMaterial,
      );
      nearLip.position.set(0, 0.002, -halfDepth);
      slotGroup.add(nearLip);

      const farLip = new THREE.Mesh(
        new THREE.BoxGeometry(slotLength, 0.003, lipWidth),
        lipMaterial,
      );
      farLip.position.set(0, 0.002, halfDepth);
      slotGroup.add(farLip);

      group.add(slotGroup);
      continue;
    }

    if (insert.kind === 'cup_holder') {
      const radius = insert.radius ?? 0.04;
      const safeInset = Math.max(safeInsetBase, radius + 0.01);
      const usableLength = Math.max(tableLength - safeInset * 2, tableLength * 0.2);
      const usableDepth = Math.max(tableDepth - safeInset * 2, tableDepth * 0.2);
      const centerX = tableCenterX + usableLength * insert.x_ratio;
      const centerZ = tableCenterZ + usableDepth * insert.z_ratio;

      // cup_holder 先做成杯孔压圈的视觉件：外圈加内凹深色圆盘。
      const holderGroup = new THREE.Group();
      holderGroup.position.set(centerX, topSurfaceY + 0.0015, centerZ);

      const outerRing = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.004, 48),
        new THREE.MeshStandardMaterial({
          color: '#4b443d',
          roughness: 0.5,
          metalness: 0.08,
        }),
      );
      holderGroup.add(outerRing);

      const innerDisk = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.76, radius * 0.76, 0.0025, 48),
        new THREE.MeshStandardMaterial({
          color: insert.color ?? '#25211d',
          roughness: 0.62,
          metalness: 0.04,
        }),
      );
      innerDisk.position.y = -0.0012;
      holderGroup.add(innerDisk);

      group.add(holderGroup);
    }
  }

  return group;
};

const TableCanvas = forwardRef<TableCanvasHandle, {
  params: TableParams;
  material: Material;
  preciseModelData: PreciseModelData | null;
}>(({
  params,
  material,
  preciseModelData,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const preciseMeshGroupRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      42,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.08,
      80,
    );
    camera.position.set(2.1, 1.35, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current = renderer;
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.setClearAlpha(0);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controls.target.set(0, 0.42, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a3126, 1));

    const keyLight = new THREE.DirectionalLight(0xd79a70, 1.8);
    keyLight.position.set(4, 3.8, 3.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb98562, 1.05);
    fillLight.position.set(-4, 2.6, 4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x8c6249, 0.92);
    rimLight.position.set(0, 3.2, -5);
    scene.add(rimLight);

    const frontLight = new THREE.PointLight(0xf3d9c4, 1.45, 12);
    frontLight.position.set(0, 1.8, 2.6);
    scene.add(frontLight);

    let animationFrameId = 0;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      frontLight.dispose();
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    captureTransparentSnapshot: () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;

      if (!renderer || !scene || !camera) return null;

      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
  }), []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;

    if (preciseMeshGroupRef.current) {
      scene.remove(preciseMeshGroupRef.current);
      preciseMeshGroupRef.current.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((entry) => entry.dispose());
      });
      preciseMeshGroupRef.current = null;
    }

    if (!preciseModelData) return undefined;

    const group = new THREE.Group();
    const woodColor = material === 'rosewood' ? '#8c5844' : '#6a4837';
    const emissiveColor = material === 'rosewood' ? '#3d2218' : '#2c1d15';

    for (const meshData of preciseModelData.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertices, 3));
      geometry.setIndex(meshData.faces);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: woodColor,
          roughness: 0.44,
          metalness: 0.03,
          emissive: new THREE.Color(emissiveColor),
          emissiveIntensity: 0.14,
          side: THREE.DoubleSide,
        }),
      );
      group.add(mesh);
    }

    let bbox = new THREE.Box3().setFromObject(group);
    const size = bbox.getSize(new THREE.Vector3());

    if (size.z > size.x && params.length > params.width) {
      group.rotation.y = Math.PI / 2;
      bbox = new THREE.Box3().setFromObject(group);
    }

    const center = bbox.getCenter(new THREE.Vector3());
    group.position.set(-center.x, -bbox.min.y, -center.z);

    // 定制层直接贴主体 mesh 的实际桌面顶面，避免参数语义和模型高度不一致。
    group.add(createDesktopCustomizationLayer(params, bbox));
    scene.add(group);
    preciseMeshGroupRef.current = group;

    return () => {
      if (preciseMeshGroupRef.current !== group) return;
      scene.remove(group);
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((entry) => entry.dispose());
      });
      preciseMeshGroupRef.current = null;
    };
  }, [material, params.length, params.width, params.enable_desktop_customization, params.desktop_customization, preciseModelData]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[radial-gradient(circle_at_50%_45%,rgba(141,152,167,0.14),rgba(250,246,239,0)_42%),#faf6ef]"
    />
  );
});

const CustomSlider = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  displayMul = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  displayMul?: number;
  onChange: (value: number) => void;
}) => {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="group flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <span className="text-ui-label-control text-[#a79a8a] transition-colors group-hover:text-[#42241C]">
          {label}
        </span>
        <div className="flex items-end gap-2">
          <span className="text-ui-value-control text-[#6b4a3a] transition-transform duration-150 group-hover:scale-[1.04]">
            {formatSliderValue(value, displayMul)}
          </span>
          <span className="mb-[3px] font-mono text-[8px] uppercase tracking-[0.14em] text-[#8f867a]">
            {unit}
          </span>
        </div>
      </div>

      <div className="relative flex h-4 w-full items-center">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#42241C]/75" />
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-[#D43A2F]"
          style={{ width: `${percent}%` }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />

        <div
          className="pointer-events-none absolute top-1/2 h-[10px] w-[2px] -translate-y-1/2 rounded-full bg-[#D43A2F] transition-all duration-150 group-hover:h-[13px] group-hover:shadow-[0_0_0_2px_rgba(212,58,47,0.10)]"
          style={{ left: `calc(${percent}% - 1px)` }}
        />
      </div>

      <div className="flex justify-between font-mono text-[7px] uppercase tracking-[0.12em] text-[#b0a698]">
        <span>{formatSliderValue(min, displayMul)}</span>
        <span>{formatSliderValue(max, displayMul)}</span>
      </div>
    </div>
  );
};

const MaterialCard = ({
  active,
  option,
  onClick,
}: {
  active: boolean;
  option: { id: Material; label: string; note: string };
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex-1 border px-4 py-3 text-left transition-[border-color,color,box-shadow] duration-150',
      active
        ? 'border-[#7b4b38] bg-transparent shadow-[inset_0_0_0_1px_#7b4b38]'
        : 'border-[#bda994] bg-transparent hover:border-[#42241C]',
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className={cn('block font-serif text-[13px]', active ? 'text-[#7b4b38]' : 'text-[#42241C]')}>{option.label}</span>
        <span
          className={cn(
            'mt-1 block font-mono text-[7px] uppercase tracking-[0.14em]',
            active ? 'text-[#7b4b38]' : 'text-[#8f867a]',
          )}
        >
          {option.note}
        </span>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'mt-[2px] h-[8px] w-[8px] rounded-full border transition-colors duration-150',
          active ? 'border-[#7b4b38] bg-[#7b4b38]' : 'border-[#cdb9a5] bg-transparent',
        )}
      />
    </div>
  </button>
);

const BottomMetric = ({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) => (
  <div className="flex h-[54px] flex-1 flex-col justify-center border-r border-[#42241C] px-6 last:border-r-0">
    <div className="text-stat-label text-[#8f867a]">{label}</div>
    <div
      className={cn('mt-1 stat-value-primary', accent ? 'text-[#e63b2e]' : 'text-[#42241C]')}
      style={{ fontFamily: 'Bebas Neue, sans-serif' }}
    >
      {value}
    </div>
    {hint ? <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#9f978d]">{hint}</div> : null}
  </div>
);

const formatStructureLevel = (level: StructureAssessment['structure_level'] | undefined) => {
  if (level === 'high') return '高';
  if (level === 'medium') return '中';
  if (level === 'low') return '低';
  return '—';
};

export default function App() {
  const [params, setParams] = useState<TableParams>(DEFAULT_TABLE_PARAMS);
  const [material, setMaterial] = useState<Material>('blackwalnut');
  const [leftTab, setLeftTab] = useState<LeftTab>('dimensions');
  const [activeTab, setActiveTab] = useState<BottomTab>('design');
  const [preciseModelData, setPreciseModelData] = useState<PreciseModelData | null>(null);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [structureAssessment, setStructureAssessment] = useState<StructureAssessment | null>(null);
  const [isExportingPreciseModel, setIsExportingPreciseModel] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hudItems, setHudItems] = useState<HudChangeItem[]>([]);
  const [hudVisible, setHudVisible] = useState(false);
  const [hudExiting, setHudExiting] = useState(false);
  const [hudHovered, setHudHovered] = useState(false);
  const [variantCards, setVariantCards] = useState<VariantCardData[]>([]);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const tableCanvasRef = useRef<TableCanvasHandle | null>(null);
  const computeRequestIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hudScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isTyping, messages]);

  useEffect(() => {
    if (!hudVisible || hudHovered) return undefined;

    let hideTimer = 0;
    let exitTimer = 0;
    let animationFrame = 0;
    let setupFrame = 0;

    const startDismissTimer = () => {
      hideTimer = window.setTimeout(() => {
        setHudExiting(true);
        exitTimer = window.setTimeout(() => {
          setHudVisible(false);
          setHudExiting(false);
          setHudItems([]);
        }, 420);
      }, 3000);
    };

    setupFrame = window.requestAnimationFrame(() => {
      const scrollContainer = hudScrollRef.current;

      if (!scrollContainer) {
        startDismissTimer();
        return;
      }

      scrollContainer.scrollTop = 0;
      const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);

      if (maxScroll <= 1) {
        startDismissTimer();
        return;
      }

      const scrollDuration = Math.min(3000, Math.max(1500, maxScroll * 14));
      const startTime = performance.now();

      const animateScroll = (now: number) => {
        const progress = Math.min(1, (now - startTime) / scrollDuration);
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        scrollContainer.scrollTop = maxScroll * eased;

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animateScroll);
        } else {
          startDismissTimer();
        }
      };

      animationFrame = window.requestAnimationFrame(animateScroll);
    });

    return () => {
      window.cancelAnimationFrame(setupFrame);
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(hideTimer);
      window.clearTimeout(exitTimer);
    };
  }, [hudHovered, hudVisible, hudItems]);

  const updateParam = (key: keyof OrdinaryTableParams, value: number) => {
    setPreviewVariantId(null);
    setSelectedVariantId(null);
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const showHudChanges = (changes: HudChangeItem[]) => {
    if (changes.length === 0) return;
    setHudItems(changes);
    setHudExiting(false);
    setHudVisible(true);
  };

  const requestPreciseModel = async (nextParams: TableParams, signal?: AbortSignal) => {
    try {
      const baseParams = extractBaseTableParams(nextParams);
      const response = await fetch(buildApiUrl('/api/compute'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          ...buildComputePayload(baseParams),
          material,
        }),
      });

      if (!response.ok) {
        throw new Error(`Compute request failed with status ${response.status}`);
      }

      const data = await response.json();
      return await parseComputeApiResponse(data as ComputeApiResponse);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      console.error('Precise model export failed:', error);
      return null;
    }
  };

  const requestVariants = async (prompt: string, baseParams: TableParams, variantCount?: number) => {
    const baseTableParams = extractBaseTableParams(baseParams);
    const response = await fetch(buildApiUrl('/api/generate-variants'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        baseParams: baseTableParams,
        material,
        variantCount,
      }),
    });

    if (!response.ok) {
      throw new Error(`Variant request failed with status ${response.status}`);
    }

    const data = (await response.json()) as GenerateVariantsApiResponse;
    if (!data.success) {
      throw new Error(data.error || 'Failed to generate variants');
    }

    return data;
  };

  const handleExportPreciseModel = async () => {
    if (isExportingPreciseModel) return;

    setIsExportingPreciseModel(true);
    const requestId = ++computeRequestIdRef.current;

    try {
      const result = await requestPreciseModel(params);
      if (result && computeRequestIdRef.current === requestId) {
        setPreciseModelData(result.model);
        setQuote(result.quote);
        setStructureAssessment(result.structureAssessment);
      }
    } finally {
      if (computeRequestIdRef.current === requestId) {
        setIsExportingPreciseModel(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++computeRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      setIsExportingPreciseModel(true);
      const result = await requestPreciseModel(params, controller.signal);
      if (!controller.signal.aborted && result && computeRequestIdRef.current === requestId) {
        setPreciseModelData(result.model);
        setQuote(result.quote);
        setStructureAssessment(result.structureAssessment);
      }
      if (!controller.signal.aborted && computeRequestIdRef.current === requestId) {
        setIsExportingPreciseModel(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [material, params]);

  const handlePreviewVariant = (variantId: string) => {
    setPreviewVariantId(variantId);
  };

  const handleReturnToCurrentScheme = () => {
    setPreviewVariantId(null);
  };

  const handleUseVariant = (variant: VariantCardData) => {
    setPreviewVariantId(null);
    setSelectedVariantId(variant.id);
    // 候选方案只覆盖主体桌体参数，保留前端侧的定制开关和定制配置。
    setParams((prev) => ({
      ...prev,
      ...variant.params,
    }));
    if (variant.model) {
      setPreciseModelData(variant.model);
    }
    if (variant.quote) {
      setQuote(variant.quote);
    }
    if (variant.structureAssessment) {
      setStructureAssessment(variant.structureAssessment);
    }
  };

  const handleGenerateVariants = async (prompt: string, variantCount?: number) => {
    if (!prompt || isGeneratingVariants) return;
    setIsGeneratingVariants(true);
    try {
      const response = await requestVariants(prompt, params, variantCount);
      const parsedVariants = await parseVariantApiResponse(response);
      setVariantCards(parsedVariants);
      setPreviewVariantId(null);
      setSelectedVariantId(null);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.message || '我整理了几套可直接比较的方案。',
          variants: parsedVariants,
        },
      ]);
    } catch (error) {
      console.error('Variant generation error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '生成方案时出现问题，请稍后再试。' },
      ]);
    } finally {
      setIsGeneratingVariants(false);
    }
  };

  const handleSendMessage = async () => {
    const userMessage = inputValue.trim();
    if (!userMessage || isTyping) return;

    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsTyping(true);
    try {
      const response = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          currentParams: extractBaseTableParams(params),
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = (await response.json()) as ChatApiResponse;
      console.debug('Chat API raw response:', data);
      console.debug('LLM raw payload:', data.debugRaw);
      const functionCalls = data.functionCalls;

      if (data.mode === 'variants') {
        const parsedVariants = await parseVariantApiResponse({
          success: true,
          message: data.text,
          variants: data.variants,
        });
        setVariantCards(parsedVariants);
        setPreviewVariantId(null);
        setSelectedVariantId(null);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.text || '我整理了几套方案，你可以直接比较。',
            variants: parsedVariants,
          },
        ]);
        return;
      }

      if (functionCalls) {
        let appliedParamUpdate = false;
        for (const call of functionCalls) {
          if (call.name === 'update_table_params') {
            const args = call.args as Partial<OrdinaryTableParams>;
            setParams((prev) => {
              const changes = getChangedParamEntries(prev, args);
              showHudChanges(changes);
              return { ...prev, ...args };
            });
            appliedParamUpdate = true;
          }
        }
        const assistantText = data.text?.trim();
        if (assistantText) {
          setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
        } else if (appliedParamUpdate) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '参数已更新。你可以继续细调，或让我解释这次调整的取向' },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.text || '我会继续协助你完成这张桌子的定制' },
        ]);
      }
    } catch (error) {
      console.error('AI Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '处理请求时出现问题，请稍后再试'},
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const currentTabSection = LEFT_TABS.find((tab) => tab.id === leftTab) ?? LEFT_TABS[0];
  const currentPrice = quote ? `¥${quote.totalPrice.toLocaleString()}` : '—';
  const leadTime = quote ? quote.leadTime : '—';
  const previewVariant = previewVariantId ? variantCards.find((variant) => variant.id === previewVariantId) ?? null : null;
  const displayedPreciseModelData = previewVariant?.model ?? preciseModelData;

  return (
    <div className="min-h-screen bg-[#faf6ef] text-[#2e2823] selection:bg-[#e63b2e]/20 lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 border-[#42241C] lg:h-screen lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)_54px]">
        <aside className="flex min-h-0 flex-col border-b border-r border-[#42241C] lg:row-span-2 lg:border-b-0">
          <div className="border-b border-[#42241C] px-8 py-7">
            <div className="text-brand-title text-[#42241C]">
              RESONANCE<span className="text-[#e63b2e]">.</span>
            </div>
            <div className="mt-3 text-brand-subtitle text-[#8f867a]">BESPOKE FURNITURE</div>
          </div>

          <div className="grid grid-cols-3 border-b border-[#42241C]">
            {LEFT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeftTab(tab.id)}
                className={cn(
                  'flex items-center justify-center px-2 py-3',
                  leftTab === tab.id ? 'text-[#42241C]' : 'text-[#8f867a] hover:text-[#42241C]',
                )}
              >
                <span className="text-ui-tab">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-7">
            <div className="flex flex-col gap-8">
              {SLIDER_SECTIONS[leftTab].map((field) => {
                const limits = ORDINARY_LIMITS[field.key];
                return (
                  <CustomSlider
                    key={field.key}
                    label={field.label}
                    value={params[field.key]}
                    min={limits.min}
                    max={limits.max}
                    step={limits.step}
                    unit={field.unit}
                    displayMul={field.displayMul ?? 1}
                    onChange={(value) => updateParam(field.key, value)}
                  />
                );
              })}
            </div>

            {leftTab === 'dimensions' ? (
              <div className="mt-8 ">
                <div className="text-heading-panel text-[#8f867a]">MATERIAL</div>
                <div className="mt-4 flex gap-3">
                  {MATERIAL_OPTIONS.map((option) => (
                    <MaterialCard
                      key={option.id}
                      option={option}
                      active={material === option.id}
                      onClick={() => setMaterial(option.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 border-t border-[#42241C]">
            <BottomMetric label="EST. PRICE" value={currentPrice} accent />
            <BottomMetric label="LEAD TIME" value={leadTime} />
          </div>
        </aside>

        <main className="relative min-h-[420px] border-b border-[#42241C] lg:min-h-0 lg:border-b-0">
          <div className="absolute inset-0 z-0">
            <TableCanvas ref={tableCanvasRef} params={params} material={material} preciseModelData={displayedPreciseModelData} />
          </div>

          {hudVisible && hudItems.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 top-10 z-30 flex justify-center">
              <div
                className={cn(
                  'pointer-events-auto flex min-w-[380px] max-w-[640px] flex-col overflow-hidden border border-[#42241C] bg-[#f7f2ea]/96 px-6 py-5 shadow-[0_22px_80px_rgba(66,36,28,0.12)] backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  hudExiting
                    ? '-translate-y-6 scale-[0.96] opacity-0 blur-[2px]'
                    : 'translate-y-0 scale-100 opacity-100 blur-0',
                )}
                style={{ maxHeight: '220px' }}
                onMouseEnter={() => setHudHovered(true)}
                onMouseLeave={() => setHudHovered(false)}
              >
                <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#e63b2e]">PARAMETERS UPDATED</div>
                <div ref={hudScrollRef} className="custom-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {hudItems.map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-[120px_1fr_20px_1fr] items-center gap-3 border-b border-[#dfd2c2] py-3 last:border-b-0"
                    >
                      <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#8f867a]">{item.label}</span>
                      <span className="text-center font-mono text-[10px] uppercase tracking-[0.06em] text-[#a79a8a]">{item.previousValue}</span>
                      <span className="text-center font-mono text-[10px] uppercase tracking-[0.04em] text-[#e63b2e]">→</span>
                      <span className="text-center font-mono text-[10px] uppercase tracking-[0.06em] text-[#42241C]">{item.nextValue}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-4 top-8 bottom-4 z-10 lg:inset-x-6 lg:top-8 lg:bottom-4">
            <div className="absolute left-0 top-[-18px] font-mono text-[8px] uppercase tracking-[0.22em] text-[#8f867a]">
              3D PREVIEW
            </div>
            <div className="absolute right-0 top-[-18px] font-mono text-[8px] uppercase tracking-[0.16em] text-[#e63b2e]">
              {previewVariant ? `PREVIEWING ${previewVariant.name.toUpperCase()}` : preciseModelData ? 'RHINO MODEL SYNCED' : 'LIVE PARAMETRIC VIEW'}
            </div>
            <div className="absolute left-0 top-0 h-[14px] w-[14px] border-l border-t border-[#8f867a]" />
            <div className="absolute right-0 top-0 h-[14px] w-[14px] border-r border-t border-[#8f867a]" />
            <div className="absolute bottom-0 left-0 h-[14px] w-[14px] border-b border-l border-[#8f867a]" />
            <div className="absolute bottom-0 right-0 h-[14px] w-[14px] border-b border-r border-[#8f867a]" />
          </div>

          {activeTab === 'quote' ? (
            <div className="absolute inset-0 z-20 bg-[#f7f2ea] px-8 pt-8 pb-8">
              <div className="h-full overflow-y-auto border border-[#42241C] bg-[#f7f2ea] p-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="text-heading-panel text-[#42241C]">QUOTE SUMMARY</div>
                  <p className="mt-3 font-serif text-[12px] leading-6 text-[#6d6257]">基于当前参数估算价格与结构表现，方便你快速判断这套桌子的成本区间和使用稳定性。</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#42241C] pt-4">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8f867a]">稳定评分</div>
                      <div className="mt-2 text-[34px] leading-none text-[#42241C]">{structureAssessment?.stability_score ?? '—'}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8f867a]">结构等级</div>
                      <div className="mt-2 text-[22px] text-[#42241C]">{formatStructureLevel(structureAssessment?.structure_level)}</div>
                    </div>
                  </div>
                  {structureAssessment?.risk_tags?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {structureAssessment.risk_tags.map((tag) => (
                        <span key={tag} className="border border-[#d5c6b6] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#7d766b]">{STRUCTURE_RISK_LABELS[tag] ?? tag}</span>
                      ))}
                    </div>
                  ) : null}
                  {structureAssessment?.recommendations?.length ? (
                    <div className="mt-4 space-y-2 border-t border-[#42241C] pt-4">
                      {structureAssessment.recommendations.map((item, index) => (
                        <p key={`${item}-${index}`} className="font-serif text-[12px] leading-6 text-[#6d6257]">{item}</p>
                      ))}
                    </div>
                  ) : null}
                  {quote?.breakdown?.length ? (
                    <div className="mt-4 space-y-2 border-t border-[#42241C] pt-4">
                      {quote.breakdown.map((item) => (
                        <div key={item.label} className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#7d766b]">
                          <span>{QUOTE_BREAKDOWN_LABELS[item.label] ?? item.label}</span>
                          <span className="text-[11px] text-[#42241C]">¥{item.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
              </div>
            </div>
          ) : null}
        </main>

        <aside className="flex min-h-[420px] flex-col border-l border-r border-[#42241C] bg-[#faf7f1] lg:row-span-2 lg:min-h-0">
          <div className="flex items-center gap-3 border-b border-[#42241C] px-6 py-4">
            <div className="text-heading-assistant text-[#42241C]">Design Notes</div>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto px-7 py-6">
            <div className="flex flex-col gap-6">
              {messages.map((message, index) => {
                const isAssistant = message.role === 'assistant';
                return (
                  <div key={`${message.role}-${index}`} className={cn('flex w-full flex-col gap-1.5', isAssistant ? 'items-start' : 'items-end')}>
                    <div
                      className={cn(
                        'chat-note-label',
                        isAssistant ? 'text-[#9f978d]' : 'text-[#b0a698]',
                      )}
                    >
                      {isAssistant ? "Editor's Insight" : 'Inquiry'}
                    </div>
                    <div
                      className={cn(
                        'chat-note-block max-w-[88%] rounded-[8px] px-4 py-3 text-[13px] leading-5 shadow-[0_10px_30px_rgba(66,36,28,0.05)]',
                        isAssistant
                          ? 'w-full rounded-l-none border border-[#e7ddd1] border-l-[3px] border-l-[#D43A2F] bg-[#fffdf9] text-[#332b25]'
                          : 'ml-auto border border-[#d8cbbd] bg-[#f0e7dc] text-[#5b3728]',
                      )}
                    >
                      {message.content}
                    </div>
                    {isAssistant && message.variants?.length ? (
                      <div className="mt-1 flex w-full max-w-[88%] flex-col gap-2 rounded-[8px] border border-[#eadfce] bg-[#f8f2e9] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f867a]">Schemes</div>
                          {previewVariantId ? (
                            <button
                              type="button"
                              onClick={handleReturnToCurrentScheme}
                              className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7b4b38] transition-colors hover:text-[#42241C]"
                            >
                              Return
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2">
                          {message.variants.map((variant) => {
                            const isPreview = previewVariantId === variant.id;
                            const isSelected = selectedVariantId === variant.id;
                            return (
                              <div
                                key={variant.id}
                                className={cn(
                                  'rounded-[6px] border px-3 py-2',
                                  isPreview || isSelected ? 'border-[#42241C] bg-[#fffaf3]' : 'border-[#e2d6c7] bg-[#fcf8f2]',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[12px] leading-5 text-[#42241C]">{variant.name}</div>
                                    <p className="mt-0.5 text-[11px] leading-5 text-[#6d6257]">{variant.consumer_summary}</p>
                                  </div>
                                  {!variant.success ? (
                                    <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#b04f3a]">Fail</span>
                                  ) : null}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-4 text-[#7d766b]">
                                  <span>¥ {variant.quote ? variant.quote.totalPrice.toLocaleString() : '—'}</span>
                                  <span>稳 {variant.scores.stability}</span>
                                  <span>轻 {variant.scores.lightness}</span>
                                  <span>质 {variant.scores.premium_feel}</span>
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    disabled={!variant.success || !variant.model}
                                    onClick={() => handlePreviewVariant(variant.id)}
                                    className="border border-[#cdb9a5] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#5b3728] transition-colors hover:bg-[#efe4d7] disabled:opacity-40"
                                  >
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!variant.success}
                                    onClick={() => handleUseVariant(variant)}
                                    className="border border-[#42241C] bg-[#42241C] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#faf6ef] transition-colors hover:bg-[#5a3022] disabled:opacity-40"
                                  >
                                    Use
                                  </button>
                                </div>
                                {!variant.success && variant.error ? (
                                  <p className="mt-1 text-[10px] leading-4 text-[#b04f3a]">{variant.error}</p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {isTyping ? (
                <div className="flex flex-col items-start gap-2.5">
                  <div className="chat-note-label text-[#9f978d]">Editor&apos;s Insight</div>
                  <div className="flex items-center gap-3 text-[#7b7368]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#e63b2e]" />
                    <span className="chat-note-block text-[11px]">Refining the next note...</span>
                  </div>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSendMessage();
            }}
            className="h-[54px] border-t border-[#42241C] bg-[#fcfaf6]"
          >
            <div className="relative h-full">
              <input
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                disabled={isTyping}
                placeholder="询问比例、工艺、材质或设计建议..."
                className="chat-input-text h-full w-full border-0 bg-[#fcfaf6] px-6 pr-14 text-[#5a4d43] placeholder:text-[#8f867a] outline-none"
              />
              <button
                type="submit"
                disabled={isTyping || isGeneratingVariants || !inputValue.trim()}
                className="absolute right-0 top-0 flex h-full w-[54px] items-center justify-center border-l border-[#42241C] text-[#b8aea1] transition-colors duration-150 hover:bg-[#f1e7db] hover:text-[#42241C] active:bg-[#e8dccd] disabled:opacity-40"
              >
                <Send className="h-[14px] w-[14px]" strokeWidth={1.8} />
              </button>
            </div>
          </form>
        </aside>

        <div className="flex h-[54px] items-stretch border-t border-[#42241C] lg:col-start-2 lg:row-start-2">
          <button
            type="button"
            onClick={() => void handleExportPreciseModel()}
            disabled={isExportingPreciseModel}
            className="flex min-w-[236px] items-center justify-center gap-3 bg-[#5a3022] px-6 text-ui-button text-[#fbf6ef] transition-colors duration-150 hover:text-[#f3d5c6] disabled:cursor-wait disabled:bg-[#9e7e6f]"
          >
            {isExportingPreciseModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
            <span>{isExportingPreciseModel ? 'EXPORTING' : 'FROM RHINO'}</span>
          </button>

          <div className="grid flex-1 grid-cols-2">
            {BOTTOM_NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'flex min-w-[78px] items-center justify-center px-4 transition-colors duration-150',
                    active ? 'text-[#42241C]' : 'text-[#8f867a] hover:text-[#42241C]',
                  )}
                >
                  <span className="text-nav-item">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


