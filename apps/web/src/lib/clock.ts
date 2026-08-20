const pinned = import.meta.env.VITE_E2E_NOW ? Date.parse(import.meta.env.VITE_E2E_NOW) : undefined

export const nowMs = (): number => pinned ?? Date.now()
