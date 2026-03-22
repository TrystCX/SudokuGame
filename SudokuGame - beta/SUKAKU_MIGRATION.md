# SukakuExplainer 对齐与迁移路线

本项目希望将提示系统的“技巧清单、命名、难度排序与算法实现”逐步对齐到 `SukakuExplainer-master`（Sudoku Explainer）。

## 重要前提：许可证与“直接搬代码”的边界

`SukakuExplainer-master` 采用 LGPL v2.1（仓库内已包含 `LICENSE`）。若要“直接抄代码/翻译代码”并发布到本项目：

- 必须保留版权与许可证声明
- 必须满足 LGPL 对可替换/可重链接/源码提供等要求（尤其是把其代码并入前端 JS bundle 时，等价于静态链接，合规要求更严格）

建议采用两条合规路线之一：

1) **算法对齐但不直接搬代码**：以 Sukaku 的技巧定义/评分/输出格式作为规范，逐条重写（非逐行翻译），并用 Sukaku 作为“对拍基准”验证结果
2) **保留 Sukaku 为独立引擎模块**：将 Sukaku 作为可替换组件独立运行（例如本地 Java/服务端/CLI），通过 JSON 协议输出 Hint，再由前端渲染（LGPL 组件保持可替换）

## 难度对齐（Sukaku 评分 → 本项目五档）

Sukaku 使用 `Rule.getDifficulty()` 的浮点评分（例：4.3）。本项目 UI 采用五档：入门/简单/中等/困难/极限。

建议映射（可后续微调）：

| Sukaku difficulty | 本项目档位 |
|---:|---|
| < 2.4 | 入门 |
| 2.4 – 3.4 | 简单 |
| 3.5 – 4.2 | 中等 |
| 4.3 – 5.4 | 困难 |
| ≥ 5.5 | 极限 |

## 技巧清单对齐（以 Sukaku 为准）

下表以 `diuf.sudoku.SolvingTechnique` 为“总清单来源”，并对照当前项目状态。

说明：
- “Sukaku 名称”来自 `SolvingTechnique.toString()`
- “状态”以当前 `SudokuGame/app.js` 是否存在对应实现为准

| Sukaku 名称 | 本项目标准名（建议） | 档位 | 状态 |
|---|---|---|---|
| Hidden Single | 摒除法（Hidden Single） | 入门 | 已支持 |
| Direct Pointing | 区块摒除（宫内指向 / Direct Pointing） | 简单 | 规划：与区块摒除统一名/拆分文案 |
| Direct Hidden Pair | 隐性数对（Direct Hidden Pair） | 简单/中等 | 规划：与隐性数对统一名/拆分文案 |
| Naked Single | 余数法（Naked Single） | 入门 | 已支持 |
| Direct Hidden Triplet | 隐性三数组（Direct Hidden Triplet） | 中等 | 规划：与隐性三数组统一名/拆分文案 |
| Pointing & Claiming | 区块摒除（Locked Candidates） | 简单 | 已支持 |
| Naked Pair | 显性数对（Naked Pair） | 简单 | 已支持 |
| X-Wing | X-Wing | 中等 | 已支持 |
| Hidden Pair | 隐性数对（Hidden Pair） | 中等 | 已支持 |
| Naked Triplet | 显性三数组（Naked Triplet） | 中等 | 已支持 |
| Swordfish | 剑鱼（Swordfish） | 中等 | 已支持 |
| Hidden Triplet | 隐性三数组（Hidden Triplet） | 中等 | 已支持 |
| Scraper, Kite, Turbot | 涡轮鱼（Turbot Fish） | 困难 | 已支持（统一引擎覆盖摩天楼/双强链/空矩形） |
| XY-Wing | XY-Wing | 困难 | 已支持 |
| XYZ-Wing | XYZ-Wing | 困难 | 已支持 |
| WXYZ-Wing | WXYZ-Wing | 极限 | 已支持 |
| Unique Rectangle / Loop | 唯一矩形/唯一环（UR/UL） | 困难/极限 | 部分支持（UR Type 1） |
| Naked Quad | 显性四数组（Naked Quad） | 困难 | 已支持 |
| Jellyfish | 水母（Jellyfish） | 困难 | 已支持 |
| Hidden Quad | 隐性四数组（Hidden Quad） | 困难 | 已支持 |
| 3 Strong-linked Fishes | 3 强链鱼（3 Strong-linked Fishes） | 极限 | 已支持（3SL 链式删减） |
| 4 Strong-Linked Fishes | 4 强链鱼（4 Strong-Linked Fishes） | 极限 | 已支持（4SL 链式删减） |
| 5 Strong-Linked Fishes | 5 强链鱼（5 Strong-Linked Fishes） | 极限 | 已支持（5SL 链式删减） |
| 6 Strong-Linked Fishes | 6 强链鱼（6 Strong-Linked Fishes） | 极限 | 已支持（6SL 链式删减） |
| 7 Strong-Linked Fishes | 7 强链鱼（7 Strong-Linked Fishes） | 极限 | 已支持（7SL 链式删减） |
| 8 Strong-Linked Fishes | 8 强链鱼（8 Strong-Linked Fishes） | 极限 | 已支持（8SL 链式删减） |
| VWXYZ-Wing | VWXYZ-Wing | 极限 | 已支持 |
| Bivalue Universal Grave | BUG（Bivalue Universal Grave） | 极限 | 已支持（BUG+1 三候选格强制填数） |
| Aligned Pair Exclusion | APE（Aligned Pair Exclusion） | 极限 | 已支持（基底对组合排除删减） |
| UVWXYZ-Wing | UVWXYZ-Wing | 极限 | 未支持 |
| Forcing Chains & Cycles | 强制链/循环（Forcing Chains & Cycles） | 极限 | 部分支持（单格强制、X-Cycle、XY-Cycle） |
| Aligned Triplet Exclusion | ATE（Aligned Triplet Exclusion） | 极限 | 已支持（基底三格组合排除删减） |
| Nishio Forcing Chains | Nishio | 极限 | 部分支持（候选反证：含同行列宫与单元唯一推演） |
| Multiple Forcing Chains | 多重强制链 | 极限 | 未支持 |
| Dynamic Forcing Chains | 动态强制链 | 极限 | 未支持 |
| Dynamic Forcing Chains (+) | 动态强制链（+） | 极限 | 未支持 |
| Nested Forcing Chains | 嵌套强制链 | 极限 | 未支持 |

## 逐步迁移建议（每次迭代可交付）

1) **建立“Hint 协议”对齐层**：将本项目的 Hint 对象字段统一到 “tech + difficulty + highlights + links + eliminations/fills”
2) **建立 Sukaku 对拍脚本**：对同一盘面，输出 Sukaku 的下一条/所有提示，与本项目提示进行差异对比（用于回归）
3) **按清单分组替换实现**：
   - 入门/简单（单元格唯一、摒除、余数、区块摒除、数对）优先保证一致
   - 中等（隐藏数组、鱼）其次
   - 困难/极限（TurbotFish 族、UR/Loops、BUG、APE/ATE、Forcing chains）最后
