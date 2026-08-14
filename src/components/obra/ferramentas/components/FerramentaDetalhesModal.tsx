import { useState, useEffect } from 'react';
import { Ferramenta, FerramentaMovimentacao } from '../types/ferramentas.types';
import { ferramentasService } from '../services/ferramentas.service';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Info, History, ArrowUpFromLine, RotateCcw, Wrench, AlertTriangle, Trash2, User } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ferramenta: Ferramenta | null;
}

export function FerramentaDetalhesModal({ open, onOpenChange, ferramenta }: Props) {
  const [movimentacoes, setMovimentacoes] = useState<FerramentaMovimentacao[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (open && ferramenta) {
      setIsLoadingHistory(true);
      ferramentasService.fetchHistoricoFerramenta(ferramenta.id)
        .then(data => setMovimentacoes(data))
        .catch(err => console.error("Erro ao carregar histórico da ferramenta:", err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [open, ferramenta]);

  if (!ferramenta) return null;

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'RETIRADA':
        return <ArrowUpFromLine className="h-3.5 w-3.5 text-amber-400" />;
      case 'DEVOLUCAO':
        return <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />;
      case 'MANUTENCAO':
        return <Wrench className="h-3.5 w-3.5 text-blue-400" />;
      case 'RETORNO_MANUTENCAO':
        return <Wrench className="h-3.5 w-3.5 text-emerald-400" />;
      case 'EXTRAVIO':
        return <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />;
      case 'BAIXA':
        return <Trash2 className="h-3.5 w-3.5 text-slate-400" />;
      default:
        return <Info className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f172a] border border-slate-800 text-white max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Info className="h-5 w-5 text-amber-400" />
            Ficha Detalhada da Ferramenta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Header Principal */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                {ferramenta.codigo}
              </span>
              <Badge variant="outline" className="text-xs font-bold border-slate-700">
                {ferramenta.status}
              </Badge>
            </div>
            <h3 className="text-lg font-bold text-white">
              {ferramenta.produtos?.nome || ferramenta.nome}
            </h3>
            {ferramenta.produtos?.categoria && (
              <p className="text-xs text-slate-400">Categoria: {ferramenta.produtos.categoria}</p>
            )}
          </div>

          {/* Dados Gerais */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-1">
              <p className="text-slate-400">Responsável Atual:</p>
              <p className="font-bold text-white flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-amber-400" />
                {ferramenta.pessoas?.nome || 'Nenhum (No Galpão)'}
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-1">
              <p className="text-slate-400">Última Movimentação:</p>
              <p className="font-bold text-white">
                {ferramenta.ultima_movimentacao ? new Date(ferramenta.ultima_movimentacao).toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
          </div>

          {ferramenta.observacoes && (
            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs space-y-1">
              <p className="text-slate-400 font-bold">Observações:</p>
              <p className="text-slate-300 italic">{ferramenta.observacoes}</p>
            </div>
          )}

          {/* Timeline de Histórico */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <History className="h-4 w-4 text-amber-400" />
              Linha do Tempo de Movimentações
            </h4>

            {isLoadingHistory ? (
              <p className="text-xs text-slate-500 text-center py-6">Carregando histórico...</p>
            ) : movimentacoes.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Nenhuma movimentação registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {movimentacoes.map((mov) => (
                  <div key={mov.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs flex items-start gap-3">
                    <div className="p-1.5 bg-slate-800 rounded-lg mt-0.5 shrink-0">
                      {getTipoIcon(mov.tipo)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-white">{mov.tipo}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(mov.data_hora).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {mov.pessoas?.nome && (
                        <p className="text-slate-300 mt-0.5">
                          Funcionário: <span className="font-bold text-amber-400">{mov.pessoas.nome}</span>
                        </p>
                      )}
                      {mov.observacao && (
                        <p className="text-slate-400 text-[11px] mt-1 italic">
                          "{mov.observacao}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
