export function dragMoved(startX: number, startY: number, x: number, y: number, threshold = 6): boolean {
  return Math.abs(x - startX) + Math.abs(y - startY) > threshold
}

export function computeHandDropIndex(
  handIds: number[],
  draggedCid: number,
  dropX: number,
  centerXOf: (cid: number) => number | undefined,
): number {
  const others = handIds.filter((cid) => cid !== draggedCid)
  return others.reduce((n, cid) => {
    const x = centerXOf(cid)
    return x !== undefined && dropX > x ? n + 1 : n
  }, 0)
}
