# Resonance Color Guide

本次调整目标：把界面统一到“浅棕暖色调”的纸面风格，减少黑灰残留，让左侧参数区、中部预览、右侧 notes、底部操作条和 showroom 浮层使用同一套视觉语言。

## Core Palette

| Color | 用途 |
| --- | --- |
| `#faf6ef` | 主背景，页面底色、3D 画布底色 |
| `#f8f5ef` | 面板背景，次级浅底 |
| `#fcfaf6` | 输入栏、轻表面背景 |
| `#f7f2ea` | 浮层、summary、HUD 背景 |
| `#ebe2d6` | 激活态 tab / nav 背景 |
| `#f2e9dc` | hover 背景、轻强调底色 |
| `#f0e7dc` | inquiry 消息底色 |
| `#42241C` | 主边框、深棕主文字、标题色 |
| `#5a3022` | 主操作按钮底色 |
| `#714131` | 主操作按钮 hover |
| `#8f867a` | 次级说明文字、栏目标签、辅助线 |
| `#9f978d` | 更弱的辅助标签色 |
| `#b8aea1` | placeholder、禁用态图标 |
| `#d7c8b5` | 柔和边框 |
| `#e63b2e` | 唯一高饱和强调色，滑杆进度、状态提示、loading |

## Changed Files

### `src/index.css`

作用：全局色板 token、字体角色、滚动条颜色。

本次修改：

- `--color-app-bg: #f5f1ea`
  管页面整体背景，避免纯白发冷。
- `--color-panel-bg: #f8f5ef`
  管二级面板底色。
- `--color-panel-hover: #efe8de`
  管 hover 时的浅棕过渡面。
- `--color-border-main: #42241c`
  管全局主边框和深棕结构线。
- `--color-border-subtle: #d7c8b5`
  管 showroom 和浮层里的柔和边框。
- `--color-text-main: #2e2823`
  管主阅读文字。
- `--color-text-secondary: #8f867a`
  管次级说明文字。
- `--color-text-muted: #a9a095`
  管弱化说明文本。
- `--color-text-faint: #b8aea1`
  管占位、禁用、最弱层级文本。
- `--color-user-bubble: #ece1d4`
  预留给用户类暖色消息底。
- `--color-user-bubble-text: #5b3728`
  预留给用户类暖色消息文字。
- `.text-heading-assistant`
  从更工具感的字重，调整为更接近版面标题的暖色系表达。
- `.chat-note-label`
  新增 notes 栏目的英文栏目标签样式。
- `.chat-note-block`
  新增 notes 正文块样式。
- `custom-scrollbar`
  滚动条由深灰改为 `#d2c3b3` / `#bda994`，避免局部跳出整体风格。

### `src/App.tsx`

作用：主界面参数侧栏、预览区、HUD、设计笔记区、底部操作条。

#### 1. 左侧参数区

- `#faf6ef`
  页面主底色，管整个 App 容器和 3D canvas 背景。
- `#42241C`
  管左栏主边框、Logo 标题、结构分割线。
- `#8f867a`
  管副标题 `BESPOKE FURNITURE`、未激活 tab、`MATERIAL` 标签、metric label。
- `#42241C + #f7f1e8`
  管左侧 tab 激活态：深棕底、浅米文字。
- `#f2e9dc`
  管左侧 tab hover。
- `#a79a8a`
  管 slider label。
- `#efe7db`
  管 slider 大数字，保留“轻、淡、杂志感”。
- `#8f867a`
  管 slider 单位字。
- `#ebe2d6`
  管材质卡激活态背景。
- `#8c7967`
  管材质卡激活态边框。

影响组件：

- `CustomSlider`
- `MaterialCard`
- `BottomMetric`
- 左侧顶部品牌区
- 左侧 tab 切换区

#### 2. 中部 3D 预览区

- `#f7f2ea`
  管参数变更 HUD 的浮层背景。
- `#dfd2c2`
  管 HUD 行分隔线。
- `#8f867a / #a79a8a / #42241C`
  分别管 HUD 标签、旧值、新值层级。
- `#8f867a`
  管 3D PREVIEW 标题和四角装饰线。

影响组件：

- 参数更新 HUD
- 3D 预览角标
- 预览四角装饰线

#### 3. Cart Summary

- `#f7f2ea`
  管 summary 卡片背景。
- `#42241C`
  管标题和价格数字。
- `#9d9588 / #7d766b`
  管说明文和 breakdown 文本。

影响组件：

- `CONFIG SUMMARY` 卡片

#### 4. 右侧 Design Notes

- `#faf7f1`
  管右侧 notes 区整体背景。
- `#9f978d`
  管 `EDITOR'S INSIGHT` 标签。
