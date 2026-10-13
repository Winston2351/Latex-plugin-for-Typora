/**
 * LaTeX 数学输入法 (math-input)
 *
 * 在 $$ 块公式 (CodeMirror 5) 与行内公式 (contenteditable script[type=math/tex]) 中：
 *   - 输入 \缩写（如 \f）→ 浅灰 ghost 提示，Tab 写入完整语法
 *   - 输入 \中文（如 \积分）→ 候选弹窗，左右箭头切换、空格/Tab 选中
 *   - 补全内容自带 {} 槽位，光标自动落入，Tab 逐槽跳转
 *
 * 纯本地实现，无任何网络请求；不依赖 typora core 的 EditorSuggest
 * （该机制依赖 selection.getTextAround()，在数学编辑节点内返回空，无法触发）。
 */

const { Plugin } = window[Symbol.for('typora-plugin-core@v2')]

// 裸槽占位符（插入时移除，仅用于标记光标落点；区别于 LaTeX 空组 {}）
const SLOT = '\u0001' // 裸槽占位符（运行时为 U+0001，区别于 LaTeX 空组 {}）
const CN = '一-鿿'

// ───────────────────────── 命令目录 ─────────────────────────

/**
 * @param {string} name   命令名（不含反斜杠）
 * @param {string} insert 插入文本；{} = 空组槽；SLOT = 裸槽
 * @param {string[]} [zh]   中文检索词
 * @param {string[]} [abbr] 英文缩写
 */
function cmd(name, insert, zh, abbr) {
  return { name, insert, zh: zh || [], abbr: abbr || [] }
}

