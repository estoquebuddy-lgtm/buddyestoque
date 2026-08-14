import { FerramentaGroup, Ferramenta } from '../types/ferramentas.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, CheckCircle2, Hand, ListFilter, Wrench, Tag } from 'lucide-react';

interface Props {
  toolGroups: FerramentaGroup[];
  onOpenGroupDetails: (group: FerramentaGroup) => void;
  onQuickRetirar: (group: FerramentaGroup) => void;
  onIndividualizar: () => void;
  isLoading?: boolean;
}

export function FerramentasCards({
  toolGroups,
  onOpenGroupDetails,
  onQuickRetirar,
  onIndividualizar,
  isLoading
}: Props) {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800 animate-pulse">
        <p className="text-sm font-medium">Carregando grupos de equipamentos...</p>
      </div>
    );
  }

  if (toolGroups.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 p-8">
        <Wrench className="h-12 w-12 mx-auto text-slate-600 mb-3" />
        <p className="text-white font-medium text-base">Nenhum equipamento cadastrado ainda</p>
        <p className="text-xs text-slate-500 mt-1">Clique em "Individualizar Produto do Estoque" para gerar seu primeiro lote de etiquetas.</p>
        <Button
          onClick={onIndividualizar}
          className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5"
        >
          Individualizar Produto do Estoque
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {toolGroups.map((group) => (
        <Card key={group.name} className="bg-[#0f172a] border-slate-800 hover:border-slate-700 transition-all shadow-xl group overflow-hidden">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            {/* Cabeçalho do Card */}
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white uppercase tracking-wider">{group.name}</h3>
                <Badge variant="outline" className="text-[10px] bg-slate-900 text-slate-400 border-slate-700 font-bold">
                  <Layers className="h-3 w-3 mr-1 text-amber-400" />
                  {group.categoria}
                </Badge>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Total Físico</p>
                <span className="text-2xl font-bold text-white leading-none">
                  {group.totalComprado}
                </span>
                <span className="text-[10px] text-slate-500 ml-1 font-bold">UN</span>
              </div>
            </div>

            {/* Resumo Disponível vs Em Uso (Clicável para abrir lista de unidades) */}
            <div
              onClick={() => onOpenGroupDetails(group)}
              className="grid grid-cols-2 gap-2 bg-slate-900/80 rounded-xl p-3 border border-slate-800 cursor-pointer hover:bg-slate-800/80 transition-colors"
            >
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Disponível
                </p>
                <p className="text-xl font-bold text-emerald-400 leading-none">
                  {group.disponivelCount}
                </p>
              </div>

              <div className="space-y-1 border-l border-slate-800 pl-3">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Hand className="h-3 w-3 text-amber-400" /> Em Uso
                </p>
                <p className="text-xl font-bold text-amber-400 leading-none">
                  {group.emUsoList.length}
                </p>
              </div>
            </div>

            {/* Informações Extras se houver Manutenção/Extravio/Baixa */}
            {(group.manutencaoCount > 0 || group.extraviadaCount > 0 || group.baixadaCount > 0) && (
              <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-1">
                {group.manutencaoCount > 0 && <span className="text-blue-400">{group.manutencaoCount} em Manutenção</span>}
                {group.extraviadaCount > 0 && <span className="text-rose-400">{group.extraviadaCount} Extraviada</span>}
                {group.baixadaCount > 0 && <span className="text-slate-500">{group.baixadaCount} Baixada</span>}
              </div>
            )}

            {/* Ações Rápidas */}
            <div className="flex gap-2 pt-2 border-t border-slate-800/80">
              {group.toolsInDb.length > 0 ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => onQuickRetirar(group)}
                    disabled={group.disponivelCount <= 0}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-9 gap-1.5 shadow-md"
                  >
                    <Hand className="h-3.5 w-3.5" /> Retirar
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenGroupDetails(group)}
                    className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800 font-bold text-xs gap-1.5"
                  >
                    <ListFilter className="h-3.5 w-3.5 text-amber-400" /> Ver Unidades ({group.toolsInDb.length})
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={onIndividualizar}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-9 gap-1.5 shadow-md"
                >
                  <Tag className="h-3.5 w-3.5" /> Individualizar / Etiquetar Produto
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
