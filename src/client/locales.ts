/**
 * Locale dictionaries for the skin's settings surface. Keys are the
 * translation keys used with `ctx.locale.bind('dsh-skin')`.
 */

export interface SkinDictionary {
  nav: string
  title: string
  intro: string
  enabled: string
  wallpaper: string
  wallpaperUser: string
  customUrl: string
  customUrlApply: string
  customUrlInvalid: string
  dim: string
  blur: string
  save: string
  discard: string
  dirty: string
  saved: string
  saveFailed: string
  overridden: string
  reset: string
  loadFailed: string
  none: string
}

export const zh: SkinDictionary = {
  nav: '皮肤',
  title: '皮肤 · 图片背景',
  intro: '为 Web 界面选择一张图片背景。内置壁纸随插件提供，也可以把自己喜欢的图片放到 ~/.dsh/skin-center/wallpapers 目录，或直接输入图片链接。',
  enabled: '启用图片背景',
  wallpaper: '壁纸',
  wallpaperUser: '（来自我的目录）',
  customUrl: '自定义图片链接',
  customUrlApply: '应用链接',
  customUrlInvalid: '链接需为 http(s) 地址或插件提供的壁纸路径',
  dim: '背景压暗',
  blur: '背景模糊',
  save: '保存',
  discard: '放弃修改',
  dirty: '有未保存的修改',
  saved: '已保存',
  saveFailed: '保存失败：设置已被其他页面修改，请重试',
  overridden: '已覆盖',
  reset: '重置',
  loadFailed: '壁纸列表加载失败',
  none: '无',
}

export const en: SkinDictionary = {
  nav: 'Skin',
  title: 'Skin · Image background',
  intro: 'Pick an image background for the web client. Built-in wallpapers ship with the plugin; drop your own into ~/.dsh/skin-center/wallpapers, or paste any image link.',
  enabled: 'Enable image background',
  wallpaper: 'Wallpaper',
  wallpaperUser: '(from your directory)',
  customUrl: 'Custom image URL',
  customUrlApply: 'Apply link',
  customUrlInvalid: 'The link must be an http(s) URL or a plugin-served wallpaper path',
  dim: 'Background dim',
  blur: 'Background blur',
  save: 'Save',
  discard: 'Discard changes',
  dirty: 'Unsaved changes',
  saved: 'Saved',
  saveFailed: 'Save failed: settings changed elsewhere, please retry',
  overridden: 'overridden',
  reset: 'Reset',
  loadFailed: 'Failed to load the wallpaper list',
  none: 'none',
}
