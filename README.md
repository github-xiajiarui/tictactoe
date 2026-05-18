# 🎮 井字棋 · 双人终端对战

> 两个玩家各自打开一个终端，连接同一台服务器，在终端里实时下井字棋。

---

## 快速开始（本地测试）

```bash
# 1. 安装依赖
cd server && npm install && cd ..
cd client && npm install && cd ..

# 2. 启动服务器（终端 1）
node server/index.js

# 3. 启动玩家 1 客户端（终端 2）
node client/index.js

# 4. 启动玩家 2 客户端（终端 3）
node client/index.js
```

**操作流程：**

| 步骤 | 玩家 1 | 玩家 2 |
|------|--------|--------|
| ① | 按 `1` → 创建房间 | 按 `2` → 输入玩家 1 的房间号 → Enter |
| ② | 等待对手加入 | 加入成功后自动开始 |
| ③ | 轮到你的回合时用 ↑↓←→ 移动光标，Space/Enter 落子 | 同理 |
| ④ | 游戏结束后按 `r` 重新开始，`q` 退出 | — |

---

## 目录结构

```
tictactoe/
├── server/
│   ├── index.js      # WebSocket 服务器入口
│   ├── game.js       # 纯游戏逻辑（无副作用）
│   ├── rooms.js      # 房间管理与玩家生命周期
│   └── package.json
├── client/
│   ├── index.js      # 终端客户端（ANSI 渲染 + 键盘输入）
│   └── package.json
├── .github/workflows/deploy.yml   # CI/CD → Fly.io
├── fly.toml           # Fly.io 部署配置
├── Procfile           # 进程类型声明
├── .gitignore
└── README.md
```

---

## 部署到 Render.com（推荐 · 零 CLI）

[Render.com](https://render.com) 的免费套餐原生支持 WebSocket，且**不需要安装任何命令行工具**。

### 部署步骤（全程在浏览器操作，约 2 分钟）

| 步骤 | 操作 |
|------|------|
| ① | 打开 [render.com](https://dashboard.render.com) 并注册/登录 |
| ② | 点击右上角 **New +** → **Blueprint** |
| ③ | 选择 **Connect a repository** → 连接 `github-xiajiarui/tictactoe` |
| ④ | Render 会自动读取 `render.yaml` → 点击 **Apply** |
| ⑤ | 等待部署完成（约 2 分钟） |

部署完成后，Render 会显示你的服务 URL，类似：
```
https://tictactoe-server.onrender.com
```

### 客户端连接

```bash
node client/index.js --server wss://tictactoe-server.onrender.com
```

### 可选：部署到 Fly.io

如果希望使用 Fly.io，需要先安装 [flyctl](https://fly.io/docs/hands-on/install-flyctl/)，然后：

```bash
flyctl launch --generate-name --no-deploy
# 编辑 fly.toml 中的 app 名称
flyctl deploy
node client/index.js --server wss://你的应用名.fly.dev
```

---

## 架构设计

```
 Player-1 (Terminal)          Player-2 (Terminal)
       │                            │
       │  WebSocket                  │  WebSocket
       │  wss://server.fly.dev       │  wss://server.fly.dev
       ▼                            ▼
  ┌───────────────────────────────────────┐
  │            Game Server                │
  │  ┌─────────┐   ┌───────────────────┐  │
  │  │ rooms.js │──▶    rooms Map      │  │
  │  └─────────┘   │ {roomId → Room}   │  │
  │  ┌─────────┐   │                   │  │
  │  │ game.js │──▶│ board, turn,      │  │
  │  └─────────┘   │ 2 players, phase  │  │
  │                └───────────────────┘  │
  └───────────────────────────────────────┘
```

**核心设计原则：**
- **服务端权威仲裁** — 所有游戏逻辑在 `game.js` 中执行，客户端只负责输入采集和渲染，防作弊
- **纯函数游戏逻辑** — `game.js` 无副作用，输入棋盘+落子 → 输出新棋盘，便于测试
- **短房间号** — 6 位字母数字（去掉了易混淆的 0/O、1/I），方便口头传递

---

## 协议

### 客户端 → 服务端

| 类型 | 字段 | 说明 |
|------|------|------|
| `create_room` | — | 创建新房间 |
| `join_room` | `roomId: string` | 加入指定房间 |
| `move` | `position: 0-8` | 在指定格落子 |
| `restart` | — | 重新开始本局 |

### 服务端 → 客户端

| 类型 | 字段 | 说明 |
|------|------|------|
| `room_created` | `roomId, playerId` | 房间已创建 |
| `room_joined` | `roomId, playerId` | 已加入房间 |
| `game_start` | `board, turn, you` | 游戏开始 |
| `state` | `board, turn, phase, winner, isDraw` | 状态更新 |
| `opponent_left` | `message` | 对手离开 |
| `error` | `message` | 错误信息 |

---

## 本地开发

```bash
# 安装依赖
cd server && npm install
cd client && npm install

# 开发模式（自动重启）
cd server && npm run dev

# 在两个终端分别启动客户端
node client/index.js
node client/index.js
```

---

## License

MIT
