// 最小 DOM 桩：只为让 lib/client.js 里的 renderHeatmap() 能真正跑一遍，
// 从而断言**渲染出来的树**（格数、档位属性、星期标签、月标签），
// 而不是只测纯逻辑。覆盖的是「结构写错」这一类 bug —— 例如把三个子元素塞进
// 两列的 grid、或者星期标签与格子没共用同一批行。
class StubStyle {
  constructor() { this.props = {} }
  setProperty(k, v) { this.props[k] = String(v) }
}
class StubNode {
  constructor(tag) {
    this.tagName = String(tag)
    this.children = []
    this.attributes = {}
    this.style = new StubStyle()
    this.className = ''
    this.textContent = ''
    this.parentNode = null
    // ensureCss 走 `tag.dataset.plugin = …` / `tag.textContent = …`，桩要支持。
    this.dataset = {}
    StubNode.created++
  }
  setAttribute(k, v) { this.attributes[k] = String(v); StubNode.mutations++ }
  getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k] }
  appendChild(child) {
    if (child.parentNode !== null && child.parentNode !== undefined) child.parentNode.removeChild(child)
    this.children.push(child)
    child.parentNode = this
    StubNode.mutations++
    StubMutationObserver.pending++
    return child
  }
  removeChild(child) {
    const i = this.children.indexOf(child)
    if (i >= 0) this.children.splice(i, 1)
    child.parentNode = null
    StubNode.mutations++
    StubMutationObserver.pending++
    return child
  }
  get firstChild() { return this.children.length > 0 ? this.children[0] : null }
  get lastChild() { return this.children.length > 0 ? this.children[this.children.length - 1] : null }
  /** Element.contains：真实 DOM 语义，用来判断当前锚点是否仍然包含某节点。 */
  contains(node) {
    for (let n = node; n !== null && n !== undefined; n = n.parentNode) if (n === this) return true
    return false
  }
  /** isConnected：沿 parentNode 链上溯到 documentElement 才算 true。
   *  这是「React 把整棵 section 换掉、容器成了孤儿」能被抓到的关键。 */
  get isConnected() {
    for (let n = this; n !== null && n !== undefined; n = n.parentNode) {
      if (globalThis.document !== undefined && n === globalThis.document.documentElement) return true
    }
    return false
  }
  /** 深度优先收集全部后代（含自己）。 */
  descendants() {
    const out = [this]
    for (const c of this.children) out.push(...c.descendants())
    return out
  }
  byClass(name) { return this.descendants().filter((n) => n.className === name) }
  /** 供 lib/client.js 的 PROBE 诊断日志调用（桩里返回 0，不参与断言）。 */
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 } }
  querySelector(sel) { return this.descendants().find((n) => matchesSimple(n, sel)) ?? null }
  querySelectorAll(sel) { return this.descendants().filter((n) => matchesSimple(n, sel)) }
}
// 统计：给「会不会自激」那条测试当证据
StubNode.created = 0
StubNode.mutations = 0

/**
 * 忠实实现 MutationObserver 的规范语义，这是本文件最重要的部分：
 *   - 任何 DOM 变更都会给**所有**已 observe 的 observer 记一条待投递；
 *   - 变更发生在回调执行期间时，**排到下一轮**再投递（不是当轮重入）——
 *     这正是「observer 回调里写 DOM」会自激、而不是立即递归爆栈的原因；
 *   - 回调统一在 **macro task（setTimeout 0）** 投递。
 *
 * 之前的桩根本没有 MutationObserver，所以「打开设置卡死」这条路径**结构上测不到**。
 */
