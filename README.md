# 静谧自然 · Quiet Nature

一款让人静下来的**真实自然沉浸网页**：雨、森林、篝火、星空四个场景，
全部使用**真实免费素材**（Pixabay 视频 / 开源 beach-wallpaper 环境音），
全屏铺满、触屏开声、场景间交叉淡入。与"海滩 3D"项目是**不同主题、不同链接**。

## 前端（网站）
- 单文件 `index.html`：双层视频交叉淡入、Web Audio 主总线压缩 + 分轨淡变、
  极简自动隐藏 UI、移动端 `100dvh` 铺满、刘海安全区、首次触屏解锁声音。
- 底部场景选择条（带真实封面缩略图），右上角 🔊 声音开关 / ⓘ 素材来源。
- 点 ⓘ 可见每个场景的**素材来源与授权**（自我审核）。

## 后端（媒体服务）`server.js`
原生 Node，无第三方依赖，提供：
- `GET /api/scenes` —— 返回素材清单（标题/视频/封面/音轨/授权）
- `GET /media/*` —— 流式输送视频、图片、音频
- 前端静态页

本地运行：
```
node server.js
# 打开 http://localhost:8787
```

## 素材（自我审核 · 均免费可商用）
| 场景 | 视频 | 音频 | 封面 |
|------|------|------|------|
| 雨 | Pixabay 视频 ID 11722 | Pixabay（nils_vega – rain 365610） | AI 生成写实静帧 |
| 森林 | Pixabay 视频 ID 136188 | 开源 beach-wallpaper（wind / 日间环境乐） | Pixabay 视频封面 |
| 篝火 | Pixabay 视频 ID 240502 | 开源 beach-wallpaper（campfire / 夜乐） | Pixabay 视频封面 |
| 星空 | Pixabay 视频 ID 169951 | 开源 beach-wallpaper（夜乐 / wind） | Pixabay 视频封面 |

- 视频来自 **Pixabay**（Pixabay License：免费、可商用、无需署名）。
- 环境音 `wind/campfire/music_day/music_night/seagulls` 来自开源项目
  `adams914/beach-wallpaper`（免费可复用）；`rain.mp3` 来自 Pixabay。
- 雨场景封面为 AI 生成的写实静帧（仅作封面，主内容为真实视频）。
- 所有素材仅做沉浸式播放，未改动原始内容。

## 部署
`index.html` + `scenes.json` + `media/` 可直接作为静态站点部署；
`server.js` 用于本地带 API 的媒体服务。视频为按需加载，不会一次性下载全部。
