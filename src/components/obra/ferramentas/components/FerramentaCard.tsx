import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, CheckCircle2, Hand, Pencil, Tag } from 'lucide-react';
import { FerramentaGroup } from '../types/ferramentas.types';

interface FerramentaCardProps {
  group: FerramentaGroup;
  isAdmin: boolean;
  onOpenDetails: (groupName: string) => void;
  onRetirar: (groupName: string) => void;
  onGerarLote: (groupName: string, categoria: string, totalComprado: number) => void;
  onAjustarSaldo: (groupName: string, totalComprado: number) => void;
}

export function FerramentaCard({
  group,
  isAdmin,
  onOpenDetails,
  onRetirar,
  onGerarLote,
  onAjustarSaldo
}: FerramentaCardProps) {
  return (
    <Card className="bg-[#151f32] border-slate-800 hover:border-slate-700 transition-all group overflow-hidden">
      <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
        {/* Topo do Card */}
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{group.name}</h3>
            <Badge variant="outline" className="text-[10px] bg-slate-900/50 text-slate-400 border-slate-700">
              <Layers className="h-3 w-3 mr-1" />
              {group.categoria}
            </Badge>
          </div>
          
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Saldo Físico</p>
            <span className="text-2xl font-display font-bold text-white leading-none">
              {group.totalComprado}
            </span>
            <span className="text-[10px] text-slate-500 ml-1 font-bold">UN</span>
          </div>
        </div>

        {/* Resumo de Status (Clickable to open Sheet) */}
        <div 
          onClick={() => onOpenDetails(group.name)}
          className="grid grid-cols-2 gap-2 bg-slate-900/50 rounded-xl p-3 border border-slate-800/50 cursor-pointer hover:bg-slate-800/50 transition-colors"
        >
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Disponível
            </p>
            <p className="text-lg font-bold text-emerald-400 leading-none">
              {group.disponivelCount}
            </p>
          </div>
          <div className="space-y-1 border-l border-slate-800 pl-2">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Hand className="h-3 w-3 text-amber-400" /> Em Uso
            </p>
            <p className="text-lg font-bold text-amber-400 leading-none">
              {group.emUsoList.length}
            </p>
          </div>
        </div>

        {/* Informações Extras se houver Quebra/Manutenção */}
        {(group.manutencaoCount > 0 || group.extraviadaCount > 0 || group.baixadaCount > 0) && (
          <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {group.manutencaoCount > 0 && <span className="text-red-400">{group.manutencaoCount} Manutenção</span>}
            {group.extraviadaCount > 0 && <span className="text-orange-400">{group.extraviadaCount} Extraviada</span>}
            {group.baixadaCount > 0 && <span className="text-rose-400">{group.baixadaCount} Baixa</span>}
          </div>
        )}

        {/* Ações Rápidas */}
        <div className="flex gap-2 pt-1 mt-auto">
          <Button
            size="sm"
            onClick={() => onRetirar(group.name)}
            disabled={group.disponivelCount <= 0}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-10 rounded-xl gap-1.5 shadow-md shadow-amber-500/10"
          >
            <Hand className="h-4 w-4" /> Retirar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onGerarLote(group.name, group.categoria, group.totalComprado)}
            className="h-10 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30 font-bold text-xs rounded-xl gap-1 shrink-0"
          >
            <Tag className="h-3.5 w-3.5" /> Lote
          </Button>

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAjustarSaldo(group.name, group.totalComprado)}
              className="h-10 px-3 border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl text-xs"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
