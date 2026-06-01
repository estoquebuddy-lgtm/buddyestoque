import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileUp, Loader2, Check, Package, Trash2, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import * as pdfjs from 'pdfjs-dist';

// Set up the pdfjs worker using a CDN that matches the installed version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfItem {
  id: string;
  nome: string;
  quantidade: number;
  valor: number;
  selected: boolean;
}

interface Props {
  obraId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportPdfDialog({ obraId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PdfItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  const reset = () => {
    setItems([]);
    setStep('upload');
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const loadPdf = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Group text items by Y coordinate to reconstruct lines
        const lineMap: Record<number, any[]> = {};
        textContent.items.forEach((item: any) => {
          if (!item.transform) return;
          const y = Math.round(item.transform[5]);
          // Group nearby Y coordinates (within 3 pixels)
          const existingY = Object.keys(lineMap).find(key => Math.abs(Number(key) - y) <= 3);
          if (existingY) {
            lineMap[Number(existingY)].push(item);
          } else {
            lineMap[y] = [item];
          }
        });
        
        const yKeys = Object.keys(lineMap).map(Number).sort((a, b) => b - a); // Top to bottom
        for (const y of yKeys) {
          const lineItems = lineMap[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]); // Left to right
          const lineText = lineItems.map((item: any) => item.str).join(' ').trim();
          if (lineText) {
            fullText += lineText + '\n';
          }
        }
      }

      const parsedItems: PdfItem[] = [];
      const lines = fullText.split('\n');

      for (const line of lines) {
        // Heuristic: Look for common unit abbreviations followed by numbers
        // e.g. "CIMENTO CP II 50KG 25232910 0102 5102 UN 10,00 25,50 255,00"
        const regex = /(.+?)\s+(UN|KG|PC|CX|M|M2|M3|SC|L|PR|JG|MT|PCT|RL)\s+([\d.,]+)\s+([\d.,]+)/i;
        const match = line.match(regex);
        
        if (match) {
          const rawNome = match[1].trim();
          // Attempt to clean trailing codes like NCM, CST, CFOP from the name
          const cleanNome = rawNome.replace(/\s+\d{4,10}(\s+\d+)*$/, '').trim();
          
          const qtyStr = match[3].replace(/\./g, '').replace(',', '.');
          const valStr = match[4].replace(/\./g, '').replace(',', '.');
          
          const quantidade = parseFloat(qtyStr);
          const valor = parseFloat(valStr);

          if (!isNaN(quantidade) && quantidade > 0) {
            parsedItems.push({
              id: crypto.randomUUID(),
              nome: cleanNome,
              quantidade: quantidade,
              valor: isNaN(valor) ? 0 : valor,
              selected: true
            });
          }
        }
      }

      // Provide at least one empty row if heuristic fails so user can manually enter
      if (parsedItems.length === 0) {
        parsedItems.push({
          id: crypto.randomUUID(),
          nome: '',
          quantidade: 1,
          valor: 0,
          selected: true
        });
        toast.info('Não foi possível extrair itens automaticamente. Você pode preenchê-los manualmente.');
      } else {
        toast.success(`${parsedItems.length} itens encontrados. Verifique e edite conforme necessário.`);
      }

      setItems(parsedItems);
      setStep('review');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar o PDF. Tente novamente ou adicione manualmente.');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Por favor, selecione um arquivo PDF.');
      return;
    }
    loadPdf(file);
  };

  const updateItem = (id: string, field: keyof PdfItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), nome: '', quantidade: 1, valor: 0, selected: true }]);
  };

  const handleConfirm = async () => {
    const itemsToImport = items.filter(i => i.selected && i.nome.trim() !== '' && i.quantidade > 0);
    
    if (itemsToImport.length === 0) {
      toast.error('Selecione e preencha ao menos um item válido para importar.');
      return;
    }

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

      for (const item of itemsToImport) {
        const key = item.nome.toLowerCase().trim();
        let produtoId = productMap.get(key);

        // Create product if it doesn't exist
        if (!produtoId) {
          const { data: newProd, error: prodErr } = await supabase
            .from('produtos')
            .insert({
              obra_id: obraId,
              nome: item.nome.trim(),
              unidade: 'un', // Default
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
            detalhes: `Cadastrou o produto via PDF: ${item.nome.trim()}`
          });
        }

        // Create entrada
        const { error: entErr } = await supabase.from('entradas').insert({
          obra_id: obraId,
          produto_id: produtoId,
          quantidade: item.quantidade,
          valor_unitario: item.valor,
        });
        
        if (entErr) throw entErr;

        await supabase.from('logs_atividades').insert({
          obra_id: obraId,
          user_id: user?.id,
          user_email: user?.email,
          acao: 'ENTRADA',
          entidade: 'ESTOQUE',
          detalhes: `Entrada via PDF: ${item.quantidade} de ${item.nome.trim()}`
        });
      }

      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      
      toast.success(`${itemsToImport.length} item(ns) importado(s) com sucesso!`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar PDF de Nota Fiscal</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileUp className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Selecione o PDF da Nota</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Nosso sistema tentará extrair os itens automaticamente. Você poderá revisar e editar todos os dados (nome, quantidade e valor) antes de confirmar.
              </p>
            </div>
            <Button className="h-12 mt-4" onClick={() => fileRef.current?.click()}>
              Selecionar arquivo PDF
            </Button>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Edite os itens extraídos conforme necessário. Desmarque os que não deseja importar.
            </p>
            
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">Inc.</th>
                      <th className="px-4 py-3">Nome do Produto / Material</th>
                      <th className="px-4 py-3 w-32">Quantidade</th>
                      <th className="px-4 py-3 w-32">Valor (Unitário)</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id} className={!item.selected ? 'opacity-50 bg-muted/30' : 'bg-card'}>
                        <td className="px-4 py-2 text-center">
                          <Checkbox 
                            checked={item.selected} 
                            onCheckedChange={(c) => updateItem(item.id, 'selected', !!c)} 
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input 
                            value={item.nome} 
                            onChange={(e) => updateItem(item.id, 'nome', e.target.value)} 
                            className="h-9"
                            placeholder="Nome do produto"
                            disabled={!item.selected}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input 
                            type="number" 
                            step="0.01"
                            value={item.quantidade || ''} 
                            onChange={(e) => updateItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)} 
                            className="h-9"
                            disabled={!item.selected}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input 
                            type="number" 
                            step="0.01"
                            value={item.valor || ''} 
                            onChange={(e) => updateItem(item.id, 'valor', parseFloat(e.target.value) || 0)} 
                            className="h-9"
                            placeholder="R$"
                            disabled={!item.selected}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={addItem} className="mt-2 h-9 border-dashed border-2">
              <Plus className="h-4 w-4 mr-2" /> Adicionar Linha Manualmente
            </Button>

            <div className="flex gap-3 pt-4 border-t mt-6">
              <Button variant="outline" className="flex-1 h-12" onClick={reset} disabled={loading}>
                Cancelar / Voltar
              </Button>
              <Button className="flex-1 h-12" onClick={handleConfirm} disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</> : <><Check className="h-4 w-4 mr-2" /> Confirmar e Salvar no Estoque</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
