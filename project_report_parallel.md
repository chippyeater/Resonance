# 课程项目研究汇报：参数化桌面设计系统

## 1. 项目概述
本项目实现了一个基于前端可视化操作和 Rhino.Compute 的参数化桌面设计系统。用户可通过网页调整桌面尺寸、形状及板材策略，系统自动生成 3D 桌面模型，并支持多方案对比和导出桌面参数数据。

**研究目标与创新点：**
- 前端实时调整桌面参数（长度、宽度、高度、圆角等）。
- 后端通过 Rhino.Compute 调用 GHX 文件生成桌面 BREP/mesh 模型。
- 集成 LLM 或算法辅助桌面板材策略，实现智能化定制。
- 可扩展至多用户协作和 AR/VR 交互。

## 2. 技术架构

### 2.1 前端
- 目录：`src/`
  - `App.tsx`：主页面逻辑，负责参数输入与 3D 渲染。
  - `main.tsx`：前端入口。
  - `index.css`：样式文件。
- 技术栈：React + TypeScript + Vite
- 功能：
  - 输入桌面参数。
  - 调用后端接口生成桌面模型。
  - Three.js 渲染桌面 3D 模型。
  - 支持多方案选择及显示参数差异。

### 2.2 后端
- 文件：`server.ts`
- 技术：Node.js + Express + TypeScript
- 功能：
  - 接收前端参数。
  - 调用 GHX 文件（`desk.ghx`）通过 Rhino.Compute 生成桌面模型。
  - 返回 3D 模型数据给前端。
  - 支持跨域请求，配置允许的前端 origin。
- 核心逻辑：
```ts
const GH_SCRIPT_PATH = path.join(process.cwd(), 'desk.ghx');
if (!fs.existsSync(GH_SCRIPT_PATH)) throw new Error(`GHX file not found: ${GH_SCRIPT_PATH}`);
const ghScript = fs.readFileSync(GH_SCRIPT_PATH).toString('base64');
const response = await axios.post(RHINO_COMPUTE_URL, { definition: ghScript, inputs: userParams });
```

### 2.3 参数化设计
- 文件：`desk.ghx`
- 工具：Grasshopper (Rhino)
- 功能：
  - 定义桌面板、桌腿、板材厚度、孔槽、圆角等参数化节点。
  - 可通过 Rhino.Compute 接口远程计算。
- 使用方法：
  1. 后端读取 GHX 文件，转为 base64。
  2. 调用 Rhino.Compute HTTP API：
     - `RHINO_COMPUTE_URL="http://localhost:5000/grasshopper"`
     - 传入 `definition`（GHX base64）与用户参数 `inputs`。
  3. Rhino.Compute 返回模型 BREP 或 mesh。
  4. 前端使用 Three.js 渲染模型。

## 3. 主要功能
1. **参数化桌面生成**
   - 调整长宽高、圆角半径、板材厚度。
   - 多方案生成与对比。
2. **3D 渲染**
   - 前端渲染 BREP/mesh 模型。
   - 可旋转、缩放、查看细节。
3. **导出参数**
   - 输出体积、表面积、构件数量、复杂度等数据。
4. **智能板材策略**
   - 后端可结合 LLM 或算法推荐最优板材组合。
5. **前后端联动**
   - 前端 React 页面 → 后端 Express → Rhino.Compute → 前端 Three.js 渲染。

### 3.1 多方案并行功能

- **目标**：用户可一次性生成多种参数方案，并同时计算对应模型和结构/报价数据，便于对比。
- **前端**：用户可选择生成 N 种方案（如不同长宽高、板材厚度组合），界面显示每种方案的预览和参数摘要。
- **后端**：
  - 接收多组参数数组。
  - 使用异步请求或 Promise.all 并行调用 Rhino.Compute API，为每个方案生成模型。
  - 生成完成后统一返回多套结果，包括 BREP/mesh 模型、Quote、Structure Score、Estimated Hours。
- **渲染与交互**：
  - 前端可以同时渲染多模型（或按需切换）。
  - 支持高亮对比关键参数、结构差异和报价差异。
- **技术实现示意**：
```ts
const results = await Promise.all(userParamsArray.map(params =>
    axios.post(RHINO_COMPUTE_URL, { definition: ghScript, inputs: params })
));
return results; // 每个元素包含对应方案的模型与评价数据
```

## 4. 桌面估价与评价逻辑

1. **Quote（报价）**
   - 根据参数化桌面模型生成的各构件数据计算报价，包括：板材体积、表面积、边长、部件数量等。
   - 不同材质（木板、铝蜂窝板、PVC 等）按单价系数计算成本。
   - 公式示例：
     ```
     Quote = Σ( 板材体积 × 材料单价 ) + Σ( 边缘加工长度 × 工艺单价 )
     ```

2. **结构分数（Complexity/Structure Score）**
   - 用于评价桌面设计的复杂度和可制造性。
   - 计算指标包括：部件数量、接口数量、曲面复杂度、孔槽数量、非标准连接件等。
   - 分数越高表示结构越复杂，可能加工成本和难度越大。
   - 示例公式：
     ```
     Structure Score = 部件数量 × 0.5 + 接口数量 × 0.3 + 曲面复杂度 × 0.2
     ```

3. **工时估计（Estimated Work Hours）**
   - 根据结构分数和部件数量估算加工与组装时间。
   - 考虑因素：切割/铣削时间、钻孔/开槽时间、组装/固定时间。
   - 示例公式：
     ```
     Estimated Hours = BaseTime + StructureScore × ComplexityFactor
     ```

**逻辑关系总结**
- 用户调整参数 → 系统生成 GHX 模型 → 输出构件数据 → 按材质、尺寸、复杂度计算 Quote、Structure Score → 结合评分和规则生成工时估计。
- Quote 与材料成本直接相关；Structure Score 反映设计复杂度；工时估计结合 Score 与经验系数，帮助用户预判制作难度。

## 5. 实验与结果
- 多种参数组合下生成桌面模型效果图。
- 响应时间：
  - 小参数调整：< 1s
  - 大型桌面或复杂节点：2-3s
- 数据一致性：
  - 前端参数与 Rhino.Compute 返回模型高度匹配。
  - 可导出数据用于成本估算或施工参考。

## 6. 部署说明
本项目的桌面生成系统依赖 Rhino.Compute 来执行 GHX 文件中的参数化计算。由于 Rhino.Compute 是本地服务，必须在可运行 Rhino 的环境中启动并保持联网访问。前端虽然可以独立打包为静态网页，但无法单独部署到 GitHub Pages 或其他静态托管服务，因为前端需要通过后端访问 Rhino.Compute 才能生成 3D 模型。因此，本项目目前未进行完整部署，前端与后端仅在本地环境下联动测试。未来若要部署，需要将后端 Node.js 服务和 Rhino.Compute 通过公网或隧道暴露，并配置前端 API 地址与 CORS 权限。

## 7. 总结与展望
- **创新点**：前端可视化参数调整 + GHX 动态计算 + Rhino.Compute 后端计算。
- **优化空间**：
  - 板材策略智能化。
  - UI/UX 美化。
  - 多方案自动排序与推荐。
- **未来扩展**：
  - AR/VR 模拟桌面放置效果。
  - 多用户协作与版本管理。
  - 材料成本和结构优化集成。
