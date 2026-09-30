/**
 * The "Skin" settings section: wallpaper picker (built-ins, the user's
 * drop-in directory, and local uploads through the "+" tile), custom image
 * URL, enable switch, transparency sliders (main panel + shared
 * settings/Plugins windows) and the blur slider. Edits are staged locally and
 * written through the config form on save — the Host fences each write with
 * the revision it read, so a concurrent change elsewhere refuses the save
 * instead of being overwritten.
 *
 * dsh >= 0.1.7-rc.2: the form object comes from `ctx.configForms.get(ns)`
 * (the old `settingsScope` service is gone); its snapshot carries a `status`
 * field and its writes resolve to a boolean instead of throwing.
 *
 * Visual language follows the dsh-plugin-settings-ui skill: `skinbg-`-scoped
 * CSS (see ./skin-section.css.ts), dsw tokens with fallbacks only, footer
 * with error (role=alert) on the left and ghost/primary actions on the right.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  BLUR_MAX, UPLOAD_MAX_BYTES, WALLPAPER_ROUTE, isAcceptableImage, resolveImageUrl, resolveSkinSettings,
  type SkinSettings, type WallpaperEntry,
} from '../skin-settings.ts'
import { SECTION_CSS, SECTION_STYLE_ID } from './skin-section.css.ts'
import type { SkinDictionary } from './locales.ts'

/** Sync states of one namespace's Host-backed config form. */
export type SkinFormStatus = 'loading' | 'ready' | 'unavailable'

/** Snapshot shape read from the bound config form. */
export interface SkinScopeSnapshot {
  /** `ready` once the Host has served a resolved section. */
  status: SkinFormStatus
  value?: Partial<SkinSettings>
  /** Raw user layer; key presence (not value) marks a field overridden. */
  user?: unknown
  revision: number | undefined
}

/** The config-form surface this section needs (structural subset of ConfigForm). */
export interface SkinScopeController {
  getSnapshot(): SkinScopeSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
}

/** Fetch the wallpaper list from the plugin's Host route. */
export async function fetchWallpaperList(): Promise<WallpaperEntry[]> {
  const response = await fetch(WALLPAPER_ROUTE, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`wallpaper list request failed: ${response.status}`)
  const body = await response.json() as { wallpapers?: WallpaperEntry[] }
  return body.wallpapers ?? []
}

/** Body of a successful `POST /skin-background/upload`. */
export interface UploadResponse {
  url: string
  filename: string
}

/**
 * Upload one local image to the Host and resolve with its served URL. The
 * server-side same-origin gate needs nothing extra: browsers attach `Origin`
 * to same-origin POST fetches automatically.
 */
