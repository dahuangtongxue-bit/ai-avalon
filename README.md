# 阿瓦隆 · AI 谋略局 🛡️⚔️

六大国产 AI(智谱 / DeepSeek / 千问 / Kimi / 豆包 / MiniMax)自动玩《阿瓦隆》:6 个 AI 随机分到正/反两方,**正方完成任务、反方潜伏破坏**,看哪个模型最会潜伏、最会识破、最会在关键时刻刺中梅林。带**任务进度板**、**身份揭晓**、**赛季积分**、**赛后解说**,为短视频内容录制设计。

**与你们「谁是卧底 / 狼人杀 / 海龟汤」同栈**:Next.js(App Router + Edge),后端复用同一个**与游戏无关的代理** `route.js`(一字未改),环境变量也是同一套 `PLAYER_N`。

---

## 🎮 玩法机制(忠于经典 6 人局)

- **身份**:正方 4(梅林、派西维尔、2 名亚瑟的忠臣)vs 反方 2(莫甘娜、刺客)。
  - 梅林知道谁是反方(但不知道谁是刺客),且必须藏好自己;
  - 派西维尔看到"梅林和莫甘娜两人之一",但分不清;
  - 莫甘娜在派西维尔眼里伪装成梅林;反方互相认识。
- **回合**:队长提名若干人上场 → 全员公开投票(并行,阿瓦隆本就是同时亮票)→ 通过则上场者秘密出"成功/失败"(正方只能成功,反方可破坏)。
- **胜负**:正方先完成 3 个任务获胜;反方让 3 个任务失败、或连续 5 次否决拖垮正方即胜;**正方即便完成 3 次,刺客仍有最后一次机会指认梅林,猜中则反方逆转**。
- **赛季积分**:每局结束累计各模型战绩(正/反胜率),存在浏览器本地。

---

## 🚀 部署到 Netlify

1. 推到 GitHub。
2. Netlify → **Add new project → Import an existing project** → 选这个仓库,Next.js 运行时自动识别构建。
3. **Site settings → Environment variables → Import**,把 `.env.example` 内容粘进去改成真实值导入(`SECRETS_SCAN_ENABLED=false` 已在 `netlify.toml` 默认关掉)。
4. **Deploy**,打开站点点"开始对局"。

> 本地:`npm install` → `npm run dev`(根目录建 `.env.local` 放 `PLAYER_N_*`)。

---

## 🔑 环境变量(PLAYER_N,和狼人杀同款,直接复用)

| 变量 | 说明 |
|---|---|
| `PLAYER_{N}_BASE_URL` | OpenAI 兼容根地址 |
| `PLAYER_{N}_API_KEY` | 密钥 |
| `PLAYER_{N}_MODEL` | 模型串,如 `deepseek-chat` / `glm-5.1` / `MiniMax-M3` |
| `PLAYER_{N}_DISPLAY_NAME` | 后端用;前端显示名走 `SLOT_NAMES` |
| `ACCESS_PASSWORD` | 可选;设了则前端要输密码 |
| `SECRETS_SCAN_ENABLED` | `false`,避免密钥误报导致部署失败 |

阿瓦隆固定 **6 人一局,必须配齐 PLAYER_1~6**。完整样例见 `.env.example`。

---

## 🇨🇳🆚🌍 中外对抗(后续)

当前是方案 A:**6 个国产模型正常对局,身份随机分配跟国籍无关,"中外对抗"体现在赛季积分和解说上**。

将来把其中几个 `PLAYER_N` 换成 GPT / Claude / Gemini(用你自己的海外 API 账号),前端会自动识别国籍——赛季积分面板会切换成**按中外阵营汇总**,解说也能顺势带"国产 vs 海外"叙事。引擎不用改。

> 槽位→显示名/国籍写死在 `components/Avalon.jsx` 顶部的 `SLOT_NAMES` 和 `NATION`,接入海外模型时改这两处即可。

---

## 🧩 改人设

`components/Avalon.jsx` 顶部 `ROSTER_STYLE`(按显示名匹配配色与人设)。人设影响该模型的提名/投票/潜伏风格——这是节目看点。

---

## 📁 目录结构

```
ai-avalon/
├── package.json
├── next.config.js
├── netlify.toml
├── .env.example
├── app/
│   ├── layout.js
│   ├── page.js
│   ├── globals.css                # 暗色 + 蓝(正)/红(反)主题
│   └── api/avalon/route.js        # ★ 复用你们的通用代理(一字未改)
└── components/
    └── Avalon.jsx                 # 阿瓦隆对局编排 + Prompt + 渲染
```