const COMMANDS = [
  // —— 分式 / 根式 ——
  cmd('frac', '\\frac{}{}', ['分式', '分数', '分数线'], ['f']),
  cmd('dfrac', '\\dfrac{}{}', ['大分式', '显示分式']),
  cmd('tfrac', '\\tfrac{}{}', ['行内分式', '小分式']),
  cmd('sqrt', '\\sqrt{}', ['根号', '平方根', '开方'], ['sq']),
  cmd('nthroot', '\\sqrt[]{}', ['n次方根', '开n次方', 'n次根号']),

  // —— 大型运算符 ——
  cmd('sum', '\\sum_{}^{}', ['求和', '求和号', '西格玛', '累加'], ['sum']),
  cmd('prod', '\\prod_{}^{}', ['连乘', '乘积', '求积']),
  cmd('coprod', '\\coprod_{}^{}', ['余积', '上积']),
  cmd('int', '\\int_{}^{}', ['积分', '定积分'], ['int']),
  cmd('iint', '\\iint_{}^{}', ['二重积分', '双积分']),
  cmd('iiint', '\\iiint_{}^{}', ['三重积分', '三积分']),
  cmd('oint', '\\oint_{}', ['环路积分', '闭合积分', '曲线积分', '环积分']),
  cmd('lim', '\\lim_{}', ['极限']),
  cmd('limsup', '\\limsup_{}', ['上极限']),
  cmd('liminf', '\\liminf_{}', ['下极限']),
  cmd('bigcup', '\\bigcup_{}^{}', ['大并集', '并集求和']),
  cmd('bigcap', '\\bigcap_{}^{}', ['大交集', '交集求积']),

  // —— 函数 ——
  cmd('sin', '\\sin', ['正弦']),
  cmd('cos', '\\cos', ['余弦']),
  cmd('tan', '\\tan', ['正切']),
  cmd('cot', '\\cot', ['余切']),
  cmd('sec', '\\sec', ['正割']),
  cmd('csc', '\\csc', ['余割']),
  cmd('arcsin', '\\arcsin', ['反正弦']),
  cmd('arccos', '\\arccos', ['反余弦']),
  cmd('arctan', '\\arctan', ['反正切']),
  cmd('sinh', '\\sinh', ['双曲正弦']),
  cmd('cosh', '\\cosh', ['双曲余弦']),
  cmd('tanh', '\\tanh', ['双曲正切']),
  cmd('coth', '\\coth', ['双曲余切']),
  cmd('log', '\\log', ['对数', '常用对数']),
  cmd('ln', '\\ln', ['自然对数']),
  cmd('lg', '\\lg', ['十进对数']),
  cmd('exp', '\\exp', ['指数函数']),
  cmd('min', '\\min', ['最小值']),
  cmd('max', '\\max', ['最大值']),
  cmd('sup', '\\sup', ['上确界']),
  cmd('inf', '\\inf', ['下确界']),
  cmd('arg', '\\arg', ['辐角']),
  cmd('deg', '\\deg', ['度数']),
  cmd('det', '\\det', ['行列式']),
  cmd('gcd', '\\gcd', ['最大公约数']),

  // —— 希腊字母（小写）——
  cmd('alpha', '\\alpha', ['阿尔法', '阿尔法α']),
  cmd('beta', '\\beta', ['贝塔']),
  cmd('gamma', '\\gamma', ['伽马']),
  cmd('delta', '\\delta', ['德尔塔']),
  cmd('epsilon', '\\epsilon', ['伊普西龙']),
  cmd('varepsilon', '\\varepsilon', ['艾普西龙', '弯epsilon']),
  cmd('zeta', '\\zeta', ['泽塔']),
  cmd('eta', '\\eta', ['伊塔']),
  cmd('theta', '\\theta', ['西塔']),
  cmd('vartheta', '\\vartheta', ['弯西塔', 'vartheta体']),
  cmd('iota', '\\iota', ['约塔']),
  cmd('kappa', '\\kappa', ['卡帕']),
  cmd('lambda', '\\lambda', ['拉姆达', '兰布达']),
  cmd('mu', '\\mu', ['缪']),
  cmd('nu', '\\nu', ['纽']),
  cmd('xi', '\\xi', ['克西']),
  cmd('omicron', '\\omicron', ['奥密克戎']),
  cmd('pi', '\\pi', ['派', '圆周率']),
  cmd('varpi', '\\varpi', ['弯派']),
  cmd('rho', '\\rho', ['柔']),
  cmd('varrho', '\\varrho', ['弯柔']),
  cmd('sigma', '\\sigma', ['西格马', '西格玛']),
  cmd('varsigma', '\\varsigma', ['弯西格马']),
  cmd('tau', '\\tau', ['陶']),
  cmd('upsilon', '\\upsilon', ['宇普西龙']),
  cmd('phi', '\\phi', ['斐', '斐伊', '佛爱']),
  cmd('varphi', '\\varphi', ['弯斐', '空心phi']),
  cmd('chi', '\\chi', ['卡伊', '希']),
  cmd('psi', '\\psi', ['普西']),
  cmd('omega', '\\omega', ['欧米伽', '欧米茄']),

  // —— 希腊字母（大写）——
  cmd('Gamma', '\\Gamma', ['大写伽马', '伽马大写']),
  cmd('Delta', '\\Delta', ['大写德尔塔', '德尔塔大写', '德尔塔Δ']),
  cmd('Theta', '\\Theta', ['大写西塔']),
  cmd('Lambda', '\\Lambda', ['大写拉姆达']),
  cmd('Xi', '\\Xi', ['大写克西']),
  cmd('Pi', '\\Pi', ['大写派']),
  cmd('Sigma', '\\Sigma', ['大写西格马', '西格马大写']),
  cmd('Upsilon', '\\Upsilon', ['大写宇普西龙']),
  cmd('Phi', '\\Phi', ['大写斐']),
  cmd('Psi', '\\Psi', ['大写普西']),
  cmd('Omega', '\\Omega', ['大写欧米伽', '欧米伽大写']),

  // —— 二元运算符 ——
  cmd('times', '\\times', ['乘号', '叉乘', '乘以']),
  cmd('div', '\\div', ['除号', '除以']),
  cmd('cdot', '\\cdot', ['点乘', '乘点', '居中圆点']),
  cmd('cdots', '\\cdots', ['省略号', '居中点', '横向省略']),
  cmd('ldots', '\\ldots', ['底线省略号']),
  cmd('vdots', '\\vdots', ['竖直省略号', '纵向省略']),
  cmd('ddots', '\\ddots', ['斜省略号', '对角省略']),
  cmd('pm', '\\pm', ['加减', '正负号']),
  cmd('mp', '\\mp', ['减加', '负正号']),
  cmd('ast', '\\ast', ['星号', '星乘']),
  cmd('star', '\\star', ['五角星']),
  cmd('circ', '\\circ', ['圆圈', '度数符', '复合']),
  cmd('bullet', '\\bullet', ['实心点']),
  cmd('diamond', '\\diamond', ['菱形']),
  cmd('oplus', '\\oplus', ['直和', '圈加']),
  cmd('ominus', '\\ominus', ['圈减']),
  cmd('otimes', '\\otimes', ['张量积', '圈乘', '克罗内克积']),
  cmd('oslash', '\\oslash', ['圈除']),
  cmd('odot', '\\odot', ['圈点']),

  // —— 关系符 ——
  cmd('neq', '\\neq', ['不等', '不等于', '不等号']),
  cmd('leq', '\\leq', ['小于等于', '不大于', '≤']),
  cmd('geq', '\\geq', ['大于等于', '不小于', '≥']),
  cmd('leqslant', '\\leqslant', ['小于等于斜']),
  cmd('geqslant', '\\geqslant', ['大于等于斜']),
  cmd('ll', '\\ll', ['远小于']),
  cmd('gg', '\\gg', ['远大于']),
  cmd('approx', '\\approx', ['约等于', '约等', '近似']),
  cmd('equiv', '\\equiv', ['恒等', '同余', '全等号', '等价于']),
  cmd('cong', '\\cong', ['同构', '全等']),
  cmd('sim', '\\sim', ['相似', '正比波浪']),
  cmd('simeq', '\\simeq', ['约等于弯']),
  cmd('propto', '\\propto', ['正比于', '成比例']),
  cmd('doteq', '\\doteq', ['点等']),
  cmd('prec', '\\prec', ['先于']),
  cmd('succ', '\\succ', ['后于']),

  // —— 集合 ——
  cmd('in', '\\in', ['属于', '元素属于']),
  cmd('notin', '\\notin', ['不属于']),
  cmd('ni', '\\ni', ['包含于反向', '反属']),
  cmd('subset', '\\subset', ['子集', '真子集', '包含于']),
  cmd('supset', '\\supset', ['超集', '包含', '真包含']),
  cmd('subseteq', '\\subseteq', ['子集或等', '包含于等于']),
  cmd('supseteq', '\\supseteq', ['超集或等', '包含等于']),
  cmd('cup', '\\cup', ['并集', '并']),
  cmd('cap', '\\cap', ['交集', '交']),
  cmd('setminus', '\\setminus', ['差集', '集合减']),
  cmd('emptyset', '\\emptyset', ['空集']),
  cmd('varnothing', '\\varnothing', ['空集圆']),
  cmd('forall', '\\forall', ['任意', '全称量词', '对所有']),
  cmd('exists', '\\exists', ['存在', '存在量词']),
  cmd('nexists', '\\nexists', ['不存在']),
  cmd('neg', '\\neg', ['非', '逻辑非']),
  cmd('land', '\\land', ['逻辑与', '且']),
  cmd('lor', '\\lor', ['逻辑或', '或']),
  cmd('complement', '\\complement', ['补集']),

  // —— 箭头 ——
  cmd('to', '\\to', ['箭头', '趋向', '右箭头短']),
  cmd('rightarrow', '\\rightarrow', ['右箭头', '向右']),
  cmd('leftarrow', '\\leftarrow', ['左箭头', '向左']),
  cmd('leftrightarrow', '\\leftrightarrow', ['左右箭头', '双向箭头']),
  cmd('longrightarrow', '\\longrightarrow', ['长右箭头']),
  cmd('longleftarrow', '\\longleftarrow', ['长左箭头']),
  cmd('longleftrightarrow', '\\longleftrightarrow', ['长双向箭头']),
  cmd('Rightarrow', '\\Rightarrow', ['推出', '蕴含', '双右箭头', '右大箭头']),
  cmd('Leftarrow', '\\Leftarrow', ['双左箭头', '左大箭头']),
  cmd('Leftrightarrow', '\\Leftrightarrow', ['双双向箭头', '等价箭头']),
  cmd('implies', '\\implies', ['推出长', '蕴含长']),
  cmd('iff', '\\iff', ['当且仅当', '等价']),
  cmd('mapsto', '\\mapsto', ['映射到', '映射箭头']),
  cmd('longmapsto', '\\longmapsto', ['长映射箭头']),
  cmd('uparrow', '\\uparrow', ['上箭头']),
  cmd('downarrow', '\\downarrow', ['下箭头']),
  cmd('Uparrow', '\\Uparrow', ['双上箭头']),
  cmd('Downarrow', '\\Downarrow', ['双下箭头']),
  cmd('nwarrow', '\\nwarrow', ['左上箭头']),
  cmd('nearrow', '\\nearrow', ['右上箭头']),
  cmd('swarrow', '\\swarrow', ['左下箭头']),
  cmd('searrow', '\\searrow', ['右下箭头']),
  cmd('rightleftharpoons', '\\rightleftharpoons', ['可逆反应', '平衡箭头']),
  cmd('hookrightarrow', '\\hookrightarrow', ['钩子右箭头', '包含映射']),

  // —— 括号（自适应大小，槽在中间）——
  cmd('paren', '\\left(' + SLOT + '\\right)', ['圆括号', '小括号', '自动括号']),
  cmd('bracket', '\\left[' + SLOT + '\\right]', ['方括号', '中括号', '自动方括号']),
  cmd('brace', '\\left\\{' + SLOT + '\\right\\}', ['花括号', '大括号', '自动花括号']),
  cmd('abs', '\\left|' + SLOT + '\\right|', ['绝对值', '绝对值号']),
  cmd('norm', '\\left\\|' + SLOT + '\\right\\|', ['范数', '模长', '双竖线']),
  cmd('ceil', '\\left\\lceil' + SLOT + '\\right\\rceil', ['上取整', '天花板']),
  cmd('floor', '\\left\\lfloor' + SLOT + '\\right\\rfloor', ['下取整', '地板']),
  cmd('langle', '\\left\\langle' + SLOT + '\\right\\rangle', ['尖括号', '内积', '角括号', '量子态', '左右尖括号']),
  cmd('binom', '\\binom{}{}', ['二项式', '组合数', '二项分布']),

  // —— 重音 / 装饰 ——
  cmd('hat', '\\hat{}', ['帽子', '尖帽']),
  cmd('widehat', '\\widehat{}', ['大帽子', '宽帽']),
  cmd('bar', '\\bar{}', ['上划线短', '均值']),
  cmd('overline', '\\overline{}', ['上划线', '平均数']),
  cmd('underline', '\\underline{}', ['下划线']),
  cmd('tilde', '\\tilde{}', ['波浪号', '等价装饰']),
  cmd('widetilde', '\\widetilde{}', ['大波浪']),
  cmd('vec', '\\vec{}', ['向量', '向量箭头']),
  cmd('overrightarrow', '\\overrightarrow{}', ['长向量箭头']),
  cmd('overleftarrow', '\\overleftarrow{}', ['向量左箭头']),
  cmd('dot', '\\dot{}', ['一点', '导数点']),
  cmd('ddot', '\\ddot{}', ['两点', '二阶导数点']),
  cmd('dddot', '\\dddot{}', ['三点']),
  cmd('check', '\\check{}', ['对号帽']),
  cmd('breve', '\\breve{}', ['短音帽']),
  cmd('acute', '\\acute{}', ['尖重音']),
  cmd('grave', '\\grave{}', ['钝重音']),
  cmd('mathring', '\\mathring{}', ['圆圈帽']),
  cmd('cancel', '\\cancel{}', ['划掉', '删除线']),
  cmd('boxed', '\\boxed{}', ['加框', '方框']),
  cmd('overbrace', '\\overbrace{}', ['上花括号']),
  cmd('underbrace', '\\underbrace{}_{}', ['下花括号', '下方注释']),

  // —— 字体 / 文本 ——
  cmd('mathrm', '\\mathrm{}', ['正体', '罗马体']),
  cmd('mathbf', '\\mathbf{}', ['粗体', '加粗']),
  cmd('mathit', '\\mathit{}', ['斜体']),
  cmd('mathsf', '\\mathsf{}', ['无衬线体']),
  cmd('mathtt', '\\mathtt{}', ['打字机体']),
  cmd('mathcal', '\\mathcal{}', ['花体', '书法体']),
  cmd('mathbb', '\\mathbb{}', ['黑板粗体', '空心体', '实数集字体']),
  cmd('mathfrak', '\\mathfrak{}', ['哥特体', '德文尖角体']),
  cmd('mathscr', '\\mathscr{}', ['手写花体']),
  cmd('text', '\\text{}', ['文本', '文字', '中文']),
  cmd('textbf', '\\textbf{}', ['文本粗体']),
  cmd('textit', '\\textit{}', ['文本斜体']),
  cmd('operatorname', '\\operatorname{}', ['自定义算子', '自定义运算符']),
  cmd('boldsymbol', '\\boldsymbol{}', ['粗斜体', '加粗符号']),
  cmd('color', '\\color{red}{}', ['颜色', '红色', '彩色']),

  // —— 空格 ——
  cmd('quad', '\\quad', ['空格', '全角空格']),
  cmd('qquad', '\\qquad', ['双倍空格', '两个全角']),
  cmd('thinspace', '\\,', ['薄空格', '小空格']),
  cmd('medspace', '\\:', ['中等空格']),
  cmd('thickspace', '\\;', ['大空格']),
  cmd('negthinspace', '\\!', ['负空格', '回缩']),
  cmd('phantom', '\\phantom{}', ['占位空白']),

  // —— 其他常用符号 ——
  cmd('partial', '\\partial', ['偏导', '偏微分']),
  cmd('nabla', '\\nabla', ['梯度', '劈形算符', '倒三角']),
  cmd('infty', '\\infty', ['无穷', '无限', '无穷大']),
  cmd('angle', '\\angle', ['角度符', '角']),
  cmd('perp', '\\perp', ['垂直']),
  cmd('parallel', '\\parallel', ['平行']),
  cmd('triangle', '\\triangle', ['三角形']),
  cmd('dots', '\\dots', ['点号', '省略点']),
  cmd('hbar', '\\hbar', ['约化普朗克常数']),
  cmd('ell', '\\ell', ['手写l']),
  cmd('Re', '\\Re', ['实部']),
  cmd('Im', '\\Im', ['虚部']),
  cmd('aleph', '\\aleph', ['阿列夫']),
  cmd('wp', '\\wp', ['幂集符']),
  cmd('surd', '\\surd', ['根号符号']),
  cmd('pounds', '\\pounds', ['英镑']),
  cmd('backslash', '\\backslash', ['反斜杠符号']),
  cmd('mid', '\\mid', ['竖线', '条件符']),
  cmd('colon', '\\colon', ['比例号']),
  cmd('degree', '^{\\circ}', ['度', '角度数']),
  cmd('substack', '\\substack{}', ['多行下标']),

  // —— 矩阵与多行环境（多行模板，Tab 逐槽跳转）——
  cmd('matrix', '\\begin{matrix}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{matrix}', ['矩阵无括号', '矩阵']),
  cmd('pmatrix', '\\begin{pmatrix}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{pmatrix}', ['矩阵', '圆括号矩阵', '矩阵圆括号']),
  cmd('bmatrix', '\\begin{bmatrix}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{bmatrix}', ['方括号矩阵', '矩阵方括号']),
  cmd('Bmatrix', '\\begin{Bmatrix}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{Bmatrix}', ['花括号矩阵', '矩阵花括号']),
  cmd('vmatrix', '\\begin{vmatrix}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{vmatrix}', ['行列式', '竖线矩阵']),
  cmd('Vmatrix', '\\begin{Vmatrix}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{Vmatrix}', ['双竖线矩阵']),
  cmd('cases', '\\begin{cases}\n' + SLOT + ', & ' + SLOT + ' \\\\\n' + SLOT + ', & ' + SLOT + '\n\\end{cases}', ['分段函数', '大括号分类', '分情况']),
  cmd('aligned', '\\begin{aligned}\n' + SLOT + ' &= ' + SLOT + ' \\\\\n' + SLOT + ' &= ' + SLOT + '\n\\end{aligned}', ['对齐', '多行公式对齐', '等号对齐']),
  cmd('gathered', '\\begin{gathered}\n' + SLOT + ' \\\\\n' + SLOT + '\n\\end{gathered}', ['居中多行', '聚集对齐']),
  cmd('split', '\\begin{split}\n' + SLOT + ' &= ' + SLOT + ' \\\\\n&= ' + SLOT + '\n\\end{split}', ['折行对齐', '拆分长公式']),
  cmd('array', '\\begin{array}{cc}\n' + SLOT + ' & ' + SLOT + ' \\\\\n' + SLOT + ' & ' + SLOT + '\n\\end{array}', ['数组环境', '表格矩阵']),
]

