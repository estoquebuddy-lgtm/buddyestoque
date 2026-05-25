import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Hand, RotateCcw, History, ArrowUpFromLine, QrCode, Download, Printer, Camera } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

const FERRAMENTA_CATEGORIES = ['Ferramentas Manuais', 'Ferramentas Elétricas', 'Equipamentos de Proteção (EPI)', 'Equipamentos de Medição', 'OUTROS'];
const emptyForm = { nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '', categoria: '', qr_code: '' };

export default function FerramentasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [retirarOpen, setRetirarOpen] = useState(false);
  const [retirarPessoaId, setRetirarPessoaId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  // QR Code Generation State
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  // Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [scannerInstance, setScannerInstance] = useState<Html5Qrcode | null>(null);

  // Scan Action State
  const [scanActionOpen, setScanActionOpen] = useState(false);
  const [scannedTool, setScannedTool] = useState<any>(null);
  const [scanResultError, setScanResultError] = useState('');
  const [scanObservacao, setScanObservacao] = useState('');
  const [scanPessoaId, setScanPessoaId] = useState('');
  const [manualCode, setManualCode] = useState('');

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => { const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome'); return data || []; },
  });

  const { data: ferramentas = [], isLoading } = useQuery({
    queryKey: ['ferramentas', obraId, pessoas],
    queryFn: async () => {
      const { data, error } = await supabase.from('ferramentas').select('*').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      const pessoasMap = new Map(pessoas.map((p: any) => [p.id, p.nome]));
      return (data || []).map((f: any) => {
        const catMatch = f.observacoes?.match(/\[CAT:(.*?)\]/);
        const categoria = catMatch ? catMatch[1] : null;
        const cleanObs = f.observacoes?.replace(/\[CAT:.*?\]/, '').trim() || f.observacoes;
        return {
          ...f,
          categoria,
          observacoes: cleanObs,
          pessoas: f.responsavel_id ? { nome: pessoasMap.get(f.responsavel_id) || null } : null,
        };
      });
    },
    enabled: !!obraId,
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['historico-ferramentas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('historico_ferramentas' as any).select('*, ferramentas(nome), pessoas(nome)').eq('obra_id', obraId).order('data', { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('ferramentas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ferramentas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  // Generate QR Code URL
  useEffect(() => {
    if (qrCodeOpen && selectedTool) {
      const text = selectedTool.qr_code || selectedTool.codigo || `F-${selectedTool.id.substring(0, 6).toUpperCase()}`;
      QRCode.toDataURL(text, { width: 300, margin: 2 }, (err, url) => {
        if (err) console.error(err);
        else setQrCodeUrl(url);
      });
    }
  }, [qrCodeOpen, selectedTool]);

  const downloadQRCode = () => {
    if (!qrCodeUrl || !selectedTool) return;
    const a = document.createElement('a');
    a.href = qrCodeUrl;
    a.download = `QR_${selectedTool.nome.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const printQRCode = () => {
    if (!qrCodeUrl || !selectedTool) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir QR Code - ${selectedTool.nome}</title>
            <style>
              body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; }
              img { width: 200px; height: 200px; margin-bottom: 20px; }
              h1 { font-size: 24px; margin: 0 0 10px 0; }
              p { font-size: 16px; margin: 0; color: #666; }
            </style>
          </head>
          <body>
            <h1>${selectedTool.nome}</h1>
            <p>${selectedTool.codigo ? `Código: ${selectedTool.codigo}` : ''}</p>
            <img src="${qrCodeUrl}" />
            <script>
              window.onload = () => { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Scanner Lifecycle Control
  useEffect(() => {
    if (scannerOpen) {
      Html5Qrcode.getCameras().then(devices => {
        setCameras(devices);
        if (devices.length > 0) {
          const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('traseira') || d.label.toLowerCase().includes('rear'));
          const defaultCamId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(defaultCamId);
          startScanning(defaultCamId);
        } else {
          toast.error("Nenhuma câmera detectada.");
        }
      }).catch(err => {
        console.error("Erro de câmeras:", err);
        toast.error("Sem acesso à câmera.");
      });
    } else {
      stopScanning();
    }
    return () => {
      stopScanning();
    };
  }, [scannerOpen]);

  const startScanning = async (cameraId: string) => {
    try {
      await stopScanning();
      const html5Qr = new Html5Qrcode("qr-reader");
      setScannerInstance(html5Qr);
      await html5Qr.start(
        cameraId,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleScannedCode(decodedText);
        },
        () => {} // Ignora erros de frame
      );
    } catch (err: any) {
      console.error(err);
      toast.error("Falha ao iniciar câmera.");
    }
  };

  const stopScanning = async () => {
    if (scannerInstance) {
      try {
        if (scannerInstance.isScanning) {
          await scannerInstance.stop();
        }
      } catch (err) {
        console.error(err);
      }
      setScannerInstance(null);
    }
  };

  const handleScannedCode = async (code: string) => {
    await stopScanning();
    setScannerOpen(false);
    toast.loading("Buscando ferramenta...");

    try {
      let { data: tool } = await supabase
        .from('ferramentas')
        .select('*')
        .eq('obra_id', obraId)
        .eq('qr_code', code)
        .maybeSingle();

      if (!tool) {
        // Fallback: search by codigo
        const resCod = await supabase
          .from('ferramentas')
          .select('*')
          .eq('obra_id', obraId)
          .eq('codigo', code)
          .maybeSingle();
        if (resCod.data) {
          tool = resCod.data;
        } else if (code.length === 36) {
          // Fallback 2: UUID check
          const resId = await supabase
            .from('ferramentas')
            .select('*')
            .eq('obra_id', obraId)
            .eq('id', code)
            .maybeSingle();
          if (resId.data) tool = resId.data;
        }
      }

      toast.dismiss();

      if (!tool) {
        setScanResultError(`Código "${code}" não associado a nenhuma ferramenta.`);
        setScannedTool(null);
      } else {
        let toolWithPessoa = { ...tool };
        if (tool.responsavel_id) {
          const { data: pesData } = await supabase.from('pessoas').select('nome').eq('id', tool.responsavel_id).maybeSingle();
          toolWithPessoa.pessoas = pesData ? { nome: pesData.nome } : null;
        }
        setScannedTool(toolWithPessoa);
        setScanPessoaId(tool.responsavel_id || '');
        setScanObservacao('');
        setScanResultError('');
      }
      setScanActionOpen(true);
    } catch (err: any) {
      toast.dismiss();
      toast.error("Erro ao buscar: " + err.message);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const generatedCode = form.qr_code || `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const payload: any = { 
        obra_id: obraId, 
        nome: form.nome, 
        codigo: form.codigo || null, 
        estado: form.estado, 
        status: form.estado.toUpperCase() === 'EM_USO' ? 'EM_USO' : (form.estado.toUpperCase() === 'MANUTENCAO' ? 'MANUTENCAO' : (form.estado.toUpperCase() === 'EXTRAVIADA' ? 'EXTRAVIADA' : 'DISPONIVEL')),
        qr_code: generatedCode,
        foto_url: form.foto_url || null, 
        observacoes: `[CAT:${form.categoria}] ${form.observacoes || ''}`.trim()
      };
      
      let res;
      if (editingId) { res = await supabase.from('ferramentas').update(payload).eq('id', editingId); }
      else { res = await supabase.from('ferramentas').insert(payload); }
      
      if (res.error) throw res.error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: editingId ? 'EDITAR' : 'CADASTRAR',
        entidade: 'FERRAMENTA',
        detalhes: `${editingId ? 'Editou' : 'Cadastrou'} a ferramenta: ${form.nome}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Ferramenta atualizada!' : 'Ferramenta adicionada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { 
      const { data: { user } } = await supabase.auth.getUser();
      const tool = ferramentas.find(f => f.id === id);
      const { error } = await supabase.from('ferramentas').delete().eq('id', id); 
      if (error) throw error; 

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'FERRAMENTA',
        detalhes: `Excluiu a ferramenta: ${tool?.nome || id}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDeleteId(null); toast.success('Ferramenta excluída!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const retirar = useMutation({
    mutationFn: async ({ id, pessoaId, observacao }: { id: string; pessoaId: string; observacao?: string }) => {
      const timestamp = new Date().toISOString();
      const { error: updateError } = await supabase.from('ferramentas').update({ 
        estado: 'em_uso', 
        status: 'EM_USO', 
        responsavel_id: pessoaId || null, 
        data_retirada: timestamp, 
        data_devolucao: null,
        ultima_movimentacao: timestamp
      }).eq('id', id);
      if (updateError) throw updateError;
      
      const { error: histError } = await supabase.from('historico_ferramentas' as any).insert({
          ferramenta_id: id,
          obra_id: obraId,
          pessoa_id: pessoaId || null,
          tipo: 'retirada',
          data: timestamp
      });
      if (histError) console.error('Error saving history:', histError);

      const { error: movError } = await supabase.from('movimentacoes_ferramentas' as any).insert({
          ferramenta_id: id,
          obra_id: obraId,
          usuario_id: pessoaId || null,
          tipo: 'RETIRADA',
          data_hora: timestamp,
          observacao: observacao || null
      });
      if (movError) console.error('Error saving movements:', movError);
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['historico-ferramentas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['movimentacoes-ferramentas', obraId] }); 
      setRetirarOpen(false); 
      setSelectedTool(null); 
      setRetirarPessoaId(''); 
      setScanActionOpen(false);
      setScannedTool(null);
      toast.success('Ferramenta retirada!'); 
    },
    onError: (e: any) => toast.error(e.message),
  });

  const devolver = useMutation({
    mutationFn: async ({ id, responsavelId, observacao }: { id: string; responsavelId?: string | null; observacao?: string }) => {
      const timestamp = new Date().toISOString();
      const { error: updateError } = await supabase.from('ferramentas').update({ 
        estado: 'disponivel', 
        status: 'DISPONIVEL', 
        responsavel_id: null, 
        data_devolucao: timestamp,
        ultima_movimentacao: timestamp
      }).eq('id', id);
      if (updateError) throw updateError;

      const { error: histError } = await supabase.from('historico_ferramentas' as any).insert({
        ferramenta_id: id,
        obra_id: obraId,
        pessoa_id: responsavelId || null,
        tipo: 'devolucao',
        data: timestamp
      });
      if (histError) console.error('Error saving history:', histError);

      const { error: movError } = await supabase.from('movimentacoes_ferramentas' as any).insert({
        ferramenta_id: id,
        obra_id: obraId,
        usuario_id: responsavelId || null,
        tipo: 'DEVOLUCAO',
        data_hora: timestamp,
        observacao: observacao || null
      });
      if (movError) console.error('Error saving movements:', movError);
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['historico-ferramentas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['movimentacoes-ferramentas', obraId] }); 
      setSelectedTool(null); 
      setScanActionOpen(false);
      setScannedTool(null);
      toast.success('Ferramenta devolvida!'); 
    },
    onError: (e: any) => toast.error(e.message),
  });

  const alterarStatus = useMutation({
    mutationFn: async ({ id, novoStatus }: { id: string; novoStatus: string }) => {
      const timestamp = new Date().toISOString();
      const estado = novoStatus.toLowerCase() === 'extraviada' ? 'extraviada' : (novoStatus.toLowerCase() === 'manutencao' ? 'manutencao' : novoStatus.toLowerCase());
      const { error: updateError } = await supabase.from('ferramentas').update({ 
        status: novoStatus.toUpperCase(),
        estado: estado,
        ultima_movimentacao: timestamp
      }).eq('id', id);
      if (updateError) throw updateError;

      const { error: movError } = await supabase.from('movimentacoes_ferramentas' as any).insert({
        ferramenta_id: id,
        obra_id: obraId,
        tipo: novoStatus.toUpperCase() === 'MANUTENCAO' ? 'MANUTENCAO' : (novoStatus.toUpperCase() === 'EXTRAVIADA' ? 'EXTRAVIO' : 'DEVOLUCAO'),
        data_hora: timestamp,
        observacao: `Status alterado manualmente para ${novoStatus}`
      });
      if (movError) console.error('Error saving movement logs:', movError);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      toast.success('Status da ferramenta atualizado!');
      if (scannedTool) {
        handleScannedCode(scannedTool.qr_code || scannedTool.codigo || scannedTool.id);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (f: any) => {
    setEditingId(f.id);
    setForm({ nome: f.nome, codigo: f.codigo || '', estado: f.estado, foto_url: f.foto_url || '', observacoes: f.observacoes || '', categoria: f.categoria || '', qr_code: f.qr_code || '' });
    setDialogOpen(true);
  };

  const filtered = ferramentas.filter((f: any) => f.nome.toLowerCase().includes(search.toLowerCase()) || (f.codigo && f.codigo.toLowerCase().includes(search.toLowerCase())));

  const estadoBadge = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'disponivel': return <Badge className="bg-success/10 text-success border-success/20">Disponível</Badge>;
      case 'em_uso': return <Badge className="bg-warning/10 text-warning border-warning/20">Em uso</Badge>;
      case 'manutencao': return <Badge variant="destructive">Manutenção</Badge>;
      case 'extraviada': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Extraviada</Badge>;
      default: return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader title="Ferramentas" count={ferramentas.length} search={search} onSearchChange={setSearch} searchPlaceholder="Buscar ferramenta..." actionLabel="Ferramenta" onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }} />
        </div>
        <div className="mt-4 grid grid-cols-2 md:flex md:flex-row gap-3">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 md:flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Monitoramento</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-white leading-none">{ferramentas.filter(f => f.estado === 'em_uso').length}</span>
                <span className="text-xs text-white/30 mb-1">em uso</span>
              </div>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 md:flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Disponível</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-success leading-none">{ferramentas.filter(f => f.estado === 'disponivel').length}</span>
                <span className="text-xs text-white/30 mb-1">ferramentas</span>
              </div>
           </div>

           <Button variant="outline" className="h-auto py-4 md:py-5 bg-[#d97706]/10 border-warning/20 text-warning md:flex-1 flex flex-col items-center justify-center gap-1 hover:bg-[#d97706]/20 border-none transition-all hover:scale-105" onClick={() => setScannerOpen(true)}>
              <Camera className="h-5 w-5 opacity-90" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center">Escanear QR</span>
           </Button>
           
           <Button variant="outline" className="h-auto py-4 md:py-5 bg-white/5 border-white/10 text-white md:flex-1 flex flex-col items-center justify-center gap-1 hover:bg-white/10 border-none transition-all hover:scale-105" onClick={() => setHistoryOpen(true)}>
              <History className="h-5 w-5 opacity-50" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center">Histórico</span>
           </Button>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma ferramenta encontrada' : 'Nenhuma ferramenta cadastrada'}</p>
      ) : (
        <Accordion type="multiple" defaultValue={FERRAMENTA_CATEGORIES} className="space-y-3">
          {[...FERRAMENTA_CATEGORIES, 'Sem Categoria'].map((cat) => {
            const toolsInCat = filtered.filter(f => 
              (cat === 'Sem Categoria' ? !f.categoria : f.categoria === cat)
            );
            
            if (toolsInCat.length === 0) return null;

            return (
              <AccordionItem key={cat} value={cat} className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 group">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm uppercase tracking-widest text-muted-foreground group-data-[state=open]:text-primary transition-colors">{cat}</span>
                    <Badge variant="secondary" className="bg-muted text-[10px] h-4 rounded-full">{toolsInCat.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-1 space-y-2">
                  {toolsInCat.map((f: any) => (
                    <Card key={f.id} className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.995]" onClick={() => setSelectedTool(f)}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{f.nome}</p>
                          <div className="flex items-center gap-2">
                            {f.codigo && <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Cód: {f.codigo}</p>}
                            {f.pessoas?.nome && <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">• Com: {f.pessoas.nome}</p>}
                          </div>
                        </div>
                        {estadoBadge(f.estado)}
                      </CardContent>
                    </Card>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedTool} onOpenChange={(open) => !open && setSelectedTool(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selectedTool && (
            <SheetHeader className="text-left">
              <SheetTitle>{selectedTool.nome}</SheetTitle>
              <div className="space-y-4 pt-3">
                <div className="flex items-center gap-3">
                  <ImageThumbnail src={selectedTool.foto_url} alt={selectedTool.nome} type="ferramenta" size="md" />
                  <div>
                    {estadoBadge(selectedTool.estado)}
                    {selectedTool.pessoas?.nome && <p className="text-sm text-muted-foreground mt-1">Com: {selectedTool.pessoas.nome}</p>}
                    {selectedTool.data_retirada && <p className="text-xs text-muted-foreground">Retirada: {new Date(selectedTool.data_retirada).toLocaleDateString('pt-BR')}</p>}
                  </div>
                </div>
                {selectedTool.estado === 'disponivel' && (
                  <Button className="w-full h-12 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => setRetirarOpen(true)}>
                    <Hand className="h-4 w-4 mr-1.5" /> Retirar
                  </Button>
                )}
                {selectedTool.estado === 'em_uso' && (
                  <Button className="w-full h-12 bg-success hover:bg-success/90 text-success-foreground" onClick={() => devolver.mutate({ id: selectedTool.id, responsavelId: selectedTool.responsavel_id })} disabled={devolver.isPending}>
                    <RotateCcw className="h-4 w-4 mr-1.5" /> {devolver.isPending ? 'Devolvendo...' : 'Devolver'}
                  </Button>
                )}
                <Button variant="outline" className="w-full h-12 bg-[#0e1629] text-white hover:bg-white/10" onClick={() => setQrCodeOpen(true)}>
                  <QrCode className="h-4 w-4 mr-1.5 text-primary" /> Gerar QR Code
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { startEdit(selectedTool); setSelectedTool(null); }}><Pencil className="h-4 w-4 mr-1.5" /> Editar</Button>
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(selectedTool.id); setSelectedTool(null); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>

      {/* Retirar Dialog */}
      <Dialog open={retirarOpen} onOpenChange={setRetirarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retirar Ferramenta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); selectedTool && retirar.mutate({ id: selectedTool.id, pessoaId: retirarPessoaId }); }} className="space-y-3">
            <Select value={retirarPessoaId} onValueChange={setRetirarPessoaId}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Responsável (opcional)" /></SelectTrigger>
              <SelectContent>{pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" className="w-full h-12 bg-warning hover:bg-warning/90 text-warning-foreground" disabled={retirar.isPending}>{retirar.isPending ? 'Registrando...' : 'Confirmar Retirada'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Ferramenta' : 'Nova Ferramenta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <ImageUpload bucket="ferramentas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required className="h-12" />
            
            <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Categoria *" /></SelectTrigger>
              <SelectContent>
                {FERRAMENTA_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {editingId && (
              <Select value={form.estado} onValueChange={v => setForm(f => ({ ...f, estado: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Status *" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="em_uso">Em uso</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="extraviada">Extraviada</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Input placeholder="Código" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} className="h-12" />
            <Input placeholder="Código QR Code (Ex: F01 - opcional)" value={form.qr_code} onChange={e => setForm(f => ({ ...f, qr_code: e.target.value }))} className="h-12" />
            <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className="h-12" />
            <Button type="submit" className="w-full h-12" disabled={save.isPending || !form.nome || !form.categoria}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Ferramenta" description="Tem certeza? Isso removerá permanentemente a ferramenta." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />

      {/* QR Code Dialog */}
      <Dialog open={qrCodeOpen} onOpenChange={setQrCodeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center font-display font-bold">QR Code da Ferramenta</DialogTitle>
          </DialogHeader>
          {selectedTool && (
            <div className="flex flex-col items-center space-y-6 py-4">
              <div className="text-center">
                <h3 className="font-bold text-lg">{selectedTool.nome}</h3>
                <p className="text-sm text-muted-foreground">{selectedTool.codigo ? `Código: ${selectedTool.codigo}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-1 bg-muted px-2.5 py-1 rounded-full inline-block font-mono font-semibold">
                  QR: {selectedTool.qr_code || selectedTool.codigo || `F-${selectedTool.id.substring(0, 6).toUpperCase()}`}
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl shadow-inner border border-muted flex items-center justify-center">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-muted-foreground text-sm">Gerando...</div>
                )}
              </div>

              <div className="flex flex-col w-full gap-2 pt-2">
                <Button className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90" onClick={downloadQRCode}>
                  <Download className="h-4 w-4 mr-2" /> Baixar PNG
                </Button>
                <Button variant="outline" className="w-full h-11 border-muted-foreground/20" onClick={printQRCode}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimir Etiqueta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scanner Dialog */}
      <Dialog open={scannerOpen} onOpenChange={(open) => { setScannerOpen(open); if (!open) stopScanning(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-display font-bold flex items-center justify-center gap-2">
              <Camera className="h-5 w-5 text-warning" />
              Escanear QR Code da Ferramenta
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-2">
            {cameras.length > 1 && (
              <Select value={selectedCameraId} onValueChange={startScanning}>
                <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecione a Câmera" /></SelectTrigger>
                <SelectContent>
                  {cameras.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.label || `Câmera ${c.id.substring(0, 5)}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="w-full bg-[#0e1629] overflow-hidden rounded-2xl border border-white/10 flex items-center justify-center aspect-square relative">
              <div id="qr-reader" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full"></div>
              {/* Scanner Frame Guide */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-warning border-dashed rounded-2xl opacity-60 animate-pulse"></div>
              </div>
            </div>

            <div className="w-full pt-2 flex flex-col space-y-2">
              <p className="text-xs text-center text-muted-foreground">Posicione o QR Code em frente à câmera.</p>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px bg-muted flex-1" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Ou digite manualmente</span>
                <div className="h-px bg-muted flex-1" />
              </div>
              <form onSubmit={e => { e.preventDefault(); if (manualCode.trim()) handleScannedCode(manualCode.trim()); }} className="flex gap-2">
                <Input placeholder="Ex: F01 ou UUID da ferramenta" value={manualCode} onChange={e => setManualCode(e.target.value)} className="h-10" />
                <Button type="submit" className="h-10 bg-[#0e1629] border border-white/10 text-white hover:bg-white/10">Buscar</Button>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scan Result Action Dialog */}
      <Dialog open={scanActionOpen} onOpenChange={setScanActionOpen}>
        <DialogContent className="max-w-md">
          {scanResultError ? (
            <div className="text-center py-6 space-y-4">
              <div className="h-12 w-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
                <Trash2 className="h-6 w-6" />
              </div>
              <DialogHeader>
                <DialogTitle className="text-center font-display font-bold">Erro ao Identificar</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground px-4">{scanResultError}</p>
              <div className="pt-4 flex gap-2">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setScanActionOpen(false)}>Fechar</Button>
                <Button className="flex-1 h-11 bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => { setScanActionOpen(false); setScannerOpen(true); }}>Tentar Novamente</Button>
              </div>
            </div>
          ) : scannedTool ? (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="text-center font-display font-bold">Movimentar Ferramenta</DialogTitle>
              </DialogHeader>

              <div className="p-4 bg-muted/30 rounded-2xl flex items-center gap-4">
                <ImageThumbnail src={scannedTool.foto_url} alt={scannedTool.nome} type="ferramenta" size="sm" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-sm truncate">{scannedTool.nome}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {scannedTool.codigo && <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">Cód: {scannedTool.codigo}</span>}
                    {estadoBadge(scannedTool.status)}
                  </div>
                </div>
              </div>

              {/* Status form triggers */}
              {scannedTool.status === 'DISPONIVEL' ? (
                <div className="space-y-4">
                  <div className="bg-success/5 border border-success/20 rounded-xl p-3 text-center">
                    <p className="text-xs font-semibold text-success flex items-center justify-center gap-1">
                      <Hand className="h-3.5 w-3.5" /> Ferramenta Disponível para Retirada
                    </p>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quem está retirando? *</label>
                    <Select value={scanPessoaId} onValueChange={setScanPessoaId}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o responsável..." /></SelectTrigger>
                      <SelectContent>
                        {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Observação (opcional)</label>
                    <Input placeholder="Ex: Retirando para obra de reforço" value={scanObservacao} onChange={e => setScanObservacao(e.target.value)} className="h-11" />
                  </div>
                  <Button className="w-full h-12 bg-warning text-warning-foreground hover:bg-warning/90 font-bold" onClick={() => retirar.mutate({ id: scannedTool.id, pessoaId: scanPessoaId, observacao: scanObservacao })} disabled={retirar.isPending || !scanPessoaId}>
                    {retirar.isPending ? 'Confirmando...' : 'Confirmar Retirada'}
                  </Button>
                </div>
              ) : scannedTool.status === 'EM_USO' ? (
                <div className="space-y-4">
                  <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-warning flex items-center justify-center gap-1">
                      <RotateCcw className="h-3.5 w-3.5" /> Ferramenta atualmente em utilização
                    </p>
                    <div className="text-xs text-center text-muted-foreground">
                      <p className="font-bold">Responsável: {scannedTool.pessoas?.nome || 'Desconhecido'}</p>
                      {scannedTool.data_retirada && <p className="mt-0.5">Retirado em: {new Date(scannedTool.data_retirada).toLocaleDateString('pt-BR')} às {new Date(scannedTool.data_retirada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Observação da devolução (opcional)</label>
                    <Input placeholder="Ex: Devolvido limpo e lubrificado" value={scanObservacao} onChange={e => setScanObservacao(e.target.value)} className="h-11" />
                  </div>
                  <Button className="w-full h-12 bg-success text-success-foreground hover:bg-success/90 font-bold" onClick={() => devolver.mutate({ id: scannedTool.id, responsavelId: scannedTool.responsavel_id, observacao: scanObservacao })} disabled={devolver.isPending}>
                    {devolver.isPending ? 'Devolvendo...' : 'Confirmar Devolução'}
                  </Button>
                </div>
              ) : (
                // MANUTENCAO ou EXTRAVIADA
                <div className="space-y-4">
                  <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-center">
                    <p className="text-xs font-bold text-destructive">
                      Atenção: Esta ferramenta está marcada como {scannedTool.status}.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Não é possível realizar retiradas ou devoluções de ferramentas neste status.</p>
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Deseja liberar a ferramenta?</p>
                    <Button className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => alterarStatus.mutate({ id: scannedTool.id, novoStatus: 'DISPONIVEL' })} disabled={alterarStatus.isPending}>
                      Liberar para "Disponível"
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="pt-2 text-center">
                <Button variant="ghost" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setScanActionOpen(false)}>Cancelar</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Historico Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
         <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
            <div className="p-6 bg-[#0e1629] text-white">
               <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-white">
                     <History className="h-5 w-5 text-primary" />
                     Histórico de Movimentação
                  </SheetTitle>
                  <p className="text-xs text-white/40">Registro completo de quem pegou e devolveu ferramentas</p>
               </SheetHeader>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
               {historico.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <History className="h-10 w-10 opacity-10 mb-4" />
                    <p className="text-sm">Nenhuma movimentação registrada</p>
                 </div>
               ) : (
                 <div className="space-y-4">
                    {historico.map((h: any) => (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key={h.id} className="p-4 bg-white rounded-xl border-none shadow-sm flex items-center justify-between gap-4">
                         <div className="flex items-center gap-4 min-w-0">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${h.tipo === 'retirada' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                               {h.tipo === 'retirada' ? <ArrowUpFromLine className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                               <p className="text-sm font-bold truncate">{h.ferramentas?.nome || 'Ferramenta'}</p>
                               <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                 <span className={h.tipo === 'retirada' ? 'text-warning' : 'text-success'}>
                                   {h.tipo === 'retirada' ? 'Retirado por:' : 'Devolvido por:'}
                                 </span>
                                 {h.pessoas?.nome || 'Sistema'}
                               </p>
                            </div>
                         </div>
                         <div className="text-right shrink-0">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">{new Date(h.data).toLocaleDateString('pt-BR')}</p>
                            <p className="text-xs font-display font-bold tabular-nums tracking-tighter">{new Date(h.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                         </div>
                      </motion.div>
                    ))}
                 </div>
               )}
            </div>
         </SheetContent>
      </Sheet>
    </div>
  );
}
