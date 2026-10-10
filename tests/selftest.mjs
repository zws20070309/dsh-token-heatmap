// token 用量热力图 —— 纯逻辑自检。
//
// 它**真实加载** lib/client.js（不是复制一份算法来测）：把 `window.__ModuleLoader__`
// 换成最小桩，跑那条顶层语句，让 factory 真的执行一遍，再从它导出的
// `__testInternals` 上取函数来断言。这样测的就是**运行物本身**。
//
//   node tests/selftest.mjs        # 全绿 exit 0
//   node tests/selftest.mjs        # 有失败 exit 1
import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { installDomStub, StubNode } from './dom-stub.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = path.join(ROOT, 'lib', 'client.js')

if (!fs.existsSync(CLIENT)) {
  console.error('找不到 ' + CLIENT)
  process.exit(1)
}

// ── React 桩 ──────────────────────────────────────────────────────────────────
// client.js 的 factory 只 `require('react')`，纯函数一个都不碰 React。
// 这里给一个最小实现：能跑 factory，且**万一**有代码在装载期误用 createElement 也不会
// 抛「React 未定义」这种与被测逻辑无关的错。
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? null, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  Fragment: 'fragment',
}

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(desc) {
      loaded = desc.factory((name) => {
        if (name === 'react') return reactStub
        throw new Error('selftest: 未预期的 require("' + name + '")，本插件只应 require react')
      })
    },
  },
}

await import(pathToFileURL(CLIENT).href)

assert.ok(loaded !== null, 'lib/client.js 没有调用 window.__ModuleLoader__.load(...)')
assert.equal(typeof loaded.apply, 'function', 'client.js 必须导出 apply')
// 只声明这两个曾经是个真 bug：cordis 的 ctx 是 Proxy，读未声明的服务名直接抛
// `cannot get property "remote" without inject`（cordis/lib/index.js:676），
// 症状是插件激活失败（插件页直接报错），不是「热力图不显示」。
assert.deepEqual(loaded.inject, ['slots', 'locale', 'remote', 'remote.session'])
const api = loaded.__testInternals
assert.ok(api !== undefined && typeof api === 'object', 'client.js 必须导出 __testInternals 供自检调用')

// ── 断言框架 ─────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures = []

/** 同步与异步用例都收；异步用例串行跑完再进下一条，避免相互干扰 globalThis 桩。 */
const pending = []
function test(name, fn) {
  if (fn.constructor.name === 'AsyncFunction') {
    pending.push([name, fn])
    return
  }
  try {
    fn()
    passed++
    console.log('  PASS  ' + name)
  } catch (error) {
    failed++
    failures.push({ name, error })
    console.log('  FAIL  ' + name)
    console.log('        ' + (error && error.message ? String(error.message).split('\n').join('\n        ') : String(error)))
  }
}
function group(name) {
  console.log('\n' + name)
}

// 本地时区固定成 UTC 跑几何断言，免得测试机时区不同导致跨日边界飘。
// 需要显式本地时区语义的用例单独用 new Date(y, m, d) 构造，见下。
const api2 = api

group('1. token → 字符串单位（M/B 阈值表）')
test('formatTokenCount 0 → "0"', () => {
  assert.equal(api2.formatTokenCount(0), '0')
})
test('formatTokenCount 999,999 → "999,999"（不进 K 档）', () => {
  assert.equal(api2.formatTokenCount(999999), '999,999')
})
test('formatTokenCount 1,000,000 → "1M"', () => {
  assert.equal(api2.formatTokenCount(1000000), '1M')
})
test('formatTokenCount 12,345,678 → "12.3M"', () => {
  assert.equal(api2.formatTokenCount(12345678), '12.3M')
})
test('formatTokenCount 1,000,000,000 → "1B"', () => {
  assert.equal(api2.formatTokenCount(1000000000), '1B')
})
test('formatTokenCount 1,500,000,000 → "1.5B"', () => {
  assert.equal(api2.formatTokenCount(1500000000), '1.5B')
})
test('M/B 交界不出现 "1000.0M" 或倒挂的 "0.99B"', () => {
  assert.equal(api2.formatTokenCount(994999999), '995M')
  assert.equal(api2.formatTokenCount(995000000), '995M')
  assert.equal(api2.formatTokenCount(999949999), '999.9M')
  assert.equal(api2.formatTokenCount(999950000), '1B')
  assert.equal(api2.formatTokenCount(999999999), '1B')
})
test('formatTokenCount 不使用 Intl compact（中文 locale 也不出 万/亿）', () => {
  for (const v of [1e6, 1e7, 1e8, 1e9, 1.23e9]) {
    const s = api2.formatTokenCount(v)
    assert.ok(!/[万亿]/.test(s), '出现了中文单位: ' + s)
  }
})
test('formatTokenCount 边界脏输入不崩、不出 NaN', () => {
  for (const v of [-1, NaN, Infinity, -Infinity, undefined, null, 'x', {}, []]) {
    assert.equal(api2.formatTokenCount(v), '0', 'input=' + String(v))
  }
  assert.ok(!Number.isNaN(api2.safeInt(NaN)))
  assert.equal(api2.safeInt(123.99), 123)
})

group('2. 26 周几何')
const NOW = new Date(2026, 9, 9, 15, 30, 45, 123) // 2026-10-09 周五，本地时区
const WIN = api2.heatmapWindow(NOW)

test('恰好 26 列 × 7 行 = 182 格', () => {
  assert.equal(WIN.columns, 26)
  assert.equal(WIN.rows, 7)
  assert.equal(WIN.cells, 182)
  assert.equal(WIN.weeks, 26)
})
test('周日起始：第一列第 0 行是周日', () => {
  assert.equal(WIN.start.getDay(), 0)
  assert.equal(api2.dayKey(api2.cellDate(WIN, 0, 0)), api2.dayKey(WIN.start))
})
test('末列是本周，今天落在最后一列', () => {
  assert.equal(WIN.todayColumn, 25)
  assert.equal(WIN.todayRow, NOW.getDay())
  assert.equal(api2.dayKey(api2.cellDate(WIN, 25, WIN.todayRow)), api2.dayKey(NOW))
})
test('今天与第一列的间隔 = (26-1)*7 + 星期几 天', () => {
  const span = Math.round((api2.cellDate(WIN, 25, WIN.todayRow) - WIN.start) / 86400000)
  assert.equal(span, (26 - 1) * 7 + NOW.getDay())
})
test('逐个星期几都成立（周一/周二/…/周日各测一遍）', () => {
  for (let d = 1; d <= 7; d++) {
    // 2026-10-04 是周日，+d 天得到星期 d
    const now = new Date(2026, 9, 4 + d, 12, 0, 0, 0)
    const w = api2.heatmapWindow(now)
    assert.equal(w.start.getDay(), 0, 'd=' + d)
    assert.equal(w.todayColumn, 25, 'd=' + d)
    assert.equal(w.todayRow, now.getDay(), 'd=' + d)
    assert.equal(api2.dayKey(api2.cellDate(w, 25, now.getDay())), api2.dayKey(now), 'd=' + d)
    assert.equal(w.cells, 182, 'd=' + d)
  }
})
test('buildModel 产出 182 个格子，今天之后标 future', () => {
  const m = api2.buildModel([], WIN, 'green')
  assert.equal(m.days.length, 182)
  const future = m.days.filter((x) => x.future)
  assert.equal(future.length, WIN.todayRow === 6 ? 0 : 6 - WIN.todayRow)
  for (const f of future) assert.equal(f.level, -1)
  assert.equal(m.days.filter((x) => api2.dayKey(x.date) === api2.dayKey(NOW)).length, 1)
})