// 去重保护（开发期笔误产生重名时后者覆盖前者）
const COMMAND_MAP = new Map()
for (const c of COMMANDS) {
  if (COMMAND_MAP.has(c.name)) console.warn('[math-input] duplicate command:', c.name)
  COMMAND_MAP.set(c.name, c)
}
const ALL_COMMANDS = [...COMMAND_MAP.values()]

// 刚输入 \ 时的热门默认顺序
const HOT = ['frac', 'int', 'sum', 'sqrt', 'alpha', 'beta', 'times', 'cdot', 'leq', 'geq', 'neq', 'approx', 'infty', 'partial', 'in', 'rightarrow', 'Rightarrow', 'cases', 'pmatrix', 'text']

// ───────────────────────── 匹配引擎 ─────────────────────────

const isChinese = ch => /[一-鿿]/.test(ch)

/**
 * 解析光标前的命令查询。
 * @returns {{query:string, startCh?:number} | null}
 * 行内/块均只处理单行文本；startCh 为行内偏移（第一个反斜杠），块场景使用。
 */
function parseQuery(lineBefore) {
  const m = lineBefore.match(new RegExp('\\\\([A-Za-z' + CN + ']*)$'))
  if (!m) return null
  // 排除连续偶数个反斜杠（LaTeX 换行 \\ 之后不是命令）
  let p = m.index
  while (p > 0 && lineBefore[p - 1] === '\\') p--
  const totalSlashes = m.index - p + 1
  if (totalSlashes % 2 === 0) return null
  return { query: m[1], startCh: m.index }
}

