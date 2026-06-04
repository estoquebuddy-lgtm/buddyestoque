import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, Search, Download, FileSpreadsheet, FileText, Mail, Wrench, 
  DollarSign, Clock, CheckCircle2, AlertTriangle, Edit, Trash2, Link, ArrowUpDown, RefreshCw,
  FileUp, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import GerarLivroFiscalDialog from './GerarLivroFiscalDialog';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ComprasTabProps {
  obraId: string;
}

const STATUS_OPTIONS = [
  'NÃO INICIADO',
  'EMAIL ENVIADO',
  'PAGO',
  'A CAMINHO',
  'ENTREGUE',
  'FALTA NF',
  'ARQUIVADO'
];

const SOLICITACAO_OPTIONS = [
  'Materiais',
  'Frete',
  'Serviços',
  'Mão de obra Buddy',
  'Outros'
];

const CENTROS_CUSTO = Array.from({ length: 31 }, (_, i) => i + 1);

export default function ComprasTab({ obraId }: ComprasTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ativas' | 'geral' | 'kanban' | 'dashboard'>('ativas');
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedCentroCusto, setSelectedCentroCusto] = useState<string>('all');
  const [selectedTipoSolicitacao, setSelectedTipoSolicitacao] = useState<string>('all');
  const [sortField, setSortField] = useState<'data_envio' | 'data_pagamento'>('data_envio');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNfOpen, setIsNfOpen] = useState(false);
  const [isLivroOpen, setIsLivroOpen] = useState(false);
  
  const [selectedCompra, setSelectedCompra] = useState<any | null>(null);
  
  // NF Form states
  const [isNfFormOpen, setIsNfFormOpen] = useState(false);
  const [selectedNf, setSelectedNf] = useState<any | null>(null);
  const [parsingPdf, setParsingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states for Compras
  const [formData, setFormData] = useState({
    status: 'NÃO INICIADO',
    data_envio: '',
    valor_solicitado: '',
    email_titulo: '',
    email_link: '',
    fornecedor_nome: '',
    fornecedor_cnpj: '',
    fornecedor_dados: '',
    valor_pago: '',
    data_pagamento: '',
    centro_custo: '',
    tipo_material: '',
    tipo_solicitacao: 'Materiais',
    obs: ''
  });

  // Form states for NFs
  const [nfFormData, setNfFormData] = useState({
    valor_nf: '',
    link_nf: '',
    livro_data_entrada: '',
    livro_especie: 'NF',
    livro_numero: '',
    livro_serie: '',
    livro_data_doc: '',
    livro_cnpj_emitente: '',
    livro_uf: '',
    livro_valor_contabil: '',
    livro_cfop: '1556',
    livro_icms_iss: '',
    livro_cod_fiscal: '3',
    livro_base_calculo: '',
    livro_aliquota: '',
    livro_imp_creditado: ''
  });

  // Realtime subscription
  useEffect(() => {
    const channelCompras = supabase.channel('compras-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      }).subscribe();

    const channelNfs = supabase.channel('compras-nfs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras_nfs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      }).subscribe();

    return () => {
      supabase.removeChannel(channelCompras);
      supabase.removeChannel(channelNfs);
    };
  }, [obraId, queryClient]);

  // Queries
  const { data: compras = [], isLoading } = useQuery({
    queryKey: ['compras', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('*, compras_nfs(*)')
        .eq('obra_id', obraId);
      if (error) {
        toast.error('Erro ao buscar lançamentos de compras');
        throw error;
      }
      return data || [];
    }
  });

  // Mutations
  const createCompraMutation = useMutation({
    mutationFn: async (newCompra: any) => {
      const { data, error } = await supabase.from('compras').insert([newCompra]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      toast.success('Compra cadastrada com sucesso!');
      setIsCreateOpen(false);
      resetFormData();
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    }
  });

  const updateCompraMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: any }) => {
      const { data, error } = await supabase.from('compras').update(fields).eq('id', id).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      toast.success('Lançamento atualizado!');
      setIsEditOpen(false);
      setSelectedCompra(null);
    },
    onError: (err: any) => {
      toast.error(`Erro ao atualizar: ${err.message}`);
    }
  });

  const deleteCompraMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      toast.success('Lançamento removido.');
      setIsEditOpen(false);
    },
    onError: (err: any) => {
      toast.error(`Erro ao remover: ${err.message}`);
    }
  });

  // NF Mutations
  const saveNfMutation = useMutation({
    mutationFn: async (nfData: any) => {
      if (selectedNf) {
        const { error } = await supabase.from('compras_nfs').update(nfData).eq('id', selectedNf.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compras_nfs').insert([{ ...nfData, compra_id: selectedCompra.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      toast.success('Nota Fiscal salva com sucesso!');
      setIsNfFormOpen(false);
      setSelectedNf(null);
      resetNfFormData();
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar NF: ${err.message}`);
    }
  });

  const deleteNfMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras_nfs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      toast.success('Nota Fiscal excluída.');
    },
    onError: (err: any) => {
      toast.error(`Erro ao excluir NF: ${err.message}`);
    }
  });

  // Unique months helper
  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    compras.forEach((c: any) => {
      if (c.data_envio) monthsSet.add(c.data_envio.substring(0, 7));
      if (c.data_pagamento) monthsSet.add(c.data_pagamento.substring(0, 7));
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [compras]);

  const monthLabel = (monthStr: string) => {
    if (!monthStr || monthStr === 'all') return 'Todos';
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 15);
    return format(date, 'MMMM/yyyy', { locale: ptBR });
  };

  // Helper values
  const formattedCurrency = (val: number | null) => {
    if (val === null || isNaN(val)) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formattedDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return format(date, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  // Filter & Sort Logic
  const processedCompras = useMemo(() => {
    let result = compras.map((c: any) => {
      const sumNfs = (c.compras_nfs || []).reduce((acc: number, nf: any) => acc + (nf.valor_nf || 0), 0);
      const diffSolicitadoPago = (c.valor_solicitado || 0) - (c.valor_pago || 0);
      const diffPagoNf = (c.valor_pago || 0) - sumNfs;
      
      return {
        ...c,
        sumNfs,
        diffSolicitadoPago,
        diffPagoNf
      };
    });

    // Sub-tab specific status filter
    if (activeTab === 'ativas') {
      result = result.filter((c: any) => c.status !== 'ARQUIVADO');
    }

    // Filters
    if (selectedMonth !== 'all') {
      result = result.filter((c: any) => {
        const envioMonth = c.data_envio?.substring(0, 7);
        const pagoMonth = c.data_pagamento?.substring(0, 7);
        return envioMonth === selectedMonth || pagoMonth === selectedMonth;
      });
    }

    if (selectedCentroCusto !== 'all') {
      result = result.filter((c: any) => c.centro_custo === Number(selectedCentroCusto));
    }

    if (selectedTipoSolicitacao !== 'all') {
      result = result.filter((c: any) => c.tipo_solicitacao === selectedTipoSolicitacao);
    }

    if (search.trim() !== '') {
      const term = search.toLowerCase();
      result = result.filter((c: any) => 
        (c.email_titulo && c.email_titulo.toLowerCase().includes(term)) ||
        (c.fornecedor_nome && c.fornecedor_nome.toLowerCase().includes(term)) ||
        (c.fornecedor_cnpj && c.fornecedor_cnpj.toLowerCase().includes(term)) ||
        (c.tipo_material && c.tipo_material.toLowerCase().includes(term)) ||
        (c.obs && c.obs.toLowerCase().includes(term))
      );
    }

    // Sorting
    result.sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (!valA) return sortOrder === 'asc' ? 1 : -1;
      if (!valB) return sortOrder === 'asc' ? -1 : 1;

      return sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    });

    return result;
  }, [compras, activeTab, selectedMonth, selectedCentroCusto, selectedTipoSolicitacao, search, sortField, sortOrder]);

  // Dashboard calculation based on current active/filtered list
  const dashboardStats = useMemo(() => {
    let totSolicitado = 0;
    let totPago = 0;
    let totNf = 0;
    let totSemNf = 0;
    let totEntradas = 0;

    processedCompras.forEach((c: any) => {
      totSolicitado += c.valor_solicitado || 0;
      totPago += c.valor_pago || 0;
      
      const sumNfs = (c.compras_nfs || []).reduce((acc: number, nf: any) => acc + (nf.valor_nf || 0), 0);
      totNf += sumNfs;
      totEntradas += (c.compras_nfs || []).length;

      // "Valores sem NF": marked as FALTA NF, or amount paid exceeds NF total
      if (c.status === 'FALTA NF' || (c.valor_pago || 0) > sumNfs) {
        const delta = (c.valor_pago || 0) - sumNfs;
        if (delta > 0) totSemNf += delta;
      }
    });

    return {
      totSolicitado,
      totPago,
      totNf,
      totSemNf,
      totEntradas
    };
  }, [processedCompras]);

  // Transform current NFs to FiscalRows for PDF generator
  const currentFiscalRows = useMemo(() => {
    const rows: any[] = [];
    processedCompras.forEach((c: any) => {
      (c.compras_nfs || []).forEach((nf: any) => {
        rows.push({
          filename: `NF_${nf.livro_numero || 'S-N'}.pdf`,
          dataEntrada: nf.livro_data_entrada ? format(new Date(nf.livro_data_entrada + 'T12:00:00'), 'dd/MM/yy') : '',
          especie: nf.livro_especie || 'NF',
          nNF: nf.livro_numero || '',
          serie: nf.livro_serie || '',
          dataDoc: nf.livro_data_doc ? format(new Date(nf.livro_data_doc + 'T12:00:00'), 'dd/MM/yy') : '',
          cnpjEmit: nf.livro_cnpj_emitente || c.fornecedor_cnpj || '',
          uf: nf.livro_uf || 'SC',
          vNF: nf.valor_nf || 0,
          cfop: nf.livro_cfop || '1556',
          imposto: 'ICMS',
          codigoA: nf.livro_cod_fiscal || '3',
          bCalculo: nf.livro_base_calculo || nf.valor_nf || 0,
          pICMS: nf.livro_aliquota || 0,
          vICMS: nf.livro_imp_creditado || 0,
          linhas_fiscais: [],
          observacoes: c.email_titulo || ''
        });
      });
    });
    return rows;
  }, [processedCompras]);

  // Form Resetters
  const resetFormData = () => {
    setFormData({
      status: 'NÃO INICIADO',
      data_envio: '',
      valor_solicitado: '',
      email_titulo: '',
      email_link: '',
      fornecedor_nome: '',
      fornecedor_cnpj: '',
      fornecedor_dados: '',
      valor_pago: '',
      data_pagamento: '',
      centro_custo: '',
      tipo_material: '',
      tipo_solicitacao: 'Materiais',
      obs: ''
    });
  };

  const resetNfFormData = () => {
    setNfFormData({
      valor_nf: '',
      link_nf: '',
      livro_data_entrada: '',
      livro_especie: 'NF',
      livro_numero: '',
      livro_serie: '',
      livro_data_doc: '',
      livro_cnpj_emitente: selectedCompra?.fornecedor_cnpj || '',
      livro_uf: 'SC',
      livro_valor_contabil: '',
      livro_cfop: '1556',
      livro_icms_iss: '',
      livro_cod_fiscal: '3',
      livro_base_calculo: '',
      livro_aliquota: '',
      livro_imp_creditado: ''
    });
  };

  // Open Handlers
  const handleOpenEdit = (compra: any) => {
    setSelectedCompra(compra);
    setFormData({
      status: compra.status,
      data_envio: compra.data_envio || '',
      valor_solicitado: compra.valor_solicitado?.toString() || '',
      email_titulo: compra.email_titulo || '',
      email_link: compra.email_link || '',
      fornecedor_nome: compra.fornecedor_nome || '',
      fornecedor_cnpj: compra.fornecedor_cnpj || '',
      fornecedor_dados: compra.fornecedor_dados || '',
      valor_pago: compra.valor_pago?.toString() || '',
      data_pagamento: compra.data_pagamento || '',
      centro_custo: compra.centro_custo?.toString() || '',
      tipo_material: compra.tipo_material || '',
      tipo_solicitacao: compra.tipo_solicitacao || 'Materiais',
      obs: compra.obs || ''
    });
    setIsEditOpen(true);
  };

  const handleOpenNfs = (compra: any) => {
    setSelectedCompra(compra);
    setIsNfOpen(true);
  };

  const handleOpenEditNf = (nf: any) => {
    setSelectedNf(nf);
    setNfFormData({
      valor_nf: nf.valor_nf?.toString() || '',
      link_nf: nf.link_nf || '',
      livro_data_entrada: nf.livro_data_entrada || '',
      livro_especie: nf.livro_especie || 'NF',
      livro_numero: nf.livro_numero || '',
      livro_serie: nf.livro_serie || '',
      livro_data_doc: nf.livro_data_doc || '',
      livro_cnpj_emitente: nf.livro_cnpj_emitente || selectedCompra?.fornecedor_cnpj || '',
      livro_uf: nf.livro_uf || 'SC',
      livro_valor_contabil: nf.livro_valor_contabil?.toString() || '',
      livro_cfop: nf.livro_cfop || '1556',
      livro_icms_iss: nf.livro_icms_iss?.toString() || '',
      livro_cod_fiscal: nf.livro_cod_fiscal || '3',
      livro_base_calculo: nf.livro_base_calculo?.toString() || '',
      livro_aliquota: nf.livro_aliquota?.toString() || '',
      livro_imp_creditado: nf.livro_imp_creditado?.toString() || ''
    });
    setIsNfFormOpen(true);
  };

  const handleOpenAddNf = () => {
    setSelectedNf(null);
    resetNfFormData();
    setIsNfFormOpen(true);
  };

  // Submit Handlers
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      obra_id: obraId,
      status: formData.status,
      data_envio: formData.data_envio || null,
      valor_solicitado: formData.valor_solicitado ? parseFloat(formData.valor_solicitado) : null,
      email_titulo: formData.email_titulo || null,
      email_link: formData.email_link || null,
      fornecedor_nome: formData.fornecedor_nome || null,
      fornecedor_cnpj: formData.fornecedor_cnpj || null,
      fornecedor_dados: formData.fornecedor_dados || null,
      valor_pago: formData.valor_pago ? parseFloat(formData.valor_pago) : null,
      data_pagamento: formData.data_pagamento || null,
      centro_custo: formData.centro_custo ? parseInt(formData.centro_custo) : null,
      tipo_material: formData.tipo_material || null,
      tipo_solicitacao: formData.tipo_solicitacao,
      obs: formData.obs || null
    };
    createCompraMutation.mutate(payload);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompra) return;
    const payload = {
      status: formData.status,
      data_envio: formData.data_envio || null,
      valor_solicitado: formData.valor_solicitado ? parseFloat(formData.valor_solicitado) : null,
      email_titulo: formData.email_titulo || null,
      email_link: formData.email_link || null,
      fornecedor_nome: formData.fornecedor_nome || null,
      fornecedor_cnpj: formData.fornecedor_cnpj || null,
      fornecedor_dados: formData.fornecedor_dados || null,
      valor_pago: formData.valor_pago ? parseFloat(formData.valor_pago) : null,
      data_pagamento: formData.data_pagamento || null,
      centro_custo: formData.centro_custo ? parseInt(formData.centro_custo) : null,
      tipo_material: formData.tipo_material || null,
      tipo_solicitacao: formData.tipo_solicitacao,
      obs: formData.obs || null
    };
    updateCompraMutation.mutate({ id: selectedCompra.id, fields: payload });
  };

  const handleNfSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const vNf = parseFloat(nfFormData.valor_nf);
    if (isNaN(vNf)) {
      toast.error('Valor da NF é obrigatório');
      return;
    }
    const payload = {
      valor_nf: vNf,
      link_nf: nfFormData.link_nf || null,
      livro_data_entrada: nfFormData.livro_data_entrada || null,
      livro_especie: nfFormData.livro_especie || null,
      livro_numero: nfFormData.livro_numero || null,
      livro_serie: nfFormData.livro_serie || null,
      livro_data_doc: nfFormData.livro_data_doc || null,
      livro_cnpj_emitente: nfFormData.livro_cnpj_emitente || null,
      livro_uf: nfFormData.livro_uf || null,
      livro_valor_contabil: nfFormData.livro_valor_contabil ? parseFloat(nfFormData.livro_valor_contabil) : vNf,
      livro_cfop: nfFormData.livro_cfop || null,
      livro_icms_iss: nfFormData.livro_icms_iss ? parseFloat(nfFormData.livro_icms_iss) : null,
      livro_cod_fiscal: nfFormData.livro_cod_fiscal || null,
      livro_base_calculo: nfFormData.livro_base_calculo ? parseFloat(nfFormData.livro_base_calculo) : vNf,
      livro_aliquota: nfFormData.livro_aliquota ? parseFloat(nfFormData.livro_aliquota) : null,
      livro_imp_creditado: nfFormData.livro_imp_creditado ? parseFloat(nfFormData.livro_imp_creditado) : null
    };
    saveNfMutation.mutate(payload);
  };

  const handleNfPdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Por favor, selecione um arquivo PDF.');
      return;
    }

    setParsingPdf(true);
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

      console.log('PDF Text extracted:', fullText);

      // 1. CNPJ
      const cnpjRegex = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
      const cnpjs = fullText.match(cnpjRegex) || [];
      const emitCnpj = cnpjs[0] || '';

      // 2. UF
      let uf = 'SC';
      const ufMatch = fullText.match(/uf\s*:\s*([a-z]{2})/i) || fullText.match(/([a-z]{2})\s+insc/i);
      if (ufMatch) {
        uf = ufMatch[1].toUpperCase();
      } else {
        const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
        const stateWord = fullText.split(/\s+/).find(w => states.includes(w.toUpperCase()));
        if (stateWord) uf = stateWord.toUpperCase();
      }

      // 3. Número NF
      let numeroNf = '';
      const numMatch = fullText.match(/n[oº]\s*([\d.]+)/i) || fullText.match(/n[uú]mero\s*([\d.]+)/i) || fullText.match(/nf-e\s*n[oº]\s*([\d.]+)/i);
      if (numMatch) {
        numeroNf = numMatch[1].replace(/\./g, '');
      }

      // 4. Série
      let serie = '1';
      const serieMatch = fullText.match(/s[eé]rie\s*:\s*(\d+)/i) || fullText.match(/s[eé]rie\s+(\d+)/i);
      if (serieMatch) {
        serie = serieMatch[1];
      }

      // 5. Valor da NF
      let valorNf = '';
      const valRegex = /(?:valor(?:\s+total)?(?:\s+da)?(?:\s+nota|\s+dos\s+produtos)?|valor\s+liq\.)\s*(?:r\$)?\s*([\d.]+,\d{2})/i;
      const valMatch = fullText.match(valRegex);
      if (valMatch) {
        valorNf = valMatch[1].replace(/\./g, '').replace(',', '.');
      } else {
        const valRegex2 = /(?:r\$)\s*([\d.]+,\d{2})/i;
        const valMatch2 = fullText.match(valRegex2);
        if (valMatch2) {
          valorNf = valMatch2[1].replace(/\./g, '').replace(',', '.');
        }
      }

      // 6. Data de Emissão (Data Doc)
      let dataDoc = '';
      const dates = fullText.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
      if (dates.length > 0) {
        const parts = dates[0].split('/');
        dataDoc = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      // Populate form data
      setNfFormData(prev => ({
        ...prev,
        valor_nf: valorNf || prev.valor_nf,
        livro_valor_contabil: valorNf || prev.livro_valor_contabil,
        livro_base_calculo: valorNf || prev.livro_base_calculo,
        livro_numero: numeroNf || prev.livro_numero,
        livro_serie: serie || prev.livro_serie,
        livro_cnpj_emitente: emitCnpj || prev.livro_cnpj_emitente || selectedCompra?.fornecedor_cnpj || '',
        livro_uf: uf || prev.livro_uf,
        livro_data_doc: dataDoc || prev.livro_data_doc,
        livro_data_entrada: dataDoc || prev.livro_data_entrada || format(new Date(), 'yyyy-MM-dd')
      }));

      toast.success('Informações extraídas do PDF da NF com sucesso! Revise os campos.');
    } catch (error) {
      console.error('Error parsing PDF:', error);
      toast.error('Erro ao processar o PDF. Você pode digitar os dados.');
    } finally {
      setParsingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStatusChange = (compraId: string, newStatus: string) => {
    updateCompraMutation.mutate({ id: compraId, fields: { status: newStatus } });
  };

  // Export functions
  const exportToExcel = () => {
    if (processedCompras.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }

    const data = processedCompras.map((c: any) => {
      const nfsNums = (c.compras_nfs || []).map((nf: any) => nf.livro_numero || 'S/N').join(', ');
      return {
        'Status': c.status,
        'Envio': formattedDate(c.data_envio),
        'Valor Solicitado': c.valor_solicitado || 0,
        'E-mail': c.email_titulo || '',
        'Link E-mail': c.email_link || '',
        'Fornecedor': c.fornecedor_nome || '',
        'CNPJ': c.fornecedor_cnpj || '',
        'Valor Pago': c.valor_pago || 0,
        'Data Pagamento': formattedDate(c.data_pagamento),
        'NFs Vinculadas': nfsNums,
        'Total NFs (R$)': c.sumNfs,
        'Centro de Custo': c.centro_custo || '',
        'Tipo de Material': c.tipo_material || '',
        'Tipo de Solicitação': c.tipo_solicitacao,
        'Conf. Solicitado x Pago': c.diffSolicitadoPago === 0 ? 'OK' : `Dif: ${c.diffSolicitadoPago}`,
        'Conf. Pago x NF': c.diffPagoNf === 0 ? 'OK' : `Falta NF: ${c.diffPagoNf}`,
        'Observações': c.obs || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Compras');

    // Auto-fit column widths
    const maxLens = data.reduce((acc: any, row: any) => {
      Object.keys(row).forEach(key => {
        const len = row[key]?.toString().length || 0;
        acc[key] = Math.max(acc[key] || 10, len);
      });
      return acc;
    }, {});
    worksheet['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] + 3 }));

    XLSX.writeFile(workbook, `lancamentos-compras-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    toast.success('Arquivo Excel gerado!');
  };

  const exportToPdf = () => {
    if (processedCompras.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Relatório de Lançamentos de Compras e Pagamentos', 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Filtros Aplicados: CC: ${selectedCentroCusto}, Tipo: ${selectedTipoSolicitacao}, Mês: ${monthLabel(selectedMonth)}`, 14, 21);

    const headers = [
      ['Status', 'Fornecedor', 'Solicitação', 'Material', 'CC', 'Solicitado', 'Pago', 'Total NF', 'Envio', 'Data Pagto']
    ];

    const body = processedCompras.map((c: any) => [
      c.status,
      c.fornecedor_nome || '-',
      c.tipo_solicitacao,
      c.tipo_material || '-',
      c.centro_custo || '-',
      formattedCurrency(c.valor_solicitado),
      formattedCurrency(c.valor_pago),
      formattedCurrency(c.sumNfs),
      formattedDate(c.data_envio),
      formattedDate(c.data_pagamento)
    ]);

    autoTable(doc, {
      startY: 25,
      head: headers,
      body: body,
      theme: 'striped',
      styles: { fontSize: 8, font: 'helvetica', cellPadding: 2 },
      headStyles: { fillColor: [14, 22, 41] }, // Brand Dark Color bg-[#0e1629]
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' }
      }
    });

    doc.save(`relatorio-compras-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('Relatório PDF baixado!');
  };

  return (
    <div className="space-y-6">
      {/* Header and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold">Compras</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento de solicitações de pagamento, fluxos de cotação e conciliação de Notas Fiscais.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/95 text-white font-bold h-10 px-4 rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/10">
            <Plus className="h-4 w-4" />
            Novo Lançamento
          </Button>
          <Button onClick={() => setIsLivroOpen(true)} variant="outline" className="h-10 px-4 rounded-xl flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-primary" />
            Livro Fiscal de Entradas
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-muted/40 p-3 rounded-2xl border">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por e-mail, fornecedor, material..." 
            className="pl-9 h-10 bg-background rounded-xl focus-visible:ring-primary"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        {/* Month Filter */}
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-10 bg-background rounded-xl">
            <SelectValue placeholder="Filtrar por Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Meses</SelectItem>
            {uniqueMonths.map(m => (
              <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Centro de Custo */}
        <Select value={selectedCentroCusto} onValueChange={setSelectedCentroCusto}>
          <SelectTrigger className="h-10 bg-background rounded-xl">
            <SelectValue placeholder="Centro de Custo" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="all">Todos os CC</SelectItem>
            {CENTROS_CUSTO.map(cc => (
              <SelectItem key={cc} value={cc.toString()}>CC: {cc}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tipo Solicitação */}
        <Select value={selectedTipoSolicitacao} onValueChange={setSelectedTipoSolicitacao}>
          <SelectTrigger className="h-10 bg-background rounded-xl">
            <SelectValue placeholder="Tipo de Solicitação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            {SOLICITACAO_OPTIONS.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs list with export actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full sm:w-auto">
          <TabsList className="bg-muted/50 p-1 rounded-xl border">
            <TabsTrigger value="ativas" className="rounded-lg text-xs font-semibold px-3 py-1.5">Ativas</TabsTrigger>
            <TabsTrigger value="geral" className="rounded-lg text-xs font-semibold px-3 py-1.5">Geral</TabsTrigger>
            <TabsTrigger value="kanban" className="rounded-lg text-xs font-semibold px-3 py-1.5">Kanban</TabsTrigger>
            <TabsTrigger value="dashboard" className="rounded-lg text-xs font-semibold px-3 py-1.5">Dashboard</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab !== 'dashboard' && (
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button onClick={exportToPdf} variant="outline" className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium">
              <Download className="h-3.5 w-3.5 text-red-500" />
              Exportar PDF
            </Button>
            <Button onClick={exportToExcel} variant="outline" className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium">
              <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
              Exportar Excel
            </Button>
          </div>
        )}
      </div>

      {/* Tab Contents */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-20 text-white/50 space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Carregando lançamentos...</p>
        </div>
      ) : (
        <>
          {/* List views (Ativas & Geral) */}
          {(activeTab === 'ativas' || activeTab === 'geral') && (
            <div className="bg-[#0e1629]/60 border border-white/5 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="overflow-x-auto max-w-full">
                <Table>
                  <TableHeader className="bg-[#090e1b] border-b border-white/5">
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="text-white/60 text-xs font-bold py-3.5">Status</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5">
                        <button onClick={() => { setSortField('data_envio'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }} className="flex items-center gap-1 hover:text-white">
                          Envio <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-right">Val. Solicitado</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5">Assunto E-mail</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5">Fornecedor</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-right">Val. Pago</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5">
                        <button onClick={() => { setSortField('data_pagamento'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }} className="flex items-center gap-1 hover:text-white">
                          Pagamento <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-center">NFs</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-center">CC</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5">Solicitação</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-center">Conf. Sol x Pag</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-center">Conf. Pag x NF</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-3.5 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedCompras.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={13} className="text-center py-12 text-white/30 font-medium">Nenhum lançamento de compra encontrado.</TableCell>
                      </TableRow>
                    ) : (
                      processedCompras.map((compra: any) => {
                        const hasEmailLink = !!compra.email_link;
                        return (
                          <TableRow key={compra.id} className="border-b border-white/5 hover:bg-white/5 text-white/90">
                            {/* Status */}
                            <TableCell className="py-3">
                              <Badge className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border-none ${
                                compra.status === 'PAGO' || compra.status === 'ENTREGUE' ? 'bg-green-500/10 text-green-400' :
                                compra.status === 'EMAIL ENVIADO' || compra.status === 'A CAMINHO' ? 'bg-blue-500/10 text-blue-400' :
                                compra.status === 'FALTA NF' ? 'bg-red-500/10 text-red-400' :
                                compra.status === 'ARQUIVADO' ? 'bg-white/10 text-white/50' : 'bg-yellow-500/10 text-yellow-400'
                              }`}>
                                {compra.status}
                              </Badge>
                            </TableCell>
                            
                            {/* Envio */}
                            <TableCell className="py-3 font-mono text-xs">{formattedDate(compra.data_envio)}</TableCell>
                            
                            {/* Valor Solicitado */}
                            <TableCell className="py-3 text-right font-semibold font-mono text-xs">{formattedCurrency(compra.valor_solicitado)}</TableCell>
                            
                            {/* Email */}
                            <TableCell className="py-3 max-w-[200px] truncate">
                              {hasEmailLink ? (
                                <a href={compra.email_link} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{compra.email_titulo || 'Ver Link'}</span>
                                </a>
                              ) : (
                                <span className="text-white/60">{compra.email_titulo || '-'}</span>
                              )}
                            </TableCell>
                            
                            {/* Fornecedor */}
                            <TableCell className="py-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-xs text-white">{compra.fornecedor_nome || '-'}</span>
                                {compra.fornecedor_cnpj && <span className="text-[10px] text-white/40 font-mono">{compra.fornecedor_cnpj}</span>}
                              </div>
                            </TableCell>
                            
                            {/* Valor Pago */}
                            <TableCell className="py-3 text-right font-semibold font-mono text-xs text-green-400">{formattedCurrency(compra.valor_pago)}</TableCell>
                            
                            {/* Data Pagamento */}
                            <TableCell className="py-3 font-mono text-xs">{formattedDate(compra.data_pagamento)}</TableCell>
                            
                            {/* NFs list cell */}
                            <TableCell className="py-3 text-center">
                              <Button onClick={() => handleOpenNfs(compra)} variant="ghost" className="h-8 px-2 rounded-lg text-xs flex items-center gap-1.5 hover:bg-white/5 text-white/80">
                                <FileText className={`h-3.5 w-3.5 ${compra.compras_nfs?.length > 0 ? 'text-primary' : 'text-white/30'}`} />
                                <span className="font-bold">{compra.compras_nfs?.length || 0}</span>
                              </Button>
                            </TableCell>
                            
                            {/* Centro de Custo */}
                            <TableCell className="py-3 text-center">
                              {compra.centro_custo ? (
                                <Badge className="bg-[#1a253c] text-white/85 text-[10px] font-mono border-none rounded">CC: {compra.centro_custo}</Badge>
                              ) : '-'}
                            </TableCell>
                            
                            {/* Tipo Solicitação */}
                            <TableCell className="py-3 text-xs text-white/70">{compra.tipo_solicitacao}</TableCell>
                            
                            {/* Conf. Solicitado x Pago */}
                            <TableCell className="py-3 text-center">
                              {compra.valor_solicitado === null || compra.valor_pago === null ? (
                                <span className="text-white/30">-</span>
                              ) : compra.diffSolicitadoPago === 0 ? (
                                <Badge className="bg-green-500/10 text-green-400 border-none font-semibold text-[10px] rounded">OK</Badge>
                              ) : (
                                <Badge className="bg-yellow-500/10 text-yellow-400 border-none font-mono text-[10px] rounded">
                                  {compra.diffSolicitadoPago > 0 ? 'Falta: ' : 'Excesso: '}
                                  {formattedCurrency(Math.abs(compra.diffSolicitadoPago))}
                                </Badge>
                              )}
                            </TableCell>
                            
                            {/* Conf. Pago x NF */}
                            <TableCell className="py-3 text-center">
                              {compra.valor_pago === null ? (
                                <span className="text-white/30">-</span>
                              ) : compra.diffPagoNf === 0 ? (
                                <Badge className="bg-green-500/10 text-green-400 border-none font-semibold text-[10px] rounded">OK</Badge>
                              ) : compra.diffPagoNf > 0 ? (
                                <Badge className="bg-red-500/10 text-red-400 border-none font-mono text-[10px] rounded">
                                  Falta NF: {formattedCurrency(compra.diffPagoNf)}
                                </Badge>
                              ) : (
                                <Badge className="bg-blue-500/10 text-blue-400 border-none font-mono text-[10px] rounded">
                                  Excede: {formattedCurrency(Math.abs(compra.diffPagoNf))}
                                </Badge>
                              )}
                            </TableCell>
                            
                            {/* Actions */}
                            <TableCell className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button onClick={() => handleOpenEdit(compra)} variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-white/5 text-white/50 hover:text-white">
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Kanban view */}
          {activeTab === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 overflow-x-auto pb-4">
              {STATUS_OPTIONS.map(statusCol => {
                const columnCompras = processedCompras.filter((c: any) => c.status === statusCol);
                
                return (
                  <div key={statusCol} className="bg-[#0b1120] border border-white/5 p-3 rounded-2xl min-w-[240px] flex flex-col max-h-[70vh]">
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                      <h3 className="text-xs font-bold text-white/60 tracking-wider truncate mr-2">{statusCol}</h3>
                      <Badge className="bg-white/5 text-white/80 font-bold border-none text-[10px] shrink-0 h-5 flex items-center">{columnCompras.length}</Badge>
                    </div>

                    {/* Column Cards Container */}
                    <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                      {columnCompras.length === 0 ? (
                        <div className="h-20 border border-dashed border-white/5 rounded-xl flex items-center justify-center text-[10px] text-white/20">Vazia</div>
                      ) : (
                        columnCompras.map((c: any) => (
                          <div 
                            key={c.id} 
                            onClick={() => handleOpenEdit(c)}
                            className="bg-[#121c32]/50 border border-white/5 p-3 rounded-xl hover:border-primary/50 transition-colors cursor-pointer space-y-2"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[10px] uppercase font-bold text-primary">{c.tipo_solicitacao}</span>
                              {c.centro_custo && (
                                <span className="bg-[#1d2b4a] text-white/70 px-1 rounded text-[9px] font-mono">CC:{c.centro_custo}</span>
                              )}
                            </div>

                            <p className="text-xs font-semibold text-white line-clamp-2">{c.tipo_material || 'Sem material especificado'}</p>
                            
                            <div className="flex flex-col text-[10px] text-white/40 space-y-0.5 border-t border-white/5 pt-2">
                              <span className="truncate text-white/70 font-medium">{c.fornecedor_nome || 'S/ Fornecedor'}</span>
                              <div className="flex justify-between items-center font-mono mt-1 pt-1 border-t border-white/5">
                                <span>Sol: {formattedCurrency(c.valor_solicitado)}</span>
                                <span className="text-green-400 font-bold">Pag: {formattedCurrency(c.valor_pago)}</span>
                              </div>
                            </div>

                            {/* Status Quick Move Select */}
                            <div className="pt-1.5" onClick={e => e.stopPropagation()}>
                              <select 
                                value={c.status}
                                onChange={e => handleStatusChange(c.id, e.target.value)}
                                className="w-full bg-[#0a0f1d] border border-white/10 rounded px-1.5 py-0.5 text-[9px] text-white/60 font-semibold focus:outline-none"
                              >
                                {STATUS_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dashboard view */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Top summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="bg-[#0e1629]/50 border-white/5 rounded-2xl shadow-md overflow-hidden relative">
                  <div className="absolute right-3 top-3 bg-yellow-500/10 p-1.5 rounded-lg">
                    <Clock className="h-4 w-4 text-yellow-400" />
                  </div>
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Valor Solicitado</p>
                    <h3 className="text-xl font-bold font-mono text-white mt-1.5">{formattedCurrency(dashboardStats.totSolicitado)}</h3>
                  </CardContent>
                </Card>

                <Card className="bg-[#0e1629]/50 border-white/5 rounded-2xl shadow-md overflow-hidden relative">
                  <div className="absolute right-3 top-3 bg-green-500/10 p-1.5 rounded-lg">
                    <DollarSign className="h-4 w-4 text-green-400" />
                  </div>
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Valor Pago</p>
                    <h3 className="text-xl font-bold font-mono text-green-400 mt-1.5">{formattedCurrency(dashboardStats.totPago)}</h3>
                  </CardContent>
                </Card>

                <Card className="bg-[#0e1629]/50 border-white/5 rounded-2xl shadow-md overflow-hidden relative">
                  <div className="absolute right-3 top-3 bg-blue-500/10 p-1.5 rounded-lg">
                    <FileText className="h-4 w-4 text-blue-400" />
                  </div>
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Valor em NFs</p>
                    <h3 className="text-xl font-bold font-mono text-blue-400 mt-1.5">{formattedCurrency(dashboardStats.totNf)}</h3>
                  </CardContent>
                </Card>

                <Card className="bg-[#0e1629]/50 border-white/5 rounded-2xl shadow-md overflow-hidden relative">
                  <div className="absolute right-3 top-3 bg-red-500/10 p-1.5 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  </div>
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Valores Sem NF</p>
                    <h3 className="text-xl font-bold font-mono text-red-400 mt-1.5">{formattedCurrency(dashboardStats.totSemNf)}</h3>
                  </CardContent>
                </Card>

                <Card className="bg-[#0e1629]/50 border-white/5 rounded-2xl shadow-md overflow-hidden relative">
                  <div className="absolute right-3 top-3 bg-primary/10 p-1.5 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Total de NFs</p>
                    <h3 className="text-xl font-bold font-mono text-white mt-1.5">{dashboardStats.totEntradas}</h3>
                  </CardContent>
                </Card>
              </div>

              {/* Informational Conciliation Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-[#0e1629]/40 border-white/5 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Pendências de Valores: Solicitado x Pago
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {processedCompras.filter(c => c.valor_solicitado !== null && c.valor_pago !== null && c.diffSolicitadoPago !== 0).length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-6">Nenhuma divergência entre solicitado e pago.</p>
                    ) : (
                      processedCompras.filter(c => c.valor_solicitado !== null && c.valor_pago !== null && c.diffSolicitadoPago !== 0).map((c: any) => (
                        <div key={c.id} className="flex justify-between items-center bg-[#070b15]/30 p-2.5 rounded-xl border border-white/5">
                          <div className="flex flex-col max-w-[70%]">
                            <span className="text-xs font-semibold text-white truncate">{c.fornecedor_nome || 'S/ Fornecedor'}</span>
                            <span className="text-[10px] text-white/40 truncate">{c.tipo_material}</span>
                          </div>
                          <Badge className={`border-none rounded font-mono text-xs ${c.diffSolicitadoPago > 0 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                            {c.diffSolicitadoPago > 0 ? 'Falta Pagar: ' : 'Excesso Pago: '}
                            {formattedCurrency(Math.abs(c.diffSolicitadoPago))}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="bg-[#0e1629]/40 border-white/5 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Conciliação de Notas Fiscais: Pago x NF
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {processedCompras.filter(c => c.valor_pago !== null && c.diffPagoNf !== 0).length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-6">Todas as NFs batem 100% com os pagamentos realizados.</p>
                    ) : (
                      processedCompras.filter(c => c.valor_pago !== null && c.diffPagoNf !== 0).map((c: any) => (
                        <div key={c.id} className="flex justify-between items-center bg-[#070b15]/30 p-2.5 rounded-xl border border-white/5">
                          <div className="flex flex-col max-w-[70%]">
                            <span className="text-xs font-semibold text-white truncate">{c.fornecedor_nome || 'S/ Fornecedor'}</span>
                            <span className="text-[10px] text-white/40 truncate">{c.tipo_material}</span>
                          </div>
                          <Badge className={`border-none rounded font-mono text-xs ${c.diffPagoNf > 0 ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {c.diffPagoNf > 0 ? 'Falta NF: ' : 'Excesso NF: '}
                            {formattedCurrency(Math.abs(c.diffPagoNf))}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* CREATE COMPRA DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0e1629] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="font-bold text-white">Novo Lançamento de Compra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white/60">Status</Label>
                <select 
                  value={formData.status} 
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-[#070b15]/50 border border-white/10 rounded-xl h-10 px-3 text-white text-sm"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt} className="bg-[#0e1629] text-white">{opt}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-white/60">Tipo de Solicitação</Label>
                <select 
                  value={formData.tipo_solicitacao} 
                  onChange={e => setFormData({ ...formData, tipo_solicitacao: e.target.value })}
                  className="w-full bg-[#070b15]/50 border border-white/10 rounded-xl h-10 px-3 text-white text-sm"
                >
                  {SOLICITACAO_OPTIONS.map(opt => (
                    <option key={opt} value={opt} className="bg-[#0e1629] text-white">{opt}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Data de Envio do E-mail</Label>
                <Input 
                  type="date" 
                  value={formData.data_envio} 
                  onChange={e => setFormData({ ...formData, data_envio: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Valor Solicitado (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  value={formData.valor_solicitado} 
                  onChange={e => setFormData({ ...formData, valor_solicitado: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Assunto E-mail</Label>
                <Input 
                  placeholder="Ex: Pedido de Tubulações" 
                  value={formData.email_titulo} 
                  onChange={e => setFormData({ ...formData, email_titulo: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Link do E-mail</Label>
                <Input 
                  placeholder="https://..." 
                  value={formData.email_link} 
                  onChange={e => setFormData({ ...formData, email_link: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Fornecedor (Nome)</Label>
                <Input 
                  placeholder="Ex: Comercial Hidráulica LTDA" 
                  value={formData.fornecedor_nome} 
                  onChange={e => setFormData({ ...formData, fornecedor_nome: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Fornecedor CNPJ</Label>
                <Input 
                  placeholder="00.000.000/0001-00" 
                  value={formData.fornecedor_cnpj} 
                  onChange={e => setFormData({ ...formData, fornecedor_cnpj: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Valor Pago (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  value={formData.valor_pago} 
                  onChange={e => setFormData({ ...formData, valor_pago: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Data de Pagamento</Label>
                <Input 
                  type="date" 
                  value={formData.data_pagamento} 
                  onChange={e => setFormData({ ...formData, data_pagamento: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Centro de Custo (1 a 31)</Label>
                <select 
                  value={formData.centro_custo} 
                  onChange={e => setFormData({ ...formData, centro_custo: e.target.value })}
                  className="w-full bg-[#070b15]/50 border border-white/10 rounded-xl h-10 px-3 text-white text-sm"
                >
                  <option value="" className="bg-[#0e1629] text-white">Nenhum</option>
                  {CENTROS_CUSTO.map(cc => (
                    <option key={cc} value={cc.toString()} className="bg-[#0e1629] text-white">Centro de Custo {cc}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Tipo de Material</Label>
                <Input 
                  placeholder="Ex: Areia, Tubos PVC..." 
                  value={formData.tipo_material} 
                  onChange={e => setFormData({ ...formData, tipo_material: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-white/60">Dados do Fornecedor (Endereço, Contato)</Label>
              <Textarea 
                placeholder="Telefone, e-mail, agência/conta do fornecedor..." 
                value={formData.fornecedor_dados} 
                onChange={e => setFormData({ ...formData, fornecedor_dados: e.target.value })}
                className="bg-[#070b15]/50 border-white/10 text-white rounded-xl min-h-[60px]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-white/60">Observações Gerais</Label>
              <Textarea 
                placeholder="Informações adicionais relevantes sobre o pagamento..." 
                value={formData.obs} 
                onChange={e => setFormData({ ...formData, obs: e.target.value })}
                className="bg-[#070b15]/50 border-white/10 text-white rounded-xl min-h-[60px]"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)} className="text-white hover:bg-white/5 rounded-xl h-10">Cancelar</Button>
              <Button type="submit" disabled={createCompraMutation.isPending} className="bg-primary hover:bg-primary/95 text-white font-bold h-10 px-6 rounded-xl">
                {createCompraMutation.isPending ? 'Salvando...' : 'Salvar Compra'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT COMPRA DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0e1629] border-white/10 text-white">
          <DialogHeader className="flex flex-row justify-between items-center pr-6">
            <DialogTitle className="font-bold text-white">Editar Lançamento de Compra</DialogTitle>
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => {
                if(confirm('Tem certeza que deseja excluir esta compra? Isso excluirá todas as NFs associadas.')) {
                  deleteCompraMutation.mutate(selectedCompra.id);
                }
              }}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2 rounded-lg text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir Lançamento
            </Button>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white/60">Status</Label>
                <select 
                  value={formData.status} 
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-[#070b15]/50 border border-white/10 rounded-xl h-10 px-3 text-white text-sm"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt} className="bg-[#0e1629] text-white">{opt}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-white/60">Tipo de Solicitação</Label>
                <select 
                  value={formData.tipo_solicitacao} 
                  onChange={e => setFormData({ ...formData, tipo_solicitacao: e.target.value })}
                  className="w-full bg-[#070b15]/50 border border-white/10 rounded-xl h-10 px-3 text-white text-sm"
                >
                  {SOLICITACAO_OPTIONS.map(opt => (
                    <option key={opt} value={opt} className="bg-[#0e1629] text-white">{opt}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Data de Envio do E-mail</Label>
                <Input 
                  type="date" 
                  value={formData.data_envio} 
                  onChange={e => setFormData({ ...formData, data_envio: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Valor Solicitado (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  value={formData.valor_solicitado} 
                  onChange={e => setFormData({ ...formData, valor_solicitado: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Assunto E-mail</Label>
                <Input 
                  placeholder="Ex: Pedido de Tubulações" 
                  value={formData.email_titulo} 
                  onChange={e => setFormData({ ...formData, email_titulo: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Link do E-mail</Label>
                <Input 
                  placeholder="https://..." 
                  value={formData.email_link} 
                  onChange={e => setFormData({ ...formData, email_link: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Fornecedor (Nome)</Label>
                <Input 
                  placeholder="Ex: Comercial Hidráulica LTDA" 
                  value={formData.fornecedor_nome} 
                  onChange={e => setFormData({ ...formData, fornecedor_nome: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Fornecedor CNPJ</Label>
                <Input 
                  placeholder="00.000.000/0001-00" 
                  value={formData.fornecedor_cnpj} 
                  onChange={e => setFormData({ ...formData, fornecedor_cnpj: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Valor Pago (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  value={formData.valor_pago} 
                  onChange={e => setFormData({ ...formData, valor_pago: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Data de Pagamento</Label>
                <Input 
                  type="date" 
                  value={formData.data_pagamento} 
                  onChange={e => setFormData({ ...formData, data_pagamento: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Centro de Custo (1 a 31)</Label>
                <select 
                  value={formData.centro_custo} 
                  onChange={e => setFormData({ ...formData, centro_custo: e.target.value })}
                  className="w-full bg-[#070b15]/50 border border-white/10 rounded-xl h-10 px-3 text-white text-sm"
                >
                  <option value="" className="bg-[#0e1629] text-white">Nenhum</option>
                  {CENTROS_CUSTO.map(cc => (
                    <option key={cc} value={cc.toString()} className="bg-[#0e1629] text-white">Centro de Custo {cc}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-white/60">Tipo de Material</Label>
                <Input 
                  placeholder="Ex: Areia, Tubos PVC..." 
                  value={formData.tipo_material} 
                  onChange={e => setFormData({ ...formData, tipo_material: e.target.value })}
                  className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-white/60">Dados do Fornecedor (Endereço, Contato)</Label>
              <Textarea 
                placeholder="Telefone, e-mail, agência/conta do fornecedor..." 
                value={formData.fornecedor_dados} 
                onChange={e => setFormData({ ...formData, fornecedor_dados: e.target.value })}
                className="bg-[#070b15]/50 border-white/10 text-white rounded-xl min-h-[60px]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-white/60">Observações Gerais</Label>
              <Textarea 
                placeholder="Informações adicionais relevantes..." 
                value={formData.obs} 
                onChange={e => setFormData({ ...formData, obs: e.target.value })}
                className="bg-[#070b15]/50 border-white/10 text-white rounded-xl min-h-[60px]"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)} className="text-white hover:bg-white/5 rounded-xl h-10">Cancelar</Button>
              <Button type="submit" disabled={updateCompraMutation.isPending} className="bg-primary hover:bg-primary/95 text-white font-bold h-10 px-6 rounded-xl">
                {updateCompraMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MANAGE NFs DIALOG */}
      <Dialog open={isNfOpen} onOpenChange={setIsNfOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0e1629] border-white/10 text-white">
          <DialogHeader className="flex flex-row justify-between items-center pr-6">
            <div>
              <DialogTitle className="font-bold text-white">Notas Fiscais Associadas</DialogTitle>
              <p className="text-xs text-white/50 mt-1">Lançamento de {selectedCompra?.fornecedor_nome || 'Sem Fornecedor'} ({formattedCurrency(selectedCompra?.valor_pago)})</p>
            </div>
            {!isNfFormOpen && (
              <Button onClick={handleOpenAddNf} className="bg-primary hover:bg-primary/95 text-white font-bold h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Adicionar Nota Fiscal
              </Button>
            )}
          </DialogHeader>

          {isNfFormOpen ? (
            /* ADD/EDIT NF SUB-FORM */
            <form onSubmit={handleNfSubmit} className="space-y-4 border border-white/5 p-4 rounded-2xl bg-[#070b15]/30">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{selectedNf ? 'Editar Nota Fiscal' : 'Cadastrar Nota Fiscal'}</h3>
              
              {/* PDF Import dropzone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-primary/20 hover:border-primary/50 rounded-xl bg-[#070b15]/50 hover:bg-[#070b15]/80 transition-colors cursor-pointer text-center"
              >
                {parsingPdf ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                    <p className="text-xs font-semibold text-white">Lendo PDF da NF...</p>
                  </>
                ) : (
                  <>
                    <FileUp className="h-6 w-6 text-primary mb-2" />
                    <p className="text-xs font-semibold text-white">Importar Informações do PDF da NF</p>
                    <p className="text-[10px] text-white/40 mt-1">Lê os textos do PDF para preencher os campos abaixo. O arquivo NÃO é salvo na base.</p>
                  </>
                )}
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  onChange={handleNfPdfImport} 
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-white/60">Valor da NF (R$)*</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00"
                    required
                    value={nfFormData.valor_nf} 
                    onChange={e => {
                      const v = e.target.value;
                      setNfFormData({ 
                        ...nfFormData, 
                        valor_nf: v,
                        livro_valor_contabil: nfFormData.livro_valor_contabil === '' || nfFormData.livro_valor_contabil === nfFormData.valor_nf ? v : nfFormData.livro_valor_contabil,
                        livro_base_calculo: nfFormData.livro_base_calculo === '' || nfFormData.livro_base_calculo === nfFormData.valor_nf ? v : nfFormData.livro_base_calculo
                      });
                    }}
                    className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-white/60">Link/Arquivo da NF</Label>
                  <Input 
                    placeholder="https://..." 
                    value={nfFormData.link_nf} 
                    onChange={e => setNfFormData({ ...nfFormData, link_nf: e.target.value })}
                    className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-10"
                  />
                </div>

                <div className="space-y-1 col-span-1 sm:col-span-2 md:col-span-1">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest border-b border-white/5 pb-1 mb-2">Campos Livro de Entradas</h4>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-white/55">Data de Entrada</Label>
                  <Input type="date" value={nfFormData.livro_data_entrada} onChange={e => setNfFormData({ ...nfFormData, livro_data_entrada: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs" />
                </div>
                
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Espécie</Label>
                  <Input placeholder="NF" value={nfFormData.livro_especie} onChange={e => setNfFormData({ ...nfFormData, livro_especie: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Número NF</Label>
                  <Input placeholder="Ex: 12456" value={nfFormData.livro_numero} onChange={e => setNfFormData({ ...nfFormData, livro_numero: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Série</Label>
                  <Input placeholder="1" value={nfFormData.livro_serie} onChange={e => setNfFormData({ ...nfFormData, livro_serie: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Data Emissão Doc</Label>
                  <Input type="date" value={nfFormData.livro_data_doc} onChange={e => setNfFormData({ ...nfFormData, livro_data_doc: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs" />
                </div>

                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-white/55">CNPJ Emitente</Label>
                  <Input placeholder="00.000.000/0001-00" value={nfFormData.livro_cnpj_emitente} onChange={e => setNfFormData({ ...nfFormData, livro_cnpj_emitente: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">UF Emitente</Label>
                  <Input placeholder="SC" maxLength={2} value={nfFormData.livro_uf} onChange={e => setNfFormData({ ...nfFormData, livro_uf: e.target.value.toUpperCase() })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1 col-span-1.5">
                  <Label className="text-[10px] text-white/55">Val. Contábil (R$)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={nfFormData.livro_valor_contabil} onChange={e => setNfFormData({ ...nfFormData, livro_valor_contabil: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">CFOP</Label>
                  <Input placeholder="1556" value={nfFormData.livro_cfop} onChange={e => setNfFormData({ ...nfFormData, livro_cfop: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">ICMS/ISS (R$)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={nfFormData.livro_icms_iss} onChange={e => setNfFormData({ ...nfFormData, livro_icms_iss: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Cod. Fiscal (a)</Label>
                  <select value={nfFormData.livro_cod_fiscal} onChange={e => setNfFormData({ ...nfFormData, livro_cod_fiscal: e.target.value })} className="bg-[#070b15]/50 border border-white/10 text-white text-xs rounded-xl h-9 w-full px-2">
                    <option value="1">1 (Com Crédito)</option>
                    <option value="2">2 (Isenta)</option>
                    <option value="3">3 (Outras/Sem Cred)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Base Cálculo (R$)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={nfFormData.livro_base_calculo} onChange={e => setNfFormData({ ...nfFormData, livro_base_calculo: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/55">Alíquota (%)</Label>
                  <Input type="number" step="0.01" placeholder="12.00" value={nfFormData.livro_aliquota} onChange={e => setNfFormData({ ...nfFormData, livro_aliquota: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>

                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-white/55">Imp. Creditado (R$)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={nfFormData.livro_imp_creditado} onChange={e => setNfFormData({ ...nfFormData, livro_imp_creditado: e.target.value })} className="bg-[#070b15]/50 border-white/10 text-white rounded-xl h-9 text-xs font-mono" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" onClick={() => setIsNfFormOpen(false)} className="text-white hover:bg-white/5 h-9 rounded-lg">Voltar</Button>
                <Button type="submit" disabled={saveNfMutation.isPending} className="bg-primary hover:bg-primary/95 text-white font-bold h-9 px-4 rounded-lg">
                  {saveNfMutation.isPending ? 'Salvando...' : 'Confirmar NF'}
                </Button>
              </div>
            </form>
          ) : (
            /* NF LIST */
            <div className="space-y-4">
              <div className="bg-[#0e1629]/40 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
                <Table>
                  <TableHeader className="bg-[#090e1b] border-b border-white/5">
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="text-white/60 text-xs font-bold py-2.5">Número</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5">Série</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5">CNPJ Emitente</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5">UF</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5 text-right">Valor da NF</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5 text-center">Data Doc</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5 text-center">Arquivo</TableHead>
                      <TableHead className="text-white/60 text-xs font-bold py-2.5 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedCompra?.compras_nfs || selectedCompra.compras_nfs.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="text-center py-8 text-white/30 text-xs font-medium">Nenhuma nota fiscal vinculada a este lançamento.</TableCell>
                      </TableRow>
                    ) : (
                      selectedCompra.compras_nfs.map((nf: any) => (
                        <TableRow key={nf.id} className="border-b border-white/5 hover:bg-white/5 text-white/90">
                          <TableCell className="py-2.5 font-mono text-xs font-semibold">{nf.livro_numero || '-'}</TableCell>
                          <TableCell className="py-2.5 font-mono text-xs">{nf.livro_serie || '-'}</TableCell>
                          <TableCell className="py-2.5 font-mono text-xs">{nf.livro_cnpj_emitente || '-'}</TableCell>
                          <TableCell className="py-2.5 font-mono text-xs text-center">{nf.livro_uf || '-'}</TableCell>
                          <TableCell className="py-2.5 text-right font-semibold font-mono text-xs">{formattedCurrency(nf.valor_nf)}</TableCell>
                          <TableCell className="py-2.5 text-center font-mono text-xs">{formattedDate(nf.livro_data_doc)}</TableCell>
                          <TableCell className="py-2.5 text-center">
                            {nf.link_nf ? (
                              <a href={nf.link_nf} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                                <Link className="h-3 w-3" /> Ver NF
                              </a>
                            ) : (
                              <span className="text-white/20">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button onClick={() => handleOpenEditNf(nf)} variant="ghost" className="h-7 w-7 p-0 rounded hover:bg-white/5 text-white/50 hover:text-white">
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button 
                                onClick={() => {
                                  if (confirm('Deseja realmente remover esta nota fiscal?')) {
                                    deleteNfMutation.mutate(nf.id);
                                  }
                                }} 
                                variant="ghost" 
                                className="h-7 w-7 p-0 rounded hover:bg-red-500/10 text-red-400/60 hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Aggregated value mismatch notification */}
              {selectedCompra && (
                <div className="flex justify-between items-center bg-[#070b15]/40 p-4 rounded-2xl border border-white/5 font-mono text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-white/40">Total Pago: <span className="text-white font-semibold">{formattedCurrency(selectedCompra.valor_pago)}</span></p>
                    <p className="text-xs text-white/40">Soma das NFs: <span className="text-blue-400 font-semibold">{formattedCurrency(
                      (selectedCompra.compras_nfs || []).reduce((acc: number, x: any) => acc + (x.valor_nf || 0), 0)
                    )}</span></p>
                  </div>
                  <div>
                    {selectedCompra.valor_pago === null ? null : (
                      (() => {
                        const sum = (selectedCompra.compras_nfs || []).reduce((acc: number, x: any) => acc + (x.valor_nf || 0), 0);
                        const diff = selectedCompra.valor_pago - sum;
                        if (diff === 0) return <Badge className="bg-green-500/15 text-green-400 border-none font-bold">100% Conciliado</Badge>;
                        if (diff > 0) return <Badge className="bg-red-500/15 text-red-400 border-none font-bold">Falta NF de: {formattedCurrency(diff)}</Badge>;
                        return <Badge className="bg-blue-500/15 text-blue-400 border-none font-bold">NF Excede Pago em: {formattedCurrency(Math.abs(diff))}</Badge>;
                      })()
                    )}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => setIsNfOpen(false)} className="bg-[#11192e] hover:bg-[#1a253d] text-white px-5 h-10 rounded-xl">Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* GERAR LIVRO FISCAL DIALOG INTEGRATION */}
      <GerarLivroFiscalDialog 
        open={isLivroOpen} 
        onOpenChange={setIsLivroOpen} 
        initialRows={currentFiscalRows}
      />
    </div>
  );
}
