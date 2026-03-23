import { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { uploadFile } from '@/lib/storage';

interface ImageUploadProps {
  bucket: string;
  currentUrl?: string | null;
  onUpload: (url: string) => void;
  accept?: string;
  label?: string;
}

export default function ImageUpload({ bucket, currentUrl, onUpload, accept = 'image/*', label }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview for images
    if (file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    }
    setUploading(true);

    const url = await uploadFile(bucket, file);
    setUploading(false);

    if (url) {
      onUpload(url);
      if (!file.type.startsWith('image/')) {
        setPreview(url);
      }
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-20 w-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden cursor-pointer border-2 border-dashed border-border hover:border-primary/50 transition-all active:scale-95 relative"
        onClick={() => inputRef.current?.click()}
      >
        {preview && accept === 'image/*' ? (
          <img src={preview} className="h-full w-full object-cover" alt="Preview" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Camera className="h-5 w-5 text-muted-foreground" />
            {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} capture="environment" className="hidden" onChange={handleFile} />
      {preview && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPreview(null); }} className="text-muted-foreground hover:text-destructive transition-colors">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
