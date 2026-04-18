/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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

const WOOD_COLORS = {
  'black-walnut': '#3D2B1F',
  'traditional-rosewood': '#5C1A1A',
};

// --- 3D Component ---

const TableCanvas = ({ params }: { params: TableParams }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const tableGroupRef = useRef<THREE.Group | null>(null);
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

  // Update Table Geometry
  useEffect(() => {
    if (!tableGroupRef.current) return;
    const group = tableGroupRef.current;
    while (group.children.length > 0) {
      const obj = group.children[0] as THREE.Mesh;
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
      group.remove(obj);
    }

    const p = params;
    const woodMat = new THREE.MeshStandardMaterial({
      color: woodColor(p.woodType, p.woodLightness),
      roughness: p.lustre === 'matte-silk' ? 0.55 : 0.2,
      metalness: 0.02,
      emissive: new THREE.Color(0x1a1410),
      emissiveIntensity: 0.07,
    });

    const topT = 0.045;
    const legH = p.height - topT;
    const minDim = Math.min(p.length, p.width);
    const maxLeg = minDim * 0.14;
    const legTop = THREE.MathUtils.clamp(
      minDim * (0.045 + p.legThickness * 0.1),
      0.028,
      maxLeg
    );
    const inset = Math.max(legTop * 1.35, 0.05);
    const lx = p.length * 0.5 - inset;
    const lz = p.width * 0.5 - inset;

    const edge = THREE.MathUtils.clamp(p.edgeCurve, 0, 1);
    const rMax = Math.min(p.length, p.width) * 0.07;
    const cornerR = edge * edge * rMax;

    let topGeom;
    if (cornerR < 0.0008) {
      topGeom = new THREE.BoxGeometry(p.length, topT, p.width);
    } else {
      topGeom = new RoundedBoxGeometry(p.length, topT, p.width, 3, cornerR);
    }
    const top = new THREE.Mesh(topGeom, woodMat);
    top.position.y = p.height - topT / 2;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const frameH = THREE.MathUtils.clamp(
      legH * (0.08 + p.frameHeight * 0.22),
      0.04,
      Math.min(legH * 0.5, 0.18)
    );
    const frameWeightSum = p.waistHeight + p.apronHeight;
    const waistShare = THREE.MathUtils.clamp(
      frameWeightSum > 1e-6 ? p.waistHeight / frameWeightSum : 0.5,
      0.12,
      0.88
    );
    const waistH = frameH * waistShare;
    const apronH = frameH - waistH;
    const waistInset = THREE.MathUtils.clamp(
      0.01 + p.waistInset * Math.min(p.length, p.width) * 0.08,
      0.01,
      Math.min(p.length, p.width) * 0.14
    );
    const waistDepth = THREE.MathUtils.clamp(
      Math.max(legTop * 0.68, 0.03),
      0.03,
      Math.min(p.length, p.width) * 0.18
    );
    const waistOuterX = Math.max(p.length - waistInset * 2, waistDepth * 2 + 0.02);
    const waistOuterZ = Math.max(p.width - waistInset * 2, waistDepth * 2 + 0.02);
    const yWaistCenter = p.height - topT - waistH / 2;

    addRectRing(group, woodMat, waistOuterX, waistOuterZ, waistH, waistDepth, yWaistCenter);

    const waistLineH = THREE.MathUtils.clamp(
      0.004 + p.waistLineHeight * 0.012,
      0.004,
      Math.max(waistH * 0.3, 0.004)
    );
    const waistLineD = THREE.MathUtils.clamp(
      0.004 + p.waistLineDepth * 0.014,
      0.004,
      Math.min(waistDepth * 0.6, 0.02)
    );
    const waistLineSpanX = waistOuterX + waistLineD * 1.3;
    const waistLineSpanZ = waistOuterZ + waistLineD * 1.3;
    const topLineY = yWaistCenter + (waistH - waistLineH) * 0.5 - 0.0002;
    const bottomLineY = yWaistCenter - (waistH - waistLineH) * 0.5 + 0.0002;

    addRectRing(group, woodMat, waistLineSpanX, waistLineSpanZ, waistLineH, waistLineD, topLineY);
    addRectRing(group, woodMat, waistLineSpanX, waistLineSpanZ, waistLineH, waistLineD, bottomLineY);

    const at = THREE.MathUtils.clamp(p.apronThick, 0, 1);
    const apronDepth = 0.011 + at * 0.028;
    const archD = THREE.MathUtils.clamp(p.archDepth, -1, 1);
    const archS = THREE.MathUtils.clamp(p.archShape, 0, 1);

    const innerX = 2 * lx - legTop;
    const innerZ = 2 * lz - legTop;
    const yApronCenter = p.height - topT - waistH - apronH / 2 - 0.0002;

    const frontZ = lz;
    const backZ = -lz;
    const rightX = lx;
    const leftX = -lx;

    const gFront = createApronStripGeometry(innerX, apronH, apronDepth, archD, archS);
    const frontApron = new THREE.Mesh(gFront, woodMat);
    frontApron.position.set(0, yApronCenter, frontZ);
    frontApron.castShadow = true;
    frontApron.receiveShadow = true;
    group.add(frontApron);

    const gBack = createApronStripGeometry(innerX, apronH, apronDepth, archD, archS);
    const backApron = new THREE.Mesh(gBack, woodMat);
    backApron.position.set(0, yApronCenter, backZ);
    backApron.castShadow = true;
    backApron.receiveShadow = true;
    group.add(backApron);

    const gLeft = createApronStripGeometry(innerZ, apronH, apronDepth, archD, archS);
    const leftApron = new THREE.Mesh(gLeft, woodMat);
    leftApron.rotation.y = Math.PI / 2;
    leftApron.position.set(leftX, yApronCenter, 0);
    leftApron.castShadow = true;
    leftApron.receiveShadow = true;
    group.add(leftApron);

    const gRight = createApronStripGeometry(innerZ, apronH, apronDepth, archD, archS);
    const rightApron = new THREE.Mesh(gRight, woodMat);
    rightApron.rotation.y = -Math.PI / 2;
    rightApron.position.set(rightX, yApronCenter, 0);
    rightApron.castShadow = true;
    rightApron.receiveShadow = true;
    group.add(rightApron);

    const legPositions = [
      [lx, legH / 2, lz],
      [lx, legH / 2, -lz],
      [-lx, legH / 2, lz],
      [-lx, legH / 2, -lz],
    ];
    legPositions.forEach(([x, y, z]) => {
      const legGeom = createLegGeometry({
        family: p.legFamily,
        section: p.legSection,
        thickness: legTop,
        height: legH,
        taper: p.legTaper,
        hoofIntensity: p.hoofIntensity,
        legCurve: p.legCurve,
        curveBalance: p.curveBalance,
        x: x,
        z: z,
      });
      const leg = new THREE.Mesh(legGeom, woodMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      leg.receiveShadow = true;
      group.add(leg);
    });

  }, [params]);

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
  const [params, setParams] = useState<TableParams>(DEFAULTS);
  const [leftTab, setLeftTab] = useState('DIMENSION');
  const [activeTab, setActiveTab] = useState<'parameters' | 'chat'>('chat');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isPricePanelOpen, setIsPricePanelOpen] = useState(false);
  const [latestChanges, setLatestChanges] = useState<ParamChange[]>([]);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            const args = call.args as Partial<TableParams>;
            
            const changes: ParamChange[] = [];
            Object.entries(args).forEach(([key, newVal]) => {
              const oldVal = params[key as keyof TableParams];
              if (oldVal !== newVal) {
                changes.push({ key, oldVal, newVal });
              }
            });

            if (changes.length > 0) {
              setLatestChanges(changes);
              startHudTimer();
            }

            setParams(prev => ({ ...prev, ...args }));
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

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#FEF9F0] selection:bg-[#6E0000]/10 font-sans">
      {/* 3D Canvas Area */}
      <div className="absolute inset-0 z-0">
        <TableCanvas params={params} />
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

        {/* Tabs */}
        <div className="flex bg-white/70 rounded-[12px] p-1 h-[40px] items-center w-full justify-between shrink-0 border border-white/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]">
           {[
             { id: 'DIMENSION', label: '基础尺寸' },
             { id: 'FRAME', label: '架构造法' },
             { id: 'LEGS', label: '腿足形制' },
             { id: 'FINISH', label: '皮壳工艺' }
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
               <CustomSlider label="长度" value={params.length} min={0.8} max={2.0} step={0.01} unit="cm" onChange={(v) => setParams(p => ({ ...p, length: v }))} displayMul={100} />
               <CustomSlider label="宽度" value={params.width} min={0.4} max={1.0} step={0.01} unit="cm" onChange={(v) => setParams(p => ({ ...p, width: v }))} displayMul={100} />
               <CustomSlider label="高度" value={params.height} min={0.5} max={0.9} step={0.01} unit="cm" onChange={(v) => setParams(p => ({ ...p, height: v }))} displayMul={100} />
               <CustomSlider label="冰盘沿导角" value={params.edgeCurve} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, edgeCurve: v }))} />
             </div>
           )}
           {leftTab === 'FRAME' && (
             <div className="flex flex-col gap-5 mt-1">
               <CustomSlider label="边抹厚度" value={params.frameHeight} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, frameHeight: v }))} />
               <CustomSlider label="束腰比例" value={params.waistHeight} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, waistHeight: v }))} />
               <CustomSlider label="束腰深度" value={params.waistInset} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, waistInset: v }))} />
               <CustomSlider label="托腮高度" value={params.waistLineHeight} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, waistLineHeight: v }))} />
               <CustomSlider label="托腮深度" value={params.waistLineDepth} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, waistLineDepth: v }))} />
               <div className="w-full h-px bg-[#E3BEB8]/30 my-0.5" />
               <CustomSlider label="牙条比例" value={params.apronHeight} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, apronHeight: v }))} />
               <CustomSlider label="牙条厚度" value={params.apronThick} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, apronThick: v }))} />
               <CustomSlider label="壸门券口深度" value={params.archDepth} min={-1} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, archDepth: v }))} />
               <CustomSlider label="券口轮廓" value={params.archShape} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, archShape: v }))} />
             </div>
           )}
           {leftTab === 'LEGS' && (
             <div className="flex flex-col gap-5 mt-1">
                <div className="flex flex-col gap-2.5">
                   <span className="text-ui-label-group text-[#6E0000]">腿足类型</span>
                   <div className="flex gap-2 w-full">
                      {(['straight', 'hoof', 'curved'] as LegFamily[]).map(fam => {
                        const labelMap: Record<LegFamily, string> = { 'straight': '直腿', 'hoof': '马蹄', 'curved': '三弯腿' };
                        return (
                          <button key={fam} onClick={() => setParams(p => ({...p, legFamily: fam}))}
                            className={cn("text-ui-button flex-1 py-1.5 rounded-[8px] border transition-colors", params.legFamily === fam ? "bg-[#6E0000] text-white border-[#6E0000] shadow-sm shadow-[#6E0000]/20" : "bg-white/50 border-[#E3BEB8]/50 text-[#6E0000]/70 hover:text-[#6E0000] hover:border-[#6E0000]/30")}>
                            {labelMap[fam]}
                          </button>
                        );
                      })}
                   </div>
                   <div className="flex gap-2 w-full mt-0.5">
                      {(['square', 'round'] as LegSection[]).map(sec => {
                        const labelMap: Record<LegSection, string> = { 'square': '方材', 'round': '圆材' };
                        return (
                          <button key={sec} onClick={() => setParams(p => ({...p, legSection: sec}))}
                            className={cn("text-ui-button flex-1 py-1.5 rounded-[8px] border transition-colors", params.legSection === sec ? "bg-[#6E0000] text-white border-[#6E0000] shadow-sm shadow-[#6E0000]/20" : "bg-white/50 border-[#E3BEB8]/50 text-[#6E0000]/70 hover:text-[#6E0000] hover:border-[#6E0000]/30")}>
                            {labelMap[sec]}
                          </button>
                        );
                      })}
                   </div>
               </div>
               <div className="w-full h-px bg-[#E3BEB8]/30 my-0.5" />
               <CustomSlider label="腿足粗细" value={params.legThickness} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, legThickness: v }))} />
               {params.legFamily !== 'curved' && <CustomSlider label="底足收分" value={params.legTaper} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, legTaper: v }))} />}
               {params.legFamily === 'hoof' && <CustomSlider label="马蹄内翻弧度" value={params.hoofIntensity} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, hoofIntensity: v }))} />}
               {params.legFamily === 'curved' && (
                 <>
                   <CustomSlider label="弯曲度" value={params.legCurve} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, legCurve: v }))} />
                   <CustomSlider label="重心位置" value={params.curveBalance} min={0} max={1} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, curveBalance: v }))} />
                 </>
               )}
             </div>
           )}
           {leftTab === 'FINISH' && (
             <div className="flex flex-col gap-5 mt-1">
                 <div className="flex flex-col gap-3">
                   <span className="text-ui-label-group text-[#6E0000]">木料选择</span>
                   <div className="grid grid-cols-2 gap-3">
                      {(['black-walnut', 'traditional-rosewood'] as WoodType[]).map((type) => {
                        const labelMap: Record<WoodType, string> = { 'black-walnut': '北美黑胡桃', 'traditional-rosewood': '大果紫檀' };
                        return (
                          <button
                            key={type}
                            onClick={() => setParams(p => ({ ...p, woodType: type }))}
                            className={cn(
                              "flex flex-col items-center justify-center py-2 px-1 border transition-all rounded-[8px]",
                              params.woodType === type 
                                ? "border-[#6E0000] bg-[#6E0000] text-white shadow-sm shadow-[#6E0000]/20" 
                                : "border-[#E3BEB8]/50 bg-white/50 text-[#6E0000]/70 hover:border-[#6E0000]/30 hover:text-[#6E0000]"
                            )}
                          >
                            <div className={cn("w-6 h-6 rounded-full mb-1.5 shadow-inner", params.woodType === type ? "border-2 border-white/80" : "border border-black/10", type === 'black-walnut' ? "bg-[#3D2B1F]" : "bg-[#5C1A1A]")} />
                            <span className="text-ui-button tracking-tight text-center flex items-center">
                              {labelMap[type]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                </div>
                <div className="w-full h-px bg-[#E3BEB8]/30 my-0.5" />
                <CustomSlider label="木材色调" value={params.woodLightness} min={0.15} max={0.75} step={0.01} unit="" onChange={(v) => setParams(p => ({ ...p, woodLightness: v }))} />
                <div className="flex flex-col gap-2.5">
                   <span className="text-ui-label-group text-[#6E0000]">漆面光泽</span>
                   <div className="flex gap-2 w-full">
                      {(['matte-silk', 'high-gloss'] as const).map((l) => (
                        <button
                          key={l}
                          onClick={() => setParams(p => ({ ...p, lustre: l }))}
                          className={cn("text-ui-button flex-1 py-1.5 rounded-[8px] border transition-colors", params.lustre === l ? "bg-[#6E0000] text-white border-[#6E0000] shadow-sm shadow-[#6E0000]/20" : "bg-white/50 border-[#E3BEB8]/50 text-[#6E0000]/70 hover:text-[#6E0000] hover:border-[#6E0000]/30")}
                        >
                          {l === 'matte-silk' ? '擦蜡 / 哑光' : '生漆 / 高光'}
                        </button>
                      ))}
                   </div>
                </div>
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