- `#b0a698`
  管 `INQUIRY` 标签。
- `#332b25`
  管 assistant 正文。
- `#f0e7dc`
  管用户 inquiry 卡片底色。
- `#5b3728`
  管 inquiry 卡片文字。
- `#fcfaf6`
  管输入栏底色。
- `#8f867a`
  管输入框 placeholder。
- `#b8aea1`
  管发送按钮默认态图标。
- `#f1e7db`
  管发送按钮 hover 背景。

影响组件：

- chat / notes 内容流
- typing 状态
- 底部输入栏

#### 5. 底部操作条

- `#5a3022`
  管 `FROM RHINO` 主按钮底色。
- `#714131`
  管主按钮 hover。
- `#9e7e6f`
  管主按钮 disabled。
- `#ebe2d6`
  管底部导航激活态背景。
- `#f7f1e8`
  管底部导航 hover 背景。
- `#8f867a`
  管底部导航未激活文字。

影响组件：

- `FROM RHINO` 按钮
- `DESIGN / SHOWROOM / CART` 底部导航

### `src/components/ShowroomPanel.tsx`

作用：showroom 覆盖层的上传区、预览区、AI 输出区。

本次修改：

- `#f8f3eb`
  管 showroom 覆盖层整体背景，从黑色浮层改为暖色半透明浮层。
- `#42241C`
  管 showroom 主边框、分栏线。
- `#5a3022 / #714131`
  管 `Upload Room` 按钮常态 / hover。
- `#fcfaf6`
  管上传卡片底色。
- `#f3e7db`
  管拖拽激活态背景。
- `#cdb9a5 / #9f866f`
  管上传卡片边框和 hover 边框。
- `#f4ede3`
  管房间图片预览容器底色。
- `#f5ede2`
  管空状态拖拽区 radial 背景。
- `#d7c8b5`
  管 preview / output 边框。
- `#fcfaf6 -> #efe4d6`
  管 AI 输出区背景渐变。
- `#42241C`
  管 showroom 主标题和空状态主文案。
- `#8f867a / #9f978d`
  管辅助说明、元信息、空状态提示文字。

影响组件：

- showroom 顶部工具条
- 输入上传区
- 房间图预览框
- AI Output 区
- showroom loading / empty 状态

## Adjustment Logic

本轮不是简单“全变浅”，而是做了三层统一：

- 结构层：`#42241C` 负责边框、分隔线、标题，保证界面骨架稳定。
- 纸面层：`#faf6ef`、`#f8f5ef`、`#fcfaf6`、`#f7f2ea` 负责背景深浅关系。
- 信息层：`#42241C`、`#8f867a`、`#b8aea1` 负责主次文本层级。

保留的唯一强强调色是 `#e63b2e`，专门承担：

- slider 进度
- loading / generating
- 状态提示
- 品牌红点

这样做的目的，是让页面在整体暖棕调中仍然有少量视觉锚点，不会全部糊成一片。

## Remaining Notes

- `App.tsx` 里仍有几处历史中文字符串编码异常，这次没有一起处理，只处理了颜色和视觉统一。
- 如果后续要继续收敛代码，建议把 `App.tsx` 和 `ShowroomPanel.tsx` 里的 hex 进一步抽到 token 或常量里，避免下次重复人工搜改。

## Follow-up Adjustments

- 参数数值文字已从偏浅色改为 `#6b4a3a`。
  位置：`src/App.tsx` 的 `CustomSlider`
  影响：所有参数滑杆右侧的大号数值

- hover 和 selected 现在都只改文字颜色，不改底色。
  位置：`src/App.tsx`
  影响：左侧 tab、材质卡、右下导航、发送按钮、`FROM RHINO` 按钮

- 面板选项之间的细线已删除。
  位置：`src/App.tsx`
  影响：左侧 tab 组、底部导航组

- Design Notes 消息宽度已改为适应整个 chat 面板宽度。
  位置：`src/App.tsx`
  影响：右侧 `Design Notes` 中的 inquiry 和 editor's insight 内容块

- Design Notes 标题区、消息区和段间距已进一步压缩。
  位置：`src/App.tsx`
  影响：右侧面板整体留白密度，更接近编辑页而不是展示页

- 输入框不再有 focus 背景变化；只有发送按钮保留 hover 和 active 状态。
  位置：`src/App.tsx`
  影响：右侧输入区交互更克制，视觉更稳定

- 材质卡在不改背景色的前提下，增强了状态区分。
  位置：`src/App.tsx`
  影响：`MaterialCard`
  规则：普通态使用浅棕边框；hover 提升边框对比；active 使用更深边框、同色文字和右上角实心圆点标记