export async function uploadWallpaperImage(file: File): Promise<UploadResponse> {
  const response = await fetch(`/skin-background/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    const error = new Error(`upload failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  const body = await response.json() as Partial<UploadResponse>
  if (typeof body.url !== 'string' || typeof body.filename !== 'string' || !isAcceptableImage(body.url)) {
    throw new Error('upload response unusable')
  }
  return { url: body.url, filename: body.filename }
}

/**
 * Delete one user-uploaded wallpaper by its served URL (Host route only
 * removes files from the user's drop-in directory — built-ins are untouchable).
 */
export async function deleteWallpaperImage(url: string): Promise<void> {
  const filename = decodeURIComponent(url.slice(WALLPAPER_ROUTE.length + 1))
  const response = await fetch(`${WALLPAPER_ROUTE}/${encodeURIComponent(filename)}`, { method: 'DELETE' })
  if (!response.ok) {
    const error = new Error(`delete failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
}

/**
 * Memoized wallpaper loader shared by the skin controller and the settings
 * section (one wire read per page); a failed read clears the memo so a later
 * open of the section retries.
 */
export function createWallpaperLoader(load: () => Promise<WallpaperEntry[]> = fetchWallpaperList): () => Promise<WallpaperEntry[]> {
  let memo: Promise<WallpaperEntry[]> | undefined
  return () => {
    memo ??= load().catch(error => {
      memo = undefined
      throw error
    })
    return memo
  }
}

type Draft = Partial<SkinSettings>
type Field = 'enabled' | 'image' | 'transparency' | 'blur' | 'windowTransparency'
const FIELDS: readonly Field[] = ['enabled', 'image', 'transparency', 'blur', 'windowTransparency']

export interface SkinSectionProps {
  t: (key: keyof SkinDictionary) => string
  scope: SkinScopeController
  loadWallpapers?: () => Promise<WallpaperEntry[]>
}

/** One staged field differs from the composed value. */
function isDirty(draft: Draft, resolved: SkinSettings): boolean {
  return FIELDS.some(field => draft[field] !== undefined && draft[field] !== resolved[field])
}

/** Inject the scoped stylesheet once (fixed id, idempotent across reloads). */
export function ensureSectionStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(SECTION_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = SECTION_STYLE_ID
  style.textContent = SECTION_CSS
  document.head.appendChild(style)
}

export function SkinSection({ t, scope, loadWallpapers = fetchWallpaperList }: SkinSectionProps): JSX.Element {
  ensureSectionStyles()

  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const resolved = resolveSkinSettings(snapshot.value)

  const [draft, setDraft] = useState<Draft>({})
  const [wallpapers, setWallpapers] = useState<WallpaperEntry[] | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [urlText, setUrlText] = useState('')
  const [urlInvalid, setUrlInvalid] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const [uploadError, setUploadError] = useState<
    'uploadTooLarge' | 'uploadInvalid' | 'uploadFailed' | 'deleteFailed' | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    loadWallpapers()
      .then(list => { if (!cancelled) setWallpapers(list) })
      .catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => { cancelled = true }
  }, [loadWallpapers])

  // A revision the section did not write itself (another surface moved the
  // document) invalidates staged edits: show the composed truth again.
  useEffect(() => { setDraft({}) }, [snapshot.revision])

  const effective: SkinSettings = { ...resolved, ...draft }
  const dirty = isDirty(draft, resolved)
  const effectiveUrl = resolveImageUrl(effective.image, wallpapers)

  const stage = (patch: Draft): void => {
    setStatus('idle')
    setDraft(current => ({ ...current, ...patch }))
  }

  const applyUrl = (): void => {
    const text = urlText.trim()
    const acceptable = (text.startsWith('http://') || text.startsWith('https://') || text.startsWith(`${WALLPAPER_ROUTE}/`))
      && isAcceptableImage(text)
    if (!acceptable) {
      setUrlInvalid(true)
      return
    }
    setUrlInvalid(false)
    stage({ image: text })
  }

  const onFileChosen = (file: File): void => {
    if (file.size > UPLOAD_MAX_BYTES) {
      setUploadError('uploadTooLarge')
      return
    }
    setUploadError(null)
    setUploading(true)
    uploadWallpaperImage(file)
      .then(uploaded => {
        const stem = uploaded.filename.replace(/\.[^.]+$/, '')
        const entry: WallpaperEntry = {
          id: `user-${stem}`,
          name: stem.replace(/[_-]+/g, ' ').trim() || uploaded.filename,
          url: uploaded.url,
          source: 'user',
        }
        setWallpapers(list => {
          if (list === undefined) return [entry]
          return list.some(existing => existing.url === entry.url) ? list : [...list, entry]
        })
        stage({ image: uploaded.url })
      })
      .catch((error: unknown) => {
        const code = (error as { status?: number }).status
        setUploadError(code === 413 ? 'uploadTooLarge' : code === 415 ? 'uploadInvalid' : 'uploadFailed')
      })
      .finally(() => setUploading(false))
  }

  /** Remove a user-uploaded wallpaper file; deselect it if it was in use. */
  const onWallpaperDelete = (entry: WallpaperEntry): void => {
    setUploadError(null)
    deleteWallpaperImage(entry.url)
      .then(() => {
        setWallpapers(list => list?.filter(existing => existing.url !== entry.url))
        if (effective.image === entry.url) stage({ image: '' })
      })
      .catch(() => setUploadError('deleteFailed'))
  }

  const nudgeTransparency = (field: 'transparency' | 'windowTransparency', delta: number): void => {
    const next = Math.min(1, Math.max(0, Math.round((effective[field] + delta) * 100) / 100))
    stage({ [field]: next })
  }

  const nudgeBlur = (delta: number): void => {
    const next = Math.min(BLUR_MAX, Math.max(0, effective.blur + delta))
    stage({ blur: next })
  }

  const save = (): void => {
    const writes = FIELDS
      .filter(field => draft[field] !== undefined && draft[field] !== resolved[field])
      .map(field => scope.set(field, draft[field]))
    if (writes.length === 0) return
    // Spinner appears only when the save actually takes a while, so quick
    // saves never flash a loading state.
    setPending(true)
    setStatus('idle')
    const slowTimer = window.setTimeout(() => setShowSpinner(true), 300)
    void Promise.all(writes)
      .then(results => { setStatus(results.every(Boolean) ? 'saved' : 'failed'); setDraft({}) })
      .catch(() => setStatus('failed'))
      .finally(() => {
        window.clearTimeout(slowTimer)
        setPending(false)
        setShowSpinner(false)
      })
  }

  return (
    <section aria-label={t('title')}>
      <h2 className="skinbg-section-heading">{t('title')}</h2>
      <p className="skinbg-section-intro">{t('intro')}</p>

      <div className="skinbg-field">
        <label className="skinbg-check">
          <input
            type="checkbox"
            checked={effective.enabled}
            onChange={event => stage({ enabled: event.target.checked })}
          />
          {t('enabled')}
        </label>
      </div>

      <div className="skinbg-field">
        <div className="skinbg-field-head">
          <span className="skinbg-field-label">
            {t('wallpaper')}
            {wallpapers !== undefined && <span className="skinbg-count">{String(wallpapers.length)}</span>}
          </span>
        </div>
        {wallpapers === undefined && <p className="skinbg-field-hint">{loadFailed ? t('loadFailed') : '…'}</p>}
        <div className="skinbg-wallpapers" role="group" aria-label={t('wallpaper')}>
          {wallpapers?.map(entry => {
            const selected = effectiveUrl === entry.url
            return (
              <div key={entry.id} className="skinbg-tile-wrap">
                <button
                  type="button"
                  className="skinbg-tile"
                  onClick={() => stage({ image: `preset:${entry.id}` })}
                  title={entry.source === 'user' ? `${entry.name} ${t('wallpaperUser')}` : entry.name}
                  style={{ backgroundImage: `url("${entry.url}")` }}
                  aria-pressed={selected}
                  data-selected={selected || undefined}
                >
                  <span className="skinbg-tile-name">
                    {entry.name}{entry.source === 'user' ? t('wallpaperUser') : ''}
                  </span>
                  {selected && (
                    <span
                      className={entry.source === 'user'
                        ? 'skinbg-tile-check skinbg-tile-check-left'
                        : 'skinbg-tile-check'}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6.5 4.8 9 10 3.5" />
                      </svg>
                    </span>
                  )}
                </button>
                {entry.source === 'user' && (
                  <button
                    type="button"
                    className="skinbg-tile-delete"
                    onClick={() => onWallpaperDelete(entry)}
                    title={t('deleteWallpaper')}
                    aria-label={`${t('deleteWallpaper')}: ${entry.name}`}
                  >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M1.5 3h9M4.5 3V1.8h3V3M3 3l.5 7.2h5L9 3M5 5v3.5M7 5v3.5" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="skinbg-add-tile"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title={uploading ? t('uploading') : t('addWallpaper')}
            aria-label={t('addWallpaper')}
          >
            <span className="skinbg-add-tile-plus" aria-hidden="true">+</span>
            <span className="skinbg-add-tile-label">{uploading ? t('uploading') : t('addWallpaper')}</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          style={{ display: 'none' }}
          onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) onFileChosen(file)
          }}
        />
        {uploadError !== null && <p className="skinbg-field-invalid" role="alert">{t(uploadError)}</p>}
      </div>

      <div className="skinbg-field">
        <div className="skinbg-field-head">
          <label className="skinbg-field-label" htmlFor="skinbg-custom-url">{t('customUrl')}</label>
        </div>
        <div className="skinbg-url-row">
          <input
            id="skinbg-custom-url"
            type="text"
            className={`skinbg-input${urlInvalid ? ' is-invalid' : ''}`}
            placeholder="https://example.com/wallpaper.jpg"
            value={urlText}
            onChange={event => { setUrlText(event.target.value); setUrlInvalid(false) }}
            onKeyDown={event => { if (event.key === 'Enter') applyUrl() }}
          />
          <button type="button" className="skinbg-btn skinbg-btn-ghost" onClick={applyUrl}>{t('customUrlApply')}</button>
        </div>
        {urlInvalid && <p className="skinbg-field-invalid">{t('customUrlInvalid')}</p>}
      </div>

      <div className="skinbg-field">
        <div className="skinbg-field-head">
          <span className="skinbg-field-label" id="skinbg-transparency-label">
            {`${t('transparency')} · ${Math.round(effective.transparency * 100)}%`}
          </span>
        </div>
        <div className="skinbg-step-row">
          <button
            type="button"
            className="skinbg-step-btn"
            onClick={() => nudgeTransparency('transparency', -0.05)}
            disabled={effective.transparency <= 0}
            aria-label={`${t('transparency')} ${t('fineDecrease')}`}
            title={`−5%`}
          >
            −
          </button>
          <input
            type="range" min={0} max={100} step={5}
            value={Math.round(effective.transparency * 100)}
            onChange={event => stage({ transparency: Number(event.target.value) / 100 })}
            className="skinbg-range"
            aria-labelledby="skinbg-transparency-label"
          />
          <button
            type="button"
            className="skinbg-step-btn"
            onClick={() => nudgeTransparency('transparency', 0.05)}
            disabled={effective.transparency >= 1}
            aria-label={`${t('transparency')} ${t('fineIncrease')}`}
            title={`+5%`}
          >
            +
          </button>
        </div>
      </div>

      <div className="skinbg-field">
        <div className="skinbg-field-head">
          <span className="skinbg-field-label" id="skinbg-window-label">
            {`${t('windowTransparency')} · ${Math.round(effective.windowTransparency * 100)}%`}
          </span>
        </div>
        <div className="skinbg-step-row">
          <button
            type="button"
            className="skinbg-step-btn"
            onClick={() => nudgeTransparency('windowTransparency', -0.05)}
            disabled={effective.windowTransparency <= 0}
            aria-label={`${t('windowTransparency')} ${t('fineDecrease')}`}
            title={`−5%`}
          >
            −
          </button>
          <input
            type="range" min={0} max={100} step={5}
            value={Math.round(effective.windowTransparency * 100)}
            onChange={event => stage({ windowTransparency: Number(event.target.value) / 100 })}
            className="skinbg-range"
            aria-labelledby="skinbg-window-label"
          />
          <button
            type="button"
            className="skinbg-step-btn"
            onClick={() => nudgeTransparency('windowTransparency', 0.05)}
            disabled={effective.windowTransparency >= 1}
            aria-label={`${t('windowTransparency')} ${t('fineIncrease')}`}
            title={`+5%`}
          >
            +
          </button>
        </div>
      </div>

      <div className="skinbg-field">
        <div className="skinbg-field-head">
          <span className="skinbg-field-label" id="skinbg-blur-label">
            {`${t('blur')} · ${effective.blur}px`}
          </span>
        </div>
        <div className="skinbg-step-row">
          <button
            type="button"
            className="skinbg-step-btn"
            onClick={() => nudgeBlur(-1)}
            disabled={effective.blur <= 0}
            aria-label={`${t('blur')} ${t('fineDecrease')}`}
            title={`−1px`}
          >
            −
          </button>
          <input
            type="range" min={0} max={BLUR_MAX} step={1}
            value={effective.blur}
            onChange={event => stage({ blur: Number(event.target.value) })}
            className="skinbg-range"
            aria-labelledby="skinbg-blur-label"
          />
          <button
            type="button"
            className="skinbg-step-btn"
            onClick={() => nudgeBlur(1)}
            disabled={effective.blur >= BLUR_MAX}
            aria-label={`${t('blur')} ${t('fineIncrease')}`}
            title={`+1px`}
          >
            +
          </button>
        </div>
      </div>

      <div className="skinbg-footer">
        {status === 'failed'
          ? <p className="skinbg-footer-error" role="alert">{t('saveFailed')}</p>
          : <p className="skinbg-footer-error" role="alert" />}
        {status === 'saved' && <span className="skinbg-saved-note">{t('saved')}</span>}
        {dirty && <span className="skinbg-pending">{t('dirty')}</span>}
        <button type="button" className="skinbg-btn skinbg-btn-ghost" onClick={() => { setDraft({}); setStatus('idle') }}>
          {t('discard')}
        </button>
        <button
          type="button"
          className="skinbg-btn skinbg-btn-primary"
          onClick={save}
          disabled={pending}
        >
          {showSpinner && <span className="skinbg-spinner" aria-hidden="true" />}
          {pending ? t('saving') : t('save')}
        </button>
      </div>
    </section>
  )
}
