import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  DollarSign, TrendingUp, TrendingDown, BarChart3, PieChart as PieIcon, 
  Calendar, Filter, Search, Download, Share2, Copy, Check, ExternalLink,
  Building2, AlertTriangle, FileText, CheckCircle2, ShieldAlert, Sparkles,
  ArrowUpRight, RefreshCw, Eye, Percent, Layers
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, 
  Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Area, AreaChart
} from 'recharts';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBuddyLogo } from '@/lib/pdf';

// ─── Centros de Custo ───────────────────────────────────────────────────
export const CENTROS_CUSTO = [
  { value: 1,  label: '1. SERVIÇOS PRELIMINARES' },
  { value: 2,  label: '2. MOVIMENTO DE TERRA' },
  { value: 3,  label: '3. SERVIÇOS AUXILIARES' },
  { value: 4,  label: '4. FUNDAÇÕES E ESTRUTURAS' },
  { value: 5,  label: '5. PAREDES E PAINÉIS' },
  { value: 6,  label: '6. MURO EXTERNO DE ESTACAS DE SABIÁ' },
  { value: 7,  label: '7. PISOS' },
  { value: 8,  label: '8. FORROS' },
  { value: 9,  label: '9. REVESTIMENTOS' },
  { value: 10, label: '10. IMPERMEABILIZAÇÃO' },
  { value: 11, label: '11. COBERTURA' },
  { value: 12, label: '12. ESQUADRIAS E FECHAMENTOS' },
  { value: 13, label: '13. VIDROS' },
  { value: 14, label: '14. INSTALAÇÕES HIDROSSANITÁRIAS' },
  { value: 15, label: '15. INSTALAÇÕES ELÉTRICAS' },
  { value: 16, label: '16. INSTALAÇÕES DE LÓGICA' },
  { value: 17, label: '17. INSTALAÇÕES DE GÁS' },
  { value: 18, label: '18. INSTALAÇÕES AVAC' },
  { value: 19, label: '19. INSTALAÇÕES MECÂNICAS' },
  { value: 20, label: '20. ILUMINAÇÃO' },
  { value: 21, label: '21. BANCADAS E ARMÁRIOS DE ALVENARIA' },
  { value: 22, label: '22. LOUÇAS E METAIS' },
  { value: 23, label: '23. AMBIENTES ESPECIAIS' },
  { value: 24, label: '24. PISCINAS' },
  { value: 25, label: '25. FERRAMENTAS E EQUIPAMENTOS' },
  { value: 26, label: '26. INSUMOS DE FERRAMENTAS GERAIS' },
  { value: 27, label: "27. EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAIS EPI's" },
  { value: 28, label: '28. FINALIZAÇÃO E LIMPEZA FINAL DE OBRA' },
  { value: 29, label: '29. GESTÃO ADMINISTRATIVA DE OBRA' },
  { value: 30, label: '30. IMPOSTOS SOBRE MÃO DE OBRA' },
  { value: 31, label: '31. NÃO PREVISTO EM ORÇAMENTO' }
];

export const DEFAULT_BUDGETS: Record<number, number> = {
  1: 458330.59,
  2: 242000.00,
  3: 644040.00,
  4: 9149579.05,
  5: 2751307.64,
  6: 432475.44,
  7: 2867605.31,
  8: 1243121.39,
  9: 5986818.12,
  10: 1645004.24,
  11: 3376417.98,
  12: 3717666.66,
  13: 146037.60,
  14: 1946083.40,
  15: 2118817.90,
  16: 999102.17,
  17: 42958.73,
  18: 1355556.26,
  19: 198000.00,
  20: 228947.18,
  21: 339821.86,
  22: 881365.72,
  23: 268893.76,
  24: 3864176.79,
  25: 412579.52,
  26: 154000.00,
  27: 128500.00,
  28: 185000.00,
  29: 890000.00,
  30: 450000.00,
  31: 0.00
};

const ccLabel = (n?: number | null) => {
  const num = (!n || n === 0) ? 31 : n;
  return CENTROS_CUSTO.find(c => c.value === num)?.label || '31. NÃO PREVISTO EM ORÇAMENTO';
};

const formatCurrency = (val?: number | null) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

const cleanObs = (obs?: string | null) => {
  if (!obs) return '';
  return obs
    .replace(/\[RATEIO:[\s\S]*?\]/g, '')
    .replace(/\[FERRAMENTA\]/g, '')
    .trim();
};