function matchCommands(query) {
  if (query === '') return HOT.map(n => COMMAND_MAP.get(n)).filter(Boolean)
  const cnMode = isChinese(query[0])
  const scored = []
  for (const c of ALL_COMMANDS) {
    if (cnMode) {
      let best = 99
      for (const w of c.zh) {
        if (w === query) { best = 0; break }
        if (w.startsWith(query)) { best = Math.min(best, 1); continue }
        if (w.includes(query)) best = Math.min(best, 2)
      }
      if (best < 99) scored.push([best, c])
    } else {
      const q = query // 英文大小写敏感（\Gamma vs \gamma）
      if (c.name === q) scored.push([0, c])
      else if (c.name.startsWith(q)) scored.push([1, c])
      else if (c.abbr.some(a => a === q)) scored.push([2, c])
      else if (c.abbr.some(a => a.startsWith(q))) scored.push([3, c])
      else if (c.name.toLowerCase().includes(q.toLowerCase()) && q.length >= 2) scored.push([4, c])
    }
  }
  const hotIdx = new Map(HOT.map((n, i) => [n, i]))
  scored.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0]
    const ha = hotIdx.has(a[1].name) ? hotIdx.get(a[1].name) : 999
    const hb = hotIdx.has(b[1].name) ? hotIdx.get(b[1].name) : 999
    if (ha !== hb) return ha - hb
    return 0 // 保持目录顺序（Array.sort 稳定）
  })
  return scored.slice(0, 30).map(x => x[1])
}

/** ghost 后缀：仅当模板以 \name 开头且 name 以英文 query 为前缀时可计算 */
function ghostSuffix(command, query) {
  if (!query || isChinese(query[0])) return null
  if (!command.name.startsWith(query)) return null
  if (!command.insert.startsWith('\\' + command.name)) return null
  return command.insert.slice(1 + query.length)
}

// ───────────────────────── 槽位 ─────────────────────────

/**
 * 展开模板：把 SLOT 移除，记录槽位（相对索引区间）。
 * {} 为空组槽（区间跨括号内），SLOT 为裸槽（零宽）。
 * 正确处理 \{ \} \\ 转义。
 */
function expandSnippet(insert) {
  let text = ''
  const slots = []
  for (let i = 0; i < insert.length; i++) {
    const ch = insert[i]
    if (ch === '\\') {
      text += insert[i + 1] !== undefined ? insert[i] + insert[i + 1] : '\\'
      if (insert[i + 1] !== undefined) i++
      continue
    }
    if (ch === SLOT) {
      slots.push([text.length, text.length])
      continue
    }
    if (ch === '{' && insert[i + 1] === '}') {
      text += '{}'
      slots.push([text.length - 1, text.length - 1]) // {} 中间位置
      i++
      continue
    }
    text += ch
  }
  return { text, slots }
}

// ───────────────────────── 弹窗 / Ghost UI ─────────────────────────

const PAGE_SIZE = 5 // 候选弹窗每页条数

class CompletionUI {
  constructor() {
    this.popup = null
    this.ghost = null
    this.ghostBm = null   // CM 书签挂件（块公式 ghost，真实占位）
    this.ghostCm = null   // 挂件所属 CM（clear 后用于 refresh 重算）
    this.items = []
    this.idx = 0
    this.onSelect = null
    this.mode = null // 'popup' | 'ghost'
    this.owner = null
  }

  _clearGhostSpace() {
    if (!this.ghostBm) return
    const cm = this.ghostCm
    try { this.ghostBm.clear() } catch (e) { /* CM 已销毁 */ }
    this.ghostBm = null
    this.ghostCm = null
    // 只通过 CodeMirror 自身的生命周期移除挂件并重新测量。
    // 切勿手动 remove 挂件 DOM——那会绕过 CM 的行测量(measure)，
    // 造成视图节点与内部缓存脱节，setSelection 的光标会画到错误位置。
    if (cm) {
      setTimeout(() => { try { cm.refresh() } catch (e) { /* 已销毁 */ } }, 0)
    }
  }

  _ensurePopup() {
    if (this.popup) return
    const el = document.createElement('div')
    el.id = 'math-input-popup'
    el.className = 'math-input-theme-auto'
    el.innerHTML = '<ul></ul><div class="mi-page"></div>'
    el.addEventListener('mousedown', e => e.preventDefault()) // 保住编辑器焦点
    el.addEventListener('click', e => {
      const li = e.target.closest('li')
      if (li && this.onSelect) this.onSelect(this.items[+li.dataset.idx])
    })
    el.addEventListener('mousemove', e => {
      const li = e.target.closest('li')
      if (li && +li.dataset.idx !== this.idx) {
        this.idx = +li.dataset.idx
        this._renderActive()
      }
    })
    document.body.appendChild(el)
    this.popup = el
  }

  _ensureGhost() {
    if (this.ghost) return
    const el = document.createElement('div')
    el.id = 'math-input-ghost'
    document.body.appendChild(el)
    this.ghost = el
  }

  get page() { return Math.floor(this.idx / PAGE_SIZE) }
  get totalPages() { return Math.max(1, Math.ceil(this.items.length / PAGE_SIZE)) }

  _renderActive() {
    const start = this.page * PAGE_SIZE
    this.popup.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', start + i === this.idx))
    const cur = this.popup.querySelector('li.active')
    if (cur) cur.scrollIntoView({ block: 'nearest' })
  }

