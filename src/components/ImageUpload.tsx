import { useState, useRef } from 'react';
import { Camera, X } from 'lucide-react';
import { uploadFile } from '@/lib/storage';

interface ImageUploadProps {
  bucket: string;
  currentUrl?: string | null;
  onUpload: (url: string) => void;
}

export default function ImageUpload({ bucket, currentUrl, onUpload }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    const url = await uploadFile(bucket, file);
    setUploading(false);

    if (url) {
      onUpload(url);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-20 w-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden cursor-pointer border-2 border-dashed border-border hover:border-primary/50 transition-colors relative"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} className="h-full w-full object-cover" alt="Preview" />
        ) : (
          <Camera className="h-6 w-6 text-muted-foreground" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">...</span>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {preview && (
        <button type="button" onClick={() => { setPreview(null); }} className="text-muted-foreground hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
