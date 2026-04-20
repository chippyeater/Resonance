# 桌子导出协作文档

这份文档用于记录 Rhino.Compute 精确模型导出链路的当前状态、后续修改计划、已完成事项和防错规则。

目的只有一个：在后面持续迭代桌子导出逻辑时，避免上下文丢失、避免越改越乱。

## 当前已验证基线

日期：2026-04-19

当前已经验证通过的是 `box` 导出链路，完整流程如下：

1. 前端按钮 `Export Precise Model` 会把当前参数发送到 `/api/compute`
2. 前端发送前会把米制参数换算成毫米
3. `server.ts` 只负责把 Rhino.Compute 原始结果透传回来
4. 前端使用 `rhino3dm` 解码：
   `result.values[0].InnerTree['{0}'][0].data`
5. 解码得到 `Rhino.Geometry.Mesh` 后，转成 Three.js 几何并叠加显示

## 当前相关文件

- `src/App.tsx`
  前端按钮、请求、单位换算、`rhino3dm` 解码、Three.js 叠加显示
- `server.ts`
  `/api/compute` 代理接口
- `test_box.gh`
  当前用于验证导出链路的 Grasshopper 文件
- `package.json`
  依赖定义，包括 `rhino3dm`

## 当前 GH 要求

在目前这条 `rhino3dm` 路线上，GH 侧要求如下：

- 输出一个最终 `Mesh`
- 当前输出名可以保持为 `RH_OUT:box`
- 输出类型必须是 `Rhino.Geometry.Mesh`
- 不需要把 mesh 拆成 `vertices/faces`

后续从 box 迁移到桌子时：

- 最终输出仍然应该是一个 `Mesh`
- 输出名可以从 `RH_OUT:box` 改成正式桌子输出名
- 但改名时必须和前端解析逻辑一起确认

## 协作规则

后续每次改动都遵守下面这些规则：

1. 不要随意破坏当前已经跑通的 box 导出链路
2. 每次非小改动前，必须先在本文档新增一条记录，写清：
   - 计划
   - 预计修改文件
   - 风险
3. 每次改完后，必须回填同一条记录，写清：
   - 已完成
   - 验证情况
   - 未解决问题
4. 一次只改导出链路的一个维度
   例如：只改 GH 输出、只改单位、只改前端材质、只改显示逻辑
5. 除非必要，不要在同一步里同时大改 GH 输出结构和前端解析方式
6. `/api/compute` 默认保持轻量代理，不主动把几何解析搬回服务端
7. 前端参数状态始终保持“米”为单位
8. 如果 GH 文件单位是毫米，则：
   - 请求发出前：米转毫米
   - 前端解码后：毫米转米
9. 如果出现“模型没显示”，按下面顺序排查：
   - 是否成功解码
   - 单位是否正确
   - 几何尺寸和 bounds 是否异常
   - 材质是否可见
   - 相机是否能看到模型
10. 如果后续桌子逻辑改坏了当前 box 路线，先恢复 box，再继续
11. 在桌子路径没有稳定前，不要过早删掉有用的调试日志
12. 不要引入额外分支逻辑，除非先记录到本文档

## 变更记录

### 2026-04-18 至 2026-04-19 - 建立可工作的 box 导出链路

计划：

- 增加前端导出按钮和加载状态
- 把当前尺寸参数发送到 `/api/compute`
- 让 Rhino.Compute 的 mesh 结果显示在 Three.js 场景中
- 使用 `rhino3dm` 解码 Rhino 序列化 mesh
- 先把 box 路线跑通，再迁移到完整桌子

预计修改文件：

- `src/App.tsx`
- `server.ts`
- `package.json`

风险：

- 前端米制和 GH 毫米制不一致
- `rhino3dm` 在浏览器中的 wasm 加载失败
- 本地程序化预览和导出 mesh 叠加后难以辨认

已完成：

