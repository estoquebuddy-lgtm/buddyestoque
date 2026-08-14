import { useMemo } from 'react';
import { Ferramenta } from '../types/ferramentas.types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, User, Wrench, ShieldAlert } from 'lucide-react';

interface Props {
  ferramentas: Ferramenta[];
  onDevolver: (ferramenta: Ferramenta) => void;
  isLoading?: boolean;
}

export function FerramentasPorFuncionario({ ferramentas, onDevolver, isLoading }: Props) {
  // Agrupa as ferramentas EM USO por responsável
  const agrupadoPorFuncionario = useMemo(() => {
    const map = new Map<string, { funcionarioId: string; funcionarioNome: string; ferramentas: Ferramenta[] }>();

    ferramentas.forEach((f) => {
      if (f.status !== 'EM_USO' || !f.responsavel_id) return;

      const funcId = f.responsavel_id;
      const funcNome = f.pessoas?.nome || 'Funcionário Não Identificado';

      const existing = map.get(funcId) || { funcionarioId: funcId, funcionarioNome: funcNome, ferramentas: [] };
      existing.ferramentas.push(f);
      map.set(funcId, existing);
    });

    return Array.from(map.values()).sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome));
  }, [ferramentas]);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800 animate-pulse">
        <p className="text-sm font-medium">Carregando mapa de responsáveis...</p>
      </div>
    );
  }

  if (agrupadoPorFuncionario.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 p-8">
        <User className="h-12 w-12 mx-auto text-slate-600 mb-3" />
        <p className="text-white font-medium text-base">Nenhuma ferramenta em posse de funcionários no momento</p>
        <p className="text-xs text-slate-500 mt-1">Todas as ferramentas etiquetadas estão disponíveis no almoxarifado ou em manutenção.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {agrupadoPorFuncionario.map((item) => (
        <div key={item.funcionarioId} className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          {/* Header do Funcionário */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                <User className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">{item.funcionarioNome}</h3>
                <p className="text-[11px] text-slate-400">Responsável por {item.ferramentas.length} equipamento(s)</p>
              </div>
            </div>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-bold">
              {item.ferramentas.length} em uso
            </Badge>
          </div>

          {/* Lista de Ferramentas com o Funcionário */}
          <div className="space-y-2.5">
            {item.ferramentas.map((f) => (
              <div key={f.id} className="p-3 bg-slate-900/80 border border-slate-800/60 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      {f.codigo}
                    </span>
                    <p className="font-bold text-white text-xs truncate">
                      {f.produtos?.nome || f.nome}
                    </p>
                  </div>
                  {f.data_retirada && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Retirado em: {new Date(f.data_retirada).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={() => onDevolver(f)}
                  className="h-7 px-2.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 text-[11px] font-bold gap-1 shrink-0"
                >
                  <RotateCcw className="h-3 w-3" /> Devolver
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
