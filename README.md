# dsh-token-heatmap

> 一眼看尽你在 DeepSeek Harness 上烧了多少 token。

在 DSH 的「设置 → 账号与余额」页面下半部分，挂一张 **GitHub 贡献图风格**的 token 用量热力图。
最近 **26 周**，每天一格，越深代表当天用得越多。

**`10.3B` tokens 相当于多少本《红楼梦》？** —— 图下方直接告诉你。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2-8A2BE2.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![No dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![Tests](https://img.shields.io/badge/self--tests-96%20passing-brightgreen.svg)](tests/selftest.mjs)

---

## ✨ 它长什么样

```
设置 → 账号与余额 → 页面下半部分

┌─────────────────────────────────────────────────────┐
│  用量热力图                              10.3B tokens │  ← 全部会话总用量
│  最近 26 周（周日起）每日 token 用量                   │
│                                                       │
│      七月    八月    九月    十月   十一月   十二月     │
│   一  ▢▢▢▣▣▢▢▢▢▢   ▢▢▢▣▣▣▣▣▢▢  …                   │
│   三  ▢▢▣▣▣▣▣▣▣▢▢   ▢▣▣▣▣▣▣▣▢▢  …                   │  ← 26 列 × 7 行
│   五  ▢▢▢▢▢▢▣▣▣▣▢   ▢▢▢▣▣▣▣▣▣▣▢  …                   │
│                                                       │
│   无  ▨ ▨   少  ▨ ▨ ▨   多                            │  ← 图例
│   您的 token 用量相当于 56.3 本《红楼梦》               │  ← 名著换算
└─────────────────────────────────────────────────────┘
```

账号、余额、充值按钮 —— **上半部分一行没动**，全部是官方原样渲染。
插件只在自己的容器里画图。

---

## 🚀 装上只要三步

**1. 装插件**

在 DSH 的「设置 → 内置插件」里搜索 `@dsh-community/dsh-token-heatmap` 并安装。

> 想从源码装？见 [从源码安装](#-从源码安装开发调试)。

**2. 完全退出 DSH 再重开**（托盘图标也要退，DSH 没有 HMR）

**3. 打开「设置 → 账号与余额」** —— 热力图就在页面下半部分

> ℹ️ **没登录就看不到热力图**，这是预期行为：官方账号页本身只在登录后才注册。
> 先登录你的 DeepSeek 账号。

---

## 💡 为什么做这个插件

DSH 告诉你**余额还剩多少**，但不告诉你**这些钱是怎么花掉的**：

- 今天比昨天用得多还是少？
- 这半个月是不是突然上量了？
- 半年的 token 到底烧了多少？

把"余额"换成"趋势"，一眼就有答案。

---

## 🎨 功能

| | 功能 | 说明 |
|---|---|---|
| 🗓️ | **26 周热力图** | 182 格（26 列 × 7 行），周日起始，末列为本周 |
| 📊 | **总用量** | 图上方显示**全部会话**的 token 总和（不限 26 周） |
| 🌡️ | **5 档色阶** | 按活跃日分位数分档，不是固定阈值 —— 重度/轻度用户都适用 |
| 🎨 | **6 种浅色系** | 绿 / 蓝 / 青 / 紫 / 橙 / 红，在「设置 → 通用」里切换 |
| 📚 | **名著换算** | 图下方「相当于 N 本《红楼梦》」，把抽象数字变可感 |
| 💾 | **导出 / 导入配色** | 清缓存或换机器后一键恢复 |

### 只统计 token，不折算价格

这个插件**不碰钱**。它只回答"用了多少"，不回答"花了多少钱"——
价格会变、会分模型、分缓存命中，而 token 数是客观事实。

单位按 `M` / `B` 走（`1M`、`10.3B`），**刻意不用** `Intl` compact ——
它在中文环境下输出「万/亿」，和「多少 M、多了多少 B」是两套语言。

### 色阶为什么用分位数

重度用户一天几十万 token，轻度用户一天几百。固定阈值没法同时伺候这两类人。

所以按**活跃日**（用量 > 0 的天）取中位 / 75 / 90 分位来切 4 档：
你的用量的深浅，永远相对于**你自己的历史**。

> ⚠️ 空值格刻意不用 surface token：浅色主题下 surface 等于页面底色，会让空白月直接隐形。
> 这里用「墨色 6% 混页面底色」的中性灰。

### 「相当于 N 本《红楼梦》」怎么算的

**1 token ≈ 4 字符**（与官方 `dsh-token-meter` 的固定启发式一致）：

```
本数 = token 总数 × 4 ÷ 该书汉字数
```

本数小于 1 时如实显示小数，不会显示成 0 本。

| 书 | 字数 | 说明 |
|---|---|---|
| 红楼梦（曹雪芹） | 730,000 | 展示基准书 |
| 西游记（吴承恩） | 820,000 | 参考 |
| 三国演义（罗贯中） | 940,000 | 参考 |
| 水浒传（施耐庵） | 1,000,000 | 参考 |

外国名著按**词数**计，与汉字数不是同一种单位，仅列作参考，不参与换算。

> ⚠️ 这些字数是**业界常引的量级值，不是权威统计**。不同版本、繁简、是否计标点、
> 是否含回目附录，差异可达 ±10%。它只负责给你一个「量级感」，**不是学术引用**。

---

## 📦 从源码安装（开发调试）

```powershell
git clone https://github.com/zws20070309/dsh-token-heatmap.git

# 1. 挂到 plugins 目录
New-Item -ItemType Junction `
  -Path "$HOME\.dsh\plugins\dsh-token-heatmap" `
  -Target "<你克隆本仓库的目录>"

# 2. 挂到 profile 的 node_modules
New-Item -ItemType Directory -Force -Path "$HOME\.dsh\profiles\desktop\node_modules\@dsh-community"
New-Item -ItemType Junction `
  -Path "$HOME\.dsh\profiles\desktop\node_modules\@dsh-community\dsh-token-heatmap" `
  -Target "$HOME\.dsh\plugins\dsh-token-heatmap"
```

然后把 `@dsh-community/dsh-token-heatmap` 加进
`~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 数组，重启 DSH。

> ⚠️ **日常使用请不要手工改 `package.json`。** DSH 的插件管理器会按自己的登记表重写它，
> 手工塞进去的条目会在下次启动时被清掉（插件因此不加载）。

---

## 🔌 数据从哪来

全部走 DSH 宿主服务，**不扫会话日志、不发任何外部请求、不需要任何 API key**。

| 项 | 来源 |
|---|---|
| 会话列表 + token 投影 | `ctx.remote.session.list({})`，一次拿全量 |
| 投影兜底 | `ctx.remote.session.projections({ sessionId })`，仅当某项缺投影时**并发**补查 |
| 四桶字段 | `uncachedInputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` |

四个桶**互斥**，reasoning token 已含在 `outputTokens` 内，所以**不重复累加**。

> **性能**：冷会话常不被 `list()` 带上投影。补查用固定 8 个 worker 并发（不是串行 `await`），
> 而且 `list()` 一返回就**先把图画出来**，补查期间界面不空着。

### 统计口径（请务必读这条）

官方 token 投影是**会话级累计**，没有逐日时间戳。所以本插件的做法是：

> 把一个会话的全部累计 token，记到它的「最后提问那天」一格。
> **不是**摊到它活跃的每一天。

要做到真正的逐日精确，只能自己读会话日志做 fold —— 代价和风险都大得多，本插件不做。
这是口径选择，不是 bug。

---

## 🛠️ 开发

```powershell
node tests/selftest.mjs
```

**96 项断言，全绿 exit 0**，覆盖：单位阈值表、26 周几何、分位数分档、每日分桶
（含跨月/跨年/跨时区）、名著换算、配色档位、脏输入不变量、渲染出的 DOM 结构、
cordis 服务契约、配色持久化，以及两条**回归测试**。

它**真实加载** `lib/client.js`（用最小 `__ModuleLoader__` 桩跑那条顶层语句），
再从 `__testInternals` 上取函数来断言 —— 测的是运行物本身，不是复制的算法。
`tests/dom-stub.mjs` 这个 DOM 桩实现了 **MutationObserver 的规范语义**，
所以 observer 相关路径能被真实跑到。

### 那两条回归测试防的是什么

这是插件历史上真实踩过的坑，都在源码注释里写清了「为什么」：

**① 点「设置」直接卡死**

`ensureData` 曾在 `await` 之前同步写 loading 提示。那个 DOM 写触发了插件自己的
MutationObserver → 回调 → 又进 `ensureData`，而数据在 RPC 返回前恒为 null、
TTL 守卫生效不了 → **无限自激，主线程占满**。

现在：**刻意不在 `await` 之前写任何 DOM**，并用 in-flight 去重让微任务链能排空。

**② 热力图渲染成功却看不见**

补挂判据曾只比 `parentNode`。但 React 重渲染会**整棵替换** `<section>` 元素，
我们的容器跟着旧 section 成了孤儿节点，而 `parentNode` 仍然非 null → 永远不补挂。

现在：判据用 `contains()` + `isConnected`。

> 每条回归断言都做过**反向验证**：把代码改回修复前的写法，自检确实 exit 1。
> 一条永远绿的断言等于没有断言。

---

## ⚠️ 已知限制

| 限制 | 说明 |
|---|---|
| 统计口径 | 会话级累计记到「最后提问那天」，不是逐日精确（见上文） |
| 名著字数 | 业界常引量级值，非权威统计，版本差异 ±10% |
| 配色持久化 | 存 localStorage 而非官方 settings，但提供导出/导入兜底（见下文） |
| 未登录不可见 | 官方账号页只在 `credential-stored` 时注册 |

### 为什么配色不走官方 settings

官方通用设置行走 `ctx.configForms` / `ctx.remote.settings.mutate()`，但宿主端 `write()`
有两道硬门（`@deepseek-ai/dsh-settings/lib/index.js:501-507`）：条目必须导出带
`.volatile()` 字段的 schemastery `Config`。而写出那份 `Config` 必须能加载
`@deepseek-ai/schemastery` —— **本机三条路都实测不通**（静态 import、`createRequire`、
profile 解析链）。根因是 Node 穿透 junction 按 realpath 解析入口。
**静态 import 失败 = fiber 建不起来 = 整个插件连热力图一起消失**，为一行配色不值当。

所以用 localStorage，但做了加固：读取校验脏值、写入先落盘后改内存、`setItem` 后回读校验，
并提供导出 / 导入兜底。

---

## 🙏 致谢

- 热力图的分位数色阶参考了 [webxiaobaiyu-droid/dsh-local-usage](https://github.com/webxiaobaiyu-droid/dsh-local-usage)
  的公开实现，尤其是「空值格不要用 surface token」那条踩坑经验
- token 四桶的互斥语义来自官方 `@deepseek-ai/dsh-token-meter`

---

## 📄 License

[MIT](LICENSE) © 2026 dsh-token-heatmap contributors
