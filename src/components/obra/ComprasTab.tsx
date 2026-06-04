import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus, Search, Download, FileSpreadsheet, Mail, Edit, Trash2,
  FileUp, Loader2, BookOpen, ShoppingCart, DollarSign,
  FileText, CheckCircle2, AlertTriangle, Clock, Archive, ReceiptText, Boxes,
  Link2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import GerarLivroFiscalDialog from './GerarLivroFiscalDialog';
import ImportXmlComprasDialog from './ImportXmlComprasDialog';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ComprasTabProps { obraId: string; }

const STATUS_OPTIONS = ['NÃO INICIADO', 'EMAIL ENVIADO', 'PAGO', 'A CAMINHO', 'ENTREGUE', 'FALTA NF', 'ARQUIVADO'];
const TIPO_OPTIONS = [
  { value: 'Materiais', label: 'Material' },
  { value: 'Frete', label: 'Frete' },
  { value: 'Serviços', label: 'Serviço' },
  { value: 'Mão de obra Buddy', label: 'Mão de obra' },
  { value: 'Outros', label: 'Outros' },
];
const VINCULO_OPTIONS = [
  { value: '1nf_1pag', label: '1 NF → 1 pagamento' },
  { value: '1nf_2pag', label: '1 NF → 2 pagamentos' },
  { value: '2nf_1pag', label: '2+ NFs → 1 pagamento' },
  { value: 'parcial', label: 'NF parcial' },
  { value: 'sem_nf', label: 'Sem NF' },
];

// ── Status badge styles ───────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  'NÃO INICIADO': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  'EMAIL ENVIADO': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'PAGO':         'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'A CAMINHO':    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'ENTREGUE':     'bg-green-500/20 text-green-300 border-green-500/30',
  'FALTA NF':     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'ARQUIVADO':    'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const TIPO_BADGE: Record<string, string> = {
  'Materiais':        'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  'Frete':            'bg-purple-500/15 text-purple-300 border-purple-500/20',
  'Serviços':         'bg-blue-500/15 text-blue-300 border-blue-500/20',
  'Mão de obra Buddy':'bg-amber-500/15 text-amber-300 border-amber-500/20',
  'Outros':           'bg-zinc-500/15 text-zinc-300 border-zinc-500/20',
};

// ── Row conciliation state ────────────────────────────────────────────────────
function getConf(c: any): 'ok' | 'warn' | 'missing' | 'estornado' {
  if (c.estornado) return 'estornado';
  const nfs: any[] = c.compras_nfs || [];
  if (!nfs.length) return c.valor_pago ? 'missing' : 'warn';
  const sumNF = nfs.reduce((s: number, n: any) => s + (n.valor_nf || 0), 0);
  return Math.abs(sumNF - (c.valor_pago || 0)) < 0.01 ? 'ok' : 'warn';
}
const CONF_LEFT: Record<string, string> = {
  ok:        'border-l-emerald-500',
  warn:      'border-l-amber-400',
  missing:   'border-l-orange-500',
  estornado: 'border-l-zinc-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n?: number | null) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  try { return format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy'); } catch { return d; }
};

