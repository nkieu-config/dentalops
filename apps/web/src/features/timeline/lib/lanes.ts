export interface LaneItem {
  id: string
  start: number
  end: number
}

export interface LanePosition {
  id: string
  lane: number
  lanes: number
}

export const layoutLanes = (items: LaneItem[]): Map<string, LanePosition> => {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  )
  const result = new Map<string, LanePosition>()
  let laneEnds: number[] = []
  let cluster: string[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flush = () => {
    for (const id of cluster) {
      const placed = result.get(id)
      if (placed) placed.lanes = laneEnds.length
    }
    cluster = []
    laneEnds = []
  }

  for (const current of sorted) {
    if (current.start >= clusterEnd) {
      flush()
      clusterEnd = current.end
    } else {
      clusterEnd = Math.max(clusterEnd, current.end)
    }
    let lane = laneEnds.findIndex((end) => end <= current.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(current.end)
    } else {
      laneEnds[lane] = current.end
    }
    result.set(current.id, { id: current.id, lane, lanes: 0 })
    cluster.push(current.id)
  }
  flush()
  return result
}
