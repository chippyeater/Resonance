# Resonance

一个 AI 辅助的参数化家具设计原型，支持通过自然语言和参数调节完成桌具个性化设计。

## 核心功能

- 桌具尺寸与形态调节、交互式 3D 预览。
- AI 辅助设计方案生成与多方案对比。
- 对接 Rhino / Grasshopper，实现精确几何模型生成。
- 成本与结构复杂度估算、模型导出。

**技术栈：** React、TypeScript、Vite、Three.js、Express、Rhino.Compute、Grasshopper、Gemini / GitHub Models。

## 本地运行

需要 Node.js；精确模型生成依赖可用的 Rhino.Compute / Grasshopper 服务。

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 中配置 `RHINO_COMPUTE_URL`、`LLM_PROVIDER` 及对应的 API 密钥，然后运行：

```bash
npm run dev
```

访问 http://localhost:3000。

使用 `npm run build` 构建前端。AI 和 Rhino 功能依赖后端服务，仅部署静态页面无法完整运行。

## 项目说明

设计课程原型，用于探索 AI 辅助家具定制。成本与结构估算仅供设计参考。