- 增加了 `Export Precise Model` 按钮
- 增加了前端请求和加载状态
- 把 `/api/compute` 恢复为原始结果透传
- 增加了前端 `rhino3dm` 解码逻辑
- 修复了 `rhino3dm` 的 wasm 路径问题
- 修复了前端请求单位换算：米转毫米
- 修复了解码后显示单位换算：毫米转米
- 把导出模型从蓝色线框改成了实心材质

验证情况：

- `npm run lint` 通过
- 浏览器控制台确认成功解码：
  - `modelUnits: Millimeters`
  - `vertexCount: 24`
  - `triangleCount: 12`
- 用户确认 box 已经显示出来

未解决问题：

- 当前目标仍然只是 box，不是完整桌子 mesh
- 下一阶段需要把 GH 输出从 box 迁移到真实桌子

## 下一阶段目标

目标：

把当前已经验证通过的 box 导出链路，迁移到真实桌子 mesh，同时尽量不改动已验证的请求、解码、显示主链路。

建议顺序：

1. 调整或新建 GH 定义，使最终输出为桌子 mesh
2. 保持当前前端 `rhino3dm` 解码路径不变
3. 验证桌子 mesh 的单位、尺寸和 bounds
4. 决定最终展示方式：
   - 叠加在程序化预览之上
   - 或替换程序化预览
5. 只有在桌子 mesh 稳定后，再考虑进一步优化材质表现

## 后续记录模板

后面每次改动，复制下面这段：

### YYYY-MM-DD - 变更标题

计划：

- 

预计修改文件：

- 

风险：

- 

已完成：

- 

验证情况：

- 

未解决问题：

- 

### 2026-04-19 - 从 box 迁移到桌子 mesh（第一阶段）

计划：

- 保持当前已经跑通的前端请求、单位换算、`rhino3dm` 解码和显示链路不变
- 先把工作重点放在 GH 输出上，让 GH 最终输出真实桌子 mesh，而不是 box
- 在接入桌子 mesh 后，优先验证：
  - 输出类型是否仍为 `Rhino.Geometry.Mesh`
  - 单位是否仍为毫米
  - 解码后的顶点数和三角面数是否合理
  - 桌子尺寸和位置是否与前端程序化预览一致
- 如果桌子 mesh 成功显示，再决定是否需要“替换程序化预览”而不是“叠加显示”

预计修改文件：

- `TABLE_EXPORT_COLLAB.md`
- `test_box.gh` 或新的桌子 GH 文件
- 可能涉及 `src/App.tsx`（仅在桌子 mesh 接入后做显示微调时）

风险：

- GH 输出虽然改成了桌子，但仍可能输出 Brep 而不是 Mesh
- 桌子 mesh 的局部原点、整体位置或尺寸可能与前端预览不一致
- 桌子 mesh 接入后，叠加显示可能会让用户难以分辨“导出结果”和“程序化预览”

已完成：

- 已建立本条计划，后续所有相关修改都要回填到这里

验证情况：

- 当前仅完成计划记录，尚未开始桌子 mesh 接入

未解决问题：

- 真实桌子 GH 输出文件还未接入当前导出链路
- 还未确认桌子 mesh 的最终输出名和最终 GH 文件路径

### 2026-04-19 - 接入普通桌子 GH 输入参数

计划：

- 使用 `mesh table 20210718 框架系列.ghx` 作为新的 GH 输入来源
- 从 `.ghx` 中提取 `RH_IN:*` 和 `RH_OUT:*` 接口名
- 更新 `/api/compute` 的参数名映射，改为普通桌子参数
- 更新前端参数状态和控制项，使其与 GH 输入名一一对应
- 保持当前 `rhino3dm` 导出解码链路不变

预计修改文件：

- `TABLE_EXPORT_COLLAB.md`
- `server.ts`
- `src/App.tsx`

风险：

- 当前前端程序化预览逻辑是旧案几参数模型，和新的普通桌子 GH 输入并不一致
- 新 GH 文件路径不在 `Resonance` 目录下，切换文件时需要注意相对路径
- GH 输出虽然存在 `RH_OUT:desk` 分组，但仍需确认实际 Compute 返回的 `values[0]` 是否就是桌子 mesh

已完成：

