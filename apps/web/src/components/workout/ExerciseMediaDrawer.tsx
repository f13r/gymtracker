import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useExerciseMedia } from '@/hooks/useExerciseMedia'

export function ExerciseMediaDrawer({
  exerciseName,
  wgerId,
  open,
  onOpenChange,
}: {
  exerciseName: string
  wgerId: number | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading } = useExerciseMedia(wgerId)
  const imageUrl = data?.imageUrl
  const description = data?.description

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="pb-2 text-center">
          <DrawerTitle className="text-lg">{exerciseName}</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-h-48 flex-col items-center gap-4 overflow-y-auto px-4 pb-6">
          {isLoading && <p className="text-muted-foreground mt-8 text-sm">Loading…</p>}
          {!isLoading && !imageUrl && !description && (
            <p className="text-muted-foreground mt-8 text-sm">No demonstration available</p>
          )}
          {imageUrl && (
            <img
              alt={`${exerciseName} demonstration`}
              // wger images are black line art on a transparent background — invisible on the dark
              // drawer, so render them on white.
              className="max-h-64 w-auto rounded-xl bg-white object-contain p-2"
              src={imageUrl}
            />
          )}
          {description && (
            <p className="text-muted-foreground max-w-prose text-sm leading-relaxed whitespace-pre-line">
              {description}
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