  /** 渲染当前页（每页 PAGE_SIZE 条）+ 右下角页码 */
  _renderPage() {
    const ul = this.popup.querySelector('ul')
    ul.innerHTML = ''
    const start = this.page * PAGE_SIZE
    this.items.slice(start, start + PAGE_SIZE).forEach((c, i) => {
      const li = document.createElement('li')
      li.dataset.idx = start + i
      const left = document.createElement('span')
      left.className = 'mi-code'
      left.textContent = c.insert.replace(new RegExp(SLOT, 'g'), '')
      const right = document.createElement('span')
      right.className = 'mi-zh'
      right.textContent = c.zh[0] || ''
      li.append(left, right)
      ul.appendChild(li)
    })
    this.popup.querySelector('.mi-page').textContent =
      this.totalPages > 1 ? `${this.page + 1}/${this.totalPages} 页` : ''
    this._renderActive()
  }

  _applyThemeFrom(refEl) {
    try {
      const bg = getComputedStyle(refEl).backgroundColor
      const m = bg.match(/rgba?\(([^)]+)\)/)
      let dark = false
      if (m) {
        const parts = m[1].split(',').map(s => s.trim())
        const a = parts[3] === undefined ? 1 : +parts[3]
        if (a === 0) { dark = false } else {
          const [r, g, b] = parts.map(Number)
          dark = (0.299 * r + 0.587 * g + 0.114 * b) < 128
        }
      }
      this.popup.classList.toggle('mi-dark', dark)
    } catch (e) { /* 用默认浅色 */ }
  }

  /**
   * @param {object} state
   * state.items  候选命令
   * state.idx    初始高亮
   * state.mode   'popup' | 'ghost'
   * state.x, state.y  视口坐标（cursorCoords / rect）
   * state.height 行高
   * state.font   {family,size,weight,style,lineHeight} ghost 字体
   * state.ghostText ghost 后缀
   * state.themeRef 主题参考元素
   * state.onSelect(item)
   */
  show(state) {
    this.items = state.items
    this.idx = state.idx || 0
    this.onSelect = state.onSelect
    this._state = state
    this.hide() // 无条件清除旧 UI
    this.owner = state.owner || null

    if (state.mode === 'popup' && this.items.length) {
      this.mode = 'popup'
      this._ensurePopup()
      this._renderPage()
      this._applyThemeFrom(state.themeRef || document.body)
      this.popup.style.left = state.x + 'px'
      this.popup.style.top = state.y + 'px'
      this.popup.classList.add('mi-show')
      this._flipIfNeeded(state)
    }

    if (state.ghostText) {
      this.mode = this.mode || 'ghost'
      this._applyGhost(state.ghostText, state)
    }
  }

  _applyGhost(text, st) {
    this._clearGhostSpace()
    if (!text) {
      if (this.ghost) { this.ghost.classList.remove('mi-show'); this.ghost.textContent = '' }
      return
    }
    if (st.cm) {
      // 块公式：ghost 作为 CM 书签挂件插入光标处——处于文本流中真实占位，
      // 后续文字（含灰色 $）被正常推开，不再重叠
      const el = document.createElement('span')
      el.className = 'mi-ghost-widget'
      el.textContent = text
      try {
        this.ghostBm = st.cm.setBookmark(st.cm.getCursor(), { widget: el })
        this.ghostCm = st.cm
      } catch (e) { /* 忽略 */ }
      return
    }
    // 行内公式：不能向 script 源码插 DOM（会污染公式），用不透明悬浮 chip
    this._ensureGhost()
    const f = st.font || {}
    this.ghost.style.fontFamily = f.family || 'inherit'
    this.ghost.style.fontSize = f.size || '16px'
    this.ghost.style.fontWeight = f.weight || 'normal'
    this.ghost.style.fontStyle = f.style || 'normal'
    this.ghost.style.left = (st.ghostX != null ? st.ghostX : st.x) + 'px'
    this.ghost.style.top = (st.ghostY != null ? st.ghostY : st.y) + 'px'
    this.ghost.style.height = (st.height || 20) + 'px'
    this.ghost.textContent = text
    this.ghost.classList.add('mi-show')
  }

  /** 弹窗中切换候选项时，ghost 跟随当前项更新 */
  syncGhost() {
    const st = this._state
    if (!st || st.mode !== 'popup' || st.query === '') return
    const g = ghostSuffix(this.current(), st.query)
    this._applyGhost(g, st)
  }

  _flipIfNeeded(state) {
    const rect = this.popup.getBoundingClientRect()
    if (state.y + rect.height > window.innerHeight - 8) {
      this.popup.style.top = Math.max(8, state.y - rect.height - state.height - 4) + 'px'
    }
    if (state.x + rect.width > window.innerWidth - 8) {
      this.popup.style.left = Math.max(8, window.innerWidth - rect.width - 8) + 'px'
    }
  }

  _moveTo(newIdx) {
    const oldPage = this.page
    this.idx = ((newIdx % this.items.length) + this.items.length) % this.items.length
    if (this.page !== oldPage) this._renderPage()
    else this._renderActive()
    this.syncGhost()
  }

  next() { if (!this.popup) return; this._moveTo(this.idx + 1) }
  prev() { if (!this.popup) return; this._moveTo(this.idx - 1) }
  nextPage() {
    if (!this.popup) return
    this.idx = ((this.page + 1) % this.totalPages) * PAGE_SIZE
    this._renderPage(); this.syncGhost()
  }
  prevPage() {
    if (!this.popup) return
    this.idx = ((this.page - 1 + this.totalPages) % this.totalPages) * PAGE_SIZE
    this._renderPage(); this.syncGhost()
  }
  current() { return this.items[this.idx] }

  /** 传 owner 时仅关闭属于该 owner 的 UI；不传则无条件关闭 */
  hide(owner) {
    if (owner && this.owner && owner !== this.owner) return
    if (this.popup) { this.popup.classList.remove('mi-show'); this.popup.style.top = '-9999px' }
    if (this.ghost) { this.ghost.classList.remove('mi-show'); this.ghost.textContent = '' }
    this._clearGhostSpace()
    this.mode = null
  }

  destroy() {
    this._clearGhostSpace()
    this.popup && this.popup.remove()
    this.ghost && this.ghost.remove()
    this.popup = this.ghost = null
  }
}

// ───────────────────────── 块公式控制器（CodeMirror 5）─────────────────────────

class BlockMathController {
  constructor(cm, ui) {
    this.cm = cm
    this.ui = ui
    this.active = false
    this.slots = null      // [{s:idx,e:idx}]
    this.slotIdx = -1
    this.baseIdx = 0
    this.snippetEnd = 0
    this.suppressEnd = null // 无槽位命令刚补全的位置：光标未离开前不再弹窗

    this.onInputRead = () => this.refresh()
    this.onCursor = () => { this.refresh() }
    this.onChange = (cmArg, chg) => this._trackSlots(chg)
    this.onKeyDown = (inst, e) => this._handleKey(e)
    // 方向键触达行边界时 Typora 会把焦点移出 textarea 触发 blur；
    // UI 活跃（弹窗/ghost 显示）时忽略 blur，避免误关。
    // 真正离开编辑器时由文档级 mousedown 兜底关闭。
    this.onBlur = () => {
      if (this.active) return
      this._close()
    }

    cm.on('inputRead', this.onInputRead)
    cm.on('cursorActivity', this.onCursor)
    cm.on('change', this.onChange)
    cm.on('keydown', this.onKeyDown)
    cm.on('blur', this.onBlur)

    // 点击编辑器/弹窗外部时关闭（兜底，因为 onBlur 在 UI 活跃时被忽略）
    this.onDocMouseDown = (e) => {
      if (!this.active) return
      const wrapper = cm.getWrapperElement()
      const popup = this.ui.popup
      if (wrapper.contains(e.target)) return
      if (popup && popup.contains(e.target)) return
      this._close()
    }
    document.addEventListener('mousedown', this.onDocMouseDown, true)
  }

