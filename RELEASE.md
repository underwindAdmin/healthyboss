# 发版流程（OTA 热更新）

本文档描述 acupoints3D 的 OTA 热更新发版流程。每次修改网页代码后，按此流程发布新版本，已安装的 APP 会通过"↻ 检查更新"按钮获取更新，无需重新安装 APK。

## 系统架构

```
手机 APP（Capgo 插件）
  │
  ├─ ① 查版本：version.json（必须实时）
  │     ├─ rawcdn.githack.com/.../main/version.json
  │     └─ gh-proxy.com/.../main/version.json
  │     → 并行查询所有源，取最高版本号（防止某个源返回过期内容）
  │     → 每个源 10 秒超时（防止连接挂起卡住）
  │
  └─ ② 下载包：acupoints3d-web-v*.zip（静态文件，可走 CDN 缓存）
        ├─ cdn.jsdelivr.net/gh/...@<完整commit hash>/dist/*.zip
        └─ gh-proxy.com/.../releases/download/web-v*/*.zip（GitHub Release 附件）
        → 依次尝试，失败自动切换下一个镜像
```

关键设计决策（都是踩过的坑）：

| 决策 | 原因 |
|---|---|
| version.json 不走 jsDelivr `@main` | jsDelivr 官方确认分支缓存 12 小时，无法实时 |
| zipUrl 用完整 40 位 commit hash | jsDelivr 不识别短 hash（返回 404）；官方 README 示例均为完整 hash |
| 先 commit zip 再生成 manifest | hash 指向的 commit 必须已包含 zip，否则永久 404 |
| 取所有源的最高版本 | rawcdn 会返回 HTTP 200 但内容过期，单源 fallback 防不住 |
| 10 秒超时 | 手机网络下某个源可能连接挂起，无超时会卡死在"检查中" |
| 每次发新版 APK 时 versionCode 必须 +1 | Android 系统强制要求单调递增，否则无法覆盖安装 |

## 前置条件

- 已登录 `gh` CLI（`gh auth login`，token 存于 `.env` 的 `GITHUB_TOKEN`）
- JDK：`export JAVA_HOME=/opt/homebrew/opt/openjdk@21`（仅构建 APK 时需要）

## 发版步骤（每次改代码后）

```bash
cd /Users/admin123/Downloads/bo3d/acupoints3D

# 1. 修改版本号：main.js 里的 APP_WEB_VERSION（如 "1.5.5" → "1.5.6"）

# 2. 生成更新包
bash scripts/make-bundle.sh 1.5.6 --zip

# 3. 提交代码 + zip（顺序不能反：zip 必须先进 commit）
git add -A && git commit -m "release: web bundle v1.5.6"

# 4. 生成 manifest（自动注入当前完整 commit hash）
bash scripts/make-bundle.sh 1.5.6 --manifest

# 5. 提交 manifest 并推送
git add version.json && git commit -m "chore: manifest v1.5.6" && git push

# 6. 创建 Release 备用下载源（gh-proxy 镜像用）
gh release create web-v1.5.6 dist/acupoints3d-web-v1.5.6.zip \
  --title "Web Bundle v1.5.6" --notes "OTA web bundle v1.5.6"
```

## 发布后验证（不挂 VPN）

```bash
# ① manifest 已更新（gh-proxy 源实时）
curl -s "https://gh-proxy.com/https://raw.githubusercontent.com/underwindAdmin/healthyboss/main/version.json"
# 应返回新版本号

# ② jsDelivr zip 可下载（替换 <HASH> 为 version.json 里的完整 hash）
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://cdn.jsdelivr.net/gh/underwindAdmin/healthyboss@<HASH>/dist/acupoints3d-web-v1.5.6.zip"
# 应返回 200

# ③ Release 备用源可下载
curl -s -o /dev/null -w "%{http_code}\n" -r 0-2047 \
  "https://gh-proxy.com/https://github.com/underwindAdmin/healthyboss/releases/download/web-v1.5.6/acupoints3d-web-v1.5.6.zip"
# 应返回 200 或 206
```

## 构建新 APK（仅原生层改动时需要）

网页代码改动走 OTA，不需要重打包。只有以下情况需要新 APK：

- 新增/升级 Capacitor 插件
- 修改 capacitor.config.json
- 首次安装到新手机

```bash
cd /Users/admin123/Downloads/bo3d/acupoints3D

# 1. versionCode +1、versionName 更新：android/app/build.gradle
# 2. 同步并构建
npm run www:sync
npx cap sync android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
cd android && ./gradlew assembleDebug

# 3. 产物：android/app/build/outputs/apk/debug/acupoints3d-v<versionName>-debug.apk
```

**构建测试 APK 的技巧**：如果想让手机测试 OTA 流程，临时把 `APP_WEB_VERSION` 改成旧版本（如 1.5.1）再构建，装到手机后点更新就能走完整链路。构建完记得改回来，不要提交这个临时改动。

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 一直"检查中" | 某源连接挂起 | 10 秒超时会自动跳过；超 10 秒仍无结果则两源都不通，检查手机网络 |
| "已是最新"但有新版 | 某源返回过期内容 | 取最高版本逻辑会自动兼容；确认 gh-proxy 返回的是新版本 |
| 下载失败 | jsDelivr 不通 | 会自动切换 gh-proxy Release 镜像（按钮显示 (2/2)）；两个都失败检查 Release 附件是否已上传 |
| 更新后闪退/白屏 | OTA 包有问题 | Capgo 10 秒回滚保护会自动退回上一版；修复代码后重新发版 |
| jsDelivr zip 404 | hash 不是完整 40 位 / zip 未先提交 | 检查 version.json 的 zipUrl；确认先发 zip 的 commit 再生成 manifest |

## 版本号约定

- `APP_WEB_VERSION`（main.js）：网页包版本，OTA 更新依据，格式 x.y.z
- `versionCode`（build.gradle）：安卓内部版本号，每次打 APK 必须 +1
- `versionName`（build.gradle）：安卓显示版本号，与 APK 文件名一致
