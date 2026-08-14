export interface BrandMarkProps {
  className?: string
}

export const BrandMark = ({ className }: BrandMarkProps) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <rect width="32" height="32" rx="9" fill="var(--decorative)" />
    <rect x="9" y="8" width="4" height="16" rx="2" fill="var(--primary-foreground)" />
    <path d="M12 8 H15 A8 8 0 0 1 15 24 H12 Z" fill="var(--primary-foreground)" />
  </svg>
)