group('3. 分位数分档')
test('quantile 线性插值', () => {
  const a = [1, 2, 3, 4]
  assert.equal(api2.quantile(a, 0), 1)
  assert.equal(api2.quantile(a, 1), 4)
  assert.equal(api2.quantile(a, 0.5), 2.5)
  assert.equal(api2.quantile([10], 0.9), 10)
  assert.equal(api2.quantile([], 0.5), 0)
})
test('levelThresholds 用活跃日中位/75/90 分位（数据集 1..100，线性插值）', () => {
  const values = []
  for (let i = 1; i <= 100; i++) values.push(i)
  const th = api2.levelThresholds(values)
  assert.equal(th.activeDays, 100)
  // pos = (n-1)*q = 99*q，线性插值：t1 = 50 + 1*0.5、t2 = 75 + 1*0.25、t3 = 90 + 1*0.1
  const close = (a, b) => Math.abs(a - b) < 1e-9
  assert.ok(close(th.t1, 50.5), 't1=' + th.t1)
  assert.ok(close(th.t2, 75.25), 't2=' + th.t2)
  assert.ok(close(th.t3, 90.1), 't3=' + th.t3)
})
test('零用量天不参与分位样本', () => {
  const th = api2.levelThresholds([0, 0, 0, 10, 20, 30, 40, 50])
  assert.equal(th.activeDays, 5)
  assert.equal(th.t1, 30)
})
test('levelFor 落在 0-4 且边界严格按阈值', () => {
  const values = []
  for (let i = 1; i <= 100; i++) values.push(i)
  const th = api2.levelThresholds(values)
  assert.equal(api2.levelFor(0, th), 0)
  assert.equal(api2.levelFor(-5, th), 0)
  assert.equal(api2.levelFor(th.t1, th), 1)
  assert.equal(api2.levelFor(th.t2, th), 2)
  assert.equal(api2.levelFor(th.t3, th), 3)
  assert.equal(api2.levelFor(th.t3 + 1, th), 4)
})
test('levelFor 在一组已知数据上给出 0-4 齐全的分布', () => {
  const values = []
  for (let i = 1; i <= 100; i++) values.push(i)
  const th = api2.levelThresholds(values)
  const counts = [0, 0, 0, 0, 0]
  for (const v of values) counts[api2.levelFor(v, th)]++
  assert.deepEqual(counts, [0, 50, 25, 15, 10])
})
test('空数据集 / 全零数据集不崩，阈值退化为 0', () => {
  const a = api2.levelThresholds([])
  const b = api2.levelThresholds([0, 0, 0])
  for (const th of [a, b]) {
    assert.equal(th.t1, 0)
    assert.equal(th.t2, 0)
    assert.equal(th.t3, 0)
    assert.equal(th.activeDays, 0)
    assert.equal(api2.levelFor(0, th), 0)
  }
})
test('levelFor 阈值对象缺失/脏值不崩', () => {
  assert.ok([0, 1, 2, 3, 4].includes(api2.levelFor(999, undefined)))
  assert.ok([0, 1, 2, 3, 4].includes(api2.levelFor(999, { t1: NaN, t2: 'x', t3: null })))
})

group('4. 每日分桶（updatedAt → 本地日期）')
function session(id, updatedAt, buckets) {
  return { sessionId: id, updatedAt, projections: { kind: 'sequenced', asOfSeq: 1, values: { tokenUsage: buckets } } }
}
const W4 = api2.heatmapWindow(new Date(2026, 9, 9, 12, 0, 0, 0))

test('tokenTotalOf 四桶求和，且忽略脏字段', () => {
  assert.equal(api2.tokenTotalOf({ values: { tokenUsage: { uncachedInputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 } } }), 100)
  assert.equal(api2.tokenTotalOf({ values: { tokenUsage: { uncachedInputTokens: 5 } } }), 5)
  assert.equal(api2.tokenTotalOf({ values: {} }), null)
  assert.equal(api2.tokenTotalOf(undefined), null)
  assert.equal(api2.tokenTotalOf({ values: { tokenUsage: { uncachedInputTokens: NaN, outputTokens: -3 } } }), 0)
})
test('同一会话只落一格，按 updatedAt 的本地日期', () => {
  const u = api2.collectUsage([session('a', new Date(2026, 9, 9, 23, 30).getTime(), { uncachedInputTokens: 100 })], W4)
  assert.equal(u.byDay['2026-10-09'], 100)
  assert.equal(Object.keys(u.byDay).length, 1)
  assert.equal(u.totalTokens, 100)
})
test('跨月：9 月 30 日与 10 月 1 日分到两格', () => {
  const u = api2.collectUsage([
    session('a', new Date(2026, 8, 30, 12).getTime(), { uncachedInputTokens: 7 }),
    session('b', new Date(2026, 9, 1, 12).getTime(), { outputTokens: 9 }),
  ], W4)
  assert.equal(u.byDay['2026-09-30'], 7)
  assert.equal(u.byDay['2026-10-01'], 9)
})
test('跨年：12 月 31 日与 1 月 1 日分到两格', () => {
  const win = api2.heatmapWindow(new Date(2027, 0, 5, 12))
  const u = api2.collectUsage([
    session('a', new Date(2026, 11, 31, 23).getTime(), { uncachedInputTokens: 1 }),
    session('b', new Date(2027, 0, 1, 0, 30).getTime(), { uncachedInputTokens: 2 }),
  ], win)
  assert.equal(u.byDay['2026-12-31'], 1)
  assert.equal(u.byDay['2027-01-01'], 2)
})
test('跨时区边界：UTC 16:00 之后的中国本地日已跨日', () => {
  // 2026-10-08T16:00Z === 2026-10-09T00:00+08:00，本地日必须是 10-09 而不是 10-08。
  const ts = Date.UTC(2026, 9, 8, 16, 0, 0)
  const key = api2.dayKey(new Date(ts))
  const expected = api2.dayKey(new Date(2026, 9, 9, 0, 0, 0, 0))
  assert.equal(key, expected, '当前时区 ' + (Intl.DateTimeFormat().resolvedOptions().timeZone) + ' 下 key=' + key)
})
test('窗口外的数据不进网格，但计入总用量', () => {
  const u = api2.collectUsage([
    session('old', new Date(2020, 0, 1, 12).getTime(), { uncachedInputTokens: 500 }),
    session('now', new Date(2026, 9, 9, 12).getTime(), { uncachedInputTokens: 3 }),
    session('future', new Date(2030, 0, 1, 12).getTime(), { uncachedInputTokens: 700 }),
  ], W4)
  assert.equal(Object.keys(u.byDay).length, 1)
  assert.equal(u.byDay['2026-10-09'], 3)
  assert.equal(u.totalTokens, 1203, '总用量 = 全部会话 token 之和（500+3+700），不受窗口限制')
})
test('脏输入：缺 updatedAt / 负数 / NaN / 非对象项 / 缺投影', () => {
  const u = api2.collectUsage([
    session('ok', new Date(2026, 9, 9, 12).getTime(), { uncachedInputTokens: 4 }),
    session('noTs', undefined, { uncachedInputTokens: 5 }),
    session('negTs', -1, { uncachedInputTokens: 6 }),
    session('nanTs', NaN, { uncachedInputTokens: 7 }),
    { sessionId: 'noProj', updatedAt: new Date(2026, 9, 8, 12).getTime() },
    null,
    42,
    'nope',
  ], W4)
  assert.equal(u.byDay['2026-10-09'], 4)
  assert.equal(u.undated, 3)
  assert.equal(u.missing, 1)
  assert.equal(u.totalTokens, 22)
  for (const v of Object.values(u.byDay)) assert.ok(Number.isFinite(v))
})
test('collectUsage 接受非数组输入', () => {
  for (const bad of [undefined, null, 'x', {}]) {
    const u = api2.collectUsage(bad, W4)
    assert.equal(u.totalTokens, 0)
    assert.deepEqual(u.byDay, {})
  }
})

