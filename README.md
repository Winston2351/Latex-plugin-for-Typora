# LaTeX 数学输入法 (math-input)

Typora 插件——在 `$$` 块公式与行内公式中输入 `\缩写` 或 `\中文` 即可检索并补全 LaTeX 命令。

**纯本地运行，零网络请求，零依赖，无需构建。**

## 功能

### `\缩写` → ghost 提示

输入 `\f` 后立即出现浅灰 ghost `rac{}{}`，按 **Tab** 写入 `\frac{}{}`，光标自动落入第一个 `{}`，再按 **Tab** 逐槽跳转，末尾退出。

### `\中文` → 候选弹窗

输入 `\积分` 弹出候选列表（`int` / `iint` / `iiint` / `oint`），**↑ ↓** 切换候选（每 5 条一页、跨页自动翻动，右下角显示页码），**← →** 移动光标（弹窗随光标处命令自动刷新或关闭），**空格** 或 **Tab** 选中。写入后同样进入槽位跳转。

候选弹窗每页显示 5 条，右下角以灰色显示当前页码（如 `2/4 页`）；弹窗悬浮于光标上方，不遮挡已输入的公式。

### `\` → 热门列表

单独输入 `\` 显示 20 条常用命令（分式、积分、求和、根号、希腊字母……）。

### 槽位跳转

补全内容中的 `{}` 是空组槽，`\u0001` 是裸槽。写入后光标自动落入第一个槽，**Tab** 跳下一个，**Shift+Tab** 跳上一个，越过末槽后退出槽模式。

## 支持的命令（246 条）

| 分类 | 示例 |
|---|---|
| 分式 / 根式 | `\frac{}{}` `\sqrt{}` `\sqrt[1]{}` |
| 积分 / 求和 | `\int_{}^{}` `\iint_{}^{}` `\sum_{}^{}` `\prod_{}^{}` |
| 希腊字母 | `\alpha` `\beta` `\Gamma` `\delta` `\Theta` … |
| 运算符 | `\times` `\cdot` `\div` `\pm` `\otimes` … |
| 关系符 | `\leq` `\geq` `\neq` `\approx` `\propto` … |
| 集合 | `\in` `\subset` `\cup` `\cap` `\emptyset` … |
| 箭头 | `\rightarrow` `\Rightarrow` `\leftrightarrow` `\mapsto` … |
| 自适应括号 | `\left\{ \right\}` `\left( \right)` `\left[ \right]` |
| 重音 | `\hat{}` `\bar{}` `\vec{}` `\dot{}` `\tilde{}` |
| 字体 | `\mathbb{}` `\mathcal{}` `\mathbf{}` `\text{}` |
| 多行环境 | `\begin{cases}` `\begin{pmatrix}` `\begin{aligned}` |

## 安装

### 方式一：手动安装

1. 下载本仓库的 `manifest.json`、`main.js`、`style.css`
2. 将三个文件放入 Typora 插件目录的 `math-input` 子文件夹：

   - **Windows**: `%APPDATA%\Typora\plugins\plugins\math-input\`
   - **macOS**: `~/Library/Application Support/typora/plugins/plugins/math-input/`
   - **Linux**: `~/.config/Typora/plugins/plugins/math-input/`

3. 编辑 `%APPDATA%\Typora\plugins\settings\plugins.json`（不存在则创建），添加：

   ```json
   {
     "math-input": true
   }
   ```

4. 重启 Typora。

### 方式二：通过 Typora 插件市场

（暂未上架，可手动安装）

## 使用方法

1. 在 Typora 中输入 `$$` 并回车，进入块公式编辑模式
2. 输入 `\f`、`\积分`、`\al` 等
3. 根据提示按 Tab / 空格补全
4. Tab 跳转槽位，填写参数

行内公式同理：输入 `$...$` 进入行内编辑态后，同样支持 `\缩写` 和 `\中文`。

## 交互速查

| 操作 | 键位 |
|---|---|
| 接受 ghost / 选中候选 | `Tab` 或 `Space` |
| 切换候选（跨 5 条自动翻页） | `↑` `↓` |
| 在公式中移动光标（弹窗随之刷新/关闭） | `←` `→` |
| 下一槽位 | `Tab` |
| 上一槽位 | `Shift+Tab` |
| 关闭弹窗 | `Esc` |

## 技术细节

- **块公式编辑器**是 CodeMirror 5 定制版，插件通过 `MutationObserver` 自动挂钩新创建的 CM 实例
- **行内公式**是 `contenteditable` 的 `script[type="math/tex"]` 元素
- 完全绕开 Typora core 的 `EditorSuggest`（该机制在数学节点内不工作）
- 纯 ESM 模块，`export default` 插件类，无打包步骤

## 环境要求

- Typora ≥ 1.x（core ≥ 2.10.42）
- Windows / macOS / Linux

## 更新日志

- **1.1.2** 修复行内公式一系列补全异常（此前修复仅覆盖块公式）：① 补全后光标跳错位置（槽位偏移误当全公式绝对偏移，文字会被输入到前面的槽位）；② 在错误位置再按 Tab 会覆盖原位置文字（`execCommand` 同步重入导致陈旧候选框复活）；③ 行尾完整命令（如 `\alpha`）持续唤起候选框、空格被吞（现精确匹配且无模板时不弹框，空格直接输入）；④ 行内公式内无候选框时按 Tab 会向源码插入制表符（现吞掉）。块公式同步加入“完整命令不弹框”规则
- **1.1.1** 修复补全后光标错位（根因：手动摘除 ghost 挂件 DOM 破坏了 CodeMirror 的视图/测量缓存，导致光标画到旧公式处、无槽命令补全后候选复弹需再按一次 Tab）；ghost 挂件改由 CodeMirror 自身生命周期管理；候选窗口按键调整——`←` `→` 归还编辑器用于移动光标（弹窗随光标处命令自动刷新），`↑` `↓` 选择候选（每 5 条一页、跨页自动翻动，右下角灰色页码保留），`Tab`/空格应用，`Esc` 关闭；槽位状态下候选 UI 优先、槽内 `\` 支持嵌套补全；块公式 ghost 真实占位（不再与灰色 `$` 重叠），行内 ghost 为不透明悬浮条
- **1.1.0** 修复同一 `$$` 中多个公式时槽位状态残留导致 Tab 跳错位置的问题；候选弹窗分页（5 条/页，`←` `→` 翻页，右下角灰色页码），弹窗不再遮挡原公式
- **1.0.0** 首个版本：246 条命令、ghost 提示、中文候选、槽位跳转、明暗主题适配

## 许可

MIT
