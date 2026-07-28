# xmind pal for Obsidian

在 Obsidian 笔记中直接嵌入并预览 `.xmind` 思维导图文件。

[English](../README.md)

## 功能

- **代码块嵌入** — 使用 `` ```xmind-pal `` 代码块，在任何笔记中嵌入思维导图。
- **注释嵌入** — 使用 `%%xmind-pal%%` 注释进行轻量、无干扰的嵌入。在阅读模式下渲染，在实时预览中保持隐藏。
- **Frontmatter 属性支持** — 通过笔记属性（wikilink）引用 xmind 文件。
- **单个笔记支持多个嵌入** — 每个代码块或注释可以引用不同的属性或文件。
- **缩略图渲染（默认）** — 显示 XMind 生成的预览图。加载快、原生效果、无需网络。
- **在线渲染** — 通过 XMind 官方嵌入查看器渲染（完全还原 XMind 效果，需要网络）。
- **工具栏与外部打开** — 单击或双击即可在默认应用中打开 `.xmind` 文件进行编辑。

## 安装

### 手动安装

1. 从 [latest release](../../releases) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在你的 Obsidian 库中，进入 `.obsidian/plugins/`。
3. 创建一个名为 `xmind pal` 的文件夹，并将三个文件复制进去。
4. 打开 Obsidian → 设置 → 社区插件 → 启用 "xmind pal"。

## 使用

插件支持两种嵌入方式：**代码块**和**注释**。两者都支持相同的文件引用语法。

### 代码块

在任意笔记中添加 `xmind-pal` 代码块：

### 1. 默认属性（空代码块）

使用设置中配置的属性名（默认：`xmind`）：

````
```xmind-pal
```
````

笔记需要包含一个带有 xmind 文件链接的 frontmatter 属性：

```yaml
---
xmind: "![[my-mindmap.xmind]]"
---
```

### 2. 自定义属性

指定其他属性名：

````
```xmind-pal
property: my-mindmap
```
````

### 3. 直接文件链接（嵌入语法）

````
```xmind-pal
![[diagram.xmind]]
```
````

### 4. 直接文件链接（wikilink 语法）

````
```xmind-pal
[[diagram.xmind]]
```
````

### 5. 直接文件路径

````
```xmind-pal
file: diagram.xmind
```
````

### 属性值格式

属性值支持以下任意格式：
- `![[file.xmind]]` — 嵌入 wikilink
- `[[file.xmind]]` — 标准 wikilink
- `file.xmind` — 裸文件名

### 注释

使用 `%%xmind-pal%%` 注释进行更轻量的嵌入。注释仅在**阅读模式**下渲染，在**实时预览**中保持隐藏，让写作不受干扰。也可以放在 Callout 中使用。

```
%%xmind-pal%%
```

注释内支持与代码块相同的语法：

```
%%xmind-pal property: my-mindmap%%
%%xmind-pal ![[diagram.xmind]]%%
%%xmind-pal [[diagram.xmind]]%%
%%xmind-pal file: diagram.xmind%%
```

在 Callout 中使用：

```
> [!note] 思维导图
> %%xmind-pal%%
```

## 设置

| 设置 | 说明 | 默认值 |
|---|---|---|
| 默认属性 | 代码块为空时使用的 frontmatter 属性名 | `xmind` |
| 渲染模式 | 缩略图（XMind 预览图）或在线（XMind 嵌入服务） | 缩略图 |
| 区域 | XMind 嵌入服务区域：全球（`xmind.app`）或中国（`xmind.cn`）。仅在线模式下可见。 | 全球 |
| 查看器高度 | 嵌入查看器的 CSS 高度 | `500px` |
| 显示工具栏 | 在查看器上方显示包含文件名和外部打开按钮的工具栏 | 开启 |
| 双击打开 | 双击工具栏区域以默认应用程序打开 xmind 文件。仅显示工具栏时可见。 | 开启 |

## 渲染模式

### 缩略图模式（默认）

读取 XMind 存储在每个 `.xmind` 文件内的预览图（`Thumbnails/thumbnail.png`），并以响应式图片形式显示。这是大多数用户推荐的模式。

- **优点**：加载最快、100% 原生 XMind 效果、无需网络、无隐私顾虑、支持 Obsidian 内置的图片 Lightbox 放大。
- **缺点**：无法在原位平移画布；放大时会打开 Obsidian 的图片 Lightbox 弹窗。多 sheet 文件只显示第一个 sheet 的缩略图。

### 在线模式

使用 [`xmind-embed-viewer`](https://github.com/xmindltd/xmind-embed-viewer) 库，通过 iframe 指向 XMind 嵌入服务来渲染 `.xmind` 文件。

- **优点**：可交互画布，支持平移、缩放和全屏；功能完整。
- **缺点**：需要网络访问；某些复杂结构（例如特定逻辑图）可能因上游库限制而渲染错误。

## 网络与隐私说明

- **缩略图模式**：无需网络访问。插件从库中读取 `.xmind` 文件并在本地提取嵌入的预览图。数据不会离开你的设备。

- **在线模式**：从 `https://www.xmind.app/embed-viewer`（全球区域）或 `https://www.xmind.cn/embed-viewer`（中国区域）加载 XMind 嵌入查看器。你的 `.xmind` 文件数据会通过 `postMessage` 发送到 iframe，并由 XMind 的 JavaScript 代码处理。需要保持网络连接。

本插件不包含任何遥测、分析或追踪功能。插件不会收集、存储或传输任何用户数据。

## 许可证

[MIT](../LICENSE)

## 致谢

- [`xmind-embed-viewer`](https://github.com/xmindltd/xmind-embed-viewer) (MIT) — XMind Ltd. 出品的 XMind 嵌入查看器库。
- [`fflate`](https://github.com/101arrowz/fflate) (MIT) — 101arrowz 出品的高性能 ZIP 解压库。
