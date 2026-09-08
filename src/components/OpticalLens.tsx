import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import '../styles/optical.css'

// Original rounded-box bevel map. Generated only on resize, never on pointer moves.
function bevelMap(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(256, width); canvas.height = Math.min(64, height)
  const context = canvas.getContext('2d')
  if (!context) return ''
  const pixels = context.createImageData(canvas.width, canvas.height)
  const radius = Math.min(12, height / 2)
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const px = (x + .5) * width / canvas.width - width / 2
    const py = (y + .5) * height / canvas.height - height / 2
    const qx = Math.abs(px) - width / 2 + radius, qy = Math.abs(py) - height / 2 + radius
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), length = Math.hypot(ox, oy)
    const distance = length + Math.min(Math.max(qx, qy), 0) - radius
    const strength = Math.pow(Math.max(0, 1 - Math.abs(distance + 2) / 10), 1.5)
    const nx = length ? ox / length : Number(qx > qy)
    const ny = length ? oy / length : Number(qy >= qx)
    const i = (y * canvas.width + x) * 4
    pixels.data[i] = 128 + Math.sign(px) * nx * strength * 110
    pixels.data[i + 1] = 128 + Math.sign(py) * ny * strength * 110
    pixels.data[i + 2] = 128; pixels.data[i + 3] = 255
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL()
}

/** Local optical object: only its duplicate environment is refracted, never labels or inspected images. */
export function OpticalLens({ className = '', style, children }: { className?: string; style?: CSSProperties; children?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const id = `lens-${useId().replace(/:/g, '')}`
  const [size, setSize] = useState({ width: 64, height: 36 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width)), height = Math.max(1, Math.round(entry.contentRect.height))
      setSize(old => old.width === width && old.height === height ? old : { width, height })
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const map = useMemo(() => bevelMap(size.width, size.height), [size.width, size.height])
  return <span ref={ref} className={`optical-lens ${className}`} style={style} aria-hidden="true">
    <svg className="optical-definitions" width="0" height="0" focusable="false"><defs>
      <filter id={id} filterUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height} colorInterpolationFilters="sRGB">
        <feImage href={map} x="0" y="0" width={size.width} height={size.height} preserveAspectRatio="none" result="bevel"/>
        <feDisplacementMap in="SourceGraphic" in2="bevel" scale="12" xChannelSelector="R" yChannelSelector="G" result="refracted"/>
        <feOffset in="refracted" dx=".35" result="red-shift"/>
        <feColorMatrix in="red-shift" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="red"/>
        <feOffset in="refracted" dx="-.35" result="cyan-shift"/>
        <feColorMatrix in="cyan-shift" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="cyan"/>
        <feBlend in="red" in2="cyan" mode="screen" result="spectrum"/>
        <feComposite in="spectrum" in2="refracted" operator="in"/>
      </filter>
    </defs></svg>
    <span className="optical-refraction" style={{ filter: map ? `url(#${id})` : undefined }}>{children || <span className="optical-environment"/>}</span>
    <span className="optical-specular"/>
  </span>
}
