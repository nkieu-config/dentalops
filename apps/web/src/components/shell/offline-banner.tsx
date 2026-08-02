import { WifiOff } from "lucide-react"
import { useOnline } from "../../lib/use-online"

export const OFFLINE_MESSAGE = "You are offline — changes are paused until you reconnect."

export const OFFLINE_BANNER_ID = "offline-banner"

export const OfflineBannerView = () => (
  <div
    id={OFFLINE_BANNER_ID}
    data-testid="offline-banner"
    className="flex items-center justify-center gap-2 bg-destructive px-4 py-1 text-center text-xs font-medium text-destructive-foreground"
  >
    <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    {OFFLINE_MESSAGE}
  </div>
)

export const OfflineBanner = () => {
  const online = useOnline()
  return (
    <div role="status" aria-live="polite">
      {online ? null : <OfflineBannerView />}
    </div>
  )
}
