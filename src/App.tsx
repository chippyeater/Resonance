/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import rhino3dm from 'rhino3dm';
import rhino3dmWasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingCart, 
  User, 
  Maximize2, 
  Box, 
  MessageSquare, 
  Settings2,
  ChevronRight,
  ChevronLeft,
  Check,
  Send,
  Loader2,
  Compass,
  Sparkles,
  Palette,
  MessageCircle,
  LayoutGrid,
  ShoppingBag,
  UserCircle
} from 'lucide-react';
import { cn } from './lib/utils';
import confetti from 'canvas-confetti';

// --- Types & Constants ---

type LegFamily = 'straight' | 'hoof' | 'curved';
type LegSection = 'square' | 'round';
type WoodType = 'black-walnut' | 'traditional-rosewood';

interface TableParams {
  length: number; // in meters
  width: number; // in meters
  height: number; // in meters
  legFamily: LegFamily;
  legSection: LegSection;
  legThickness: number; // 0-1
  woodLightness: number; // 0.15-0.75
  edgeCurve: number; // 0-1
  legTaper: number; // 0-1
  hoofIntensity: number; // 0-1
  legCurve: number; // 0-1
  curveBalance: number; // 0-1
  frameHeight: number; // 0-1
  waistHeight: number; // 0-1
  waistInset: number; // 0-1
  waistLineHeight: number; // 0-1
  waistLineDepth: number; // 0-1
  apronHeight: number; // 0-1
  apronThick: number; // 0-1
  archDepth: number; // -1 to 1
  archShape: number; // 0-1
  woodType: WoodType;
  lustre: 'matte-silk' | 'high-gloss';
}

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

interface ParamChange {
  key: string;
  oldVal: any;
  newVal: any;
}

const formatParamName = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

const formatParamValue = (val: any) => {
  if (typeof val === 'number') return val.toFixed(2);
  return val;
};

const DEFAULTS: TableParams = {
  length: 1.22,
  width: 0.56,
  height: 0.7,
  legFamily: 'straight',
  legSection: 'square',
  legThickness: 0.4,
  woodLightness: 0.42,
  edgeCurve: 0.35,
  legTaper: 0.4,
  hoofIntensity: 0.32,
  legCurve: 0.45,
  curveBalance: 0.5,
  frameHeight: 0.68,
  waistHeight: 0.32,
  waistInset: 0.28,
  waistLineHeight: 0.38,
  waistLineDepth: 0.34,
  apronHeight: 0.38,
  apronThick: 0.45,
  archDepth: 0.35,
  archShape: 0.25,
  woodType: 'black-walnut',
  lustre: 'matte-silk',
};

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

const WOOD_COLORS = {
  'black-walnut': '#3D2B1F',
  'traditional-rosewood': '#5C1A1A',
};

