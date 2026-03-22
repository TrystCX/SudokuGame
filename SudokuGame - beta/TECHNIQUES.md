# 技巧分级与支持情况

本项目将数独技巧分为 5 档：入门、简单、中等、困难、极限。

## 已支持（按分级）

| 分级 | 技巧（标准名） | 备注 |
|---|---|---|
| 入门 | 单元格唯一法（Full House） | 行/列/宫仅剩 1 个空格 |
| 入门 | 摒除法（Hidden Single） | 行/列/宫某数字只出现 1 次 |
| 入门 | Direct Pointing / Direct Claiming | 区块摒除后直接导出摒除 |
| 入门 | Direct Hidden Pair | 隐性数对后直接导出摒除 |
| 入门 | 余数法（Naked Single） | 单格只剩 1 个合法候选 |
| 简单 | Direct Hidden Triplet | 隐性三数组后直接导出摒除 |
| 简单 | 区块摒除（Locked Candidates） | 宫内指向 / 行列指向 |
| 简单 | 显性数对 / 显性三数组 / 显性四数组（Naked Subsets） | 依赖候选笔记进行排除 |
| 中等 | 隐性数对 / 隐性三数组 / 隐性四数组（Hidden Subsets） | 依赖候选笔记进行排除 |
| 中等 | X-Wing | 2×2 基础鱼 |
| 中等 | 剑鱼（Swordfish） | 3×3 鱼 |
| 中等 | 水母（Jellyfish） | 4×4 鱼 |
| 困难 | 涡轮鱼（Turbot Fish） | 统一覆盖：摩天楼 / 双强链 / 空矩形 |
| 困难 | XY-Wing | 三格翼技巧 |
| 困难 | XYZ-Wing | XY-Wing 进阶 |
| 困难 | W-Wing | 利用数对 + 强链进行删减 |
| 极限 | X-Chain（单数字 AIC） | 当前为单数字链 |
| 极限 | 3 强链鱼（3 Strong-linked Fishes） | 3SL：三条强链 + 弱链接力 |
| 极限 | 4 强链鱼（4 Strong-Linked Fishes） | 4SL：四条强链 + 弱链接力 |
| 极限 | 5 强链鱼（5 Strong-Linked Fishes） | 5SL：五条强链 + 弱链接力 |
| 极限 | 6 强链鱼（6 Strong-Linked Fishes） | 6SL：六条强链 + 弱链接力 |
| 极限 | 7 强链鱼（7 Strong-Linked Fishes） | 7SL：七条强链 + 弱链接力 |
| 极限 | 8 强链鱼（8 Strong-Linked Fishes） | 8SL：八条强链 + 弱链接力 |
| 极限 | BUG（Bivalue Universal Grave） | BUG+1：双值墓穴的三候选格强制填数 |
| 极限 | APE（Aligned Pair Exclusion） | 对齐双值格组合排除 |
| 极限 | ATE（Aligned Triplet Exclusion） | 对齐三格组合排除 |
| 极限 | WXYZ-Wing | 四格翼结构排除 |
| 极限 | VWXYZ-Wing | 五格翼结构排除 |
| 极限 | Nishio（反证强制链） | 假设候选并推演，矛盾则否定 |
| 极限 | X-Cycle（Nice Loop） | 单数字闭环；支持红红/蓝蓝冲突与环外删减 |
| 极限 | XY-Cycle（Nice Loop） | 双值格闭环；支持交叉覆盖删减 |
| 极限 | 唯一矩形（Unique Rectangle） | 当前实现 Type 1 |
| 极限 | 单格强制（Forcing Cell） | 当前实现单格 forcing 救援推理 |

## 笔记策略（当前实现）

| 规则 | 行为 |
|---|---|
| 不依赖笔记的技巧 | 直接作为提示给出（入门类填数提示优先） |
| 依赖笔记的技巧 | 若笔记为空或过少，会提示“先记笔记 / 补全笔记” |
| 擦除提示后的体验 | 执行一次“擦除候选”后，会抑制再次催记笔记，直到下一次填数 |
| 笔记冲突 | 检测到笔记与盘面合法候选冲突时，会提示修正/重建笔记 |

## 待开发（未支持）

| 分级（建议） | 技巧（标准名） | 说明 |
|---|---|---|
| 极限 | 更完整的 AIC / Nice Loops | X-Cycle/XY-Cycle 以外的闭环与更强删减 |
| 极限 | 3D Medusa | 强弱链染色与矛盾检测 |
| 极限 | 更强的 Forcing Chains | 多分支链、矛盾树、区域级 forcing |
| 中等/困难 | Remote Pairs | 双值链（易理解、适合教学） |
