import { useQuery } from "@tanstack/react-query"
import { healthResponseSchema } from "@dentalops/contracts"

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

async function fetchHealth() {
  const res = await fetch(`${apiUrl}/api/v1/health`)
  if (!res.ok) throw new Error(`API responded ${res.status}`)
  return healthResponseSchema.parse(await res.json())
}

export function App() {
  const { data, isPending, isError } = useQuery({ queryKey: ["health"], queryFn: fetchHealth })

  if (isPending) return <p>Checking API…</p>
  if (isError) return <p>API unreachable</p>
  return (
    <p>
      API {data.status} — v{data.version}, up {data.uptimeSeconds}s
    </p>
  )
}
