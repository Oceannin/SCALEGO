import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createInstance, destroyInstance, setSharedPreset, updateInstance } from 'metal-fx'
import type { MetalFxInstance } from 'metal-fx'

/** One decorative rim. The native button and its CSS fallback are independent of WebGL. */
export function MetalAccent({ paused, theme }: { paused: boolean; theme: 'dark' | 'light' }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const instance = useRef<MetalFxInstance | null>(null)
  const [active, setActive] = useState(() => document.hasFocus() && !document.hidden)
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const stopped = paused || !active
  const appearance = useRef({ theme, stopped })

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReducedMotion(media.matches)
    const focus = () => setActive(document.hasFocus() && !document.hidden)
    media.addEventListener('change', motion)
    window.addEventListener('focus', focus)
    window.addEventListener('blur', focus)
    document.addEventListener('visibilitychange', focus)
    return () => {
      media.removeEventListener('change', motion)
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [])

  useLayoutEffect(() => {
    const element = canvas.current
    if (!element || reducedMotion) return
    let observer: ResizeObserver | undefined
    // Defer allocation past React StrictMode's setup/cleanup replay. Otherwise
    // an old context's asynchronous loss event can stop the new shared renderer.
    const frame = requestAnimationFrame(() => {
      try {
        const rect = element.getBoundingClientRect()
        setSharedPreset('silver', appearance.current.theme)
        instance.current = createInstance({ hostCanvas: element, cssWidth: rect.width, cssHeight: rect.height, cornerRadius: 10, kind: 'pill', ringCssPx: 1.5, paused: appearance.current.stopped })
        observer = new ResizeObserver(([entry]) => {
          if (instance.current) updateInstance(instance.current, { cssWidth: entry.contentRect.width, cssHeight: entry.contentRect.height })
        })
        observer.observe(element)
      } catch {
        // Optional decoration must never stop image processing or hide the action.
        if (instance.current) destroyInstance(instance.current)
        instance.current = null
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      if (instance.current) destroyInstance(instance.current)
      instance.current = null
    }
  }, [reducedMotion])

  useLayoutEffect(() => {
    appearance.current = { theme, stopped }
    if (instance.current) {
      setSharedPreset('silver', theme)
      updateInstance(instance.current, { paused: stopped })
    }
  }, [stopped, theme, reducedMotion])

  return reducedMotion ? null : <canvas ref={canvas} className="metal-accent" aria-hidden="true" data-paused={stopped}/>
}
