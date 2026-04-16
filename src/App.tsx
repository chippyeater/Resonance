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
  Loader2
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
    scene.background = new THREE.Color('#F5F1E9');
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
    const animate = () => {
      requestAnimationFrame(animate);
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
      resizeObserver.disconnect();
      renderer.dispose();
      if (containerRef.current) {
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

const SidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-10 p-6 bg-white rounded-[20px] border border-brand-coral/10 shadow-sm">
    <h3 className="text-[11px] font-bold tracking-[0.15em] text-brand-coral uppercase mb-6 flex items-center">
      <span className="w-1.5 h-1.5 bg-brand-coral rounded-full mr-2" />
      {title}
    </h3>
    {children}
  </div>
);

const CustomSlider = ({ 
  label, 
  value, 
  min, 
  max, 
  unit, 
  step = 1,
  onChange 
}: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  unit: string;
  step?: number;
  onChange: (val: number) => void;
}) => (
  <div className="mb-6">
    <div className="flex justify-between items-baseline mb-2">
      <label className="text-[10px] font-bold tracking-wider text-brand-ink/60 uppercase">{label}</label>
      <span className="text-xs font-medium text-brand-coral">{value.toFixed(2)} {unit}</span>
    </div>
    <div className="relative h-4 flex items-center">
      <div className="absolute w-full h-[2px] bg-brand-coral/10 rounded-full" />
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step}
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div 
        className="absolute h-[2px] bg-brand-coral rounded-full transition-all duration-150" 
        style={{ width: `${((value - min) / (max - min)) * 100}%` }}
      />
      <div 
        className="absolute w-3 h-3 bg-brand-coral rounded-full transition-all duration-150 shadow-sm"
        style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 6px)` }}
      />
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [params, setParams] = useState<TableParams>(DEFAULTS);
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
    { role: 'assistant', content: "Welcome to Resonance. I am your design consultant. How can I help you customize your bespoke furniture today?" }
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
            setMessages(prev => [...prev, { role: 'assistant', content: "I've updated the design parameters based on your request. How does the new configuration look?" }]);
          }
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text || "I'm here to help with your design." }]);
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I apologize, but I encountered an error processing your request. Please try again." }]);
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
    <div className="flex flex-col h-screen overflow-hidden bg-brand-cream selection:bg-brand-coral/10">
      {/* Header */}
      <header className="h-20 border-b border-brand-coral/10 flex items-center justify-between px-12 z-50 bg-brand-cream/80 backdrop-blur-md">
        <div className="flex items-center gap-12">
          <h1 className="font-serif text-2xl font-bold italic tracking-tight text-brand-coral">
            Resonance.
          </h1>
          <nav className="hidden md:flex items-center gap-8">
            {['首页', '设计理念', '作品集', '关于我们'].map((item) => (
              <a 
                key={item} 
                href="#" 
                className={cn(
                  "text-[12px] font-medium tracking-widest uppercase transition-colors hover:text-brand-coral",
                  item === '设计理念' ? "text-brand-coral" : "text-brand-ink/60"
                )}
              >
                {item}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <button className="p-2 hover:bg-brand-coral/5 rounded-full transition-colors">
            <ShoppingCart className="w-5 h-5 text-brand-ink" />
          </button>
          <button className="p-2 hover:bg-brand-coral/5 rounded-full transition-colors">
            <User className="w-5 h-5 text-brand-ink" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* 3D Canvas Area */}
        <div className="flex-1 relative bg-brand-cream min-h-[50vh] md:min-h-0">
          <TableCanvas params={params} />

          {/* HUD Overlay for Parameter Changes */}
          <AnimatePresence>
            {latestChanges.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                onMouseEnter={stopHudTimer}
                onMouseLeave={startHudTimer}
                className="absolute top-6 right-6 z-50 bg-white/60 backdrop-blur-xl border border-white/60 shadow-2xl rounded-2xl p-5 min-w-[240px] max-h-[80vh] flex flex-col"
              >
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <div className="w-2 h-2 rounded-full bg-brand-coral animate-pulse" />
                  <span className="text-[10px] font-bold tracking-widest uppercase text-brand-ink/60">Parameters Updated</span>
                </div>
                <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2">
                  {latestChanges.map((change, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-brand-ink/40 uppercase tracking-wider">
                        {formatParamName(change.key)}
                      </span>
                      <div className="flex items-center gap-2 text-xs font-medium font-mono">
                        <span className="text-brand-ink/50 line-through">{formatParamValue(change.oldVal)}</span>
                        <ChevronRight className="w-3 h-3 text-brand-coral" />
                        <span className="text-brand-coral">{formatParamValue(change.newVal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Controls - Collapsible Price Panel on the Left */}
          <div className="absolute bottom-12 left-0 z-40">
            <motion.div 
              initial={false}
              animate={{ x: isPricePanelOpen ? 0 : -140 }}
              className="relative flex items-center"
            >
              <div className="bg-white/95 backdrop-blur-xl border border-brand-coral/20 p-6 rounded-r-[32px] shadow-xl flex items-center gap-8 pl-12">
                <div>
                  <span className="text-[9px] font-bold text-brand-ink/40 uppercase tracking-widest block mb-1">Current Build Price</span>
                  <span className="text-3xl font-serif font-bold text-brand-coral">¥12,800</span>
                </div>
              </div>
              <button 
                onClick={() => setIsPricePanelOpen(!isPricePanelOpen)}
                className="absolute -right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-brand-coral text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-50"
              >
                {isPricePanelOpen ? <ChevronLeft className="w-5 h-5" /> : <span className="text-lg font-serif font-bold">¥</span>}
              </button>
            </motion.div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full md:w-[420px] border-t md:border-t-0 md:border-l border-brand-coral/10 flex flex-col bg-white h-full shadow-2xl z-30">
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            {/* Tabs */}
            <div className="flex gap-2 mb-4 bg-brand-coral/5 p-1 rounded-full shrink-0">
              <button 
                onClick={() => setActiveTab('chat')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all",
                  activeTab === 'chat' 
                    ? "bg-brand-coral text-white shadow-md shadow-brand-coral/20" 
                    : "text-brand-ink/60 hover:text-brand-ink"
                )}
              >
                <MessageSquare className="w-3 h-3" />
                AI Chat
              </button>
              <button 
                onClick={() => setActiveTab('parameters')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all",
                  activeTab === 'parameters' 
                    ? "bg-brand-coral text-white shadow-md shadow-brand-coral/20" 
                    : "text-brand-ink/60 hover:text-brand-ink"
                )}
              >
                <Settings2 className="w-3 h-3" />
                参数调节
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'parameters' ? (
                <motion.div
                  key="params"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <SidebarSection title="Dimensions">
                    <CustomSlider 
                      label="Length" 
                      value={params.length} 
                      min={0.8} 
                      max={2.0} 
                      step={0.01}
                      unit="m" 
                      onChange={(v) => setParams(p => ({ ...p, length: v }))}
                    />
                    <CustomSlider 
                      label="Width" 
                      value={params.width} 
                      min={0.4} 
                      max={1.0} 
                      step={0.01}
                      unit="m" 
                      onChange={(v) => setParams(p => ({ ...p, width: v }))}
                    />
                    <CustomSlider 
                      label="Height" 
                      value={params.height} 
                      min={0.5} 
                      max={0.9} 
                      step={0.01}
                      unit="m" 
                      onChange={(v) => setParams(p => ({ ...p, height: v }))}
                    />
                    <CustomSlider 
                      label="Edge Curve" 
                      value={params.edgeCurve} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, edgeCurve: v }))}
                    />
                  </SidebarSection>

                  <SidebarSection title="Leg Configuration">
                    <div className="flex flex-wrap gap-2 mb-6">
                      {(['hoof', 'straight', 'curved'] as LegFamily[]).map((family) => (
                        <button
                          key={family}
                          onClick={() => setParams(p => ({ ...p, legFamily: family }))}
                          className={cn(
                            "px-5 py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all",
                            params.legFamily === family 
                              ? "bg-brand-coral text-white" 
                              : "bg-brand-coral/10 text-brand-ink/60 hover:bg-brand-coral/20"
                          )}
                        >
                          {family}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {(['square', 'round'] as LegSection[]).map((section) => (
                        <button
                          key={section}
                          onClick={() => setParams(p => ({ ...p, legSection: section }))}
                          className={cn(
                            "px-5 py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all",
                            params.legSection === section 
                              ? "bg-brand-coral text-white" 
                              : "bg-brand-coral/10 text-brand-ink/60 hover:bg-brand-coral/20"
                          )}
                        >
                          {section}
                        </button>
                      ))}
                    </div>
                    <CustomSlider 
                      label="Thickness" 
                      value={params.legThickness} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, legThickness: v }))}
                    />
                    {params.legFamily !== 'curved' && (
                      <CustomSlider 
                        label="Taper" 
                        value={params.legTaper} 
                        min={0} 
                        max={1} 
                        step={0.01}
                        unit="" 
                        onChange={(v) => setParams(p => ({ ...p, legTaper: v }))}
                      />
                    )}
                    {params.legFamily === 'hoof' && (
                      <CustomSlider 
                        label="Hoof Intensity" 
                        value={params.hoofIntensity} 
                        min={0} 
                        max={1} 
                        step={0.01}
                        unit="" 
                        onChange={(v) => setParams(p => ({ ...p, hoofIntensity: v }))}
                      />
                    )}
                    {params.legFamily === 'curved' && (
                      <>
                        <CustomSlider 
                          label="Curve" 
                          value={params.legCurve} 
                          min={0} 
                          max={1} 
                          step={0.01}
                          unit="" 
                          onChange={(v) => setParams(p => ({ ...p, legCurve: v }))}
                        />
                        <CustomSlider 
                          label="Balance" 
                          value={params.curveBalance} 
                          min={0} 
                          max={1} 
                          step={0.01}
                          unit="" 
                          onChange={(v) => setParams(p => ({ ...p, curveBalance: v }))}
                        />
                      </>
                    )}
                  </SidebarSection>

                  <SidebarSection title="Frame & Waist">
                    <CustomSlider 
                      label="Frame Height" 
                      value={params.frameHeight} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, frameHeight: v }))}
                    />
                    <CustomSlider 
                      label="Waist Ratio" 
                      value={params.waistHeight} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, waistHeight: v }))}
                    />
                    <CustomSlider 
                      label="Waist Inset" 
                      value={params.waistInset} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, waistInset: v }))}
                    />
                    <CustomSlider 
                      label="Line Height" 
                      value={params.waistLineHeight} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, waistLineHeight: v }))}
                    />
                    <CustomSlider 
                      label="Line Depth" 
                      value={params.waistLineDepth} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, waistLineDepth: v }))}
                    />
                  </SidebarSection>

                  <SidebarSection title="Apron Details">
                    <CustomSlider 
                      label="Apron Ratio" 
                      value={params.apronHeight} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, apronHeight: v }))}
                    />
                    <CustomSlider 
                      label="Thickness" 
                      value={params.apronThick} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, apronThick: v }))}
                    />
                    <CustomSlider 
                      label="Arch Depth" 
                      value={params.archDepth} 
                      min={-1} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, archDepth: v }))}
                    />
                    <CustomSlider 
                      label="Arch Shape" 
                      value={params.archShape} 
                      min={0} 
                      max={1} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, archShape: v }))}
                    />
                  </SidebarSection>

                  <SidebarSection title="Material & Finish">
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {(['black-walnut', 'traditional-rosewood'] as WoodType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setParams(p => ({ ...p, woodType: type }))}
                          className={cn(
                            "p-4 text-left border transition-all relative overflow-hidden group rounded-xl",
                            params.woodType === type 
                              ? "border-brand-coral bg-brand-coral text-white" 
                              : "border-brand-coral/10 bg-white text-brand-ink/60 hover:border-brand-coral/30"
                          )}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-tight leading-tight">
                            {type.replace('-', ' ')}
                          </span>
                          {params.woodType === type && (
                            <Check className="absolute top-2 right-2 w-3 h-3 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                    <CustomSlider 
                      label="Wood Tone" 
                      value={params.woodLightness} 
                      min={0.15} 
                      max={0.75} 
                      step={0.01}
                      unit="" 
                      onChange={(v) => setParams(p => ({ ...p, woodLightness: v }))}
                    />
                    <div className="flex justify-between items-center py-4 border-t border-brand-coral/10">
                      <span className="text-[10px] font-bold tracking-widest text-brand-ink/40 uppercase">光泽度 (漆面)</span>
                      <div className="flex gap-2">
                        {(['matte-silk', 'high-gloss'] as const).map((l) => (
                          <button
                            key={l}
                            onClick={() => setParams(p => ({ ...p, lustre: l }))}
                            className={cn(
                              "text-[11px] font-bold uppercase transition-colors",
                              params.lustre === l ? "text-brand-coral" : "text-brand-ink/40 hover:text-brand-ink"
                            )}
                          >
                            {l === 'matte-silk' ? '哑光' : '高光'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SidebarSection>
                </motion.div>
              ) : (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col min-h-0"
                >
                  <div className="flex-1 bg-white/50 rounded-[20px] p-4 mb-4 overflow-y-auto custom-scrollbar flex flex-col gap-4 border border-brand-coral/10 shadow-inner">
                    {messages.map((m, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed shadow-sm",
                          m.role === 'assistant' 
                            ? "bg-white self-start text-brand-ink border border-brand-coral/5" 
                            : "bg-brand-coral self-end text-white"
                        )}
                      >
                        {m.content}
                      </div>
                    ))}
                    {isTyping && (
                      <div className="bg-white self-start p-4 rounded-2xl shadow-sm border border-brand-coral/5">
                        <Loader2 className="w-4 h-4 animate-spin text-brand-coral" />
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    className="relative mt-auto"
                  >
                    <textarea 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="咨询设计师..."
                      rows={4}
                      className="w-full bg-white border border-brand-coral/20 rounded-[24px] px-6 py-5 text-xs focus:ring-2 focus:ring-brand-coral/20 outline-none pr-16 shadow-lg resize-none custom-scrollbar transition-all"
                    />
                    <button 
                      type="submit"
                      disabled={isTyping || !inputValue.trim()}
                      className="absolute right-4 bottom-4 p-3 bg-brand-coral text-white hover:bg-brand-coral/90 rounded-full transition-all disabled:opacity-50 shadow-md active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Action Removed */}
        </aside>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(210, 105, 78, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D2694E;
        }
      `}} />
    </div>
  );
}
