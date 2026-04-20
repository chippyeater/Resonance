/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import rhino3dm from 'rhino3dm';
import rhino3dmWasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import { Box, Loader2, Send } from 'lucide-react';
import { cn } from './lib/utils';

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

type LeftTab = 'dimensions' | 'frame' | 'legs';
type BottomTab = 'design' | 'assistant' | 'showroom' | 'cart';
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

const LEFT_TABS: Array<{ id: LeftTab; label: string; sectionLabel: string }> = [
  { id: 'dimensions', label: 'BASE', sectionLabel: 'DIMENSIONS' },
  { id: 'frame', label: 'FRAME', sectionLabel: 'STRUCTURE' },
  { id: 'legs', label: 'LEGS', sectionLabel: 'LEG PROFILE' },
];

const BOTTOM_NAV_ITEMS: Array<{ id: BottomTab; label: string }> = [
  { id: 'design', label: 'DESIGN' },
  { id: 'assistant', label: 'ASSISTANT' },
  { id: 'showroom', label: 'SHOWROOM' },
  { id: 'cart', label: 'CART' },
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

const MATERIAL_OPTIONS: Array<{ id: Material; label: string; note: string }> = [
  { id: 'blackwalnut', label: '黑胡桃木', note: 'BLACK WALNUT' },
  { id: 'rosewood', label: '红木', note: 'ROSEWOOD' },
];

const INITIAL_MESSAGES = [
  {
    role: 'assistant' as const,
    content: '欢迎来到 Resonance。我可以根据你的使用场景、尺寸偏好和木作风格，协助完成桌子的定制。',
  },
  {
    role: 'user' as const,
    content: '我想要更传统一点的气质，尺寸先控制在适合两人使用的范围。',
  },
  {
    role: 'assistant' as const,
    content: '可以，当前参数会更偏明式书桌比例。你也可以继续告诉我材质、腿足或框架细节。',
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

const decodeComputeMeshOutput = async (outputItem: any, unitScale: number) => {
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
      if (outputItem?.type !== 'Rhino.Geometry.Mesh') {
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

const calculatePrice = (params: OrdinaryTableParams, material: Material) => {
  const basePrice = material === 'rosewood' ? 14200 : 12400;
  const sizeMultiplier =
    (params.length * params.width * params.leg_height) /
    (ORDINARY_DEFAULTS.length * ORDINARY_DEFAULTS.width * ORDINARY_DEFAULTS.leg_height);
  return Math.round(basePrice * sizeMultiplier);
};

const generateLeadTime = (material: Material) => (material === 'rosewood' ? '16-21 DAYS' : '14-18 DAYS');

const TableCanvas = ({
  params,
  material,
  preciseModelData,
}: {
  params: OrdinaryTableParams;
  material: Material;
  preciseModelData: PreciseModelData | null;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const preciseMeshGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0d0d');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      42,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.08,
      80,
    );
    camera.position.set(2.1, 1.35, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controls.target.set(0, 0.42, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1d16, 0.72));

    const keyLight = new THREE.DirectionalLight(0xc58a63, 1.45);
    keyLight.position.set(4, 3.8, 3.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8c6a54, 0.82);
    fillLight.position.set(-4, 2.6, 4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x5f4636, 0.68);
    rimLight.position.set(0, 3.2, -5);
    scene.add(rimLight);

    const frontLight = new THREE.PointLight(0xf3d9c4, 1.1, 12);
    frontLight.position.set(0, 1.8, 2.6);
    scene.add(frontLight);

    const planeGeometry = new THREE.PlaneGeometry(9, 9);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: '#111111',
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.002;
    scene.add(plane);

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
      planeGeometry.dispose();
      planeMaterial.dispose();
      frontLight.dispose();
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

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
  }, [material, params.length, params.width, preciseModelData]);

  return <div ref={containerRef} className="h-full w-full" />;
};

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
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-end justify-between gap-4">
      <span className="text-ui-label-control text-[#aaaaaa]">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-ui-value-control text-[#f0ebe0]">{formatSliderValue(value, displayMul)}</span>
        <span className="mb-[3px] font-mono text-[8px] uppercase tracking-[0.14em] text-[#555555]">{unit}</span>
      </div>
    </div>
    <div className="relative flex h-4 w-full items-center">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#222222]" />
      <div
        className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-[#e63b2e]"
        style={{ width: `${((value - min) / (max - min)) * 100}%` }}
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
        className="absolute h-[7px] w-[7px] rounded-full bg-[#e63b2e] pointer-events-none"
        style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 3.5px)` }}
      />
    </div>
  </div>
);

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
      'flex-1 border px-4 py-3 text-left transition-colors duration-150',
      active ? 'border-[#555555] bg-[#171717]' : 'border-[#222222] bg-transparent hover:bg-[#171717]',
    )}
  >
    <span className="block font-serif text-[13px] text-[#f0ebe0]">{option.label}</span>
    <span className="mt-1 block font-mono text-[7px] uppercase tracking-[0.14em] text-[#666666]">{option.note}</span>
  </button>
);

const BottomMetric = ({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) => (
  <div className="flex-1 border-r border-[#222222] px-6 py-5 last:border-r-0">
    <div className="text-stat-label text-[#555555]">{label}</div>
    <div className={cn('mt-2 text-stat-value-primary', accent ? 'text-[#e63b2e]' : 'text-[#f0ebe0]')}>{value}</div>
    {hint ? <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#444444]">{hint}</div> : null}
  </div>
);

export default function App() {
  const [params, setParams] = useState<OrdinaryTableParams>(ORDINARY_DEFAULTS);
  const [material, setMaterial] = useState<Material>('blackwalnut');
  const [leftTab, setLeftTab] = useState<LeftTab>('dimensions');
  const [activeTab, setActiveTab] = useState<BottomTab>('design');
  const [preciseModelData, setPreciseModelData] = useState<PreciseModelData | null>(null);
  const [isExportingPreciseModel, setIsExportingPreciseModel] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const computeRequestIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isTyping, messages]);

  const updateParam = (key: keyof OrdinaryTableParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const requestPreciseModel = async (nextParams: OrdinaryTableParams, signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/compute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify(buildComputePayload(nextParams)),
      });

      if (!response.ok) {
        throw new Error(`Compute request failed with status ${response.status}`);
      }

      const data = await response.json();
      return await parsePreciseMeshFromComputeResponse(data);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      console.error('Precise model export failed:', error);
      return null;
    }
  };

  const handleExportPreciseModel = async () => {
    if (isExportingPreciseModel) return;

    setIsExportingPreciseModel(true);
    const requestId = ++computeRequestIdRef.current;

    try {
      const modelData = await requestPreciseModel(params);
      if (modelData && computeRequestIdRef.current === requestId) {
        setPreciseModelData(modelData);
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
      const modelData = await requestPreciseModel(params, controller.signal);
      if (!controller.signal.aborted && modelData && computeRequestIdRef.current === requestId) {
        setPreciseModelData(modelData);
      }
      if (!controller.signal.aborted && computeRequestIdRef.current === requestId) {
        setIsExportingPreciseModel(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [params]);

  const handleSendMessage = async () => {
    const userMessage = inputValue.trim();
    if (!userMessage || isTyping) return;

    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsTyping(true);
    setActiveTab('assistant');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          currentParams: params,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      const functionCalls = data.functionCalls;

      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === 'update_table_params') {
            const args = call.args as Partial<OrdinaryTableParams>;
            setParams((prev) => ({ ...prev, ...args }));
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: '我已经根据你的描述更新了桌子参数。你可以继续微调尺寸，或让我解释这组比例的风格取向。' },
            ]);
          }
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.text || '我会继续协助你完成这张桌子的定制。' },
        ]);
      }
    } catch (error) {
      console.error('AI Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '处理请求时出现问题，请稍后再试。' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const currentTabSection = LEFT_TABS.find((tab) => tab.id === leftTab) ?? LEFT_TABS[0];
  const currentPrice = calculatePrice(params, material);
  const leadTime = generateLeadTime(material);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#f0ebe0] selection:bg-[#e63b2e]/20 lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 border-[#222222] lg:h-screen lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)_54px]">
        <aside className="flex min-h-0 flex-col border-b border-r border-[#222222] lg:row-span-2 lg:border-b-0">
          <div className="border-b border-[#222222] px-8 py-7">
            <div className="text-brand-title text-[#f0ebe0]">
              RESONANCE<span className="text-[#e63b2e]">.</span>
            </div>
            <div className="mt-3 text-brand-subtitle text-[#555555]">BESPOKE FURNITURE</div>
          </div>

          <div className="grid grid-cols-3 border-b border-[#222222]">
            {LEFT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeftTab(tab.id)}
                className={cn(
                  'flex items-center justify-center border-r border-[#222222] px-2 py-3 last:border-r-0',
                  leftTab === tab.id ? 'bg-[#171717] text-[#f0ebe0]' : 'text-[#666666] hover:bg-[#171717] hover:text-[#f0ebe0]',
                )}
              >
                <span className="text-ui-tab">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-7">
            <div className="text-heading-panel text-[#aaaaaa]">{currentTabSection.sectionLabel}</div>
            <div className="mt-6 flex flex-col gap-8">
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

            <div className="mt-10 border-t border-[#222222] pt-6">
              <div className="text-heading-panel text-[#666666]">MATERIAL</div>
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
          </div>

          <div className="grid grid-cols-2 border-t border-[#222222]">
            <BottomMetric label="EST. PRICE" value={`¥${currentPrice.toLocaleString()}`} accent />
            <BottomMetric label="LEAD TIME" value={leadTime} hint="WORKING DAYS" />
          </div>
        </aside>

        <main className="relative min-h-[420px] border-b border-[#222222] lg:min-h-0 lg:border-b-0">
          <div className="absolute inset-0 z-0">
            <TableCanvas params={params} material={material} preciseModelData={preciseModelData} />
          </div>

          <div className="pointer-events-none absolute inset-x-4 top-6 bottom-[92px] z-10 lg:inset-x-6 lg:top-6 lg:bottom-[92px]">
            <div className="absolute left-0 top-0 font-mono text-[8px] uppercase tracking-[0.22em] text-[#555555]">
              3D PREVIEW
            </div>
            <div className="absolute right-0 top-0 font-mono text-[8px] uppercase tracking-[0.16em] text-[#e63b2e]">
              {preciseModelData ? 'RHINO MODEL SYNCED' : 'LIVE PARAMETRIC VIEW'}
            </div>
            <div className="absolute left-0 top-0 h-[14px] w-[14px] border-l border-t border-[#2a2a2a]" />
            <div className="absolute right-0 top-0 h-[14px] w-[14px] border-r border-t border-[#2a2a2a]" />
            <div className="absolute bottom-0 left-0 h-[14px] w-[14px] border-b border-l border-[#2a2a2a]" />
            <div className="absolute bottom-0 right-0 h-[14px] w-[14px] border-b border-r border-[#2a2a2a]" />
          </div>

          {activeTab !== 'design' ? (
            <div className="absolute inset-x-8 top-24 z-20 max-w-[280px] border border-[#222222] bg-[#0d0d0d]/90 p-5 backdrop-blur-sm">
              <div className="text-heading-panel text-[#aaaaaa]">
                {activeTab === 'assistant' && 'DESIGN ASSISTANT'}
                {activeTab === 'showroom' && 'SHOWROOM'}
                {activeTab === 'cart' && 'CONFIG SUMMARY'}
              </div>
              <p className="mt-3 font-serif text-[12px] leading-6 text-[#9d9588]">
                {activeTab === 'assistant' && '右侧对话面板已连接当前参数配置，你的自然语言描述会同步回桌子模型。'}
                {activeTab === 'showroom' && '这里可以继续扩展参考案例、材质图库和细部展示，目前先保留源站的展示入口。'}
                {activeTab === 'cart' && '当前配置已汇总到价格和交期信息，后续可以继续接入下单、导出或报价流程。'}
              </p>
            </div>
          ) : null}
        </main>

        <aside className="flex min-h-[420px] flex-col border-r border-[#222222] lg:row-span-2 lg:min-h-0 lg:border-l">
          <div className="flex items-center gap-3 border-b border-[#222222] px-6 py-6">
            <div className="h-[8px] w-[8px] rounded-full bg-[#e63b2e]" />
            <div className="text-heading-assistant text-[#f0ebe0]">ASSISTANT</div>
          </div>

          <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-6 py-6">
            {messages.map((message, index) => {
              const isAssistant = message.role === 'assistant';
              return (
                <div key={`${message.role}-${index}`} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
                  <div
                    className={cn(
                      'max-w-[88%] border px-5 py-4 chat-message-text',
                      isAssistant
                        ? 'border-[#1e1e1e] bg-[#171717] text-[#f0ebe0]'
                        : 'border-[#2a1b0f] bg-[#1c1208] text-[#c8a97a]',
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              );
            })}

            {isTyping ? (
              <div className="flex justify-start">
                <div className="border border-[#1e1e1e] bg-[#171717] px-5 py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-[#e63b2e]" />
                </div>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSendMessage();
            }}
            className="border-t border-[#222222] px-6 py-5"
          >
            <div className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                disabled={isTyping}
                placeholder="询问比例、工艺、材质或设计建议..."
                className="chat-input-text h-[56px] w-full border border-[#222222] bg-[#0d0d0d] px-4 pr-14 text-[#f0ebe0] placeholder:text-[#555555] outline-none transition-colors duration-150 focus:bg-[#171717]"
              />
              <button
                type="submit"
                disabled={isTyping || !inputValue.trim()}
                className="absolute right-0 top-0 flex h-[56px] w-[56px] items-center justify-center border-l border-[#222222] text-[#666666] transition-colors duration-150 hover:bg-[#171717] hover:text-[#f0ebe0] disabled:opacity-40"
              >
                <Send className="h-[14px] w-[14px]" strokeWidth={1.8} />
              </button>
            </div>
          </form>
        </aside>

        <div className="flex h-[54px] items-stretch border-t border-[#222222] lg:col-start-2 lg:row-start-2">
          <button
            type="button"
            onClick={() => void handleExportPreciseModel()}
            disabled={isExportingPreciseModel}
            className="flex flex-1 items-center justify-center gap-3 bg-[#e63b2e] px-6 text-ui-button text-white transition-colors duration-150 hover:bg-[#c82d22] disabled:cursor-wait disabled:bg-[#9e342a]"
          >
            {isExportingPreciseModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
            <span>{isExportingPreciseModel ? 'EXPORTING' : 'FROM RHINO'}</span>
          </button>

          <div className="grid grid-cols-4 border-l border-[#222222]">
            {BOTTOM_NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'flex min-w-[78px] items-center justify-center border-l border-[#222222] px-4 transition-colors duration-150 first:border-l-0',
                    active ? 'bg-[#171717] text-[#f0ebe0]' : 'text-[#555555] hover:bg-[#171717] hover:text-[#f0ebe0]',
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
