import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WALLPAPER_ROUTE } from '../src/skin-settings.ts'
import { displayName, isWallpaperFilename, listWallpapers, readWallpaper } from '../src/wallpapers.ts'

let root: string
let builtinDir: string
let userDir: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-skin-wallpapers-'))
  builtinDir = join(root, 'builtin')
  userDir = join(root, 'user')
  await mkdir(builtinDir)
  await mkdir(userDir)
  await writeFile(join(builtinDir, 'aurora-dawn.svg'), '<svg>builtin</svg>')
  await writeFile(join(builtinDir, 'zeta.jpg'), 'jpg-bytes')
  await writeFile(join(builtinDir, 'notes.txt'), 'not a wallpaper')
  await writeFile(join(builtinDir, '.hidden.png'), 'hidden')
  await writeFile(join(userDir, 'my holiday.png'), 'user-bytes')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('isWallpaperFilename', () => {
  it('accepts bare basenames with whitelisted extensions', () => {
    expect(isWallpaperFilename('a.svg')).toBe(true)
    expect(isWallpaperFilename('Photo.PNG')).toBe(true)
    expect(isWallpaperFilename('x.jpeg')).toBe(true)
  })

  it('rejects separators, hidden files, unknown or missing extensions', () => {
    expect(isWallpaperFilename('../evil.svg')).toBe(false)
    expect(isWallpaperFilename('sub/dir/a.svg')).toBe(false)
    expect(isWallpaperFilename('..\\evil.svg')).toBe(false)
    expect(isWallpaperFilename('.hidden.png')).toBe(false)
    expect(isWallpaperFilename('notes.txt')).toBe(false)
    expect(isWallpaperFilename('noext')).toBe(false)
    expect(isWallpaperFilename('.svg')).toBe(false)
  })
})

describe('displayName', () => {
  it('turns filename stems into readable names', () => {
    expect(displayName('aurora-dawn.svg')).toBe('aurora dawn')
    expect(displayName('my_holiday.png')).toBe('my holiday')
    expect(displayName('weird..name')).not.toBe('')
  })
})

describe('listWallpapers', () => {
  it('lists builtins first (sorted) then user files, tagging sources', async () => {
    const entries = await listWallpapers(builtinDir, userDir)
    expect(entries).toEqual([
      { id: 'aurora-dawn', name: 'aurora dawn', url: `${WALLPAPER_ROUTE}/aurora-dawn.svg`, source: 'builtin' },
      { id: 'zeta', name: 'zeta', url: `${WALLPAPER_ROUTE}/zeta.jpg`, source: 'builtin' },
      { id: 'user-my-holiday', name: 'my holiday', url: `${WALLPAPER_ROUTE}/${encodeURIComponent('my holiday.png')}`, source: 'user' },
    ])
  })

  it('contributes nothing when directories are missing', async () => {
    expect(await listWallpapers(join(root, 'missing'), join(root, 'also-missing'))).toEqual([])
  })
})

describe('readWallpaper', () => {
  it('serves builtin files first and user files from the user directory', async () => {
    const builtin = await readWallpaper('aurora-dawn.svg', [builtinDir, userDir])
    expect(builtin?.body.toString()).toBe('<svg>builtin</svg>')
    expect(builtin?.contentType).toBe('image/svg+xml')

    const user = await readWallpaper(encodeURIComponent('my holiday.png'), [builtinDir, userDir])
    expect(user?.body.toString()).toBe('user-bytes')
    expect(user?.contentType).toBe('image/png')
  })

  it('never serves a path that escapes the source directories', async () => {
    const secret = join(root, 'secret.svg')
    await writeFile(secret, 'secret')
    const crafted = [
      '../secret.svg',
      '..%2Fsecret.svg',
      'sub/../../secret.svg',
      '..\\secret.svg',
      'notes.txt',
      'missing.svg',
    ]
    for (const name of crafted) {
      expect(await readWallpaper(name, [builtinDir, userDir])).toBeNull()
    }
  })
})
