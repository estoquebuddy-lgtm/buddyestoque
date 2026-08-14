import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Hand, UserCheck } from 'lucide-react';
import { useState, useMemo } from 'react';

interface RetirarFerramentaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  specificToolId: string | null;
  toolsInGroup: any[];
  pessoas: any[];
  onConfirm: (toolId: string, pessoaId: string, observacao: string) => void;
  isPending: boolean;
}

export function RetirarFerramentaDialog({
  open,
  onOpenChange,
  groupName,
  specificToolId,
  toolsInGroup,
  pessoas,
  onConfirm,
  isPending
}: RetirarFerramentaDialogProps) {
  const [pessoaId, setPessoaId] = useState('');
  const [pessoaSearch, setPessoaSearch] = useState('');
  const [showPessoaList, setShowPessoaList] = useState(false);
  const [observacao, setObservacao] = useState('');

  const filteredPessoas = useMemo(() => {
    if (!pessoaSearch.trim()) return pessoas.filter(p => p.status === 'ativo').slice(0, 5);
    const term = pessoaSearch.toLowerCase();
    return pessoas.filter(p => p.nome.toLowerCase().includes(term) && p.status === 'ativo').slice(0, 8);
  }, [pessoas, pessoaSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pessoaId) return;

    // Se tiver specificToolId, usa ele, senão pega a primeira disponível do grupo
    let toolIdToUse = specificToolId;
    if (!toolIdToUse) {
      const avail = toolsInGroup.find(t => t.status === 'DISPONIVEL' || (!t.status && t.estado === 'disponivel'));
      if (avail) toolIdToUse = avail.id;
    }

    if (toolIdToUse) {
      onConfirm(toolIdToUse, pessoaId, observacao);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f172a] border border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Hand className="h-5 w-5 text-amber-400" />
            Retirar Ferramenta
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl text-xs space-y-1">
            <p className="text-slate-400">Ferramenta Solicitada:</p>
            <p className="font-bold text-white text-base">{groupName}</p>
            {specificToolId && (
              <p className="text-amber-400 font-mono mt-1">Unidade Específica Selecionada</p>
            )}
          </div>

          <div className="space-y-1 relative">
            <label className="text-xs text-slate-300 font-bold">Quem está retirando? *</label>
            <div 
              className={`flex items-center gap-2 h-12 px-3 border rounded-xl bg-slate-900 cursor-pointer ${pessoaId ? 'border-amber-500/50 text-white' : 'border-slate-800 text-slate-400'}`}
              onClick={() => { setShowPessoaList(true); setPessoaSearch(''); }}
            >
              <UserCheck className={`h-4 w-4 ${pessoaId ? 'text-amber-400' : 'text-slate-500'}`} />
              <span className="font-bold">
                {pessoaId ? pessoas.find(p => p.id === pessoaId)?.nome : 'Selecionar Funcionário...'}
              </span>
            </div>

            {showPessoaList && (
              <div className="absolute top-[65px] left-0 right-0 bg-slate-800 border border-slate-700 rounded-xl p-2 z-50 shadow-2xl">
                <input
                  type="text"
                  autoFocus
                  placeholder="Buscar funcionário..."
                  value={pessoaSearch}
                  onChange={e => setPessoaSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg h-10 px-3 text-white text-sm mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredPessoas.map(p => (
                    <div
                      key={p.id}
                      onClick={() => { setPessoaId(p.id); setShowPessoaList(false); }}
                      className="px-3 py-2 hover:bg-slate-700 rounded-lg cursor-pointer text-sm font-bold text-slate-300"
                    >
                      {p.nome}
                    </div>
                  ))}
                  {filteredPessoas.length === 0 && (
                    <div className="text-center py-3 text-xs text-slate-500">Nenhum funcionário ativo encontrado</div>
                  )}
                </div>
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowPessoaList(false)}
                  className="w-full mt-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={isPending || !pessoaId}
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl"
          >
            {isPending ? 'Registrando...' : 'Confirmar Retirada'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
