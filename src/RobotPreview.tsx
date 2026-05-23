import { Canvas } from '@react-three/fiber'

export function RobotPreview() {
  return (
    <Canvas camera={{ position: [4, 3, 6], fov: 42 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 5, 3]} intensity={1.4} />
      <group rotation={[0.15, -0.65, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[3.6, 0.28, 2.4]} />
          <meshStandardMaterial color="#d9e7dd" roughness={0.45} metalness={0.25} />
        </mesh>
        {[-1.55, 1.55].map((x) =>
          [-1.05, 1.05].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, -0.2, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.34, 0.34, 0.28, 32]} />
              <meshStandardMaterial color="#10130f" roughness={0.35} />
            </mesh>
          )),
        )}
        <mesh position={[0.68, 0.92, 0]}>
          <boxGeometry args={[0.4, 1.85, 0.34]} />
          <meshStandardMaterial color="#f4c66a" roughness={0.38} metalness={0.2} />
        </mesh>
        <mesh position={[1.12, 1.85, 0]} rotation={[0, 0, -0.45]}>
          <boxGeometry args={[1.42, 0.2, 0.22]} />
          <meshStandardMaterial color="#b8d8ff" roughness={0.3} metalness={0.15} />
        </mesh>
        <mesh position={[-0.65, 0.34, 0]}>
          <boxGeometry args={[0.8, 0.44, 1.1]} />
          <meshStandardMaterial color="#1e5b4f" roughness={0.5} />
        </mesh>
      </group>
    </Canvas>
  )
}
