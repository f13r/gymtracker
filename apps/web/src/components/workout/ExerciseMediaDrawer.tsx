import { exercisesApi } from '@/api/exercises'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

export function ExerciseMediaDrawer({
  exerciseId,
  exerciseName,
  description,
  hasImage,
  open,
  onOpenChange,
}: {
  exerciseId: string | null | undefined
  exerciseName: string
  description: string | null | undefined
  hasImage: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="pb-2 text-center">
          <DrawerTitle className="text-lg">{exerciseName}</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-h-48 flex-col items-center gap-4 overflow-y-auto px-4 pb-6">
          {!hasImage && !description && (
            <p className="text-muted-foreground mt-8 text-sm">No demonstration available</p>
          )}
          {hasImage && exerciseId && (
            <img
              alt={`${exerciseName} demonstration`}
              className="bg-muted max-h-64 w-auto rounded-xl object-contain p-2"
              src={exercisesApi.imageUrl(exerciseId)}
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
