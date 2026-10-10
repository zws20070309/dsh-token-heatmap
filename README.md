# dsh-token-heatmap

> 在 DSH（DeepSeek Harness）的「设置 → 账号与余额」页面下半部分，加一张最近 **26 周**的
> token 用量热力图。GitHub 贡献图风格，浅色系，越深代表当天用量越多。

![license](https://img.shields.io/badge/license-MIT-blue) ![dsh](https://img.shields.io/badge/DSH-0.2.0--rc.2-8A2BE2)

- **不重画官方页面**：账号与余额的上半部分完全保留官方渲染，本插件只在自己的容器里画图
- **只统计 token，不折算价格**
- **单位按 M / B**：不用 `Intl` compact（它在中文 locale 下输出「万/亿」，与「多少 M、多了多少 B」冲突）
- **不引入任何依赖、无构建步骤**：源码即运行物，克隆下来就能用

---

## 效果

```
设置 → 账号与余额 → 页面下半部分

┌──────────────────────────────────────────────┐
│ 用量热力图                          10.3B tokens│  ← 总用量
│ 最近 26 周（周日起）每日 token 用量             │
│                                               │
│     七月   八月  九月  十月  十一月  十二月    │  ← 月份标签
│  一 ▢▢▢▣▣▢▢▢▢▢ ▢▢▢▣▣▣▣▣▢▢ …                │
│  三 ▢▢▣▣▣▣▣▣▣▢▢ ▢▣▣▣▣▣▣▣▢▢ …                │  ← 26 列 × 7 行 = 182 格
│  五 ▢▢▢▢▢▢▣▣▣▣▢ ▢▢▢▣▣▣▣▣▢▢ …                │
│                                               │
│  无 ▨▨ 少 ▨▨▨ 多                              │  ← 图例
│  您的 token 用量相当于 4.2 本《红楼梦》        │  ← 名著换算
└──────────────────────────────────────────────┘
```

---

## 安装

```powershell
git clone https://github.com/zws20070309/dsh-token-heatmap.git
```

### 方式 A：插件管理器（推荐）

在 DSH 的「设置 → 内置插件 / 插件市场」里搜索本仓库包名并安装。

> **不要手工改 `~/.dsh/profiles/<profile>/package.json`。**
> DSH 的插件管理器会按自己的登记表重写该文件，手工塞进去的条目会在下次启动时被清掉
> （插件因此不会被加载）。

### 方式 B：junction 安装（开发调试）

```powershell
# 1. 把仓库挂到 plugins 目录
New-Item -ItemType Junction `
  -Path "$HOME\.dsh\plugins\dsh-token-heatmap" `
  -Target "<你克隆本仓库的目录>"

# 2. 挂到 profile 的 node_modules
New-Item -ItemType Directory -Force -Path "$HOME\.dsh\profiles\desktop\node_modules\@dsh-community"
New-Item -ItemType Junction `
  -Path "$HOME\.dsh\profiles\desktop\node_modules\@dsh-community\dsh-token-heatmap" `
  -Target "$HOME\.dsh\plugins\dsh-token-heatmap"
```

然后把包名加进 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 数组，
**完全退出 DSH 再重开**（DSH 没有 HMR）。

装好后进入「设置 → 账号与余额」即可看到热力图。

> **未登录（没有 DeepSeek 凭据）时热力图不出现，这是预期行为**：
> 官方账号页本身只在 `credential-stored` 时才注册。

---

## 功能

| 功能 | 说明 |
|---|---|
| 26 周热力图 | 182 格（26 列 × 7 行），周日起始，末列为本周 |
| 总用量 | 图上方显示**全部会话**的 token 总和（不限 26 周窗口） |
| 5 档色阶 | 分位数分档（活跃日的中位 / 75 / 90 分位），不是固定阈值 |
| 6 种浅色系 | 绿 / 蓝 / 青 / 紫 / 橙 / 红，可在通用设置里切换 |
| 名著换算 | 图下方「相当于 N 本《某某名著》」 |
| 导出 / 导入配色 | 清缓存或换机器后可一键恢复配色 |

### 为什么用分位数分档

重度用户一天几十万 token，轻度用户一天几百。固定阈值没法同时伺候这两类人，
所以按**活跃日**（用量 > 0 的天）取中位 / 75 / 90 分位来切 4 档。

> ⚠️ 空值格**刻意不用 surface token**：浅色主题下 surface 等于页面底色，会让空白月隐形。
> 这里用「墨色 6% 混页面底色」的中性灰。

### token → 名著的换算口径

**1 token ≈ 4 字符**（与官方 `dsh-token-meter` 的固定启发式一致）。
本数 = token 总数 × 4 ÷ 该书汉字数。本数小于 1 时如实显示小数，不会显示成 0。

> ⚠️ 书的名字数是**业界常引的量级值，不是权威统计**。不同版本、繁简、是否计标点、
> 是否含回目附录，差异可达 ±10%。这里只用来给一个「量级感」，**不要当真值引用**。

| 书 | 字数 | 说明 |
|---|---|---|
| 红楼梦（曹雪芹） | 730,000 | 展示基准书 |
| 西游记（吴承恩） | 820,000 | 量级值 |
| 三国演义（罗贯中） | 940,000 | 量级值 |
| 水浒传（施耐庵） | 1,000,000 | 量级值 |

外国名著按**词数**计，与汉字数不是同一种单位，仅列作参考，不参与换算。

### 统计口径（重要）

官方 token 投影是**会话级累计**，没有逐日时间戳。所以本插件的做法是：

> 把一个会话的全部累计 token，记到它的「最后提问那天」一格。**不是**摊到它活跃的每一天。

要真正做到逐日精确，只能自己读会话日志做 fold —— 代价和风险都大得多，本插件不做。

---

## 配色

「设置 → 通用」里有一行「热力图配色」，6 种浅色系：
**绿（默认）/ 蓝 / 青 / 紫 / 橙 / 红**。

每色 5 档：**0 = 当日无用量**，1–4 是同一主色按 18% / 38% / 62% / 100% 混进页面底色，
**越深代表当天 token 用量越多**。混底色（而不是写死色值）是为了跟随 DSH 的浅色 / 深色主题。

### 配色存在哪，为什么不用官方 settings

配色存 **localStorage**，并在设置行提供「导出 / 导入」两个按钮。

官方通用设置行走 `ctx.configForms` / `ctx.remote.settings.mutate()`，但宿主端 `write()`
有两道硬门（`@deepseek-ai/dsh-settings/lib/index.js:501-507`）：

- `:504` `No configurable plugin entry "<ns>"` —— 条目必须导出 `Config` schema；
- `:506` `Plugin entry "<ns>" has no volatile fields` —— 字段必须带 `.volatile()`。

而写出那份 `Config` 必须能加载 `@deepseek-ai/schemastery`。**三条路都实测不通**：

| 尝试 | 结果 |
|---|---|
| 静态 `import '@deepseek-ai/schemastery'` | `ERR_MODULE_NOT_FOUND` |
| `createRequire(import.meta.url)` 动态 require | `MODULE_NOT_FOUND` |
| 从 profile 的解析链 require | 能解析，但插件代码不经过那条链 |

根因：Node 穿透 junction 按 **realpath** 解析模块入口，插件入口落在**仓库目录**里，
从那里到不了 `~/.dsh/profiles/node_modules/@deepseek-ai/`。
**静态 import 失败 = fiber 建不起来 = 整个插件连热力图一起消失**，为一行配色冒这个险不划算。

localStorage 侧做了加固，做到「不会静默丢失」：

| 风险 | 处理 |
|---|---|
| 存储里是脏值 | 读取时校验，回落默认色并 `console.warn`，**绝不把坏值带进 CSS** |
| 写入失败却先改了内存 | 顺序改成「**先落盘成功、再改内存**」，状态永不失配 |
| `setItem` 静默不生效 | 写入后**回读校验**，不一致就当失败并告警 |
| 清缓存 / 换机器 | 设置行提供**导出 / 导入** |

---

## 数据来源

全部走 DSH 宿主服务，**不自己扫会话日志、不发任何外部请求**。

| 项 | 来源 |
|---|---|
| 会话列表 + token 投影 | `ctx.remote.session.list({})`，一次拿全量 |
| 投影兜底 | `ctx.remote.session.projections({ sessionId })`，仅当某项缺投影时并发补查 |
| 四桶字段 | `uncachedInputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` |

四个桶**互斥**，reasoning token 已含在 `outputTokens` 内，**不重复累加**。

> 性能：冷会话常不被 `list()` 带上投影。补查用**固定 8 个 worker 并发**（不是串行 `await`），
> 并且 `list()` 一返回就**先渲染已有数据**，补查期间界面不空着，增量重绘按 120ms 节流。

---

## 开发

```powershell
node tests/selftest.mjs
```

96 项断言，分 11 组：单位阈值表、26 周几何、分位数分档、每日分桶（含跨月/跨年/跨时区）、
名著换算、配色档位、脏输入与不变量、渲染出的 DOM 结构、cordis 服务契约、
「打开设置」卡死与不可见的回归、配色持久化。全绿 exit 0，有失败 exit 1。

它**真实加载** `lib/client.js`（用最小 `__ModuleLoader__` 桩跑那条顶层语句），
再从它导出的 `__testInternals` 上取函数来断言 —— 测的是运行物本身，不是复制的算法。
`tests/dom-stub.mjs` 是最小 DOM 桩，**实现了 MutationObserver 的规范语义**，
所以 observer 相关路径能被真实跑到。

> 每条回归断言都做过**反向验证**：把代码改回修复前的写法，自检确实 exit 1。
> 一条永远绿的断言等于没有断言。

### 架构笔记

这个插件只有浏览器半。宿主入口（`lib/index.js`）是个空壳，唯一作用是让 cordis 建出 fiber，
从而让 `dsh-client-modules` 扫到 `dsh.client` 声明并把 client bundle 发给浏览器。

浏览器半里两处非平凡的设计，都在源码注释里写清了「为什么」：

1. **DOM 注入而不是槽位挂载** —— 官方账号页没有任何子槽位（该包的 6 处 `slots.register`
   全部枚举在案，无 `children` 声明），所以只能把容器 appendChild 到官方 `<section>` 末尾。
   补挂判据必须用 `contains()` + `isConnected`，**只比 `parentNode` 会永久失联**：
   React 重渲染会整棵替换 `<section>`，容器跟着旧 section 成了孤儿节点。

2. **自激防护** —— observer 监听整个文档子树，所以插件自己的每条 `childList` 变更都会回调自己。
   `ensureData` **刻意不在 `await` 之前写任何 DOM**，并用 in-flight 去重让微任务链能排空。
   这两条都是踩过「点设置直接卡死」之后定下的。

---

## 已知限制

- **统计口径**：会话级累计记到「最后提问那天」，不是逐日精确（见上文「统计口径」）
- **名著字数**：业界常引量级值，非权威统计，版本差异可达 ±10%
- **配色持久化**：localStorage 而非官方 settings（三条路实测不通，见上文），
  但提供导出 / 导入兜底
- **未登录时不可见**：官方账号页只在 `credential-stored` 时注册

---

## 致谢

- 热力图的分位数色阶与周数几何参考了 [webxiaobaiyu-droid/dsh-local-usage](https://github.com/webxiaobaiyu-droid/dsh-local-usage)
  的公开实现，尤其是「空值格不要用 surface token」那条踩坑经验
- token 四桶的互斥语义来自官方 `@deepseek-ai/dsh-token-meter`

---

## License

MIT
