// token 用量热力图 —— 宿主入口（host plane）
//
// 这个插件**只有浏览器半**：一个挂到官方账号页的热力图 + 通用设置里的一行配色选择。
// 没有服务端路由、没有 host 侧状态、没有配置文件。但宿主入口仍然必须存在，
// 原因是源码写死的机制，不是惯例：
//
//   * `dsh-client-modules` 的扫描器是**跟着 cordis 的 fiber 走的**
//     （dsh-client-modules/lib/index.js:114-116
//       「Every cordis `internal/plugin` emission (fiber construction/disposal)
//         marks the fiber's entry name dirty」）。
//     它 resolveMeta 的入口参数是 **Loader 条目名**，也就是
//     「cordis 真的 import 过这个包、真的建了 fiber」。
//   * `dsh.profile.bundles` 里列一个包名 → cordis 按 cordis.patch.yml 建一行配置 →
//     import 该包 → 建 fiber → client-modules 才会发现它的 `dsh.client` 声明并把
//     client bundle 发到浏览器。没有这一步，浏览器侧永远看不到这个插件。
//
// 至于 host 半本身做什么：`resolveMeta` 只校验 `exports["./client"]`，完全不看 host 半
// 导出了什么。所以本文件是个空壳，只为让 fiber 建起来。
//
// ⚠️ 这里**刻意不 export const Config**。原因不是省事，是实测结论（见 README「配色存哪」）：
//   官方的 `ctx.configForms` 持久化要求插件导出 schemastery Config 且字段带 `.volatile()`
//   （dsh-settings/lib/index.js:501-507 会抛 `Plugin entry "X" has no volatile fields`）。
//   而写出那份 Config 必须 `import '@deepseek-ai/schemastery'`。**实测三条路都不通**：
//     1. 静态 import → ERR_MODULE_NOT_FOUND
//     2. createRequire(import.meta.url) 动态 require → MODULE_NOT_FOUND
//     3. 从 profile 的解析链 require → 能解析，但插件代码不经过那条链
//   根因：Node 穿透 junction 按 **realpath** 解析模块入口，插件入口落在仓库目录里，
//   从那里到不了 ~/.dsh/profiles/node_modules/@deepseek-ai/。
//   静态 import 失败 = fiber 建不起来 = 整个插件连热力图一起消失，风险远大于收益。
//   所以配色走 localStorage，理由写在 lib/client.js 的 PALETTE 存储段。
export const name = '@dsh-community/dsh-token-heatmap'

/**
 * 宿主依赖。**刻意为空**：本插件不需要 webServer / settings / agentTeams 任何一个。
 * 空数组在 cordis 的 `Inject.resolve` 下等价于「无依赖」，cordis 立刻 apply。
 */
export const inject = []

/**
 * 宿主平面无事可做。
 *
 * 唯一作用是让 cordis 建出这个 fiber，从而让 `dsh-client-modules` 扫到本包的
 * `dsh.client` 声明。不要在这里加任何逻辑 —— 加了就是给一张热力图凭空引入宿主侧故障面。
 */
export function apply() {}