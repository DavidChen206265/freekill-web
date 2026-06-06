/// <reference types="vite/client" />

// Vite asset import suffixes used by the VM layer.
declare module '*.wasm?url' {
  const url: string
  export default url
}