  destroy() {
    const cm = this.cm
    cm.off('inputRead', this.onInputRead)
    cm.off('cursorActivity', this.onCursor)
    cm.off('change', this.onChange)
    cm.off('keydown', this.onKeyDown)
    cm.off('blur', this.onBlur)
    document.removeEventListener('mousedown', this.onDocMouseDown, true)
    this._close()
  }

  _close() {
    this.ui.hide(this)
    this.active = false
    this.slots = null
    this.slotIdx = -1
    this.suppressEnd = null
  }

  _font() {
    const cs = getComputedStyle(this.cm.getWrapperElement())
    return { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle }
  }

  refresh() {
    const cm = this.cm
    const cur = cm.getCursor()
    const lineBefore = cm.getLine(cur.line).slice(0, cur.ch)
    const parsed = parseQuery(lineBefore)

    // 槽位模式：查询起点决定去留。查询永远优先于槽位（Tab 应用候选而非跳槽）。
    if (this.slots) {
      if (parsed) {
        const qStart = cm.indexFromPos({ line: cur.line, ch: parsed.startCh })
        const inSlot = this.slots.some(([s, e]) => qStart >= this.baseIdx + s && qStart <= this.baseIdx + e)
        if (!inSlot) {
          // 查询起点在所有槽位之外 → 用户新起一个公式，退出槽位模式
          this.slots = null
          this.slotIdx = -1
        }
        // 查询起点在槽内：保持外层槽位，同时照常弹候选（支持嵌套补全）
      } else {
        const idx = cm.indexFromPos(cur)
        if (this.slots.some(([s, e]) => idx >= this.baseIdx + s && idx <= this.baseIdx + e)) {
          // 槽内普通输入：保持槽位、不出 UI
          this.ui.hide(this)
          this.active = false
          return
        }
        this.slots = null
        this.slotIdx = -1
      }
    }

    if (!parsed) { this._close(); return }

    // 刚补全的无槽位命令：光标未离开插入末尾前不再弹窗（输入已完成，
    // 下一次键入 \ 自然形成新查询重新触发）
    if (this.suppressEnd != null) {
      if (cm.indexFromPos(cur) === this.suppressEnd) return
      this.suppressEnd = null
    }

    const items = matchCommands(parsed.query)
    if (!items.length) { this._close(); return }

    // 查询恰好等于完整命令且无模板：文本已就位，不弹 UI（与行内行为一致）
    if (items.length === 1 && parsed.query !== '' &&
        items[0].name === parsed.query && items[0].insert === '\\' + items[0].name) {
      this.ui.hide(this)
      this.active = false
      return
    }

    const coords = cm.cursorCoords(cur, 'window')
    const font = this._font()
    const onSelect = item => this._apply(item)
    this.active = true

    const ghost = ghostSuffix(items[0], parsed.query)
    if (items.length === 1 && parsed.query !== '' && ghost) {
      // 唯一命中且有 ghost 后缀：只出 ghost（CM 书签挂件，真实占位）
      this.ui.show({
        owner: this, query: parsed.query,
        mode: 'ghost', items, idx: 0,
        x: coords.left, y: coords.top, height: coords.bottom - coords.top,
        cm: this.cm, font, ghostText: ghost, themeRef: cm.getWrapperElement(), onSelect,
      })
    } else {
      // 多候选或刚输入 \：弹窗；高亮项 ghost 同样走书签挂件
      this.ui.show({
        owner: this, query: parsed.query,
        mode: 'popup', items, idx: 0,
        x: coords.left, y: coords.bottom + 2, height: coords.bottom - coords.top,
        cm: this.cm, font, ghostText: parsed.query === '' ? null : ghost,
        themeRef: cm.getWrapperElement(), onSelect,
      })
    }
  }

  _handleKey(e) {
    // 候选 UI 激活时优先处理。
    // 左右键不拦截：交回 CodeMirror 原生移动光标，弹窗随光标处查询自动刷新/关闭。
    if (this.active && this.ui.mode && this.ui.owner === this) {
      const mode = this.ui.mode
      if (mode === 'popup') {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault(); e.stopPropagation(); this.ui.next(); return true
          case 'ArrowUp':
            e.preventDefault(); e.stopPropagation(); this.ui.prev(); return true
          case ' ': case 'Tab':
            e.preventDefault(); e.stopPropagation(); this._apply(this.ui.current()); return true
          case 'Enter':
            this._close(); return // 放行换行
          case 'Escape':
            e.preventDefault(); e.stopPropagation(); this._close(); return true
        }
        return
      }
      if (mode === 'ghost') {
        if (e.key === 'Tab') {
          e.preventDefault(); e.stopPropagation()
          this._apply(this.ui.current())
          return true
        } else if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); this._close()
          return true
        }
        return
      }
    }
    // UI 未激活：Tab 跳槽位
    if (this.slots && this.slots.length && e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation()
      this._gotoSlot(e.shiftKey ? this.slotIdx - 1 : this.slotIdx + 1)
      return true
    }
  }

  _apply(command) {
    const cm = this.cm
    const cur = cm.getCursor()
    const lineBefore = cm.getLine(cur.line).slice(0, cur.ch)
    const parsed = parseQuery(lineBefore)
    if (!parsed) { this._close(); return }

    const from = { line: cur.line, ch: parsed.startCh }
    const { text, slots } = expandSnippet(command.insert)
    const baseIdx = cm.indexFromPos(from)
    const qLen = cm.indexFromPos(cur) - baseIdx

    // 先清 UI（含 ghost 书签），避免插入时挂件残留
    this.ui.hide(this)
    this.active = false

    // 若本次插入发生在旧模板槽位内部且新命令无槽位，之后需平移恢复外层槽位
    const prev = this.slots
      ? { slots: this.slots, base: this.baseIdx, end: this.snippetEnd, slotIdx: this.slotIdx }
      : null

    cm.operation(() => {
      cm.replaceRange(text, from, cur, '+complete')
      this.baseIdx = baseIdx
      this.snippetEnd = baseIdx + text.length
      this.suppressEnd = null
      if (slots.length) {
        this.slots = slots
        this.slotIdx = -1
        this._gotoSlot(0)
      } else {
        cm.setCursor(cm.posFromIndex(this.snippetEnd))
        this.suppressEnd = this.snippetEnd // 输入已完成：同位置不再弹窗
        if (prev && baseIdx >= prev.base && baseIdx <= prev.end) {
          // 嵌套在旧模板内补全无槽位命令：平移外层槽位并保持可跳转
          const delta = text.length - qLen
          const a = baseIdx
          this.slots = prev.slots.map(([s, e]) => {
            const as = prev.base + s, ae = prev.base + e
            if (a <= as) return [s + delta, e + delta]
            if (a > ae) return [s, e]
            return [s, e + delta] // 插入点在本槽内：槽增长
          })
          this.baseIdx = prev.base
          this.snippetEnd = prev.end + delta
          const rel = this.suppressEnd - this.baseIdx
          const k = this.slots.findIndex(([s, e]) => rel >= s && rel <= e)
          if (k >= 0) this.slotIdx = k
          else { this.slots = null; this.slotIdx = -1 }
        } else {
          this.slots = null
          this.slotIdx = -1
        }
      }
    })
  }

  /** 槽位内容被编辑时，平移/缩放槽索引；结构性编辑（换行等）退出槽模式 */
  _trackSlots(chg) {
    if (!this.slots || chg.origin === '+complete') return
    const cm = this.cm
    const a = cm.indexFromPos(chg.from)
    const b = cm.indexFromPos(chg.to)
    const ins = chg.text.join('\n')
    if (ins.includes('\n')) { // 换行：槽位概念失效（用户另起新公式）
      this.slots = null
      this.slotIdx = -1
      return
    }
    const delta = ins.length - (b - a)
    if (delta === 0) return
    let valid = true
    this.slots = this.slots.map(([s, e]) => {
      if (a === b) { // 纯插入
        if (a < s) return [s + delta, e + delta]
        if (a > e) return [s, e]
        return [s, e + delta] // 插在槽内（含两端边界）：槽增长
      }
      // 删除 / 替换（b > a）
      if (b <= s) return [s + delta, e + delta]
      if (a >= e) return [s, e]
      if (a >= s && b <= e) return [s, e + delta] // 槽内删除：槽缩短
      valid = false // 跨槽变化：丢弃模式
      return [s, e]
    })
    this.snippetEnd += delta
    if (!valid || this.snippetEnd < this.baseIdx) this.slots = null
  }

  _gotoSlot(i) {
    if (!this.slots || !this.slots.length) { this.slots = null; return }
    if (i >= this.slots.length) {
      // 越过末槽：光标到模板末尾，退出槽模式
      this.cm.setCursor(this.cm.posFromIndex(this.snippetEnd))
      this.slots = null
      this.slotIdx = -1
      return
    }
    if (i < 0) i = 0
    this.slotIdx = i
    const [s, e] = this.slots[i]
    const cm = this.cm
    cm.setSelection(cm.posFromIndex(this.baseIdx + s), cm.posFromIndex(this.baseIdx + e))
    cm.focus()
  }
}

