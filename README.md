# Carrot-CN - Codeforces 评分预测器（中文版）

基于 [Carrot](https://github.com/meooow25/carrot) 浏览器扩展改编的 Tampermonkey 用户脚本，为 Codeforces 排行榜添加评分变化预测功能。

爱来自神秘 AI。

## 功能特点

### 对于正在进行中的比赛
- **当前表现分**：显示使分数变化为零的评分值
- **预测分数变化**：根据当前排名实时计算评分变化
- **升级所需分数**：显示升级到下一个等级所需的分数

### 对于已结束的比赛
- **最终表现分**：显示最终的表现分值
- **最终分数变化**：显示实际的评分变化
- **等级变化**：显示等级变化情况（如 N → P）

## 安装方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → 添加新脚本
3. 将 `carrot-cn.user.js` 文件的内容复制粘贴到编辑器中
4. 按 Ctrl+S 保存脚本

## 使用方法

1. 打开任意 Codeforces 比赛的排行榜页面（URL 包含 `/contest/xxx/standings`）
2. 脚本会自动运行，在排行榜右侧添加三列新数据
3. 点击 Tampermonkey 菜单中的 "Carrot-CN 设置" 可以自定义显示哪些列

## 算法说明

本脚本使用快速傅里叶变换（FFT）进行卷积计算，实现了 Codeforces 评分算法的高效计算：

- 评分计算基于 Mike Mirzayanov 发布的算法
- 使用 FFT 将时间复杂度从 O(n²) 降低到 O(n log n)
- 支持实时计算大规模比赛的评分变化

## 等级系统

| 等级 | 缩写 | 分数范围 |
|------|------|----------|
| 新手 | N | < 1200 |
| 学徒 | P | 1200 - 1399 |
| 专家 | S | 1400 - 1599 |
| 行家 | E | 1600 - 1899 |
| 候选大师 | CM | 1900 - 2099 |
| 大师 | M | 2100 - 2299 |
| 国际大师 | IM | 2300 - 2399 |
| 宗师 | GM | 2400 - 2599 |
| 国际宗师 | IGM | 2600 - 2999 |
| 传奇宗师 | LGM | 3000 - 3999 |
| 旅行者 | T | ≥ 4000 |

## 设置选项

点击 Tampermonkey 菜单中的 "Carrot-CN 设置" 可以配置：

- 启用/禁用预测分数变化
- 启用/禁用最终分数变化
- 显示/隐藏各数据列

## 技术细节

- 使用 Codeforces API 获取比赛数据
- 本地缓存 API 响应以提高性能
- 支持教育场（Educational Round）的特殊规则
- 自动识别非积分赛（unrated contests）

## 许可证

MIT License - 与原项目相同

## 故障排除

### 脚本没有运行

1. **检查浏览器控制台**：按 F12 打开开发者工具，查看 Console 标签页中是否有 `[Carrot-CN]` 开头的日志
2. **检查 Tampermonkey 菜单**：点击 Tampermonkey 图标，确认 "Carrot-CN 设置" 选项存在
3. **检查页面 URL**：确保你在排行榜页面（URL 包含 `/contest/xxx/standings`）
4. **检查脚本是否启用**：在 Tampermonkey 仪表板中确认脚本已启用

### 常见问题

**Q: 为什么显示 "API 请求失败"？**
A: Codeforces API 可能暂时不可用，或者请求被 Cloudflare 拦截。请刷新页面重试。

**Q: 为什么显示 "非积分赛"？**
A: 脚本会自动检测非积分赛（如愚人节比赛、团队赛等），这些比赛不会显示评分变化。

**Q: 为什么预测结果和实际结果有差异？**
A: 预测基于当前排名计算，实际评分变化可能因系统调整而略有不同。

## 与原版 Carrot 的区别

| 功能 | 原版 Carrot | Carrot-CN |
|------|------------|-----------|
| 安装方式 | 浏览器扩展 | Tampermonkey 脚本 |
| API 调用 | Background script | 页面内 fetch |
| 缓存 | 扩展存储 | Tampermonkey 存储 |
| 界面语言 | 英文 | 中文 |

## 致谢

- 原作者：[Soumik Sarkar](https://github.com/meooow25)
- 原项目：[Carrot](https://github.com/meooow25/carrot)
- 评分算法基于 [TLE](https://github.com/cheran-senthil/TLE) 项目
