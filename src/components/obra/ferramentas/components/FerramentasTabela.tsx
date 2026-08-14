import { useState } from 'react';
import { FerramentaGroup, Ferramenta } from '../types/ferramentas.types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Hand, ListFilter, Wrench, Layers, CheckCircle2, Tag, ChevronDown } from 'lucide-react';

interface Props {
  toolGroups: FerramentaGroup[];
  onOpenGroup: (group: FerramentaGroup) => void;
  onQuickRetirar: (group: FerramentaGroup) => void;
  onAlterarPrefixo: (group: FerramentaGroup) => void;
  onIndividualizar?: (group: FerramentaGroup) => void;
  isLoading?: boolean;
}

export function FerramentasTabela({
  toolGroups,
  onOpenGroup,
  onQuickRetirar,
  onAlterarPrefixo,
  onIndividualizar,
  isLoading
}: Props) {
  const [displayLimit, setDisplayLimit] = useState(15);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800 animate-pulse">
        <p className="text-sm font-medium">Carregando relação de ferramentas...</p>
      </div>
    );
  }

  if (toolGroups.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-8">
        <Wrench className="h-12 w-12 mx-auto text-slate-600 mb-3" />
        <p className="text-white font-medium text-base">Nenhuma ferramenta localizada</p>
        <p className="text-xs text-slate-500 mt-1">Tente ajustar a busca ou adicionar novas ferramentas ao estoque.</p>
      </div>
    );
  }

  const visibleGroups = toolGroups.slice(0, displayLimit);
  const remainingCount = toolGroups.length - displayLimit;

  return (
    <div className="space-y-4">
      {/* Tabela Agrupada por Equipamento */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0f172a] shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800 font-bold">
            <tr>
              <th scope="col" className="px-5 py-4">Equipamento / Ferramenta</th>
              <th scope="col" className="px-4 py-4">Categoria</th>
              <th scope="col" className="px-4 py-4 text-center">Saldo Total</th>
              <th scope="col" className="px-4 py-4 text-center">Disponível</th>
              <th scope="col" className="px-4 py-4 text-center">Em Uso</th>
              <th scope="col" className="px-5 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {visibleGroups.map((group) => {
              // Garante remocao de [FERRAMENTA] do nome exibido
              const cleanName = group.name.replace(/\[FERRAMENTA\]\s*/g, '').trim();

              return (
                <tr key={group.name} className="hover:bg-slate-800/40 transition-colors group">
                  {/* Ferramenta */}
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => onOpenGroup(group)}
                      className="font-bold text-white hover:text-amber-400 text-left transition-colors cursor-pointer text-sm flex items-center gap-2"
                    >
                      <Wrench className="h-4 w-4 text-amber-400 shrink-0" />
                      {cleanName}
                    </button>
                    {(group.manutencaoCount > 0 || group.extraviadaCount > 0 || group.baixadaCount > 0) && (
                      <div className="flex gap-2 text-[10px] font-bold text-slate-500 mt-1">
                        {group.manutencaoCount > 0 && <span className="text-blue-400">{group.manutencaoCount} manutenção</span>}
                        {group.extraviadaCount > 0 && <span className="text-rose-400">{group.extraviadaCount} extraviada</span>}
                        {group.baixadaCount > 0 && <span className="text-slate-600">{group.baixadaCount} baixa</span>}
                      </div>
                    )}
                  </td>

                  {/* Categoria */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Badge variant="outline" className="text-xs bg-slate-900 text-slate-400 border-slate-700">
                      {group.categoria}
                    </Badge>
                  </td>

                  {/* Saldo Total */}
                  <td className="px-4 py-3.5 text-center font-bold text-white whitespace-nowrap">
                    {group.totalComprado} un
                  </td>

                  {/* Disponível */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-xs">
                      {group.disponivelCount} un
                    </span>
                  </td>

                  {/* Em Uso */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    {group.emUsoList.length > 0 ? (
                      <span className="font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 text-xs">
                        {group.emUsoList.length} un
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">0 un</span>
                    )}
                  </td>

                  {/* Ações */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {group.toolsInDb.length > 0 ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => onQuickRetirar(group)}
                            disabled={group.disponivelCount <= 0}
                            className="h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 shadow"
                          >
                            <Hand className="h-3.5 w-3.5" /> Retirar
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenGroup(group)}
                            className="h-8 bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800 font-bold text-xs gap-1.5"
                          >
                            <ListFilter className="h-3.5 w-3.5 text-amber-400" /> Ver Etiquetas ({group.toolsInDb.length})
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onAlterarPrefixo(group)}
                            className="h-8 px-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 text-xs font-bold gap-1"
                            title="Alterar o prefixo dos códigos deste equipamento"
                          >
                            ✏️ Prefixo
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => onIndividualizar?.(group)}
                          className="h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5"
                        >
                          <Tag className="h-3.5 w-3.5" /> Etiquetar / Individualizar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {remainingCount > 0 && (
        <div className="text-center pt-2">
          <Button
            variant="outline"
            onClick={() => setDisplayLimit(prev => prev + 25)}
            className="bg-slate-900 border-slate-800 text-amber-400 hover:text-amber-300 font-bold text-xs gap-2 px-6 py-2 shadow-lg"
          >
            <ChevronDown className="h-4 w-4" /> Carregar Mais Equipamentos ({remainingCount} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
