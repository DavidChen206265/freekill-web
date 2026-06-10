# 部署 FreeKill Web 到 VPS(Docker Compose)

> 目标:Linux VPS + 域名,Docker Compose 一键起全栈,Caddy 自动 HTTPS。
> 包集合:仅 `freekill-core`(基础身份局)。

## 架构

```
浏览器 ──HTTPS/WSS── caddy(:443) ──┬── 静态 web 文件 (/srv)
                                    └── /ws 反代 ── gateway(:9528) ──TCP── asio(:9527)
```

四个容器(见 `docker-compose.yml`):
- **asio** — C++ 游戏服务端(规则/房间/战绩)。仅内网,不对外暴露端口。
- **gateway** — Node 网关,WSS↔asio TCP 桥接。仅内网。
- **caddy** — 唯一公网入口:HTTPS + 托管静态 web + 反代 `/ws`。
- 数据卷:`asio-server`(账号/战绩/RSA 密钥)、`caddy-data`(证书)。

## 前置条件

1. **Linux VPS**,装好 Docker + Docker Compose v2(`docker compose version`)。
2. **一个域名**,A/AAAA 记录指向 VPS 公网 IP。
3. VPS 防火墙放行 **80 + 443**(TCP;443 也放 UDP 给 HTTP/3,可选)。
4. 把**整个仓库**(`E:/Games/freekill/` 对应的目录树:`freekill-asio/`、`freekill-web/`、`FreeKill-release/`、`FreeKill-sourcecode/`)传到 VPS。
   - `FreeKill-release/packages/` 有 1.5GB,但 `.dockerignore` 只放行 `freekill-core` + `packages.db` + `init.sql` + `standard`/`standard_cards`/`maneuvering` 的 `image/`+`audio/`。**传之前可只传这些**(其余 packages 不需要),能省大量上传。
   - `freekill-web/node_modules`、`freekill-asio/build/`、`分析/`、`audit/`、`freekill-web-spike/` 都不需要传(`.dockerignore` 已排除)。
   - **音频/动画资源(M4 切片 V)**:web 的 `sync-fk-assets` 在镜像内从 `FreeKill-sourcecode/audio`+`image/anim` 和各包 `audio/`+`image/anim/` 生成音效与精灵帧。**这些目录必须随仓库传到 VPS**,否则构建出的 web 无声音、无技能/出牌精灵动画(浏览器静默 404)。
   - **`.dockerignore` 必须在构建上下文根**(= `freekill-web` 的上一级,即 `E:/Games/freekill/`)。仓库里 `git pull` 拿不到它(它在 freekill-web 之外)。本仓库存了一份权威副本 `freekill-web/docker/dockerignore.repo-root`——**每次 `git pull` 后把它复制到上下文根**:
     ```bash
     cp freekill-web/docker/dockerignore.repo-root .dockerignore
     ```
     (老的 `.dockerignore` 会漏掉 audio/anim → 这正是"服务器没声音"的根因。)

## 部署步骤

```bash
# 1. 进入 compose 目录
cd freekill-web/docker

# 2. 设域名并构建+启动(首次构建 asio 要编译 C++,几分钟)
FK_DOMAIN=play.example.com docker compose up -d --build

# 3. 看日志确认三服务起来
docker compose logs -f          # Ctrl+C 退出
#   asio    → "server is ready to listen on [::]:9527"
#   gateway → "[ws-bridge] listening on ws://localhost:9528 -> asio asio:9527"
#   caddy   → 自动申请证书(看到 certificate obtained)

# 4. 浏览器打开 https://play.example.com
#    登录框默认网关地址应是 wss://play.example.com/ws(同源,自动填好)
```

把 `FK_DOMAIN` 写进 `.env`(同目录)可省去每次输入:
```bash
echo "FK_DOMAIN=play.example.com" > .env
docker compose up -d --build
```

## 验收

- 注册/登录(首次任意密码自动注册)。
- 建房 → 加机器人补满 → 开始 → 跑一局。
- 刷新页面 → 自动重连恢复对局(不被 AI 接管)、战报恢复。

## 常用运维

```bash
docker compose ps                      # 状态
docker compose logs asio --tail 50     # 单服务日志
docker compose restart gateway         # 重启某服务
docker compose down                    # 停(保留数据卷)
docker compose up -d --build           # 改动后重新构建
# 给 asio 发 CLI 命令(如查看已装包):
docker compose exec asio sh -c 'echo pkgs > /tmp/fk-asio.cmds'   # 输出在 asio 日志里
```

数据备份:`docker volume` 里的 `freekill-web_asio-server`(`users.db`/`game.db`/`rsa`)。
```bash
docker run --rm -v freekill-web_asio-server:/s -v "$PWD":/b alpine \
  tar czf /b/asio-server-backup.tgz -C /s .
```

## 已知限制 / 注意

- **仅 freekill-core**:gateway 的 `FK_MD5` 默认值正好匹配 freekill-core。**若以后加扩展包**,asio 的 flist MD5 会变,握手会被拒——届时需重算 MD5 并在 compose 的 `gateway.environment.FK_MD5` 填新值(或等 M5 的 `computeFlistMd5` 生成器)。
- **登录凭据**:浏览器把账号密码明文存 localStorage(R-CRED,为无感重连)。公网生产前建议评估;后续会换 session token。
- **asio 防退临时封禁**:`tempBanTime: 20`(分钟)——中途退出运行中的游戏会临时封禁该 IP。多人同 NAT 出口共享 IP 时注意(可在 `freekill.server.config.json` 调小或设 0)。
- **单 asio 进程**:不可横向伸缩(R-SCALE),先单服;容量靠 `config.capacity` + 压测定上限。
- **首次 asio 启动**会在 `asio-server` 卷里生成 `users.db`/`game.db`/RSA 密钥。**不要删这个卷**,否则账号和服务器身份(RSA)全丢。

## 改了代码后重新部署

```bash
cd freekill-web/docker
docker compose up -d --build        # 只重建有变化的镜像层
```
web/gateway 改动重建快;asio 改动会重新编译 C++。