class StubMutationObserver {
  constructor(callback) {
    this.callback = callback
    this.records = []
    this.targets = []
    this.options = null
    StubMutationObserver.instances.push(this)
  }
  observe(target, options) {
    this.targets.push(target)
    this.options = options
    StubMutationObserver.observed++
  }
  disconnect() {
    this.targets = []
    StubMutationObserver.disconnected++
  }
  /** 由 drainObservers() 调用；返回 true 表示本轮产生了新变更。 */
  flush() {
    if (this.targets.length === 0) return false
    const before = StubMutationObserver.pending
    if (before === 0) return false
    StubMutationObserver.pending = 0
    StubMutationObserver.deliveries++
    this.callback([{ type: 'childList', target: this.targets[0] }], this)
    return StubMutationObserver.pending > 0
  }
}
StubMutationObserver.instances = []
StubMutationObserver.observed = 0
StubMutationObserver.disconnected = 0
StubMutationObserver.deliveries = 0
StubMutationObserver.pending = 0

/**
 * 把 DOM 变更记到所有活跃 observer 上，并跑 macro task 直到队列排空或撞上限。
 * 上限是**熔断**：达到就说明不收敛，测试据此判 FAIL。
 * @returns 轮次与是否收敛
 */
export async function drainObservers({ maxRounds = 60 } = {}) {
  let rounds = 0
  for (;;) {
    // 等一轮 macro task，让 setTimeout(0) 里排的回调先跑
    await new Promise((r) => setTimeout(r, 0))
    rounds++
    let produced = false
    for (const obs of StubMutationObserver.instances) {
      StubNode.mutations = 0
      if (obs.flush()) produced = true
    }
    if (!produced) return { rounds, converged: true }
    if (rounds >= maxRounds) return { rounds, converged: false }
  }
}

/**
 * 极简选择器支持：只实现 `tag`、`[attr]`、`tag[attr]`（本插件只用到
 * `section[aria-label]`、`style[data-plugin-css=…]`），外加逗号分隔的候选列表。
 * 之前这里恒返回 []，导致 findAnchor() 永远找不到锚点 —— 那条「卡死」路径
 * 在自检里根本走不到，测试就成了摆设。
 */
function matchesSimple(node, selector) {
  const m = /^([a-zA-Z][\w-]*)?(?:\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\])?$/.exec(selector)
  if (!m) return false
  const [, tag, attr, dv, sv, bare] = m
  if (tag !== undefined && node.tagName.toLowerCase() !== tag.toLowerCase()) return false
  if (attr !== undefined) {
    const actual = node.getAttribute(attr)
    if (actual === null) return false
    const want = dv !== undefined ? dv : (sv !== undefined ? sv : bare)
    if (want !== undefined && actual !== want) return false
  }
  return true
}

function queryAll(root, selectorList) {
  const selectors = selectorList.split(',').map((s) => s.trim()).filter(Boolean)
  const all = root.descendants()
  const out = []
  for (const sel of selectors) {
    for (const n of all) {
      if (matchesSimple(n, sel) && !out.includes(n)) out.push(n)
    }
  }
  return out
}

export function installDomStub() {
  const previous = globalThis.document
  const prevMO = globalThis.MutationObserver
  const prevST = globalThis.setTimeout
  StubNode.created = 0
  StubNode.mutations = 0
  StubMutationObserver.instances = []
  StubMutationObserver.observed = 0
  StubMutationObserver.disconnected = 0
  StubMutationObserver.deliveries = 0
  const root = new StubNode('html')
  globalThis.document = {
    createElement: (tag) => new StubNode(tag),
    documentElement: root,
    querySelector: (sel) => queryAll(root, sel)[0] ?? null,
    querySelectorAll: (sel) => queryAll(root, sel),
    head: new StubNode('head'),
  }
  globalThis.MutationObserver = StubMutationObserver
  return {
    root,
    previous,
    restore() {
      if (previous === undefined) delete globalThis.document
      else globalThis.document = previous
      if (prevMO === undefined) delete globalThis.MutationObserver
      else globalThis.MutationObserver = prevMO
      globalThis.setTimeout = prevST
    },
  }
}

export { StubNode, StubStyle, StubMutationObserver }