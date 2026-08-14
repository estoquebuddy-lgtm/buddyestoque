import { useState, useEffect } from 'react';
import { Ferramenta } from '../types/ferramentas.types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Hand, RotateCcw, Wrench, AlertTriangle, Trash2 } from 'lucide-react';

export type TipoAcaoModal = 'RETIRADA' | 'DEVOLUCAO' | 'MANUTENCAO' | 'RETORNO_MANUTENCAO' | 'EXTRAVIO' | 'BAIXA' | null;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoAcao: TipoAcaoModal;
  ferramenta: Ferramenta | null;
  availableUnits?: Ferramenta[];
  funcionarios: { id: string; nome: string }[];
  onConfirm: (payload: { ferramentaId: string; funcionarioId?: string; observacao?: string }) => Promise<void>;
}

export function MovimentacaoModal({
  open,
  onOpenChange,
  tipoAcao,
  ferramenta,
  availableUnits = [],
  funcionarios,
  onConfirm
}: Props) {
  const [selectedFerramentaId, setSelectedFerramentaId] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const targetTool = availableUnits.find(u => u.id === selectedFerramentaId) || ferramenta;

  useEffect(() => {
    if (open) {
      setFuncionarioId('');
      setObservacao('');
      if (ferramenta) {
        setSelectedFerramentaId(ferramenta.id);
      } else if (availableUnits.length > 0) {
        setSelectedFerramentaId(availableUnits[0].id);
      }
    }
  }, [open, ferramenta, availableUnits]);

  if (!tipoAcao || !ferramenta) return null;

  const getModalConfig = () => {
    switch (tipoAcao) {
      case 'RETIRADA':
        return {
          title: `Retirar Ferramenta (${ferramenta.codigo})`,
          icon: <Hand className="h-5 w-5 text-amber-400" />,
          btnLabel: 'Confirmar Retirada',
          btnClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold',
          needsFuncionario: true
        };
      case 'DEVOLUCAO':
        return {
          title: `Devolver Ferramenta (${ferramenta.codigo})`,
          icon: <RotateCcw className="h-5 w-5 text-emerald-400" />,
          btnLabel: 'Confirmar Devolução',
          btnClass: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold',
          needsFuncionario: false
        };
      case 'MANUTENCAO':
        return {
          title: `Enviar para Manutenção (${ferramenta.codigo})`,
          icon: <Wrench className="h-5 w-5 text-blue-400" />,
          btnLabel: 'Confirmar Manutenção',
          btnClass: 'bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold',
          needsFuncionario: false
        };
      case 'RETORNO_MANUTENCAO':
        return {
          title: `Retornar da Manutenção (${ferramenta.codigo})`,
          icon: <Wrench className="h-5 w-5 text-emerald-400" />,
          btnLabel: 'Retornar ao Galpão',
          btnClass: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold',
          needsFuncionario: false
        };
      case 'EXTRAVIO':
        return {
          title: `Registrar Extravio (${ferramenta.codigo})`,
          icon: <AlertTriangle className="h-5 w-5 text-rose-400" />,
          btnLabel: 'Confirmar Extravio',
          btnClass: 'bg-rose-500 hover:bg-rose-400 text-white font-bold',
          needsFuncionario: false
        };
      case 'BAIXA':
        return {
          title: `Registrar Baixa Definitiva (${ferramenta.codigo})`,
          icon: <Trash2 className="h-5 w-5 text-slate-400" />,
          btnLabel: 'Confirmar Baixa Definitiva',
          btnClass: 'bg-slate-700 hover:bg-slate-600 text-white font-bold',
          needsFuncionario: false
        };
      default:
        return { title: 'Movimentação', icon: null, btnLabel: 'Salvar', btnClass: '', needsFuncionario: false };
    }
  };

  const config = getModalConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (config.needsFuncionario && !funcionarioId) return;

    setIsSubmitting(true);
    try {
      await onConfirm({
        ferramentaId: targetTool?.id || ferramenta.id,
        funcionarioId: config.needsFuncionario ? funcionarioId : undefined,
        observacao: observacao.trim() || undefined
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f172a] border border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            {config.icon}
            {config.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Resumo do Item */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 text-xs">
            <p className="text-slate-400">Equipamento / Ferramenta:</p>
            <p className="font-bold text-white text-sm">
              <span className="text-amber-400 font-mono mr-2">[{ferramenta.codigo}]</span>
              {ferramenta.produtos?.nome || ferramenta.nome}
            </p>
            {ferramenta.pessoas?.nome && (
              <p className="text-slate-400 mt-1">
                Responsável atual: <span className="text-white font-bold">{ferramenta.pessoas.nome}</span>
              </p>
            )}
          </div>

          {/* Escolha da Etiqueta se houver mais de uma disponível */}
          {tipoAcao === 'RETIRADA' && availableUnits.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Selecione a Etiqueta / Código a Retirar <span className="text-rose-400">*</span>
              </label>
              <Select value={selectedFerramentaId} onValueChange={setSelectedFerramentaId}>
                <SelectTrigger className="bg-slate-900 border-slate-800 text-amber-400 font-mono font-bold">
                  <SelectValue placeholder="Selecione a etiqueta..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-60">
                  {availableUnits
                    .slice()
                    .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, { numeric: true, sensitivity: 'base' }))
                    .map((unit) => (
                      <SelectItem key={unit.id} value={unit.id} className="font-mono">
                        🏷️ {unit.codigo}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seleção de Funcionário (apenas quando necessário) */}
          {config.needsFuncionario && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Funcionário Responsável <span className="text-rose-400">*</span>
              </label>
              <Select value={funcionarioId} onValueChange={setFuncionarioId} required>
                <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                  <SelectValue placeholder="Selecione quem está retirando..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-60">
                  {funcionarios.map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Observação / Detalhes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Observação / Nota (opcional)</label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Utilizar na concretagem da laje 2, entregue com chave extra..."
              className="bg-slate-900 border-slate-800 text-white text-xs resize-none h-20"
            />
          </div>

          <DialogFooter className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1 bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (config.needsFuncionario && !funcionarioId)}
              className={`flex-1 ${config.btnClass}`}
            >
              {isSubmitting ? 'Processando...' : config.btnLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
