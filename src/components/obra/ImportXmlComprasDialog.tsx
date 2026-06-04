import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileUp, Loader2, Check, Package, Trash2, Plus, Wrench } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';

const FERRAMENTA_CATEGORIES = [
  'Ferramentas Manuais', 'Ferramentas Elétricas', 'Equipamentos de Proteção (EPI)', 'Equipamentos de Medição', 'OUTROS'
];

const MATERIAL_CATEGORIES = [
  'Hidráulica',
  'Elétrica',
  'Esgoto',
  'Estrutural',
  'Alvenaria',
  'Acabamento',
  'Pintura',
  'Ferramentas',
  'Segurança (EPI)',
  'Marcenaria',
  'Serralheria',
  'Disco',
  'Insumos',
  'OUTROS'
];

interface XmlItem {
  id: string;
  nome: string;
  quantidade: number;
  valor: number;
  selected: boolean;
  tipo: 'material' | 'ferramenta';
  unidade: string;
  // ferramenta-specific
  ferrCategoria: string;
  ferrLocalizacao: string;
  ferrCodigoPrefixo: string;
  // material-specific
  matCategoria: string;
  matLocalizacao: string;
}

interface Props {
  obraId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraToLink?: any;
  onCancel?: () => void;
}

export default function ImportXmlComprasDialog({ obraId, open, onOpenChange, compraToLink, onCancel }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<XmlItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [descontoTotal, setDescontoTotal] = useState<number>(0);
  const [fornecedor, setFornecedor] = useState<string>('');
  const [showFornecedorList, setShowFornecedorList] = useState(false);

  useEffect(() => {
    if (open) {
      setFornecedor(compraToLink?.fornecedor_nome || '');
    }
  }, [open, compraToLink]);

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

  const makeItem = (overrides: Partial<XmlItem> = {}): XmlItem => ({
    id: crypto.randomUUID(),
    nome: '',
    quantidade: 1,
    valor: 0,
    selected: true,
    tipo: 'material',
    unidade: 'un',
    ferrCategoria: 'Ferramentas Elétricas',
    ferrLocalizacao: '',
    ferrCodigoPrefixo: '',
    matCategoria: 'OUTROS',
    matLocalizacao: '',
    ...overrides,
  });

  const reset = (isSuccess = false) => {
    setItems([]);
    setStep('upload');
    setLoading(false);
    setDescontoTotal(0);
    setFornecedor('');
    setShowFornecedorList(false);
    if (fileRef.current) fileRef.current.value = '';
    if (!isSuccess && onCancel) {
      onCancel();
    }
  };

  const loadXml = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (!text) throw new Error('Não foi possível ler o arquivo.');

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const parserError = xmlDoc.getElementsByTagName('parsererror');
        if (parserError.length > 0) {
          throw new Error('Formato XML inválido.');
        }

        // 1. Emitter Fornecedor (emit > xNome)
        const emitNode = xmlDoc.getElementsByTagName('emit')[0];
        const xNomeNode = emitNode?.getElementsByTagName('xNome')[0];
        const supplierName = xNomeNode ? xNomeNode.textContent || '' : '';
        setFornecedor(supplierName.trim());

        // 2. Discount (vDesc)
        const vDescNode = xmlDoc.getElementsByTagName('vDesc')[0];
        const totalDiscount = vDescNode ? parseFloat(vDescNode.textContent || '0') || 0 : 0;
        setDescontoTotal(totalDiscount);

        // 3. Items (det)
        const detNodes = xmlDoc.getElementsByTagName('det');
        const parsedItems: XmlItem[] = [];

        for (let i = 0; i < detNodes.length; i++) {
          const det = detNodes[i];
          const prodNode = det.getElementsByTagName('prod')[0];
          if (!prodNode) continue;

          const xProd = prodNode.getElementsByTagName('xProd')[0]?.textContent || '';
          const uCom = (prodNode.getElementsByTagName('uCom')[0]?.textContent || '').trim().toLowerCase();
          const qCom = parseFloat(prodNode.getElementsByTagName('qCom')[0]?.textContent || '1') || 1;
          const vUnCom = parseFloat(prodNode.getElementsByTagName('vUnCom')[0]?.textContent || '0') || 0;

          let unidade = 'un';
          if (uCom === 'un' || uCom === 'und') unidade = 'un';
          else if (uCom === 'kg') unidade = 'kg';
          else if (uCom === 'pc' || uCom === 'pç') unidade = 'pc';
          else if (uCom === 'cx') unidade = 'cx';
          else if (uCom === 'm') unidade = 'm';
          else if (uCom === 'm2' || uCom === 'm²') unidade = 'm²';
          else if (uCom === 'm3' || uCom === 'm³') unidade = 'm³';
          else if (uCom === 'sc') unidade = 'sc';
          else if (uCom === 'l') unidade = 'L';
          else if (['pr', 'jg', 'pct', 'rl'].includes(uCom)) unidade = uCom;
          else unidade = uCom;

          parsedItems.push(makeItem({
            nome: xProd.trim(),
            quantidade: qCom,
            valor: vUnCom,
            unidade
          }));
        }

        if (parsedItems.length === 0) {
          parsedItems.push(makeItem());
          toast.info('Não foi possível encontrar itens de produtos no XML. Você pode preenchê-los manualmente.');
        } else {
          toast.success(`${parsedItems.length} itens extraídos do XML com sucesso!`);
        }

        setItems(parsedItems);
        setStep('review');
      };

      reader.onerror = () => {
        toast.error('Erro ao ler o arquivo físico.');
      };

      reader.readAsText(file);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Erro ao processar o XML. Certifique-se de que é uma NF-e válida.');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadXml(file);
  };

  const updateItem = (id: string, field: keyof XmlItem, value: any) => {
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

      const subtotal = itemsToImport.reduce((acc, item) => acc + (item.quantidade * item.valor), 0);
      const appliedDiscount = Math.min(descontoTotal, subtotal);
      const totalComDesconto = Math.max(0, subtotal - descontoTotal);

      let compraId = compraToLink?.id;

      if (!compraId) {
        const { data: newCompra, error: compraErr } = await supabase
          .from('compras')
          .insert({
            obra_id: obraId,
            status: 'PAGO',
            email_titulo: `NF Importada - ${fornecedor || 'Sem Fornecedor'} - R$ ${totalComDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            valor_solicitado: totalComDesconto,
            valor_pago: totalComDesconto,
            data_envio: new Date().toISOString().split('T')[0],
            data_pagamento: new Date().toISOString().split('T')[0],
            fornecedor_nome: fornecedor || null,
            tipo_solicitacao: 'Materiais',
            obs: 'Importado via XML (Entrada de estoque vinculada)'
          })
          .select('id')
          .single();

        if (compraErr) throw compraErr;
        compraId = newCompra.id;
      }

      const { data: existingProducts } = await supabase.from('produtos').select('id, nome').eq('obra_id', obraId);
      const productMap = new Map<string, string>();
      (existingProducts || []).forEach(p => productMap.set(p.nome.toLowerCase().trim(), p.id));

      let ferramentasCreated = 0;
      let materiaisCreated = 0;

      for (const item of itemsToImport) {
        const itemTotal = item.quantidade * item.valor;
        const itemDiscount = subtotal > 0 ? (itemTotal / subtotal) * appliedDiscount : 0;
        const finalUnitValue = item.quantidade > 0 ? Math.max(0, itemTotal - itemDiscount) / item.quantidade : 0;

        if (item.tipo === 'ferramenta') {
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

          const note = descontoTotal > 0
            ? `[FERRAMENTA] Importado via XML (Com desconto de R$ ${itemDiscount.toFixed(2)} proporcional)`
            : '[FERRAMENTA] Importado via XML';

          const { error: entErr } = await supabase.from('entradas').insert({
            obra_id: obraId, produto_id: produtoId,
            quantidade: item.quantidade, valor_unitario: finalUnitValue,
            observacao: note,
            fornecedor: fornecedor || null,
            status_entrega: 'PENDENTE',
            comprado_por_id: user?.id || null,
            comprado_em: new Date().toISOString(),
            compra_id: compraId
          });
          if (entErr) throw entErr;

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

          ferramentasCreated += Math.round(item.quantidade);

        } else {
          const key = item.nome.toLowerCase().trim();
          let produtoId = productMap.get(key);

          if (!produtoId) {
            const { data: newProd, error: prodErr } = await supabase
              .from('produtos')
              .insert({ 
                obra_id: obraId, 
                nome: item.nome.trim(), 
                unidade: item.unidade || 'un', 
                estoque_atual: 0, 
                estoque_minimo: 0,
                categoria: item.matCategoria || 'OUTROS',
                localizacao: item.matLocalizacao || null
              })
              .select('id').single();
            if (prodErr) throw prodErr;
            produtoId = newProd.id;
            productMap.set(key, produtoId);

            await supabase.from('logs_atividades' as any).insert({
              obra_id: obraId, user_id: user?.id, user_email: user?.email,
              acao: 'CADASTRAR', entidade: 'PRODUTO',
              detalhes: `Cadastrou o produto via XML: ${item.nome.trim()}`
            });
          } else {
            const updates: any = {};
            if (item.matCategoria) updates.categoria = item.matCategoria;
            if (item.matLocalizacao) updates.localizacao = item.matLocalizacao;
            if (item.unidade) updates.unidade = item.unidade;
            if (Object.keys(updates).length > 0) {
              await supabase.from('produtos').update(updates).eq('id', produtoId);
            }
          }

          const note = descontoTotal > 0
            ? `Importado via XML (Com desconto de R$ ${itemDiscount.toFixed(2)} proporcional)`
            : 'Importado via XML';

          const { error: entErr } = await supabase.from('entradas').insert({
            obra_id: obraId, produto_id: produtoId,
            quantidade: item.quantidade, valor_unitario: finalUnitValue,
            observacao: note,
            fornecedor: fornecedor || null,
            status_entrega: 'PENDENTE',
            comprado_por_id: user?.id || null,
            comprado_em: new Date().toISOString(),
            compra_id: compraId
          });
          if (entErr) throw entErr;

          materiaisCreated++;
        }
      }

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId, user_id: user?.id, user_email: user?.email,
        acao: 'ENTRADA', entidade: 'ESTOQUE',
        detalhes: compraToLink
          ? `Importou XML para estoque pendente vinculado à compra "${compraToLink.email_titulo}": ${itemsToImport.length} itens`
          : `Importou XML para compra e pendente: ${itemsToImport.length} itens do fornecedor ${fornecedor || 'Sem Fornecedor'}`
      });

      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });

      const msgs = [];
      if (materiaisCreated > 0) msgs.push(`${materiaisCreated} material(is) pendente(s)`);
      if (ferramentasCreated > 0) msgs.push(`${ferramentasCreated} ferramenta(s) individual(is)`);
      toast.success(compraToLink 
        ? `Materiais lançados no estoque com sucesso para esta compra!`
        : `Importado com sucesso! Lançamento criado e ${msgs.join(' • ')}`
      );
      reset(true);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar XML');
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(false); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white font-display font-bold font-mono text-base">
            {compraToLink 
              ? `Importar XML para Lançamento: ${compraToLink.email_titulo}`
              : 'Importar XML de Nota Fiscal (NF-e)'
            }
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileUp className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-white">Selecione o XML da Nota</h3>
              <p className="text-sm text-white/60 max-w-md">
                {compraToLink 
                  ? `Os itens extraídos do XML serão lançados no estoque como "Entrada Pendente" vinculados à compra "${compraToLink.email_titulo}".`
                  : 'O sistema extrai os itens automaticamente do arquivo XML (.xml) da nota fiscal eletrônica.'
                }
              </p>
            </div>
            <Button className="h-12 mt-4 bg-primary hover:bg-primary/90 text-white rounded-xl" onClick={() => fileRef.current?.click()}>
              Selecionar arquivo XML
            </Button>
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs text-white/60">
                Classifique cada item como <strong>Material</strong> (vai pro estoque pendente) ou <strong>Ferramenta</strong> (cria unidades individuais).
              </p>
              {(materialCount > 0 || ferramentaCount > 0) && (
                <div className="flex gap-2 shrink-0">
                  {materialCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary/20 text-primary-foreground border border-primary/35 px-2.5 py-1 rounded-full">
                      <Package className="h-3 w-3 text-primary" /> {materialCount} material(is)
                    </span>
                  )}
                  {ferramentaCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full">
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
                    !item.selected ? 'opacity-40 bg-white/5 border-white/5' :
                    item.tipo === 'ferramenta' ? 'border-amber-500/30 bg-amber-500/5' : 'border-primary/20 bg-primary/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={(c) => updateItem(item.id, 'selected', !!c)}
                      className="shrink-0 border-white/20 data-[state=checked]:bg-primary"
                    />

                    <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, 'tipo', 'material')}
                        disabled={!item.selected}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-all ${
                          item.tipo === 'material' ? 'bg-primary text-white' : 'text-white/40 hover:bg-white/5'
                        }`}
                      >
                        <Package className="h-3 w-3" /> Material
                      </button>
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, 'tipo', 'ferramenta')}
                        disabled={!item.selected}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-all ${
                          item.tipo === 'ferramenta' ? 'bg-amber-500 text-black' : 'text-white/40 hover:bg-white/5'
                        }`}
                      >
                        <Wrench className="h-3 w-3" /> Ferramenta
                      </button>
                    </div>

                    <Input
                      value={item.nome}
                      onChange={(e) => updateItem(item.id, 'nome', e.target.value)}
                      className="h-9 flex-1 min-w-0 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 rounded-xl"
                      placeholder="Nome do produto / ferramenta"
                      disabled={!item.selected}
                    />
                    <Input
                      type="number" step="0.01"
                      value={item.quantidade || ''}
                      onChange={(e) => updateItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)}
                      className="h-9 w-20 shrink-0 bg-[#0e1629] border-white/10 text-white rounded-xl text-center font-mono"
                      placeholder="Qtd"
                      disabled={!item.selected}
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-[10px] text-white/30 font-mono">R$</span>
                        <Input
                          type="number" step="0.01"
                          value={item.valor || ''}
                          onChange={(e) => updateItem(item.id, 'valor', parseFloat(e.target.value) || 0)}
                          className="pl-7 h-9 w-28 text-right bg-[#0e1629] border-white/10 text-white rounded-xl font-mono"
                          placeholder="0,00"
                          disabled={!item.selected}
                        />
                      </div>
                      {descontoTotal > 0 && subtotal > 0 && item.selected && item.valor > 0 && (
                        <span className="text-[9px] text-emerald-400 font-semibold text-right pr-1">
                          Desc: R$ {((item.valor * (1 - Math.min(descontoTotal, subtotal) / subtotal))).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10 shrink-0 rounded-lg">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {item.tipo === 'ferramenta' && item.selected && (
                    <div className="ml-8 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                      <div>
                        <label className="text-[9px] text-amber-400 uppercase font-bold tracking-wider ml-1">Categoria</label>
                        <Select value={item.ferrCategoria} onValueChange={v => updateItem(item.id, 'ferrCategoria', v)}>
                          <SelectTrigger className="h-8 text-xs mt-1 bg-[#0e1629] border-white/10 text-white rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0e1629] text-white border-white/10">
                            {FERRAMENTA_CATEGORIES.map(cat => <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[9px] text-amber-400 uppercase font-bold tracking-wider ml-1">Localização</label>
                        <Input
                          value={item.ferrLocalizacao}
                          onChange={e => updateItem(item.id, 'ferrLocalizacao', e.target.value)}
                          className="h-8 text-xs mt-1 bg-[#0e1629] border-white/10 text-white rounded-xl"
                          placeholder="Ex: Armário 2"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-amber-400 uppercase font-bold tracking-wider ml-1">Prefixo Código</label>
                        <Input
                          value={item.ferrCodigoPrefixo}
                          onChange={e => updateItem(item.id, 'ferrCodigoPrefixo', e.target.value.toUpperCase())}
                          className="h-8 text-xs mt-1 bg-[#0e1629] border-white/10 text-white rounded-xl"
                          placeholder="Ex: FUR"
                        />
                      </div>
                    </div>
                  )}

                  {item.tipo === 'material' && item.selected && (
                    <div className="ml-8 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                      <div>
                        <label className="text-[9px] text-primary uppercase font-bold tracking-wider ml-1">Categoria</label>
                        <Select value={item.matCategoria} onValueChange={v => updateItem(item.id, 'matCategoria', v)}>
                          <SelectTrigger className="h-8 text-xs mt-1 bg-[#0e1629] border-white/10 text-white rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0e1629] text-white border-white/10">
                            {MATERIAL_CATEGORIES.map(cat => <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[9px] text-primary uppercase font-bold tracking-wider ml-1">Unidade</label>
                        <div className="flex gap-1.5 items-center mt-1">
                          <Select
                            value={['un', 'kg', 'L', 'm', 'm²', 'm³', 'cx', 'pc', 'sc'].includes(item.unidade) ? item.unidade : 'Outro'}
                            onValueChange={v => updateItem(item.id, 'unidade', v === 'Outro' ? '' : v)}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1 bg-[#0e1629] border-white/10 text-white rounded-xl">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0e1629] text-white border-white/10">
                              <SelectItem value="un" className="text-xs">Unidade (un)</SelectItem>
                              <SelectItem value="kg" className="text-xs">Quilograma (kg)</SelectItem>
                              <SelectItem value="L" className="text-xs">Litro (L)</SelectItem>
                              <SelectItem value="m" className="text-xs">Metro (m)</SelectItem>
                              <SelectItem value="m²" className="text-xs">Metro Quadrado (m²)</SelectItem>
                              <SelectItem value="m³" className="text-xs">Metro Cúbico (m³)</SelectItem>
                              <SelectItem value="cx" className="text-xs">Caixa (cx)</SelectItem>
                              <SelectItem value="pc" className="text-xs">Pacote (pc)</SelectItem>
                              <SelectItem value="sc" className="text-xs">Saco (sc)</SelectItem>
                              <SelectItem value="Outro" className="text-xs">Outro...</SelectItem>
                            </SelectContent>
                          </Select>
                          {!['un', 'kg', 'L', 'm', 'm²', 'm³', 'cx', 'pc', 'sc'].includes(item.unidade) && (
                            <Input
                              placeholder="Qual?"
                              value={item.unidade}
                              onChange={e => updateItem(item.id, 'unidade', e.target.value)}
                              className="h-8 w-16 text-xs bg-[#0e1629] border-white/10 text-white rounded-xl"
                              required
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] text-primary uppercase font-bold tracking-wider ml-1">Localização</label>
                        <Input
                          value={item.matLocalizacao}
                          onChange={e => updateItem(item.id, 'matLocalizacao', e.target.value)}
                          className="h-8 text-xs mt-1 bg-[#0e1629] border-white/10 text-white rounded-xl"
                          placeholder="Ex: Almoxarifado A"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addItem} className="mt-2 h-9 border-dashed border-2 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl">
              <Plus className="h-4 w-4 mr-2" /> Adicionar Linha Manualmente
            </Button>

            <div className="bg-[#0e1629] border border-white/5 rounded-xl p-4 mt-4 space-y-4">
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wide">
                Resumo da Importação (Financeiro + Estoque)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">
                    Fornecedor (opcional)
                  </label>
                  <Input 
                    placeholder="Fornecedor da compra..." 
                    value={fornecedor} 
                    onChange={e => {
                      setFornecedor(e.target.value);
                      setShowFornecedorList(true);
                    }} 
                    onFocus={() => setShowFornecedorList(true)}
                    onBlur={() => setTimeout(() => setShowFornecedorList(false), 200)}
                    className="h-9 text-sm bg-[#161f30] border-white/10 text-white placeholder:text-white/30 rounded-xl" 
                    autoComplete="off"
                  />
                  {showFornecedorList && fornecedores.filter((f: any) => f.toLowerCase().includes(fornecedor.toLowerCase()) && f !== fornecedor).length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-[#161f30] border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {fornecedores
                        .filter((f: any) => f.toLowerCase().includes(fornecedor.toLowerCase()) && f !== fornecedor)
                        .map((f: any) => (
                          <button
                            key={f}
                            type="button"
                            className="w-full text-left px-4 py-2 hover:bg-white/5 transition-colors flex items-center text-sm text-white"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFornecedor(f);
                              setShowFornecedorList(false);
                            }}
                          >
                            <span className="font-semibold truncate">{f}</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="desconto-input" className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">
                    Desconto Total da Nota (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-white/30 font-semibold font-mono">R$</span>
                    <Input
                      id="desconto-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={descontoTotal || ''}
                      onChange={(e) => setDescontoTotal(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="pl-9 h-9 text-sm bg-[#161f30] border-white/10 text-white rounded-xl font-mono"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 flex flex-col sm:flex-row justify-end items-start sm:items-center gap-6 text-sm pt-2">
                  <div className="space-y-1 text-right">
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Subtotal</span>
                    <span className="font-semibold text-base text-white/95 font-mono">
                      R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {descontoTotal > 0 && (
                    <div className="space-y-1 text-right text-emerald-400">
                      <span className="text-[10px] uppercase font-bold text-white/40 block">Desconto</span>
                      <span className="font-semibold text-base font-mono">
                        - R$ {Math.min(descontoTotal, subtotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1 text-right border-t sm:border-t-0 sm:border-l pt-2 sm:pt-0 sm:pl-6 border-white/10">
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Total do Lançamento</span>
                    <span className="font-bold text-lg text-emerald-400 block font-mono">
                      R$ {totalComDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {descontoTotal > 0 && subtotal > 0 && (
                <p className="text-xs text-white/50 bg-[#161f30] border border-white/5 rounded-xl p-2.5">
                  💡 O desconto de <strong>R$ {Math.min(descontoTotal, subtotal).toFixed(2)}</strong> será distribuído proporcionalmente ao valor de cada item. O valor unitário de cada produto no estoque será reduzido proporcionalmente.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-white/10 mt-6">
              <Button variant="outline" className="flex-1 h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl font-semibold" onClick={() => { reset(false); onOpenChange(false); }} disabled={loading}>
                Cancelar / Voltar
              </Button>
              <Button className="flex-1 h-12 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold" onClick={handleConfirm} disabled={loading}>
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                  : compraToLink
                    ? <><Check className="h-4 w-4 mr-2" /> Confirmar e Lançar no Estoque</>
                    : <><Check className="h-4 w-4 mr-2" /> Confirmar e Criar Lançamento</>
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
