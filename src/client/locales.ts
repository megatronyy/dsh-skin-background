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
  transparency: string
  windowTransparency: string
  blur: string
  save: string
  saving: string
  discard: string
  dirty: string
  saved: string
  saveFailed: string
  loadFailed: string
  none: string
  addWallpaper: string
  uploading: string
  uploadTooLarge: string
  uploadInvalid: string
  uploadFailed: string
  deleteWallpaper: string
  deleteFailed: string
  fineDecrease: string
  fineIncrease: string
}

export const zh: SkinDictionary = {
  nav: '图片背景',
  title: '图片背景',
  intro: '为 Web 界面选择一张图片背景；可以输入图片链接，或点击壁纸网格末尾的 + 上传本地图片（≤5MB）。',
  enabled: '启用图片背景',
  wallpaper: '壁纸',
  wallpaperUser: '（来自我的目录）',
  customUrl: '自定义图片链接',
  customUrlApply: '应用链接',
  customUrlInvalid: '链接需为 http(s) 地址或插件提供的壁纸路径',
  transparency: '主面板透明度',
  windowTransparency: '设置页透明度（设置与插件页共用）',
  blur: '背景模糊',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  dirty: '有未保存的修改',
  saved: '已保存',
  saveFailed: '保存失败：设置已被其他页面修改，请重试',
  loadFailed: '壁纸列表加载失败',
  none: '无',
  addWallpaper: '添加壁纸',
  uploading: '上传中…',
  uploadTooLarge: '图片不能超过 5MB',
  uploadInvalid: '不支持的图片格式（仅限 PNG/JPEG/WebP/AVIF/GIF）',
  uploadFailed: '上传失败，请重试',
  deleteWallpaper: '删除壁纸',
  deleteFailed: '删除失败，请重试',
  fineDecrease: '减少',
  fineIncrease: '增加',
}

export const en: SkinDictionary = {
  nav: 'Background',
  title: 'Image background',
  intro: 'Pick an image background for the web client; paste an image link, or click the + tile at the end of the wallpaper grid to upload a local image (≤5 MB).',
  enabled: 'Enable image background',
  wallpaper: 'Wallpaper',
  wallpaperUser: '(from your directory)',
  customUrl: 'Custom image URL',
  customUrlApply: 'Apply link',
  customUrlInvalid: 'The link must be an http(s) URL or a plugin-served wallpaper path',
  transparency: 'Main panel transparency',
  windowTransparency: 'Settings-page transparency (shared with Plugins)',
  blur: 'Background blur',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard changes',
  dirty: 'Unsaved changes',
  saved: 'Saved',
  saveFailed: 'Save failed: settings changed elsewhere, please retry',
  loadFailed: 'Failed to load the wallpaper list',
  none: 'none',
  addWallpaper: 'Add wallpaper',
  uploading: 'Uploading…',
  uploadTooLarge: 'The image must be 5 MB or smaller',
  uploadInvalid: 'Unsupported image format (PNG/JPEG/WebP/AVIF/GIF only)',
  uploadFailed: 'Upload failed, please retry',
  deleteWallpaper: 'Delete wallpaper',
  deleteFailed: 'Delete failed, please retry',
  fineDecrease: 'Decrease',
  fineIncrease: 'Increase',
}
