/**
 * Wallpaper directory listing and traversal-safe reads for the Host half.
 * Two directories contribute files: the wallpapers shipped inside this
 * package and the user's drop-in directory (`~/.dsh/skin-center/wallpapers`).
 * Every accepted filename is a bare basename with a whitelisted extension,
 * so a crafted path can never escape its source directory.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  WALLPAPER_EXTENSIONS, WALLPAPER_ROUTE,
  type WallpaperEntry,
} from './skin-settings.ts'

const EXTENSION_SET = new Set<string>(WALLPAPER_EXTENSIONS)

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
})

/** Response body of `GET /skin-background/wallpapers`. */
export interface WallpaperListing {
  wallpapers: WallpaperEntry[]
}

/** Human-readable display name from a wallpaper filename stem. */
export function displayName(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return stem === '' ? filename : stem
}

/** Whether a directory entry name is a servable wallpaper filename. */
export function isWallpaperFilename(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  if (!EXTENSION_SET.has(name.slice(dot).toLowerCase())) return false
  // Bare basename only: any separator (both kinds, whatever the platform's
  // path module says) or a parent reference is never listed or served.
  return !name.includes('/') && !name.includes('\\') && !name.startsWith('.')
}

/** Preset id from a filename stem: lowercase, runs of foreign chars become one dash. */
export function presetId(filename: string, source: WallpaperEntry['source']): string {
  const stem = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const base = stem === '' ? 'wallpaper' : stem
  return source === 'builtin' ? base : `user-${base}`
}

/**
 * List every servable wallpaper from both directories, builtins first, each
 * group sorted by filename. Unreadable directories contribute nothing.
 * @param builtinDir - `assets/wallpapers` inside this package.
 * @param userDir - optional user drop-in directory.
 */
export async function listWallpapers(builtinDir: string, userDir: string | undefined): Promise<WallpaperEntry[]> {
  const entries: WallpaperEntry[] = []
  const collect = async (dir: string, source: WallpaperEntry['source']): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const name of names.filter(isWallpaperFilename).sort()) {
      entries.push({
        id: presetId(name, source),
        name: displayName(name),
        url: `${WALLPAPER_ROUTE}/${encodeURIComponent(name)}`,
        source,
      })
    }
  }
  await collect(builtinDir, 'builtin')
  if (userDir !== undefined) await collect(userDir, 'user')
  return entries
}

/**
 * Read one wallpaper file by name from the first directory that holds it.
 * The name is forced through `basename` and re-checked, and the resolved
 * path must stay inside one of the source directories.
 * @returns the file bytes, or null when no directory serves that name.
 */
export async function readWallpaper(
  name: string,
  dirs: readonly string[],
): Promise<{ body: Buffer; contentType: string } | null> {
  const filename = decodeURIComponent(name)
  if (!isWallpaperFilename(filename)) return null
  const dot = filename.lastIndexOf('.')
  const contentType = CONTENT_TYPES[filename.slice(dot).toLowerCase()]
  if (contentType === undefined) return null
  for (const dir of dirs) {
    const resolved = resolve(dir, filename)
    if (!resolved.startsWith(resolve(dir) + /* platform separator */ (process.platform === 'win32' ? '\\' : '/'))) continue
    try {
      return { body: await readFile(resolved), contentType }
    } catch {
      // Not in this directory — keep looking.
    }
  }
  return null
}