export function parseRateio(obs: string | null) {
  if (!obs) return [];
  const match = obs.match(/\[RATEIO:\s*(\{[\s\S]*?\})\]/);
  if (match) {
    try {
      const obj = JSON.parse(match[1]);
      return Object.entries(obj).map(([k, v]) => ({
        ccId: Number(k),
        pct: Number(v)
      }));
    } catch (e) {
      // ignore
    }
  }
  return [];
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];

export default function RelatorioCliente() {
  const [searchParams] = useSearchParams();
  const params = useParams<{ obraId?: string }>();
  const navigate = useNavigate();

  const obraId = params.obraId || searchParams.get('obraId') || '';

  // Local state filters
  const [search, setSearch] = useState('');
  const [selectedCentroCusto, setSelectedCentroCusto] = useState<string>('all');
  const [selectedNfFilter, setSelectedNfFilter] = useState<'all' | 'ambos' | 'integral' | 'pendente' | 'diferenca'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [chartMode, setChartMode] = useState<'real' | 'orcado'>('real'); // Real (inclui CC 31) vs Orçado (apenas orçamento)
  const [copied, setCopied] = useState(false);
  const [cronogramaModalOpen, setCronogramaModalOpen] = useState(false);

  // Load budgets for this obra from localStorage or fallback
  const ccBudgets = useMemo(() => {
    if (!obraId) return DEFAULT_BUDGETS;
    const saved = localStorage.getItem(`obra_budgets_${obraId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return DEFAULT_BUDGETS;
  }, [obraId]);

  // Load monthly forecast schedule (cronograma físico-financeiro)
  const [cronogramaPrevisto, setCronogramaPrevisto] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(`cronograma_previsto_${obraId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return {
      'Jan': 150000, 'Fev': 280000, 'Mar': 450000, 'Abr': 600000, 
      'Mai': 750000, 'Jun': 900000, 'Jul': 850000, 'Ago': 700000, 
      'Set': 500000, 'Out': 350000, 'Nov': 200000, 'Dez': 100000
    };
  });

  // Fetch Obra details
  const { data: obra, isLoading: loadingObra } = useQuery({
    queryKey: ['obra-public', obraId],
    queryFn: async () => {
      if (!obraId) return null;
      const { data, error } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!obraId
  });

  // Fetch Compras and related NFs
  const { data: compras = [], isLoading: loadingCompras, refetch } = useQuery({
    queryKey: ['compras-public', obraId],
    queryFn: async () => {
      if (!obraId) return [];
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('compras')
          .select('*, compras_nfs(*)')
          .eq('obra_id', obraId)
          .order('data_envio', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        allData = [...allData, ...(data || [])];
        hasMore = data && data.length === pageSize;
        page++;
      }
      return allData;
    },
    enabled: !!obraId
  });

  // Filtered purchases
  const filteredCompras = useMemo(() => {
    let r = [...compras];

    // Filter by NF status
    if (selectedNfFilter !== 'all') {
      r = r.filter((c: any) => {
        if (c.estornado) return false;
        const nfs = c.compras_nfs || [];
        const isPendente = nfs.length === 0;
        const totalNF = nfs.reduce((s: number, n: any) => s + Number(n.valor_nf || 0), 0);
        const hasDiferenca = nfs.length > 0 && Math.abs(totalNF - Number(c.valor_pago || 0)) > 0.01;

        if (selectedNfFilter === 'pendente') return isPendente;
        if (selectedNfFilter === 'diferenca') return hasDiferenca;
        if (selectedNfFilter === 'ambos') return isPendente || hasDiferenca;
        if (selectedNfFilter === 'integral') return nfs.length > 0 && !hasDiferenca;
        return true;
      });
    }

    // Filter by Centro de Custo
    if (selectedCentroCusto !== 'all') {
      const ccNum = Number(selectedCentroCusto);
      r = r.filter((c: any) => {
        const parsed = parseRateio(c.obs);
        if (parsed.length > 0) {
          return parsed.some(p => p.ccId === ccNum);
        }
        const ccVal = (!c.centro_custo || c.centro_custo === 0) ? 31 : c.centro_custo;
        return ccVal === ccNum;
      });
    }

    // Filter by Date Range
    if (startDate) {
      r = r.filter((c: any) => {
        const env = c.data_envio ? c.data_envio.substring(0, 10) : '';
        const pag = c.data_pagamento ? c.data_pagamento.substring(0, 10) : '';
        return (env && env >= startDate) || (pag && pag >= startDate);
      });
    }
    if (endDate) {
      r = r.filter((c: any) => {
        const env = c.data_envio ? c.data_envio.substring(0, 10) : '';
        const pag = c.data_pagamento ? c.data_pagamento.substring(0, 10) : '';
        return (env && env <= endDate) || (pag && pag <= endDate);
      });
    }

    // Filter by Search Query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      r = r.filter((c: any) => {
        const matchText = (c.email_titulo || '').toLowerCase().includes(q) ||
          (c.fornecedor_nome || '').toLowerCase().includes(q) ||
          (c.fornecedor_cnpj || '').toLowerCase().includes(q) ||
          cleanObs(c.obs).toLowerCase().includes(q);
        const matchVal = (c.valor_solicitado?.toString() || '').includes(q) ||
          (c.valor_pago?.toString() || '').includes(q);
        return matchText || matchVal;
      });
    }

    return r;
  }, [compras, selectedNfFilter, selectedCentroCusto, startDate, endDate, search]);

  // ─── Key Financial KPI Metrics ───
  const metrics = useMemo(() => {
    let totalOrcado = 0;
    let totalRealizado = 0; // CC 1..30 paid minus estornos
    let naoPrevistoOrcamento = 0; // CC 31 paid minus estornos
    let totalEstornado = 0;

    let totalSolicitado = 0;
    let totalPago = 0;

    let lancamentosNfIntegralCount = 0;
    let lancamentosNfIntegralVal = 0;

    let lancamentosNfPendenteDiferencaCount = 0;
    let lancamentosNfPendenteDiferencaVal = 0;

    let lancamentosSemNfCount = 0;
    let lancamentosSemNfVal = 0;

    const ccRealizedMap = new Map<number, number>();
    CENTROS_CUSTO.forEach(cc => ccRealizedMap.set(cc.value, 0));

    // Sum budget for CC 1..30
    CENTROS_CUSTO.forEach(cc => {
      if (cc.value !== 31) {
        totalOrcado += (ccBudgets[cc.value] ?? 0);
      }
    });

    compras.forEach((c: any) => {
      const est = Number(c.valor_estornado || 0);
      totalEstornado += est;

      if (c.estornado) return;

      const pago = Number(c.valor_pago || 0);
      const sol = Number(c.valor_solicitado || 0);

      totalSolicitado += sol;
      totalPago += pago;

      const parsed = parseRateio(c.obs);
      if (parsed.length > 0) {
        parsed.forEach(split => {
          const splitVal = pago * (split.pct / 100);
          ccRealizedMap.set(split.ccId, (ccRealizedMap.get(split.ccId) || 0) + splitVal);
        });
      } else {
        const ccVal = (!c.centro_custo || c.centro_custo === 0) ? 31 : c.centro_custo;
        ccRealizedMap.set(ccVal, (ccRealizedMap.get(ccVal) || 0) + pago);
      }

      // NF Stats
      const nfs = c.compras_nfs || [];
      const totalNF = nfs.reduce((sum: number, n: any) => sum + Number(n.valor_nf || 0), 0);
      const isSemNf = nfs.length === 0;
      const hasDiff = nfs.length > 0 && Math.abs(totalNF - pago) > 0.01;

      if (isSemNf) {
        lancamentosSemNfCount++;
        lancamentosSemNfVal += pago;
        lancamentosNfPendenteDiferencaCount++;
        lancamentosNfPendenteDiferencaVal += pago;
      } else if (hasDiff) {
        lancamentosNfPendenteDiferencaCount++;
        lancamentosNfPendenteDiferencaVal += pago;
      } else {
        lancamentosNfIntegralCount++;
        lancamentosNfIntegralVal += pago;
      }
    });

    // Compute realized CC 1..30 vs CC 31
    CENTROS_CUSTO.forEach(cc => {
      const real = ccRealizedMap.get(cc.value) || 0;
      if (cc.value === 31) {
        naoPrevistoOrcamento += real;
      } else {
        totalRealizado += real;
      }
    });

    const totalSaldo = totalOrcado - totalRealizado;
    const totalRealGasto = totalRealizado + naoPrevistoOrcamento; // Líquido sem estornos
    const totalLiquido = totalPago - totalEstornado;

    return {
      totalOrcado,
      totalRealizado,
      totalSaldo,
      naoPrevistoOrcamento,
      totalRealGasto,
      totalEstornado,
      totalSolicitado,
      totalPago,
      totalLiquido,
      totalLancamentos: compras.filter((c: any) => !c.estornado).length,
      lancamentosNfIntegralCount,
      lancamentosNfIntegralVal,
      lancamentosNfPendenteDiferencaCount,
      lancamentosNfPendenteDiferencaVal,
      lancamentosSemNfCount,
      lancamentosSemNfVal,
      ccRealizedMap
    };
  }, [compras, ccBudgets]);

  // ─── Top 7 Cost Centers (Orçado vs Realizado) ───
  const top7ChartData = useMemo(() => {
    const list = CENTROS_CUSTO
      .filter(cc => chartMode === 'real' ? true : cc.value !== 31)
      .map(cc => {
        const budget = ccBudgets[cc.value] ?? 0;
        const spent = metrics.ccRealizedMap.get(cc.value) || 0;
        return {
          name: cc.label.replace(/^\d+\.\s*/, ''),
          code: cc.value,
          orcado: budget,
          realizado: spent
        };
      });

    list.sort((a, b) => b.realizado - a.realizado);
    return list.slice(0, 7);
  }, [ccBudgets, metrics.ccRealizedMap, chartMode]);

  // ─── Distribution by Expense Type (Tipos de Solicitação) ───
  const tipoDistributionData = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    compras.forEach((c: any) => {
      if (c.estornado) return;
      const tipo = c.tipo_solicitacao || 'Outros';
      const cur = map.get(tipo) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(c.valor_pago || 0);
      map.set(tipo, cur);
    });

    return Array.from(map.entries()).map(([name, val]) => ({
      name,
      count: val.count,
      value: val.total
    }));
  }, [compras]);

  // ─── Monthly Evolution Chart (Gasto Líquido vs Cronograma Previsto) ───
  const monthlyEvolutionData = useMemo(() => {
    const monthsMap = new Map<string, number>();
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    monthNames.forEach(m => monthsMap.set(m, 0));

    compras.forEach((c: any) => {
      if (c.estornado) return;
      const dateStr = c.data_pagamento || c.data_envio;
      if (!dateStr) return;
      const dt = new Date(dateStr);
      if (isNaN(dt.getTime())) return;

      const ccVal = (!c.centro_custo || c.centro_custo === 0) ? 31 : c.centro_custo;
      if (chartMode === 'orcado' && ccVal === 31) return; // Exclude CC 31 in Orcado mode

      const monthName = monthNames[dt.getMonth()];
      const pago = Number(c.valor_pago || 0) - Number(c.valor_estornado || 0);
      monthsMap.set(monthName, (monthsMap.get(monthName) || 0) + Math.max(0, pago));
    });

    return monthNames.map(m => ({
      mes: m,
      gastoReal: monthsMap.get(m) || 0,
      previstoCronograma: cronogramaPrevisto[m] || 0
    }));
  }, [compras, chartMode, cronogramaPrevisto]);

  // Copy Link Handler
  const handleCopyLink = () => {
    const link = `${window.location.origin}/relatorio-cliente?obraId=${obraId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link do Cliente copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  };

  // Export PDF Handler
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('portrait', 'pt', 'a4');
      const logo = getBuddyLogo();
      if (logo) {
        doc.addImage(logo, 'PNG', 40, 30, 100, 30);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(14, 22, 41);
      doc.text('RELATÓRIO DE LANÇAMENTOS DO CLIENTE', 150, 50);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Setor de Compras - Buddy Boutique Construtora', 150, 65);
      doc.text(`Obra: ${obra?.nome || 'Empreendimento'} | Data: ${new Date().toLocaleDateString('pt-BR')}`, 150, 78);

      // KPI Table Summary
      autoTable(doc, {
        startY: 95,
        head: [['Orçamento Total', 'Total Realizado', 'Saldo Geral', 'Não Previsto (CC 31)', 'Total Real Gasto']],
        body: [[
          formatCurrency(metrics.totalOrcado),
          formatCurrency(metrics.totalRealizado),
          formatCurrency(metrics.totalSaldo),
          formatCurrency(metrics.naoPrevistoOrcamento),
          formatCurrency(metrics.totalRealGasto)
        ]],
        theme: 'grid',
        headStyles: { fillColor: [14, 22, 41], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 5 }
      });

      // Cost Center Breakdown
      const ccRows = CENTROS_CUSTO.map(cc => {
        const budget = ccBudgets[cc.value] ?? 0;
        const spent = metrics.ccRealizedMap.get(cc.value) || 0;
        const saldo = budget - spent;
        return [
          cc.label,
          formatCurrency(budget),
          formatCurrency(spent),
          formatCurrency(saldo)
        ];
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Centro de Custo', 'Orçado (R$)', 'Realizado (R$)', 'Saldo (R$)']],
        body: ccRows,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 4 }
      });

      doc.save(`relatorio_cliente_${obra?.nome || 'obra'}.pdf`);
      toast.success('Relatório em PDF gerado com sucesso!');
    } catch (e: any) {
      toast.error(`Erro ao gerar PDF: ${e.message}`);
    }
  };

  if (loadingObra || loadingCompras) {
    return (
      <div className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <RefreshCw className="h-10 w-10 text-amber-500 animate-spin" />
        <p className="text-sm font-semibold tracking-widest uppercase text-slate-400">Carregando Relatório do Cliente...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans pb-16">
      {/* ════════════════ HEADER BAR ════════════════ */}
      <header className="sticky top-0 z-50 bg-[#0c1322]/90 backdrop-blur-md border-b border-white/10 shadow-2xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <Building2 className="h-6 w-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white">
                  RELATÓRIO DE LANÇAMENTOS
                </h1>
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                  Visualização do Cliente
                </Badge>
              </div>
              <p className="text-xs text-amber-400/90 font-bold uppercase tracking-widest mt-0.5">
                Setor de Compras • Buddy Boutique Construtora
              </p>
              {obra && (
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Obra: <span className="text-white font-semibold">{obra.nome}</span> {obra.endereco ? `• ${obra.endereco}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleCopyLink}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-9 px-4 rounded-xl gap-2 shadow-md transition-all active:scale-95"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Link Copiado!' : 'Copiar Link de Acesso'}
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              className="bg-white/5 hover:bg-white/10 text-white border-white/15 text-xs h-9 px-4 rounded-xl gap-2 transition-all"
            >
              <Download className="h-4 w-4 text-amber-400" />
              Exportar PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">

        {/* ════════════════ HEADER SUMMARY CARDS (KPIS) ════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Orçamento Total */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-24 w-24 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Orçamento Total</span>
                <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-black text-white tabular-nums tracking-tight">
                {formatCurrency(metrics.totalOrcado)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Previsão total aprovada (CC 1 ao 30)</p>
            </CardContent>
          </Card>

          {/* Card 2: Total Realizado */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Realizado</span>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-black text-emerald-400 tabular-nums tracking-tight">
                {formatCurrency(metrics.totalRealizado)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Consumo orçado pago (sem CC 31)</p>
            </CardContent>
          </Card>

          {/* Card 3: Saldo Geral */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-24 w-24 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Saldo Geral</span>
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <p className={`text-2xl sm:text-3xl font-display font-black tabular-nums tracking-tight ${
                metrics.totalSaldo < 0 ? 'text-red-400' : 'text-purple-400'
              }`}>
                {formatCurrency(metrics.totalSaldo)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Orçamento remanescente para conclusão</p>
            </CardContent>
          </Card>

          {/* Card 4: Não Previsto em Orçamento (CC 31) */}
          <Card className="bg-[#0f172a] border border-amber-500/30 shadow-xl rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Não Previsto (CC 31)</span>
                <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-black text-amber-400 tabular-nums tracking-tight">
                {formatCurrency(metrics.naoPrevistoOrcamento)}
              </p>
              <p className="text-[10px] text-amber-400/80 font-medium mt-1">Gasto extraordinário fora do escopo</p>
            </CardContent>
          </Card>

          {/* Card 5: Total Real Gasto */}
          <Card className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] border border-cyan-500/30 shadow-xl rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-24 w-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">Total Real Gasto</span>
                <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-black text-cyan-400 tabular-nums tracking-tight">
                {formatCurrency(metrics.totalRealGasto)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Realizado + Não Previstos (Descontados Estornos)</p>
            </CardContent>
          </Card>
        </div>

        {/* Highlight Banner: Total Estornado (Explicação Clara) */}
        <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Total Estornado de Lançamentos</p>
              <p className="text-xs text-slate-300">
                Valores estornados são devolvidos à obra e **não são contabilizados no total real gasto nem no total realizado**.
              </p>
            </div>
          </div>
          <div className="text-right shrink-0 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
            <span className="text-xs text-emerald-400/80 font-semibold block uppercase text-left sm:text-right">Valor Total Devolvido</span>
            <span className="text-xl font-display font-black text-emerald-400 tabular-nums">
              {formatCurrency(metrics.totalEstornado)}
            </span>
          </div>
        </div>

        {/* ════════════════ CHARTS & VISUAL ANALYTICS ════════════════ */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-amber-400" />
              Análise de Desempenho e Cronograma
            </h2>
            <p className="text-xs text-slate-400">Visualização gráfica do orçamento vs consumo mensal</p>
          </div>

          <div className="flex items-center gap-2 bg-[#0f172a] p-1 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 px-2 font-semibold">Modo dos Gráficos:</span>
            <Button
              size="sm"
              variant={chartMode === 'real' ? 'default' : 'ghost'}
              onClick={() => setChartMode('real')}
              className={`h-7 text-xs font-bold rounded-lg ${
                chartMode === 'real' ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'text-slate-400 hover:text-white'
              }`}
            >
              Real (Com CC 31)
            </Button>
            <Button
              size="sm"
              variant={chartMode === 'orcado' ? 'default' : 'ghost'}
              onClick={() => setChartMode('orcado')}
              className={`h-7 text-xs font-bold rounded-lg ${
                chartMode === 'orcado' ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'text-slate-400 hover:text-white'
              }`}
            >
              Orçado (Sem CC 31)
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Chart 1: Top 7 Centros Consumidos (Orçado vs Realizado) */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Top 7 Centros de Custo Mais Consumidos
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Comparativo Orçado vs Realizado por Centro</p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top7ChartData} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={10} tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} width={130} tickFormatter={(val) => val.length > 18 ? `${val.substring(0, 18)}...` : val} />
                    <Tooltip 
                      formatter={(value: any) => [formatCurrency(Number(value)), '']}
                      contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="orcado" name="Orçado" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={10} />
                    <Bar dataKey="realizado" name="Realizado" fill="#10b981" radius={[0, 4, 4, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Chart 2: Evolução de Gasto Mensal vs Cronograma Físico-Financeiro */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Evolução Mensal (Gasto Real vs Cronograma)
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Gasto Líquido Real por mês vs Previsão Físico-Financeira</p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCronogramaModalOpen(true)}
                className="h-7 text-[11px] bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
              >
                Ajustar Cronograma
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyEvolutionData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorGasto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPrevisto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="mes" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: any) => [formatCurrency(Number(value)), '']}
                      contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Area type="monotone" dataKey="gastoReal" name="Gasto Líquido Real" stroke="#10b981" fillOpacity={1} fill="url(#colorGasto)" strokeWidth={2} />
                    <Area type="monotone" dataKey="previstoCronograma" name="Cronograma Previsto" stroke="#f59e0b" strokeDasharray="4 4" fillOpacity={1} fill="url(#colorPrevisto)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ════════════════ DISTRIBUTION BY TYPE & EXPENSE SUMMARIES ════════════════ */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Pie Chart: Distribuição por Tipo de Despesa */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-purple-400" />
                Distribuição por Tipo de Despesa
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tipoDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {tipoDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [formatCurrency(Number(value)), 'Total']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {tipoDistributionData.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                      {item.name} ({item.count})
                    </span>
                    <span className="font-bold text-white tabular-nums">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Table: Full Budget Breakdown by Cost Center */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-xl rounded-2xl lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-400" />
                Orçamento Detalhado por Centro de Custo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2">
                {CENTROS_CUSTO.map(cc => {
                  const budget = ccBudgets[cc.value] ?? 0;
                  const spent = metrics.ccRealizedMap.get(cc.value) || 0;
                  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : (spent > 0 ? 100 : 0);
                  const isOver = spent > budget && budget > 0;

                  return (
                    <div key={cc.value} className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80 flex flex-col gap-1.5 hover:border-slate-700 transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200 truncate">{cc.label}</span>
                        <Badge className={`text-[10px] font-mono font-bold ${
                          cc.value === 31 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : isOver ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {cc.value === 31 ? 'NÃO PREVISTO' : `${pct}% Consumido`}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 text-[11px] gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Orçado:</span>
                          <span className="font-bold text-slate-300">{cc.value === 31 ? 'R$ 0,00' : formatCurrency(budget)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Realizado:</span>
                          <span className="font-bold text-emerald-400">{formatCurrency(spent)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Saldo:</span>
                          <span className={`font-bold ${budget - spent < 0 ? 'text-red-400' : 'text-purple-300'}`}>
                            {cc.value === 31 ? formatCurrency(-spent) : formatCurrency(budget - spent)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ════════════════ RESUMO FINANCEIRO DE NOTAS FISCAIS ════════════════ */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div>
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-400" />
              Resumo Financeiro e Conformidade de Notas Fiscais
            </h2>
            <p className="text-xs text-slate-400">Totalizadores de pagamentos, estornos e regularidade fiscal de NFs</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* Total Solicitado */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Solicitado</span>
              <span className="text-lg font-display font-black text-white tabular-nums mt-1">{formatCurrency(metrics.totalSolicitado)}</span>
            </div>

            {/* Total Pago */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Pago</span>
              <span className="text-lg font-display font-black text-emerald-400 tabular-nums mt-1">{formatCurrency(metrics.totalPago)}</span>
            </div>

            {/* Total Líquido */}
            <div className="bg-[#0f172a] border border-emerald-500/30 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Total Líquido</span>
              <span className="text-lg font-display font-black text-emerald-400 tabular-nums mt-1">{formatCurrency(metrics.totalLiquido)}</span>
            </div>

            {/* Total Lançamentos */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Lançamentos</span>
              <span className="text-lg font-display font-black text-purple-400 tabular-nums mt-1">{metrics.totalLancamentos}</span>
            </div>

            {/* NF Integral */}
            <div className="bg-[#0f172a] border border-emerald-500/20 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">NF Integral</span>
              <div>
                <span className="text-lg font-display font-black text-emerald-400 tabular-nums">{formatCurrency(metrics.lancamentosNfIntegralVal)}</span>
                <span className="text-[10px] text-slate-400 block font-medium">{metrics.lancamentosNfIntegralCount} lançamentos</span>
              </div>
            </div>

            {/* NF Pendente/Diferença */}
            <div className="bg-[#0f172a] border border-amber-500/20 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Pendente / Dif. NF</span>
              <div>
                <span className="text-lg font-display font-black text-amber-400 tabular-nums">{formatCurrency(metrics.lancamentosNfPendenteDiferencaVal)}</span>
                <span className="text-[10px] text-slate-400 block font-medium">{metrics.lancamentosNfPendenteDiferencaCount} lançamentos</span>
              </div>
            </div>

            {/* Sem NF */}
            <div className="bg-[#0f172a] border border-red-500/20 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Valor Sem NF</span>
              <div>
                <span className="text-lg font-display font-black text-red-400 tabular-nums">{formatCurrency(metrics.lancamentosSemNfVal)}</span>
                <span className="text-[10px] text-slate-400 block font-medium">{metrics.lancamentosSemNfCount} lançamentos</span>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════ LISTAGEM DE LANÇAMENTOS DE COMPRAS ════════════════ */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-400" />
                RELATÓRIO DE LANÇAMENTOS
              </h2>
              <p className="text-xs text-slate-400">Listagem de conferência completa dos lançamentos do setor de compras</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-[#0f172a] border border-slate-800 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shadow-xl">
            {/* Search Input */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Pesquisar título, fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-white text-xs h-10 rounded-xl focus:border-amber-500"
              />
            </div>

            {/* Centro de Custo Filter */}
            <Select value={selectedCentroCusto} onValueChange={setSelectedCentroCusto}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white text-xs h-10 rounded-xl">
                <SelectValue placeholder="Filtrar Centro de Custo" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                <SelectItem value="all">Todos os Centros de Custo</SelectItem>
                {CENTROS_CUSTO.map(cc => (
                  <SelectItem key={cc.value} value={String(cc.value)}>{cc.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* NF Filter */}
            <Select value={selectedNfFilter} onValueChange={(val: any) => setSelectedNfFilter(val)}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white text-xs h-10 rounded-xl">
                <SelectValue placeholder="Filtrar por Nota Fiscal" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                <SelectItem value="all">Todos os Lançamentos</SelectItem>
                <SelectItem value="ambos">Pendente + Diferença de NF</SelectItem>
                <SelectItem value="integral">Integral sem diferenças</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="diferenca">Diferença de NF</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Period Filter */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-900 border-slate-700 text-white text-xs h-10 rounded-xl"
              />
              <span className="text-slate-500 text-xs">até</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-900 border-slate-700 text-white text-xs h-10 rounded-xl"
              />
            </div>
          </div>

          {/* Table Container */}
          <Card className="bg-[#0f172a] border border-slate-800 shadow-2xl rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-3.5">Data Envio</th>
                    <th className="p-3.5">Valor Solicitado</th>
                    <th className="p-3.5">E-mail / Título</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Fornecedor / CNPJ</th>
                    <th className="p-3.5">Valor Pago</th>
                    <th className="p-3.5">Data Pagamento</th>
                    <th className="p-3.5">Centro de Custo</th>
                    <th className="p-3.5">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCompras.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-slate-400">
                        Nenhum lançamento encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredCompras.map((c: any) => {
                      const isEst = c.estornado;
                      return (
                        <tr key={c.id} className={`hover:bg-slate-800/40 transition-colors ${isEst ? 'opacity-50 bg-red-950/10' : ''}`}>
                          <td className="p-3.5 font-medium text-slate-300 whitespace-nowrap">
                            {c.data_envio ? new Date(c.data_envio).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="p-3.5 font-bold text-slate-200 whitespace-nowrap">
                            {formatCurrency(c.valor_solicitado)}
                          </td>
                          <td className="p-3.5 font-semibold text-white max-w-[200px] truncate" title={c.email_titulo}>
                            {c.email_titulo || '-'}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                              {c.tipo_solicitacao || 'Materiais'}
                            </Badge>
                          </td>
                          <td className="p-3.5 max-w-[180px]">
                            <p className="font-semibold text-slate-200 truncate" title={c.fornecedor_nome}>{c.fornecedor_nome || '-'}</p>
                            {c.fornecedor_cnpj && <p className="text-[10px] font-mono text-slate-400">{c.fornecedor_cnpj}</p>}
                          </td>
                          <td className="p-3.5 font-bold text-emerald-400 whitespace-nowrap">
                            {isEst ? (
                              <span className="line-through text-red-400">{formatCurrency(c.valor_pago)}</span>
                            ) : (
                              formatCurrency(c.valor_pago)
                            )}
                          </td>
                          <td className="p-3.5 font-medium text-slate-300 whitespace-nowrap">
                            {c.data_pagamento ? new Date(c.data_pagamento).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="p-3.5 max-w-[180px]">
                            <p className="font-medium text-slate-300 truncate" title={ccLabel(c.centro_custo)}>
                              {ccLabel(c.centro_custo)}
                            </p>
                          </td>
                          <td className="p-3.5 text-slate-400 max-w-[220px] truncate" title={cleanObs(c.obs)}>
                            {cleanObs(c.obs) || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

      </main>

      {/* ════════════════ MODAL DE EDICÃO DO CRONOGRAMA ════════════════ */}
      <Dialog open={cronogramaModalOpen} onOpenChange={setCronogramaModalOpen}>
        <DialogContent className="bg-[#0f172a] border border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-400" />
              Previsão do Cronograma Físico-Financeiro
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Ajuste as metas de gastos mensais previstos para acompanhamento do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-3 max-h-[60vh] overflow-y-auto pr-1">
            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(m => (
              <div key={m} className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{m}:</label>
                <Input
                  type="number"
                  value={cronogramaPrevisto[m] || 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setCronogramaPrevisto(prev => ({ ...prev, [m]: val }));
                  }}
                  className="bg-slate-900 border-slate-700 text-white text-xs h-9"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCronogramaModalOpen(false)}
              className="bg-white/5 text-white border-white/10"
            >
              Fechar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                localStorage.setItem(`cronograma_previsto_${obraId}`, JSON.stringify(cronogramaPrevisto));
                setCronogramaModalOpen(false);
                toast.success('Metas do cronograma físico-financeiro atualizadas!');
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
            >
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
