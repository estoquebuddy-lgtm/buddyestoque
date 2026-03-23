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

const bgMap = {
  produto: 'bg-primary/10',
  ferramenta: 'bg-warning/10',
  pessoa: 'bg-info/10',
};

const iconColorMap = {
  produto: 'text-primary',
  ferramenta: 'text-warning',
  pessoa: 'text-info',
};

export default function ImageThumbnail({ src, alt, type = 'produto', size = 'sm' }: ImageThumbnailProps) {
  const sizeClass = size === 'sm' ? 'h-12 w-12' : 'h-14 w-14';
  const iconSize = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const Icon = iconMap[type];

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`${sizeClass} rounded-xl object-cover shrink-0 bg-muted`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-xl ${bgMap[type]} flex items-center justify-center shrink-0`}>
      <Icon className={`${iconSize} ${iconColorMap[type]}`} />
    </div>
  );
}
