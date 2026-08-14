import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, Plus } from 'lucide-react';
import { FerramentaGroup } from '../types/ferramentas.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetGroup?: FerramentaGroup | null;
  produtosEstoque?: any[];
  onConfirm: (payload: { produtoId: string; prefixo: string; quantidade: number; nomeOverride?: string }) => Promise<void>;
}

export function IndividualizarModal({
  open,
  onOpenChange,
  targetGroup,
  produtosEstoque = [],
  onConfirm
}: Props) {
  const [prefixo, setPrefixo] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && targetGroup) {
      const cleanName = targetGroup.name.replace(/\[FERRAMENTA\]\s*/g, '').trim();
      const words = cleanName.split(/\s+/).filter(Boolean);
      let suggested = '';
      if (words.length >= 2) {
        suggested = (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
      } else if (words[0]?.length >= 3) {
        suggested = words[0].substring(0, 3).toUpperCase();
      }
      setPrefixo(suggested.normalize("NFD").replace(/[\u0300-\u036f]/g, "") || 'FERR');
      setQuantidade(String(targetGroup.totalComprado || 1));
    }
  }, [open, targetGroup]);

  if (!targetGroup) return null;

  const cleanName = targetGroup.name.replace(/\[FERRAMENTA\]\s*/g, '').trim();

  // Localiza o produto_id correspondente no estoque
  const matchedProd = targetGroup.productId || produtosEstoque.find(p => p.nome?.replace(/\[FERRAMENTA\]\s*/g, '').trim().toLowerCase() === cleanName.toLowerCase())?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantidade) || 1;
    if (qty <= 0 || !prefixo.trim()) return;

    setIsSubmitting(true);
    try {
      await onConfirm({
        produtoId: matchedProd,
        prefixo: prefixo.trim().toUpperCase(),
        quantidade: qty,
        nomeOverride: cleanName
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
            <Tag className="h-5 w-5 text-amber-400" />
            Etiquetar Ferramenta Existente
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <p className="text-xs text-slate-400">
            Gere os códigos individuais de etiquetagem para o produto cadastrado no estoque.
          </p>

          {/* Nome da Ferramenta (Apenas leitura para não duplicar) */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Equipamento no Estoque:</p>
            <p className="font-bold text-white text-sm">{cleanName}</p>
          </div>

          {/* Prefixo do Código & Quantidade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Prefixo do Código <span className="text-rose-400">*</span>
              </label>
              <Input
                value={prefixo}
                onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="Ex: ALP, FUR"
                required
                className="bg-slate-900 border-slate-800 text-amber-400 font-mono font-bold text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Quantidade de Unidades <span className="text-rose-400">*</span>
              </label>
              <Input
                type="number"
                min="1"
                max="500"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
                className="bg-slate-900 border-slate-800 text-white text-xs"
              />
            </div>
          </div>

          {/* Exemplo visual */}
          {prefixo && (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Etiquetas que serão geradas:</p>
              <p className="font-mono text-amber-400 font-bold">
                {prefixo.toUpperCase()}-01
                {Number(quantidade) > 1 && ` ... até ${prefixo.toUpperCase()}-${String(quantidade).padStart(2, '0')}`}
              </p>
            </div>
          )}

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-slate-900 border-slate-800 text-slate-400 hover:text-white text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !prefixo.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5"
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? 'Gerando Etiquetas...' : 'Criar Etiquetas'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