group('5. 名著换算（token × 4 ÷ 该书汉字数）')
test('换算系数是 1 token ≈ 4 字符', () => {
  assert.equal(api2.CHARS_PER_TOKEN, 4)
})
test('展示基准书是中文书，单位是汉字数', () => {
  assert.equal(api2.DISPLAY_BOOK.title, '红楼梦')
  assert.equal(api2.DISPLAY_BOOK.chars, 730000)
  assert.ok(typeof api2.DISPLAY_BOOK.chars === 'number' && api2.DISPLAY_BOOK.chars > 0)
})
test('中英单位分开：英文书记 words，不参与换算', () => {
  for (const b of api2.BOOKS_ZH) assert.equal(typeof b.chars, 'number', b.title + ' 缺 chars')
  for (const b of api2.BOOKS_EN) {
    assert.equal(typeof b.words, 'number', b.title + ' 缺 words')
    assert.equal(b.chars, undefined, b.title + ' 不该有 chars')
  }
})
test('bookCount：token × 4 ÷ 字数', () => {
  assert.equal(api2.bookCount(0, { chars: 730000 }), 0)
  assert.equal(api2.bookCount(730000 / 4, { chars: 730000 }), 1)
  assert.equal(api2.bookCount(730000, { chars: 730000 }), 4)
  assert.ok(Math.abs(api2.bookCount(1000000, { chars: 730000 }) - 4000000 / 730000) < 1e-9)
})
test('本数 < 1 时如实显示小数，不显示 0 本、也不进位成 1', () => {
  assert.equal(api2.formatBookCount(0.31), '0.31')
  assert.equal(api2.formatBookCount(0.04), '0.04')
  assert.equal(api2.formatBookCount(0.996), '1')  // toFixed(2) → 1.00 → trim → 1
  assert.ok(parseFloat(api2.formatBookCount(0.5)) < 1)
  assert.notEqual(api2.formatBookCount(0.5), '0')
})
test('本数 < 0.01 时不显示 "0"（两位小数放不下），用 "< 0.01" 占位', () => {
  // 0.0018.toFixed(2) === "0.00"，trimZeros 之后就是 "0" —— 必须挡在前面
  assert.ok(!/^0$/.test(api2.formatBookCount(0.0018)), '真的算出 "0" 了')
  assert.equal(api2.BOOK_COUNT_UNDER, '< 0.01')
  assert.equal(api2.formatBookCount(0.0018), api2.BOOK_COUNT_UNDER)
  for (const v of [1e-9, 0.0001, 0.001, 0.0018, 0.0049, 0.009999]) {
    assert.equal(api2.formatBookCount(v), api2.BOOK_COUNT_UNDER, 'v=' + v)
  }
  // 0.01 是边界：够两位小数，回到正常数字
  assert.equal(api2.formatBookCount(0.01), '0.01')
  assert.notEqual(api2.formatBookCount(0.01), api2.BOOK_COUNT_UNDER)
})
test('真的一个 token 都没有 → 显示 "0"（语义不同于「算不出来」）', () => {
  assert.equal(api2.formatBookCount(0), '0')
  assert.notEqual(api2.formatBookCount(0), api2.BOOK_COUNT_UNDER)
})
test('formatBookCount 各量级', () => {
  assert.equal(api2.formatBookCount(0), '0')
  assert.equal(api2.formatBookCount(3.2), '3.2')
  assert.equal(api2.formatBookCount(12), '12')
  assert.equal(api2.formatBookCount(1234.4), '1,234')
  assert.equal(api2.formatBookCount(NaN), '0')
  assert.equal(api2.formatBookCount(-3), '0')
})
test('bookCount 脏书名/脏 token 不崩、不出 NaN', () => {
  for (const book of [undefined, null, {}, { chars: 0 }, { chars: -1 }, { chars: NaN }]) {
    assert.equal(api2.bookCount(1000, book), 0)
  }
  for (const t of [NaN, Infinity, -1, undefined, 'x']) {
    const c = api2.bookCount(t, { chars: 730000 })
    assert.ok(Number.isFinite(c) && c === 0, 'input=' + String(t))
  }
})

