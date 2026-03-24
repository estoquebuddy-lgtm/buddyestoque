import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileUp, Loader2, Check, Package } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface XmlItem {
  nome: string;
  quantidade: number;
}

interface Props {
  obraId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseNFeXml(xmlText: string): XmlItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items: XmlItem[] = [];

  // Try NFe det elements
  const dets = doc.getElementsByTagName('det');
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i];
    const prod = det.getElementsByTagName('prod')[0];
    if (!prod) continue;

    const xProd = prod.getElementsByTagName('xProd')[0]?.textContent?.trim();
    const qCom = prod.getElementsByTagName('qCom')[0]?.textContent?.trim();

    if (xProd && qCom) {
      items.push({
        nome: xProd,
        quantidade: parseFloat(qCom) || 0,
      });
    }
  }

  return items.filter(i => i.quantidade > 0);
}

export default function ImportXmlDialog({ obraId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<XmlItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  const reset = () => {
    setItems([]);
    setStep('upload');
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseNFeXml(text);
      if (parsed.length === 0) {
        toast.error('Nenhum item encontrado no XML');
        return;
      }
      setItems(parsed);
      setStep('review');
    };
    reader.readAsText(file);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get existing products for this obra
      const { data: existingProducts } = await supabase
        .from('produtos')
        .select('id, nome')
        .eq('obra_id', obraId);

      const productMap = new Map<string, string>();
      (existingProducts || []).forEach(p => {
        productMap.set(p.nome.toLowerCase().trim(), p.id);
      });

      for (const item of items) {
        const key = item.nome.toLowerCase().trim();
        let produtoId = productMap.get(key);

        // Create product if it doesn't exist
        if (!produtoId) {
          const { data: newProd, error: prodErr } = await supabase
            .from('produtos')
            .insert({
              obra_id: obraId,
              nome: item.nome.trim(),
              unidade: 'un',
              estoque_atual: 0,
              estoque_minimo: 0,
            })
            .select('id')
            .single();

          if (prodErr) throw prodErr;
          produtoId = newProd.id;
          productMap.set(key, produtoId);

          await supabase.from('logs_atividades').insert({
            obra_id: obraId,
            user_id: user?.id,
            user_email: user?.email,
            acao: 'CADASTRAR',
            entidade: 'PRODUTO',
            detalhes: `Cadastrou o produto via XML: ${item.nome.trim()}`
          });
        }

        // Create entrada
        const { error: entErr } = await supabase.from('entradas').insert({
          obra_id: obraId,
          produto_id: produtoId,
          quantidade: item.quantidade,
        });
        if (entErr) throw entErr;

        await supabase.from('logs_atividades').insert({
          obra_id: obraId,
          user_id: user?.id,
          user_email: user?.email,
          acao: 'ENTRADA',
          entidade: 'ESTOQUE',
          detalhes: `Entrada via XML: ${item.quantidade} un de ${item.nome.trim()}`
        });
      }

      // Save XML import record
      await supabase.from('importacoes_xml' as any).insert({
        obra_id: obraId,
        total_itens: items.length,
      });

      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      queryClient.invalidateQueries({ queryKey: ['importacoes-xml', obraId] });
      toast.success(`${items.length} item(ns) importado(s) com sucesso!`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar XML');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar XML de Nota Fiscal</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileUp className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Selecione o arquivo XML da nota fiscal para importar os itens automaticamente.
            </p>
            <Button variant="outline" className="h-12" onClick={() => fileRef.current?.click()}>
              Selecionar arquivo XML
            </Button>
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {items.length} item(ns) encontrado(s). Confira e confirme a entrada:
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.nome}</p>
                  </div>
                  <span className="text-sm font-bold text-primary whitespace-nowrap">
                    +{item.quantidade}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={reset} disabled={loading}>
                Cancelar
              </Button>
              <Button className="flex-1 h-12" onClick={handleConfirm} disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</> : <><Check className="h-4 w-4 mr-2" /> Confirmar Entrada</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
