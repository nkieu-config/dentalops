import * as TabsPrimitive from "@radix-ui/react-tabs"

export const Tabs = TabsPrimitive.Root
export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => <TabsPrimitive.List className={`inline-flex gap-1 rounded-control bg-secondary p-1 ${className ?? ""}`} {...props} />
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => <TabsPrimitive.Trigger className={`rounded-control px-3 py-1.5 text-sm font-semibold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`} {...props} />
export const TabsContent = TabsPrimitive.Content
