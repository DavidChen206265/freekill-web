# VPS 部署更新指南(W0 + W1-1 之后)

> 给 VPS 上的 Claude Code:本次更新**服务端换成了 Web-only fork** + 一批客户端修复。
> 不是普通的 `git pull && up -d`——asio 的**构建源、配置、镜像都变了**,必须重建。
> 全程只在部署目录(放 `docker-compose.yml` 的那个 `freekill-web/docker/`)操作。

## 这次变了什么(为什么不能只 pull)

1. **asio 构建源**:`asio.Dockerfile` 现在从 **`freekill-web-asio/`**(我们维护的 Web-only fork)编译,**不再用** `freekill-asio/`。所以 VPS 上必须有 `freekill-web-asio/` 这个目录(新仓库)。
2. **服务端配置**:`docker/freekill.server.config.json` 新增 4 个 Web-only 开关(`webOnly`/`checkClientMd5:false`/`invalidateRoomsOnPackageChange:false`/`tempBanByIp:false`)——跳过 MD5 登录、改包不踢房、不按 IP 封禁。
3. **不再需要 FK_MD5**:`docker-compose.yml` 去掉了 FK_MD5 主流程(asio 现在忽略客户端 MD5)。
4. **客户端**:登录页、加载页、Photo 势力 icon、BGM/音效、计时器/牌堆数、同账号顶号等一批修复。
5. **`.dockerignore` 变了**:放行 `freekill-web-asio/`、排除其 `build/`+`packages/` 和只读的 `freekill-asio/`。

## 仓库准备(关键:多了一个新仓库)

服务端 fork 在独立仓库:`https://github.com/DavidChen206265/freekill-web-asio`
主仓:`https://github.com/DavidChen206265/freekill-web`

VPS 上的目录树应是(都在同一个父目录,比如 `~/freekill/`):
```
freekill/
  freekill-web/            # 主仓(web + gateway + docker + 计划)
  freekill-web-asio/       # 服务端 fork(asio 镜像从这里编译)  ← 本次新增/必须有
  FreeKill-release/        # 上游包(freekill-core + 美术/音频)
  FreeKill-sourcecode/     # 上游素材(photo/card/anim/audio)
  # freekill-asio/         # 上游基线,只读,部署不需要(.dockerignore 已排除)
```

### 拉取/更新两个仓库
```bash
cd ~/freekill/freekill-web && git pull            # 主仓更新

# 若 freekill-web-asio 还不存在,先 clone:
cd ~/freekill
[ -d freekill-web-asio ] || git clone https://github.com/DavidChen206265/freekill-web-asio.git
cd freekill-web-asio && git pull                  # fork 更新到最新(含 W0-1/2/3 + A1)
```

## 部署上下文根的 .dockerignore(每次 pull 后必做)

构建上下文是**仓库父目录**(`~/freekill/`),`.dockerignore` 必须在那里,且仓库里 pull 不到它(它在 freekill-web 之外)。把权威副本拷过去:
```bash
cd ~/freekill
cp freekill-web/docker/dockerignore.repo-root .dockerignore
```

## 重建并启动

asio 镜像会重新编译 C++(fork 源码变了,**必须 --build**),web 会重新 `sync-assets`(含音频)+ build:
```bash
cd ~/freekill/freekill-web/docker
docker compose up -d --build
```

看三个服务起来:
```bash
docker compose logs -f      # Ctrl+C 退出
#   asio    → "server is ready to listen on [::]:9527"
#   gateway → "[ws-bridge] listening on ... -> asio asio:9527"
#   caddy   → 启动无报错
```

## 部署后自检(确认这次的关键修复生效)

```bash
# 1. asio 跑的是 fork(Web-only 配置)→ 不再因 MD5 拒登录。看 config 已注入:
docker compose exec asio sh -c 'grep -E "checkClientMd5|webOnly" freekill.server.config.json'
#   期望:checkClientMd5: false / webOnly: true

# 2. /fk 音频确实进了镜像(过河拆桥语音 + audio.json):
docker compose exec caddy ls -la /srv/fk/audio/card/male/dismantlement.mp3
docker compose exec caddy sh -c 'grep -o "audio/card/male/dismantlement.mp3" /srv/fk/audio.json'
#   期望:文件存在 + audio.json 里能 grep 到

# 3. 公网 URL 拉一次音频,确认 200 + audio/mpeg(把 URL 换成你的):
curl -skI https://你的域名/fk/audio/card/male/dismantlement.mp3 | grep -iE 'HTTP|content-type'
#   期望:HTTP/.. 200 + content-type: audio/mpeg
#   若是 text/html 或 404 → 跑 vps-audio-forensics.sh 取证(见下)

# 4. 新增/移牌音效文件也在:
docker compose exec caddy ls /srv/fk/audio/system/ | grep -E 'drawCard|moveCard|bgm'
```

## 如果音频还是没声(2g 取证)

跑取证脚本,把**完整输出**贴回给开发端(主仓 Claude Code):
```bash
cd ~/freekill/freekill-web/docker
bash vps-audio-forensics.sh https://你的域名     # 没域名就用 http://公网IP:端口
```
它会一次性查:文件在不在 `/srv/fk`、audio.json 有没有、公网 URL 返回啥(200/404/html)、镜像是不是旧的、asio 广播的路径、git HEAD。**贴回输出即可,不要自行改动。**

## 数据安全提示

- **不要删** `asio-server` 数据卷(账号/战绩/RSA 身份)。`up -d --build` 只重建镜像,不动卷。
- 重建会断开当前在线玩家(正常);Web-only 配置下改包不再踢房,但镜像重启本身会断连。

## 注意

- 这次 push 的提交里,`freekill-web-asio` 的 fork master 已含 W0-1/W0-2/W0-3/A1;`freekill-web` 已含 W0-4 部署改动 + W1-1 全部客户端修复。两边都 pull 到最新再 `up -d --build`。
- `freekill-asio/`(上游基线)部署用不到,VPS 上可以不放,`.dockerignore` 也已排除。
