import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Clock, CheckCircle2, XCircle, FilePlus2, MessageSquare, ShieldAlert, Trash2, ChevronLeft, ChevronRight, Archive, ArchiveRestore, User, Calendar, Search, Pencil, LayoutGrid, List, Eye } from 'lucide-react';
import { toast } from 'sonner';
import SkeletonList from '@/components/SkeletonList';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/ui/switch';
import { useProfile } from '@/hooks/useProfile';
import ImageUpload from '@/components/ImageUpload';
import ImageThumbnail from '@/components/ImageThumbnail';
import emailjs from '@emailjs/browser';

const SOLICITACAO_CATEGORIES = [
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

const emptyForm = { titulo: '', classificacao: 'OUTROS', descricao: '', urgencia: 'Normal', destinatario_id: '', foto_url: '', data_necessidade: '' };

const columnsList = [
  { 
    id: 'SOLICITADO', 
    label: 'SOLICITADO', 
    dot: 'bg-slate-400',
    titleColor: 'text-slate-600',
    badgeColor: 'bg-slate-200/50 text-slate-700',
    colStyle: 'border-slate-200 bg-slate-50/50',
    progressBarColor: 'bg-slate-300',
    progressPercent: 25
  },
  { 
    id: 'APROVADO', 
    label: 'EM COTAÇÃO', 
    dot: 'bg-blue-500',
    titleColor: 'text-blue-600',
    badgeColor: 'bg-blue-100/60 text-blue-700',
    colStyle: 'border-blue-200 bg-blue-50/10',
    progressBarColor: 'bg-blue-500',
    progressPercent: 50
  },
  { 
    id: 'COMPRADO', 
    label: 'COMPRADO', 
    dot: 'bg-purple-500',
    titleColor: 'text-purple-600',
    badgeColor: 'bg-purple-100/60 text-purple-700',
    colStyle: 'border-purple-200 bg-purple-50/10',
    progressBarColor: 'bg-purple-500',
    progressPercent: 75
  },
  { 
    id: 'ENTREGUE', 
    label: 'CONCLUÍDO', 
    dot: 'bg-emerald-500',
    titleColor: 'text-emerald-600',
    badgeColor: 'bg-emerald-100/60 text-emerald-700',
    colStyle: 'border-emerald-500 bg-emerald-50/10',
    progressBarColor: 'bg-emerald-500',
    progressPercent: 100
  },
];

const formatUserDisplay = (userObj: any) => {
  if (!userObj) return 'Desconhecido';
  if (userObj.apelido) return userObj.apelido;
  const email = userObj.email;
  if (!email) return 'Desconhecido';
  const name = email.split('@')[0].split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
};

export default function SolicitacoesTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, profile } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showMyAssignedOnly, setShowMyAssignedOnly] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [observacao, setObservacao] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [newComentario, setNewComentario] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const handleEditClick = (s: any) => {
    setForm({
      titulo: s.titulo || '',
      classificacao: s.classificacao || 'OUTROS',
      destinatario_id: s.destinatario_id || '',
      descricao: s.descricao_materiais || '',
      urgencia: s.urgencia || 'Normal',
      foto_url: s.foto_url || '',
      data_necessidade: s.data_necessidade || '',
    });
    setEditingId(s.id);
    setDialogOpen(true);
  };
  const [selectedProdutoId, setSelectedProdutoId] = useState('');
  const [selectedQtd, setSelectedQtd] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showProductList, setShowProductList] = useState(false);

  useEffect(() => {
    if (!dialogOpen) {
      setSelectedProdutoId('');
      setSelectedQtd('');
      setProductSearch('');
      setShowProductList(false);
    }
  }, [dialogOpen]);

  const { data: usuarios = [] } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, approved, apelido')
        .eq('approved', true)
        .order('email');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, unidade')
        .eq('obra_id', obraId)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!obraId,
  });

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ['solicitacoes', obraId],
    queryFn: async () => {
      const fetchWithoutComments = async () => {
        const { data, error } = await supabase
          .from('solicitacoes_material' as any)
          .select(`
            *,
            solicitante:profiles!solicitacoes_material_solicitante_id_fkey(email, apelido),
            destinatario:profiles!solicitacoes_material_destinatario_id_fkey(email, apelido),
            aprovador:profiles!solicitacoes_material_aprovador_id_fkey(email, apelido)
          `)
          .eq('obra_id', obraId)
          .order('data_solicitacao', { ascending: false });
        if (error) throw error;
        return data || [];
      };

      try {
        const { data, error } = await supabase
          .from('solicitacoes_material' as any)
          .select(`
            *,
            solicitante:profiles!solicitacoes_material_solicitante_id_fkey(email, apelido),
            destinatario:profiles!solicitacoes_material_destinatario_id_fkey(email, apelido),
            aprovador:profiles!solicitacoes_material_aprovador_id_fkey(email, apelido),
            comentarios_solicitacoes(id)
          `)
          .eq('obra_id', obraId)
          .order('data_solicitacao', { ascending: false });
        
        if (error) {
          if (error.code === 'PGRST116' || error.message?.includes('comentarios_solicitacoes') || error.message?.includes('relation')) {
            return fetchWithoutComments();
          }
          throw error;
        }
        return data || [];
      } catch (err) {
        return fetchWithoutComments();
      }
    },
    enabled: !!obraId,
  });

  useEffect(() => {
    if (!obraId) return;
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channel = supabase.channel(`solicitacoes-changes-${obraId}-${uniqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_material', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        obra_id: obraId,
        solicitante_id: user?.id,
        destinatario_id: form.destinatario_id,
        descricao_materiais: form.descricao,
        urgencia: form.urgencia,
        status: 'SOLICITADO',
        foto_url: form.foto_url || null,
        data_necessidade: form.data_necessidade || null,
        titulo: form.titulo || null,
        classificacao: form.classificacao || 'OUTROS'
      };
      
      const { error } = await supabase.from('solicitacoes_material' as any).insert(payload);
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'CADASTRAR',
        entidade: 'SOLICITACAO',
        detalhes: `Nova solicitação de material criada`
      });

      try {
        const recipient = usuarios.find((u: any) => u.id === form.destinatario_id);
        console.log('EmailJS Debug:', {
          destinatario_id: form.destinatario_id,
          usuariosCount: usuarios.length,
          recipient: recipient,
          email_destino: recipient?.email,
          profile: profile
        });

        const formattedDate = form.data_necessidade 
          ? form.data_necessidade.split('-').reverse().join('/')
          : 'Não informada';

        const templateParams = {
          email_destino: recipient?.email || '', 
          to_email: recipient?.email || '', // Fallback para a variável padrão do EmailJS
          email: recipient?.email || '',
          to: recipient?.email || '',
          destinatario: recipient?.email || '',
          destinatario_email: recipient?.email || '',
          usuario_destino: recipient ? formatUserDisplay(recipient) : 'Almoxarifado', 
          to_name: recipient ? formatUserDisplay(recipient) : 'Almoxarifado', // Fallback para a variável padrão do EmailJS
          obra_nome: 'Casa N&J - Preá, Ceará', 
          prioridade: form.urgencia.toUpperCase(),
          material_detalhes: form.descricao,
          data_entrega: formattedDate,
          usuario_remetente: formatUserDisplay(profile || { email: user?.email }),
          from_name: formatUserDisplay(profile || { email: user?.email }), // Fallback para a variável padrão do EmailJS
          app_url: window.location.origin,
          url: window.location.origin,
          link: window.location.origin,
          app_link: window.location.origin
        };

        await emailjs.send(
          'service_z0x3gv8',
          'template_i77h8pk',
          templateParams,
          {
            publicKey: 'uUAL8xHI-jKaqRpuy'
          }
        );
      } catch (err: any) {
        console.error('Erro ao enviar e-mail via EmailJS:', err);
        throw new Error(`EMAIL_SEND_FAILED: ${err?.text || err?.message || err || 'Erro desconhecido'}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success('Solicitação enviada com sucesso!');
    },
    onError: (e: any) => {
      if (e.message && e.message.startsWith('EMAIL_SEND_FAILED:')) {
        const details = e.message.replace('EMAIL_SEND_FAILED: ', '');
        queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
        setDialogOpen(false);
        setForm(emptyForm);
        toast.warning(`Solicitação salva, mas falhou ao enviar e-mail: ${details}`);
      } else {
        toast.error(e.message);
      }
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, obs, currentDates }: { id: string, status: string, obs: string, currentDates?: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const updateData: any = { status, observacao_resposta: obs };

      if (status === 'SOLICITADO') {
        updateData.data_aprovado = null;
        updateData.data_comprado = null;
        updateData.data_entregue = null;
        updateData.aprovador_id = null;
      } else if (status === 'APROVADO') {
        updateData.data_aprovado = currentDates?.data_aprovado || now;
        updateData.data_comprado = null;
        updateData.data_entregue = null;
      } else if (status === 'COMPRADO') {
        updateData.data_aprovado = currentDates?.data_aprovado || now;
        updateData.data_comprado = currentDates?.data_comprado || now;
        updateData.data_entregue = null;
      } else if (status === 'ENTREGUE') {
        updateData.data_aprovado = currentDates?.data_aprovado || now;
        updateData.data_comprado = currentDates?.data_comprado || now;
        updateData.data_entregue = currentDates?.data_entregue || now;
      }

      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update(updateData)
        .eq('id', id);
        
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: `Status da solicitação alterado para ${status}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setStatusDialogOpen(false);
      setSelectedSolicitacao(null);
      setObservacao('');
      toast.success('Status atualizado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: comentarios = [], refetch: refetchComentarios } = useQuery({
    queryKey: ['comentarios-solicitacao', selectedSolicitacao?.id],
    queryFn: async () => {
      if (!selectedSolicitacao?.id) return [];
      try {
        const { data, error } = await supabase
          .from('comentarios_solicitacoes' as any)
          .select('*')
          .eq('solicitacao_id', selectedSolicitacao.id)
          .order('created_at', { ascending: true });
        
        if (error) {
          if (error.code === 'PGRST116' || error.message?.includes('comentarios_solicitacoes') || error.message?.includes('relation')) {
            console.warn("Comentarios table not created yet, returning empty comments");
            return [];
          }
          throw error;
        }
        return data || [];
      } catch (e) {
        return [];
      }
    },
    enabled: !!selectedSolicitacao?.id
  });

  const addComentario = useMutation({
    mutationFn: async (texto: string) => {
      if (!selectedSolicitacao?.id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar o apelido do usuário
      const { data: profileData } = await supabase
        .from('profiles')
        .select('apelido, email')
        .eq('id', user.id)
        .single();

      const usuarioNome = profileData?.apelido || profileData?.email?.split('@')[0] || "Usuário";

      const { error } = await supabase
        .from('comentarios_solicitacoes' as any)
        .insert({
          solicitacao_id: selectedSolicitacao.id,
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          texto: texto
        });

      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: `Adicionou um comentário na solicitação: "${texto.substring(0, 100)}"`
      });
    },
    onSuccess: () => {
      refetchComentarios();
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setNewComentario('');
      toast.success("Comentário adicionado!");
    },
    onError: (e: any) => toast.error(e.message)
  });

  const toggleAprovacao = useMutation({
    mutationFn: async ({ id, checked }: { id: string, checked: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const aprovador_id = checked ? user?.id : null;
      const now = new Date().toISOString();
      const data_aprovado = checked ? now : null;
      
      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update({ 
          aprovador_id,
          data_aprovado
        })
        .eq('id', id);
        
      if (error) throw error;
      
      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: checked ? 'Aprovou a solicitação' : 'Removeu a aprovação da solicitação'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      toast.success('Aprovação atualizada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editSolicitacao = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        destinatario_id: form.destinatario_id,
        descricao_materiais: form.descricao,
        urgencia: form.urgencia,
        foto_url: form.foto_url || null,
        data_necessidade: form.data_necessidade || null,
        titulo: form.titulo || null,
        classificacao: form.classificacao || 'OUTROS'
      };

      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update(payload)
        .eq('id', editingId);

      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: `Solicitação de material editada`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success('Solicitação atualizada com sucesso!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSolicitacao = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch request details before deletion to preserve description and comments in logs
      const { data: reqData } = await supabase
        .from('solicitacoes_material')
        .select('*, profiles!solicitacoes_material_solicitante_id_fkey(email, apelido)')
        .eq('id', id)
        .maybeSingle();

      // Fetch comments to preserve in logs before deletion cascade
      let commData: any[] = [];
      try {
        const { data, error } = await supabase
          .from('comentarios_solicitacoes' as any)
          .select('*')
          .eq('solicitacao_id', id)
          .order('created_at', { ascending: true });
        if (!error && data) {
          commData = data;
        }
      } catch (e) {
        console.warn("Could not fetch comments before delete:", e);
      }

      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .delete()
        .eq('id', id);
        
      if (error) throw error;

      let detalhesLog = 'Solicitação de material excluída';
      if (reqData) {
        const solicitanteNome = reqData.profiles?.apelido || reqData.profiles?.email || 'desconhecido';
        const titleOrDesc = reqData.titulo || reqData.descricao_materiais;
        const cleanTitle = titleOrDesc.replace(/\n/g, ' ').substring(0, 100);
        
        detalhesLog = `Solicitação "${cleanTitle}" de ${solicitanteNome} excluída. Materiais: ${reqData.descricao_materiais}. Urgência: ${reqData.urgencia || 'Normal'}.`;
        if (reqData.observacao_resposta) {
          detalhesLog += ` Obs Resposta: ${reqData.observacao_resposta}`;
        }
        if (commData && commData.length > 0) {
          const formattedComments = commData.map(c => `${c.usuario_nome}: ${c.texto}`).join(' | ');
          detalhesLog += ` Comentários: [${formattedComments}]`;
        }
      }

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'SOLICITACAO',
        detalhes: detalhesLog
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      setDeleteId(null);
      toast.success('Solicitação excluída com sucesso!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, arquivado }: { id: string; arquivado: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('solicitacoes_material' as any)
        .update({ arquivado } as any)
        .eq('id', id);
      
      if (error) throw error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EDITAR',
        entidade: 'SOLICITACAO',
        detalhes: arquivado ? `Solicitação arquivada` : `Solicitação desarquivada`
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes', obraId] });
      toast.success(variables.arquivado ? 'Solicitação arquivada!' : 'Solicitação restaurada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = solicitacoes.filter((s: any) => {
    const matchesSearch = searchTerms.every(term =>
      (s.titulo && s.titulo.toLowerCase().includes(term)) ||
      (s.classificacao && s.classificacao.toLowerCase().includes(term)) ||
      s.descricao_materiais.toLowerCase().includes(term) || 
      (s.solicitante?.email && s.solicitante.email.toLowerCase().includes(term)) ||
      (s.solicitante?.apelido && s.solicitante.apelido.toLowerCase().includes(term))
    );
    const matchesArchived = showArchived ? s.arquivado === true : !s.arquivado;
    const matchesAssigned = showMyAssignedOnly ? s.destinatario_id === user?.id : true;
    const matchesStatus = statusFilter === 'todos' ? true : s.status === statusFilter;
    return matchesSearch && matchesArchived && matchesAssigned && matchesStatus;
  });

  const statusBadge = (s: any) => {
    const status = s.status;
    const hasAprovador = !!s.aprovador_id;
    
    switch (status) {
      case 'SOLICITADO': 
        if (hasAprovador) {
          return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Aprovado</Badge>;
        }
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Solicitado</Badge>;
      case 'APROVADO': 
        return <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20"><FileText className="w-3 h-3 mr-1" /> Em Cotação</Badge>;
      case 'COMPRADO': 
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20"><ShoppingCart className="w-3 h-3 mr-1" /> Comprado</Badge>;
      case 'ENTREGUE': 
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Entregue</Badge>;
      default: 
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const urgenciaBadge = (urgencia: string) => {
    switch (urgencia) {
      case 'Baixa': return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2.5 py-1 rounded-lg bg-slate-100">Baixa</span>;
      case 'Normal': return <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 px-2.5 py-1 rounded-lg bg-blue-50">Normal</span>;
      case 'Alta': return <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 px-2.5 py-1 rounded-lg bg-amber-50">Alta</span>;
      case 'Urgente': return <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 animate-pulse">Urgente</span>;
      default: return null;
    }
  };

  const openStatusDialog = (solicitacao: any) => {
    setSelectedSolicitacao(solicitacao);
    setNewStatus(solicitacao.status);
    setObservacao(solicitacao.observacao_resposta || '');
    setStatusDialogOpen(true);
  };

  const renderKanban = () => {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 pb-6 items-start">
        {columnsList.map(col => {
          const items = filtered.filter((s: any) => s.status === col.id);
          return (
            <div 
              key={col.id} 
              className={`w-full border-2 rounded-[2rem] p-5 space-y-4 flex flex-col min-h-[480px] max-h-[80vh] md:max-h-[calc(100vh-250px)] overflow-y-auto ${col.colStyle}`}
            >
              {/* Header with Title and Counter */}
              <div className="flex items-center justify-between pb-3 shrink-0">
                <span className={`font-display font-black text-xs tracking-wider ${col.titleColor}`}>{col.label}</span>
                <span className={`font-display font-bold text-xs h-6 min-w-6 flex items-center justify-center px-1.5 rounded-full ${col.badgeColor}`}>
                  {items.length}
                </span>
              </div>

              {/* Card List */}
              <div className="space-y-4 flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-white/40 border border-dashed border-slate-200/80 rounded-2xl">
                    <p className="text-xs font-semibold text-slate-400">Sem solicitações</p>
                  </div>
                ) : (
                  items.map((s: any) => (
                    <Card 
                      key={s.id} 
                      onClick={() => openStatusDialog(s)}
                      className="border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 bg-white overflow-hidden relative group cursor-pointer"
                    >
                      {/* Urgency side indicator stripe */}
                      {s.urgencia === 'Urgente' && <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>}
                      {s.urgencia === 'Alta' && <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>}
                      {s.urgencia === 'Normal' && <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>}
                      {s.urgencia === 'Baixa' && <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-300"></div>}
                      
                      <CardContent className="p-4 pl-5.5 space-y-3">
                        {/* Title and Image */}
                        <div className="flex gap-3 min-w-0">
                          {s.foto_url && (
                            <ImageThumbnail src={s.foto_url} alt="Material solicitado" type="produto" size="sm" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-slate-800 leading-snug whitespace-pre-wrap break-words">{s.titulo || s.descricao_materiais}</h4>
                            {s.titulo && s.classificacao && (
                              <span className="inline-block text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold uppercase mt-1">
                                {s.classificacao}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Metadata Rows (User & Calendar) */}
                        <div className="space-y-1.5 text-[10px] text-slate-500">
                          {s.data_necessidade && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                              <span className="truncate">Para: <strong className="text-blue-600 font-semibold">{new Date(s.data_necessidade).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</strong></span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">De: <strong className="text-slate-700 font-semibold">{formatUserDisplay(s.solicitante)}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">Para: <strong className="text-slate-700 font-semibold">{formatUserDisplay(s.destinatario)}</strong></span>
                          </div>
                          {s.comentarios_solicitacoes && s.comentarios_solicitacoes.length > 0 && (
                            <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50/50 px-2 py-1 rounded-lg w-fit mt-1 border border-blue-100/30">
                              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                              <span className="font-bold text-[10px]">{s.comentarios_solicitacoes.length} {s.comentarios_solicitacoes.length === 1 ? 'comentário' : 'comentários'}</span>
                            </div>
                          )}
                        </div>

                        {/* Checkbox de Aprovação */}
                        {s.status === 'SOLICITADO' && (
                          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              id={`approve-${s.id}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={!!s.aprovador_id}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleAprovacao.mutate({ id: s.id, checked: e.target.checked });
                              }}
                              disabled={toggleAprovacao.isPending}
                            />
                            <label htmlFor={`approve-${s.id}`} className="text-xs font-semibold text-slate-700 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                              Aprovado
                            </label>
                          </div>
                        )}
                        {s.aprovador_id && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                            <CheckCircle2 className="h-3 w-3 text-blue-500 shrink-0" />
                            <span className="truncate">Aprovado por: <strong>{formatUserDisplay(s.aprovador)}</strong></span>
                          </div>
                        )}

                        {/* Observação da resposta (se houver) */}
                        {s.observacao_resposta && (
                          <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-2.5 text-[10px] text-slate-600 italic">
                            <strong className="block text-slate-700 font-bold not-italic mb-0.5">Obs:</strong>
                            {s.observacao_resposta}
                          </div>
                        )}

                        {/* Card Footer Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100/60 mt-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md disabled:opacity-20 transition-all"
                              disabled={col.id === 'SOLICITADO'}
                              onClick={(e) => {
                                e.stopPropagation();
                                const prevStatus = columnsList[columnsList.findIndex(c => c.id === col.id) - 1].id;
                                updateStatus.mutate({ 
                                  id: s.id, 
                                  status: prevStatus, 
                                  obs: s.observacao_resposta || '',
                                  currentDates: {
                                    data_aprovado: s.data_aprovado,
                                    data_comprado: s.data_comprado,
                                    data_entregue: s.data_entregue
                                  }
                                });
                              }}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md disabled:opacity-20 transition-all"
                              disabled={col.id === 'ENTREGUE' || (col.id === 'SOLICITADO' && !s.aprovador_id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextStatus = columnsList[columnsList.findIndex(c => c.id === col.id) + 1].id;
                                updateStatus.mutate({ 
                                  id: s.id, 
                                  status: nextStatus, 
                                  obs: s.observacao_resposta || '',
                                  currentDates: {
                                    data_aprovado: s.data_aprovado,
                                    data_comprado: s.data_comprado,
                                    data_entregue: s.data_entregue
                                  }
                                });
                              }}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] font-bold px-1.5 rounded-md hover:bg-slate-50 text-slate-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                openStatusDialog(s);
                              }}
                            >
                              Status
                            </Button>
                            {s.status === 'SOLICITADO' && !s.aprovador_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] font-bold px-1.5 rounded-md hover:bg-slate-50 text-slate-500 flex items-center gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(s);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                            )}
                            {s.status === 'ENTREGUE' && !s.arquivado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveMutation.mutate({ id: s.id, arquivado: true });
                                }}
                                title="Arquivar"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {s.arquivado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50/5 rounded-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveMutation.mutate({ id: s.id, arquivado: false });
                                }}
                                title="Desarquivar"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteId(s.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderList = () => {
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200">
              <th className="px-4 py-3 font-semibold rounded-l-2xl w-10">Nº</th>
              <th className="px-4 py-3 font-semibold min-w-[200px] w-[35%]">Título</th>
              <th className="px-4 py-3 font-semibold min-w-[180px] w-[25%]">Conteúdo (Materiais)</th>
              <th className="px-3 py-3 font-semibold w-18">De/Para</th>
              <th className="px-4 py-3 font-semibold w-20">Status</th>
              <th className="px-4 py-3 font-semibold w-20">Urgência</th>
              <th className="px-3 py-3 font-semibold w-12">Prazo</th>
              <th className="px-4 py-3 font-semibold text-center rounded-r-2xl w-32">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 font-semibold bg-white/40">
                  Nenhuma solicitação encontrada.
                </td>
              </tr>
            ) : (
              filtered.map((s: any) => {
                const colIdx = columnsList.findIndex(c => c.id === s.status);
                return (
                  <tr key={s.id} onClick={() => openStatusDialog(s)} className="bg-white hover:bg-slate-50/50 transition-colors cursor-pointer group">
                    <td className="px-4 py-3.5 font-bold text-slate-700 whitespace-nowrap text-[11px] w-10">
                      {s.numero ? `#${String(s.numero).padStart(4, '0')}` : '—'}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900 text-sm min-w-[200px]" title={s.titulo || 'Sem Título'}>
                      {s.titulo || <span className="text-slate-400 italic font-normal">Sem Título</span>}
                    </td>
                    <td 
                      className="px-4 py-3.5 max-w-[240px]" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setExpandedRows(prev => ({ ...prev, [s.id]: !prev[s.id] })); 
                      }}
                    >
                      {expandedRows[s.id] ? (
                        <div className="space-y-2 py-1">
                          <div className="font-medium text-slate-800 whitespace-pre-wrap break-words leading-normal bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs">
                            {s.descricao_materiais}
                          </div>
                          {s.foto_url && (
                            <div className="mt-1" onClick={e => e.stopPropagation()}>
                              <ImageThumbnail src={s.foto_url} alt="Material solicitado" type="produto" size="md" />
                            </div>
                          )}
                          {s.observacao_resposta && (
                            <div className="text-[10px] text-amber-600 font-semibold italic bg-amber-50/50 border border-amber-100 p-2 rounded-lg leading-normal">
                              Obs Resposta: {s.observacao_resposta}
                            </div>
                          )}
                          <span className="text-[9px] text-blue-600 hover:underline cursor-pointer font-bold block">Recolher</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-700 hover:text-blue-600 cursor-pointer font-medium transition-colors">
                          <span className="text-xs truncate max-w-[200px] font-semibold">{s.descricao_materiais.split('\n')[0]}</span>
                          <Eye className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600 shrink-0" title="Ver mais" />
                          {s.descricao_materiais.split('\n').length > 1 && (
                            <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full shrink-0 border border-slate-200/50">
                              +{s.descricao_materiais.split('\n').length - 1}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-slate-600 w-18">
                      <div className="flex flex-col text-[10px] leading-tight select-none">
                        <span className="font-semibold text-slate-750"><span className="text-[8px] text-slate-400 font-black mr-0.5 uppercase">D:</span>{formatUserDisplay(s.solicitante)}</span>
                        <span className="font-semibold text-slate-755 mt-0.5"><span className="text-[8px] text-slate-400 font-black mr-0.5 uppercase">P:</span>{formatUserDisplay(s.destinatario)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {statusBadge(s)}
                        {s.status === 'SOLICITADO' && (
                          <div className="flex items-center gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              id={`approve-list-${s.id}`}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={!!s.aprovador_id}
                              onChange={(e) => {
                                toggleAprovacao.mutate({ id: s.id, checked: e.target.checked });
                              }}
                              disabled={toggleAprovacao.isPending}
                            />
                            <label htmlFor={`approve-list-${s.id}`} className="text-[10px] font-bold text-slate-500 cursor-pointer select-none">
                              Aprovar
                            </label>
                          </div>
                        )}
                        {s.aprovador_id && (
                          <span className="text-[9px] text-slate-500 font-semibold flex items-center gap-0.5 mt-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5 text-blue-500 shrink-0" />
                            {formatUserDisplay(s.aprovador)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {urgenciaBadge(s.urgencia)}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap font-bold text-slate-700 text-[10px] w-12">
                      {s.data_necessidade ? (
                        <span>
                          {(() => {
                            const dateOnly = s.data_necessidade.split('T')[0];
                            const parts = dateOnly.split('-');
                            if (parts.length === 3) {
                              return `${parts[2]}/${parts[1]}/${parts[0].substring(2)}`;
                            }
                            return new Date(s.data_necessidade).toLocaleDateString('pt-BR', {timeZone: 'UTC'}).substring(0, 8);
                          })()}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-20 transition-all"
                          disabled={s.status === 'SOLICITADO'}
                          onClick={() => {
                            const prevStatus = columnsList[colIdx - 1].id;
                            updateStatus.mutate({ 
                              id: s.id, 
                              status: prevStatus, 
                              obs: s.observacao_resposta || '',
                              currentDates: {
                                data_aprovado: s.data_aprovado,
                                data_comprado: s.data_comprado,
                                data_entregue: s.data_entregue
                              }
                            });
                          }}
                          title="Voltar Status"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-20 transition-all"
                          disabled={s.status === 'ENTREGUE' || (s.status === 'SOLICITADO' && !s.aprovador_id)}
                          onClick={() => {
                            const nextStatus = columnsList[colIdx + 1].id;
                            updateStatus.mutate({ 
                              id: s.id, 
                              status: nextStatus, 
                              obs: s.observacao_resposta || '',
                              currentDates: {
                                data_aprovado: s.data_aprovado,
                                data_comprado: s.data_comprado,
                                data_entregue: s.data_entregue
                              }
                            });
                          }}
                          title="Avançar Status"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 rounded-md relative ${
                            s.comentarios_solicitacoes?.length > 0 
                              ? 'text-primary hover:bg-primary/10' 
                              : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          onClick={() => openStatusDialog(s)}
                          title="Detalhes e Comentários"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {s.comentarios_solicitacoes?.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-white">
                              {s.comentarios_solicitacoes.length}
                            </span>
                          )}
                        </Button>

                        {s.status === 'SOLICITADO' && !s.aprovador_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                            onClick={() => handleEditClick(s)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {s.status === 'ENTREGUE' && !s.arquivado && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md"
                            onClick={() => archiveMutation.mutate({ id: s.id, arquivado: true })}
                            title="Arquivar"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {s.arquivado && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md"
                            onClick={() => archiveMutation.mutate({ id: s.id, arquivado: false })}
                            title="Desarquivar"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                            onClick={() => setDeleteId(s.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader 
            title="Solicitações" 
            count={solicitacoes.filter((s: any) => showArchived ? s.arquivado : !s.arquivado).length} 
            search={search} 
            onSearchChange={setSearch} 
            searchPlaceholder="Buscar por material ou solicitante..." 
            actionLabel="Solicitar Material" 
            onAction={() => { setForm(emptyForm); setDialogOpen(true); }} 
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2 select-none">
              <div className="flex items-center gap-2">
                <Switch 
                  id="show-archived" 
                  checked={showArchived} 
                  onCheckedChange={setShowArchived} 
                  className="data-[state=checked]:bg-primary bg-white/20 border-none"
                />
                <label htmlFor="show-archived" className="text-xs font-bold text-white/75 cursor-pointer uppercase tracking-wider">
                  Ver Solicitações Arquivadas
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('kanban')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                      viewMode === 'kanban' 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Kanban
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                      viewMode === 'list' 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    Lista
                  </button>
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-40 text-xs font-bold uppercase tracking-wider rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10 focus:ring-0">
                    <SelectValue placeholder="Status: Todos" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0e1629] border-white/10 text-white text-xs">
                    <SelectItem value="todos">Status: Todos</SelectItem>
                    <SelectItem value="SOLICITADO">Solicitado</SelectItem>
                    <SelectItem value="APROVADO">Em Cotação</SelectItem>
                    <SelectItem value="COMPRADO">Comprado</SelectItem>
                    <SelectItem value="ENTREGUE">Entregue</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant={showMyAssignedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowMyAssignedOnly(!showMyAssignedOnly)}
                  className={`text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                    showMyAssignedOnly 
                      ? 'bg-primary text-primary-foreground hover:bg-primary/95 border-none' 
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {showMyAssignedOnly ? "Mostrando: Endereçadas a Mim" : "Ver Minhas Solicitações"}
                </Button>
              </div>
            </div>
          </PageHeader>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Solicitados</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-amber-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'SOLICITADO' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Em Cotação</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-blue-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'APROVADO' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Comprados</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-purple-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'COMPRADO' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Entregues</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-emerald-400 leading-none">{solicitacoes.filter((s: any) => s.status === 'ENTREGUE' && (showArchived ? s.arquivado : !s.arquivado)).length}</span>
              </div>
           </div>
           
           <Button variant="outline" className="h-auto py-4 md:py-0 col-span-2 md:col-span-1 bg-primary/10 border-primary/20 text-primary flex flex-col items-center justify-center gap-1 hover:bg-primary/20 border-none transition-all hover:scale-105" onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
              <FilePlus2 className="h-5 w-5 opacity-90" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center">Novo Pedido</span>
           </Button>
         </div>
      </div>

      {isLoading ? (
        <SkeletonList />
      ) : viewMode === 'kanban' ? (
        renderKanban()
      ) : (
        renderList()
      )}

      {/* Nova Solicitação Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditingId(null);
          setForm(emptyForm);
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Solicitação de Material" : "Solicitar Material"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (editingId) { editSolicitacao.mutate(); } else { save.mutate(); } }} className="space-y-4 pt-4">
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Título da Solicitação *</label>
              <Input
                placeholder="Ex: Instalação Hidráulica Bloco A"
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                className="h-11 bg-background text-sm text-foreground"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Para quem enviar? *</label>
                <Select value={form.destinatario_id} onValueChange={v => setForm(f => ({ ...f, destinatario_id: v }))}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u: any) => <SelectItem key={u.id} value={u.id}>{formatUserDisplay(u)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Classificação *</label>
                <Select value={form.classificacao} onValueChange={v => setForm(f => ({ ...f, classificacao: v }))}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Classificação" /></SelectTrigger>
                  <SelectContent>
                    {SOLICITACAO_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  Grau de Urgência
                </label>
                <Select value={form.urgencia} onValueChange={v => setForm(f => ({ ...f, urgencia: v }))}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Urgência" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa (Pode esperar)</SelectItem>
                    <SelectItem value="Normal">Normal (Rotina)</SelectItem>
                    <SelectItem value="Alta">Alta (Precisa logo)</SelectItem>
                    <SelectItem value="Urgente">Urgente (Obra parada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  Necessidade p/ quando?
                </label>
                <Input 
                  type="date" 
                  value={form.data_necessidade} 
                  onChange={e => setForm(f => ({ ...f, data_necessidade: e.target.value }))}
                  className="h-12 text-sm text-foreground bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Materiais Necessários *</label>
              
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  {!selectedProdutoId ? (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar no estoque..."
                        value={productSearch}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          setShowProductList(true);
                        }}
                        onFocus={() => setShowProductList(true)}
                        onBlur={() => setShowProductList(false)}
                        className="h-11 pl-9 bg-background"
                        autoComplete="off"
                      />
                      {showProductList && (
                        <div className="absolute z-50 w-full mt-1 bg-[#0e1629] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {produtos
                            .filter((p: any) => p.nome.toLowerCase().includes(productSearch.toLowerCase()))
                            .map((p: any) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex flex-col justify-center text-sm min-h-[44px]"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedProdutoId(p.id);
                                  setProductSearch('');
                                  setShowProductList(false);
                                }}
                              >
                                <span className="font-medium truncate text-white flex items-center gap-2">
                                  {p.nome.replace('[FERRAMENTA] ', '').replace('[FERRAMENTA]', '')}
                                  {p.nome.startsWith('[FERRAMENTA]') && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Ferramenta</span>}
                                </span>
                                {p.unidade && <span className="text-[10px] text-white/40">{p.unidade}</span>}
                              </button>
                            ))
                          }
                          {produtos
                            .filter((p: any) => p.nome.toLowerCase().includes(productSearch.toLowerCase()))
                            .length === 0 && (
                            <p className="text-xs text-white/40 p-3 text-center">Nenhum produto encontrado</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-3 h-11 rounded-lg border bg-muted/40 text-sm">
                      <span className="font-medium truncate flex items-center gap-2">
                        {produtos.find((p: any) => p.id === selectedProdutoId)?.nome.replace('[FERRAMENTA] ', '').replace('[FERRAMENTA]', '')}
                        {produtos.find((p: any) => p.id === selectedProdutoId)?.nome.startsWith('[FERRAMENTA]') && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Ferramenta</span>}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted ml-2"
                        onClick={() => {
                          setSelectedProdutoId('');
                          setProductSearch('');
                        }}
                      >
                        Trocar
                      </Button>
                    </div>
                  )}
                </div>
                <Input 
                  type="number" 
                  placeholder="Qtd" 
                  className="w-20 h-11" 
                  value={selectedQtd} 
                  onChange={e => setSelectedQtd(e.target.value)} 
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  className="h-11 px-4 font-bold"
                  onClick={() => {
                    const p = produtos.find((x: any) => x.id === selectedProdutoId);
                    if (p && selectedQtd) {
                      const linha = `${selectedQtd} ${p.unidade} - ${p.nome}`;
                      setForm(f => ({ ...f, descricao: f.descricao ? f.descricao + '\n' + linha : linha }));
                      setSelectedProdutoId('');
                      setSelectedQtd('');
                      setProductSearch('');
                    }
                  }}
                >
                  Adicionar
                </Button>
              </div>

              <Textarea 
                placeholder="Ex: 5 sacos de cimento... (Digite livremente ou adicione usando o estoque acima)" 
                value={form.descricao} 
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} 
                className="min-h-[120px] resize-none mt-2"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Foto / Imagem de Referência (Opcional)
              </label>
              <ImageUpload
                bucket="produtos"
                currentUrl={form.foto_url}
                onUpload={(url) => setForm(f => ({ ...f, foto_url: url }))}
                label="Adicionar Foto"
              />
            </div>

            <Button type="submit" className="w-full h-12 text-sm font-bold" disabled={save.isPending || editSolicitacao.isPending || !user?.id || !form.destinatario_id || !form.titulo.trim() || !form.descricao.trim()}>
              {editingId ? (editSolicitacao.isPending ? 'Salvando...' : 'Salvar Alterações') : (save.isPending ? 'Enviando...' : 'Enviar Solicitação')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Atualizar Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Solicitação</DialogTitle>
          </DialogHeader>
          {selectedSolicitacao && (
            <div className="space-y-4 pt-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="bg-muted/30 p-4 rounded-xl text-sm mb-4 space-y-3">
                {selectedSolicitacao.foto_url && (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black/5 flex items-center justify-center border border-border">
                    <img 
                      src={selectedSolicitacao.foto_url} 
                      alt="Imagem do material solicitado" 
                      className="max-h-[200px] w-full object-contain"
                    />
                  </div>
                )}
                <p className="font-bold text-base whitespace-pre-wrap break-words">{selectedSolicitacao.descricao_materiais}</p>
                <div className="flex flex-col gap-1 mt-3 pt-3 border-t text-xs text-muted-foreground">
                  {selectedSolicitacao.data_necessidade && (
                    <span className="flex items-center gap-1.5 text-blue-600 mb-1">
                      <Calendar className="h-3.5 w-3.5 shrink-0" /> Necessidade: <strong>{new Date(selectedSolicitacao.data_necessidade).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0" /> De: <strong>{formatUserDisplay(selectedSolicitacao.solicitante)}</strong></span>
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0" /> Para: <strong>{formatUserDisplay(selectedSolicitacao.destinatario)}</strong></span>
                </div>
              </div>

              {/* Histórico na Modal */}
              <div className="space-y-2 pb-4 border-b">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Histórico de Andamento</label>
                <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> Solicitado</span>
                    <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_solicitacao).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {selectedSolicitacao.data_aprovado && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Em Cotação</span>
                      <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_aprovado).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                  {selectedSolicitacao.data_comprado && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5 text-purple-400" /> Comprado</span>
                      <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_comprado).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                  {selectedSolicitacao.data_entregue && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Concluído</span>
                      <span className="font-medium text-slate-700">{new Date(selectedSolicitacao.data_entregue).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Seção de Comentários */}
              <div className="space-y-3 pt-2 pb-4 border-b">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-slate-400" />
                  Comentários ({comentarios.length})
                </label>
                
                {/* Lista de Comentários */}
                <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 max-h-[220px] overflow-y-auto space-y-3">
                  {comentarios.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-4 font-medium">Nenhum comentário ainda. Comece a conversa!</p>
                  ) : (
                    comentarios.map((c: any) => {
                      const isMe = c.usuario_id === user?.id;
                      return (
                        <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}>
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-500 px-1">
                            <span className="font-bold text-slate-700">{c.usuario_nome}</span>
                            <span>•</span>
                            <span>{new Date(c.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                          </div>
                          <div className={`p-2.5 rounded-2xl max-w-[85%] text-xs shadow-sm ${
                            isMe 
                              ? 'bg-blue-600 text-white rounded-tr-none' 
                              : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                          }`}>
                            <p className="whitespace-pre-wrap break-words leading-relaxed">{c.texto}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input de Novo Comentário */}
                <div className="flex gap-2 items-end pt-1">
                  <Textarea
                    placeholder="Escreva um comentário... (Enter para enviar)"
                    value={newComentario}
                    onChange={(e) => setNewComentario(e.target.value)}
                    className="min-h-[44px] max-h-[120px] resize-y text-xs py-2.5 px-3 rounded-xl bg-white border border-slate-200"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (newComentario.trim() && !addComentario.isPending) {
                          addComentario.mutate(newComentario.trim());
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 px-4 rounded-xl font-bold shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    disabled={!newComentario.trim() || addComentario.isPending}
                    onClick={() => addComentario.mutate(newComentario.trim())}
                  >
                    {addComentario.isPending ? 'Enviando...' : 'Comentar'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Novo Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOLICITADO">Solicitado</SelectItem>
                    <SelectItem value="APROVADO">Em Cotação</SelectItem>
                    <SelectItem value="COMPRADO">Comprado</SelectItem>
                    <SelectItem value="ENTREGUE">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resposta / Observação (Opcional)</label>
                <Textarea 
                  placeholder="Ex: Material comprado, previsão de chegada na terça-feira..." 
                  value={observacao} 
                  onChange={e => setObservacao(e.target.value)} 
                  className="min-h-[100px] resize-none"
                />
              </div>

              <Button 
                onClick={() => updateStatus.mutate({ id: selectedSolicitacao.id, status: newStatus, obs: observacao })} 
                className="w-full h-12 text-sm font-bold" 
                disabled={updateStatus.isPending || (newStatus !== 'SOLICITADO' && !selectedSolicitacao.aprovador_id)}
              >
                {updateStatus.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar Exclusão Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Solicitação"
        description="Tem certeza de que deseja excluir esta solicitação de material? Esta ação não poderá ser desfeita."
        onConfirm={() => {
          if (deleteId) {
            deleteSolicitacao.mutate(deleteId);
          }
        }}
        loading={deleteSolicitacao.isPending}
      />
    </div>
  );
}
