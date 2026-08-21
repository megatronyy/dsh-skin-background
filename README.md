# dsh-skin-background

DeepSeek Harness (dsh) 皮肤插件：给 Web 界面加上可切换的图片背景。English summary below.

- 内置 4 张原创渐变壁纸（aurora-dawn / dusk-drift / ocean-mist / midnight-bloom），也支持用户目录 `~/.dsh/skin-center/wallpapers` 中放入自己的图片，或输入任意 http(s) 图片链接
- 皮肤面板出现在「设置 → 皮肤」：启用开关、壁纸选择、自定义链接、背景压暗（0–90%）与背景模糊（0–24px）滑杆，保存后即时生效
- 深浅色自适应：面板变为半透明毛玻璃（通过 `ctx.theme.overrideTokens` 叠加 token 层），深色模式下加一层更深的暗纱保证文字对比度
- 设置通过 dsh 的 user-settings 文档（`skin-background` 命名空间）持久化，带写入校验（拒绝 `javascript:` 等非法图片引用）

## 安装

```bash
# 在 deepseek-harness 仓库目录下
pnpm dsh plugin --profile web add /path/to/dsh-skin-background
```

安装前先构建：`pnpm install && pnpm build`（产物为 `lib/index.js` 宿主半边 + `lib/client.js` 浏览器半边）。然后重启 `dsh web`。

## 开发

```bash
pnpm install
pnpm test        # vitest（node + jsdom）
pnpm build       # tsc 类型产物 + tsdown 双半边打包
```

目录结构：`src/index.ts` 宿主半边（设置命名空间 + `/skin-background/wallpapers` 路由），`src/client/` 浏览器半边（皮肤应用 `SkinController`、设置界面 `SkinSection`、词典）。

English: a skin plugin for the DeepSeek Harness web client adding a selectable image background. Ships four original gradient wallpapers, serves user wallpapers from `~/.dsh/skin-center/wallpapers`, accepts any http(s) image URL, and exposes a Settings → Skin page with enable/dim/blur controls. Surfaces turn translucent-glass via the theme token override API; everything persists through the `skin-background` settings namespace with write validation.
