import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import type { ProgressPhoto } from '@gymtracker/shared'

import { bodyApi } from '@/api/body'
import { photosApi } from '@/api/photos'
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

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PhotosPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { data: photos = [] } = useQuery({ queryKey: ['photos'], queryFn: photosApi.getPhotos })
  const { data: weights = [] } = useQuery({ queryKey: ['weights'], queryFn: bodyApi.getWeights })

  const latestWeight = weights[0]?.weightKg

  const upload = useMutation({
    mutationFn: (file: File) => photosApi.uploadPhoto(file, latestWeight),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['photos'] }),
  })

  const { mutate: deletePhoto, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => photosApi.deletePhoto(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      setPendingDeleteId(null)
    },
  })

  const pendingPhoto = photos.find((p: ProgressPhoto) => p.id === pendingDeleteId)

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-border flex items-start justify-between border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Progress</p>
          <h1 className="font-display font-700 text-3xl tracking-wide">PHOTOS</h1>
        </div>
        <button
          className="bg-primary text-primary-foreground mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-60"
          disabled={upload.isPending}
          type="button"
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? (
            <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
          ) : (
            <Plus size={16} strokeWidth={2.5} />
          )}
          Add Photo
        </button>
      </div>

      <input
        ref={fileRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        type="file"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            upload.mutate(file)
          }
          e.target.value = ''
        }}
      />

      {photos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
          <div className="bg-card border-border flex size-16 items-center justify-center rounded-2xl border">
            <Camera className="text-muted-foreground" size={28} />
          </div>
          <div className="text-center">
            <p className="font-semibold">No photos yet</p>
            <p className="text-muted-foreground mt-1 text-sm">Upload your first progress photo</p>
          </div>
          <button
            className="bg-primary text-primary-foreground font-display font-600 mt-2 rounded-xl px-5 py-2.5 text-sm tracking-wide uppercase transition-transform active:scale-95"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            Upload Photo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-0.5 p-0.5">
          {photos.map((p: ProgressPhoto) => (
            <div key={p.id} className="bg-card relative aspect-square">
              <img
                alt="Progress"
                className="h-full w-full object-cover"
                loading="lazy"
                src={`/api/photos/file/${p.thumbPath.split('/').pop()}`}
                onError={e => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />

              {/* delete button — top-right, large touch target */}
              <button
                aria-label="Delete photo"
                className="absolute top-0 right-0 flex size-14 items-center justify-center"
                type="button"
                onClick={() => setPendingDeleteId(p.id)}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                  <Trash2 className="text-white/90" size={16} strokeWidth={1.5} />
                </span>
              </button>

              {/* date + weight badge — bottom-left */}
              <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-6 pb-2">
                <p className="text-[11px] leading-tight font-semibold text-white/90">{formatDate(p.recordedAt)}</p>
                {p.bodyWeight && (
                  <p className="text-[11px] leading-tight font-medium text-white/70">{p.bodyWeight} kg</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete photo?</DialogTitle>
            <DialogDescription>
              {pendingPhoto
                ? `Photo from ${formatDate(pendingPhoto.recordedAt)} will be permanently removed.`
                : 'This photo will be permanently removed.'}{' '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button className="flex-1" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="flex-1"
              disabled={isDeleting}
              variant="destructive"
              onClick={() => pendingDeleteId && deletePhoto(pendingDeleteId)}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
