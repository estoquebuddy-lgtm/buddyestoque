import { Package, Wrench, User } from 'lucide-react';

interface ImageThumbnailProps {
  src?: string | null;
  alt: string;
  type?: 'produto' | 'ferramenta' | 'pessoa';
  size?: 'sm' | 'md';
}

const iconMap = {
  produto: Package,
  ferramenta: Wrench,
  pessoa: User,
};

export default function ImageThumbnail({ src, alt, type = 'produto', size = 'sm' }: ImageThumbnailProps) {
  const sizeClass = size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';
  const iconSize = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const Icon = iconMap[type];

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${sizeClass} rounded-lg object-cover shrink-0 bg-muted`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-lg bg-muted flex items-center justify-center shrink-0`}>
      <Icon className={`${iconSize} text-muted-foreground`} />
    </div>
  );
}
