import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { photosApi } from '@/api/photos';
import { Button } from '@/components/ui/button';

export function PhotosPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: photos = [] } = useQuery({ queryKey: ['photos'], queryFn: photosApi.getPhotos });

  const upload = useMutation({
    mutationFn: (file: File) => photosApi.uploadPhoto(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['photos'] }),
  });

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Progress Photos</h1>
      <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
        {upload.isPending ? 'Uploading...' : 'Upload Photo'}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        {(photos as any[]).map((p: any) => (
          <img
            key={p.id}
            src={`/api/photos/file/${p.thumbPath.split('/').pop()}`}
            alt="Progress photo"
            className="w-full aspect-square object-cover rounded-lg"
          />
        ))}
      </div>
      {(photos as any[]).length === 0 && (
        <p className="text-muted-foreground text-center">No photos yet. Upload your first progress photo!</p>
      )}
    </div>
  );
}
