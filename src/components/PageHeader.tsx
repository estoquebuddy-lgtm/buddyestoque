import { ReactNode } from 'react';
import SearchBar from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  count?: number;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export default function PageHeader({
  title,
  count,
  search,
  onSearchChange,
  searchPlaceholder,
  actionLabel,
  onAction,
  children,
}: PageHeaderProps) {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="lg:hidden -ml-1" />
        <div className="flex-1 flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-display font-bold">
            {title}
            {count !== undefined && (
              <span className="text-muted-foreground font-normal text-base ml-2">({count})</span>
            )}
          </h1>
          {actionLabel && onAction && (
            <Button onClick={onAction} size="sm" className="rounded-lg">
              <Plus className="h-4 w-4 mr-1.5" />
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
      {onSearchChange && (
        <SearchBar
          value={search || ''}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      )}
      {children}
    </div>
  );
}