// ───────────────────────── 行内公式控制器（contenteditable）──────────────────

class InlineMathController {
  constructor(ui) {
    this.ui = ui
    this.active = false
    this.scriptEl = null
    this.startOffset = -1
    this.suppress = null // 无槽位命令刚补全：{node, offset}，光标未动前不再弹窗
    this.applying = false // _apply 执行中：屏蔽 execCommand 同步重入的 input/selectionchange → refresh

    this.composing = false
    this.onInput = e => { if (!e.isComposing) this.refresh() }
    this.onCompositionStart = () => { this.composing = true }
    this.onCompositionEnd = () => { this.composing = false; this.refresh() }
    this.onSelection = () => {
      // 组字过程中 DOM 文本尚未更新，不评估；弹窗打开时方向键已被拦截
      if (this.composing) return
      this.refresh()
    }
    this.onKeyDownCapture = e => this._handleKey(e)

    document.addEventListener('input', this.onInput, true)
    document.addEventListener('compositionstart', this.onCompositionStart, true)
    document.addEventListener('compositionend', this.onCompositionEnd, true)
    document.addEventListener('selectionchange', this.onSelection)
    document.addEventListener('keydown', this.onKeyDownCapture, true)
  }

  destroy() {
    document.removeEventListener('input', this.onInput, true)
    document.removeEventListener('compositionstart', this.onCompositionStart, true)
    document.removeEventListener('compositionend', this.onCompositionEnd, true)
    document.removeEventListener('selectionchange', this.onSelection)
    document.removeEventListener('keydown', this.onKeyDownCapture, true)
    this._close()
  }

