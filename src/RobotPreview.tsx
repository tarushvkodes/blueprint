import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'

function RobotModel() {
  const chassisRef = useRef<Group>(null)
  const wheelPositions = useMemo(
    () => [
      [-1.72, -0.26, -1.05],
      [-1.72, -0.26, 1.05],
      [1.72, -0.26, -1.05],
      [1.72, -0.26, 1.05],
    ] as const,
    [],
  )
  const railPositions = useMemo(
    () => [
      [0, 0.02, -1.28],
      [0, 0.02, 1.28],
      [-1.92, 0.02, 0],
      [1.92, 0.02, 0],
    ] as const,
    [],
  )

  useFrame(({ clock }) => {
    if (!chassisRef.current) return
    const elapsed = clock.getElapsedTime()
    chassisRef.current.rotation.y = -0.62 + Math.sin(elapsed * 0.32) * 0.24
    chassisRef.current.rotation.x = 0.12 + Math.sin(elapsed * 0.48) * 0.035
    chassisRef.current.position.y = Math.sin(elapsed * 0.72) * 0.045
  })

  return (
    <group ref={chassisRef} rotation={[0.14, -0.62, 0]}>
      <mesh position={[0, -0.42, 0]} rotation={[0, Math.PI / 4, 0]}>
        <circleGeometry args={[3.25, 64]} />
        <meshStandardMaterial color="#0f1d18" roughness={0.9} metalness={0.05} transparent opacity={0.76} />
      </mesh>

      <group>
        {railPositions.map(([x, y, z], index) => (
          <mesh key={`${x}-${z}`} position={[x, y, z]} rotation={[0, index > 1 ? 0 : Math.PI / 2, 0]}>
            <boxGeometry args={index > 1 ? [0.18, 0.2, 2.72] : [0.18, 0.2, 3.94]} />
            <meshStandardMaterial color="#dce8dc" roughness={0.35} metalness={0.58} />
          </mesh>
        ))}
      </group>

      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[3.34, 0.24, 2.22]} />
        <meshStandardMaterial color="#cfdcd1" roughness={0.42} metalness={0.42} />
      </mesh>

      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.38, 0.18, 1.52]} />
        <meshStandardMaterial color="#14251f" roughness={0.55} metalness={0.18} />
      </mesh>

      {wheelPositions.map(([x, y, z]) => (
        <mesh key={`${x}-${y}-${z}`} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.3, 36]} />
          <meshStandardMaterial color="#111713" roughness={0.32} metalness={0.14} />
        </mesh>
      ))}

      <mesh position={[0.74, 1, 0]}>
        <boxGeometry args={[0.42, 1.92, 0.34]} />
        <meshStandardMaterial color="#c79a3e" roughness={0.32} metalness={0.34} />
      </mesh>

      <mesh position={[1.12, 1.86, 0]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[1.42, 0.2, 0.22]} />
        <meshStandardMaterial color="#e7f4ed" emissive="#345548" emissiveIntensity={0.08} roughness={0.28} metalness={0.24} />
      </mesh>

      <mesh position={[1.68, 2.12, 0.18]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.62, 0.12, 0.16]} />
        <meshStandardMaterial color="#74c5aa" roughness={0.28} metalness={0.35} />
      </mesh>

      <mesh position={[-0.68, 0.38, 0]}>
        <boxGeometry args={[0.82, 0.48, 1.12]} />
        <meshStandardMaterial color="#1f6a5b" roughness={0.46} metalness={0.16} />
      </mesh>

      <mesh position={[-0.68, 0.72, 0]}>
        <boxGeometry args={[0.56, 0.08, 1.22]} />
        <meshStandardMaterial color="#f3c86f" emissive="#6a4f16" emissiveIntensity={0.12} roughness={0.34} metalness={0.28} />
      </mesh>
    </group>
  )
}

export function RobotPreview() {
  return (
    <Canvas camera={{ position: [4.8, 3.4, 6.4], fov: 38 }} dpr={[1, 1.75]}>
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 5, 3]} intensity={1.6} />
      <pointLight position={[-3, 2, -2]} intensity={1.4} color="#74c5aa" />
      <spotLight position={[1.8, 4.8, 2.2]} angle={0.5} penumbra={0.7} intensity={2.2} color="#f3c86f" />
      <RobotModel />
    </Canvas>
  )
}
