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

## 部署到 Fly.io（生产环境）

### 前置条件

1. 注册 [Fly.io](https://fly.io) 账号
2. 安装 [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
3. 登录: `flyctl auth login`

### 第一步：创建 Fly 应用

```bash
cd tictactoe
flyctl launch --generate-name --no-deploy
```

这会生成一个 `fly.toml`（项目已自带，但 `app` 名需要更新）。

编辑 `fly.toml`，将 `app` 改为刚才创建的应用名：

```toml
app = "你的应用名"   # 例如 app = "tictactoe-2p-1234"
```

### 第二步：手动部署一次

```bash
flyctl deploy
```

部署完成后查看状态：

```bash
flyctl status
```

你会看到类似 `https://tictactoe-2p-1234.fly.dev` 的地址。

### 第三步：配置 GitHub Actions（自动部署）

1. 在 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 点击 **New repository secret**
3. Name: `FLY_API_TOKEN`
4. Value: 运行以下命令获取

```bash
flyctl auth token
```

然后复制粘贴到 GitHub 的 secret 中。

之后每次 `git push` 到 `main` 分支，GitHub Actions 会自动重新部署。

### 第四步：客户端连接远程服务器

```bash
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
