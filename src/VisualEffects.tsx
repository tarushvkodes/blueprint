import { LiquidMetal } from '@paper-design/shaders-react'
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'

type ShaderBackdropProps = {
  variant?: 'landing' | 'workspace'
}

export function ShaderBackdrop({ variant = 'landing' }: ShaderBackdropProps) {
  const isWorkspace = variant === 'workspace'

  return (
    <div className={`shader-backdrop shader-backdrop-${variant}`} aria-hidden="true">
      <ShaderGradientCanvas
        style={{ position: 'absolute', inset: 0 }}
        pixelDensity={1}
        fov={isWorkspace ? 36 : 42}
        pointerEvents="none"
        lazyLoad
        rootMargin="240px"
        powerPreference="high-performance"
      >
        <ShaderGradient
          type={isWorkspace ? 'plane' : 'sphere'}
          animate="on"
          color1={isWorkspace ? '#e7f4ed' : '#fff4cf'}
          color2={isWorkspace ? '#74c5aa' : '#79c7ad'}
          color3={isWorkspace ? '#c4993d' : '#244c42'}
          cAzimuthAngle={isWorkspace ? 35 : 175}
          cPolarAngle={isWorkspace ? 92 : 118}
          cDistance={isWorkspace ? 4.8 : 5.8}
          cameraZoom={isWorkspace ? 1.8 : 1.35}
          brightness={isWorkspace ? 0.88 : 1.05}
          envPreset="city"
          grain="on"
          grainBlending={0.14}
          lightType="3d"
          positionX={isWorkspace ? -0.2 : 0.15}
          positionY={isWorkspace ? -0.05 : 0}
          positionZ={0}
          rotationX={isWorkspace ? 0 : 24}
          rotationY={isWorkspace ? 0 : -18}
          rotationZ={isWorkspace ? 0 : 8}
          shader="defaults"
          uAmplitude={isWorkspace ? 0.34 : 0.28}
          uDensity={isWorkspace ? 1.35 : 1.05}
          uFrequency={isWorkspace ? 5.2 : 4.3}
          uSpeed={isWorkspace ? 0.12 : 0.18}
          uStrength={isWorkspace ? 2.2 : 2.8}
          reflection={0.34}
        />
      </ShaderGradientCanvas>
    </div>
  )
}

type LiquidLogoMarkProps = {
  size?: number
}

export function LiquidLogoMark({ size = 34 }: LiquidLogoMarkProps) {
  return (
    <span className="liquid-logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <LiquidMetal
        width={size}
        height={size}
        shape="diamond"
        colorBack="#0a1411"
        colorTint="#f7f1d7"
        repetition={4.2}
        softness={0.12}
        shiftRed={0.18}
        shiftBlue={0.24}
        distortion={0.075}
        contour={0.62}
        angle={64}
        speed={0.72}
        scale={0.78}
        fit="contain"
        minPixelRatio={1}
      />
    </span>
  )
}
