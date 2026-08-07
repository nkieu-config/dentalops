import { LazyMotion, MotionConfig, domAnimation } from "motion/react"
import type { ReactNode } from "react"

export const MotionProvider = ({ children }: { children: ReactNode }) => <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user">{children}</MotionConfig></LazyMotion>
