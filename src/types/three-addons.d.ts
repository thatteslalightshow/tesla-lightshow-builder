// Re-export type declarations for three.js JSM extras that lack a `types`
// condition in their exports map under `moduleResolution: bundler`.
declare module 'three/examples/jsm/controls/OrbitControls' {
  export { OrbitControls, OrbitControlsEventMap } from '@types/three/examples/jsm/controls/OrbitControls';
}

declare module 'three/examples/jsm/environments/RoomEnvironment' {
  export { RoomEnvironment } from '@types/three/examples/jsm/environments/RoomEnvironment';
}

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  export { GLTFLoader, GLTF } from '@types/three/examples/jsm/loaders/GLTFLoader';
}