- 已从 `.ghx` 提取到以下接口：
  - `RH_IN:length`
  - `RH_IN:width`
  - `RH_IN:round`
  - `RH_IN:leg_width`
  - `RH_IN:frame_edge_thickness`
  - `RH_IN:leg_height`
  - `RH_IN:leg_open`
  - `RH_IN:leg_tiptoe_degree`
  - `RH_IN:frame_thickness`
  - `RH_IN:lower_leg_depth`
  - `RH_IN:upper_leg_depth`
  - `RH_IN:leg_belly_depth`
  - `RH_IN:frame_inset`
  - `RH_OUT:desk`

验证情况：

- 已确认 `.ghx` 中存在显式 `RH_IN:*` / `RH_OUT:*` Group NickName
- 尚未开始代码接入

未解决问题：

- 前端普通桌子参数状态还未建立
- `/api/compute` 还未切换到新的 GH 文件和新的输入参数映射

### 2026-04-19 - 普通桌子前端面板与聊天参数对齐

计划：

- 将前端参数面板从旧案几字段切换为普通桌子 GHX 的 `RH_IN:*` 字段
- 保持已验证通过的 `/api/compute`、`rhino3dm` 解码和导出显示链路不变
- 同步更新 `/api/chat` 的函数参数声明，避免聊天改动写入旧字段

预计修改文件：

- `src/App.tsx`
- `server.ts`
- `TABLE_EXPORT_COLLAB.md`

风险：

- 旧前端预览逻辑仍然是案几程序化模型，只能通过参数映射近似普通桌子形态
- 若聊天函数仍保留旧字段，会导致前端状态和 GH 输入脱节

已完成：

- `src/App.tsx` 已将左侧控制面板改为三组普通桌子参数：
  - `基础尺寸`
  - `框架参数`
  - `腿足参数`
- 前端控件已直接对应以下 GH 输入：
  - `length`
  - `width`
  - `round`
  - `leg_width`
  - `frame_edge_thickness`
  - `leg_height`
  - `leg_open`
  - `leg_tiptoe_degree`
  - `frame_thickness`
  - `lower_leg_depth`
  - `upper_leg_depth`
  - `leg_belly_depth`
  - `frame_inset`
- `server.ts` 中 `update_table_params` 的 Gemini / GitHub Models 函数声明已同步改为同一套普通桌子字段

验证情况：

- `npm run lint` 通过
- 旧案几字段在 `src/App.tsx` 的参数面板区域已清除

未解决问题：

- 当前左侧 3D 程序化预览仍是旧预览逻辑映射出来的近似普通桌子，不是 GH 的真实桌子几何
- 还需要实际运行并点一次 `Export Precise Model`，确认 `mesh table 20210718 框架系列.ghx` 的导出结果与 `RH_OUT:desk` 一致

### 2026-04-19 - Rhino 坐标轴与精确模型对齐修正

计划：

- 修正 Rhino `Z-up` 与 Three.js `Y-up` 的坐标轴差异
- 对精确模型整体应用自动居中、落地和必要的朝向修正
- 降低由于单面剔除导致的“像穿模”的视觉问题

预计修改文件：

- `src/App.tsx`
- `TABLE_EXPORT_COLLAB.md`

风险：

- 自动旋转启发式若遇到长宽接近的桌子，可能需要后续再细调
- 若 GH 后续自行调整了输出朝向，前端这层矫正可能需要回退

已完成：

- 顶点坐标已从 Rhino 轴系转换为 Three 轴系：
  - `x`
  - `z`
  - `-y`
- 精确模型从多部件组装完成后，会：
  - 计算整体包围盒
  - 按需要自动绕 `Y` 轴旋转 `90°`
  - 自动居中到场景原点
  - 自动下落到地面 `y = 0`
- 精确模型材质已改为 `DoubleSide`，减少背面剔除造成的白边和缺面观感

验证情况：

- `npm run lint` 通过

未解决问题：

- 还需要你在浏览器里重新导出一次，确认这次桌面和腿已经对齐
- 如果新朝向仍与程序化预览不一致，需要再根据实际包围盒日志做一次定向微调