const derivePreviewParams = (params: OrdinaryTableParams): TableParams => {
  const legWidthNormalized = THREE.MathUtils.clamp((params.leg_width - 0.01) / 0.19, 0, 1);
  const roundNormalized = THREE.MathUtils.clamp((params.round - 0.01) / 0.49, 0, 1);
  const frameThicknessNormalized = THREE.MathUtils.clamp((params.frame_thickness - 0.01) / 0.09, 0, 1);
  const frameInsetNormalized = THREE.MathUtils.clamp(params.frame_inset / 0.1, 0, 1);
  const frameEdgeNormalized = THREE.MathUtils.clamp((params.frame_edge_thickness - 0.002) / 0.023, 0, 1);

  return {
    ...DEFAULTS,
    length: params.length,
    width: params.width,
    height: params.leg_height + 0.045,
    legFamily: 'straight',
    legSection: 'square',
    legThickness: legWidthNormalized,
    edgeCurve: roundNormalized,
    legTaper: THREE.MathUtils.clamp(params.leg_tiptoe_degree, 0, 1),
    frameHeight: frameThicknessNormalized,
    waistInset: frameInsetNormalized,
    apronThick: frameEdgeNormalized,
    waistHeight: 0.18,
    waistLineHeight: 0.1,
    waistLineDepth: 0.08,
    apronHeight: 0.72,
    archDepth: 0,
    archShape: 0.25,
  };
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

const rhinoModulePromise = (rhino3dm as unknown as (config?: { locateFile?: (fileName: string) => string }) => Promise<any>)({
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

const isRhinoMesh = (value: any, rhino: any) => {
  return Boolean(value && rhino?.Mesh && value instanceof rhino.Mesh);
};

const extractPreciseMeshData = (mesh: any, unitScale = 1): PreciseMeshData => {
  const vertices = mesh.vertices();
  const faces = mesh.faces();
  const vertexCount = getRhinoListCount(vertices);
  const faceCount = getRhinoListCount(faces);
  const flattenedVertices: number[] = [];
  const flattenedFaces: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const vertex = vertices.get(i);
    const x = getRhinoNumber(vertex, ['x', 'X', 0]) * unitScale;
    const y = getRhinoNumber(vertex, ['y', 'Y', 1]) * unitScale;
    const z = getRhinoNumber(vertex, ['z', 'Z', 2]) * unitScale;
    flattenedVertices.push(
      x,
      z,
      -y,
    );
  }

  for (let i = 0; i < faceCount; i++) {
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
  const outputType = outputItem?.type;
  const meshDataString = outputItem?.data;

  if (outputType !== 'Rhino.Geometry.Mesh') {
    throw new Error(`Expected Rhino.Geometry.Mesh, received ${outputType ?? 'unknown output type'}.`);
  }

  if (typeof meshDataString !== 'string') {
    throw new Error('Compute response did not include serialized mesh data.');
  }

  const rhino = await rhinoModulePromise;
  const meshObject = rhino.CommonObject.decode(JSON.parse(meshDataString));

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

  console.info('Precise model decoded', {
    outputName: deskOutput?.ParamName,
    innerTreePathCount: paths.length,
    meshItemCount,
    modelUnits: result?.modelunits,
    unitScale,
    meshCount: meshes.length,
    vertexCount: meshes.reduce((sum, mesh) => sum + mesh.vertices.length / 3, 0),
    triangleCount: meshes.reduce((sum, mesh) => sum + mesh.faces.length / 3, 0),
  });

  return {
    outputName: deskOutput?.ParamName ?? 'unknown',
    modelUnits: result?.modelunits,
    unitScale,
    branchCount: paths.length,
    meshItemCount,
    meshes,
  };
};

// --- 3D Component ---

const TableCanvas = ({ params, preciseModelData }: { params: OrdinaryTableParams; preciseModelData: PreciseModelData | null }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const tableGroupRef = useRef<THREE.Group | null>(null);
  const preciseMeshGroupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Helper functions from snippet
  const woodColor = (type: WoodType, lightness: number) => {
    const l = THREE.MathUtils.clamp(lightness, 0.15, 0.75);
    const base = new THREE.Color(type === 'black-walnut' ? 0x3D2B1F : 0x5C1A1A);
    const lift = new THREE.Color(type === 'black-walnut' ? 0xc4a574 : 0xd48a8a);
    return base.clone().lerp(lift, l);
  };

  const smoothStep01 = (a: number, b: number, x: number) => {
    return THREE.MathUtils.smoothstep(x, a, b);
  };

  const getCurvedLegOffset = (t: number, amplitude: number, balance: number) => {
    const shoulder = amplitude * (0.4 + (1 - balance) * 0.2);
    const knee = -amplitude * (0.1 + balance * 0.2);
    const foot = amplitude * (0.2 + balance * 0.15);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(shoulder, 0.25, 0),
      new THREE.Vector3(knee, -0.15, 0),
      new THREE.Vector3(foot, -0.5, 0),
    ]);

    return curve.getPoint(t).x;
  };

  const createLegGeometry = (p: {
    family: LegFamily;
    section: LegSection;
    thickness: number;
    height: number;
    taper: number;
    hoofIntensity: number;
    legCurve: number;
    curveBalance: number;
    x: number;
    z: number;
  }) => {
    const ringSides = p.section === "round" ? 12 : 4;
    const ySegments = p.family === "straight" ? 8 : 16;
    const positions = [];
    const indices = [];
    const topY = p.height * 0.5;
    const radius = p.thickness * 0.5;
    let topCenterX = 0, topCenterZ = 0;
    let bottomCenterX = 0, bottomCenterZ = 0;

    const angle = Math.atan2(p.z, p.x);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let iy = 0; iy <= ySegments; iy++) {
      const t = iy / ySegments;
      const y = THREE.MathUtils.lerp(topY, -topY, t);

      let centerX = 0;
      let scale = 1;

      if (p.family === "straight") {
        scale = THREE.MathUtils.lerp(1, Math.max(1 - p.taper * 0.72, 0.28), t);
      } else if (p.family === "hoof") {
        // Traditional "鼓腿彭牙" (Bulging leg with inward hoof)
        // Upper bulge (outward)
        const bulge = Math.sin(t * Math.PI) * 0.15; 
        // Lower kick (inward)
        const lowerKick = smoothStep01(0.6, 1, t);
        
        // Combine outward bulge and inward hoof
        centerX = (bulge - lowerKick * 0.4) * p.thickness * p.hoofIntensity;
        
        // Scale tapers down, then flares slightly at the hoof
        scale = THREE.MathUtils.lerp(1, Math.max(1 - p.taper * 0.4, 0.4), t) + p.hoofIntensity * 0.2 * lowerKick;
      } else {
        centerX = getCurvedLegOffset(t, p.legCurve * p.height * 0.15, p.curveBalance);
        scale = THREE.MathUtils.lerp(1, 0.85, t);
      }

      const half = radius * scale;
      const bendX = centerX * cosA;
      const bendZ = centerX * sinA;

      if (iy === 0) {
        topCenterX = bendX;
        topCenterZ = bendZ;
      }
      if (iy === ySegments) {
        bottomCenterX = bendX;
        bottomCenterZ = bendZ;
      }

      for (let is = 0; is < ringSides; is++) {
        let localX;
        let localZ;
        if (p.section === "round") {
          const a = (is / ringSides) * Math.PI * 2;
          localX = Math.cos(a) * half;
          localZ = Math.sin(a) * half;
        } else {
          const corners = [
            [-half, -half],
            [half, -half],
            [half, half],
            [-half, half],
          ];
          [localX, localZ] = corners[is];
        }
        positions.push(bendX + localX, y, bendZ + localZ);
      }
    }

    for (let iy = 0; iy < ySegments; iy++) {
      const row = iy * ringSides;
      const nextRow = (iy + 1) * ringSides;
      for (let is = 0; is < ringSides; is++) {
        const a = row + is;
        const b = row + ((is + 1) % ringSides);
        const c = nextRow + is;
        const d = nextRow + ((is + 1) % ringSides);
        indices.push(a, d, c, a, b, d);
      }
    }

    const topCenterIndex = positions.length / 3;
    positions.push(topCenterX, topY, topCenterZ);
    const bottomCenterIndex = positions.length / 3;
    positions.push(bottomCenterX, -topY, bottomCenterZ);

    for (let is = 0; is < ringSides; is++) {
      const next = (is + 1) % ringSides;
      indices.push(topCenterIndex, is, next);
      const base = ySegments * ringSides;
      indices.push(bottomCenterIndex, base + next, base + is);
    }

    let geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    
    if (p.section === "square") {
      geom = geom.toNonIndexed();
    }
    
    geom.computeVertexNormals();
    return geom;
  };

  const apronLowerContourY = (x: number, w: number, h: number, archDepth: number, archShape: number) => {
    const halfW = w * 0.5;
    if (w <= 1e-9 || h <= 1e-9) return -h * 0.5;

    const d = THREE.MathUtils.clamp(archDepth, -1, 1);
    if (Math.abs(d) <= 1e-10) return -h * 0.5;

    const s = Math.min(Math.abs(x) / halfW, 1);
    const sh = THREE.MathUtils.clamp(archShape, 0, 1);

    const shoulder = THREE.MathUtils.lerp(0.28, 0.45, sh);

    let profile;
    if (s < shoulder) {
      const t = s / shoulder;
      profile = 1 - 0.25 * t * t;
    } else {
      const t = (s - shoulder) / (1 - shoulder);
      profile = 0.75 * (1 - t) * (1 - t);
    }

    return -h * 0.5 + h * 0.48 * d * profile;
  };

  const createApronStripGeometry = (span: number, h: number, thickness: number, archDepth: number, archShape: number) => {
    const ad = THREE.MathUtils.clamp(archDepth, -1, 1);
    if (Math.abs(ad) <= 1e-8) {
      return new THREE.BoxGeometry(span, h, thickness);
    }

    const w = span;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, h / 2);
    shape.lineTo(-w / 2, apronLowerContourY(-w / 2, w, h, ad, archShape));
    const n = 48;
    for (let i = 1; i < n; i++) {
      const px = -w / 2 + (w * i) / n;
      shape.lineTo(px, apronLowerContourY(px, w, h, ad, archShape));
    }
    shape.lineTo(w / 2, apronLowerContourY(w / 2, w, h, ad, archShape));
    shape.lineTo(w / 2, h / 2);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      steps: 1,
      bevelEnabled: false,
    });
    geom.translate(0, 0, -thickness / 2);
    return geom;
  };

  const addRectRing = (group: THREE.Group, material: THREE.Material, spanX: number, spanZ: number, bandH: number, bandD: number, yCenter: number) => {
    const sideSpanZ = Math.max(spanZ - bandD * 2, bandD);

    const front = new THREE.Mesh(new THREE.BoxGeometry(spanX, bandH, bandD), material);
    front.position.set(0, yCenter, spanZ * 0.5 - bandD * 0.5);
    front.castShadow = true;
    front.receiveShadow = true;
    group.add(front);

    const back = new THREE.Mesh(new THREE.BoxGeometry(spanX, bandH, bandD), material);
    back.position.set(0, yCenter, -spanZ * 0.5 + bandD * 0.5);
    back.castShadow = true;
    back.receiveShadow = true;
    group.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(bandD, bandH, sideSpanZ), material);
    left.position.set(-spanX * 0.5 + bandD * 0.5, yCenter, 0);
    left.castShadow = true;
    left.receiveShadow = true;
    group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(bandD, bandH, sideSpanZ), material);
    right.position.set(spanX * 0.5 - bandD * 0.5, yCenter, 0);
    right.castShadow = true;
    right.receiveShadow = true;
    group.add(right);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#FEF9F0');
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      42,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.08,
      80
    );
    camera.position.set(2.1, 1.35, 2.4);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false; // Disabled for Studio Softbox look
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    
    // Clear any existing canvases (e.g. from React strict mode double render or HMR)
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controls.target.set(0, 0.4, 0);
    controlsRef.current = controls;

    // Lighting - Studio Softbox Scheme
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(hemi);

    // Key Light (Main softbox, warm, front-right)
    const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    // Fill Light (Secondary softbox, cool, front-left to soften dark side)
    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.8);
    fillLight.position.set(-4, 3, 4);
    scene.add(fillLight);

    // Rim Light (Backlight to separate from background and highlight edges)
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(0, 4, -5);
    scene.add(rimLight);

    // Floor Grid
    const gridHelper = new THREE.GridHelper(40, 80, 0x888888, 0x888888);
    gridHelper.position.y = 0;
    gridHelper.material.opacity = 0.15;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Invisible plane to receive shadows
    const shadowPlaneGeom = new THREE.PlaneGeometry(40, 40);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.08 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeom, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Table Group
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);
    tableGroupRef.current = tableGroup;

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
      // Safely remove the canvas if it still exists in the container
      if (containerRef.current && renderer.domElement && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Local procedural preview disabled while Rhino Compute drives the live model.
  useEffect(() => {
    if (!tableGroupRef.current) return;
    const group = tableGroupRef.current;
    while (group.children.length > 0) {
      const obj = group.children[0] as THREE.Mesh;
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
      group.remove(obj);
    }

    // Previous procedural table preview intentionally disabled.
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !tableGroupRef.current) return;

    if (preciseMeshGroupRef.current) {
      scene.remove(preciseMeshGroupRef.current);
      preciseMeshGroupRef.current.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
      preciseMeshGroupRef.current = null;
    }

    if (!preciseModelData) return;

    const group = new THREE.Group();
    let addedMeshCount = 0;

    for (const meshData of preciseModelData.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertices, 3));
      geometry.setIndex(meshData.faces);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();

      const material = new THREE.MeshStandardMaterial({
        color: '#8B5E3C',
        roughness: 0.5,
        metalness: 0.04,
        emissive: new THREE.Color('#1f140d'),
        emissiveIntensity: 0.04,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      addedMeshCount += 1;
    }

    let bbox = new THREE.Box3().setFromObject(group);
    const size = bbox.getSize(new THREE.Vector3());

    if (size.z > size.x && params.length > params.width) {
      group.rotation.y = Math.PI / 2;
      bbox = new THREE.Box3().setFromObject(group);
    }

    const center = bbox.getCenter(new THREE.Vector3());
    group.position.set(-center.x, -bbox.min.y, -center.z);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 2;
      }
    });

    scene.add(group);
    preciseMeshGroupRef.current = group;

    console.info('Precise model added to scene', {
      outputName: preciseModelData.outputName,
      innerTreePathCount: preciseModelData.branchCount,
      meshItemCount: preciseModelData.meshItemCount,
      addedMeshCount,
    });

    return () => {
      if (preciseMeshGroupRef.current === group) {
        scene.remove(group);
        group.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        });
        preciseMeshGroupRef.current = null;
      }
    };
  }, [preciseModelData, params.length, params.width]);

  return <div ref={containerRef} className="w-full h-full" />;
};

