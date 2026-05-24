type ShaderBackdropProps = {
  variant?: 'landing' | 'workspace'
}

export function ShaderBackdrop({ variant = 'landing' }: ShaderBackdropProps) {
  return <div className={`shader-backdrop shader-backdrop-${variant}`} aria-hidden="true" />
}

type LiquidLogoMarkProps = {
  size?: number
}

export function LiquidLogoMark({ size = 34 }: LiquidLogoMarkProps) {
  return (
    <span className="liquid-logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <i />
    </span>
  )
}
