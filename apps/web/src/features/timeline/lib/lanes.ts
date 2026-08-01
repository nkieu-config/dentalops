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

export interface LaneSubject {
  id: string
  dentistId: string
  startsAt: string
  endsAt: string
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

export const layoutByDentist = (
  subjects: readonly LaneSubject[]
): Map<string, LanePosition> => {
  const byDentist = new Map<string, LaneItem[]>()
  for (const subject of subjects) {
    const items = byDentist.get(subject.dentistId) ?? []
    items.push({
      id: subject.id,
      start: Date.parse(subject.startsAt),
      end: Date.parse(subject.endsAt)
    })
    byDentist.set(subject.dentistId, items)
  }
  const positions = new Map<string, LanePosition>()
  for (const items of byDentist.values()) {
    for (const [id, position] of layoutLanes(items)) positions.set(id, position)
  }
  return positions
}
