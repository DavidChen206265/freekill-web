/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Vite asset import suffixes used by the VM layer.
declare module '*.wasm?url' {
  const url: string
  export default url
}
