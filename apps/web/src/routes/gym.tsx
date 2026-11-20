import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { EquipmentWithExercises } from '@gymtracker/shared'

import { equipmentApi } from '@/api/equipment'
import { AddEquipmentWizard } from '@/components/equipment/AddEquipmentWizard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function GymPage() {
  const { t } = useTranslation(['gym', 'equipment'])
  const queryClient = useQueryClient()
  const [showWizard, setShowWizard] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment'],
    queryFn: equipmentApi.list,
  })

  const { mutate: deleteEquipment, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => equipmentApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['equipment'] })
      setPendingDeleteId(null)
    },
  })

  const pendingItem = equipment.find((e: EquipmentWithExercises) => e.id === pendingDeleteId)

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-start justify-between border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('eyebrow')}</p>
          <h1 className="font-display font-700 text-3xl tracking-wide">{t('title')}</h1>
        </div>
        <button
          className="bg-primary text-primary-foreground mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-transform active:scale-95"
          type="button"
          onClick={() => setShowWizard(true)}
        >
          <Plus size={16} />
          {t('addEquipment')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="text-muted-foreground p-8 text-center text-sm">{t('loading')}</div>}

        {!isLoading && equipment.length === 0 && (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="font-semibold">{t('emptyTitle')}</p>
            <p className="text-muted-foreground text-sm">{t('emptyHint')}</p>
            <button
              className="bg-primary text-primary-foreground font-display font-600 rounded-xl px-5 py-2.5 text-sm tracking-wide uppercase transition-transform active:scale-95"
              type="button"
              onClick={() => setShowWizard(true)}
            >
              {t('addEquipment')}
            </button>
          </div>
        )}

        {equipment.map((item: EquipmentWithExercises) => (
          <div key={item.id} className="border-border/50 flex items-center gap-3 border-b px-4 py-3">
            <img
              alt={item.name}
              className="bg-muted size-14 flex-shrink-0 rounded-xl object-cover"
              loading="lazy"
              src={`/api/equipment/${item.id}/thumb`}
              onError={e => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {t(`equipment:equipmentTypes.${item.equipmentType ?? 'other'}`, {
                  defaultValue: item.equipmentType ?? 'other',
                })}
                , {t('exerciseCount', { count: item.exercises.length })}
              </p>
              {item.exercises.length > 0 && (
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {item.exercises
                    .slice(0, 3)
                    .map(e => e.name)
                    .join(', ')}
                  {item.exercises.length > 3 ? t('moreCount', { count: item.exercises.length - 3 }) : ''}
                </p>
              )}
            </div>
            <button
              aria-label={t('deleteEquipmentAria')}
              className="flex size-10 flex-shrink-0 items-center justify-center rounded-full transition-colors"
              type="button"
              onClick={() => setPendingDeleteId(item.id)}
            >
              <Trash2 className="text-muted-foreground" size={16} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {showWizard && (
        <AddEquipmentWizard
          onClose={() => setShowWizard(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['equipment'] })
            setShowWizard(false)
          }}
        />
      )}

      <Dialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {pendingItem ? t('deleteDescriptionNamed', { name: pendingItem.name }) : t('deleteDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button className="flex-1" variant="outline">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              className="flex-1"
              disabled={isDeleting}
              variant="destructive"
              onClick={() => pendingDeleteId && deleteEquipment(pendingDeleteId)}
            >
              {isDeleting ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
