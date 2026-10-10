// token 用量热力图 —— 浏览器半（手写 lazy-CJS bundle，无构建步骤，源码即运行物）。
//
// 两个界面，两种挂法：
//   1. 通用设置里的一行「热力图配色」 —— 走官方槽位 `settings.general.item`，order 50。
//      官方锚点：dsh-client-ui-settings-general/lib/client.js:957-966
//      （developer-tools order 15、current-version order 100，所以 50 落在两者之间）。
//   2. 热力图本体 —— **DOM 注入**，挂到官方「账号与余额」页 `<section>` 的末尾。
//      为什么不走槽位：该页 6 处 register 全枚举在案，**没有任何 children 声明**
//      （dsh-client-ui-settings-account/lib/client.js），官方槽位机制挂不进去。
//      官方 section 根 DOM：同文件 :2409-2411，
//      `class` 的 CSS 在 :2269 —— `display:flex; flex-direction:column; gap:16px;
//      padding:8px 0`，所以 appendChild 成最后一个子节点就自动拿到 16px 间距。
//      该页只在 credential-stored 时才注册（:4504），未登录时热力图不出现是**预期行为**。
//
// 为什么这个文件长这样：
//   * 所有 client bundle 会被客户端拼成**一个脚本**执行（顶层 const 撞名就会让整个
//     拼合脚本、含官方 bundle 起不来）。所以顶层**零绑定**，注册内联成一条
//     `window.__ModuleLoader__.load({...})` 语句。
//   * 没有构建步骤，`require` 只解析 `react`；不 import 任何 dsh 包。
//   * 热力图本体用**原生 DOM**而不是 ReactDOM.render：它挂在一个 React 管不到的外来
//     子树上，root 的生命周期与官方 section 的重建不同步，交给 createRoot 反而更容易
//     出现「官方重渲染后容器被丢弃、内容留在孤儿节点上」。纯 DOM + 幂等挂载更短更稳。
//   * 所有注册与 DOM 操作都包 try/catch：抛错会连带炸掉整个 apply()，官方 bundle 跟着死。
window.__ModuleLoader__.load({
  id: '@dsh-community/dsh-token-heatmap',
  factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports
  Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
  const React = require('react')

  /** 本包 UI 文案的 locale 命名空间。 */
  const NS = 'tokenHeatmap'
  /** 槽位注册 id：通用设置里那一行的标识。 */
  const ROW_ID = 'token-heatmap-palette'
  /** DOM 注入容器的 dataset 标记 —— 幂等挂载靠它。 */
  const MARK = 'dshTokenHeatmap'

  // ── 文案 ────────────────────────────────────────────────────────────────────
  const zh = {
    'palette.title': '热力图配色',
    'palette.description': '选择热力图的主色系，同色系内颜色越深表示当日 token 用量越多',
    'palette.green': '绿色',
    'palette.blue': '蓝色',
    'palette.cyan': '青色',
    'palette.purple': '紫色',
    'palette.orange': '橙色',
    'palette.red': '红色',
    'palette.export': '导出',
    'palette.import': '导入',
    'palette.exportHint': '把当前配色复制到剪贴板，保存成一份备份',
    'palette.importHint': '从剪贴板读取之前导出的配色',
    'palette.exported': '已复制到剪贴板',
    'palette.exportFailed': '复制失败，请查看控制台',
    'palette.imported': '导入成功',
    'palette.importEmpty': '剪贴板是空的',
    'palette.importFailed': '导入失败，请查看控制台',
    'heatmap.title': '用量热力图',
    'heatmap.subtitle': '最近 26 周（周日起）每日 token 用量',
    'heatmap.total': '总用量 {tokens} tokens',
    'heatmap.legendNone': '无',
    'heatmap.legendLess': '少',
    'heatmap.legendMore': '多',
    'heatmap.empty': '暂无用量记录',
    'heatmap.loading': '正在读取会话用量…',
    'heatmap.failed': '读取会话用量失败：{reason}',
    'heatmap.cell': '{date}：{tokens} tokens',
    'heatmap.future': '{date}：未来',
    'books.line': '您的 token 用量相当于 {count} 本《{title}》',
    'books.lineUnder': '您的 token 用量还不到 0.01 本《{title}》',
  }
  const en = {
    'palette.title': 'Heatmap colors',
    'palette.description': 'Pick the heatmap hue. Deeper means more tokens that day.',
    'palette.green': 'Green',
    'palette.blue': 'Blue',
    'palette.cyan': 'Cyan',
    'palette.purple': 'Purple',
    'palette.orange': 'Orange',
    'palette.red': 'Red',
    'palette.export': 'Export',
    'palette.import': 'Import',
    'palette.exportHint': 'Copy the current palette to the clipboard as a backup',
    'palette.importHint': 'Restore a palette you exported earlier',
    'palette.exported': 'Copied to clipboard',
    'palette.exportFailed': 'Copy failed, see the console',
    'palette.imported': 'Imported',
    'palette.importEmpty': 'Clipboard is empty',
    'palette.importFailed': 'Import failed, see the console',
    'heatmap.title': 'Usage heatmap',
    'heatmap.subtitle': 'Daily token usage over the last 26 weeks (starting Sunday)',
    'heatmap.total': '{tokens} tokens in total',
    'heatmap.legendNone': 'None',
    'heatmap.legendLess': 'Less',
    'heatmap.legendMore': 'More',
    'heatmap.empty': 'No usage recorded yet',
    'heatmap.loading': 'Loading session usage…',
    'heatmap.failed': 'Could not read session usage: {reason}',
    'heatmap.cell': '{date}: {tokens} tokens',
    'heatmap.future': '{date}: upcoming',
    'books.line': 'Your token usage equals {count} copies of 《{title}》',
    'books.lineUnder': 'Your token usage is under 0.01 of a copy of 《{title}》',
  }

  /**
   * `formatBookCount` 在本数太小放不下两位小数时返回的**哨兵值**。
   * 文案层靠它挑 `books.lineUnder` —— 因为英文没法说 "equals < 0.01 copies"，
   * 必须换一整句，而不是把占位符硬塞进通用模板。
   */
  const BOOK_COUNT_UNDER = '< 0.01'

  /** `{key}` 插值。 */
  function fmt(text, params) {
    if (typeof text !== 'string') return ''
    if (params === undefined || params === null) return text
    return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])))
  }

  /**
   * 取文案：优先框架注入的 `t`（注册时声明了 locale: NS），缺键时回退本文件自带的词典。
   * 官方查找链缺键会**原样返回 key**，页面不能退化成 "books.line" 这种字符串。
   *
   * ⚠️ 回退词典按 `currentLang()` 选 en/zh，**不是固定 zh**：热力图是 DOM 注入的，
   * 拿不到槽位注入的 `t`（draw() 传的就是 makeText(null)），所以回退路径就是它唯一
   * 的文案来源。若这里写死 zh，英文界面下整张热力图会全中文 —— 而同机器上跑的官方
   * 组件是跟着 locale 走的。`PaletteRow` 走槽位注入的 t，回退只在字典缺键时才会用到。
   */
  function makeText(t) {
    return function text(key, params) {
      let out
      if (typeof t === 'function') {
        try { out = t(key) } catch (error) { out = undefined }
      }
      if (typeof out !== 'string' || out.length === 0 || out === key) {
        const dict = currentLang() === 'en' ? en : zh
        out = dict[key]
      }
      if (typeof out !== 'string') out = key
      return fmt(out, params)
    }
  }

  /**
   * 当前界面语言（'zh' | 'en'），**启发式判定**，读不到就 zh。
   *
   * 为什么需要它：`makeText(t)` 只能「查到就用、查不到回退 zh」，但热力图的
   * **月份标签与星期标签不进字典**（它们是 12 项/7 项的数组，不是文案键），
   * 所以必须有办法知道此刻该念哪一套。框架没有把语言直接透给我们，
   * 又明确不许为此引 dsh-client-locale，于是按可靠度依次试：
   *   1. `<html lang>` —— 官方 locale 服务会维护它，比 navigator 更贴近应用语言；
   *   2. `navigator.language` —— 浏览器首选语言；
   *   3. 都读不到 → zh（本插件的默认词典）。
   *
   * ⚠️ 已知局限（不是 bug，是这条路的固有代价）：用户浏览器首选英文、应用语言中文时，
   * 若 `<html lang>` 没被官方维护，这里会误判成 en，标签变成 Jan/Mon。
   * 真要根治需要框架暴露语言，这个前提不成立，所以停在启发式。
   */
  function currentLang() {
    try {
      const doc = typeof document !== 'undefined' ? document : null
      // 用真值判断而不是 !== null：document 可能存在但没有 documentElement
      // （部分宿主只塞 createElement），此时必须安静回落而不是抛异常刷警告。
      const el = doc !== null && doc !== undefined ? doc.documentElement : null
      const htmlLang = el !== null && el !== undefined && typeof el.lang === 'string' ? el.lang : ''
      const raw = (typeof htmlLang === 'string' && htmlLang !== '') ? htmlLang
        : (typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : '')
      const tag = raw.toLowerCase()
      if (tag.startsWith('zh')) return 'zh'
      if (tag.startsWith('en')) return 'en'
    } catch (error) {
      warn('currentLang', error)
    }
    return 'zh'
  }

  /** 月份短名。中文 '1月'…'12月'，英文 'Jan'…'Dec'。 */
  const MONTH_KEYS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const MONTH_KEYS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  /**
   * 星期短名。**下标就是 `Date.getDay()`**：0 = 周日、1 = 周一 …… 6 = 周六，
   * 与几何那边 `heatmapWindow().todayRow` 完全同一套坐标系，所以
   * index 0 必须是 'Sun'、index 6 是 'Sat'，不是 Mon…Sun。
   * （中文那套 index 0 是空串，只是因为渲染时本来就不标第 0 行，不代表它是占位坐标。）
   * 渲染时只标 row 1/3/5（一/三/五 ↔ Mon/Wed/Fri），隔行标注避免 14px 列宽里挤成一团。
   */
  const WEEKDAY_KEYS_ZH = ['', '一', '二', '三', '四', '五', '六']
  const WEEKDAY_KEYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  /** 按当前语言取一套标签。 */
  function labelTables() {
    return currentLang() === 'en'
      ? { months: MONTH_KEYS_EN, weekdays: WEEKDAY_KEYS_EN }
      : { months: MONTH_KEYS_ZH, weekdays: WEEKDAY_KEYS_ZH }
  }

  // ── 纯逻辑：数字 ────────────────────────────────────────────────────────────
  const M = 1000000
  const B = 1000000000

  /** 千分位分组（自写，不用 toLocaleString：这里要固定英文分组，不受 locale 影响）。 */
  function group(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  /** 去掉小数尾部的 0；'1.0'→'1'、'1.50'→'1.5'、'0.31'→'0.31'。 */
  function trimZeros(s) {
    const dot = s.indexOf('.')
    if (dot < 0) return s
    const tail = s.slice(dot + 1).replace(/0+$/, '')
    return tail === '' ? s.slice(0, dot) : s.slice(0, dot) + '.' + tail
  }

  /**
   * token 数 → 短文本。**刻意不用 `Intl` compact**：它在中文 locale 下输出「万/亿」，
   * 与用户要的「多少 M，用得多就多少 B」直接冲突；且 compact 对 1e9 未必给 B。
   * 阈值表（自己写的，唯一口径）：
   *   < 1e6        → 千分位整数（不设 K 档：999,999 写成 "1000.0K" 比 "999,999" 更糟）
   *   < 999.95e6   → M，1 位小数
   *   ≥ 999.95e6   → B，2 位小数
   * B 档的门取 999.95M 而不是 1e9，是为了不出现 "1000.0M"：到那个点就该说「1B」了。
   * 同理不存在 "0.99B" 这种倒挂显示。
   */
  function formatTokenCount(value) {
    const n = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
    if (n < M) return group(Math.round(n))
    const inM = n / M
    if (inM < 999.95) return trimZeros(inM.toFixed(1)) + 'M'
    return trimZeros((n / B).toFixed(2)) + 'B'
  }

  /** 任意有限数 → 千分位整数；NaN / Infinity / 负数一律归 0，绝不吐 NaN。 */
  function safeInt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
    return Math.floor(value)
  }

  // ── 纯逻辑：热力图几何 ──────────────────────────────────────────────────────
  /** 时间跨度常量：26 周 = 182 格 = 26 列 × 7 行。 */
  const WINDOW_WEEKS = 26
  const WINDOW_ROWS = 7

  /** 本地时区当天 0 点。 */
  function localMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  }

  /**
   * 最近 N 周的窗口。列 = 周，行 = 星期（0 = 周日）。
   * 第一列是 `今天 - ((weeks-1)*7 + 今天是星期几)` 天那个周日，
   * 所以**第一列周日起始、最后一列是本周、今天落在最后一列**。
   * 全部用本地时区 + setDate 归一化，跨夏令时也不会串格。
   */
  function heatmapWindow(now, weeks) {
    const w = typeof weeks === 'number' && Number.isFinite(weeks) && weeks >= 1 ? Math.floor(weeks) : WINDOW_WEEKS
    const ref = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date()
    const today = localMidnight(ref)
    const dow = today.getDay()
    const start = new Date(today.getTime())
    start.setDate(start.getDate() - (w - 1) * 7 - dow)
    return {
      weeks: w,
      columns: w,
      rows: WINDOW_ROWS,
      cells: w * WINDOW_ROWS,
      start,
      today,
      todayKey: dayKey(today),
      // 今天在本列的行号
      todayColumn: w - 1,
      todayRow: dow,
    }
  }

  /** 窗口内第 col 列第 row 行的日期。 */
  function cellDate(win, col, row) {
    const d = new Date(win.start.getTime())
    d.setDate(d.getDate() + col * WINDOW_ROWS + row)
    return d
  }

  /** 本地时区日期 → 'YYYY-MM-DD'（字典序即时间序，可直接比较）。 */
  function dayKey(date) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d
  }

  // ── 纯逻辑：分位数分档 ──────────────────────────────────────────────────────
  /**
   * 线性插值分位数（抄参考项目 ref-dsh-local-usage/src/client/CalendarHeatmap.tsx:104-112 的
   * 同款算法：pos = (n-1)*q，两端线性插值）。
   */
  function quantile(sortedAsc, q) {
    const n = sortedAsc.length
    if (n === 0) return 0
    if (n === 1) return sortedAsc[0]
    const pos = (n - 1) * q
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    if (lo === hi) return sortedAsc[lo]
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo)
  }

  /**
   * 分档阈值 = **活跃日**（用量 > 0 的天）的中位 / 75 / 90 分位。
   * 抄参考项目 CalendarHeatmap.tsx:267-270；用分位数而不是固定阈值，是为了适配
   * 「重度用户一天几十万、轻度用户一天几百」的分布。
   * ⚠️ 活跃日很少时（如只有 2 天有用量）色阶会不稳，这是分位数方案固有的性质，
   *    参考项目也没有兜底；这里保持与参考项目一致，不额外发明固定阈值回退。
   */
  function levelThresholds(values) {
    const active = []
    for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > 0) active.push(v)
    active.sort((a, b) => a - b)
    if (active.length === 0) return { t1: 0, t2: 0, t3: 0, activeDays: 0 }
    return {
      t1: quantile(active, 0.5),
      t2: quantile(active, 0.75),
      t3: quantile(active, 0.9),
      activeDays: active.length,
    }
  }

  /** 落到 5 档：0 = 无用量，1..4 = 活跃日的四级深浅。 */
  function levelFor(tokens, th) {
    const v = safeInt(tokens)
    if (v <= 0) return 0
    const t = th ?? {}
    const t1 = typeof t.t1 === 'number' ? t.t1 : 0
    const t2 = typeof t.t2 === 'number' ? t.t2 : 0
    const t3 = typeof t.t3 === 'number' ? t.t3 : 0
    if (v <= t1) return 1
    if (v <= t2) return 2
    if (v <= t3) return 3
    return 4
  }

  // ── 纯逻辑：会话 → 每日桶 ───────────────────────────────────────────────────
  /**
   * 从 `projections.values.tokenUsage` 取四桶之和。
   * 四个桶**互斥**，reasoning token 已含在 outputTokens 内，不要重复累加
   * （dsh-token-meter/lib/types/projection.d.ts:12-17 原文：「The four buckets are
   * disjoint. In particular, reasoning tokens are already included in outputTokens
   * and are not accumulated again.」）。
   * @returns number 已知总量；null = 该会话没有 tokenUsage 投影（需要回退单查）
   */
  function tokenTotalOf(projections) {
    const values = projections !== null && typeof projections === 'object' ? projections.values : null
    const usage = values !== null && typeof values === 'object' ? values.tokenUsage : null
    if (usage === null || typeof usage !== 'object') return null
    return safeInt(usage.uncachedInputTokens) + safeInt(usage.outputTokens) +
      safeInt(usage.cacheReadTokens) + safeInt(usage.cacheWriteTokens)
  }

  /**
   * 把 `session.list()` 的 items 按 `updatedAt` 归到本地日期。
   *
   * ⚠️ 口径说明（重要，别当成「最后活动时间」）：宿主的
   * `updatedAt = Math.max(header.createdAt, metadata?.lastPromptAt ?? 0)`
   * （dsh-api-session-controller/lib/index.js:2040-2042）—— 它是**创建时间与最后提问时间
   * 的较大者**。所以这里是「把该会话的全部累计 token 记到它这一天」，一个会话只落一格，
   * 不是把 token 摊到它活跃的每一天。这是宿主投影粒度（会话级累计）的固有限制。
   *
   * 跨月 / 跨年 / 跨时区都靠 dayKey() 取**本地时区**年月日分量解决，
   * 且窗口过滤用 'YYYY-MM-DD' 字典序比较，两侧口径一致。
   */
  function collectUsage(items, win) {
    const byDay = {}
    const list = Array.isArray(items) ? items : []
    const startKey = dayKey(win.start)
    let totalTokens = 0
    let binned = 0
    let missing = 0
    let undated = 0
    for (const item of list) {
      if (item === null || typeof item !== 'object') continue
      const tokens = tokenTotalOf(item.projections)
      if (tokens === null) { missing++; continue }
      // 总用量 = 全部会话 token 之和（不限 26 周窗口），这是需求原话。
      totalTokens += tokens
      const ts = item.updatedAt
      if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) { undated++; continue }
      const key = dayKey(new Date(ts))
      if (key < startKey || key > win.todayKey) continue
      byDay[key] = (byDay[key] ?? 0) + tokens
      binned++
    }
    return { byDay, totalTokens, sessions: list.length, binned, missing, undated }
  }

  /** 组装渲染模型：格子数组 + 分档阈值 + 汇总数字。 */
  function buildModel(items, win, paletteId) {
    const usage = collectUsage(items, win)
    const days = []
    for (let col = 0; col < win.columns; col++) {
      for (let row = 0; row < win.rows; row++) {
        const date = cellDate(win, col, row)
        const key = dayKey(date)
        days.push({ col, row, key, date, future: date.getTime() > win.today.getTime(), tokens: usage.byDay[key] ?? 0 })
      }
    }
    // 分位数阈值只用**已发生**的日子算：未来格子是 0，混进去会把中位数往下拽。
    const th = levelThresholds(days.filter((d) => !d.future).map((d) => d.tokens))
    for (const d of days) d.level = d.future ? -1 : levelFor(d.tokens, th)
    return { window: win, usage, days, thresholds: th, palette: sanitizePalette(paletteId) }
  }

  // ── 纯逻辑：名著换算 ────────────────────────────────────────────────────────
  /**
   * 换算口径：**1 token ≈ 4 字符**，与官方 dsh-token-meter 的固定启发式一致
   * （它的每 token 四字符规则对 CJK 会系统性低估，这里沿用同一口径以便对照）。
   * 本数 = token 总数 × 4 ÷ 该书汉字数。
   *
   * ⚠️ 中外**分开计单位，不混算**：下面中文书的 `chars` 是**汉字数**，英文书的 `words` 是
   * **词数**，两者不是同一种单位，混进同一个数组做除法是错的。展示只用中文书。
   *
   * 每个字数都是**业界常引的量级值，不是权威统计**：不同版本、繁简、是否计标点、
   * 是否含回目附录，差异可达 ±10%。这里只用来给一个「量级感」，不要当真值引用。
   */
  const CHARS_PER_TOKEN = 4
  const BOOKS_ZH = [
    // 约 73 万汉字（业界常引量级值，非权威统计；不同版本差异可达 ±10%）
    { title: '红楼梦', author: '曹雪芹', chars: 730000 },
    // 约 82 万汉字（同上）
    { title: '西游记', author: '吴承恩', chars: 820000 },
    // 约 94 万汉字（同上）
    { title: '三国演义', author: '罗贯中', chars: 940000 },
    // 约 100 万汉字（同上）
    { title: '水浒传', author: '施耐庵', chars: 1000000 },
  ]
  /** 展示基准书。用户需求是「多少本《名著》」，中文书最符合直觉。 */
  const DISPLAY_BOOK = BOOKS_ZH[0]

  /** 仅供 README / 代码注释引用：英文名著按**词数**记，不参与换算。 */
  const BOOKS_EN = [
    // 约 58.7 万词（业界常引量级值，非权威统计）
    { title: 'War and Peace', author: 'Leo Tolstoy', words: 587000 },
    // 约 21.1 万词（同上）
    { title: 'Moby-Dick', author: 'Herman Melville', words: 211000 },
    // 约 12.2 万词（同上）
    { title: 'Pride and Prejudice', author: 'Jane Austen', words: 122000 },
    // 约 4.7 万词（同上）
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', words: 47000 },
  ]

  /** token → 本数。 */
  function bookCount(totalTokens, book) {
    const tokens = safeInt(totalTokens)
    const chars = book !== null && typeof book === 'object' ? safeInt(book.chars) : 0
    if (chars <= 0) return 0
    return (tokens * CHARS_PER_TOKEN) / chars
  }

  /**
   * 本数 → 文案。**小于 1 时如实显示小数**（如 0.31 → "0.31"），不许显示 0 本，
   * 也不许四舍五入成 1。
   *
   * 三档，语义各不相同，别混：
   *   v === 0    → "0"。**真的一个 token 都没用过**，是事实，不是「算不出来」。
   *   0 < v<0.01 → "< 0.01"。算出来了但两位小数放不下（0.0018.toFixed(2) === "0.00"，
   *               trimZeros 之后就是 "0"，页面会显示「相当于 0 本《红楼梦》」——违反需求）。
   *               这里返回**带前缀的占位**而不是数字，由文案层决定怎么念。
   *   v >= 0.01  → 正常数字。
   * 所以 `books.line` 里 `{count}` 拿到 "< 0.01" 时是能直接念出来的（见下面两套文案）。
   */
  function formatBookCount(count) {
    const v = typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
    if (v === 0) return '0'
    if (v < 0.01) return BOOK_COUNT_UNDER
    if (v < 1) return trimZeros(v.toFixed(2))
    if (v < 100) return trimZeros(v.toFixed(1))
    return group(Math.round(v))
  }

  // ── 纯逻辑：配色 ────────────────────────────────────────────────────────────
  /**
   * 6 套浅色系主色。同色系内**越深 = 当日 token 用量越多**：level 1→4 是把同一个主色
   * 按 18% / 38% / 62% / 100% 混进页面底色，深浅单调递增。
   * 混底色（而不是写死色值）是为了跟随 DSH 主题，浅色/深色都成立。
   */
  const PALETTES = {
    green: { base: '#3fb950', labelKey: 'palette.green' },
    blue: { base: '#4c8dff', labelKey: 'palette.blue' },
    cyan: { base: '#2bb8c4', labelKey: 'palette.cyan' },
    purple: { base: '#9a6ef0', labelKey: 'palette.purple' },
    orange: { base: '#e8893a', labelKey: 'palette.orange' },
    red: { base: '#e5544b', labelKey: 'palette.red' },
  }
  const PALETTE_ORDER = ['green', 'blue', 'cyan', 'purple', 'orange', 'red']
  const DEFAULT_PALETTE = 'green'

  /** 未知/被篡改的存储值一律回落到默认色，绝不把未验证的字符串塞进 CSS。 */
  function sanitizePalette(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, id) ? id : DEFAULT_PALETTE
  }

  /** 空值格（level 0）的颜色。**刻意不用 surface token** —— 浅色主题下 surface 等于页面
   * 底色，空白月会隐形。参考项目作者的原话与实现见
   * ref-dsh-local-usage/src/client/styles.ts:319-323，这里照抄这条经验：
   * 墨色 6% 混页面底色 = 一层看得见的中性灰。 */
  const LEVEL_EMPTY_COLOR =
    'color-mix(in oklab, var(--dsw-alias-label-primary, #57606a) 6%, var(--dsw-alias-bg-base, #ffffff))'

  function paletteLevelColor(paletteId, level) {
    const base = PALETTES[sanitizePalette(paletteId)].base
    if (level <= 0) return LEVEL_EMPTY_COLOR
    const pct = [0, 18, 38, 62, 100][Math.min(4, Math.max(1, Math.floor(level)))]
    return 'color-mix(in oklab, ' + base + ' ' + pct + '%, var(--dsw-alias-bg-base, #ffffff))'
  }

  // ── 样式 ────────────────────────────────────────────────────────────────────
  // 顶天立地：格子与格子 gap 3px，容器左右内边距 6px，月份标签行与网格之间留 4px，
  // 星期标签列留 14px 且不贴网格（右侧 4px）。格子用 aspect-ratio 跟随列宽自适应。
  //
  // ⚠️ `flex:none` 是必需项，不是锦上添花：官方账号页根是
  //   `section { display:flex; flex-direction:column; gap:16px }`
  //   （dsh-client-ui-settings-account/lib/client.js:2269），
  // 它的父容器是 `.options { flex:1; min-height:0; overflow-y:auto }`
  //   （dsh-client-ui-settings-general/lib/client.js 的 SettingsRoot.module.css）。
  // 默认 `flex-shrink:1` 会让本容器在纵向 flex 里被压缩，而 182 个格子的自然高度很大
  // → 容器高度塌到 0 → **渲染成功但完全看不见**（这正是历史上「有数据却不显示」的原因）。
  const CSS = [
    '.dsh-thm{box-sizing:border-box;margin:0;padding:14px 6px 8px;flex:none 0 auto;width:100%;',
    'border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));',
    'color:var(--dsw-alias-label-primary,inherit);font-size:13px;line-height:20px}',
    '.dsh-thm *{box-sizing:border-box}',
    '.dsh-thm-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 2px 10px}',
    '.dsh-thm-title{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}',
    '.dsh-thm-total{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);font-variant-numeric:tabular-nums}',
    '.dsh-thm-sub{margin:0 2px 8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#9ca3af)}',
    '.dsh-thm-months{display:grid;grid-template-columns:14px repeat(26,minmax(0,1fr));gap:0 3px;margin:0 2px 4px}',
    '.dsh-thm-month{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,#9ca3af);',
    'padding-left:2px;white-space:nowrap}',
    // 星期标签与格子在**同一个 grid 的同一批行**里，所以纵向对齐是构造保证的，
    // 不依赖「两个子容器各自等高」这种会塌成 0 的 1fr 技巧。
    '.dsh-thm-grid{display:grid;grid-template-columns:14px repeat(26,minmax(0,1fr));',
    'grid-template-rows:repeat(7,auto);gap:3px}',
    '.dsh-thm-weekday{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,#9ca3af);',
    'display:flex;align-items:center;justify-content:flex-start;padding-right:1px}',
    '.dsh-thm-cell{aspect-ratio:1/1;min-height:8px;border-radius:2px;background:var(--thm-l0)}',
    '.dsh-thm-cell[data-level="1"]{background:var(--thm-l1)}',
    '.dsh-thm-cell[data-level="2"]{background:var(--thm-l2)}',
    '.dsh-thm-cell[data-level="3"]{background:var(--thm-l3)}',
    '.dsh-thm-cell[data-level="4"]{background:var(--thm-l4)}',
    '.dsh-thm-cell[data-future="1"]{background:transparent}',
    '.dsh-thm-legend{display:flex;align-items:center;gap:4px;margin:8px 2px 0;',
    'font-size:11px;color:var(--dsw-alias-label-tertiary,#9ca3af)}',
    '.dsh-thm-legendCell{width:9px;height:9px;border-radius:2px}',
    '.dsh-thm-books{margin:10px 2px 0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}',
    '.dsh-thm-note{margin:8px 2px 0;font-size:11px;color:var(--dsw-alias-state-error,#d1242f)}',
    // 通用设置里的配色行
    '.dsh-thm-row{display:flex;align-items:center;justify-content:space-between;gap:16px}',
    '.dsh-thm-rowText{display:flex;flex-direction:column;min-width:0}',
    '.dsh-thm-rowTitle{font-size:13px;font-weight:500}',
    '.dsh-thm-rowDesc{font-size:12px;color:var(--dsw-alias-label-tertiary,#9ca3af)}',
    '.dsh-thm-swatches{display:flex;gap:8px;flex:none}',
    '.dsh-thm-swatch{width:22px;height:22px;padding:0;border:1.5px solid transparent;border-radius:6px;',
    'cursor:pointer;background:transparent}',
    '.dsh-thm-swatch.is-on{border-color:var(--dsw-alias-label-primary,inherit)}',
    '.dsh-thm-swatch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2563eb);outline-offset:2px}',
    // 导出 / 导入
    '.dsh-thm-io{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap}',
    '.dsh-thm-ioBtn{font:inherit;font-size:11px;line-height:16px;padding:2px 8px;border-radius:5px;cursor:pointer;',
    'border:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));',
    'background:transparent;color:var(--dsw-alias-label-secondary,#6b7280)}',
    '.dsh-thm-ioBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}',
    '.dsh-thm-ioBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2563eb);outline-offset:2px}',
    '.dsh-thm-ioState{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#6b7280)}',
  ].join('')

  function ensureCss() {
    if (typeof document === 'undefined') return
    if (document.querySelector('style[data-plugin-css="' + MARK + '"]')) return
    const tag = document.createElement('style')
    tag.dataset.plugin = '@dsh-community/dsh-token-heatmap'
    tag.dataset.pluginCss = MARK
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  // ── 配色存储 ────────────────────────────────────────────────────────────────
  /**
   * 为什么用 localStorage 而不是官方 `ctx.configForms` —— 这是实测结论，不是偷懒：
   *
   * 官方通用设置行确实走 `ctx.configForms.get(entryId)`（形状见
   * dsh-client-ui-settings/lib/client.js:1309-1316），写回落
   * `ctx.remote.settings.mutate(namespace, ops, revision)`（同文件 :1182）。但这条路
   * 的宿主端 `write()` 有两道硬门（dssh-settings/lib/index.js:501-507）：
   *   504  `No configurable plugin entry "<ns>"` —— 条目必须导出带 Config 的运行时；
   *   506  `Plugin entry "<ns>" has no volatile fields` —— 字段必须带 `.volatile()`。
   * 而写出那份 Config 必须能 import `@deepseek-ai/schemastery`。**三条路都实测不通**：
   *   1. 静态 `import '@deepseek-ai/schemastery'` → ERR_MODULE_NOT_FOUND
   *   2. `createRequire(import.meta.url)` 动态 require → MODULE_NOT_FOUND
   *   3. 从 profile 的解析链 require → 能解析，但插件代码不经过那条链
   * 根因：Node 穿透 junction 按 **realpath** 解析模块入口，插件入口落在**仓库目录**里
   * （而不是 ~/.dsh/profiles/node_modules 下），从那里出发到不了
   * `~/.dsh/profiles/node_modules/@deepseek-ai/`。静态 import 失败 = fiber 建不起来
   * = 连热力图一起消失；为一行配色冒这个险不划算。
   *
   * 所以仍用 localStorage，但把它做到**不会静默丢失**（见下面的 paletteStore）：
   *   - 读取：脏值/缺失/抛错一律回落默认色，绝不让坏值进 CSS。
   *   - 写入：**先落盘成功再改内存**；落盘失败则内存也不改，状态永远一致。
   *   - 保留：写入后回读校验，磁盘/浏览器存储被外部清掉时能立刻发现并告警。
   *   - 迁移：可导出/导入一份 JSON，换机器或清缓存后能一键恢复。
   *
   * 注：上一版注释写「localStorage 按浏览器 origin，换浏览器要重选」——
   * 在 DSH 这个宿主上不成立：DSH 是 Electron 应用，origin 固定为 `dsh-app://`，
   * 不存在「换浏览器」的场景。
   * 真正的风险是**清缓存 / 换机器**，由上面的导出导入覆盖。
   */
  const PALETTE_KEY = 'dsh.tokenHeatmap.palette'

  /**
   * 配色状态。只认内存里的 `value`，任何读写异常都不让它与存储脱节。
   */
  const paletteStore = {
    value: DEFAULT_PALETTE,
    listeners: [],
    /** 存储是否真的可用（不可用时所有写入只落内存，并明确告警一次）。 */
    storageOk: true,
    get: function () { return this.value },
    /**
     * 切换配色。
     * 顺序很关键：**先写存储、写成功才改内存**。
     * 反过来（先改内存再写）会在存储不可用时留下「界面显示已切换、实际没存」的不一致，
     * 下次启动又跳回去，用户只会觉得「这插件有 bug」。
     */
    set: function (next) {
      const id = sanitizePalette(next)
      if (id === this.value) return
      if (!this._persist(id)) return          // 落盘失败 → 内存不动，状态保持一致
      this.value = id
      this._emit(id)
    },
    /** 写入存储并回读校验；返回是否真的写进去了。 */
    _persist: function (id) {
      try {
        if (typeof localStorage === 'undefined' || localStorage === null) {
          this._warnStorageOnce('localStorage 不可用，配色只在本次会话内生效')
          return false
        }
        localStorage.setItem(PALETTE_KEY, id)
        // 回读校验：Electron 配额满 / 隐私模式 / 被扩展拦截时 setItem 可能静默失败。
        const back = localStorage.getItem(PALETTE_KEY)
        if (back !== id) {
          this._warnStorageOnce('localStorage 写入未生效（可能被配额或隐私设置拦截）')
          return false
        }
        this.storageOk = true
        return true
      } catch (error) {
        warn('paletteStore.set', error)
        this._warnStorageOnce('localStorage 写入抛错，配色只在本次会话内生效')
        return false
      }
    },
    _warnStorageOnce: function (msg) {
      if (this.storageOk === false) return
      this.storageOk = false
      warn('paletteStore', msg + '。可在通用设置里用「导出配色」保存一份，换环境后导入即可恢复。')
    },
    _emit: function (id) {
      for (const listener of this.listeners) {
        try { listener(id) } catch (error) { warn('palette listener', error) }
      }
    },
    subscribe: function (listener) {
      this.listeners.push(listener)
      const self = this
      return function () {
        const i = self.listeners.indexOf(listener)
        if (i >= 0) self.listeners.splice(i, 1)
      }
    },
    /**
     * 从存储读初值。读不到 / 脏值 / 抛错 → 回落默认色，绝不阻塞渲染。
     * 读到合法值时**顺手回写一次**，把「存储被清空过」这个事实留痕（便于排障）。
     */
    load: function () {
      try {
        if (typeof localStorage === 'undefined' || localStorage === null) {
          this._warnStorageOnce('localStorage 不可用，配色只在本次会话内生效')
          this.value = DEFAULT_PALETTE
          return this.value
        }
        const raw = localStorage.getItem(PALETTE_KEY)
        const id = sanitizePalette(raw)
        if (raw !== null && raw !== '' && raw !== id) {
          warn('paletteStore.load', '存储里的值 "' + String(raw) + '" 不认识，已回落默认色：' + DEFAULT_PALETTE)
        }
        this.value = id
        this.storageOk = true
      } catch (error) {
        warn('paletteStore.load', error)
        this.value = DEFAULT_PALETTE
      }
      return this.value
    },
    /** 导出一份可迁移的 JSON 文本（供用户自行保存/粘贴）。 */
    exportText: function () {
      try { return JSON.stringify({ palette: this.value, version: 1 }, null, 2) }
      catch (error) { warn('paletteStore.exportText', error); return '' }
    },
    /**
     * 从 JSON 文本导入。**先解析校验再落盘**，坏输入一律拒绝且不动现有状态。
     * @returns {{ok:true,palette:string}|{ok:false,reason:string}}
     */
    importText: function (text) {
      let parsed = null
      try {
        if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: '内容为空' }
        parsed = JSON.parse(text)
      } catch (error) {
        return { ok: false, reason: '不是合法 JSON：' + String(error && error.message ? error.message : error) }
      }
      if (parsed === null || typeof parsed !== 'object') return { ok: false, reason: '顶层不是对象' }
      const id = sanitizePalette(parsed.palette)
      if (parsed.palette !== id) {
        return { ok: false, reason: '不认识的颜色名 "' + String(parsed.palette) + '"，可选：' + PALETTE_ORDER.join(' / ') }
      }
      if (!this._persist(id)) return { ok: false, reason: '存储写入失败（见控制台告警）' }
      if (this.value !== id) { this.value = id; this._emit(id) }
      return { ok: true, palette: id }
    },
  }

  // ── 失败必须看得见 ──────────────────────────────────────────────────────────
  function warn(scope, detail) {
    console.warn('[' + MARK + '] ' + scope + ':', detail)
  }

  // ── 取数 ────────────────────────────────────────────────────────────────────
  /**
   * DSH 的 Remote 全部返回 Result 判别联合（`{ok:true,value}` / `{ok:false,error}`），
   * 官方消费点见 dsh-api-session-controller/lib/client.js:2615-2636。
   */
  function unwrap(result) {
    if (result !== null && typeof result === 'object') {
      if (result.ok === true) return { ok: true, value: result.value }
      if (result.ok === false) return { ok: false, error: result.error }
    }
    return { ok: false, error: new Error('Remote 返回了非 Result 形状') }
  }

  function reasonText(error) {
    if (error === undefined || error === null) return 'unknown'
    if (typeof error === 'string') return error
    if (typeof error === 'object' && typeof error.message === 'string') return error.message
    return String(error)
  }

  /**
   * 取全部会话的 token 投影。
   *
   * 主路径：`ctx.remote.session.list({})` **一次**拿全量（官方同款调用，
   * dsh-api-session-controller/lib/client.js:2613）。
   *
   * 兜底：冷会话可能没被 list 带上投影，这时才按会话单查
   * `ctx.remote.session.projections({sessionId})`（同文件 :2557）。
   * ⚠️ 这一段曾经是**串行 for + await**。冷会话常常不被 list() 带上投影，
   *    实测那是「打开设置要等好久」的主因（37 个网络往返排队）。现在改为：
   *      1. **并发**发起，并发上限 PROJECTIONS_FETCH_CONCURRENCY（防打爆 gateway）；
   *      2. 用 Map 定位目标项，去掉原先 O(n²) 的逐项线性查找；
   *      3. 每个结果一回来就写回 items，调用方可在等待期间**先渲染已有数据**。
   */
  const PROJECTIONS_FETCH_CONCURRENCY = 8
  /** 补查期间的增量重绘节流间隔（毫秒）。 */
  const PARTIAL_REDRAW_INTERVAL_MS = 120

  async function fetchSessions(remote, onPartial) {
    let result
    try {
      result = unwrap(await remote.session.list({}))
    } catch (error) {
      return { ok: false, error: reasonText(error) }
    }
    if (!result.ok) return { ok: false, error: reasonText(result.error) }
    const value = result.value
    const items = value !== null && typeof value === 'object' && Array.isArray(value.items) ? value.items : []
    // 先建索引，避免后面每个缺失 id 都全量遍历 items（220 项 × 37 次 = 8140 次比较）。
    const byId = new Map()
    for (const item of items) {
      if (item !== null && typeof item === 'object' && typeof item.sessionId === 'string') {
        byId.set(item.sessionId, item)
      }
    }
    const missing = []
    for (const item of items) {
      if (tokenTotalOf(item?.projections) === null) {
        const id = item !== null && typeof item === 'object' ? item.sessionId : undefined
        if (typeof id === 'string' && id !== '' && byId.has(id)) missing.push(id)
      }
    }
    if (missing.length === 0) return { ok: true, items }

    warn('fetchSessions', missing.length + ' 个会话缺 values.tokenUsage，正在并发补查 projections()')
    // list() 已经回来了，此刻**大部分数据已在手上** → 先让界面出一次图，
    // 不必干等那批缺投影的会话补查完。
    if (typeof onPartial === 'function') {
      try { onPartial(items, 0, missing.length) } catch (error) { warn('onPartial', error) }
    }
    const cursor = { i: 0 }
    let done = 0
    /**
     * 一个 worker：不停地取下一个待补 id 做 RPC，直到队列空。
     * 固定数量 worker = 固定并发，不会因为缺失项很多而无限并发。
     */
    async function worker() {
      for (;;) {
        const index = cursor.i++
        if (index >= missing.length) return
        const sessionId = missing[index]
        try {
          const single = unwrap(await remote.session.projections({ sessionId }))
          if (single.ok && single.value !== null && typeof single.value === 'object') {
            const target = byId.get(sessionId)
            if (target !== undefined) target.projections = single.value
          }
        } catch (error) {
          warn('fetchSessions.projections', sessionId + ': ' + reasonText(error))
        }
        // 每次补齐后回调一次（items / 已补数 / 总数）。
        // **节流放在调用方**：这里无条件上报，由 ensureData 的 onPartial 决定要不要重绘
        // —— 37 次补齐重绘 37 次 182 格纯属浪费。最终 draw() 会画全量，不影响正确性。
        done++
        if (typeof onPartial === 'function') {
          try { onPartial(items, done, missing.length) } catch (error) { warn('onPartial', error) }
        }
      }
    }
    const workers = []
    const count = Math.min(PROJECTIONS_FETCH_CONCURRENCY, missing.length)
    for (let i = 0; i < count; i++) workers.push(worker())
    await Promise.all(workers)
    return { ok: true, items }
  }

  // ── 热力图：DOM 注入 ────────────────────────────────────────────────────────
  /**
   * 锚点识别：官方账号页根是 `<section aria-label="账号与余额">`（zh）/ `"Account"`（en）
   * （dsh-client-ui-settings-account/lib/client.js:2409-2411，字典在 :2820 / :2878）。
   * 用 `[aria-label]` 属性而不是写死哈希类名 —— 类名是构建期哈希，官方改版就会变。
   */
  const ANCHOR_LABELS = ['账号与余额', 'Account']

  function findAnchor() {
    if (typeof document === 'undefined') return null
    const sections = document.querySelectorAll('section[aria-label]')
    for (const el of sections) {
      if (ANCHOR_LABELS.indexOf(el.getAttribute('aria-label')) >= 0) return el
    }
    return null
  }

  /** 月份标签：每列的第 0 行是周日，落在新月份的第一列打一个标。 */
  function monthLabels(model) {
    const out = []
    for (let col = 0; col < model.window.columns; col++) {
      const m = cellDate(model.window, col, 0).getMonth()
      const prev = col === 0 ? -1 : cellDate(model.window, col - 1, 0).getMonth()
      if (m !== prev) out.push({ col, month: m })
    }
    return out
  }

  function el(tag, className, attrs) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (attrs !== null && typeof attrs === 'object') {
      for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key])
    }
    return node
  }

  /** 把模型画进容器（整块重建：182 个格子，重建比做差分更短也更不容易出残留状态）。 */
  function renderHeatmap(container, model, t) {
    const text = t ?? makeText(null)
    while (container.firstChild) container.removeChild(container.firstChild)
    container.style.setProperty('--thm-l0', LEVEL_EMPTY_COLOR)
    for (let level = 1; level <= 4; level++) {
      container.style.setProperty('--thm-l' + level, paletteLevelColor(model.palette, level))
    }

    const head = el('div', 'dsh-thm-head')
    head.appendChild(el('div', 'dsh-thm-title', null))
    head.lastChild.textContent = text('heatmap.title')
    const total = el('div', 'dsh-thm-total')
    total.textContent = text('heatmap.total', { tokens: formatTokenCount(model.usage.totalTokens) })
    head.appendChild(total)
    container.appendChild(head)

    const sub = el('div', 'dsh-thm-sub')
    sub.textContent = text('heatmap.subtitle')
    container.appendChild(sub)

    // 月份标签：独立的一行 grid，列宽与下面的格子 grid 完全一致，所以横向对得上。
    const tables = labelTables()
    const months = el('div', 'dsh-thm-months')
    for (const label of monthLabels(model)) {
      const span = el('div', 'dsh-thm-month')
      span.style.gridColumn = String(label.col + 2)
      span.style.gridRow = '1'
      span.textContent = tables.months[label.month]
      months.appendChild(span)
    }
    container.appendChild(months)

    // 星期标签与格子在同一个 grid 的同一批行里（第 1 列 vs 第 2..27 列）。
    const grid = el('div', 'dsh-thm-grid')
    for (let row = 0; row < 7; row++) {
      const label = el('div', 'dsh-thm-weekday')
      label.style.gridColumn = '1'
      label.style.gridRow = String(row + 1)
      // 只标 row 1/3/5 三行（一/三/五 ↔ Mon/Wed/Fri）：7 行全标在 14px 列宽里会挤成一团。
      label.textContent = row === 1 || row === 3 || row === 5 ? tables.weekdays[row] : ''
      grid.appendChild(label)
    }
    for (const day of model.days) {
      const cell = el('div', 'dsh-thm-cell')
      cell.style.gridColumn = String(day.col + 2)
      cell.style.gridRow = String(day.row + 1)
      if (day.future) {
        cell.setAttribute('data-future', '1')
        cell.setAttribute('title', text('heatmap.future', { date: day.key }))
      } else {
        cell.setAttribute('data-level', String(day.level))
        cell.setAttribute('title', day.tokens > 0
          ? text('heatmap.cell', { date: day.key, tokens: group(day.tokens) })
          : text('heatmap.empty'))
      }
      grid.appendChild(cell)
    }
    container.appendChild(grid)

    /** 图例里的一个色块。level 0 是「无用量」的中性灰，1..4 是主色深浅。 */
  function swatchFor(paletteId, level) {
    const swatch = el('span', 'dsh-thm-legendCell')
    swatch.style.background = level === 0 ? LEVEL_EMPTY_COLOR : paletteLevelColor(paletteId, level)
    return swatch
  }

  /**
   * 图例。**level 0 不是「少量」，它是「无用量」**，所以不能把它夹在「少…多」中间 ——
   * 那样读图的人会把中性灰那格当成"很少"。
   * 正确形状：无 → [灰][l1] → 少 → [l2][l3][l4] → 多，
   * 即「少→多」这一段只覆盖真正的四档用量色阶。
   */
    const legend = el('div', 'dsh-thm-legend')
    legend.appendChild(el('span', null, null)).textContent = text('heatmap.legendNone')
    legend.appendChild(swatchFor(model.palette, 0))
    legend.appendChild(swatchFor(model.palette, 1))
    legend.appendChild(el('span', null, null)).textContent = text('heatmap.legendLess')
    for (let level = 2; level <= 4; level++) {
      legend.appendChild(swatchFor(model.palette, level))
    }
    legend.appendChild(el('span', null, null)).textContent = text('heatmap.legendMore')
    container.appendChild(legend)

    const books = el('div', 'dsh-thm-books')
    const count = formatBookCount(bookCount(model.usage.totalTokens, DISPLAY_BOOK))
    books.textContent = text(count === BOOK_COUNT_UNDER ? 'books.lineUnder' : 'books.line', {
      count,
      title: DISPLAY_BOOK.title,
    })
    container.appendChild(books)
  }

  function renderMessage(container, text, tone) {
    while (container.firstChild) container.removeChild(container.firstChild)
    const note = el('div', tone === 'error' ? 'dsh-thm-note' : 'dsh-thm-sub')
    note.textContent = text
    container.appendChild(note)
  }

  /** 热力图运行时状态（模块内单例，apply() 只启动一次）。 */
  const heat = {
    remote: null,
    observer: null,
    container: null,
    items: null,
    renderedKey: '',
    fetchedAt: 0,
    warnedAnchor: false,
    warnedFetch: '',
    unlisten: null,
    disposed: false,
    /** 正在飞行的取数 Promise —— in-flight 去重的判据，见 ensureData 的注释。 */
    inflight: null,
    /** 是否至少成功取过一次（或已失败过一次进入退避），用于退避判定。 */
    loadedOnce: false,
    /** 取数失败后的退避截止时间戳；之前不重试。 */
    failedUntil: 0,
    /** 本插件正在写 DOM 的深度 > 0 时，observer 回调应当跳过本轮。 */
    selfWrite: 0,
    /** 自写之后的静默期截止时间戳。 */
    cooldownUntil: 0,
    /** 是否已完成过首次注入（只用于日志降噪，不影响逻辑）。 */
    firstMountDone: false,
  }

  /** 缓存策略：账号页每次进入/重渲染都可能重新挂载，60 秒内复用上次结果，避免每次挂载打一次全量 RPC。 */
  const FETCH_TTL_MS = 60000

  /**
   * 跑一段「本插件自己写 DOM」的代码，并置上自写闸门 + 静默期。
   *
   * 为什么必须有：observer 监听 `document.documentElement` 全子树（startHeatmap 的注释
   * 解释了为什么不能只挂在别的插件上），所以**我们自己的每一条 childList 变更都会回调自己**。
   * 把自写窗口标出来，observer 回调见到就直接跳过 —— 这是让自激链断掉的关键一环。
   */
  function selfWrite(fn) {
    heat.selfWrite++
    const before = Date.now()
    try {
      fn()
    } finally {
      heat.selfWrite--
      // 静默期盖住「自写 → observer 投递」这一拍。
      const spent = Date.now() - before
      heat.cooldownUntil = Math.max(heat.cooldownUntil, Date.now() + Math.max(OBSERVER_QUIET_MS - spent, 0))
    }
  }

  /**
   * 取数。**in-flight 去重是这个函数能终止的唯一原因**（见 startHeatmap 的注释）：
   * observer 回调会反复调 mountOnce → ensureData，而 fetchSessions 是异步 RPC，
   * 在它返回之前 `heat.items` 恒为 null、TTL 守卫恒为假。没有 in-flight 去重的话，
   * 每轮都会执行下面那句同步 DOM 写（loading 提示），那个写又触发 observer → 永久自激。
   * 所以：**同一时刻只允许一个 fetch 在飞**，后来的调用直接复用同一个 Promise。
   */
  async function ensureData() {
    if (heat.disposed) return
    // 已取到且还在 TTL 内：用缓存，不写 DOM、不发 RPC。
    if (heat.items !== null && Date.now() - heat.fetchedAt < FETCH_TTL_MS) return
    // 失败退避期：不重试，也**不写 DOM**（写 DOM 是自激的燃料）。
    if (heat.loadedOnce && Date.now() < heat.failedUntil) return
    // 已经在飞：复用，绝不再发一次。
    if (heat.inflight !== null) return heat.inflight

    const run = (async () => {
      const startedAt = Date.now()
      // ⚠️ 这里**故意不在 await 之前写 DOM**。上一版为了「有加载提示」把 loading 写在
      //   `fetchSessions` 之前 —— 那正是当初把「设置」点卡死的写法：那个 DOM 写触发
      //   插件自己的 observer → 回调 → mountOnce → 又进 ensureData，而 heat.items
      //   在 await 返回前恒为 null、TTL 守卫恒为假 → 无限自激。
      //   速度不能拿「会不会卡死」去换，所以这里用 await 之后的增量重绘来提供反馈：
      //   list() 一返回就画第一批数据（用户几乎看不到空白），随后每次补齐再更新。
      const onPartial = (partialItems) => {
        if (heat.disposed || !Array.isArray(partialItems)) return
        heat.items = partialItems
        draw()
      }
      // 补齐进度提示：画在容器末尾，走 selfWrite 闸门（observer 回调会跳过自写窗口）。
      // 与「await 前写 DOM」的区别：这是**在 await 之后**发生的，heat.items 已有值，
      // TTL 守卫生效，不会重新进入 ensureData，所以不构成自激链。
      const progress = {
        node: null,
        show: (done, total) => {
          if (heat.disposed || heat.container === null || heat.container.parentNode === null) return
          if (done >= total) { progress.hide(); return }
          if (progress.node === null) {
            progress.node = el('div', 'dsh-thm-sub')
            progress.node.style.margin = '8px 2px 0'
          }
          progress.node.textContent = '正在补齐 ' + done + '/' + total + ' 个会话的用量…'
          if (progress.node.parentNode !== heat.container) {
            selfWrite(() => heat.container.appendChild(progress.node))
          }
        },
        hide: () => {
          if (progress.node !== null && progress.node.parentNode !== null) {
            selfWrite(() => progress.node.parentNode.removeChild(progress.node))
          }
          progress.node = null
        },
      }
      const result = await fetchSessions(heat.remote, (items, done, total) => {
        // 节流重绘：补齐 N 个会话时不该重建 N 次 182 个格子。
        // 进度文本每次都更新（只改一个字符串，极便宜），重绘每 120ms 最多一次。
        const now = Date.now()
        if (now - heat.lastPartialDraw >= PARTIAL_REDRAW_INTERVAL_MS) {
          heat.lastPartialDraw = now
          onPartial(items)
        }
        progress.show(done, total)
      })
      progress.hide()
      if (heat.disposed) return
      if (!result.ok) {
        warn('fetchSessions', result.error)
        heat.loadedOnce = true
        heat.failedUntil = Date.now() + FETCH_FAIL_BACKOFF_MS
        if (heat.warnedFetch !== result.error) {
          heat.warnedFetch = result.error
          // 只在**容器尚未被官方丢弃**时写错误提示，避免在孤儿节点上白写。
          if (heat.container !== null && heat.container.parentNode !== null) {
            selfWrite(() => renderMessage(heat.container, makeText(null)('heatmap.failed', { reason: result.error }), 'error'))
          }
        }
        return
      }
      heat.warnedFetch = ''
      heat.items = result.items
      heat.fetchedAt = Date.now()
      heat.loadedOnce = true
      heat.renderedKey = ''
      console.debug('[' + MARK + '] ensureData: ' + result.items.length + ' 个会话，耗时 ' +
        (Date.now() - startedAt) + 'ms')
    })()

    heat.inflight = run
    try {
      await run
    } finally {
      if (heat.inflight === run) heat.inflight = null
    }
  }

  /**
   * 幂等挂载。
   *
   * ⚠️ 判据必须是「父节点是不是**当前那个** section」**加上「还在活动文档里」**，
   * 只比 `parentNode` 会永久失联 —— 这就是「渲染成功却完全看不见」的根因：
   *
   *   官方账号页由 React 渲染。React 重渲染时会**整棵替换** `<section>` 元素本身，
   *   旧 section 连同我们 appendChild 进去的容器一起脱离文档（成为孤儿节点）。
   *   而 `container.parentNode` **仍然 === 那个旧 section**（引用还在，节点已不在文档里），
   *   所以 `parentNode !== section` 恒为 false → 再也不补挂 → 页面上永远空白。
   *
   *   实测证据：`getBoundingClientRect()` 返回 0x0，且 `getComputedStyle()` 返回
   *   **全空字符串**（display/visibility/opacity 都没有值）—— 这只有一种解释：
   *   元素不在活动文档树里。正常元素即使尺寸为 0，computed style 也一定有值。
   *
   * 修法：用 `section.contains(container)` + `container.isConnected` 判定，
   * 前者保证父节点是当前锚点，后者保证整条链都还挂在 document 上。
   */
  function mountOnce() {
    if (heat.disposed || typeof document === 'undefined') return
    const section = findAnchor()
    if (section === null) {
      if (!heat.warnedAnchor) {
        heat.warnedAnchor = true
        // 官方改版导致锚点消失时必须明确报错，不许静默失败。
        setTimeout(() => {
          if (!heat.disposed && findAnchor() === null) {
            warn('mountOnce', '找不到官方「账号与余额」页的 <section aria-label="' + ANCHOR_LABELS.join('" / "') +
              '">。官方结构可能已改版，热力图无法注入。可在 lib/client.js 顶部的 ANCHOR_LABELS 里补上新标签。')
          }
        }, 10000)
      }
      return
    }
    if (heat.container === null) {
      heat.container = el('div', 'dsh-thm')
      heat.container.setAttribute('data-' + MARK, '')
    }
    // 三条缺一不可：容器存在、当前锚点确实包含它、它整条链还在文档里。
    const anchored = section.contains(heat.container)
    const live = heat.container.isConnected !== false
    if (!anchored || !live) {
      // 走 selfWrite：这一下是 DOM 写，会触发我们自己的 observer，必须由闸门挡掉。
      selfWrite(() => section.appendChild(heat.container))
      // 补挂是高频事件（官方每次重渲染都可能触发），所以只在**首次**注入时打一行 info，
      // 后续补挂降为 debug，避免每次打开设置都刷屏。
      if (heat.firstMountDone !== true) {
        heat.firstMountDone = true
        console.info('[' + MARK + '] mountOnce: 热力图容器已注入官方「账号与余额」页')
      } else {
        console.debug('[' + MARK + '] mountOnce: 官方重渲染后补挂容器（' +
          (live ? '挂到当前锚点' : '原容器已脱离文档') + '）')
      }
    }
    ensureData().then(draw).catch((error) => warn('ensureData', error))
  }

  function draw() {
    if (heat.disposed || heat.container === null || heat.items === null) return
    const palette = paletteStore.get()
    const win = heatmapWindow(new Date())
    const model = buildModel(heat.items, win, palette)
    const key = win.todayKey + '|' + palette + '|' + model.usage.totalTokens + '|' + model.usage.binned
    if (key === heat.renderedKey) return
    heat.renderedKey = key
    // 以下两条是排障期加的诊断，降为 debug：功能正常时不必刷屏。
    console.debug('[' + MARK + '] draw: 会话 ' + heat.items.length + ' 个，有 token 的 ' +
      (heat.items.length - model.usage.missing) + ' 个，分桶 ' + model.usage.binned +
      ' 天，总用量 ' + model.usage.totalTokens)
    // renderHeatmap 会先清空容器再 appendChild 约 190 个节点 = 约 370 条 childList 变更，
    // 全部落在 observer 的监听范围内 → 走 selfWrite 一次性挡掉这一整批。
    selfWrite(() => renderHeatmap(heat.container, model, makeText(null)))
    console.debug('[' + MARK + '] draw: 已渲染，容器内子节点 ' + heat.container.children.length +
      '（isConnected=' + heat.container.isConnected + '）')
  }

  /**
   * 挂载调度。
   *
   * ⚠️ 这里曾经有一个能把「设置」页卡死的自激循环，根因在 **ensureData 的 TTL 守卫失效**
   * （不是 renderHeatmap）：`ensureData()` 在 `await fetchSessions(...)` **之前**同步写
   * 「正在读取…」提示（DOM 写 → 触发 observer → 回调 → mountOnce → 又进 ensureData），
   * 而 `heat.items` 只在 RPC 成功返回后才赋值，所以整个 RPC 往返期间
   * `heat.items === null` → L830 的 TTL 守卫恒为假 → 每轮都重进 → 无限自激。
   * RPC 失败时更糟：`items` 永远是 null、`fetchedAt` 永不更新 → **永久**循环。
   *
   * 现在的做法是**从根上掐断驱动源**，而不是给回调加更多闸门：
   *   1. `heat.inflight` —— 同一时刻只允许一个取数在飞，后来的 ensureData 直接复用它
   *      （这是**唯一**能让微任务链排空的改动，见 ensureData 的注释）。
   *   2. `heat.loadedOnce` + `heat.failedUntil` —— 失败后进 30 秒退避，不再每帧重试。
   *   3. observer 回调**只补挂容器**，绝不在回调里发起取数。
   *   4. 自己的每一次 DOM 写都包在 selfWrite() 里（mountOnce 的 appendChild、draw 的整块
   *      重建、ensureData 的错误提示），由闸门 + 静默期挡掉自触发。
   */
  const OBSERVER_QUIET_MS = 250
  const MAX_PASSES_PER_FRAME = 3
  const FETCH_FAIL_BACKOFF_MS = 30000

  function startHeatmap(remote) {
    heat.remote = remote
    // effect 可能被重新执行（热重载 / 配置变更），所以这里必须把上一次的终态复位，
    // 否则第二次 startHeatmap 会被自己上一次的 disposed=true 直接废掉。
    heat.disposed = false
    heat.inflight = null
    heat.loadedOnce = false
    heat.failedUntil = 0
    heat.selfWrite = 0
    heat.cooldownUntil = 0
    heat.passesThisFrame = 0
    paletteStore.load()
    heat.unlisten = paletteStore.subscribe(() => {
      heat.renderedKey = ''
      draw()
    })
    if (typeof MutationObserver === 'undefined') {
      warn('startHeatmap', '环境里没有 MutationObserver，无法跟随官方页面重渲染；热力图只会在首帧尝试挂一次。')
      mountOnce()
      return
    }

    /**
     * observer 回调：**只做「官方把我们的容器弄丢了就补挂」这一件事**。
     * 这里绝不调用 ensureData —— 取数由 mountOnce 触发一次，回调再触发就是自激的源头。
     *
     * ⚠️ 早退条件必须和 mountOnce 的判据一致（见 mountOnce 的注释）：
     *   只看 `parentNode !== null` 是不够的 —— React 重渲染会把整个 `<section>` 换掉，
     *   我们的容器跟着旧 section 脱离文档，但 `parentNode` 仍是那个旧 section（非 null），
     *   于是这里每次都早退 → 永远不补挂 → 页面上一直是空白。
     *   所以判据用「容器 isConnected 且当前锚点 contains 它」。
     */
    const observer = new MutationObserver(() => {
      if (heat.disposed) return
      // 本插件自己造成的变更，本轮不处理。
      if (heat.selfWrite > 0) return
      // 单帧挂载次数上限，兜底。
      if (heat.passesThisFrame >= MAX_PASSES_PER_FRAME) return
      heat.passesThisFrame++
      // 让出一帧，等官方这批 mutation 全部投递完再决定要不要补挂。
      setTimeout(() => {
        heat.passesThisFrame = 0
        if (heat.disposed) return
        // 还稳稳挂在当前锚点上就什么都不做 —— 这一条就是终止条件。
        const current = findAnchor()
        const healthy = heat.container !== null &&
          heat.container.isConnected !== false &&
          current !== null && current.contains(heat.container)
        if (healthy) return
        // ⚠️ 走到这里说明**容器已经脱离当前文档**（官方把整棵 section 换掉了），
        //   这属于必须立刻补救的情况，**不能被静默期挡掉**。
        //   官方重渲染经常紧跟在我们自己的写之后，两者都在 OBSERVER_QUIET_MS 内；
        //   若这里再查 cooldownUntil，唯一能救的补挂就被静默期吞掉，
        //   之后没有新的 mutation 到来 → 热力图永远空白（真机实测就是这个现象）。
        mountOnce()
      }, 0)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    heat.observer = observer
    // 启动成功也打一条：控制台里若看得到这行，说明 fiber 活了、observer 挂了，
    // 问题只在「没找到锚点」或「取数失败」；若连这行都没有，说明插件压根没 apply。
    console.info('[' + MARK + '] startHeatmap: observer 已启动，等待官方「账号与余额」页出现')
    mountOnce()
  }

  function stopHeatmap() {
    heat.disposed = true
    if (heat.unlisten !== null) {
      heat.unlisten()
      heat.unlisten = null
    }
    if (heat.observer !== null) {
      heat.observer.disconnect()
      heat.observer = null
    }
    if (heat.container !== null && heat.container.parentNode !== null) {
      heat.container.parentNode.removeChild(heat.container)
    }
    heat.container = null
    heat.items = null
    // 取数状态一并复位，否则下一次 startHeatmap 会被上一次的 in-flight 卡住。
    heat.inflight = null
    heat.loadedOnce = false
    heat.failedUntil = 0
    heat.renderedKey = ''
    heat.fetchedAt = 0
  }

  // ── 通用设置里的配色行 ──────────────────────────────────────────────────────
  /**
   * 剪贴板：与 writeClipboard 同款降级链（navigator.clipboard → 隐藏 textarea）。
   * 导出/导入都靠它，所以必须自带降级，不能假设 Electron 一定有 navigator.clipboard。
   */
  function writeClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined && navigator.clipboard !== null &&
      typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text))
    }
    return Promise.resolve(legacyCopy(text))
  }
  function legacyCopy(text) {
    try {
      if (typeof document === 'undefined') return false
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      try {
        return typeof document.execCommand === 'function' ? document.execCommand('copy') === true : false
      } finally {
        el.remove()
      }
    } catch {
      return false
    }
  }
  /** 读剪贴板；拿不到就回落为让用户粘贴。 */
  function readClipboard() {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined && navigator.clipboard !== null &&
      typeof navigator.clipboard.readText === 'function') {
      return navigator.clipboard.readText().catch(() => '')
    }
    return Promise.resolve('')
  }

  /**
   * 通用设置里的「热力图配色」行。
   *
   * props 来自 slots.register 的 `inject`（dsh-client-ui-slots 把 inject 返回对象的键
   * 摊平成 props，`hooks` 里的名字才会变成 useXxx(selector)）。
   * 这里**刻意只用普通函数 prop、没用 hooks**：hooks 的 store 契约没有在本插件里被
   * 独立核实过，用 `getPalette/setPalette` 两个函数 + 组件内 useState 订阅同一个
   * paletteStore，行为一样且少一条没验证的依赖。
   *
   * 除 6 个色块外还有**导出 / 导入**两个按钮：配色存在 localStorage，
   * 清缓存或换机器会丢，导出一份 JSON 就能恢复（详见 paletteStore 的注释）。
   */
  function PaletteRow(props) {
    const safe = props ?? {}
    const t = makeText(safe.t)
    const getPalette = typeof safe.getPalette === 'function' ? safe.getPalette : paletteStore.get
    const [value, setValue] = React.useState(getPalette)
    const [ioState, setIoState] = React.useState('')
    React.useEffect(() => paletteStore.subscribe(setValue), [])

    const flash = (msg) => {
      setIoState(msg)
      setTimeout(() => setIoState((cur) => (cur === msg ? '' : cur)), 2500)
    }

    const onExport = () => {
      const text = paletteStore.exportText()
      if (text === '') { flash(t('palette.exportFailed')); return }
      writeClipboard(text).then((ok) => {
        flash(ok ? t('palette.exported') : t('palette.exportFailed'))
      })
    }

    const onImport = () => {
      readClipboard().then((text) => {
        if (typeof text !== 'string' || text.trim() === '') { flash(t('palette.importEmpty')); return }
        const r = paletteStore.importText(text)
        flash(r.ok ? t('palette.imported') : t('palette.importFailed'))
        if (!r.ok) warn('paletteStore.importText', r.reason)
      })
    }

    return React.createElement(
      'div',
      { className: 'dsh-thm-row' },
      React.createElement(
        'div',
        { className: 'dsh-thm-rowText' },
        React.createElement('div', { className: 'dsh-thm-rowTitle' }, t('palette.title')),
        React.createElement('div', { className: 'dsh-thm-rowDesc' }, t('palette.description')),
        React.createElement(
          'div',
          { className: 'dsh-thm-io' },
          React.createElement('button', {
            type: 'button', className: 'dsh-thm-ioBtn', onClick: onExport, title: t('palette.exportHint'),
          }, t('palette.export')),
          React.createElement('button', {
            type: 'button', className: 'dsh-thm-ioBtn', onClick: onImport, title: t('palette.importHint'),
          }, t('palette.import')),
          ioState === ''
            ? null
            : React.createElement('span', { className: 'dsh-thm-ioState', role: 'status' }, ioState),
        ),
      ),
      React.createElement(
        'div',
        { className: 'dsh-thm-swatches', role: 'radiogroup', 'aria-label': t('palette.title') },
        PALETTE_ORDER.map((id) => React.createElement('button', {
          key: id,
          type: 'button',
          role: 'radio',
          className: 'dsh-thm-swatch' + (value === id ? ' is-on' : ''),
          'aria-checked': value === id ? 'true' : 'false',
          'aria-label': t(PALETTES[id].labelKey),
          title: t(PALETTES[id].labelKey),
          style: { background: PALETTES[id].base },
          onClick: () => {
            try {
              if (typeof safe.setPalette === 'function') safe.setPalette(id)
              else paletteStore.set(id)
            } catch (error) {
              warn('PaletteRow.onClick', error)
            }
          },
        })),
      ),
    )
  }

  // ── 挂载 ────────────────────────────────────────────────────────────────────
  function apply(ctx) {
    try {
      ensureCss()
    } catch (error) {
      warn('ensureCss', error)
    }

    const locale = ctx.locale
    if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
      try {
        ctx.effect(() => locale.register(NS, { zh, en }), ROW_ID + ': dictionaries')
      } catch (error) {
        warn('locale.register', error)
      }
    }

    // order = 50 的依据：排序是**升序**（dsh-client-ui-slots/lib/index.js:221
    // → `(a.options.order ?? 0) - (b.options.order ?? 0)`），本槽位现有官方 order 是
    // developer-tools=15（dsh-client-ui-settings-general/lib/client.js:960）与
    // current-version=100（:971），50 正落在两者之间。
    //
    // ⚠️ 整段包 try/catch：register 抛错会**连带炸掉整个 apply()**，官方 bundle 跟着死。
    //    一行配色坏了只该是「设置里没这行」，不该是「设置页打不开」。
    const slots = ctx.slots
    if (slots !== undefined && slots !== null && typeof slots.register === 'function') {
      try {
        ctx.effect(() => slots.inject('settings.general.item', () => slots.register({
          name: 'settings.general.item',
          id: ROW_ID,
          order: 50,
          locale: NS,
          inject: () => ({
            getPalette: () => paletteStore.get(),
            setPalette: (id) => paletteStore.set(id),
          }),
        }, PaletteRow)), ROW_ID + ': palette row')
      } catch (error) {
        warn('slot register', error)
      }
    } else {
      warn('apply', 'ctx.slots 不可用，通用设置里不会出现配色行')
    }

    // ⚠️ cordis 的 `ctx` 是 Proxy：**读取未在 exports.inject 里声明的服务名会直接抛**
    //   `cannot get property "<name>" without inject`
    //   （cordis/lib/index.js:676，ReflectService.handler.get 里构造的那个 Error）。
    //   所以下面这行 try/catch 只是兜底，**不能替代文件尾 exports.inject 的声明**。
    //   官方同款写法（父命名空间与子命名空间都声明，不只声明一个）：
    //   dsh-client-ui-settings-account → ["slots","locale","remote","remote.account","remote.session","theme","configForms"]
    //   dsh-client-ui-settings-general → ["slots","locale","connection","remote","remote.settings","configForms","shortcuts"]
    //   本插件只需要 remote.session.list / remote.session.projections 两个调用点。
    let remote = null
    try {
      remote = ctx.remote
    } catch (error) {
      warn('apply', 'ctx.remote 不可用（未在 exports.inject 声明？）: ' + String(error !== null && error !== void 0 ? error.message : error))
      return
    }
    if (remote === undefined || remote === null || typeof remote.session !== 'object' || remote.session === null) {
      warn('apply', 'ctx.remote.session 不可用，热力图无法读取会话用量')
      return
    }
    try {
      ctx.effect(() => {
        startHeatmap(remote)
        return () => stopHeatmap()
      }, ROW_ID + ': account page heatmap')
    } catch (error) {
      warn('startHeatmap', error)
    }
  }

  exports.name = 'dsh-token-heatmap-client'
  /**
   * 必须声明的三个服务：
   *   slots / locale —— 通用设置那一行要用（dsh-client-ui-slots、dsh-client-locale）。
   *   remote + remote.session —— 读会话 token 用量。`remote.session` 的取数调用点见 fetchSessions()。
   *
   * ⚠️ **少声明就会让插件激活失败**，而且症状不是「热力图不显示」，而是插件页直接报
   *   `Error: cannot get property "remote" without inject`：cordis 的 ctx 是 Proxy，
   *   读未声明的服务名会抛（cordis/lib/index.js:676）。本插件曾经踩过这个坑。
   */
  exports.inject = ['slots', 'locale', 'remote', 'remote.session']
  exports.apply = apply

  /**
   * 纯逻辑出口，供 tests/selftest.mjs **真实调用**（不是复制一份算法，是调本文件的函数）。
   * ⚠️ 只能在 factory 内部赋值：本文件的顶层是零绑定的单条语句，加顶层 `export` 会撞名。
   */
  exports.__testInternals = {
    formatTokenCount,
    formatBookCount,
    group,
    trimZeros,
    safeInt,
    heatmapWindow,
    cellDate,
    dayKey,
    quantile,
    levelThresholds,
    levelFor,
    tokenTotalOf,
    collectUsage,
    buildModel,
    bookCount,
    sanitizePalette,
    paletteLevelColor,
    LEVEL_EMPTY_COLOR,
    PALETTES,
    PALETTE_ORDER,
    DEFAULT_PALETTE,
    // paletteStore 直接导出，让自检能真跑它的读写/导出/导入逻辑，
    // 而不是断言源码里有没有某个字符串。
    paletteStore,
    PALETTE_KEY,
    BOOKS_ZH,
    BOOKS_EN,
    DISPLAY_BOOK,
    CHARS_PER_TOKEN,
    WINDOW_WEEKS,
    ANCHOR_LABELS,
    renderHeatmap,
    monthLabels,
    currentLang,
    labelTables,
    MONTH_KEYS_ZH,
    MONTH_KEYS_EN,
    WEEKDAY_KEYS_ZH,
    WEEKDAY_KEYS_EN,
    BOOK_COUNT_UNDER,
  }
  return module.exports
  },
})