# 自然之境 · Quiet Nature

一个以“沉浸于自然”为主题的轻量网站。开屏动画 → 使用引导 → 分类场景画廊 → 沉浸播放器。

## 体验

- **开屏**：粒子辉光动画 + 标题 reveal。
- **引导**：四步说明如何选景、拖动时间、开启声音、使用“时光流转”。
- **画廊**：三类自然场景横向滑动卡片。
  - 一日流转：同一片真实草甸的 24 小时光影与氛围音流动。
  - 静谧短憩：雨、篝火、星空等短场景循环。
  - 苍茫雄伟：群山、海岸、瀑布、极光、雪原等壮阔景象（高质量摄影 + Ken Burns 慢速缩放，营造电影感）。
- **播放器**：
  - 24h 场景：底部四色时间轴可自由拖动，实时模式/时光流转模式随时切换。
  - 循环场景：视频或图片均支持底部进度条拖动，自由定位。
  - 闲置 4 秒后 UI 自动隐藏；轻触屏幕唤醒。

## 运行

```bash
node server.js
```

然后打开 http://localhost:8787 。

`server.js` 是原生 Node 本地开发服务器；静态托管（GitHub Pages）只需 `index.html` + `scenes.json` + `media/`。

## 素材来源（自我审核）

| 场景 | 类型 | 来源 / 授权 |
|------|------|------------|
| 晨雾草甸 | 视频 | Pixabay 森林/草甸晨雾（Pixabay License：免费、可商用、无需署名） |
| 雨落窗前 | 视频 | Pixabay 雨景视频 + Pixabay 音频 nils_vega – rain |
| 林间篝火 | 视频 | Pixabay 篝火视频 |
| 星河低语 | 视频 | Pixabay 星空延时 |
| 群山青翠 | 图片 | Pixabay 山景延时摄影 |
| 悬崖怒海 | 图片 | Pixabay 海岸航拍摄影 |
| 热带飞瀑 | 图片 | Pixabay 瀑布摄影 |
| 极光之夜 | 图片 | Pixabay 极光摄影 |
| 雪原日落 | 图片 | Pixabay 雪原航拍摄影 |
| 环境音 | 音频 | 开源项目 adams914/beach-wallpaper（wind / campfire / seagulls / music_day / music_night） |

所有视频、图片、音频均为免费可商用素材，未改动原始素材内容。

## 部署

当前托管于 GitHub Pages：
`https://idjdixhdhd.github.io/calm-nature/`