group('6. 配色与空值格')
test('6 种浅色系各 5 档（0 = 无用量 + 4 级深浅）', () => {
  assert.equal(api2.PALETTE_ORDER.length, 6)
  assert.equal(api2.DEFAULT_PALETTE, 'green')
  for (const id of api2.PALETTE_ORDER) {
    const base = api2.PALETTES[id].base
    assert.ok(typeof base === 'string' && /^#[0-9a-f]{6}$/i.test(base), id + ' 的主色不是合法 hex: ' + base)
    assert.equal(api2.paletteLevelColor(id, 0), api2.LEVEL_EMPTY_COLOR)
    for (const pct of [18, 38, 62, 100]) {
      const level = [18, 38, 62, 100].indexOf(pct) + 1
      const c = api2.paletteLevelColor(id, level)
      assert.ok(c.includes(base) && c.includes(pct + '%'), id + ' level ' + level + ' → ' + c)
    }
  }
})
test('同色系内 level 1→4 的主色占比单调递增（越深 = 用量越多）', () => {
  const pct = [0, 18, 38, 62, 100]
  for (let i = 1; i < pct.length; i++) assert.ok(pct[i] > pct[i - 1])
  const c1 = api2.paletteLevelColor('blue', 1)
  const c4 = api2.paletteLevelColor('blue', 4)
  assert.ok(c1.includes('18%') && c4.includes('100%'))
})
test('空值格用「墨色 6% 混页面底色」，不用 surface token（浅色主题防隐形）', () => {
  const empty = api2.LEVEL_EMPTY_COLOR
  assert.equal(api2.paletteLevelColor('green', 0), empty)
  assert.ok(empty.includes('label-primary'))
  assert.ok(empty.includes('bg-base'))
  assert.ok(empty.includes('6%'))
  assert.ok(!/surface/.test(empty), '空值格不许用 surface token')
})
test('sanitizePalette 拒绝未知值，永不把未验证字符串塞进 CSS', () => {
  assert.equal(api2.sanitizePalette('green'), 'green')
  assert.equal(api2.sanitizePalette('purple'), 'purple')
  for (const bad of [undefined, null, '', 'chartreuse', 'red; background:url(x)', 0, {}, 'toString', '__proto__']) {
    assert.equal(api2.sanitizePalette(bad), 'green', 'input=' + String(bad))
  }
})
test('paletteLevelColor 脏 level 被夹到 1-4，脏色系回落默认', () => {
  for (const lv of [-5, 0, 5, NaN, undefined]) {
    const c = api2.paletteLevelColor('green', lv)
    assert.equal(typeof c, 'string', 'level=' + String(lv))
    assert.ok(c.length > 0, 'level=' + String(lv))
  }
  assert.equal(api2.paletteLevelColor('green', 5), api2.paletteLevelColor('green', 4))
  assert.equal(api2.paletteLevelColor('nope', 2), api2.paletteLevelColor('green', 2))
})

group('7. 锚点与整体装配')
test('锚点标签覆盖官方中英文 aria-label', () => {
  assert.deepEqual(api2.ANCHOR_LABELS, ['账号与余额', 'Account'])
})
test('empty inputs 全链路不崩（buildModel 吃空数组 / 脏数据）', () => {
  for (const items of [[], undefined, null, [null, 0, 'x', {}]]) {
    const m = api2.buildModel(items, api2.heatmapWindow(new Date(2026, 9, 9)), 'blue')
    assert.equal(m.days.length, 182)
    assert.equal(m.usage.totalTokens, 0)
    assert.equal(m.palette, 'blue')
    for (const d of m.days) assert.ok(Number.isInteger(d.level) && d.level >= -1 && d.level <= 4)
  }
})
test('heatmapWindow 脏 now / 脏 weeks 不崩', () => {
  for (const now of [undefined, null, NaN, new Date('nope'), new Date(0)]) {
    const w = api2.heatmapWindow(now)
    assert.equal(w.cells, 182)
    assert.ok(Number.isFinite(w.start.getTime()))
  }
  assert.equal(api2.heatmapWindow(new Date(), 0).columns, 26)
  assert.equal(api2.heatmapWindow(new Date(), NaN).columns, 26)
  assert.equal(api2.heatmapWindow(new Date(), 4).cells, 28)
})
test('client.js 顶层零绑定（没有任何顶层 const/let/var/function/export）', () => {
  const src = fs.readFileSync(CLIENT, 'utf8')
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 只放行注释行与 factory 内部（缩进 ≥2 的行）
    if (/^\s*\/\//.test(line)) continue
    if (/^\s{2,}/.test(line)) continue
    assert.ok(
      /^(window\.__ModuleLoader__\.load\(\{|\}\);?$|\s*$)/.test(line.trim()) === true || /^\s*$/.test(line),
      '第 ' + (i + 1) + ' 行有顶层绑定: ' + line.slice(0, 80),
    )
  }
  assert.ok(!/^(const|let|var|function|class|export|import)\s/m.test(src), '文件顶层存在绑定/导入声明')
})

group('8. 渲染出的 DOM 结构（用最小 DOM 桩真跑 renderHeatmap）')
const stub = installDomStub()
const win8 = api2.heatmapWindow(new Date(2026, 9, 9, 15, 0, 0, 0)) // 周五
const items8 = [
  { sessionId: 'a', updatedAt: new Date(2026, 9, 9, 10).getTime(), projections: { values: { tokenUsage: { uncachedInputTokens: 90000000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } } } },
  { sessionId: 'b', updatedAt: new Date(2026, 9, 7, 10).getTime(), projections: { values: { tokenUsage: { uncachedInputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 } } } },
]
const model8 = api2.buildModel(items8, win8, 'purple')
const root8 = new StubNode('div')
api2.renderHeatmap(root8, model8, null)

test('渲染出 182 个格子', () => {
  assert.equal(root8.byClass('dsh-thm-cell').length, 182)
})
test('渲染出 7 个星期标签，与格子共用同一批 grid 行', () => {
  const weekdays = root8.byClass('dsh-thm-weekday')
  assert.equal(weekdays.length, 7)
  assert.equal(root8.byClass('dsh-thm-grid').length, 1, '星期标签必须与格子在同一个 grid 里')
  const grid = root8.byClass('dsh-thm-grid')[0]
  for (let r = 0; r < 7; r++) {
    const wd = weekdays.find((n) => n.style.gridColumn === '1' && n.style.gridRow === String(r + 1))
    assert.ok(wd, '第 ' + (r + 1) + ' 行没有星期标签')
  }
})
test('格子列号从 2 起（1 列留给星期标签），与星期标签列不重叠', () => {
  const cells = root8.byClass('dsh-thm-cell')
  for (const c of cells) {
    const col = Number(c.style.gridColumn)
    assert.ok(col >= 2 && col <= 27, '格子列号越界: ' + col)
  }
  assert.ok(cells.some((c) => Number(c.style.gridColumn) === 2))
  assert.ok(cells.some((c) => Number(c.style.gridColumn) === 27))
})
test('今天之前的格子带 data-level，今天之后带 data-future', () => {
  const cells = root8.byClass('dsh-thm-cell')
  const future = cells.filter((c) => c.getAttribute('data-future') === '1')
  assert.equal(future.length, 6 - win8.todayRow)
  for (const c of future) assert.equal(c.getAttribute('data-level'), null)
  const past = cells.filter((c) => c.getAttribute('data-level') !== null)
  assert.equal(past.length, 182 - future.length)
  for (const c of past) {
    const lv = Number(c.getAttribute('data-level'))
    assert.ok(Number.isInteger(lv) && lv >= 0 && lv <= 4, 'data-level 越界: ' + lv)
  }
})
test('有量的那天拿到最高档（该数据集里 90M 是唯一活跃日）', () => {
  const todayCell = root8.byClass('dsh-thm-cell')
    .find((c) => c.style.gridColumn === '27' && c.style.gridRow === String(win8.todayRow + 1))
  assert.equal(todayCell.getAttribute('data-level'), '4')
  assert.ok(todayCell.getAttribute('title').includes('90,000,000'))
})
test('月标签列号与格子列号同一坐标系，且不越界', () => {
  const months = root8.byClass('dsh-thm-month')
  assert.ok(months.length >= 1)
  for (const m of months) {
    const col = Number(m.style.gridColumn)
    assert.ok(col >= 2 && col <= 27, '月标签列号越界: ' + col)
    assert.ok(api2.MONTH_KEYS_ZH.concat(api2.MONTH_KEYS_EN).includes(m.textContent), '月标签文案不认识: ' + m.textContent)
  }
  // 26 周跨度必然跨月：至少两个不同的月份标签
  assert.ok(new Set(months.map((m) => m.textContent)).size >= 2)
})
test('图例 5 个色块 + 6 个状态标签，灰色那一格归「无」而不是「少」', () => {
  const legend = root8.byClass('dsh-thm-legend')[0]
  const swatches = legend.byClass('dsh-thm-legendCell')
  assert.equal(swatches.length, 5)
  assert.equal(swatches[0].style.background, api2.LEVEL_EMPTY_COLOR, '第 1 格必须是空值格的中性灰')
  for (let i = 1; i < 5; i++) {
    assert.equal(swatches[i].style.background, api2.paletteLevelColor('purple', i))
  }
  // 文案序列：无 / 少 / 多；且「无」必须排在第一个灰块之前
  const labels = legend.children.filter((n) => !n.className.includes('legendCell')).map((n) => n.textContent)
  assert.deepEqual(labels, ['无', '少', '多'])
  assert.equal(legend.children[0].textContent, '无', '第一个子节点必须是「无」标签')
  assert.equal(legend.children[1].className, 'dsh-thm-legendCell', '「无」后面紧跟灰色块')
  // 「少」必须排在第 1 档用量块之后（否则读图的人会把灰色当成"少量"）
  const lessIndex = legend.children.findIndex((n) => n.textContent === '少')
  assert.equal(legend.children[lessIndex - 1].style.background, api2.paletteLevelColor('purple', 1))
})
test('顶部总用量 + 底部换算文案都渲染出来了', () => {
  const total = api2.formatTokenCount(model8.usage.totalTokens)
  assert.equal(total, '90M')
  const totalEl = root8.byClass('dsh-thm-total')[0]
  assert.ok(totalEl.textContent.includes('90M'), '总用量文案: ' + totalEl.textContent)
  const books = root8.byClass('dsh-thm-books')[0]
  assert.ok(books.textContent.includes('《红楼梦》'), '换算文案: ' + books.textContent)
  // 90,001,500 × 4 ÷ 730,000 ≈ 493 本
  assert.ok(books.textContent.includes('493 本'), '换算文案: ' + books.textContent)
})
test('5 个色阶 CSS 变量都写进了容器（含空值格）', () => {
  for (const v of ['--thm-l0', '--thm-l1', '--thm-l2', '--thm-l3', '--thm-l4']) {
    assert.ok(root8.style.props[v] && root8.style.props[v].length > 0, '缺变量 ' + v)
  }
  assert.equal(root8.style.props['--thm-l0'], api2.LEVEL_EMPTY_COLOR)
  assert.ok(root8.style.props['--thm-l4'].includes(api2.PALETTES.purple.base))
})
test('重复调用 renderHeatmap 是幂等的（整块重建，不留重复节点）', () => {
  const before = root8.descendants().length
  api2.renderHeatmap(root8, model8, null)
  assert.equal(root8.descendants().length, before)
  api2.renderHeatmap(root8, model8, null)
  assert.equal(root8.descendants().length, before)
  assert.equal(root8.byClass('dsh-thm-cell').length, 182)
})
test('空数据也渲染出完整 182 格，不抛异常', () => {
  const empty = api2.buildModel([], win8, 'green')
  const node = new StubNode('div')
  api2.renderHeatmap(node, empty, null)
  const cells = node.byClass('dsh-thm-cell')
  assert.equal(cells.length, 182)
  // 已发生的日子（含今天）全部落到 0 档；今天之后标 future、不带档位。
  const future = cells.filter((c) => c.getAttribute('data-future') === '1')
  assert.equal(future.length, 6 - win8.todayRow)
  for (const c of cells) {
    if (c.getAttribute('data-future') === '1') continue
    assert.equal(c.getAttribute('data-level'), '0', c.style.gridColumn + '/' + c.style.gridRow)
  }
  assert.ok(node.byClass('dsh-thm-books')[0].textContent.includes('0 本《红楼梦》'))
})
stub.restore()

group('9. 界面语言判定与标签表（缺陷 2）')
test('两套月份表都是 12 项，中文 1月..12月，英文 Jan..Dec', () => {
  assert.equal(api2.MONTH_KEYS_ZH.length, 12)
  assert.equal(api2.MONTH_KEYS_EN.length, 12)
  assert.equal(api2.MONTH_KEYS_ZH[0], '1月')
  assert.equal(api2.MONTH_KEYS_ZH[11], '12月')
  assert.deepEqual(api2.MONTH_KEYS_EN, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
})
test('两套星期表下标 = Date.getDay()：0 是周日、6 是周六', () => {
  assert.equal(api2.WEEKDAY_KEYS_ZH.length, 7)
  assert.equal(api2.WEEKDAY_KEYS_EN.length, 7)
  assert.equal(api2.WEEKDAY_KEYS_EN[0], 'Sun', 'row 0 是周日')
  assert.equal(api2.WEEKDAY_KEYS_EN[1], 'Mon', 'row 1 是周一')
  assert.equal(api2.WEEKDAY_KEYS_EN[3], 'Wed')
  assert.equal(api2.WEEKDAY_KEYS_EN[5], 'Fri')
  assert.equal(api2.WEEKDAY_KEYS_EN[6], 'Sat')
  assert.deepEqual(api2.WEEKDAY_KEYS_ZH.slice(1), ['一', '二', '三', '四', '五', '六'])
})
test('currentLang 读 <html lang>：zh / en / 读不到回退 zh', () => {
  const probe = (lang) => {
    globalThis.document = { documentElement: { lang }, createElement: () => ({}) }
    return api2.currentLang()
  }
  assert.equal(probe('zh-CN'), 'zh')
  assert.equal(probe('zh'), 'zh')
  assert.equal(probe('en-US'), 'en')
  assert.equal(probe('en'), 'en')
  assert.equal(probe(''), 'zh', '读不到必须回落 zh')
  assert.equal(probe(undefined), 'zh')
  delete globalThis.document
})
test('currentLang 无 document / 抛异常时不崩，回落 zh', () => {
  delete globalThis.document
  assert.equal(api2.currentLang(), 'zh')
  globalThis.document = { get documentElement() { throw new Error('boom') } }
  assert.equal(api2.currentLang(), 'zh', '取属性抛异常也必须回落')
  delete globalThis.document
})
test('labelTables 随语言切表', () => {
  globalThis.document = { documentElement: { lang: 'zh-CN' } }
  assert.equal(api2.labelTables().months[0], '1月')
  assert.equal(api2.labelTables().weekdays[1], '一')
  globalThis.document = { documentElement: { lang: 'en-US' } }
  assert.equal(api2.labelTables().months[0], 'Jan')
  assert.equal(api2.labelTables().weekdays[1], 'Mon')
  delete globalThis.document
})
test('英文界面下 renderHeatmap 渲染英文月/星期标签与英文文案', () => {
  globalThis.document = { documentElement: { lang: 'en-US' }, createElement: (tag) => new StubNode(tag) }
  const node = new StubNode('div')
  api2.renderHeatmap(node, model8, null)
  const months = node.byClass('dsh-thm-month')
  assert.ok(months.length >= 1)
  for (const m of months) {
    assert.ok(api2.MONTH_KEYS_EN.includes(m.textContent), '英文月标签不认识: ' + m.textContent)
    assert.ok(!/[月一-龥]/.test(m.textContent), '英文界面漏了中文月标签: ' + m.textContent)
  }
  const weekdays = node.byClass('dsh-thm-weekday')
  assert.deepEqual(weekdays.map((n) => n.textContent), ['', 'Mon', '', 'Wed', '', 'Fri', ''])
  // 热力图是 DOM 注入的，t 传 null → 走 makeText 回退词典，必须也是英文
  assert.equal(node.byClass('dsh-thm-title')[0].textContent, 'Usage heatmap')
  assert.ok(!/[一-龥]/.test(node.byClass('dsh-thm-sub')[0].textContent), '英文界面副标题仍是中文')
  assert.ok(!/[一-龥]/.test(node.byClass('dsh-thm-total')[0].textContent), '英文界面总用量仍是中文')
  const legendLabels = node.byClass('dsh-thm-legend')[0].children
    .filter((c) => !c.className.includes('legendCell')).map((c) => c.textContent)
  assert.deepEqual(legendLabels, ['None', 'Less', 'More'], '英文图例文案不对')
  const books = node.byClass('dsh-thm-books')[0].textContent
  assert.ok(books.startsWith('Your token usage equals'), '英文换算文案: ' + books)
  assert.ok(!/本/.test(books), '英文界面仍出现中文「本」: ' + books)
  delete globalThis.document
})
test('英文界面下 books.lineUnder 独立成句，不出现 "equals < 0.01 copies"', () => {
  globalThis.document = { documentElement: { lang: 'en-US' }, createElement: (tag) => new StubNode(tag) }
  const tiny = [{ sessionId: 'a', updatedAt: new Date(2026, 9, 9, 10).getTime(), projections: { values: { tokenUsage: { uncachedInputTokens: 100 } } } }]
  const node = new StubNode('div')
  api2.renderHeatmap(node, api2.buildModel(tiny, win8, 'green'), null)
  const books = node.byClass('dsh-thm-books')[0].textContent
  assert.equal(books, 'Your token usage is under 0.01 of a copy of 《红楼梦》')
  assert.ok(!books.includes('< 0.01'), '英文文案不该直接塞占位符')
  delete globalThis.document
})
test('中文界面下仍是 一/三/五 隔行标注（保留原判定）', () => {
  const wd = root8.byClass('dsh-thm-weekday')
  assert.deepEqual(wd.map((n) => n.textContent), ['', '一', '', '三', '', '五', ''])
})

group('9. cordis 服务契约：ctx.<服务> 读取必须在 exports.inject 里声明')
// 这条断言是为了让「cannot get property "X" without inject」这类**插件激活失败**
// 在自检阶段就被拦住，而不是等用户在 DSH 里看到崩溃/插件页报错才发现。
// cordis 的 ctx 是 Proxy：读未声明的服务名会抛（cordis/lib/index.js:676）。
const CLIENT_SRC = fs.readFileSync(CLIENT, 'utf8')

/** 去掉注释后再扫描，避免把注释里提到的 ctx.xxx 当成真实读取。 */
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')
}
const CODE_ONLY = stripJsComments(CLIENT_SRC)

test('inject 声明包含 slots / locale / remote / remote.session', () => {  for (const svc of ['slots', 'locale', 'remote', 'remote.session']) {
    assert.ok(loaded.inject.includes(svc), 'exports.inject 缺少 ' + svc)
  }
})

test('apply() 里读取的每个 ctx.<服务> 都在 inject 中声明', () => {
  const declared = new Set(loaded.inject)
  // ctx 上非服务属性：cordis 核心方法（effect 等），不算服务依赖
  const CORE = new Set(['effect', 'get', 'logger', 'setTimeout', 'emit', 'on', 'off', 'secrets', 'dispose'])
  const used = new Set()
  for (const m of CODE_ONLY.matchAll(/\bctx\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/g)) {
    const svc = m[1]
    if (CORE.has(svc.split('.')[0])) continue
    used.add(svc)
  }
  assert.ok(used.size > 0, '没扫到任何 ctx.<服务> 读取，扫描规则可能失效')
  const missing = [...used].filter((s) => !declared.has(s))
  assert.deepEqual(missing, [], '这些 ctx 读取未在 exports.inject 声明，会导致插件激活失败：' + missing.join(', '))
})

test('fetchSessions 用到的 remote.session.* 命名空间已声明', () => {
  assert.ok(loaded.inject.includes('remote.session'), '必须声明 remote.session')
  // 取数只用这两个 API，命名空间声明到位它们才存在
  assert.ok(/remote\.session\.list\(/.test(CODE_ONLY), 'fetchSessions 应调用 remote.session.list()')
})

group('10. 「打开设置」卡死回归：MutationObserver 自激必须收敛')
// 这组对应一次真实事故：装上插件后一点「设置」就主线程卡死。
// 根因链（由独立复核确认）：ensureData 在 await 之前同步写「正在读取…」→ 那个写触发
// 自己的 observer → 回调 → mountOnce → 又进 ensureData → 而 heat.items 在 RPC 返回前恒为
// null，TTL 守卫恒为假 → 每轮都写 → 无限自激。RPC 失败时是永久死循环。
//
// 之前的 dom-stub 根本没有 MutationObserver，所以这条路径**结构上测不到**。
// 现在桩按规范语义实现了 observer，并用 drainObservers 真跑到收敛或熔断。

/**
 * 搭一个最小「官方账号页 + 远端」环境，真实调用 apply → startHeatmap → mountOnce → ensureData。
 *
 * 关键点：**必须模拟官方 React 重建 section**。真实卡死要靠这个 ——
 * 官方每次重渲染都新建一棵 section 树，我们 appendChild 进去的外来容器随之被丢弃
 * （`container.parentNode` 变 null），于是 observer 回调里的「还挂着就早退」不成立，
 * 必然重新 mountOnce → 再次进 ensureData → 再次同步写 DOM → 再次触发 observer。
 * 只跑一次静态 section 的话，这条路径根本走不到（我第一版测试就栽在这：假绿）。
 *
 * @param opts.listOk     远端 session.list 是否成功
 * @param opts.listDelay  延迟多少个 macro task 才 resolve（模拟真实 RPC 往返）
 * @param opts.rebuild    官方是否重建 section；关掉它就退化成「静态页面」对照组
 * @param opts.rebuildEvery 每隔多少个 macro task 重建一次（模拟官方重渲染节律）
 */
async function runObserverScenario({ listOk, listDelay = 3, rebuild = true, rebuildEvery = 1, maxRounds = 60 }) {
  const { StubNode, drainObservers, StubMutationObserver } = await import('./dom-stub.mjs')
  const stub = installDomStub()

  let section = null
  const newSection = () => {
    const s = new StubNode('section')
    s.setAttribute('aria-label', '账号与余额')
    const card = new StubNode('div'); card.className = 'card'
    s.appendChild(card)
    return s
  }
  section = newSection()
  stub.root.appendChild(section)

  let listCalls = 0
  const remote = {
    session: {
      async list() {
        listCalls++
        for (let i = 0; i < listDelay; i++) await new Promise((r) => setTimeout(r, 0))
        return listOk ? { ok: true, value: { items: [] } } : { ok: false, error: 'boom' }
      },
      async projections() { return { ok: false, error: 'unused' } },
    },
  }

  // 真实调用 apply()：它会走 ctx.effect(() => startHeatmap(...))
  let disposed = null
  const ctx = {
    locale: { register: () => () => {} },
    slots: { inject: (_n, fn) => { fn() }, register: () => () => {} },
    remote,
    effect: (fn) => { const d = fn(); disposed = typeof d === 'function' ? d : null },
  }
  loaded.apply(ctx)

  // 官方重渲染节律：定期把 section 换成全新一棵（外来容器随之被丢弃）
  let ticks = 0
  const rebuilder = setInterval(() => {
    ticks++
    if (!rebuild || ticks % rebuildEvery !== 0) return
    if (section.parentNode !== null) section.parentNode.removeChild(section)
    section = newSection()
    stub.root.appendChild(section)
  }, 0)

  const drain = await drainObservers({ maxRounds })
  clearInterval(rebuilder)
  const observers = StubMutationObserver.instances.length
  const rebuilds = ticks
  if (disposed !== null) disposed()
  stub.restore()
  return { ...drain, listCalls, observers, rebuilds }
}

test('observer 语义桩本身有效：回调里写 DOM 会产生新变更（证明桩能复现自激条件）', async () => {
  const { StubNode, StubMutationObserver, drainObservers } = await import('./dom-stub.mjs')
  const stub = installDomStub()
  let calls = 0
  let box = null
  const obs = new StubMutationObserver(() => {
    calls++
    if (calls > 30) { obs.disconnect(); return }        // 熔断
    box.appendChild(new StubNode('i'))                 // 回调里写 DOM → 会再触发自己
  })
  obs.observe(stub.root, { childList: true, subtree: true })
  box = new StubNode('div')
  stub.root.appendChild(box)
  const r = await drainObservers({ maxRounds: 30 })
  stub.restore()
  assert.equal(r.converged, false, '这个桩若收敛，说明它复现不了自激，拿它验收修复是假的')
  assert.ok(calls > 20, '回调应被反复触发，实际 ' + calls)
})

test('端到端：真实 apply() 起手，取数恰好一次、observer 不自激', async () => {
  const r = await runObserverScenario({ listOk: true })
  assert.equal(r.converged, true, 'observer 循环不收敛，轮次=' + r.rounds)
  assert.equal(r.listCalls, 1, '取数被重复发起 ' + r.listCalls + ' 次')
})

// 这一组原本想用「桩里跑 observer 循环」来复现卡死，**实测证明那条路不可靠**：
// 我把 lib/client.js 还原成修复前的写法（ensureData 在 await 前写 loading、无 in-flight 去重），
// 这几条用例依然 74 项全绿 —— 因为真实死循环依赖「官方 React 重建 section」这一外部节律，
// 桩里模拟它就会变成我自己写的循环模拟器，测的是桩不是插件。
// 所以这里改成**代码结构断言**：卡死是结构问题（哪些函数写 DOM、闸门齐不齐），结构断言抓得住。

const SRC_LINES = CODE_ONLY.split('\n')
function srcOf(name) {
  const start = SRC_LINES.findIndex((l) => new RegExp('function\\s+' + name + '\\s*\\(').test(l))
  if (start < 0) return null
  let depth = 0
  let started = false
  const out = []
  for (let i = start; i < SRC_LINES.length; i++) {
    out.push(SRC_LINES[i])
    for (const ch of SRC_LINES[i]) {
      if (ch === '{') { depth++; started = true }
      else if (ch === '}') depth--
    }
    if (started && depth <= 0) break
  }
  return out.join('\n')
}

test('ensureData 声明了 in-flight 去重（唯一能让自激链排空的机制）', () => {
  const src = srcOf('ensureData')
  assert.ok(src !== null, '找不到 ensureData 函数')
  assert.ok(/heat\.inflight\s*!==\s*null/.test(src), '缺少 in-flight 判重：observer 回调会重复取数 → 自激')
  assert.ok(/heat\.inflight\s*=/.test(src), '从未给 inflight 赋值，去重是空壳')
})

/**
 * 找 ensureData 里「第一次 await 之前」真正会执行的顶层语句里有没有 DOM 写。
 *
 * 实现上不去精确做控制流分析，而是**保守地砍掉明显的回调体**：
 * 只要某一行属于「箭头函数体 / 普通对象字面量」内部就跳过 ——
 * 那类代码在 await 之前不会被执行。
 * 但 `const run = (async () => { … })()` 这个 IIFE 的**外层内容在 await 之前就会执行**，
 * 所以它的第一层不能砍（我曾把整层砍掉，断言就永远绿了 —— 自欺）。
 */
function topLevelDomWritesBeforeAwait(src) {
  const awaitAt = src.indexOf('await ')
  const head = src.slice(0, awaitAt)
  const hits = []
  let depth = 0
  let inRunBody = false
  for (const raw of head.split('\n')) {
    const line = raw.trim()
    // 进入 `const run = (async () => {` 的函数体：保留其内部（只把更深一层当回调砍掉）
    if (/\(async\s*\(\)\s*=>\s*\{/.test(line)) inRunBody = true
    // 记录深度：进入 `{` 之前的深度决定这一行属于哪一层
    if (inRunBody && depth >= 3) {
      depth += countBraces(line)
      continue
    }
    depth += countBraces(line)
    if (/\.(appendChild|removeChild)\s*\(/.test(line)) hits.push('appendChild/removeChild: ' + line)
    if (/render(Heatmap|Message)\s*\(/.test(line)) hits.push('render*: ' + line)
  }
  return hits
}
function countBraces(line) {
  let n = 0
  for (const ch of line) {
    if (ch === '{' || ch === '(' || ch === '[') n++
    else if (ch === '}' || ch === ')' || ch === ']') n--
  }
  return n
}

test('ensureData 不在 await 之前写 DOM（旧写法在 await 前同步写 loading 提示）', () => {
  const src = srcOf('ensureData')
  const awaitAt = src.indexOf('await ')
  assert.ok(awaitAt > 0, 'ensureData 里应有一个 await（RPC）')
  // 只看**会真正执行**的顶层语句；回调体（onPartial / progress.show）里的 DOM 写是安全的，
  // 算进来会误报，而误报久了就会有人把断言删掉 —— 那比误报更糟。
  const hits = topLevelDomWritesBeforeAwait(src)
  assert.deepEqual(hits, [], 'await 之前有 DOM 写：' + hits.join(' | '))
})

test('取数失败后进入退避，不会在每帧无限重试', () => {
  const src = srcOf('ensureData')
  assert.ok(/loadedOnce\s*=\s*true/.test(src), '失败分支未标记 loadedOnce')
  assert.ok(/failedUntil\s*=\s*Date\.now\(\)\s*\+\s*FETCH_FAIL_BACKOFF_MS/.test(src),
    '失败后未设置退避截止时间 → RPC 失败 = 永久死循环')
})

test('observer 回调里有三道闸门：自写标记 / 静默期 / 单帧次数上限', () => {
  const src = srcOf('startHeatmap')
  assert.ok(/heat\.selfWrite\s*>\s*0/.test(src), '缺少自写闸门：本插件自己的 DOM 写会触发自己')
  assert.ok(/cooldownUntil/.test(src), '缺少静默期闸门')
  assert.ok(/MAX_PASSES_PER_FRAME/.test(src), '缺少单帧挂载次数上限兜底')
  assert.ok(/contains\(\s*heat\.container\s*\)/.test(src),
    '缺少终止条件：容器还稳稳挂在当前锚点上时应当什么都不做')
})

test('所有自写 DOM 的调用点都包了 selfWrite()', () => {
  // 三个写点：mountOnce 的 appendChild、draw 的整块重建、ensureData 的错误提示
  const mount = srcOf('mountOnce')
  const draw = srcOf('draw')
  const ensure = srcOf('ensureData')
  assert.ok(/selfWrite\(\s*\(\)\s*=>\s*section\.appendChild/.test(mount), 'mountOnce 的 appendChild 未包 selfWrite')
  assert.ok(/selfWrite\(\s*\(\)\s*=>\s*renderHeatmap/.test(draw), 'draw 的整块重建未包 selfWrite')
  const writes = ensure.match(/renderMessage\(/g) || []
  const guarded = ensure.match(/selfWrite\([\s\S]{0,120}?renderMessage\(/g) || []
  assert.ok(writes.length === guarded.length,
    `ensureData 里有 ${writes.length} 处 renderMessage，只有 ${guarded.length} 处被 selfWrite 包住`)
})

test('挂载判据不能用 parentNode 单独判断（React 整棵替换 section 后会永久失联）', () => {
  const mount = srcOf('mountOnce')
  assert.ok(/section\.contains\(\s*heat\.container\s*\)/.test(mount),
    'mountOnce 必须用 section.contains(container) —— 只比 parentNode 会在 React 换掉整个 section 后永远失联')
  assert.ok(/isConnected/.test(mount), 'mountOnce 必须检查 isConnected，确认容器还在活动文档里')
})

test('observer 早退条件与 mountOnce 判据一致（同源错误，必须一起改）', () => {
  const src = srcOf('startHeatmap')
  assert.ok(/contains\(\s*heat\.container\s*\)/.test(src),
    'observer 回调的早退也必须用 contains()，否则永远不补挂')
  assert.ok(/isConnected/.test(src), 'observer 回调也必须检查 isConnected')
  assert.ok(!/heat\.container\.parentNode\s*!==\s*null\)\s*return/.test(src),
    'observer 里不应再用 parentNode !== null 早退 —— 这正是「渲染了却一直空白」的根因')
})

test('官方换掉整个 section 后，容器会被重新挂到新锚点上', async () => {
  // 这条直接复现真实 bug：React 重渲染整棵替换 <section>，容器跟着旧 section 成了孤儿
  // （parentNode 仍非 null，但 isConnected=false），旧判据因此永远不补挂 → 页面空白。
  const { StubNode, drainObservers, StubMutationObserver } = await import('./dom-stub.mjs')
  const stub = installDomStub()

  let section = new StubNode('section')
  section.setAttribute('aria-label', '账号与余额')
  stub.root.appendChild(section)

  let listCalls = 0
  const remote = {
    session: {
      async list() { listCalls++; return { ok: true, value: { items: [] } } },
      async projections() { return { ok: false, error: 'unused' } },
    },
  }
  let disposed = null
  loaded.apply({
    locale: { register: () => () => {} },
    slots: { inject: (_n, fn) => fn(), register: () => () => {} },
    remote,
    effect: (fn) => { const d = fn(); disposed = typeof d === 'function' ? d : null },
  })

  // 先让它稳定挂一次
  const first = stub.root.descendants().filter((n) => n.className === 'dsh-thm')
  assert.ok(first.length >= 1, '首次应已挂上容器')
  const container = first[0]
  assert.equal(container.isConnected, true, '首次挂载后应仍在文档里')

  // 模拟官方重渲染：**整棵替换** section —— 旧 section 直接从文档里消失，
  // 不走 removeChild（React 就是这么干的），我们挂在它下面的容器就成了孤儿。
  const orphan = section
  section = new StubNode('section')
  section.setAttribute('aria-label', '账号与余额')
  stub.root.appendChild(section)
  // 真机语义：旧 section 已不在文档树里，所以从 root 的 children 里摘掉它
  const idx = stub.root.children.indexOf(orphan)
  if (idx >= 0) stub.root.children.splice(idx, 1)
  orphan.parentNode = null

  assert.equal(container.isConnected, false, '换掉 section 后，旧容器应脱离文档（这正是真机现象）')
  assert.ok(container.parentNode !== null, '但 parentNode 仍是旧 section —— 所以旧判据会失效')

  // 给 observer 一轮投递机会；补挂走 setTimeout(0)，这里多排空几轮确保它跑完
  await drainObservers({ maxRounds: 12 })
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); await drainObservers({ maxRounds: 6 }) }

  if (container.isConnected !== true) {
    console.log('        [调试] observer 实例数=' + StubMutationObserver.instances.length +
      ' deliveries=' + StubMutationObserver.deliveries +
      ' pending=' + StubMutationObserver.pending +
      ' container.parentNode=' + (container.parentNode === null ? 'null' : container.parentNode.tagName) +
      ' section.contains=' + section.contains(container) +
      ' root.children=' + stub.root.children.length)
  }

  // appendChild 是**移动**语义：同一个 DOM 对象被搬到新 section 下了，
  // 所以要检查的还是 container 这个对象（不是「另找一个 .dsh-thm」）。
  assert.equal(container.isConnected, true, '重新挂载后应回到活动文档里')
  assert.equal(section.contains(container), true, '容器应挂在当前锚点上')
  assert.equal(orphan.contains(container), false, '不应还挂在被丢弃的旧 section 上')
  // 且当前文档树里只有一个热力图容器，不能重复
  const inDoc = stub.root.descendants().filter((n) => n.className === 'dsh-thm')
  assert.equal(inDoc.length, 1, '当前文档里应恰好一个热力图容器，实际 ' + inDoc.length)

  if (disposed !== null) disposed()
  stub.restore()
})

test('容器带 flex:none（否则在官方纵向 flex 里被压成 0 高，渲染了也看不见）', () => {
  assert.ok(/\.dsh-thm\{[^}]*flex:\s*none/.test(CODE_ONLY),
    '.dsh-thm 必须 flex:none —— 官方 section 是 flex-direction:column，会把本容器压塌成 0 高')
  assert.ok(/\.dsh-thm\{[^}]*width:\s*100%/.test(CODE_ONLY), '.dsh-thm 需要 width:100% 撑满面板')
})

test('容器有分隔线，与上方余额卡视觉分组', () => {
  assert.ok(/\.dsh-thm\{[^}]*border-top:/.test(CODE_ONLY),
    '建议有 border-top，否则热力图与余额卡糊在一起')
})

test('格子用 aspect-ratio 且有 min-height 兜底', () => {
  const m = /\.dsh-thm-cell\{([^}]*)\}/.exec(CODE_ONLY)
  assert.ok(m !== null, '找不到 .dsh-thm-cell 规则')
  assert.ok(/aspect-ratio:\s*1\s*\/\s*1/.test(m[1]), '格子应靠 aspect-ratio 跟随列宽')
  assert.ok(/min-height:/.test(m[1]), '格子应有 min-height 兜底，否则窄容器下会塌成 0')
})

test('stopHeatmap 复位 in-flight 状态，避免下一次启动被上一次的 Promise 卡住', () => {
  const src = srcOf('stopHeatmap')
  assert.ok(/heat\.inflight\s*=\s*null/.test(src), 'dispose 时未清 inflight')
  assert.ok(/heat\.loadedOnce\s*=\s*false/.test(src), 'dispose 时未复位 loadedOnce')
})

group('11. 配色持久化：读取兜底 / 写入一致性 / 导出导入')
// 这一组直接调用 lib/client.js 里真实的 paletteStore，不复制逻辑。
// 背景：官方 configForms / remote.settings 需要插件自己 import '@deepseek-ai/schemastery'
// 声明带 .volatile() 的 Config，而 Node 穿透 junction 按 realpath 解析，
// 静态 import 实测 ERR_MODULE_NOT_FOUND（fiber 会建不起来）。所以仍用 localStorage，
// 但必须做到「不会静默丢失」：写入先落盘后改内存 + 回读校验 + 可导出导入。

/** 装一个可控的 localStorage 桩。 */
function withStorage(options, fn) {
  const prev = globalThis.localStorage
  const store = options.initial ?? {}
  const spy = {
    writes: [],
    failWrite: options.failWrite ?? false,
    dropOnWrite: options.dropOnWrite ?? false,   // setItem 静默不生效
    throwOnGet: options.throwOnGet ?? false,
    throwOnSet: options.throwOnSet ?? false,
    getItem(k) {
      if (spy.throwOnGet) throw new Error('get boom')
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null
    },
    setItem(k, v) {
      if (spy.throwOnSet) throw new Error('set boom')
      spy.writes.push([k, v])
      if (spy.failWrite) return                    // 静默失败
      if (spy.dropOnWrite) return                  // 更隐蔽：调用成功但不生效
      store[k] = String(v)
    },
    removeItem(k) { delete store[k] },
  }
  globalThis.localStorage = spy
  try {
    fn(spy, store)
  } finally {
    if (prev === undefined) delete globalThis.localStorage
    else globalThis.localStorage = prev
  }
}

const PS = api2.paletteStore

test('未选过配色时回落默认色', () => {
  withStorage({}, () => {
    assert.equal(PS.load(), 'green')
  })
})

test('存储里是脏值时回落默认色，不把坏值带进 CSS', () => {
  withStorage({ initial: { 'dsh.tokenHeatmap.palette': 'chartreuse' } }, () => {
    assert.equal(PS.load(), 'green')
  })
})

test('合法值能被读回', () => {
  withStorage({ initial: { 'dsh.tokenHeatmap.palette': 'purple' } }, () => {
    assert.equal(PS.load(), 'purple')
  })
})

test('读取抛异常时回落默认色且不崩', () => {
  withStorage({ throwOnGet: true }, () => {
    assert.equal(PS.load(), 'green')
  })
})

test('set 先落盘再改内存：写入失败时内存不变（状态永不失配）', () => {
  withStorage({ throwOnSet: true }, () => {
    PS.load()
    const before = PS.get()
    PS.set('orange')
    assert.equal(PS.get(), before, '存储写失败却改了内存 → 下次启动会跳回去')
  })
})

test('setItem 静默失败（配额/隐私模式）时也能发现', () => {
  withStorage({ dropOnWrite: true }, () => {
    PS.load()
    const before = PS.get()
    PS.set('red')
    assert.equal(PS.get(), before, 'setItem 没生效却当成成功')
    assert.equal(PS.storageOk, false, '应标记存储不可用')
  })
})

test('写入成功时内存与存储一致', () => {
  withStorage({}, (spy, store) => {
    PS.load()
    PS.set('blue')
    assert.equal(PS.get(), 'blue')
    assert.equal(store['dsh.tokenHeatmap.palette'], 'blue')
    assert.deepEqual(spy.writes.at(-1), ['dsh.tokenHeatmap.palette', 'blue'])
  })
})

test('导出文本是合法 JSON 且含当前色', () => {
  withStorage({}, () => {
    PS.load()
    PS.set('cyan')
    const parsed = JSON.parse(PS.exportText())
    assert.equal(parsed.palette, 'cyan')
    assert.equal(parsed.version, 1)
  })
})

test('导出 → 换环境 → 导入，配色能完整恢复', () => {
  let saved = ''
  withStorage({}, () => {
    PS.load()
    PS.set('purple')
    saved = PS.exportText()
  })
  withStorage({}, () => {
    PS.load()
    assert.equal(PS.get(), 'green', '新环境应是默认色')
    const r = PS.importText(saved)
    assert.equal(r.ok, true, '导入应成功：' + r.reason)
    assert.equal(PS.get(), 'purple', '导入后应恢复成原配色')
  })
})

test('导入坏输入一律拒绝且不动现有状态', () => {
  const cases = ['', '   ', 'not json', '{', '[]', '{"palette":"chartreuse"}', '{"palette":123}', 'null']
  for (const bad of cases) {
    withStorage({}, () => {
      PS.load()
      PS.set('orange')
      const r = PS.importText(bad)
      assert.equal(r.ok, false, '应拒绝：' + JSON.stringify(bad))
      assert.equal(PS.get(), 'orange', '拒绝后配色不应被改动：' + JSON.stringify(bad))
    })
  }
})

test('订阅者收到变更通知，且 unsubscribe 后不再收到', () => {
  withStorage({}, () => {
    PS.load()
    const seen = []
    const off = PS.subscribe((v) => seen.push(v))
    PS.set('blue')
    off()
    PS.set('red')
    assert.deepEqual(seen, ['blue'], '退订后不该再收到通知')
  })
})

test('设置行提供导出/导入按钮（否则用户没法保住选择）', () => {
  const zhDict = /\n\s*'palette\.export':\s*'导出'/.test(CLIENT_SRC)
  assert.ok(zhDict, '缺 palette.export 文案')
  assert.ok(/\n\s*'palette\.import':\s*'导入'/.test(CLIENT_SRC), '缺 palette.import 文案')
  assert.ok(/paletteStore\.exportText\(\)/.test(CODE_ONLY), 'PaletteRow 未调用 exportText')
  assert.ok(/paletteStore\.importText\(/.test(CODE_ONLY), 'PaletteRow 未调用 importText')
  assert.ok(/\.dsh-thm-ioBtn/.test(CODE_ONLY), '缺导入导出按钮样式')
})

// ── 汇总 ─────────────────────────────────────────────────────────────────────
// 先把异步用例跑完（串行），再汇总。
for (const [name, fn] of pending) {
  try {
    await fn()
    passed++
    console.log('  PASS  ' + name)
  } catch (error) {
    failed++
    failures.push({ name, error })
    console.log('  FAIL  ' + name)
    console.log('        ' + (error && error.message ? String(error.message).split('\n').join('\n        ') : String(error)))
  }
}

console.log('\n' + '='.repeat(60))
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项，共 ' + (passed + failed) + ' 项')
if (failed > 0) {
  console.log('\n失败明细：')
  for (const f of failures) console.log('  - ' + f.name)
  process.exit(1)
}
console.log('全部通过 ✅')
process.exit(0)