  _mathContext() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return null
    const node = sel.anchorNode
    if (!node) return null
    const el = node.nodeType === 3 ? node.parentElement : node
    if (!el || !el.closest) return null
    const script = el.closest('script[type="math/tex"]')
    if (!script || !document.getElementById('write').contains(script)) return null
    // 块公式的 CodeMirror textarea 不经过这里；行内 script 才处理
    if (script.closest('.md-math-block')) return null
    if (node.nodeType !== 3) return null
    return { script, node, offset: sel.anchorOffset }
  }

  _close() {
    this.ui.hide(this)
    this.active = false
    this.scriptEl = null
    this.suppress = null
  }

  refresh() {
    // _apply 途中 execCommand 会同步派发 input/selectionchange；
    // 此时光标/suppress 尚未就位，重入 refresh 会用"刚补全出的命令"重新弹窗，
    // 必须整体跳过（apply 末尾光标与 suppress 就位后的下一次 selectionchange 才评估）。
    if (this.applying) return
    const ctx = this._mathContext()
    if (!ctx) { this._close(); return }
    const { script, node, offset } = ctx

    // 仅处理 script 直接文本节点（Typora 行内数学源码节点）
    if (node.parentElement !== script) { this._close(); return }

    // 刚补全的无槽位命令：光标未动前不再弹窗（输入已完成）
    if (this.suppress) {
      if (node === this.suppress.node && offset === this.suppress.offset) return
      this.suppress = null
    }

    const lineBefore = node.textContent.slice(0, offset)
    const parsed = parseQuery(lineBefore)
    if (!parsed) { this._close(); return }
    const items = matchCommands(parsed.query)
    if (!items.length) { this._close(); return }

    // 查询恰好等于完整命令且该命令无模板（insert 就是 \name）：
    // 文本已就位、无可补内容，不弹 UI——否则行尾 \alpha 会持续唤起
    // "应用它自己"的候选框，空格/Tab 被拦截，无法继续输入。
    if (items.length === 1 && parsed.query !== '' &&
        items[0].name === parsed.query && items[0].insert === '\\' + items[0].name) {
      this.ui.hide(this)
      this.active = false
      return
    }

    // 光标矩形
    const range = window.getSelection().getRangeAt(0).cloneRange()
    range.setStart(node, offset)
    const rect = range.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) { this._close(); return }

    const cs = getComputedStyle(script.parentElement || script)
    const font = { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle }

    this.active = true
    this.scriptEl = script
    this.startOffset = parsed.startCh

    const ghost = ghostSuffix(items[0], parsed.query)
    if (items.length === 1 && parsed.query !== '' && ghost) {
      this.ui.show({
        owner: this, query: parsed.query,
        mode: 'ghost', items, idx: 0,
        x: rect.right + 2, y: rect.top, height: rect.height || 20,
        font, ghostText: ghost, themeRef: script.parentElement,
        onSelect: item => this._apply(item),
      })
    } else {
      this.ui.show({
        owner: this, query: parsed.query,
        mode: 'popup', items, idx: 0,
        x: rect.left, y: rect.bottom + 2, height: rect.height || 20,
        ghostX: rect.right, ghostY: rect.top,
        font, ghostText: parsed.query === '' ? null : ghostSuffix(items[0], parsed.query),
        themeRef: script.parentElement,
        onSelect: item => this._apply(item),
      })
    }
  }

  _handleKey(e) {
    // CodeMirror 场景交给 BlockMathController
    if (e.target && e.target.tagName === 'TEXTAREA' && e.target.closest && e.target.closest('.CodeMirror')) return
    // 行内公式源码内 Tab 无合法用途（Typora 原生会插入 \t 污染 LaTeX 源码）：
    // UI 关闭且光标在行内公式中时吞掉 Tab
    if (e.key === 'Tab' && !this.active && !this.ui.mode) {
      const ictx = this._mathContext()
      if (ictx) { e.preventDefault(); e.stopPropagation(); return }
    }
    if (!this.active || !this.ui.mode || this.ui.owner !== this) return
    const mode = this.ui.mode
    // 左右键不拦截：交回浏览器原生移动光标，弹窗随光标处查询自动刷新/关闭。
    if (mode === 'popup') {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); e.stopPropagation(); this.ui.next(); return
        case 'ArrowUp':
          e.preventDefault(); e.stopPropagation(); this.ui.prev(); return
        case ' ': case 'Tab':
          e.preventDefault(); e.stopPropagation(); this._apply(this.ui.current()); return
        case 'Enter':
          this._close(); return
        case 'Escape':
          e.preventDefault(); this._close(); return
      }
    } else if (mode === 'ghost') {
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation()
        this._apply(this.ui.current())
      } else if (e.key === 'Escape') {
        e.preventDefault(); this._close()
      }
    }
  }

  _apply(command) {
    const ctx = this._mathContext()
    if (!ctx) { this._close(); return }
    const { node, offset } = ctx
    const lineBefore = node.textContent.slice(0, offset)
    const parsed = parseQuery(lineBefore)
    if (!parsed) { this._close(); return }

    const { text, slots } = expandSnippet(command.insert)
    const baseCh = parsed.startCh // 查询起点：插入后所有槽位偏移都要加它（绝对偏移）

    // 先清 UI（含 ghost chip），再改写选区
    this.ui.hide(this)
    this.active = false
    this.suppress = null

    // execCommand('insertText') 会同步派发 input/selectionchange，
    // 而光标与 suppress 要等插入完成后才能就位；加锁屏蔽这次重入 refresh。
    this.applying = true
    try {
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(node, parsed.startCh)
      range.setEnd(node, offset)
      sel.removeAllRanges()
      sel.addRange(range)

      let ok = false
      try { ok = document.execCommand('insertText', false, text) } catch (e) { ok = false }
      if (!ok) {
        range.deleteContents()
        range.insertNode(document.createTextNode(text))
      }

      // 光标落入第一个槽（行内不做 Tab 跳槽）；无槽命令落到插入文本末尾。
      // slots/caret 均为相对插入文本的偏移，定位时必须加 baseCh。
      const caretRel = slots.length ? slots[0][0] : text.length
      const caretEndRel = slots.length ? slots[0][1] : text.length
      const place = this._locateOffset(ctx.script, baseCh + caretRel, baseCh + caretEndRel, node)
      if (place) {
        const r = document.createRange()
        r.setStart(place.startNode, place.startOffset)
        r.setEnd(place.endNode, place.endOffset)
        r.collapse(place.startNode === place.endNode && place.startOffset === place.endOffset)
        const sel2 = window.getSelection()
        sel2.removeAllRanges()
        sel2.addRange(r)
        // 无槽位命令：输入已完成，记录实际落点（绝对），光标未动前不再弹窗
        if (!slots.length) this.suppress = { node: place.startNode, offset: place.startOffset }
      }
    } finally {
      this.applying = false
    }
    this.scriptEl = null
  }

  /**
   * 把"script 内的绝对字符偏移"定位到具体文本节点+局部偏移。
   * 典型情况（Typora 行内公式为单个文本节点）直接命中原 node；
   * execCommand 将节点拆分时，按文本节点顺序累加定位。
   */
  _locateOffset(script, absStart, absEnd, hintNode) {
    // 快速路径：hintNode 仍是 script 直接子节点，先算它在文本中的起始偏移
    if (hintNode && hintNode.parentElement === script) {
      let base = 0, n = script.firstChild
      while (n && n !== hintNode) { if (n.nodeType === 3) base += n.textContent.length; n = n.nextSibling }
      if (n === hintNode) {
        const len = hintNode.textContent.length
        if (absStart >= base && absStart <= base + len &&
            absEnd >= base && absEnd <= base + len) {
          return { startNode: hintNode, startOffset: absStart - base, endNode: hintNode, endOffset: absEnd - base }
        }
      }
    }
    const pick = abs => {
      const ww = document.createTreeWalker(script, NodeFilter.SHOW_TEXT)
      let a = 0, x
      while ((x = ww.nextNode())) {
        const l = x.textContent.length
        if (abs <= a + l) return { node: x, offset: Math.max(0, abs - a) }
        a += l
      }
      return null
    }
    const s = pick(absStart), e = pick(absEnd)
    if (!s || !e) return null
    return { startNode: s.node, startOffset: s.offset, endNode: e.node, endOffset: e.offset }
  }
}

// ───────────────────────── 插件入口 ─────────────────────────

class MathInputPlugin extends Plugin {
  onload() {
    this.ui = new CompletionUI()
    this.inline = new InlineMathController(this.ui)

    this.boundCMs = new WeakSet()
    this.controllers = new Set()

    this.attachCM = cmHost => {
      const cm = cmHost.CodeMirror
      if (!cm || this.boundCMs.has(cm)) return
      // 仅绑定块公式的 CodeMirror，排除普通代码块
      if (!cmHost.closest('.md-math-block') && !cmHost.closest('.md-mathblock-panel')) return
      this.boundCMs.add(cm)
      const ctrl = new BlockMathController(cm, this.ui)
      this.controllers.add(ctrl)
    }

    // 已存在的面板（插件加载时正开着）
    document.querySelectorAll('#write .CodeMirror').forEach(this.attachCM)

    // mathblock 面板打开时 CodeMirror 是动态插入的
    this.observer = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue
          if (node.classList && node.classList.contains('CodeMirror')) this.attachCM(node)
          if (node.querySelectorAll) node.querySelectorAll('.CodeMirror').forEach(this.attachCM)
        }
      }
    })
    this.observer.observe(document.getElementById('write') || document.body, { childList: true, subtree: true })

    this.register(() => {
      this.observer.disconnect()
      this.inline.destroy()
      this.controllers.forEach(c => c.destroy())
      this.controllers.clear()
      this.ui.destroy()
    })
  }
}

export { parseQuery, matchCommands, expandSnippet, ghostSuffix, COMMAND_MAP as commands }
export default MathInputPlugin
