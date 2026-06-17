import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileUp, FileText, Loader2, Check, Package, Trash2, Plus, Wrench, Search, Boxes, AlertTriangle } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import * as pdfjs from 'pdfjs-dist';

// Configurar worker do pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  // matched existing product or new product
  produtoId?: string;
  isNewProduct?: boolean;
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
  const xmlFileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<XmlItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [descontoTotal, setDescontoTotal] = useState<number>(0);
  const [fornecedor, setFornecedor] = useState<string>('');
  const [showFornecedorList, setShowFornecedorList] = useState(false);
  const [isAppending, setIsAppending] = useState(false);

  // States para autocompletar de produtos por linha
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);
  const [searchProductQuery, setSearchProductQuery] = useState<string>('');

  useEffect(() => {
    if (open) {
      setFornecedor(compraToLink?.fornecedor_nome || '');
    }
  }, [open, compraToLink]);

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fornecedores', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('nome')
        .eq('obra_id', obraId)
        .order('nome');
      if (error) throw error;
      return (data || []).map((f: any) => f.nome);
    },
    enabled: !!obraId && open,
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('produtos')
        .select('id, nome, unidade, categoria')
        .eq('obra_id', obraId)
        .order('nome');
      return data || [];
    },
    enabled: !!obraId && open
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
    setParsingPdf(false);
    setDescontoTotal(0);
    setFornecedor('');
    setShowFornecedorList(false);
    setIsAppending(false);
    setActiveDropdownRowId(null);
    setSearchProductQuery('');
    if (xmlFileInputRef.current) xmlFileInputRef.current.value = '';
    if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
    if (!isSuccess && onCancel) {
      onCancel();
    }
  };


  const loadXml = async (file: File, append = false) => {
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
        const trimmedSupplier = supplierName.trim();
        if (trimmedSupplier && (!fornecedor || !append)) {
          const matchForn = fornecedores.find((f: any) => f.toLowerCase() === trimmedSupplier.toLowerCase());
          if (matchForn) {
            setFornecedor(matchForn);
          } else {
            setFornecedor('');
            toast.warning(`Fornecedor "${trimmedSupplier}" do XML não cadastrado. Cadastre-o na aba de Fornecedores.`);
          }
        }

        // 2. Discount (vDesc)
        const vDescNode = xmlDoc.getElementsByTagName('vDesc')[0];
        const totalDiscount = vDescNode ? parseFloat(vDescNode.textContent || '0') || 0 : 0;
        if (append) {
          setDescontoTotal(prev => prev + totalDiscount);
        } else {
          setDescontoTotal(totalDiscount);
        }

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
          if (!append) parsedItems.push(makeItem());
          toast.info('Não foi possível encontrar itens de produtos no XML.');
        } else {
          toast.success(`${parsedItems.length} itens extraídos do XML com sucesso!`);
        }

        if (append) {
          setItems(prev => [...prev, ...parsedItems]);
        } else {
          setItems(parsedItems);
        }
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

  const handleXmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadXml(file, isAppending);
  };

  const loadPdf = async (file: File, append = false) => {
    setParsingPdf(true);
    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise;
      let txt = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const lm: Record<number, any[]> = {};
        content.items.forEach((item: any) => {
          if (!item.transform) return;
          const y = Math.round(item.transform[5]);
          const ek = Object.keys(lm).find(k => Math.abs(Number(k) - y) <= 3);
          if (ek) lm[Number(ek)].push(item); else lm[y] = [item];
        });
        Object.keys(lm).map(Number).sort((a, b) => b - a).forEach(y => {
          const line = lm[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]).map((it: any) => it.str).join(' ').trim();
          if (line) txt += line + '\n';
        });
      }

      // 1. Tentar extrair itens individuais
      const parsedItems: XmlItem[] = [];
      const lines = txt.split('\n');
      const unitRegex = /^(un|und|unid|kg|l|m|m2|m3|cx|pc|pç|sc|pr|jg|pct|rl|fd|bis|mil|cj|dz|bb|bd|gl|tb|scs|m²|m³)$/i;

      function parseVal(str: string): number | null {
        if (!str) return null;
        const s = str.trim();
        if (!/\d/.test(s)) return null;
        const cleaned = s.replace(/\./g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      }

      for (const line of lines) {
        const tokens = line.trim().split(/\s+/);
        if (tokens.length < 4) continue;

        // Procurar o token da unidade de medida
        for (let i = 0; i < tokens.length - 2; i++) {
          const token = tokens[i];
          if (unitRegex.test(token)) {
            // Verificar se os próximos 2 tokens são números (quantidade e valor unitário)
            const qty = parseVal(tokens[i + 1]);
            const unitVal = parseVal(tokens[i + 2]);

            if (qty !== null && qty > 0 && unitVal !== null && unitVal > 0) {
              // Encontramos uma linha de produto!
              const descTokens = tokens.slice(0, i);
              
              // Limpar código, NCM, CST, CFOP dos tokens da descrição
              const cleanedDescTokens = descTokens.filter((tok, idx) => {
                if (/^\d{8}$/.test(tok)) return false; // NCM
                if (/^\d{4}$/.test(tok)) return false; // CFOP
                if (/^\d{3}$/.test(tok)) return false; // CST
                if (idx === 0 && (/^\d+$/.test(tok) || /^[A-Z0-9-]{3,15}$/i.test(tok))) return false; // Código
                return true;
              });

              const description = (cleanedDescTokens.length > 0 ? cleanedDescTokens : descTokens).join(' ').trim();
              if (description.length > 2) {
                const isTool = description.startsWith('[FERRAMENTA]');
                const cleanName = isTool ? description.replace(/^\[FERRAMENTA\]\s*/, '') : description;

                parsedItems.push(makeItem({
                  nome: cleanName,
                  quantidade: qty,
                  valor: unitVal,
                  unidade: token.toLowerCase(),
                  tipo: isTool ? 'ferramenta' : 'material',
                }));
                break; // Encontrou o produto na linha, vai para a próxima linha
              }
            }
          }
        }
      }

      // Se conseguimos extrair itens, adicionamos eles
      if (parsedItems.length > 0) {
        if (append) {
          setItems(prev => [...prev, ...parsedItems]);
        } else {
          setItems(parsedItems);
        }
        toast.success(`${parsedItems.length} itens extraídos do PDF com sucesso!`);
      } else {
        // 2. Fallback: Extrair valor total e criar uma única linha
        let val = '';
        const nfPatterns = [
          /valor\s+total\s+da\s+nota[\s\S]{0,50}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /valor\s+total\s+dos\s+produtos[\s\S]{0,50}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /valor\s+total\s+dos\s+serviços[\s\S]{0,50}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /valor\s+líquido[\s\S]{0,30}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /total\s+a\s+pagar[\s\S]{0,30}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /total\s+geral[\s\S]{0,30}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /valor\s+total[\s\S]{0,30}?(?:R\$)?\s*([\d.]+,\d{2})/i,
          /total[\s\S]{0,30}?(?:R\$)?\s*([\d.]+,\d{2})/i,
        ];
        for (const pattern of nfPatterns) {
          const match = txt.match(pattern);
          if (match) {
            const cleaned = match[1].replace(/\./g, '').replace(',', '.');
            if (parseFloat(cleaned) > 0) {
              val = cleaned;
              break;
            }
          }
        }
        if (!val) {
          const allR$Matches = txt.matchAll(/R\$\s*([\d.]+,\d{2})/gi);
          for (const match of allR$Matches) {
            const cleaned = match[1].replace(/\./g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            if (num > 0) {
              if (!val || num > parseFloat(val)) {
                val = cleaned;
              }
            }
          }
        }
        if (!val) {
          const allMatches = txt.matchAll(/\b([\d.]+,\d{2})\b/g);
          for (const match of allMatches) {
            const cleaned = match[1].replace(/\./g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            if (num > 0) {
              if (!val || num > parseFloat(val)) {
                val = cleaned;
              }
            }
          }
        }

        const parsedValue = val ? parseFloat(val) : 0;
        const fileNameClean = file.name.replace(/\.[^/.]+$/, "");
        const newItem = makeItem({
          nome: `Item Nota PDF: ${fileNameClean}`,
          quantidade: 1,
          valor: parsedValue,
          unidade: 'un',
        });

        if (append) {
          setItems(prev => [...prev, newItem]);
        } else {
          setItems([newItem]);
        }

        if (parsedValue > 0) {
          toast.success(`Valor total R$ ${parsedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} extraído do PDF (não foram detectados itens individuais).`);
        } else {
          toast.info('Não foi possível extrair os itens ou o valor total do PDF automaticamente. Ajuste manualmente.');
        }
      }
      setStep('review');
    } catch (error: any) {
      console.error(error);
      toast.error('Erro ao ler PDF.');
    } finally {
      setParsingPdf(false);
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
    }
  };

  const handlePdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadPdf(file, isAppending);
  };

  const updateItem = (
    id: string,
    fieldOrUpdates: keyof XmlItem | Partial<XmlItem>,
    value?: any
  ) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
          return { ...item, ...fieldOrUpdates };
        }
        return { ...item, [fieldOrUpdates as keyof XmlItem]: value };
      })
    );
  };

  const removeItem = (id: string) => setItems(items.filter(item => item.id !== id));
  const addItem = () => setItems([...items, makeItem()]);

  const handleConfirm = async () => {
    const itemsToImport = items.filter(i => i.selected && i.nome.trim() !== '' && i.quantidade > 0);
    if (itemsToImport.length === 0) {
      toast.error('Selecione e preencha ao menos um item válido para importar.');
      return;
    }

    if (!fornecedor.trim()) {
      toast.error('O fornecedor é obrigatório.');
      return;
    }
    const matchForn = fornecedores.find(
      (f: any) => f.trim().toLowerCase() === fornecedor.trim().toLowerCase()
    );
    if (!matchForn) {
      toast.error('O fornecedor informado não está cadastrado. Cadastre-o na aba de Fornecedores.');
      return;
    }
    const finalFornecedor = matchForn;
    setFornecedor(matchForn);

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
            email_titulo: `NF Importada - ${finalFornecedor || 'Sem Fornecedor'} - R$ ${totalComDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            valor_solicitado: totalComDesconto,
            valor_pago: totalComDesconto,
            data_envio: new Date().toISOString().split('T')[0],
            data_pagamento: new Date().toISOString().split('T')[0],
            fornecedor_nome: finalFornecedor || null,
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
          let produtoId = item.produtoId || productMap.get(virtualKey);

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
            ? `[FERRAMENTA] Importado via Nota (Com desconto de R$ ${itemDiscount.toFixed(2)} proporcional)`
            : '[FERRAMENTA] Importado via Nota';

          const { data: entData, error: entErr } = await supabase
            .from('entradas')
            .insert({
              obra_id: obraId,
              produto_id: produtoId,
              quantidade: item.quantidade,
              valor_unitario: finalUnitValue,
              observacao: note,
              fornecedor: finalFornecedor,
              status_entrega: 'PENDENTE',
              comprado_por_id: user?.id || null,
              comprado_em: new Date().toISOString(),
              compra_id: compraId
            })
            .select('id')
            .single();
          if (entErr) throw entErr;

          const entradaId = entData?.id;

          const ferramentasToInsert = Array.from({ length: Math.round(item.quantidade) }, (_, i) => ({
            obra_id: obraId,
            nome: item.nome.trim(),
            codigo: item.ferrCodigoPrefixo ? `${item.ferrCodigoPrefixo}-${String(i + 1).padStart(2, '0')}` : null,
            estado: 'comprado',
            status: 'COMPRADO',
            qr_code: `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            observacoes: `[CAT:${item.ferrCategoria || 'OUTROS'}] [LOC:${item.ferrLocalizacao || ''}]${entradaId ? ` [ENTRADA_ID:${entradaId}]` : ''}`,
          }));
          const { error: ferrErr } = await supabase.from('ferramentas').insert(ferramentasToInsert);
          if (ferrErr) throw ferrErr;

          ferramentasCreated += Math.round(item.quantidade);

        } else {
          let produtoId = item.produtoId;
          if (!produtoId) {
            const key = item.nome.toLowerCase().trim();
            produtoId = productMap.get(key);
          }

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
            const key = item.nome.toLowerCase().trim();
            productMap.set(key, produtoId);

            await supabase.from('logs_atividades' as any).insert({
              obra_id: obraId, user_id: user?.id, user_email: user?.email,
              acao: 'CADASTRAR', entidade: 'PRODUTO',
              detalhes: `Cadastrou o produto: ${item.nome.trim()} (via Nota)`
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
            ? `Importado via Nota (Com desconto de R$ ${itemDiscount.toFixed(2)} proporcional)`
            : 'Importado via Nota';

          const { error: entErr } = await supabase.from('entradas').insert({
            obra_id: obraId, produto_id: produtoId,
            quantidade: item.quantidade, valor_unitario: finalUnitValue,
            observacao: note,
            fornecedor: finalFornecedor,
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
          ? `Importou itens de Nota para estoque pendente vinculado à compra "${compraToLink.email_titulo}": ${itemsToImport.length} itens`
          : `Importou itens de Nota para compra e pendente: ${itemsToImport.length} itens do fornecedor ${finalFornecedor || 'Sem Fornecedor'}`
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
          <DialogTitle className="text-white font-display font-bold font-mono text-base flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            {compraToLink 
              ? `Lançar Itens no Estoque: ${compraToLink.email_titulo}`
              : 'Lançar Itens no Estoque (Entrada)'
            }
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6 py-6">
            <div className="text-center space-y-2">
              <h3 className="text-base font-semibold text-white">Como deseja dar entrada nos materiais desta compra?</h3>
              <p className="text-xs text-white/50 max-w-lg mx-auto">
                Selecione uma opção para carregar os itens. Você poderá mesclar múltiplos arquivos e digitar linhas adicionais antes de confirmar a entrada.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto pt-2">
              {/* Opção XML */}
              <button 
                type="button"
                onClick={() => {
                  setIsAppending(false);
                  xmlFileInputRef.current?.click();
                }}
                className="flex flex-col items-center text-center p-6 bg-[#0e1629] border border-white/10 hover:border-primary/50 rounded-2xl hover:bg-primary/5 transition-all group"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileUp className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-sm font-bold text-white mt-4">Importar por XML</h4>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  Lê todos os itens e valores da Nota Fiscal eletrônica (.xml)
                </p>
              </button>

              {/* Opção PDF */}
              <button 
                type="button"
                onClick={() => {
                  setIsAppending(false);
                  pdfFileInputRef.current?.click();
                }}
                disabled={parsingPdf}
                className="flex flex-col items-center text-center p-6 bg-[#0e1629] border border-white/10 hover:border-info/50 rounded-2xl hover:bg-info/5 transition-all group disabled:opacity-50"
              >
                <div className="h-12 w-12 rounded-xl bg-info/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {parsingPdf ? (
                    <Loader2 className="h-6 w-6 text-info animate-spin" />
                  ) : (
                    <FileText className="h-6 w-6 text-info" />
                  )}
                </div>
                <h4 className="text-sm font-bold text-white mt-4">Importar por PDF</h4>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  Lê todos os itens e valores da Nota Fiscal (.pdf) automaticamente
                </p>
              </button>

              {/* Opção Manual */}
              <button 
                type="button"
                onClick={() => {
                  setItems([makeItem()]);
                  setStep('review');
                }}
                className="flex flex-col items-center text-center p-6 bg-[#0e1629] border border-white/10 hover:border-emerald-500/50 rounded-2xl hover:bg-emerald-500/5 transition-all group"
              >
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="h-6 w-6 text-emerald-400" />
                </div>
                <h4 className="text-sm font-bold text-white mt-4">Lançar Manualmente</h4>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  Digite os itens e valores na tabela de revisão
                </p>
              </button>
            </div>

            <input ref={xmlFileInputRef} type="file" accept=".xml" className="hidden" onChange={handleXmlFile} />
            <input ref={pdfFileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfFile} />
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

                    {item.produtoId ? (
                      <div className="flex-1 flex items-center justify-between bg-primary/10 border border-primary/30 text-primary-foreground text-xs px-3 py-1.5 rounded-xl min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold truncate">Vínculo: {item.nome}</span>
                        </div>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5 text-primary-foreground hover:bg-primary/20 shrink-0"
                          onClick={() => {
                            updateItem(item.id, {
                              produtoId: undefined,
                              isNewProduct: true,
                            });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="relative flex-1 min-w-0">
                        <Input
                          value={item.nome}
                          onChange={(e) => {
                            updateItem(item.id, 'nome', e.target.value);
                            setSearchProductQuery(e.target.value);
                          }}
                          onFocus={() => {
                            setActiveDropdownRowId(item.id);
                            setSearchProductQuery(item.nome);
                          }}
                          onBlur={() => setTimeout(() => setActiveDropdownRowId(null), 200)}
                          className="h-9 w-full bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 rounded-xl text-xs"
                          placeholder={item.tipo === 'ferramenta' ? "Nome da ferramenta..." : "Nome do produto..."}
                          disabled={!item.selected}
                          autoComplete="off"
                        />
                        {activeDropdownRowId === item.id && (
                          <div className="absolute z-50 w-full mt-1 bg-[#0e1629] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                            {(() => {
                              const filtered = produtos.filter((p: any) => {
                                const isTool = p.nome.startsWith('[FERRAMENTA]');
                                const displayName = isTool ? p.nome.replace(/^\[FERRAMENTA\]\s*/, '') : p.nome;
                                const matchSearch = displayName.toLowerCase().includes((searchProductQuery || '').toLowerCase()) || 
                                                    p.nome.toLowerCase().includes((searchProductQuery || '').toLowerCase());
                                return item.tipo === 'ferramenta' ? (isTool && matchSearch) : (!isTool && matchSearch);
                              });

                              return (
                                <>
                                  {filtered.slice(0, 10).map((p: any) => {
                                    const displayName = p.nome.startsWith('[FERRAMENTA]') 
                                      ? p.nome.replace(/^\[FERRAMENTA\]\s*/, '') 
                                      : p.nome;
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors flex items-center justify-between text-[11px] border-b border-white/5"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          const updates: Partial<XmlItem> = {
                                            produtoId: p.id,
                                            nome: displayName,
                                            unidade: p.unidade || 'un',
                                            isNewProduct: false,
                                          };
                                          if (p.categoria) {
                                            if (item.tipo === 'ferramenta') {
                                              updates.ferrCategoria = p.categoria;
                                            } else {
                                              updates.matCategoria = p.categoria;
                                            }
                                          }
                                          updateItem(item.id, updates);
                                          setActiveDropdownRowId(null);
                                        }}
                                      >
                                        <div className="flex flex-col min-w-0">
                                          <span className="font-semibold text-white truncate">{displayName}</span>
                                          <span className="text-[9px] text-white/45 truncate">
                                            Unidade: {p.unidade || 'un'} {p.categoria && `• Categoria: ${p.categoria}`}
                                          </span>
                                        </div>
                                        <span className="text-[9px] bg-primary/20 text-primary-foreground border border-primary/30 px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ml-2">
                                          Vincular
                                        </span>
                                      </button>
                                    );
                                  })}
                                  {filtered.length === 0 && (
                                    <div className="p-3 text-center text-white/40 text-xs">
                                      Nenhum cadastrado com esse nome.
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 transition-colors flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold border-t border-white/10"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      updateItem(item.id, {
                                        produtoId: undefined,
                                        isNewProduct: true,
                                      });
                                      setActiveDropdownRowId(null);
                                    }}
                                  >
                                    <Plus className="h-3.5 w-3.5" /> Criar como novo no estoque
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
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

            <div className="flex flex-wrap gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={addItem} className="h-9 border-dashed border-2 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl">
                <Plus className="h-4 w-4 mr-2" /> Adicionar Linha Manualmente
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-dashed border-2 bg-primary/10 border-primary/30 hover:bg-primary/20 text-primary rounded-xl"
                onClick={() => {
                  setIsAppending(true);
                  if (xmlFileInputRef.current) xmlFileInputRef.current.value = '';
                  xmlFileInputRef.current?.click();
                }}
              >
                <FileUp className="h-4 w-4 mr-2" /> Importar Outro XML (Acumular Itens)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-dashed border-2 bg-info/10 border-info/30 hover:bg-info/20 text-info rounded-xl"
                onClick={() => {
                  setIsAppending(true);
                  if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
                  pdfFileInputRef.current?.click();
                }}
              >
                <FileText className="h-4 w-4 mr-2" /> Importar Outro PDF (Acumular Itens)
              </Button>
            </div>

            <div className="bg-[#0e1629] border border-white/5 rounded-xl p-4 mt-4 space-y-4">
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wide">
                Resumo da Importação (Financeiro + Estoque)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">
                    Fornecedor *
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
