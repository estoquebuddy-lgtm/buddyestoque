import { FerramentaCard } from './FerramentaCard';
import { FerramentaGroup } from '../types/ferramentas.types';

interface FerramentasListProps {
  toolGroups: FerramentaGroup[];
  isAdmin: boolean;
  onOpenDetails: (groupName: string) => void;
  onRetirar: (groupName: string) => void;
  onGerarLote: (groupName: string, categoria: string, totalComprado: number) => void;
  onAjustarSaldo: (groupName: string, totalComprado: number) => void;
}

export function FerramentasList({
  toolGroups,
  isAdmin,
  onOpenDetails,
  onRetirar,
  onGerarLote,
  onAjustarSaldo
}: FerramentasListProps) {
  if (toolGroups.length === 0) {
    return (
      <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
        <p className="text-slate-400 font-bold mb-2">Nenhuma ferramenta encontrada</p>
        <p className="text-sm text-slate-500">Tente buscar por outro termo ou cadastre um novo item.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {toolGroups.map(group => (
        <FerramentaCard
          key={group.name}
          group={group}
          isAdmin={isAdmin}
          onOpenDetails={onOpenDetails}
          onRetirar={onRetirar}
          onGerarLote={onGerarLote}
          onAjustarSaldo={onAjustarSaldo}
        />
      ))}
    </div>
  );
}