const mesKey = (d?: string | null) => {
  if (!d) return '';
  const m = d.match(/(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
};
const mesLabel = (k: string) => {
  if (!k) return 'Sem data';
  const [a, m] = k.split('-');
  const n = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${n[parseInt(m)] || m}/${a}`;
};

const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const parseBRL = (s: string) =>
  parseFloat((s || '').replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0;
const pad2 = (n: number) => String(n).padStart(2, '0');

// ── Email parser ──────────────────────────────────────────────────────────────
function parseEmail(txt: string) {
  txt = txt.replace(/\u00a0/g, ' ');
  const linhas = txt.split(/\r?\n/);
  let titulo = (linhas.find(l => /^APROVAÇÃO|^PAGAMENTO|^SOLICITAÇÃO/i.test(l.trim())) || '').trim();
  if (!titulo) { const m = txt.match(/Gmail\s+Buddy Construtora[^\n]+\n([^\n]+)/i); titulo = m ? m[1].trim() : ''; }
  const mesesMap: Record<string, string> = { janeiro:'01',fevereiro:'02','março':'03',marco:'03',abril:'04',maio:'05',junho:'06',julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12' };
  const dataBR = (d:string,me:string,a:string) => `${pad2(parseInt(d))}/${mesesMap[normal(me)]||'01'}/${a}`;
  const dateRe = /(\d{1,2})\s+de\s+([A-Za-zÀ-ÿçãéíóú]+)\s+de\s+(\d{4})(?:\s+às\s+\d{1,2}:\d{2})?/gi;
  const datas: {idx:number;data:string}[] = [];
  let dm: RegExpExecArray|null;
  while ((dm = dateRe.exec(txt)) !== null) datas.push({idx:dm.index,data:dataBR(dm[1],dm[2],dm[3])});
  const dataAntes = (pos:number) => { let u=''; for(const d of datas){if(d.idx<=pos)u=d.data;else break;} return u; };
  const dataComprv = (pos:number, lim:number) => { const blk=txt.slice(pos,lim); const m=blk.match(/(em\s+anexo\s+comprovante|segue\s+comprovante)/i); return m ? dataAntes(pos+m.index!) : ''; };
  const campo = (t:string,l:string) => { const m=t.match(new RegExp(l+'\\s*:?\\s*([^\\n\\r]+)','i')); return m?m[1].trim():''; };
  const contaTrecho = (t:string) => { const ag=campo(t,'Ag[êe]ncia'),ct=campo(t,'Conta'),in_=campo(t,'Institui[çc][ãa]o'); return [ag&&'Ag.'+ag,ct&&'Conta '+ct,in_].filter(Boolean).join(' • '); };
  const ccM = txt.match(/Centro de custo:?\s*(?:\r?\n\s*)?(\d+)\s*[-–]\s*([^\n\r]+)/i);
  let tipo='Materiais';
  if(/frete|transportadora|ct-?e/i.test(txt)) tipo='Frete';
  else if(/m[ãa]o de obra|di[áa]ria|pedreiro/i.test(txt)) tipo='Mão de obra Buddy';
  else if(/servi[çc]o|limpeza|aluguel/i.test(txt)) tipo='Serviços';
  const reqRe = /Solicito\s+o\s+pagamento[\s\S]{0,900}?valor\s+(?:total\s+)?(?:de\s+)?R\$\s*([\d.]+(?:,\d{2})?)/gi;
  const reqs = [...txt.matchAll(reqRe)];
  const pags: any[] = [];
  reqs.forEach((m,idx) => {
    const pos=m.index!; const prox=reqs[idx+1]?reqs[idx+1].index!:txt.length;
    const bloco=txt.slice(pos,Math.min(txt.length,prox)); const nbl=normal(bloco);
    let parcela=`${idx+1}/${reqs.length||1}`;
    if(nbl.includes('50%')&&nbl.includes('inicial')) parcela='50% inicial';
    else if(nbl.includes('50%')&&nbl.includes('final')) parcela='50% final';
    const fornecedor=campo(bloco,'Nome da Empresa')||campo(bloco,'Favorecido')||'';
    const cnpj=(bloco.match(/CNPJ:\s*([\d./\\-]+)/i)||[])[1]||'';
    const valor=parseBRL(m[1]);
    const estornado=/reembolso|estorn|cnpj\s+diferente/i.test(bloco)&&idx<reqs.length-1;
    const dataEstorno=estornado?(dataAntes(pos)||''):'';
    pags.push({parcela,envio:dataAntes(pos),solicitado:valor,pago:valor,dataPgto:dataComprv(pos,prox),fornecedor,cnpj,conta:contaTrecho(bloco),estornado,dataEstorno});
  });
  if(!pags.length){const valor=parseBRL((txt.match(/R\$\s*([\d.]+,\d{2})/)||[])[1]);pags.push({parcela:'1/1',envio:dataAntes(0),solicitado:valor,pago:valor,dataPgto:'',fornecedor:'',cnpj:'',conta:'',estornado:false,dataEstorno:''});}
  if(pags.length===2&&Math.abs((+pags[0].solicitado||0)-(+pags[1].solicitado||0))<0.01&&!/inicial|final/i.test(pags[0].parcela+pags[1].parcela)){pags[0].parcela='50% inicial';pags[1].parcela='50% final';}
  const ativos=pags.filter((p:any)=>!p.estornado); const ref=ativos[0]||pags[0]||{};
  return {titulo,tipo,fornecedor:ref.fornecedor||campo(txt,'Nome da Empresa')||'',cnpj:ref.cnpj||'',conta:ref.conta||contaTrecho(txt),cc:ccM?ccM[1]:'',ccDesc:ccM?ccM[2].trim():'Não previsto em orçamento',obs:/nota fiscal/i.test(txt)?'E-mail menciona NF anexa.':'',temNF:/nota fiscal|NF/i.test(txt),pagamentos:pags};
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ComprasTab({ obraId }: ComprasTabProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ativas'|'geral'|'kanban'|'dashboard'>('ativas');
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedTipo, setSelectedTipo] = useState('all');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const [sortBy, setSortBy] = useState<'envio'|'pagamento'>('envio');

  // Kanban drag-and-drop
  const [dragId, setDragId] = useState<string|null>(null);
  const [dragOverCol, setDragOverCol] = useState<string|null>(null);

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNfOpen, setIsNfOpen] = useState(false);
  const [isLivroOpen, setIsLivroOpen] = useState(false);
  const [isColarOpen, setIsColarOpen] = useState(false);
  const [xmlOpen, setXmlOpen] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<any|null>(null);
  const [selectedNf, setSelectedNf] = useState<any|null>(null);
  const [isNfFormOpen, setIsNfFormOpen] = useState(false);
  const [parsingNfXml, setParsingNfXml] = useState(false);
  const nfXmlInputRef = useRef<HTMLInputElement>(null);
  const [parsingNfPdf, setParsingNfPdf] = useState(false);
  const nfPdfInputRef = useRef<HTMLInputElement>(null);

  // Comprados (Entrar em estoque) states
  const [isEstoqueOpen, setIsEstoqueOpen] = useState(false);
  const [estoqueForm, setEstoqueForm] = useState({
    produto_id: '',
    quantidade: '',
    valor_unitario: '',
    observacao: '',
    isNewProduct: false,
    newProductNome: '',
    newProductUnidade: 'un',
    newProductCategoria: '',
    newProductLocalizacao: '',
    newProductEstoqueMinimo: '0'
  });
  const [estoqueSearch, setEstoqueSearch] = useState('');
  const [showEstoqueProdList, setShowEstoqueProdList] = useState(false);

  const estoqueProductInputRef = useRef<HTMLInputElement>(null);
  const estoqueProductListRef = useRef<HTMLDivElement>(null);
  const [parsingEstoquePdf, setParsingEstoquePdf] = useState(false);
  const estoquePdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        estoqueProductListRef.current && !estoqueProductListRef.current.contains(e.target as Node) &&
        estoqueProductInputRef.current && !estoqueProductInputRef.current.contains(e.target as Node)
      ) {
        setShowEstoqueProdList(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const resetEstoqueForm = () => {
    setEstoqueForm({
      produto_id: '',
      quantidade: '',
      valor_unitario: '',
      observacao: '',
      isNewProduct: false,
      newProductNome: '',
      newProductUnidade: 'un',
      newProductCategoria: '',
      newProductLocalizacao: '',
      newProductEstoqueMinimo: '0'
    });
    setEstoqueSearch('');
    setShowEstoqueProdList(false);
  };

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('produtos')
        .select('id, nome, unidade, categoria')
        .eq('obra_id', obraId)
        .order('nome');
      return data || [];
    }
  });

  // Email parser
  const [emailText, setEmailText] = useState('');
  const [emailResult, setEmailResult] = useState<any|null>(null);

  // Forms
  const emptyForm = () => ({
    status: 'NÃO INICIADO', tipo_solicitacao: 'Materiais',
    email_titulo: '', email_link: '', obs: '',
    fornecedor_nome: '', fornecedor_cnpj: '', fornecedor_dados: '', conta: '',
    centro_custo: '', cc_desc: 'Não previsto em orçamento',
    qtd_parcelas: 1,
    parcelas: [{ parcela: '1/1', data_envio: '', valor_solicitado: '', valor_pago: '', data_pagamento: '', estornado: false }],
  });
  const [form, setForm] = useState(emptyForm());

  const emptyNfForm = () => ({
    vinculo: '1nf_1pag', especie: 'NF-e', valor_nf: '',
    livro_numero: '', livro_serie: '', livro_data_doc: '', livro_data_entrada: '',
    livro_cnpj_emitente: '', livro_uf: 'SC', livro_cfop: '1556', livro_imposto: 'ICMS',
    livro_cod_fiscal: '3', livro_base_calculo: '', livro_aliquota: '', livro_imp_creditado: '',
    livro_valor_contabil: '', link_nf: '',
  });
  const [nfForm, setNfForm] = useState(emptyNfForm());

  const [isLinkNfOpen, setIsLinkNfOpen] = useState(false);
  const [linkNfSearch, setLinkNfSearch] = useState('');

  // Realtime
  useEffect(() => {
    const ch1 = supabase.channel('compras-rt').on('postgres_changes',{event:'*',schema:'public',table:'compras',filter:`obra_id=eq.${obraId}`},()=>queryClient.invalidateQueries({queryKey:['compras',obraId]})).subscribe();
    const ch2 = supabase.channel('compras-nfs-rt').on('postgres_changes',{event:'*',schema:'public',table:'compras_nfs'},()=>queryClient.invalidateQueries({queryKey:['compras',obraId]})).subscribe();
    const ch3 = supabase.channel('compras-entradas-rt').on('postgres_changes',{event:'*',schema:'public',table:'entradas',filter:`obra_id=eq.${obraId}`},()=>queryClient.invalidateQueries({queryKey:['compras',obraId]})).subscribe();
    const ch4 = supabase.channel('compras-nfs-vinculos-rt').on('postgres_changes',{event:'*',schema:'public',table:'compras_nfs_vinculos'},()=>queryClient.invalidateQueries({queryKey:['compras',obraId]})).subscribe();
    return ()=>{supabase.removeChannel(ch1);supabase.removeChannel(ch2);supabase.removeChannel(ch3);supabase.removeChannel(ch4);};
  },[obraId,queryClient]);

  // Query
  const { data: compras = [], isLoading } = useQuery({
    queryKey: ['compras', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('*, compras_nfs_vinculos(compras_nfs(*, compras_nfs_vinculos(compra_id))), entradas(*, produtos(*))')
        .eq('obra_id', obraId)
        .order('created_at',{ascending:true});
      
      if (error) {
        // Fallback se a nova tabela ainda não existir no banco (migração pendente)
        const isMissingTable = error.message?.includes('compras_nfs_vinculos') || 
                               error.code === 'P0002' || 
                               error.message?.includes('does not exist');
        if (isMissingTable) {
          console.warn('Tabela compras_nfs_vinculos não encontrada. Usando query legada (fallback)...');
          const { data: legacyData, error: legacyError } = await supabase
            .from('compras')
            .select('*, compras_nfs(*), entradas(*, produtos(*))')
            .eq('obra_id', obraId)
            .order('created_at',{ascending:true});
          
          if (legacyError) {
            toast.error('Erro ao buscar compras (fallback)');
            throw legacyError;
          }
          
          return (legacyData || []).map((c: any) => ({
            ...c,
            compras_nfs: (c.compras_nfs || []).map((nf: any) => ({
              ...nf,
              compras_nfs_vinculos: []
            }))
          }));
        }
        
        toast.error('Erro ao buscar compras');
        throw error;
      }
      
      const mapped = (data || []).map((c: any) => {
        const nfs = (c.compras_nfs_vinculos || [])
          .map((v: any) => {
            if (!v.compras_nfs) return null;
            return {
              ...v.compras_nfs,
              compras_nfs_vinculos: v.compras_nfs.compras_nfs_vinculos || []
            };
          })
          .filter(Boolean);
        return {
          ...c,
          compras_nfs: nfs
        };
      });
      return mapped;
    }
  });

  // Mutations
  const createMut = useMutation({
    mutationFn: async (rows: any[]) => { const {error}=await supabase.from('compras').insert(rows); if(error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['compras',obraId]}); toast.success('Lançamento(s) criado(s)!'); setIsCreateOpen(false); setForm(emptyForm()); },
    onError: (e:any) => toast.error(`Erro: ${e.message}`)
  });
  const updateMut = useMutation({
    mutationFn: async ({id,fields}:{id:string;fields:any}) => { const {error}=await supabase.from('compras').update(fields).eq('id',id); if(error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['compras',obraId]}); toast.success('Atualizado!'); setIsEditOpen(false); setSelectedCompra(null); },
    onError: (e:any) => toast.error(`Erro: ${e.message}`)
  });
  const deleteMut = useMutation({
    mutationFn: async (id:string) => { const {error}=await supabase.from('compras').delete().eq('id',id); if(error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['compras',obraId]}); toast.success('Excluído!'); setIsEditOpen(false); },
    onError: (e:any) => toast.error(`Erro: ${e.message}`)
  });
  const saveNfMut = useMutation({
    mutationFn: async (payload:any) => {
      if(selectedNf){const {error}=await supabase.from('compras_nfs').update(payload).eq('id',selectedNf.id);if(error) throw error;}
      else{
        const {data, error}=await supabase.from('compras_nfs').insert([{...payload,compra_id:selectedCompra.id}]).select();
        if(error) throw error;
        if(data && data.length > 0) {
          const newNf = data[0];
          const {error: linkError}=await supabase.from('compras_nfs_vinculos').insert([{nf_id:newNf.id,compra_id:selectedCompra.id}]);
          if(linkError) throw linkError;
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['compras',obraId]}); toast.success('NF salva!'); setIsNfFormOpen(false); setSelectedNf(null); setNfForm(emptyNfForm()); },
    onError: (e:any) => toast.error(`Erro: ${e.message}`)
  });
  const deleteNfMut = useMutation({
    mutationFn: async ({ nfId, compraId, isShared }: { nfId: string; compraId: string; isShared: boolean }) => {
      if (isShared) {
        const { error } = await supabase
          .from('compras_nfs_vinculos')
          .delete()
          .eq('nf_id', nfId)
          .eq('compra_id', compraId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compras_nfs').delete().eq('id', nfId);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['compras',obraId]}); toast.success('NF excluída!'); },
    onError: (e:any) => toast.error(`Erro: ${e.message}`)
  });

  const linkNfMut = useMutation({
    mutationFn: async ({ nfId, compraId }: { nfId: string; compraId: string }) => {
      const { error } = await supabase
        .from('compras_nfs_vinculos')
        .insert([{ nf_id: nfId, compra_id: compraId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras', obraId] });
      toast.success('NF vinculada com sucesso!');
      setIsLinkNfOpen(false);
      setLinkNfSearch('');
    },
    onError: (e: any) => toast.error(`Erro ao vincular: ${e.message}`)
  });

  const saveEntradaCompradaMut = useMutation({
    mutationFn: async (payload: {
      isNewProduct: boolean;
      produto_id: string;
      newProduct: { nome: string; unidade: string; categoria: string; localizacao: string; estoque_minimo: string };
      quantidade: number;
      valor_unitario: number;
      compra: any;
      observacao: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      let prodId = payload.produto_id;

      if (payload.isNewProduct) {
        if (!payload.newProduct.nome.trim()) throw new Error('Nome do produto é obrigatório');
        const { data: newProd, error: prodError } = await supabase
          .from('produtos')
          .insert({
            obra_id: obraId,
            nome: payload.newProduct.nome.trim(),
            unidade: payload.newProduct.unidade || 'un',
            categoria: payload.newProduct.categoria || null,
            localizacao: payload.newProduct.localizacao || null,
            estoque_minimo: Number(payload.newProduct.estoque_minimo) || 0,
            estoque_atual: 0,
          })
          .select('id')
          .single();
        if (prodError) throw prodError;
        prodId = newProd.id;

        await supabase.from('logs_atividades' as any).insert({
          obra_id: obraId, user_id: user?.id, user_email: user?.email,
          acao: 'CADASTRAR', entidade: 'PRODUTO',
          detalhes: `Cadastrou o produto: ${payload.newProduct.nome.trim()} (via Compras)`
        });
      }

      const { error: entError } = await supabase
        .from('entradas')
        .insert({
          obra_id: obraId,
          produto_id: prodId,
          quantidade: payload.quantidade,
          valor_unitario: payload.valor_unitario,
          fornecedor: payload.compra.fornecedor_nome || null,
          observacao: `[COMPRA] ${payload.observacao}`.trim(),
          status_entrega: 'PENDENTE',
          comprado_por_id: user?.id || null,
          comprado_em: new Date().toISOString(),
          compra_id: payload.compra.id
        });

      if (entError) throw entError;

      // Log activity
      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId, user_id: user?.id, user_email: user?.email,
        acao: 'ENTRADA', entidade: 'ESTOQUE',
        detalhes: `Enviou compra para estoque pendente (${payload.quantidade} un)`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      toast.success('Produto enviado para a aba COMPRADOS nas Entradas!');
      setIsEstoqueOpen(false);
      resetEstoqueForm();
    },
    onError: (e: any) => {
      toast.error(`Erro: ${e.message}`);
    }
  });

  // Processed list
  const processed = useMemo(() => {
    let r = [...compras];
    if(activeTab==='ativas') r=r.filter((c:any)=>c.status!=='ARQUIVADO');
    if(selectedMonth!=='all') r=r.filter((c:any)=>mesKey(c.data_envio)===selectedMonth||mesKey(c.data_pagamento)===selectedMonth);
    if(selectedTipo!=='all') r=r.filter((c:any)=>c.tipo_solicitacao===selectedTipo);
    if(search.trim()){const t=normal(search);r=r.filter((c:any)=>normal(c.email_titulo||'').includes(t)||normal(c.fornecedor_nome||'').includes(t)||normal(c.obs||'').includes(t));}
    // Sorting
    r.sort((a:any,b:any)=>{
      const field = sortBy==='envio' ? 'data_envio' : 'data_pagamento';
      const da = a[field]||'';
      const db = b[field]||'';
      if(!da) return 1;
      if(!db) return -1;
      return sortDir==='asc'?da.localeCompare(db):db.localeCompare(da);
    });
    return r;
    },[compras,activeTab,selectedMonth,selectedTipo,search,sortBy,sortDir]);

  const months = useMemo(()=>{const s=new Set<string>();compras.forEach((c:any)=>{const k1=mesKey(c.data_envio);const k2=mesKey(c.data_pagamento);if(k1)s.add(k1);if(k2)s.add(k2);});return Array.from(s).sort((a,b)=>b.localeCompare(a));},[compras]);

  const stats = useMemo(() => {
    let sol = 0, pago = 0, nfT = 0, docs = 0;
    const countedNfs = new Set<string>();
    processed.forEach((c: any) => {
      if (!c.estornado) {
        sol += c.valor_solicitado || 0;
        pago += c.valor_pago || 0;
      }
      const nfs: any[] = c.compras_nfs || [];
      nfs.forEach((n: any) => {
        if (!countedNfs.has(n.id)) {
          countedNfs.add(n.id);
          nfT += n.valor_nf || 0;
          docs++;
        }
      });
    });
    return { sol, pago, nfT, docs, diff: Math.abs(pago - nfT) };
  }, [processed]);

  const monthlyTotals = useMemo(() => {
    const g: Record<string, { sol: number; pago: number; nf: number }> = {};
    
    // Processa valores solicitados e pagos por mês de compra
    processed.forEach((c: any) => {
      const k = mesKey(c.data_envio) || mesKey(c.data_pagamento) || 'sem-data';
      if (!g[k]) g[k] = { sol: 0, pago: 0, nf: 0 };
      g[k].sol += c.valor_solicitado || 0;
      if (!c.estornado) g[k].pago += c.valor_pago || 0;
    });

    // Processa valores de NFs únicas nos respectivos meses de lançamento
    const countedNfs = new Map<string, any>();
    processed.forEach((c: any) => {
      const nfs = c.compras_nfs || [];
      nfs.forEach((n: any) => {
        if (!countedNfs.has(n.id)) {
          countedNfs.set(n.id, {
            valor: n.valor_nf || 0,
            date: n.livro_data_entrada || n.livro_data_doc || c.data_pagamento || c.data_envio
          });
        }
      });
    });

    countedNfs.forEach((info: any) => {
      const k = mesKey(info.date) || 'sem-data';
      if (!g[k]) g[k] = { sol: 0, pago: 0, nf: 0 };
      g[k].nf += info.valor;
    });

    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [processed]);

  const fiscalRows = useMemo(() => {
    const map = new Map<string, any>();
    processed.forEach((c: any) => {
      const nfs = c.compras_nfs || [];
      nfs.forEach((nf: any) => {
        if (!map.has(nf.id)) {
          map.set(nf.id, {
            nf,
            compras: [c]
          });
        } else {
          const entry = map.get(nf.id);
          if (entry && !entry.compras.some((comp: any) => comp.id === c.id)) {
            entry.compras.push(c);
          }
        }
      });
    });

    return Array.from(map.values()).map(({ nf, compras }) => {
      const mainCompra = compras[0] || {};
      const obs = compras.map((comp: any) => comp.email_titulo || '').filter(Boolean).join(' / ');
      return {
        filename: `NF_${nf.livro_numero || 'SN'}`,
        dataEntrada: nf.livro_data_entrada ? format(new Date(nf.livro_data_entrada + 'T12:00:00'), 'dd/MM/yy') : '',
        especie: nf.livro_especie || 'NF',
        nNF: nf.livro_numero || '',
        serie: nf.livro_serie || '',
        dataDoc: nf.livro_data_doc ? format(new Date(nf.livro_data_doc + 'T12:00:00'), 'dd/MM/yy') : '',
        cnpjEmit: nf.livro_cnpj_emitente || mainCompra.fornecedor_cnpj || '',
        uf: nf.livro_uf || 'SC',
        vNF: nf.valor_nf || 0,
        cfop: nf.livro_cfop || '1556',
        imposto: 'ICMS',
        codigoA: nf.livro_cod_fiscal || '3',
        bCalculo: nf.livro_base_calculo || nf.valor_nf || 0,
        pICMS: nf.livro_aliquota || 0,
        vICMS: nf.livro_imp_creditado || 0,
        linhas_fiscais: [],
        observacoes: obs
      };
    });
  }, [processed]);

  const allNfsOfObra = useMemo(() => {
    const map = new Map<string, any>();
    if (!Array.isArray(compras)) return [];
    compras.forEach((c: any) => {
      if (!c) return;
      const nfs = c.compras_nfs || [];
      nfs.forEach((nf: any) => {
        if (!nf || !nf.id) return;
        if (!map.has(nf.id)) {
          map.set(nf.id, {
            ...nf,
            vinculosCom: [c]
          });
        } else {
          const existing = map.get(nf.id);
          if (existing && existing.vinculosCom && !existing.vinculosCom.some((vc: any) => vc.id === c.id)) {
            existing.vinculosCom.push(c);
          }
        }
      });
    });
    return Array.from(map.values());
  }, [compras]);

  // Parcel helpers
  const updateParcela = (i:number,f:string,v:any) => setForm(prev=>{const p=[...prev.parcelas];p[i]={...p[i],[f]:v};return{...prev,parcelas:p};});
  const setQtd = (n:number) => {
    const parcelas = Array.from({length:n},(_,i)=>{
      const ex=form.parcelas[i];
      const def=n===2?(i===0?'50% inicial':'50% final'):`${i+1}/${n}`;
      return ex||{parcela:def,data_envio:'',valor_solicitado:'',valor_pago:'',data_pagamento:'',estornado:false};
    });
    setForm(f=>({...f,qtd_parcelas:n,parcelas}));
  };

  // Email
  const handleAnalisarEmail = () => {
    if(!emailText.trim()){toast.error('Cole o e-mail primeiro.');return;}
    setEmailResult(parseEmail(emailText));
  };
  const handlePreencherEmail = (p:any) => {
    const n=Math.max(1,Math.min(3,p.pagamentos.length));
    setForm(f=>({...f,email_titulo:p.titulo||'',tipo_solicitacao:p.tipo||'Materiais',fornecedor_nome:p.fornecedor||'',fornecedor_cnpj:p.cnpj||'',conta:p.conta||'',centro_custo:p.cc||'',cc_desc:p.ccDesc||'',obs:p.obs||'',qtd_parcelas:n,parcelas:p.pagamentos.slice(0,3).map((pg:any)=>({parcela:pg.parcela||'1/1',data_envio:pg.envio||'',valor_solicitado:String(pg.solicitado||''),valor_pago:String(pg.pago||''),data_pagamento:pg.dataPgto||'',estornado:pg.estornado||false}))}));
    setIsColarOpen(false);setIsCreateOpen(true);toast.success('Formulário preenchido!');
  };

  // Submit
  const handleCreate = () => {
    const base={obra_id:obraId,status:form.status,email_titulo:form.email_titulo||null,email_link:form.email_link||null,fornecedor_nome:form.fornecedor_nome||null,fornecedor_cnpj:form.fornecedor_cnpj||null,fornecedor_dados:form.fornecedor_dados||null,conta:form.conta||null,centro_custo:form.centro_custo?parseInt(form.centro_custo):null,cc_desc:form.cc_desc||null,tipo_solicitacao:form.tipo_solicitacao,obs:form.obs||null};
    createMut.mutate(form.parcelas.map((p:any)=>({...base,parcela:p.parcela||null,data_envio:p.data_envio||null,valor_solicitado:p.valor_solicitado?parseFloat(p.valor_solicitado):null,valor_pago:p.valor_pago?parseFloat(p.valor_pago):null,data_pagamento:p.data_pagamento||null,estornado:p.estornado||false})));
  };
  const handleEdit = () => {
    if(!selectedCompra)return;
    const p=form.parcelas[0]||{};
    updateMut.mutate({id:selectedCompra.id,fields:{status:form.status,email_titulo:form.email_titulo||null,email_link:form.email_link||null,fornecedor_nome:form.fornecedor_nome||null,fornecedor_cnpj:form.fornecedor_cnpj||null,conta:form.conta||null,centro_custo:form.centro_custo?parseInt(form.centro_custo):null,cc_desc:form.cc_desc||null,tipo_solicitacao:form.tipo_solicitacao,obs:form.obs||null,parcela:p.parcela||null,data_envio:p.data_envio||null,valor_solicitado:p.valor_solicitado?parseFloat(p.valor_solicitado):null,valor_pago:p.valor_pago?parseFloat(p.valor_pago):null,data_pagamento:p.data_pagamento||null,estornado:p.estornado||false}});
  };
  const openEdit = (c:any) => {
    setSelectedCompra(c);
    setForm({...emptyForm(),status:c.status,email_titulo:c.email_titulo||'',email_link:c.email_link||'',fornecedor_nome:c.fornecedor_nome||'',fornecedor_cnpj:c.fornecedor_cnpj||'',fornecedor_dados:c.fornecedor_dados||'',conta:c.conta||'',centro_custo:c.centro_custo?.toString()||'',cc_desc:c.cc_desc||'',obs:c.obs||'',tipo_solicitacao:c.tipo_solicitacao||'Materiais',qtd_parcelas:1,parcelas:[{parcela:c.parcela||'1/1',data_envio:c.data_envio||'',valor_solicitado:c.valor_solicitado?.toString()||'',valor_pago:c.valor_pago?.toString()||'',data_pagamento:c.data_pagamento||'',estornado:c.estornado||false}]});
    setIsEditOpen(true);
  };

  // XML import NF (preenche campos do formulário NF/LIVRO)
  const handleNfXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingNfXml(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        if (!text) throw new Error('Arquivo vazio.');
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        if (xml.getElementsByTagName('parsererror').length > 0) throw new Error('XML inválido.');

        const get = (tag: string, parent?: Element) =>
          (parent ?? xml).getElementsByTagName(tag)[0]?.textContent?.trim() || '';

        // Emitente
        const emitEl = xml.getElementsByTagName('emit')[0];
        const cnpjEmit = get('CNPJ', emitEl);
        const cnpjFmt = cnpjEmit
          ? cnpjEmit.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
          : '';

        // Identificação
        const ideEl = xml.getElementsByTagName('ide')[0];
        const nNF = get('nNF', ideEl);
        const serie = get('serie', ideEl);
        const cUF = get('cUF', ideEl);
        const dhEmi = get('dhEmi', ideEl) || get('dEmi', ideEl);
        const uf_map: Record<string,string> = {'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
        const uf = uf_map[cUF] || get('UF', emitEl) || '';

        // Data
        let dDoc = '';
        if (dhEmi) {
          const m = dhEmi.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (m) dDoc = `${m[1]}-${m[2]}-${m[3]}`;
        }

        // Totais
        const totEl = xml.getElementsByTagName('ICMSTot')[0] || xml.getElementsByTagName('total')[0];
        const vNF = get('vNF', totEl);
        const vBC = get('vBC', totEl);
        const vICMS = get('vICMS', totEl);

        // CFOP e alíquota (primeiro item)
        const detEl = xml.getElementsByTagName('det')[0];
        const prodEl = detEl?.getElementsByTagName('prod')[0];
        const cfop = get('CFOP', prodEl);
        const impEl = detEl?.getElementsByTagName('ICMS')[0];
        const icmsGrp = impEl?.children[0];
        const pICMS = icmsGrp ? get('pICMS', icmsGrp as Element) : '';

        setNfForm(f => ({
          ...f,
          especie: 'NF-e',
          livro_numero: nNF || f.livro_numero,
          livro_serie: serie || f.livro_serie,
          livro_data_doc: dDoc || f.livro_data_doc,
          livro_data_entrada: dDoc || f.livro_data_entrada || format(new Date(), 'yyyy-MM-dd'),
          livro_cnpj_emitente: cnpjFmt || cnpjEmit || f.livro_cnpj_emitente,
          livro_uf: uf || f.livro_uf,
          livro_cfop: cfop || f.livro_cfop,
          valor_nf: vNF || f.valor_nf,
          livro_valor_contabil: vNF || f.livro_valor_contabil,
          livro_base_calculo: vBC || vNF || f.livro_base_calculo,
          livro_aliquota: pICMS || f.livro_aliquota,
          livro_imp_creditado: vICMS || f.livro_imp_creditado,
        }));
        toast.success('Dados extraídos do XML! Revise os campos.');
      } catch (err: any) {
        toast.error(err.message || 'Erro ao processar o XML.');
      } finally {
        setParsingNfXml(false);
        if (nfXmlInputRef.current) nfXmlInputRef.current.value = '';
      }
    };
    reader.onerror = () => { toast.error('Erro ao ler o arquivo.'); setParsingNfXml(false); };
    reader.readAsText(file);
  };

  // PDF import NF (extrai texto do PDF para preencher campos NF/LIVRO)
  const handleNfPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setParsingNfPdf(true);
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
      const cnpjs = txt.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
      const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
      let uf = ''; const ufM = txt.match(/uf\s*:\s*([a-z]{2})/i);
      if (ufM) uf = ufM[1].toUpperCase();
      else { const sw = txt.split(/\s+/).find(w => states.includes(w.toUpperCase())); if (sw) uf = sw.toUpperCase(); }
      let num = ''; const numM = txt.match(/n[oº]\s*([\d.]+)/i); if (numM) num = numM[1].replace(/\./g, '');
      let serie = '1'; const serM = txt.match(/s[eé]rie\s*:\s*(\d+)/i); if (serM) serie = serM[1];
      let val = ''; const valM = txt.match(/valor\s+total[\s\S]{0,20}?r?\$?\s*([\d.]+,\d{2})/i) || txt.match(/R\$\s*([\d.]+,\d{2})/i);
      if (valM) val = valM[1].replace(/\./g, '').replace(',', '.');
      let dDoc = ''; const dates = txt.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
      if (dates[0]) { const [dd, mm, yy] = dates[0].split('/'); dDoc = `${yy}-${mm}-${dd}`; }
      setNfForm(f => ({ ...f, valor_nf: val || f.valor_nf, livro_valor_contabil: val || f.livro_valor_contabil, livro_base_calculo: val || f.livro_base_calculo, livro_numero: num || f.livro_numero, livro_serie: serie || f.livro_serie, livro_cnpj_emitente: cnpjs[0] || f.livro_cnpj_emitente, livro_uf: uf || f.livro_uf, livro_data_doc: dDoc || f.livro_data_doc, livro_data_entrada: dDoc || f.livro_data_entrada || format(new Date(), 'yyyy-MM-dd') }));
      toast.success('Dados extraídos do PDF! Revise os campos.');
    } catch { toast.error('Erro ao ler PDF.'); } finally {
      setParsingNfPdf(false);
      if (nfPdfInputRef.current) nfPdfInputRef.current.value = '';
    }
  };

  // PDF import para o modal Entrar no Estoque (extrai valor total/unitário e nome)
  const handleEstoquePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setParsingEstoquePdf(true);
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
      // Extrair valor total
      let val = '';
      const valM = txt.match(/valor\s+total[\s\S]{0,20}?r?\$?\s*([\d.]+,\d{2})/i) || txt.match(/total\s+(?:a\s+pagar|geral|nf)[\s\S]{0,10}?R?\$?\s*([\d.]+,\d{2})/i) || txt.match(/R\$\s*([\d.]+,\d{2})/i);
      if (valM) val = valM[1].replace(/\./g, '').replace(',', '.');
      if (val) {
        setEstoqueForm(f => ({ ...f, valor_unitario: val }));
        toast.success(`Valor R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} extraído do PDF. Ajuste a quantidade se necessário.`);
      } else {
        toast.info('Não foi possível extrair o valor do PDF. Preencha manualmente.');
      }
    } catch { toast.error('Erro ao ler PDF.'); } finally {
      setParsingEstoquePdf(false);
      if (estoquePdfInputRef.current) estoquePdfInputRef.current.value = '';
    }
  };

  const handleSaveNf = () => {
    const vNf=parseFloat(nfForm.valor_nf);if(isNaN(vNf)){toast.error('Valor da NF é obrigatório');return;}
    saveNfMut.mutate({valor_nf:vNf,link_nf:(nfForm as any).link_nf||null,livro_especie:nfForm.especie||null,livro_numero:nfForm.livro_numero||null,livro_serie:nfForm.livro_serie||null,livro_data_doc:nfForm.livro_data_doc||null,livro_data_entrada:nfForm.livro_data_entrada||null,livro_cnpj_emitente:nfForm.livro_cnpj_emitente||null,livro_uf:nfForm.livro_uf||null,livro_cfop:nfForm.livro_cfop||null,livro_cod_fiscal:nfForm.livro_cod_fiscal||null,livro_base_calculo:nfForm.livro_base_calculo?parseFloat(nfForm.livro_base_calculo):vNf,livro_aliquota:nfForm.livro_aliquota?parseFloat(nfForm.livro_aliquota):null,livro_imp_creditado:nfForm.livro_imp_creditado?parseFloat(nfForm.livro_imp_creditado):null,livro_valor_contabil:nfForm.livro_valor_contabil?parseFloat(nfForm.livro_valor_contabil):vNf,vinculo:nfForm.vinculo});
  };

  // Exports
  const exportExcel = () => {
    const data=processed.map((c:any)=>({'Status':c.status,'Estornado':c.estornado?'Sim':'Não','Parcela':c.parcela||'','Envio':fmtDate(c.data_envio),'Valor Solicitado':c.valor_solicitado||0,'E-mail':c.email_titulo||'','Fornecedor':c.fornecedor_nome||'','CNPJ':c.fornecedor_cnpj||'','Conta':c.conta||'','Valor Pago':c.valor_pago||0,'Data Pagamento':fmtDate(c.data_pagamento),'Centro Custo':c.centro_custo||'','Desc CC':c.cc_desc||'','Tipo':c.tipo_solicitacao||'','NFs':(c.compras_nfs||[]).map((n:any)=>n.livro_numero||'S/N').join(', '),'Total NF':(c.compras_nfs||[]).reduce((s:number,n:any)=>s+(n.valor_nf||0),0),'Obs':c.obs||''}));
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Compras');XLSX.writeFile(wb,`compras-${format(new Date(),'dd-MM-yyyy')}.xlsx`);toast.success('Excel exportado!');
  };
  const exportPdf = () => {
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    autoTable(doc,{head:[['#','Status','Parcela','Envio','Solicitado','E-mail','Fornecedor','Pago','Dt.Pgto','CC','Tipo','NFs','Obs']],body:processed.map((c:any,i:number)=>[i+1,c.status,c.parcela||'',fmtDate(c.data_envio),fmt(c.valor_solicitado),c.email_titulo||'',c.fornecedor_nome||'',fmt(c.valor_pago),fmtDate(c.data_pagamento),`${c.centro_custo||''} ${c.cc_desc||''}`.trim(),c.tipo_solicitacao||'',(c.compras_nfs||[]).map((n:any)=>n.livro_numero||'S/N').join(', '),c.obs||'']),styles:{fontSize:7,cellPadding:1.5},headStyles:{fillColor:[14,22,41]}});
    doc.save(`compras-${format(new Date(),'dd-MM-yyyy')}.pdf`);toast.success('PDF exportado!');
  };

  const KANBAN_COLS = STATUS_OPTIONS.filter(s=>s!=='ARQUIVADO');

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Área de Compras
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Lançamentos de pagamento · NFs · Livro de Entradas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={()=>{setForm(emptyForm());setIsCreateOpen(true);}}>
            <Plus className="h-4 w-4 mr-1.5"/>Novo lançamento
          </Button>
          <Button size="sm" variant="outline" onClick={()=>setIsColarOpen(true)}>
            <Mail className="h-4 w-4 mr-1.5"/>Colar e-mail
          </Button>
          <Button size="sm" variant="outline" onClick={()=>setIsLivroOpen(true)}>
            <BookOpen className="h-4 w-4 mr-1.5"/>Livro Fiscal
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5"/>Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf}>
            <Download className="h-4 w-4 mr-1.5"/>PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label:'Solicitado', value:fmt(stats.sol), sub:`${processed.length} lançamento(s)`, icon:<DollarSign className="h-5 w-5"/>, color:'text-primary', bg:'bg-primary/15 border-primary/20' },
          { label:'Pago', value:fmt(stats.pago), sub:'Total pago', icon:<CheckCircle2 className="h-5 w-5"/>, color:'text-emerald-400', bg:'bg-emerald-500/15 border-emerald-500/20' },
          { label:'Total NF', value:fmt(stats.nfT), sub:'Livro de Entradas', icon:<ReceiptText className="h-5 w-5"/>, color:'text-amber-400', bg:'bg-amber-500/15 border-amber-500/20' },
          { label:'Diferença Pago×NF', value:fmt(stats.diff), sub:stats.diff<0.01?'✓ Conciliado':'A conciliar', icon:<AlertTriangle className="h-5 w-5"/>, color:stats.diff<0.01?'text-emerald-400':'text-red-400', bg:stats.diff<0.01?'bg-emerald-500/15 border-emerald-500/20':'bg-red-500/15 border-red-500/20' },
          { label:'Documentos Fiscais', value:String(stats.docs), sub:'NFs no Livro', icon:<FileText className="h-5 w-5"/>, color:'text-blue-400', bg:'bg-blue-500/15 border-blue-500/20' },
        ].map(kpi=>(
          <Card key={kpi.label} className="bg-[#0e1629] border-white/5 text-white">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white/40 text-[9px] uppercase tracking-[.15em] font-bold truncate">{kpi.label}</p>
                <p className={`text-lg font-display font-bold truncate ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] text-white/40 truncate">{kpi.sub}</p>
              </div>
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${kpi.bg} ${kpi.color}`}>
                {kpi.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-[#0e1629] border border-white/5 rounded-xl">
          {(['ativas','geral','kanban','dashboard'] as const).map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab===t?'bg-primary text-white':'text-white/50 hover:text-white/80'}`}>
              {t==='ativas'?'📋 Ativas':t==='geral'?'📂 Geral':t==='kanban'?'🗂 Kanban':'📊 Dashboard'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40"/>
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 h-8 text-xs bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary"/>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-8 w-36 text-xs bg-[#0e1629] border-white/10 text-white"><SelectValue placeholder="Mês"/></SelectTrigger>
          <SelectContent className="bg-[#161f30] border-white/10 text-white">
            <SelectItem value="all">Todos os meses</SelectItem>
            {months.map(m=><SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedTipo} onValueChange={setSelectedTipo}>
          <SelectTrigger className="h-8 w-32 text-xs bg-[#0e1629] border-white/10 text-white"><SelectValue placeholder="Tipo"/></SelectTrigger>
          <SelectContent className="bg-[#161f30] border-white/10 text-white">
            <SelectItem value="all">Todos tipos</SelectItem>
            {TIPO_OPTIONS.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table view (ativas / geral) ── */}
      {(activeTab==='ativas'||activeTab==='geral') && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
          ) : processed.length===0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3"/>
              <p className="text-muted-foreground text-sm">Nenhum lançamento encontrado.</p>
              <Button size="sm" className="mt-4" onClick={()=>setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5"/>Criar primeiro lançamento
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#0a1020] text-white/60 uppercase tracking-wider text-[9px]">
                      {['#','Status','Parcela','Envio','Solicitado','E-mail / Título','Tipo','Fornecedor','Pago','Dt. Pgto','NF / Livro','CC','Ações'].map(h=>{
                        if (h === 'Envio') {
                          const active = sortBy === 'envio';
                          return (
                            <th key={h} className="px-3 py-2 text-left whitespace-nowrap font-bold">
                              <button
                                onClick={() => {
                                  if (active) {
                                    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setSortBy('envio');
                                    setSortDir('desc');
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-all text-[10px] font-bold ${
                                  active 
                                    ? 'bg-white text-zinc-950 font-extrabold shadow-sm' 
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                Envio {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                              </button>
                            </th>
                          );
                        }
                        if (h === 'Dt. Pgto') {
                          const active = sortBy === 'pagamento';
                          return (
                            <th key={h} className="px-3 py-2 text-left whitespace-nowrap font-bold">
                              <button
                                onClick={() => {
                                  if (active) {
                                    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setSortBy('pagamento');
                                    setSortDir('desc');
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-all text-[10px] font-bold ${
                                  active 
                                    ? 'bg-white text-zinc-950 font-extrabold shadow-sm' 
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                Dt. Pgto {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                              </button>
                            </th>
                          );
                        }
                        return (
                          <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap font-bold">{h}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {processed.map((c:any,i:number)=>{
                      const conf=getConf(c);
                      const nfs:any[]=c.compras_nfs||[];
                      const totalNF=nfs.reduce((s:number,n:any)=>s+(n.valor_nf||0),0);
                      return (
                        <tr key={c.id} className={`border-l-2 ${CONF_LEFT[conf]} bg-[#0e1629] hover:bg-[#111d35] transition-colors ${c.estornado?'opacity-60':''}`}>
                          <td className="px-3 py-2.5 text-white/60 font-mono font-bold">#{pad2(i+1)}</td>
                          <td className="px-3 py-2.5">
                            <Badge className={`text-[9px] font-bold uppercase border ${STATUS_BADGE[c.status]||STATUS_BADGE['NÃO INICIADO']}`}>{c.status}</Badge>
                            {c.estornado&&<div className="text-[9px] text-zinc-400 mt-0.5">ESTORNADO</div>}
                          </td>
                          <td className="px-3 py-2.5 text-white/70 font-semibold whitespace-nowrap">{c.parcela||'—'}</td>
                          <td className="px-3 py-2.5 text-white/60 whitespace-nowrap">{fmtDate(c.data_envio)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-white whitespace-nowrap">{fmt(c.valor_solicitado)}</td>
                          <td className="px-3 py-2.5 max-w-[200px]">
                            <p className="font-semibold text-white/90 truncate">{c.email_titulo||'—'}</p>
                            {c.email_link&&<a href={c.email_link} target="_blank" rel="noreferrer" className="text-[9px] text-primary hover:underline">🔗 Link</a>}
                            {c.entradas && c.entradas.length > 0 && (
                              <div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                <p className="text-[9px] font-bold text-white/50 tracking-wide uppercase flex items-center gap-1">
                                  <Boxes className="h-3 w-3 text-emerald-400" />
                                  Produtos no Estoque
                                </p>
                                <div className="divide-y divide-white/5 max-h-[120px] overflow-y-auto pr-1">
                                  {c.entradas.map((e: any) => {
                                    const itemTotal = (e.valor_unitario || 0) * e.quantidade;
                                    return (
                                      <div key={e.id} className="py-1 text-[10px] text-white/80 flex justify-between items-start gap-2">
                                        <span className="truncate max-w-[120px] font-medium" title={e.produtos?.nome}>
                                          {e.produtos?.nome || 'Produto'}
                                        </span>
                                        <div className="flex items-center gap-1.5 flex-shrink-0 text-right font-mono">
                                          <span className="text-white/40">{e.quantidade}x</span>
                                          <span className="text-white/60 text-[9px]">{fmt(e.valor_unitario)}</span>
                                          <span className="font-semibold text-white/90">{fmt(itemTotal)}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="text-[10px] text-right border-t border-white/10 pt-1.5 font-bold flex justify-between items-center">
                                  <span className="text-white/40 text-[8px] uppercase tracking-wider">Total Lançado:</span>
                                  <span className="text-emerald-400 font-mono">
                                    {fmt(c.entradas.reduce((acc: number, cur: any) => acc + ((cur.valor_unitario || 0) * cur.quantidade), 0))}
                                  </span>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge className={`text-[9px] font-bold uppercase border ${TIPO_BADGE[c.tipo_solicitacao]||TIPO_BADGE['Outros']}`}>{c.tipo_solicitacao||'—'}</Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-white/80">{c.fornecedor_nome||'—'}</p>
                            {c.fornecedor_cnpj&&<p className="text-[9px] text-white/60">{c.fornecedor_cnpj}</p>}
                            {c.conta&&<p className="text-[9px] text-white/60">{c.conta}</p>}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap ${c.estornado?'line-through text-white/30':'text-emerald-400'}`}>{fmt(c.valor_pago)}</td>
                          <td className="px-3 py-2.5 text-white/60 whitespace-nowrap">{fmtDate(c.data_pagamento)}</td>
                          <td className="px-3 py-2.5 min-w-[160px]">
                            {c.estornado ? (
                              <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/20 text-[9px]">ESTORNADO</Badge>
                            ) : nfs.length>0 ? (
                              <div className="space-y-0.5">
                                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/20 text-[9px]">✓ NF Anexada</Badge>
                                {nfs.map((n:any)=><p key={n.id} className="text-[9px] text-white/60">{n.livro_especie||'NF'} {n.livro_numero||'S/N'} · {fmt(n.valor_nf)}</p>)}
                                {Math.abs(totalNF-(c.valor_pago||0))>0.01&&<p className="text-[9px] text-amber-400">⚠ Dif: {fmt(Math.abs(totalNF-(c.valor_pago||0)))}</p>}
                              </div>
                            ) : (
                              <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/20 text-[9px]">NF Pendente</Badge>
                            )}
                            <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1.5 mt-1 text-primary" onClick={()=>{setSelectedCompra(c);setIsNfOpen(true);}}>
                              📎 NFs
                            </Button>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-white/70">{c.centro_custo||'—'}</p>
                            {c.cc_desc&&<p className="text-[9px] text-white/60 truncate max-w-[100px]">{c.cc_desc}</p>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-400 hover:bg-emerald-400/10" onClick={()=>{setSelectedCompra(c);setEstoqueForm(f=>({...f,quantidade:'1',valor_unitario:c.valor_pago?c.valor_pago.toString():(c.valor_solicitado?c.valor_solicitado.toString():'')}));setIsEstoqueOpen(true);}} title="Entrar em estoque"><Boxes className="h-3.5 w-3.5"/></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-400 hover:bg-amber-400/10" onClick={()=>openEdit(c)}><Edit className="h-3.5 w-3.5"/></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-400/10" onClick={()=>{if(confirm('Excluir?'))deleteMut.mutate(c.id);}}><Trash2 className="h-3.5 w-3.5"/></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totais mensais */}
              {monthlyTotals.length>0&&(
                <Card className="bg-[#0e1629] border-white/5">
                  <CardContent className="p-4">
                    <p className="text-[9px] uppercase tracking-[.2em] text-white/60 font-bold mb-3">Totais por mês</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-white/60 text-[9px] uppercase">
                            <th className="text-left pb-2 font-bold">Mês</th>
                            <th className="text-right pb-2 font-bold">Solicitado</th>
                            <th className="text-right pb-2 font-bold">Pago</th>
                            <th className="text-right pb-2 font-bold">Total NF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {monthlyTotals.map(([k,v])=>(
                            <tr key={k}>
                              <td className="py-1.5 text-white/70 font-semibold">{mesLabel(k)}</td>
                              <td className="py-1.5 text-right font-mono text-white/60">{fmt(v.sol)}</td>
                              <td className="py-1.5 text-right font-mono text-emerald-400">{fmt(v.pago)}</td>
                              <td className="py-1.5 text-right font-mono text-amber-400">{fmt(v.nf)}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-white/10">
                            <td className="py-1.5 text-white font-bold text-[10px] uppercase tracking-wider">Total Geral</td>
                            <td className="py-1.5 text-right font-mono font-bold text-white">{fmt(monthlyTotals.reduce((s,[,v])=>s+v.sol,0))}</td>
                            <td className="py-1.5 text-right font-mono font-bold text-emerald-400">{fmt(monthlyTotals.reduce((s,[,v])=>s+v.pago,0))}</td>
                            <td className="py-1.5 text-right font-mono font-bold text-amber-400">{fmt(monthlyTotals.reduce((s,[,v])=>s+v.nf,0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Kanban ── */}
      {activeTab==='kanban'&&(
        <div
          className="flex gap-3 overflow-x-auto pb-6 -mx-2 px-2"
          style={{ minHeight: '60vh' }}
        >
          {KANBAN_COLS.map(col => {
            const items = compras.filter((c:any) => c.status === col);
            const isOver = dragOverCol === col;
            return (
              <div
                key={col}
                className="flex flex-col flex-shrink-0"
                style={{ width: 240 }}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
                onDrop={e => {
                  e.preventDefault();
                  if (dragId && dragId !== col) {
                    updateMut.mutate({ id: dragId, fields: { status: col } });
                  }
                  setDragId(null);
                  setDragOverCol(null);
                }}
              >
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-2 border transition-all ${isOver ? 'border-white/20 bg-white/10' : 'border-white/5 bg-[#0e1629]'}`}>
                  <Badge className={`text-[9px] font-bold uppercase border ${STATUS_BADGE[col]||STATUS_BADGE['NÃO INICIADO']}`}>{col}</Badge>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${items.length > 0 ? 'bg-white/10 text-white/60' : 'text-white/20'}`}>
                    {items.length}
                  </span>
                </div>

                {/* Drop zone */}
                <div
                  className={`flex-1 rounded-xl transition-all space-y-2 p-2 min-h-[120px] border-2 border-dashed ${
                    isOver
                      ? 'border-white/30 bg-white/5'
                      : 'border-transparent'
                  }`}
                >
                  {items.length === 0 && (
                    <div className={`flex items-center justify-center h-20 rounded-lg text-[10px] text-white/20 transition-all ${isOver ? 'bg-white/5 text-white/40' : ''}`}>
                      {isOver ? '⬇ Soltar aqui' : 'Sem itens'}
                    </div>
                  )}

                  {items.map((c:any) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={e => {
                        setDragId(c.id);
                        e.dataTransfer.effectAllowed = 'move';
                        // ghost image
                        const ghost = document.createElement('div');
                        ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;padding:8px 12px;background:#1a2a45;color:white;border-radius:8px;font-size:11px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                        ghost.textContent = c.email_titulo || 'Sem título';
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 0, 0);
                        setTimeout(() => document.body.removeChild(ghost), 0);
                      }}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                      onClick={() => openEdit(c)}
                      className={`bg-[#0e1629] border border-white/5 border-l-[3px] ${CONF_LEFT[getConf(c)]} rounded-xl p-3 cursor-grab active:cursor-grabbing hover:bg-[#111d35] transition-all hover:shadow-lg hover:-translate-y-0.5 select-none ${dragId===c.id ? 'opacity-40 scale-95' : 'opacity-100'}`}
                    >
                      <p className="text-xs font-semibold text-white/90 line-clamp-2 mb-1.5 leading-snug">
                        {c.email_titulo||'Sem título'}
                      </p>
                      <p className="text-[10px] text-white/40 truncate mb-1">{c.fornecedor_nome||'—'}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-mono font-bold text-emerald-400">{fmt(c.valor_pago||c.valor_solicitado)}</p>
                        {c.parcela && (
                          <Badge className="bg-primary/15 text-primary border-primary/20 text-[8px] px-1.5">{c.parcela}</Badge>
                        )}
                      </div>
                      {c.data_envio && (
                        <p className="text-[9px] text-white/25 mt-1.5">{fmtDate(c.data_envio)}</p>
                      )}
                      {c.entradas && c.entradas.length > 0 && (
                        <div className="mt-2.5 p-2 rounded-lg bg-black/40 border border-white/5 space-y-1.5 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="text-[8px] font-bold text-white/50 tracking-wide uppercase flex items-center gap-1">
                            <Boxes className="h-3 w-3 text-emerald-400" />
                            Estoque Lançado
                          </div>
                          <div className="divide-y divide-white/5 max-h-[85px] overflow-y-auto pr-0.5">
                            {c.entradas.map((e: any) => {
                              const itemTotal = (e.valor_unitario || 0) * e.quantidade;
                              return (
                                <div key={e.id} className="py-1 text-[9px] text-white/80 flex justify-between gap-1">
                                  <span className="truncate max-w-[90px] font-medium" title={e.produtos?.nome}>
                                    {e.produtos?.nome || 'Produto'}
                                  </span>
                                  <div className="flex items-center gap-1 flex-shrink-0 text-right font-mono">
                                    <span className="text-white/40">{e.quantidade}x</span>
                                    <span className="font-semibold text-white/90">{fmt(itemTotal)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-[9px] text-right border-t border-white/10 pt-1 font-bold flex justify-between items-center">
                            <span className="text-white/40 text-[7px] uppercase tracking-wider">Total:</span>
                            <span className="text-emerald-400 font-mono">
                              {fmt(c.entradas.reduce((acc: number, cur: any) => acc + ((cur.valor_unitario || 0) * cur.quantidade), 0))}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Drag hint */}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/5">
                        <span className="text-[8px] text-white/20 select-none">⠿ arraste para mover</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dashboard ── */}
      {activeTab==='dashboard'&&(
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-[#0e1629] border-white/5">
            <CardContent className="p-5">
              <p className="text-[9px] uppercase tracking-[.2em] text-white/30 font-bold mb-4">Totais por Tipo</p>
              <div className="space-y-2">
                {TIPO_OPTIONS.map(t=>{
                  const items=processed.filter((c:any)=>c.tipo_solicitacao===t.value);
                  const total=items.reduce((s:number,c:any)=>s+(c.valor_pago||0),0);
                  return(
                    <div key={t.value} className="flex items-center gap-3 py-2 border-b border-white/5">
                      <Badge className={`text-[9px] font-bold uppercase border ${TIPO_BADGE[t.value]||TIPO_BADGE['Outros']}`}>{t.label}</Badge>
                      <span className="ml-auto font-mono font-bold text-white/80 text-sm">{fmt(total)}</span>
                      <span className="text-[10px] text-white/30">{items.length}x</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0e1629] border-white/5">
            <CardContent className="p-5">
              <p className="text-[9px] uppercase tracking-[.2em] text-white/30 font-bold mb-4">Totais por Status</p>
              <div className="space-y-2">
                {STATUS_OPTIONS.map(s=>{
                  const items=compras.filter((c:any)=>c.status===s);
                  const total=items.reduce((sum:number,c:any)=>sum+(c.valor_pago||0),0);
                  return(
                    <div key={s} className="flex items-center gap-3 py-2 border-b border-white/5">
                      <Badge className={`text-[9px] font-bold uppercase border ${STATUS_BADGE[s]||STATUS_BADGE['NÃO INICIADO']}`}>{s}</Badge>
                      <span className="ml-auto font-mono font-bold text-white/80 text-sm">{fmt(total)}</span>
                      <span className="text-[10px] text-white/30">{items.length}x</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════ DIALOG: Colar E-mail ══════ */}
      <Dialog open={isColarOpen} onOpenChange={setIsColarOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-white font-display font-bold"><Mail className="h-5 w-5 text-primary"/>Colar e-mail → preenchimento automático</DialogTitle></DialogHeader>
          <p className="text-xs text-white/50">Cole a conversa/e-mail de solicitação. O sistema detecta pagamentos, parcelas, estornos e fornecedores automaticamente.</p>
          <Textarea value={emailText} onChange={e=>setEmailText(e.target.value)} className="min-h-[160px] text-xs font-mono bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl" placeholder="Cole aqui o texto completo do e-mail..."/>
          <div className="flex gap-2">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white rounded-xl" onClick={handleAnalisarEmail}><Search className="h-4 w-4 mr-1.5"/>Analisar</Button>
            <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl" onClick={()=>{setIsColarOpen(false);setEmailText('');setEmailResult(null);}}>Fechar</Button>
          </div>
          {emailResult&&(
            <Card className="bg-[#0a1020] border-white/5 text-white">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold text-white">Encontrado: <span className="text-primary">{emailResult.pagamentos.length}</span> pagamento(s) · <span className="text-red-400">{emailResult.pagamentos.filter((p:any)=>p.estornado).length}</span> estorno(s)</p>
                <p className="text-xs text-white/60">Título: {emailResult.titulo||'—'}</p>
                <p className="text-xs text-white/60">Fornecedor: {emailResult.fornecedor||'—'} · Tipo: {emailResult.tipo}</p>
                <div className="space-y-1">
                  {emailResult.pagamentos.map((p:any,i:number)=>(
                    <div key={i} className="text-[10px] text-white/40 py-1 border-b border-white/5">
                      <span className="font-bold text-white/80">#{i+1}</span> {p.estornado?'🔴 ESTORNADO':'🟢 ATIVO'} — {p.parcela} — Sol: {fmt(p.solicitado)} — Envio: {p.envio||'—'}
                    </div>
                  ))}
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white rounded-xl" onClick={()=>handlePreencherEmail(emailResult)}>✅ Preencher formulário</Button>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════ DIALOG: Criar lançamento ══════ */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-white font-display font-bold"><Plus className="h-5 w-5 text-primary"/>Novo Lançamento Completo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Título do e-mail / solicitação</Label>
              <Input value={form.email_titulo} onChange={e=>setForm(f=>({...f,email_titulo:e.target.value}))} placeholder="Ex.: APROVAÇÃO coqueiros — N&J House" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Tipo</Label>
              <Select value={form.tipo_solicitacao} onValueChange={v=>setForm(f=>({...f,tipo_solicitacao:v}))}>
                <SelectTrigger className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"><SelectValue/></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Status</Label>
              <Select value={form.status} onValueChange={v=>setForm(f=>({...f,status:v}))}>
                <SelectTrigger className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"><SelectValue/></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Fornecedor</Label>
              <Input value={form.fornecedor_nome} onChange={e=>setForm(f=>({...f,fornecedor_nome:e.target.value}))} placeholder="Nome da empresa" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">CNPJ/CPF</Label>
              <Input value={form.fornecedor_cnpj} onChange={e=>setForm(f=>({...f,fornecedor_cnpj:e.target.value}))} placeholder="00.000.000/0000-00" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Conta / Banco</Label>
              <Input value={form.conta} onChange={e=>setForm(f=>({...f,conta:e.target.value}))} placeholder="Ag. / Conta / Banco" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Link do E-mail</Label>
              <Input value={form.email_link} onChange={e=>setForm(f=>({...f,email_link:e.target.value}))} placeholder="https://..." className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Centro de Custo</Label>
              <Input type="number" value={form.centro_custo} onChange={e=>setForm(f=>({...f,centro_custo:e.target.value}))} placeholder="0" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Descrição do CC</Label>
              <Input value={form.cc_desc} onChange={e=>setForm(f=>({...f,cc_desc:e.target.value}))} placeholder="Não previsto em orçamento" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Observações</Label>
              <Input value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} placeholder="Ex.: NF emitida ao final" className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>

            {/* Parcelas */}
            <div className="col-span-2 border-t border-white/5 pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Qtd. de Pagamentos</Label>
                {[1,2,3].map(n=>(
                  <Button key={n} size="sm" variant={form.qtd_parcelas===n?'default':'outline'} className={`h-7 w-7 p-0 text-xs ${form.qtd_parcelas===n?'':'bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-lg'}`} onClick={()=>setQtd(n)}>{n}</Button>
                ))}
              </div>
              {form.parcelas.map((p:any,i:number)=>(
                <Card key={i} className="bg-[#0a1020] border-white/5 text-white">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">Pagamento {i+1}</span>
                      {p.estornado&&<Badge className="bg-blue-500/15 text-blue-300 border-blue-500/20 text-[8px]">ESTORNADO</Badge>}
                      <label className="ml-auto flex items-center gap-1.5 text-xs text-white/40 cursor-pointer">
                        <input type="checkbox" checked={p.estornado} onChange={e=>updateParcela(i,'estornado',e.target.checked)} className="rounded bg-[#0e1629] border-white/10 text-primary focus:ring-0"/>
                        Estornado
                      </label>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        {label:'Parcela',field:'parcela',type:'text'},
                        {label:'Envio',field:'data_envio',type:'date'},
                        {label:'Solicitado',field:'valor_solicitado',type:'number'},
                        {label:'Pago',field:'valor_pago',type:'number'},
                        {label:'Dt. Pagamento',field:'data_pagamento',type:'date'},
                      ].map(({label,field,type})=>(
                        <div key={field} className="space-y-1">
                          <Label className="text-[8px] uppercase tracking-wider text-white/40 font-bold">{label}</Label>
                          <Input type={type} step={type==='number'?'0.01':undefined} value={(p as any)[field]} onChange={e=>updateParcela(i,field,e.target.value)} className="text-xs h-8 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg"/>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl" onClick={()=>setIsCreateOpen(false)}>Cancelar</Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white rounded-xl" onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:`Salvar ${form.parcelas.length>1?form.parcelas.length+' lançamentos':'lançamento'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ DIALOG: Editar ══════ */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-white font-display font-bold"><Edit className="h-5 w-5 text-primary"/>Editar Lançamento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Título do e-mail</Label>
              <Input value={form.email_titulo} onChange={e=>setForm(f=>({...f,email_titulo:e.target.value}))} className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Status</Label>
              <Select value={form.status} onValueChange={v=>setForm(f=>({...f,status:v}))}>
                <SelectTrigger className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"><SelectValue/></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Tipo</Label>
              <Select value={form.tipo_solicitacao} onValueChange={v=>setForm(f=>({...f,tipo_solicitacao:v}))}>
                <SelectTrigger className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"><SelectValue/></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {[
              {label:'Parcela',field:'parcela',type:'text',target:'parcelas[0].parcela'},
              {label:'Envio',field:'data_envio',type:'date',target:'parcelas[0].data_envio'},
              {label:'Valor Solicitado',field:'valor_solicitado',type:'number',target:'parcelas[0].valor_solicitado'},
              {label:'Valor Pago',field:'valor_pago',type:'number',target:'parcelas[0].valor_pago'},
              {label:'Data Pagamento',field:'data_pagamento',type:'date',target:'parcelas[0].data_pagamento'},
              {label:'Fornecedor',field:'fornecedor_nome',type:'text',target:'form'},
              {label:'CNPJ/CPF',field:'fornecedor_cnpj',type:'text',target:'form'},
              {label:'Conta / Banco',field:'conta',type:'text',target:'form'},
              {label:'Link E-mail',field:'email_link',type:'text',target:'form'},
              {label:'Centro de Custo',field:'centro_custo',type:'number',target:'form'},
              {label:'Desc. CC',field:'cc_desc',type:'text',target:'form'},
            ].map(({label,field,type,target})=>{
              const isParc=target.startsWith('parcelas');
              const val=isParc?(form.parcelas[0] as any)?.[field]||'':(form as any)[field]||'';
              const onChange=(v:string)=>{
                if(isParc)updateParcela(0,field,v);
                else setForm(f=>({...f,[field]:v}));
              };
              return(
                <div key={field} className="space-y-1">
                  <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">{label}</Label>
                  <Input type={type} step={type==='number'?'0.01':undefined} value={val} onChange={e=>onChange(e.target.value)} className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
                </div>
              );
            })}
            <div className="col-span-2 space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-white/40 font-bold">Observações</Label>
              <Input value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} className="text-sm bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-xl h-10"/>
            </div>
             <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm text-white/40 cursor-pointer">
                <input type="checkbox" checked={form.parcelas[0]?.estornado||false} onChange={e=>updateParcela(0,'estornado',e.target.checked)} className="rounded bg-[#0e1629] border-white/10 text-primary focus:ring-0"/>
                Marcar como estornado/reembolsado
              </label>
            </div>
            {selectedCompra?.entradas && selectedCompra.entradas.length > 0 && (
              <div className="col-span-2 mt-2 p-3 rounded-xl bg-black/45 border border-white/5 space-y-2">
                <p className="text-[10px] font-bold text-white/50 tracking-wide uppercase flex items-center gap-1.5">
                  <Boxes className="h-4 w-4 text-emerald-400" />
                  Materiais Lançados no Estoque
                </p>
                <div className="divide-y divide-white/5 space-y-1 max-h-[150px] overflow-y-auto pr-1">
                  {selectedCompra.entradas.map((e: any) => {
                    const itemTotal = (e.valor_unitario || 0) * e.quantidade;
                    return (
                      <div key={e.id} className="py-1.5 text-xs text-white/90 flex justify-between items-center gap-2">
                        <span>
                          <span className="font-semibold text-white">{e.produtos?.nome || 'Produto'}</span>
                          <span className={`text-[10px] ml-2 px-1.5 py-0.5 rounded-full border ${e.status_entrega === 'REALIZADO' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
                            {e.status_entrega}
                          </span>
                        </span>
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className="text-white/40">{e.quantidade} un x</span>
                          <span className="text-white/60">{fmt(e.valor_unitario)}</span>
                          <span className="font-semibold text-white/90">{fmt(itemTotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-right border-t border-white/10 pt-2 font-bold flex justify-between items-center">
                  <span className="text-white/40 text-[10px] uppercase tracking-wider">Total Lançado no Estoque:</span>
                  <span className="text-emerald-400 font-mono text-sm">
                    {fmt(selectedCompra.entradas.reduce((acc: number, cur: any) => acc + ((cur.valor_unitario || 0) * cur.quantidade), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="destructive" size="sm" className="rounded-xl h-9" onClick={()=>{if(confirm('Excluir?'))deleteMut.mutate(selectedCompra.id);}}><Trash2 className="h-4 w-4 mr-1"/>Excluir</Button>
            <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl h-9" onClick={()=>setIsEditOpen(false)}>Cancelar</Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white rounded-xl h-9" onClick={handleEdit} disabled={updateMut.isPending}>{updateMut.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ DIALOG: NFs ══════ */}
      <Dialog open={isNfOpen} onOpenChange={v=>{if(!v){setIsNfOpen(false);setIsNfFormOpen(false);setSelectedNf(null);}}}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white font-display font-bold">
              <ReceiptText className="h-5 w-5 text-primary"/>
              NFs — {selectedCompra?.email_titulo||'Lançamento'}
            </DialogTitle>
          </DialogHeader>
          {selectedCompra&&(()=>{
            const nfs:any[]=selectedCompra.compras_nfs||[];
            const totalNF=nfs.reduce((s:number,n:any)=>s+(n.valor_nf||0),0);
            const diff=(selectedCompra.valor_pago||0)-totalNF;
            return(
              <div className="flex flex-wrap gap-4 text-xs mb-2">
                <span className="text-white/50">Valor pago: <span className="font-bold text-emerald-400">{fmt(selectedCompra.valor_pago)}</span></span>
                <span className="text-white/50">Total NFs: <span className="font-bold text-amber-400">{fmt(totalNF)}</span></span>
                {Math.abs(diff)<0.01
                  ?<Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/20 text-[9px]">✓ 100% Conciliado</Badge>
                  :diff>0
                  ?<Badge className="bg-orange-500/15 text-orange-300 border-orange-500/20 text-[9px]">⚠ Falta NF: {fmt(diff)}</Badge>
                  :<Badge className="bg-blue-500/15 text-blue-300 border-blue-500/20 text-[9px]">NF excede: {fmt(Math.abs(diff))}</Badge>
                }
              </div>
            );
          })()}

          {/* Lista de NFs */}
          {(selectedCompra?.compras_nfs||[]).length>0&&(
            <div className="overflow-x-auto rounded-xl border border-white/5 mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0a1020] text-white/30 text-[9px] uppercase">
                    {['Espécie','Número','Série','Data Doc','CNPJ','UF','Valor NF','CFOP','Cod','B.Cálc','Alíq','Imp.Cred','Vínculo','Ações'].map(h=><th key={h} className="px-2.5 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(selectedCompra?.compras_nfs||[]).map((nf:any)=>(
                    <tr key={nf.id} className="bg-[#0e1629] hover:bg-[#111d35]">
                      <td className="px-2.5 py-2">{nf.livro_especie||'—'}</td>
                      <td className="px-2.5 py-2 font-mono flex items-center gap-1.5 whitespace-nowrap">
                        {nf.livro_numero||'—'}
                        {(nf.compras_nfs_vinculos || []).length > 1 && (
                          <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20 text-[8px] font-sans scale-90 px-1 py-0 h-4 rounded">
                            Compartilhada
                          </Badge>
                        )}
                      </td>
                      <td className="px-2.5 py-2">{nf.livro_serie||'—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmtDate(nf.livro_data_doc)}</td>
                      <td className="px-2.5 py-2 text-white/50">{nf.livro_cnpj_emitente||'—'}</td>
                      <td className="px-2.5 py-2">{nf.livro_uf||'—'}</td>
                      <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-400">{fmt(nf.valor_nf)}</td>
                      <td className="px-2.5 py-2">{nf.livro_cfop||'—'}</td>
                      <td className="px-2.5 py-2">{nf.livro_cod_fiscal||'—'}</td>
                      <td className="px-2.5 py-2 text-right font-mono">{fmt(nf.livro_base_calculo)}</td>
                      <td className="px-2.5 py-2">{nf.livro_aliquota?`${nf.livro_aliquota}%`:'—'}</td>
                      <td className="px-2.5 py-2 text-right font-mono">{fmt(nf.livro_imp_creditado)}</td>
                      <td className="px-2.5 py-2 text-white/50 whitespace-nowrap">{VINCULO_OPTIONS.find(v=>v.value===nf.vinculo)?.label||nf.vinculo||'—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-amber-400 hover:bg-amber-400/10" onClick={()=>{setSelectedNf(nf);setNfForm({...emptyNfForm(),...nf,valor_nf:nf.valor_nf?.toString()||'',livro_base_calculo:nf.livro_base_calculo?.toString()||'',livro_aliquota:nf.livro_aliquota?.toString()||'',livro_imp_creditado:nf.livro_imp_creditado?.toString()||'',livro_valor_contabil:nf.livro_valor_contabil?.toString()||''});setIsNfFormOpen(true);}}><Edit className="h-3 w-3"/></Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:bg-red-400/10" onClick={()=>{
                          const isShared = (nf.compras_nfs_vinculos || []).length > 1;
                          const msg = isShared 
                            ? `Esta NF está vinculada a ${nf.compras_nfs_vinculos.length} lançamentos. Deseja remover apenas o vínculo com este lançamento?`
                            : 'Excluir NF?';
                          if(confirm(msg)) deleteNfMut.mutate({ nfId: nf.id, compraId: selectedCompra.id, isShared });
                        }}><Trash2 className="h-3 w-3"/></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Formulário NF */}
          {isNfFormOpen?(
            <Card className="bg-[#0a1020] border-white/5 text-white">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-bold text-primary font-display">{selectedNf?'Editar NF':'Adicionar NF'}</p>
                <div className="flex flex-col gap-2">
                  {/* Importar por XML */}
                  <div className="flex items-center gap-3 p-2.5 bg-[#0e1629]/50 rounded-lg border border-white/5 text-white/70">
                    <FileUp className="h-4 w-4 text-primary shrink-0"/>
                    <span className="text-xs text-white/50">Importar XML <span className="text-white/30">(NF-e · preenche os campos automaticamente)</span></span>
                    <input ref={nfXmlInputRef} type="file" accept=".xml" className="hidden" onChange={handleNfXml}/>
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs bg-primary/10 border-primary/30 hover:bg-primary/20 text-primary rounded-lg" onClick={()=>nfXmlInputRef.current?.click()} disabled={parsingNfXml}>
                      {parsingNfXml?<><Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>Lendo...</>:'Selecionar XML'}
                    </Button>
                  </div>
                  {/* Importar por PDF */}
                  <div className="flex items-center gap-3 p-2.5 bg-[#0e1629]/50 rounded-lg border border-white/5 text-white/70">
                    <FileUp className="h-4 w-4 text-white/30 shrink-0"/>
                    <span className="text-xs text-white/40">Importar PDF <span className="text-white/25">(extrai texto · menos preciso)</span></span>
                    <input ref={nfPdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handleNfPdf}/>
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs bg-white/5 border-white/10 hover:bg-white/10 text-white/60 rounded-lg" onClick={()=>nfPdfInputRef.current?.click()} disabled={parsingNfPdf}>
                      {parsingNfPdf?<><Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>Lendo...</>:'Selecionar PDF'}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-2">
                  {[
                    {label:'Espécie',field:'especie',type:'select',opts:['NF-e','CT-e','NFS-e','NFS-e/DPS']},
                    {label:'Número NF',field:'livro_numero',type:'text'},
                    {label:'Série',field:'livro_serie',type:'text'},
                    {label:'Valor NF (R$)',field:'valor_nf',type:'number'},
                    {label:'Data Emissão',field:'livro_data_doc',type:'date'},
                    {label:'Data Entrada',field:'livro_data_entrada',type:'date'},
                    {label:'CNPJ Emitente',field:'livro_cnpj_emitente',type:'text'},
                    {label:'UF',field:'livro_uf',type:'text'},
                    {label:'Valor Contábil',field:'livro_valor_contabil',type:'number'},
                    {label:'CFOP',field:'livro_cfop',type:'text'},
                    {label:'ICMS/ISS',field:'livro_imposto',type:'select',opts:['ICMS','ISS','-']},
                    {label:'Código (a)',field:'livro_cod_fiscal',type:'select',opts:['1','2','3']},
                    {label:'Base de Cálculo',field:'livro_base_calculo',type:'number'},
                    {label:'Alíquota (%)',field:'livro_aliquota',type:'number'},
                    {label:'Imp. Creditado',field:'livro_imp_creditado',type:'number'},
                    {label:'Vínculo',field:'vinculo',type:'select',opts:VINCULO_OPTIONS.map(v=>v.value),optLabels:VINCULO_OPTIONS.map(v=>v.label)},
                  ].map(({label,field,type,opts,optLabels}:any)=>(
                    <div key={field} className="space-y-1">
                      <Label className="text-[8px] uppercase tracking-wider text-white/40 font-bold">{label}</Label>
                      {type==='select'?(
                        <Select value={(nfForm as any)[field]||''} onValueChange={v=>setNfForm(f=>({...f,[field]:v}))}>
                          <SelectTrigger className="text-xs h-8 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg"><SelectValue/></SelectTrigger>
                          <SelectContent>{(opts||[]).map((o:string,i:number)=><SelectItem key={o} value={o}>{optLabels?optLabels[i]:o}</SelectItem>)}</SelectContent>
                        </Select>
                      ):(
                        <Input type={type} step={type==='number'?'0.01':undefined} value={(nfForm as any)[field]||''} onChange={e=>setNfForm(f=>({...f,[field]:e.target.value}))} className="text-xs h-8 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg"/>
                      )}
                    </div>
                  ))}
                  <div className="col-span-4 space-y-1">
                    <Label className="text-[8px] uppercase tracking-wider text-white/40 font-bold">Link da NF</Label>
                    <Input value={(nfForm as any).link_nf||''} onChange={e=>setNfForm(f=>({...f,link_nf:e.target.value} as any))} placeholder="URL ou caminho" className="text-xs h-8 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg"/>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-lg" onClick={()=>{setIsNfFormOpen(false);setSelectedNf(null);}}>Cancelar</Button>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-white rounded-lg" onClick={handleSaveNf} disabled={saveNfMut.isPending}>{saveNfMut.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:'Salvar NF'}</Button>
                </div>
              </CardContent>
            </Card>
          ):(
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-lg" onClick={()=>{setSelectedNf(null);setNfForm({...emptyNfForm(),livro_cnpj_emitente:selectedCompra?.fornecedor_cnpj||''});setIsNfFormOpen(true);}}>
                <Plus className="h-4 w-4 mr-1.5"/>Adicionar NF
              </Button>
              <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-amber-400 hover:text-amber-300 rounded-lg" onClick={()=>{setIsLinkNfOpen(true);}}>
                <Link2 className="h-4 w-4 mr-1.5"/>Vincular NF existente
              </Button>
            </div>
          )}

          <DialogFooter className="mt-3">
            <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-lg" onClick={()=>setIsNfOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ DIALOG: Vincular NF Existente ══════ */}
      <Dialog open={isLinkNfOpen} onOpenChange={v => { if (!v) { setIsLinkNfOpen(false); setLinkNfSearch(''); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white font-display font-bold">
              <Link2 className="h-5 w-5 text-amber-400" />
              Vincular Nota Fiscal de outro Lançamento
            </DialogTitle>
          </DialogHeader>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="Buscar por número, fornecedor ou valor..."
              value={linkNfSearch}
              onChange={e => setLinkNfSearch(e.target.value)}
              className="pl-9 bg-[#0e1629] border-white/10 text-white text-xs h-9 focus-visible:ring-primary rounded-lg"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/5 max-h-[50vh]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0a1020] text-white/30 text-[9px] uppercase">
                  {['Número', 'Fornecedor', 'Valor NF', 'Vinculada a', 'Ação'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(() => {
                  let list = allNfsOfObra.filter((nf: any) => {
                    const isLinked = nf.vinculosCom?.some((vc: any) => vc.id === selectedCompra?.id);
                    return !isLinked;
                  });

                  if (linkNfSearch.trim()) {
                    const t = linkNfSearch.toLowerCase();
                    list = list.filter((nf: any) =>
                      (nf.livro_numero || '').toLowerCase().includes(t) ||
                      (nf.livro_cnpj_emitente || '').toLowerCase().includes(t) ||
                      (nf.valor_nf || 0).toString().includes(t) ||
                      (nf.vinculosCom || []).some((vc: any) =>
                        (vc.fornecedor_nome || '').toLowerCase().includes(t) ||
                        (vc.email_titulo || '').toLowerCase().includes(t)
                      )
                    );
                  }

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-white/30">
                          Nenhuma outra NF encontrada.
                        </td>
                      </tr>
                    );
                  }

                  return list.map((nf: any) => (
                    <tr key={nf.id} className="bg-[#0e1629] hover:bg-[#111d35]">
                      <td className="px-3 py-2 font-mono font-bold">{nf.livro_numero || 'S/N'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-white/60">
                        {nf.livro_cnpj_emitente || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-emerald-400 font-bold">{fmt(nf.valor_nf)}</td>
                      <td className="px-3 py-2 text-white/40 max-w-[200px] truncate">
                        {(nf.vinculosCom || []).map((vc: any) => 
                          `${vc.email_titulo || 'Lançamento'} (${fmt(vc.valor_pago)})`
                        ).join(', ')}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 hover:border-primary/40 text-primary text-[10px] h-7 rounded-lg font-bold"
                          onClick={() => {
                            if (selectedCompra) {
                              linkNfMut.mutate({ nfId: nf.id, compraId: selectedCompra.id });
                            }
                          }}
                          disabled={linkNfMut.isPending}
                        >
                          Vincular
                        </Button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          <DialogFooter className="mt-3">
            <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-lg" onClick={() => setIsLinkNfOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para "Entrar em estoque" */}
      <Dialog open={isEstoqueOpen} onOpenChange={(open) => { if (!open) resetEstoqueForm(); setIsEstoqueOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#161f30] text-white border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white font-display font-bold">
              <Boxes className="h-5 w-5 text-primary" />
              Enviar Compra para o Estoque (Pendente)
            </DialogTitle>
          </DialogHeader>

          {selectedCompra && (
            <div className="bg-[#0e1629] p-4 rounded-xl border border-white/5 space-y-2 mb-4 text-xs">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-white/40 uppercase tracking-wider font-bold text-[9px]">Solicitação / Título</p>
                  <p className="text-white font-medium text-sm mt-0.5">{selectedCompra.email_titulo || 'Sem título'}</p>
                </div>
                <Badge className="bg-primary/20 text-primary border-primary/20 shrink-0 font-medium">
                  {selectedCompra.tipo_solicitacao || 'Compra'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                <div>
                  <p className="text-white/40 uppercase tracking-wider font-bold text-[9px]">Fornecedor</p>
                  <p className="text-white font-medium mt-0.5">{selectedCompra.fornecedor_nome || 'Não informado'}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase tracking-wider font-bold text-[9px]">Valor Pago / Solicitado</p>
                  <p className="text-white font-medium mt-0.5">
                    {selectedCompra.valor_pago ? `R$ ${Number(selectedCompra.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 
                     (selectedCompra.valor_solicitado ? `R$ ${Number(selectedCompra.valor_solicitado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00')}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                <Button 
                  size="sm" 
                  className="w-full bg-info/20 hover:bg-info/30 text-info border border-info/50 text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 font-bold" 
                  onClick={() => {
                    setIsEstoqueOpen(false);
                    setXmlOpen(true);
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Importar Itens da Nota por XML
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white/60 text-xs py-2 rounded-xl flex items-center justify-center gap-1.5"
                  onClick={() => estoquePdfInputRef.current?.click()}
                  disabled={parsingEstoquePdf}
                >
                  {parsingEstoquePdf
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Lendo PDF...</>
                    : <><FileUp className="h-4 w-4" />Importar Valor pelo PDF</>}
                </Button>
                <input ref={estoquePdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handleEstoquePdf} />
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Seletor de Produto */}
            <div className="space-y-2 relative">
              <Label className="text-xs font-semibold text-white/80">Produto no Estoque</Label>
              
              {!estoqueForm.produto_id && !estoqueForm.isNewProduct ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    ref={estoqueProductInputRef}
                    placeholder="Buscar produto cadastrado ou digitar para criar novo..."
                    value={estoqueSearch}
                    onChange={(e) => {
                      setEstoqueSearch(e.target.value);
                      setShowEstoqueProdList(true);
                    }}
                    onFocus={() => setShowEstoqueProdList(true)}
                    className="pl-9 h-10 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs"
                    autoComplete="off"
                  />

                  {showEstoqueProdList && (
                    <div ref={estoqueProductListRef} className="absolute z-50 w-full mt-1 bg-[#0e1629] border border-white/10 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                      {produtos
                        .filter((p: any) => !p.nome.startsWith('[FERRAMENTA]'))
                        .filter((p: any) => p.nome.toLowerCase().includes(estoqueSearch.toLowerCase()))
                        .map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-3 text-xs border-b border-white/5"
                            onClick={() => {
                              setEstoqueForm(f => ({ ...f, produto_id: p.id }));
                              setEstoqueSearch(p.nome);
                              setShowEstoqueProdList(false);
                            }}
                          >
                            <Boxes className="h-4 w-4 text-white/40 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-white truncate">{p.nome}</span>
                              <span className="text-[10px] text-white/40 truncate">
                                Unidade: {p.unidade} {p.categoria && `• Categoria: ${p.categoria}`}
                              </span>
                            </div>
                          </button>
                        ))}
                      
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-primary/10 transition-colors flex items-center gap-2 text-xs text-primary font-medium border-t border-white/10"
                        onClick={() => {
                          setEstoqueForm(f => ({ ...f, isNewProduct: true, newProductNome: estoqueSearch }));
                          setShowEstoqueProdList(false);
                        }}
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        {estoqueSearch ? `Cadastrar "${estoqueSearch}" como novo produto` : 'Cadastrar novo produto'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-[#0e1629]">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {estoqueForm.isNewProduct ? <Plus className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-white">
                        {estoqueForm.isNewProduct ? `Novo: ${estoqueForm.newProductNome || 'Sem Nome'}` : produtos.find((p: any) => p.id === estoqueForm.produto_id)?.nome}
                      </p>
                      {!estoqueForm.isNewProduct && (
                        <p className="text-[10px] text-white/40 mt-0.5">
                          Unidade: {produtos.find((p: any) => p.id === estoqueForm.produto_id)?.unidade}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-white/40 hover:text-white hover:bg-white/5"
                    onClick={() => {
                      setEstoqueForm(f => ({
                        ...f,
                        produto_id: '',
                        isNewProduct: false,
                        newProductNome: ''
                      }));
                      setEstoqueSearch('');
                    }}
                  >
                    Trocar
                  </Button>
                </div>
              )}
            </div>

            {/* Campos de novo produto se aplicável */}
            {estoqueForm.isNewProduct && (
              <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/20 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 border-b border-primary/10 pb-2 mb-1">
                  <Boxes className="h-4 w-4 text-primary" />
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Dados do Novo Produto</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-white/60">Nome do Produto *</Label>
                  <Input
                    placeholder="Ex: Cimento CP II 50kg"
                    value={estoqueForm.newProductNome}
                    onChange={(e) => setEstoqueForm(f => ({ ...f, newProductNome: e.target.value }))}
                    className="h-9 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-white/60">Unidade</Label>
                    <Select
                      value={estoqueForm.newProductUnidade}
                      onValueChange={(v) => setEstoqueForm(f => ({ ...f, newProductUnidade: v }))}
                    >
                      <SelectTrigger className="h-9 bg-[#0e1629] border-white/10 text-white rounded-lg text-xs focus:ring-primary">
                        <SelectValue placeholder="Selecione a unidade" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#161f30] border-white/10 text-white">
                        {['un', 'kg', 'm', 'm2', 'm3', 'l', 'saco', 'barra', 'par', 'mão', 'caixa', 'rolo', 'lata', 'balde'].map((u) => (
                          <SelectItem key={u} value={u} className="text-xs hover:bg-white/5 focus:bg-white/5 focus:text-white">{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-white/60">Categoria</Label>
                    <Select
                      value={estoqueForm.newProductCategoria}
                      onValueChange={(v) => setEstoqueForm(f => ({ ...f, newProductCategoria: v }))}
                    >
                      <SelectTrigger className="h-9 bg-[#0e1629] border-white/10 text-white rounded-lg text-xs focus:ring-primary">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#161f30] border-white/10 text-white max-h-48 overflow-y-auto">
                        {['Hidráulica', 'Elétrica', 'Esgoto', 'Estrutural', 'Alvenaria', 'Acabamento', 'Pintura', 'Ferramentas', 'Segurança (EPI)', 'Marcenaria', 'Serralheria', 'Disco', 'Insumos', 'OUTROS'].map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs hover:bg-white/5 focus:bg-white/5 focus:text-white">{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-white/60">Localização</Label>
                    <Input
                      placeholder="Ex: Almoxarifado A"
                      value={estoqueForm.newProductLocalizacao}
                      onChange={(e) => setEstoqueForm(f => ({ ...f, newProductLocalizacao: e.target.value }))}
                      className="h-9 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-white/60">Estoque Mínimo</Label>
                    <Input
                      type="number"
                      value={estoqueForm.newProductEstoqueMinimo}
                      onChange={(e) => setEstoqueForm(f => ({ ...f, newProductEstoqueMinimo: e.target.value }))}
                      className="h-9 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Informações da Entrada */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-white/60">Quantidade a Entrar *</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={estoqueForm.quantidade}
                  onChange={(e) => setEstoqueForm(f => ({ ...f, quantidade: e.target.value }))}
                  className="h-10 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-white/60">Valor Unitário *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={estoqueForm.valor_unitario}
                  onChange={(e) => setEstoqueForm(f => ({ ...f, valor_unitario: e.target.value }))}
                  className="h-10 bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-white/60">Observação Interna</Label>
              <Textarea
                placeholder="Alguma observação sobre a compra ou entrega..."
                value={estoqueForm.observacao}
                onChange={(e) => setEstoqueForm(f => ({ ...f, observacao: e.target.value }))}
                className="bg-[#0e1629] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary rounded-lg text-xs min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-lg"
              onClick={() => {
                setIsEstoqueOpen(false);
                resetEstoqueForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white rounded-lg px-4"
              disabled={saveEntradaCompradaMut.isPending || (!estoqueForm.produto_id && !estoqueForm.isNewProduct) || !estoqueForm.quantidade || !estoqueForm.valor_unitario}
              onClick={() => {
                saveEntradaCompradaMut.mutate({
                  isNewProduct: estoqueForm.isNewProduct,
                  produto_id: estoqueForm.produto_id,
                  newProduct: {
                    nome: estoqueForm.newProductNome,
                    unidade: estoqueForm.newProductUnidade,
                    categoria: estoqueForm.newProductCategoria,
                    localizacao: estoqueForm.newProductLocalizacao,
                    estoque_minimo: estoqueForm.newProductEstoqueMinimo,
                  },
                  quantidade: Number(estoqueForm.quantidade),
                  valor_unitario: Number(estoqueForm.valor_unitario),
                  compra: selectedCompra,
                  observacao: estoqueForm.observacao,
                });
              }}
            >
              {saveEntradaCompradaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Boxes className="h-4 w-4 mr-2" />}
              Enviar para Entradas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Livro Fiscal */}
      <GerarLivroFiscalDialog open={isLivroOpen} onOpenChange={setIsLivroOpen} initialRows={fiscalRows}/>

      {/* Importar XML Lançamento */}
      <ImportXmlComprasDialog 
        obraId={obraId} 
        open={xmlOpen} 
        onOpenChange={setXmlOpen} 
        compraToLink={selectedCompra} 
        onCancel={() => {
          if (selectedCompra) {
            setIsEstoqueOpen(true);
          }
        }} 
      />
    </div>
  );
}
