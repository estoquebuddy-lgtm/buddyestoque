import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileUp, Loader2, Check, Package, Trash2, Plus, Wrench, AlertCircle } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const FERRAMENTA_CATEGORIES = [
  'Ferramentas Manuais', 'Ferramentas Elétricas', 'Equipamentos de Proteção (EPI)', 'Equipamentos de Medição', 'OUTROS'
];

interface PdfItem {
  id: string;
  nome: string;
  quantidade: number;
  valor: number;
  selected: boolean;
  tipo: 'material' | 'ferramenta';
  // ferramenta-specific
  ferrCategoria: string;
  ferrLocalizacao: string;
  ferrCodigoPrefixo: string;
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
  const [descontoTotal, setDescontoTotal] = useState<number>(0);
  const [fornecedor, setFornecedor] = useState<string>('');
  const [showFornecedorList, setShowFornecedorList] = useState(false);

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fornecedores', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entradas')
        .select('fornecedor')
        .eq('obra_id', obraId)
        .not('fornecedor', 'is', null)
        .neq('fornecedor', '');
      if (!data) return [];
      const unique = Array.from(new Set(data.map((d: any) => d.fornecedor.trim()))).filter(Boolean);
      return unique.sort((a: any, b: any) => a.localeCompare(b));
    },
    enabled: !!obraId && open,
  });

  const makeItem = (overrides: Partial<PdfItem> = {}): PdfItem => ({
    id: crypto.randomUUID(),
    nome: '',
    quantidade: 1,
    valor: 0,
    selected: true,
    tipo: 'material',
    ferrCategoria: 'Ferramentas Elétricas',
    ferrLocalizacao: '',
    ferrCodigoPrefixo: '',
    ...overrides,
  });

  const reset = () => {
    setItems([]);
    setStep('upload');
    setLoading(false);
    setDescontoTotal(0);
    setFornecedor('');
    setShowFornecedorList(false);
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

        const lineMap: Record<number, any[]> = {};
        textContent.items.forEach((item: any) => {
          if (!item.transform) return;
          const y = Math.round(item.transform[5]);
          const existingY = Object.keys(lineMap).find(key => Math.abs(Number(key) - y) <= 3);
          if (existingY) { lineMap[Number(existingY)].push(item); }
          else { lineMap[y] = [item]; }
        });

        const yKeys = Object.keys(lineMap).map(Number).sort((a, b) => b - a);
        for (const y of yKeys) {
          const lineItems = lineMap[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]);
          const lineText = lineItems.map((item: any) => item.str).join(' ').trim();
          if (lineText) fullText += lineText + '\n';
        }
      }

      const parsedItems: PdfItem[] = [];
      const lines = fullText.split('\n');

      for (const line of lines) {
        const regex = /(.+?)\s+(UN|KG|PC|CX|M|M2|M3|SC|L|PR|JG|MT|PCT|RL)\s+([\d.,]+)\s+([\d.,]+)/i;
        const match = line.match(regex);
        if (match) {
          const rawNome = match[1].trim();
          const cleanNome = rawNome.replace(/\s+\d{4,10}(\s+\d+)*$/, '').trim();
          const qtyStr = match[3].replace(/\./g, '').replace(',', '.');
          const valStr = match[4].replace(/\./g, '').replace(',', '.');
          const quantidade = parseFloat(qtyStr);
          const valor = parseFloat(valStr);
          if (!isNaN(quantidade) && quantidade > 0) {
            parsedItems.push(makeItem({ nome: cleanNome, quantidade, valor: isNaN(valor) ? 0 : valor }));
          }
        }
      }

      if (parsedItems.length === 0) {
        parsedItems.push(makeItem());
        toast.info('Não foi possível extrair itens automaticamente. Você pode preenchê-los manualmente.');
      } else {
        toast.success(`${parsedItems.length} itens encontrados. Classifique cada um como Material ou Ferramenta.`);
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
    if (file.type !== 'application/pdf') { toast.error('Por favor, selecione um arquivo PDF.'); return; }
    loadPdf(file);
  };

  const updateItem = (id: string, field: keyof PdfItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: string) => setItems(items.filter(item => item.id !== id));
  const addItem = () => setItems([...items, makeItem()]);

  const handleConfirm = async () => {
    const itemsToImport = items.filter(i => i.selected && i.nome.trim() !== '' && i.quantidade > 0);
    if (itemsToImport.length === 0) {
      toast.error('Selecione e preencha ao menos um item válido para importar.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get existing products
      const { data: existingProducts } = await supabase.from('produtos').select('id, nome').eq('obra_id', obraId);
      const productMap = new Map<string, string>();
      (existingProducts || []).forEach(p => productMap.set(p.nome.toLowerCase().trim(), p.id));

      let ferramentasCreated = 0;
      let materiaisCreated = 0;

      const subtotal = itemsToImport.reduce((acc, item) => acc + (item.quantidade * item.valor), 0);
      const appliedDiscount = Math.min(descontoTotal, subtotal);

      for (const item of itemsToImport) {
        const itemTotal = item.quantidade * item.valor;
        const itemDiscount = subtotal > 0 ? (itemTotal / subtotal) * appliedDiscount : 0;
        const finalUnitValue = item.quantidade > 0 ? Math.max(0, itemTotal - itemDiscount) / item.quantidade : 0;

        if (item.tipo === 'ferramenta') {
          // --- FERRAMENTA FLOW ---
          // 1. Find or create the virtual [FERRAMENTA] product for financial tracking
          const virtualName = `[FERRAMENTA] ${item.nome.trim()}`;
          const virtualKey = virtualName.toLowerCase();
          let produtoId = productMap.get(virtualKey);

          if (!produtoId) {
            const { data: newProd, error: prodErr } = await supabase
              .from('produtos')
              .insert({ obra_id: obraId, nome: virtualName, unidade: 'un', categoria: 'Ferramentas', estoque_atual: 0, estoque_minimo: 0 })
              .select('id').single();
            if (prodErr) throw prodErr;
            produtoId = newProd.id;
            productMap.set(virtualKey, produtoId);
          }

          // 2. Register the financial entry
          const note = descontoTotal > 0
            ? `[FERRAMENTA] Importado via PDF (Com desconto de R$ ${itemDiscount.toFixed(2)} proporcional de R$ ${descontoTotal.toFixed(2)})`
            : '[FERRAMENTA] Importado via PDF';

          const { error: entErr } = await supabase.from('entradas').insert({
            obra_id: obraId, produto_id: produtoId,
            quantidade: item.quantidade, valor_unitario: finalUnitValue,
            observacao: note,
            fornecedor: fornecedor || null,
          });
          if (entErr) throw entErr;

          // 3. Create individual ferramentas (one per unit)
          const ferramentasToInsert = Array.from({ length: Math.round(item.quantidade) }, (_, i) => ({
            obra_id: obraId,
            nome: item.nome.trim(),
            codigo: item.ferrCodigoPrefixo ? `${item.ferrCodigoPrefixo}-${String(i + 1).padStart(2, '0')}` : null,
            estado: 'disponivel',
            status: 'DISPONIVEL',
            qr_code: `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            observacoes: `[CAT:${item.ferrCategoria || 'OUTROS'}] [LOC:${item.ferrLocalizacao || ''}]`,
          }));
          const { error: ferrErr } = await supabase.from('ferramentas').insert(ferramentasToInsert);
          if (ferrErr) throw ferrErr;

          await supabase.from('logs_atividades' as any).insert({
            obra_id: obraId, user_id: user?.id, user_email: user?.email,
            acao: 'ENTRADA', entidade: 'FERRAMENTA',
            detalhes: `Entrada via PDF: ${Math.round(item.quantidade)} unidade(s) de "${item.nome.trim()}" como ferramentas individuais`
          });

          ferramentasCreated += Math.round(item.quantidade);

        } else {
          // --- MATERIAL FLOW ---
          const key = item.nome.toLowerCase().trim();
          let produtoId = productMap.get(key);

          if (!produtoId) {
            const { data: newProd, error: prodErr } = await supabase
              .from('produtos')
              .insert({ obra_id: obraId, nome: item.nome.trim(), unidade: 'un', estoque_atual: 0, estoque_minimo: 0 })
              .select('id').single();
            if (prodErr) throw prodErr;
            produtoId = newProd.id;
            productMap.set(key, produtoId);

            await supabase.from('logs_atividades' as any).insert({
              obra_id: obraId, user_id: user?.id, user_email: user?.email,
              acao: 'CADASTRAR', entidade: 'PRODUTO',
              detalhes: `Cadastrou o produto via PDF: ${item.nome.trim()}`
            });
          }

          const note = descontoTotal > 0
            ? `Importado via PDF (Com desconto de R$ ${itemDiscount.toFixed(2)} proporcional de R$ ${descontoTotal.toFixed(2)})`
            : 'Importado via PDF';

          const { error: entErr } = await supabase.from('entradas').insert({
            obra_id: obraId, produto_id: produtoId,
            quantidade: item.quantidade, valor_unitario: finalUnitValue,
            observacao: note,
            fornecedor: fornecedor || null,
          });
          if (entErr) throw entErr;

          await supabase.from('logs_atividades' as any).insert({
            obra_id: obraId, user_id: user?.id, user_email: user?.email,
            acao: 'ENTRADA', entidade: 'ESTOQUE',
            detalhes: `Entrada via PDF: ${item.quantidade} de ${item.nome.trim()}`
          });

          materiaisCreated++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });

      const msgs = [];
      if (materiaisCreated > 0) msgs.push(`${materiaisCreated} material(is) no estoque`);
      if (ferramentasCreated > 0) msgs.push(`${ferramentasCreated} ferramenta(s) individual(is) criada(s)`);
      toast.success(`Importado com sucesso! ${msgs.join(' • ')}`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar PDF');
    } finally {
      setLoading(false);
    }
  };

  const selectedItems = items.filter(i => i.selected && i.nome.trim() !== '' && i.quantidade > 0);
  const subtotal = selectedItems.reduce((acc, item) => acc + (item.quantidade * item.valor), 0);
  const totalComDesconto = Math.max(0, subtotal - descontoTotal);

  const ferramentaCount = items.filter(i => i.selected && i.tipo === 'ferramenta').reduce((acc, i) => acc + Math.round(i.quantidade || 0), 0);
  const materialCount = items.filter(i => i.selected && i.tipo === 'material').length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
                Nosso sistema extrai os itens automaticamente. Você poderá classificar cada um como <strong>Material de Estoque</strong> ou <strong>Ferramenta</strong> antes de confirmar.
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Classifique cada item como <strong>Material</strong> (vai pro estoque) ou <strong>Ferramenta</strong> (cria unidades individuais na aba Ferramentas).
              </p>
              {(materialCount > 0 || ferramentaCount > 0) && (
                <div className="flex gap-2 shrink-0">
                  {materialCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                      <Package className="h-3 w-3" /> {materialCount} material(is)
                    </span>
                  )}
                  {ferramentaCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-warning/10 text-warning px-2.5 py-1 rounded-full">
                      <Wrench className="h-3 w-3" /> {ferramentaCount} ferramenta(s)
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-xl p-3 space-y-3 transition-all ${
                    !item.selected ? 'opacity-40 bg-muted/20' :
                    item.tipo === 'ferramenta' ? 'border-warning/30 bg-warning/5' : 'border-border bg-card'
                  }`}
                >
                  {/* Row 1: checkbox + tipo toggle + nome + qty + valor + delete */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={(c) => updateItem(item.id, 'selected', !!c)}
                      className="shrink-0"
                    />

                    {/* Tipo toggle */}
                    <div className="flex rounded-lg border overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, 'tipo', 'material')}
                        disabled={!item.selected}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-all ${
                          item.tipo === 'material' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Package className="h-3 w-3" /> Material
                      </button>
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, 'tipo', 'ferramenta')}
                        disabled={!item.selected}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-all ${
                          item.tipo === 'ferramenta' ? 'bg-warning text-warning-foreground' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Wrench className="h-3 w-3" /> Ferramenta
                      </button>
                    </div>

                    <Input
                      value={item.nome}
                      onChange={(e) => updateItem(item.id, 'nome', e.target.value)}
                      className="h-9 flex-1 min-w-0"
                      placeholder="Nome do produto / ferramenta"
                      disabled={!item.selected}
                    />
                    <Input
                      type="number" step="0.01"
                      value={item.quantidade || ''}
                      onChange={(e) => updateItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)}
                      className="h-9 w-24 shrink-0"
                      placeholder="Qtd"
                      disabled={!item.selected}
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      <Input
                        type="number" step="0.01"
                        value={item.valor || ''}
                        onChange={(e) => updateItem(item.id, 'valor', parseFloat(e.target.value) || 0)}
                        className="h-9 w-28 text-right"
                        placeholder="R$ unit."
                        disabled={!item.selected}
                      />
                      {descontoTotal > 0 && subtotal > 0 && item.selected && item.valor > 0 && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold text-right pr-1">
                          Desc: R$ {((item.valor * (1 - Math.min(descontoTotal, subtotal) / subtotal))).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-8 w-8 text-destructive shrink-0 mt-0.5">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Row 2: ferramenta extra fields */}
                  {item.tipo === 'ferramenta' && item.selected && (
                    <div className="ml-8 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-warning uppercase font-bold tracking-wider ml-1">Categoria</label>
                        <Select value={item.ferrCategoria} onValueChange={v => updateItem(item.id, 'ferrCategoria', v)}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FERRAMENTA_CATEGORIES.map(cat => <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-warning uppercase font-bold tracking-wider ml-1">Localização</label>
                        <Input
                          value={item.ferrLocalizacao}
                          onChange={e => updateItem(item.id, 'ferrLocalizacao', e.target.value)}
                          className="h-8 text-xs mt-1"
                          placeholder="Ex: Armário 2"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-warning uppercase font-bold tracking-wider ml-1">Prefixo Código</label>
                        <Input
                          value={item.ferrCodigoPrefixo}
                          onChange={e => updateItem(item.id, 'ferrCodigoPrefixo', e.target.value.toUpperCase())}
                          className="h-8 text-xs mt-1"
                          placeholder="Ex: FUR → FUR-01, FUR-02..."
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <div className="flex items-center gap-1.5 text-xs text-warning/80 bg-warning/10 rounded-lg px-3 py-1.5">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Serão criadas <strong>{Math.round(item.quantidade || 0)}</strong> ferramenta(s) individual(is) na aba Ferramentas + lançamento no Financeiro.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addItem} className="mt-2 h-9 border-dashed border-2">
              <Plus className="h-4 w-4 mr-2" /> Adicionar Linha Manualmente
            </Button>

            {/* Resumo da Nota e Desconto */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-4 mt-4 space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Resumo da Importação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                {/* Fornecedor Input */}
                <div className="space-y-2 relative">
                  <label className="text-xs font-medium text-muted-foreground ml-1">
                    Fornecedor (opcional)
                  </label>
                  <Input 
                    placeholder="De onde veio?" 
                    value={fornecedor} 
                    onChange={e => {
                      setFornecedor(e.target.value);
                      setShowFornecedorList(true);
                    }} 
                    onFocus={() => setShowFornecedorList(true)}
                    onBlur={() => setTimeout(() => setShowFornecedorList(false), 200)}
                    className="h-9 text-sm" 
                    autoComplete="off"
                  />
                  {showFornecedorList && fornecedores.filter((f: any) => f.toLowerCase().includes(fornecedor.toLowerCase()) && f !== fornecedor).length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-input rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {fornecedores
                        .filter((f: any) => f.toLowerCase().includes(fornecedor.toLowerCase()) && f !== fornecedor)
                        .map((f: any) => (
                          <button
                            key={f}
                            type="button"
                            className="w-full text-left px-4 py-2 hover:bg-accent transition-colors flex items-center text-sm"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFornecedor(f);
                              setShowFornecedorList(false);
                            }}
                          >
                            <span className="font-medium truncate text-foreground">{f}</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                {/* Desconto Input */}
                <div className="space-y-2">
                  <label htmlFor="desconto-input" className="text-xs font-medium text-muted-foreground ml-1">
                    Desconto Total da Nota (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-muted-foreground font-medium">R$</span>
                    <Input
                      id="desconto-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={descontoTotal || ''}
                      onChange={(e) => setDescontoTotal(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="pl-9 h-9 text-sm"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Valores */}
                <div className="md:col-span-2 flex flex-col sm:flex-row justify-end items-start sm:items-center gap-6 text-sm">
                  <div className="space-y-1 text-right">
                    <span className="text-xs text-muted-foreground block">Subtotal</span>
                    <span className="font-semibold text-base text-foreground">
                      R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {descontoTotal > 0 && (
                    <div className="space-y-1 text-right text-green-600 dark:text-green-400">
                      <span className="text-xs text-muted-foreground block">Desconto</span>
                      <span className="font-semibold text-base font-medium">
                        - R$ {Math.min(descontoTotal, subtotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1 text-right border-t sm:border-t-0 sm:border-l pt-2 sm:pt-0 sm:pl-6 border-border/85">
                    <span className="text-xs text-muted-foreground block font-medium">Total com Desconto</span>
                    <span className="font-bold text-lg text-primary block">
                      R$ {totalComDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {descontoTotal > 0 && subtotal > 0 && (
                <p className="text-xs text-muted-foreground bg-green-500/5 border border-green-500/10 rounded-lg p-2.5">
                  💡 O desconto de <strong>R$ {Math.min(descontoTotal, subtotal).toFixed(2)}</strong> será distribuído proporcionalmente ao valor total de cada item. O valor unitário final de cada item inserido já refletirá essa redução.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t mt-6">
              <Button variant="outline" className="flex-1 h-12" onClick={reset} disabled={loading}>
                Cancelar / Voltar
              </Button>
              <Button className="flex-1 h-12" onClick={handleConfirm} disabled={loading}>
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
                  : <><Check className="h-4 w-4 mr-2" /> Confirmar e Salvar</>
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