// --- UI Components ---

const glassPanel = "bg-white/60 border border-white/50 backdrop-blur-xl rounded-[20px] shadow-[0_8px_32px_rgba(110,0,0,0.08)]";

const CustomSlider = ({ 
  label, 
  value, 
  min, 
  max, 
  unit, 
  step = 1,
  displayMul = 1,
  onChange 
}: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  unit: string;
  step?: number;
  displayMul?: number;
  onChange: (val: number) => void;
}) => (
  <div className="w-full flex flex-col gap-3">
    <div className="flex justify-between items-end w-full">
      <label className="text-ui-label-control text-[#6E0000] font-medium">{label}</label>
      <span className="text-ui-value-control text-[#6E0000]/80">{(value * displayMul).toFixed(displayMul === 1 ? 2 : 0)}{unit}</span>
    </div>
    <div className="relative h-4 flex items-center w-full">
      <div className="absolute w-full h-[4px] bg-[#E3BEB8]/40 rounded-full" />
      <input 
        type="range" min={min} max={max} step={step} value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div 
        className="absolute w-4 h-4 bg-[#6E0000] rounded-full shadow-[0_2px_4px_rgba(110,0,0,0.3)] pointer-events-none transition-transform"
        style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 8px)` }}
      />
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [params, setParams] = useState<OrdinaryTableParams>(ORDINARY_DEFAULTS);
  const [preciseModelData, setPreciseModelData] = useState<PreciseModelData | null>(null);
  const [isExportingPreciseModel, setIsExportingPreciseModel] = useState(false);
  const [leftTab, setLeftTab] = useState('DIMENSION');
  const [activeTab, setActiveTab] = useState<'parameters' | 'chat'>('chat');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isPricePanelOpen, setIsPricePanelOpen] = useState(false);
  const [latestChanges, setLatestChanges] = useState<ParamChange[]>([]);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const computeRequestIdRef = useRef(0);

  const startHudTimer = () => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setLatestChanges([]);
    }, 3000);
  };

  const stopHudTimer = () => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
  };
  
  // Chat State
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "欢迎来到明造工坊。我是您的专属营造顾问，今天想了解或定制什么样的明式家具？" }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;

    const userMsg = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          currentParams: params
        })
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      const functionCalls = data.functionCalls;

      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === 'update_table_params') {
            const args = call.args as Record<string, any>;
            
            const changes: ParamChange[] = [];
            Object.entries(args).forEach(([key, newVal]) => {
              const oldVal = (params as Record<string, any>)[key];
              if (oldVal !== newVal) {
                changes.push({ key, oldVal, newVal });
              }
            });

            if (changes.length > 0) {
              setLatestChanges(changes);
              startHudTimer();
            }

            setParams(prev => ({ ...prev, ...(args as Partial<OrdinaryTableParams>) }));
            setMessages(prev => [...prev, { role: 'assistant', content: "我已经根据您的需求更新了家具的定制参数，现在的设计符合您的预期吗？" }]);
          }
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text || "我在这里协助您完成设计。" }]);
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "抱歉，我在处理您的请求时遇到了问题，请重试。" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFinalize = () => {
    setIsFinalizing(true);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#6B705C', '#F8F7F2', '#B7B7A4']
    });
    setTimeout(() => setIsFinalizing(false), 3000);
  };

  const requestPreciseModel = async (nextParams: OrdinaryTableParams, signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/compute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
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
        }),
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

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#FEF9F0] selection:bg-[#6E0000]/10 font-sans">
      {/* 3D Canvas Area */}
      <div className="absolute inset-0 z-0">
        <TableCanvas params={params} preciseModelData={preciseModelData} />
      </div>

      {/* Header Overlay */}
      <div className={cn(glassPanel, "absolute left-[24px] top-[24px] min-w-[320px] h-[72px] flex items-center px-5 gap-4 z-50")}>
        <div className="w-[42px] h-[42px] bg-gradient-to-br from-[#6E0000] to-[#8C1616] rounded-[12px] flex justify-center items-center shadow-[0_8px_16px_-4px_rgba(110,0,0,0.4)]">
          <Compass className="w-[20px] h-[20px] text-[#FEF9F0]" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-brand-title text-[#1D1C16]">明造工坊</h1>
          <span className="text-brand-subtitle text-[#6E0000]/60 mt-0.5">文人书房 · 榫卯定制</span>
        </div>
      </div>

      {/* Customizer Panel */}
      <div className={cn(glassPanel, "absolute left-[24px] top-[112px] bottom-[116px] w-[340px] p-6 flex flex-col gap-5 z-40")}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-[#6E0000]"><Compass className="w-4 h-4" strokeWidth={2.5} /></div>
          <h2 className="text-heading-panel text-[#1D1C16]">定制参数</h2>
        </div>

        <button
          type="button"
          onClick={handleExportPreciseModel}
          disabled={isExportingPreciseModel}
          className="shrink-0 h-[42px] rounded-[12px] bg-gradient-to-r from-[#6E0000] to-[#8C1616] text-white text-ui-button shadow-[0_8px_16px_-6px_rgba(110,0,0,0.35)] disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          {isExportingPreciseModel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
          <span>{isExportingPreciseModel ? 'Exporting...' : 'Export Precise Model'}</span>
        </button>

        {/* Tabs */}
        <div className="flex bg-white/70 rounded-[12px] p-1 h-[40px] items-center w-full justify-between shrink-0 border border-white/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]">
           {[
             { id: 'DIMENSION', label: '基础尺寸' },
             { id: 'FRAME', label: '框架参数' },
             { id: 'LEGS', label: '腿足参数' },
           ].map(tab => (
             <button 
               key={tab.id}
               onClick={() => setLeftTab(tab.id)}
               className={cn("flex-1 rounded-[8px] h-full transition-all flex items-center justify-center", 
                 leftTab === tab.id ? "bg-[#6E0000] text-white shadow-md shadow-[#6E0000]/25" : "text-[#6E0000]/60 hover:bg-white/60 hover:text-[#6E0000]")}
             >
               <span className="text-ui-tab">{tab.label}</span>
             </button>
           ))}
        </div>

        {/* Sliders Area */}
        <div className="flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar pr-3 pb-4">
           {leftTab === 'DIMENSION' && (
             <div className="flex flex-col gap-6 mt-1">
              <CustomSlider label="长度" value={params.length} min={ORDINARY_LIMITS.length.min} max={ORDINARY_LIMITS.length.max} step={ORDINARY_LIMITS.length.step} unit="cm" onChange={(v) => setParams(p => ({ ...p, length: v }))} displayMul={100} />
              <CustomSlider label="宽度" value={params.width} min={ORDINARY_LIMITS.width.min} max={ORDINARY_LIMITS.width.max} step={ORDINARY_LIMITS.width.step} unit="cm" onChange={(v) => setParams(p => ({ ...p, width: v }))} displayMul={100} />
              <CustomSlider label="腿高" value={params.leg_height} min={ORDINARY_LIMITS.leg_height.min} max={ORDINARY_LIMITS.leg_height.max} step={ORDINARY_LIMITS.leg_height.step} unit="cm" onChange={(v) => setParams(p => ({ ...p, leg_height: v }))} displayMul={100} />
              <CustomSlider label="圆角" value={params.round} min={ORDINARY_LIMITS.round.min} max={ORDINARY_LIMITS.round.max} step={ORDINARY_LIMITS.round.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, round: v }))} displayMul={1000} />
             </div>
           )}
           {leftTab === 'FRAME' && (
             <div className="flex flex-col gap-5 mt-1">
              <CustomSlider label="框架厚度" value={params.frame_thickness} min={ORDINARY_LIMITS.frame_thickness.min} max={ORDINARY_LIMITS.frame_thickness.max} step={ORDINARY_LIMITS.frame_thickness.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, frame_thickness: v }))} displayMul={1000} />
              <CustomSlider label="边厚" value={params.frame_edge_thickness} min={ORDINARY_LIMITS.frame_edge_thickness.min} max={ORDINARY_LIMITS.frame_edge_thickness.max} step={ORDINARY_LIMITS.frame_edge_thickness.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, frame_edge_thickness: v }))} displayMul={1000} />
              <CustomSlider label="框架内缩" value={params.frame_inset} min={ORDINARY_LIMITS.frame_inset.min} max={ORDINARY_LIMITS.frame_inset.max} step={ORDINARY_LIMITS.frame_inset.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, frame_inset: v }))} displayMul={1000} />
             </div>
           )}
           {leftTab === 'LEGS' && (
             <div className="flex flex-col gap-5 mt-1">
               <CustomSlider label="腿宽" value={params.leg_width} min={ORDINARY_LIMITS.leg_width.min} max={ORDINARY_LIMITS.leg_width.max} step={ORDINARY_LIMITS.leg_width.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, leg_width: v }))} displayMul={1000} />
               <CustomSlider label="腿开距" value={params.leg_open} min={ORDINARY_LIMITS.leg_open.min} max={ORDINARY_LIMITS.leg_open.max} step={ORDINARY_LIMITS.leg_open.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, leg_open: v }))} displayMul={1000} />
               <CustomSlider label="脚尖度" value={params.leg_tiptoe_degree} min={ORDINARY_LIMITS.leg_tiptoe_degree.min} max={ORDINARY_LIMITS.leg_tiptoe_degree.max} step={ORDINARY_LIMITS.leg_tiptoe_degree.step} unit="" onChange={(v) => setParams(p => ({ ...p, leg_tiptoe_degree: v }))} />
               <CustomSlider label="腿上深" value={params.upper_leg_depth} min={ORDINARY_LIMITS.upper_leg_depth.min} max={ORDINARY_LIMITS.upper_leg_depth.max} step={ORDINARY_LIMITS.upper_leg_depth.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, upper_leg_depth: v }))} displayMul={1000} />
               <CustomSlider label="腿下深" value={params.lower_leg_depth} min={ORDINARY_LIMITS.lower_leg_depth.min} max={ORDINARY_LIMITS.lower_leg_depth.max} step={ORDINARY_LIMITS.lower_leg_depth.step} unit="" onChange={(v) => setParams(p => ({ ...p, lower_leg_depth: v }))} />
               <CustomSlider label="腿肚深" value={params.leg_belly_depth} min={ORDINARY_LIMITS.leg_belly_depth.min} max={ORDINARY_LIMITS.leg_belly_depth.max} step={ORDINARY_LIMITS.leg_belly_depth.step} unit="mm" onChange={(v) => setParams(p => ({ ...p, leg_belly_depth: v }))} displayMul={1000} />
             </div>
           )}
        </div>
      </div>

      {/* Price Card */}
      <div className={cn(glassPanel, "absolute left-[24px] bottom-[24px] w-[340px] h-[76px] flex items-center px-6 justify-between z-40")}>
        <div className="flex flex-col items-start justify-center flex-1">
          <span className="text-stat-label text-[#6E0000]/50 mb-0.5">当前预估价格</span>
          <span className="text-stat-value-primary text-[#1D1C16] tracking-tight">¥12,400</span>
        </div>
        <div className="w-[1px] h-[36px] bg-[#E3BEB8]/60 mx-4" />
        <div className="flex flex-col items-start justify-center flex-1 pl-2">
          <span className="text-stat-label text-[#6E0000]/50 mb-0.5">制作周期</span>
          <span className="text-stat-value-secondary text-[#6E0000]">14-18 个工作日</span>
        </div>
      </div>

      {/* Scholar Assistant Panel */}
      <div className={cn(glassPanel, "absolute right-[24px] top-[24px] bottom-[24px] w-[360px] flex flex-col p-6 z-40")}>
        <div className="flex items-center gap-4 mb-8 shrink-0 pb-2">
          <div className="w-12 h-12 bg-white rounded-full flex justify-center items-center shrink-0 shadow-sm">
            <Sparkles className="w-[22px] h-[22px] text-[#6E0000]" strokeWidth={2.5} />
          </div>
          <h3 className="text-heading-assistant text-[#6E0000]">营造顾问</h3>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-2 mb-6">
          {messages.map((m, i) => {
            const isSystem = m.role === 'assistant';
            return (
              <div key={i} className={cn("flex gap-3", !isSystem && "justify-end")}>
                {isSystem && (
                   <div className="w-8 h-8 rounded-full bg-white flex justify-center items-center shrink-0 shadow-sm mt-2">
                     <UserCircle className="w-[18px] h-[18px] text-[#6E0000]" strokeWidth={2.5} />
                   </div>
                )}
                <div className={cn(
                  "text-chat-message p-4 flex-1 max-w-[282px] shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                  isSystem 
                    ? "bg-[#F8F3EA] rounded-[0_16px_16px_16px] text-[#1D1C16]" 
                    : "bg-[#6E0000] rounded-[16px_0_16px_16px] text-[#FFFFFF]"
                )}>
                  {m.content}
                </div>
                {!isSystem && (
                   <div className="w-8 h-8 rounded-full bg-[#6E0000] flex justify-center items-center shrink-0 shadow-sm mt-2 items-center justify-center">
                     <User className="w-4 h-4 text-white" />
                   </div>
                )}
              </div>
            );
          })}
          {isTyping && (
             <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-white flex justify-center items-center shrink-0 shadow-sm mt-2">
                   <UserCircle className="w-[18px] h-[18px] text-[#6E0000]" strokeWidth={2.5} />
                </div>
                <div className="bg-[#F8F3EA] shadow-[0_1px_2px_rgba(0,0,0,0.05)] rounded-[0_16px_16px_16px] p-4 text-[#1D1C16] flex items-center justify-center">
                   <Loader2 className="w-4 h-4 animate-spin text-[#6E0000]" />
                </div>
             </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="relative shrink-0 mt-3">
          <input 
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            disabled={isTyping}
            placeholder="询问关于形制、材质或设计建议..."
            className="text-chat-input w-full h-[50px] bg-[#E7E2D9]/60 rounded-full pl-5 pr-12 text-[#6E0000] placeholder:text-[#6E0000]/60 outline-none focus:ring-2 focus:ring-[#6E0000]/30 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
          />
          <button 
            type="submit"
            disabled={isTyping || !inputValue.trim()}
            className="absolute right-1.5 top-1.5 w-[38px] h-[38px] bg-gradient-to-br from-[#6E0000] to-[#8C1616] rounded-full flex justify-center items-center shadow-[0_2px_6px_rgba(110,0,0,0.2)] disabled:opacity-50 hover:scale-105 active:scale-95 transition-all"
          >
            <Send className="w-[16px] h-[16px] text-white ml-0.5" />
          </button>
        </form>
      </div>

      {/* Bottom Navbar */}
      <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 bg-white/70 border border-white/60 backdrop-blur-xl shadow-[0_16px_40px_rgba(110,0,0,0.08)] rounded-[16px] p-2 flex items-center gap-1 z-50">
        <button className="flex flex-col items-center justify-center w-[86px] h-[54px] bg-gradient-to-b from-[#8C1616] to-[#6E0000] rounded-[12px] text-white shadow-[0_4px_12px_-2px_rgba(110,0,0,0.3)] transition-transform hover:scale-105 active:scale-95">
           <Palette className="w-[16px] h-[16px] mb-1" />
           <span className="text-nav-item opacity-90">设计</span>
        </button>
        <button className="flex flex-col items-center justify-center w-[86px] h-[54px] rounded-[12px] text-[#57534E] hover:bg-white/60 hover:text-[#6E0000] transition-colors">
           <MessageCircle className="w-[16px] h-[16px] mb-1" />
           <span className="text-nav-item opacity-80">咨询</span>
        </button>
        <button className="flex flex-col items-center justify-center w-[86px] h-[54px] rounded-[12px] text-[#57534E] hover:bg-white/60 hover:text-[#6E0000] transition-colors">
           <LayoutGrid className="w-[16px] h-[16px] mb-1" />
           <span className="text-nav-item opacity-80">展厅</span>
        </button>
        <button className="flex flex-col items-center justify-center w-[86px] h-[54px] rounded-[12px] text-[#57534E] hover:bg-white/60 hover:text-[#6E0000] transition-colors">
           <ShoppingBag className="w-[16px] h-[16px] mb-1" />
           <span className="text-nav-item opacity-80">清单</span>
        </button>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(110, 0, 0, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6E0000; }
      `}} />
    </div>
  );
}
