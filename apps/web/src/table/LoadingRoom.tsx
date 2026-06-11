// LoadingRoom.tsx — shown after entering a room but before the client VM has
// booted + processed EnterRoom (the ~10s window while game files load over the
// wire). Without this the user saw an empty "等待房间 · 0/?" with Ready/Leave
// buttons that looked like an error and invited misclicks (W1-1 3b).

export function LoadingRoom() {
  return (
    <div style={styles.wrap}>
      {/* self-contained keyframe (no global stylesheet in this app) */}
      <style>{'@keyframes fk-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={styles.spinner} />
      <div style={styles.title}>正在进入房间…</div>
      <div style={styles.sub}>正在接收游戏文件,请稍候(首次可能需要十几秒)</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#dfe', fontFamily: 'system-ui, sans-serif' },
  spinner: { width: 46, height: 46, borderRadius: '50%', border: '4px solid rgba(255,255,255,.2)', borderTopColor: '#cfe', animation: 'fk-spin 0.9s linear infinite' },
  title: { fontSize: 18, fontWeight: 600 },
  sub: { fontSize: 13, color: '#9cb' },
}
