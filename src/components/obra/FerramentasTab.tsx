import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Hand, RotateCcw, History, ArrowUpFromLine, ArrowDownToLine, QrCode, Download, Printer, Camera, Wrench, HelpCircle, AlertCircle, Plus, Loader2 } from 'lucide-react';
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
import { useProfile } from '@/hooks/useProfile';

const FERRAMENTA_CATEGORIES = ['Ferramentas Manuais', 'Ferramentas Elétricas', 'Equipamentos de Proteção (EPI)', 'Equipamentos de Medição', 'OUTROS'];
const emptyForm = { nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '', categoria: '', localizacao: '', qr_code: '' };

export default function FerramentasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const { isAdmin } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [retirarOpen, setRetirarOpen] = useState(false);
  const [retirarPessoaId, setRetirarPessoaId] = useState('');
  const [retirarTipo, setRetirarTipo] = useState<'uso' | 'manutencao' | 'baixa'>('uso');
  const [retirarObservacao, setRetirarObservacao] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showBaixadas, setShowBaixadas] = useState(false);
  const [groupByName, setGroupByName] = useState(true);
  const [groupDetails, setGroupDetails] = useState<{ name: string; categoria: string | null; tools: any[] } | null>(null);
  const [accordionValue, setAccordionValue] = useState<string[]>([]);

  // Rename Confirmation State
  const [renameConfirmOpen, setRenameConfirmOpen] = useState(false);
  const [renameOldName, setRenameOldName] = useState('');
  const [renameNewName, setRenameNewName] = useState('');


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
  const [scanRetirarTipo, setScanRetirarTipo] = useState<'uso' | 'manutencao'>('uso');
  const [manualCode, setManualCode] = useState('');

  // Add Tool Units Dialog State
  const [addUnitsDialog, setAddUnitsDialog] = useState<{ open: boolean; nome: string; quantidade: string; categoria?: string } | null>(null);

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => { const { data } = await supabase.from('pessoas').select('id, nome, status').eq('obra_id', obraId).order('nome'); return data || []; },
  });

  const { data: ferramentas = [], isLoading } = useQuery({
    queryKey: ['ferramentas', obraId, pessoas],
    queryFn: async () => {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('ferramentas')
          .select('*')
          .eq('obra_id', obraId)
          .order('nome')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        
        allData = [...allData, ...(data || [])];
        
        if (!data || data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      const pessoasMap = new Map(pessoas.map((p: any) => [p.id, p.nome]));
      return allData.map((f: any) => {
        const catMatch = f.observacoes?.match(/\[CAT:(.*?)\]/);
        const locMatch = f.observacoes?.match(/\[LOC:(.*?)\]/);
        const categoria = catMatch ? catMatch[1] : null;
        const localizacao = locMatch ? locMatch[1] : null;
        const cleanObs = f.observacoes?.replace(/\[CAT:.*?\]/g, '').replace(/\[LOC:.*?\]/g, '').trim() || f.observacoes;
        return {
          ...f,
          categoria,
          localizacao,
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

  const { data: entradasFerramentas = [] } = useQuery({
    queryKey: ['entradas-ferramentas', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('entradas')
        .select('id, quantidade, observacao, status_entrega, produtos(nome)')
        .eq('obra_id', obraId);
      return data || [];
    },
    enabled: !!obraId
  });

  const missingToolsMap = useMemo(() => {
    const map = new Map<string, { nome: string; expected: number; existing: number; missing: number; categoria?: string }>();
    
    entradasFerramentas.forEach((e: any) => {
      const isTool = e.observacao?.includes('[FERRAMENTA]') || e.produtos?.nome?.startsWith('[FERRAMENTA]');
      if (!isTool) return;
      const rawName = e.produtos?.nome?.replace('[FERRAMENTA] ', '').trim() || e.observacao?.replace('[FERRAMENTA]', '').trim() || '';
      if (!rawName) return;

      const key = rawName.toLowerCase();
      const current = map.get(key) || { nome: rawName, expected: 0, existing: 0, missing: 0 };
      current.expected += Number(e.quantidade || 0);
      map.set(key, current);
    });

    ferramentas.forEach((f: any) => {
      const rawName = (f.nome || '').trim();
      if (!rawName) return;
      const key = rawName.toLowerCase();
      const current = map.get(key) || { nome: rawName, expected: 0, existing: 0, missing: 0, categoria: f.categoria };
      current.existing += 1;
      if (f.categoria) current.categoria = f.categoria;
      map.set(key, current);
    });

    map.forEach((val) => {
      val.missing = Math.max(0, val.expected - val.existing);
    });

    return map;
  }, [entradasFerramentas, ferramentas]);
  // Auto-restore missing available tools for all tool entries registered in entradas
  useEffect(() => {
    if (!obraId || !ferramentas || !entradasFerramentas || entradasFerramentas.length === 0) return;

    const restoreMissingAvailableTools = async () => {
      const expectedMap = new Map<string, { name: string; total: number }>();

      entradasFerramentas.forEach((e: any) => {
        const isTool = e.observacao?.includes('[FERRAMENTA]') || e.produtos?.nome?.startsWith('[FERRAMENTA]');
        if (!isTool) return;

        const rawName = (e.produtos?.nome?.replace('[FERRAMENTA] ', '') || e.observacao?.replace('[FERRAMENTA]', '') || '').trim();
        if (!rawName) return;

        const key = rawName.toLowerCase();
        const cur = expectedMap.get(key) || { name: rawName, total: 0 };
        cur.total += Number(e.quantidade || 0);
        expectedMap.set(key, cur);
      });

      if (expectedMap.size === 0) return;

      const existingMap = new Map<string, any[]>();
      ferramentas.forEach((f: any) => {
        const key = (f.nome || '').toLowerCase().trim();
        if (!key) return;
        const arr = existingMap.get(key) || [];
        arr.push(f);
        existingMap.set(key, arr);
      });

      const toInsert: any[] = [];

      expectedMap.forEach((val, key) => {
        const existingTools = existingMap.get(key) || [];
        const currentTotal = existingTools.length;

        if (currentTotal < val.total) {
          const missing = val.total - currentTotal;
          console.log(`[FerramentasTab] Restoring ${missing} missing tools for "${val.name}" (Current: ${currentTotal}, Expected: ${val.total})`);

          for (let i = 0; i < missing; i++) {
            toInsert.push({
              obra_id: obraId,
              nome: val.name,
              codigo: null,
              estado: 'disponivel',
              status: 'DISPONIVEL',
              qr_code: `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
              observacoes: `[CAT:Ferramentas Manuais]`,
            });
          }
        }
      });

      if (toInsert.length > 0) {
        console.log(`[FerramentasTab] Restoring total of ${toInsert.length} available tools to database...`);
        const CHUNK_SIZE = 100;
        for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
          await supabase.from('ferramentas').insert(toInsert.slice(i, i + CHUNK_SIZE));
        }
        queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos-short', obraId] });
      }
    };

    restoreMissingAvailableTools();
  }, [obraId, ferramentas, entradasFerramentas, queryClient]);
  const totalMissingToolsCount = useMemo(() => {
    let sum = 0;
    missingToolsMap.forEach((v) => { sum += v.missing; });
    return sum;
  }, [missingToolsMap]);

  const syncFerramentasFromTab = useMutation({
    mutationFn: async ({ nomeTool, missingCount, categoriaTool }: { nomeTool?: string; missingCount?: number; categoriaTool?: string }) => {
      let itemsToCreate: { nome: string; missing: number; categoria?: string }[] = [];
      
      if (nomeTool && missingCount && missingCount > 0) {
        itemsToCreate.push({ nome: nomeTool.replace('[FERRAMENTA] ', '').trim(), missing: missingCount, categoria: categoriaTool });
      } else {
        missingToolsMap.forEach((val) => {
          if (val.missing > 0) {
            itemsToCreate.push({ nome: val.nome, missing: val.missing, categoria: val.categoria });
          }
        });
      }

      if (itemsToCreate.length === 0) {
        toast.info('Todas as ferramentas para esta obra já estão cadastradas.');
        return;
      }

      const allToolsToInsert: any[] = [];
      itemsToCreate.forEach(item => {
        for (let i = 0; i < item.missing; i++) {
          allToolsToInsert.push({
            obra_id: obraId,
            nome: item.nome,
            codigo: null,
            estado: 'disponivel',
            status: 'DISPONIVEL',
            qr_code: `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            observacoes: `[CAT:${item.categoria || 'Ferramentas Manuais'}] [LOC:]`,
          });
        }
      });

      const CHUNK_SIZE = 100;
      for (let i = 0; i < allToolsToInsert.length; i += CHUNK_SIZE) {
        const chunk = allToolsToInsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('ferramentas').insert(chunk);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['entradas-ferramentas', obraId] });
      toast.success('Ferramentas geradas com sucesso!');
    },
  });

  const setExactToolCount = useMutation({
    mutationFn: async ({ nome, targetTotal, categoria }: { nome: string; targetTotal: number; categoria?: string }) => {
      const cleanName = nome.replace('[FERRAMENTA] ', '').trim();
      
      const { data: existingTools, error: fetchErr } = await supabase
        .from('ferramentas')
        .select('*')
        .eq('obra_id', obraId)
        .ilike('nome', cleanName);

      if (fetchErr) throw fetchErr;

      const currentCount = existingTools?.length || 0;

      if (targetTotal > currentCount) {
        const missing = targetTotal - currentCount;
        const toolsToInsert = Array.from({ length: missing }, () => ({
          obra_id: obraId,
          nome: cleanName,
          codigo: null,
          estado: 'disponivel',
          status: 'DISPONIVEL',
          qr_code: `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          observacoes: `[CAT:${categoria || 'Ferramentas Manuais'}] [LOC:]`,
        }));

        const CHUNK_SIZE = 100;
        for (let i = 0; i < toolsToInsert.length; i += CHUNK_SIZE) {
          const chunk = toolsToInsert.slice(i, i + CHUNK_SIZE);
          const { error } = await supabase.from('ferramentas').insert(chunk);
          if (error) throw error;
        }
      } else if (targetTotal < currentCount) {
        const excessCount = currentCount - targetTotal;
        const availableTools = (existingTools || []).filter((t: any) => t.estado === 'disponivel' || t.estado === 'comprado');
        
        if (availableTools.length < excessCount) {
          throw new Error(`Não é possível reduzir para ${targetTotal} unidades pois existem ferramentas em uso ou manutenção.`);
        }

        const toDeleteIds = availableTools.slice(0, excessCount).map((t: any) => t.id);

        const CHUNK_SIZE = 100;
        for (let i = 0; i < toDeleteIds.length; i += CHUNK_SIZE) {
          const chunk = toDeleteIds.slice(i, i + CHUNK_SIZE);
          const { error } = await supabase.from('ferramentas').delete().in('id', chunk);
          if (error) throw error;
        }
      }

      // Update virtual product estoque_atual in produtos table
      const { data: prods } = await supabase
        .from('produtos')
        .select('id')
        .eq('obra_id', obraId)
        .ilike('nome', `%${cleanName}%`);

      if (prods && prods.length > 0) {
        for (const p of prods) {
          await supabase.from('produtos').update({ estoque_atual: targetTotal }).eq('id', p.id);
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos-short', obraId] });
      queryClient.invalidateQueries({ queryKey: ['entradas-ferramentas', obraId] });
      toast.success(`Quantidade de "${vars.nome}" ajustada para ${vars.targetTotal} unidades!`);
      setAddUnitsDialog(null);
    },
    onError: (e: any) => toast.error(e.message)
  });

  useEffect(() => {
    if (!obraId) return;
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channel = supabase.channel(`ferramentas-changes-${obraId}-${uniqueId}`)
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
        setScanRetirarTipo('uso');
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
    mutationFn: async (renameMode?: 'type' | 'unit' | null) => {
      const { data: { user } } = await supabase.auth.getUser();
      const generatedCode = form.qr_code || `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const payload: any = { 
        obra_id: obraId, 
        nome: form.nome.trim(), 
        codigo: form.codigo || null, 
        estado: form.estado, 
        status: form.estado.toUpperCase() === 'EM_USO' ? 'EM_USO' : (form.estado.toUpperCase() === 'MANUTENCAO' ? 'MANUTENCAO' : (form.estado.toUpperCase() === 'EXTRAVIADA' ? 'EXTRAVIADA' : 'DISPONIVEL')),
        qr_code: generatedCode,
        foto_url: form.foto_url || null, 
        observacoes: `[CAT:${form.categoria}] [LOC:${form.localizacao || ''}] ${form.observacoes || ''}`.trim()
      };
      
      let oldName = '';
      if (editingId) {
        const originalTool = ferramentas.find((t: any) => t.id === editingId);
        oldName = originalTool?.nome || '';
      }

      const newName = form.nome.trim();

      if (editingId && oldName && oldName.toLowerCase().trim() !== newName.toLowerCase().trim() && renameMode) {
        if (renameMode === 'type') {
          const { error: ferrError } = await supabase
            .from('ferramentas')
            .update({ nome: newName })
            .eq('obra_id', obraId)
            .eq('nome', oldName);
          if (ferrError) throw ferrError;

          const { data: existingNewProd } = await supabase
            .from('produtos')
            .select('id')
            .eq('obra_id', obraId)
            .eq('nome', `[FERRAMENTA] ${newName}`)
            .maybeSingle();

          const { data: existingOldProd } = await supabase
            .from('produtos')
            .select('id')
            .eq('obra_id', obraId)
            .eq('nome', `[FERRAMENTA] ${oldName}`)
            .maybeSingle();

          if (existingNewProd && existingOldProd) {
            const { error: updateEntradasErr } = await supabase
              .from('entradas')
              .update({ produto_id: existingNewProd.id })
              .eq('obra_id', obraId)
              .eq('produto_id', existingOldProd.id);
            if (updateEntradasErr) throw updateEntradasErr;

            const { error: updateSaidasErr } = await supabase
              .from('saidas')
              .update({ produto_id: existingNewProd.id })
              .eq('obra_id', obraId)
              .eq('produto_id', existingOldProd.id);
            if (updateSaidasErr) throw updateSaidasErr;

            const { error: deleteProdErr } = await supabase
              .from('produtos')
              .delete()
              .eq('id', existingOldProd.id);
            if (deleteProdErr) throw deleteProdErr;
          } else if (existingOldProd) {
            const { error: updateProdErr } = await supabase
              .from('produtos')
              .update({ nome: `[FERRAMENTA] ${newName}` })
              .eq('id', existingOldProd.id);
            if (updateProdErr) throw updateProdErr;
          }
        } else if (renameMode === 'unit') {
          const { data: existingNewProd } = await supabase
            .from('produtos')
            .select('id')
            .eq('obra_id', obraId)
            .eq('nome', `[FERRAMENTA] ${newName}`)
            .maybeSingle();

          if (!existingNewProd) {
            const { error: createProdErr } = await supabase
              .from('produtos')
              .insert({
                obra_id: obraId,
                nome: `[FERRAMENTA] ${newName}`,
                unidade: 'un',
                categoria: 'Ferramentas',
                estoque_minimo: 0,
                estoque_atual: 0,
              });
            if (createProdErr) throw createProdErr;
          }
        }
      }
      
      let res;
      if (editingId) { 
        res = await supabase.from('ferramentas').update(payload).eq('id', editingId); 
      } else { 
        res = await supabase.from('ferramentas').insert(payload); 
        
        const { data: existingNewProd } = await supabase
          .from('produtos')
          .select('id')
          .eq('obra_id', obraId)
          .eq('nome', `[FERRAMENTA] ${newName}`)
          .maybeSingle();

        if (!existingNewProd) {
          await supabase.from('produtos').insert({
            obra_id: obraId,
            nome: `[FERRAMENTA] ${newName}`,
            unidade: 'un',
            categoria: 'Ferramentas',
            estoque_minimo: 0,
            estoque_atual: 0,
          });
        }
      }
      
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
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] }); 
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); 
      setDialogOpen(false); 
      setEditingId(null); 
      setForm(emptyForm); 
      toast.success(editingId ? 'Ferramenta atualizada!' : 'Ferramenta adicionada!'); 
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const originalTool = ferramentas.find((t: any) => t.id === editingId);
      const oldName = originalTool?.nome || '';
      const newName = form.nome.trim();

      if (oldName && oldName.toLowerCase().trim() !== newName.toLowerCase().trim()) {
        setRenameOldName(oldName);
        setRenameNewName(newName);
        setRenameConfirmOpen(true);
        return;
      }
    }
    save.mutate(null);
  };

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
    mutationFn: async ({ id, pessoaId, observacao, tipo = 'uso' }: { id: string; pessoaId: string; observacao?: string, tipo?: 'uso' | 'manutencao' | 'baixa' }) => {
      if (tipo === 'uso' && !pessoaId) throw new Error("É obrigatório selecionar um responsável para retirada de uso.");
      
      const timestamp = new Date().toISOString();
      const novoEstado = tipo === 'manutencao' ? 'manutencao' : (tipo === 'baixa' ? 'baixa' : 'em_uso');
      const novoStatus = tipo === 'manutencao' ? 'MANUTENCAO' : (tipo === 'baixa' ? 'BAIXA' : 'EM_USO');
      const tipoHist = tipo === 'manutencao' ? 'manutencao' : (tipo === 'baixa' ? 'baixa' : 'retirada');
      const tipoMov = tipo === 'manutencao' ? 'MANUTENCAO' : (tipo === 'baixa' ? 'BAIXA' : 'RETIRADA');

      const { error: updateError } = await supabase.from('ferramentas').update({ 
        estado: novoEstado, 
        status: novoStatus, 
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
          tipo: tipoHist,
          data: timestamp
      });
      if (histError) console.error('Error saving history:', histError);

      const { error: movError } = await supabase.from('movimentacoes_ferramentas' as any).insert({
          ferramenta_id: id,
          obra_id: obraId,
          usuario_id: pessoaId || null,
          tipo: tipoMov,
          data_hora: timestamp,
          observacao: observacao || (tipo === 'baixa' ? 'Ferramenta dada como baixa (descarte)' : null)
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
      setRetirarObservacao('');
      setRetirarTipo('uso');
      setScanActionOpen(false);
      setScannedTool(null);
      toast.success(retirarTipo === 'baixa' ? 'Ferramenta baixada com sucesso!' : 'Ferramenta retirada!'); 
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
    setForm({ nome: f.nome, codigo: f.codigo || '', estado: f.estado, foto_url: f.foto_url || '', observacoes: f.observacoes || '', categoria: f.categoria || '', localizacao: f.localizacao || '', qr_code: f.qr_code || '' });
    setDialogOpen(true);
  };

  const filtered = ferramentas
    .filter((f: any) => {
      if (!showBaixadas && f.estado === 'baixa') return false;
      return f.nome.toLowerCase().includes(search.toLowerCase()) || (f.codigo && f.codigo.toLowerCase().includes(search.toLowerCase()));
    })
    .sort((a: any, b: any) => {
      const nomeComp = (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' });
      if (nomeComp !== 0) return nomeComp;
      return (a.codigo || '').localeCompare(b.codigo || '', 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

  const totalBaixadas = ferramentas.filter((f: any) => f.estado === 'baixa').length;

  const toggleAccordion = () => {
    if (accordionValue.length > 0) {
      setAccordionValue([]);
    } else {
      setAccordionValue([...FERRAMENTA_CATEGORIES, 'Sem Categoria']);
    }
  };

  const groupTools = groupDetails
    ? filtered.filter((f: any) => {
        const nameMatch = f.nome.toLowerCase().trim() === groupDetails.name.toLowerCase().trim();
        const catMatch = groupDetails.categoria 
          ? f.categoria === groupDetails.categoria 
          : !f.categoria;
        return nameMatch && catMatch;
      })
    : [];

  useEffect(() => {
    if (groupDetails && groupTools.length === 0) {
      setGroupDetails(null);
    }
  }, [groupTools, groupDetails]);

  const estadoBadge = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'disponivel': return <Badge className="bg-success/10 text-success border-success/20">Disponível</Badge>;
      case 'em_uso': return <Badge className="bg-warning/10 text-warning border-warning/20">Em uso</Badge>;
      case 'manutencao': return <Badge variant="destructive">Manutenção</Badge>;
      case 'extraviada': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Extraviada</Badge>;
      case 'baixa': return <Badge className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20">Baixa</Badge>;
      case 'comprado': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">A Receber</Badge>;
      default: return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader title="Ferramentas" count={ferramentas.length} search={search} onSearchChange={setSearch} searchPlaceholder="Buscar ferramenta..." />
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

        <div className="flex flex-wrap items-center gap-2 mt-3 select-none">
          {totalBaixadas > 0 && (
            <button
              onClick={() => setShowBaixadas(!showBaixadas)}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all px-3 py-1.5 rounded-xl ${
                showBaixadas
                  ? 'bg-zinc-500/20 text-zinc-300 hover:bg-zinc-500/30'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
              }`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${showBaixadas ? 'bg-zinc-400' : 'bg-white/20'}`} />
              {showBaixadas ? `Ocultando ferramentas baixadas (${totalBaixadas})` : `Ver ferramentas baixadas (${totalBaixadas})`}
            </button>
          )}

          <button
            onClick={() => setGroupByName(!groupByName)}
            className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all px-3 py-1.5 rounded-xl ${
              groupByName
                ? 'bg-primary/20 text-primary-foreground border border-primary/30 hover:bg-primary/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${groupByName ? 'bg-primary' : 'bg-white/20'}`} />
            {groupByName ? 'Ferramentas Agrupadas' : 'Agrupar por Nome'}
          </button>

          <button
            onClick={toggleAccordion}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all px-3 py-1.5 rounded-xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
          >
            {accordionValue.length > 0 ? (
              <><ArrowUpFromLine className="h-3.5 w-3.5 mr-1" /> Recolher Tudo</>
            ) : (
              <><ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Expandir Tudo</>
            )}
          </button>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma ferramenta encontrada' : 'Nenhuma ferramenta cadastrada'}</p>
      ) : (
        <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue} className="space-y-3">
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
                  {(() => {
                    const displayedItems: any[] = [];
                    if (groupByName) {
                      const groups = new Map<string, any[]>();
                      toolsInCat.forEach((f: any) => {
                        const key = f.nome.toLowerCase().trim();
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)!.push(f);
                      });

                      groups.forEach((groupTools, key) => {
                        const first = groupTools[0];
                        const total = groupTools.length;
                        const disponivel = groupTools.filter(t => t.estado === 'disponivel').length;
                        const emUso = groupTools.filter(t => t.estado === 'em_uso').length;
                        const manutencao = groupTools.filter(t => t.estado === 'manutencao').length;
                        const extraviada = groupTools.filter(t => t.estado === 'extraviada').length;
                        const baixa = groupTools.filter(t => t.estado === 'baixa').length;

                        displayedItems.push({
                          isGroup: true,
                          nome: first.nome,
                          foto_url: first.foto_url,
                          categoria: first.categoria,
                          tools: groupTools,
                          stats: { total, disponivel, emUso, manutencao, extraviada, baixa }
                        });
                      });
                    } else {
                      toolsInCat.forEach((f: any) => {
                        displayedItems.push({
                          isGroup: false,
                          ...f
                        });
                      });
                    }

                    return displayedItems.map((item: any) => {
                      if (item.isGroup) {
                        return (
                          <Card 
                            key={`group-${item.nome}`} 
                            className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.995]" 
                            onClick={() => setGroupDetails({ name: item.nome, categoria: item.categoria, tools: item.tools })}
                          >
                            <CardContent className="p-4 flex items-center gap-4">
                              <ImageThumbnail src={item.foto_url} alt={item.nome} type="ferramenta" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">{item.nome}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight bg-muted px-1.5 py-0.5 rounded">
                                    {item.stats.total} {item.stats.total === 1 ? 'unidade' : 'unidades'}
                                  </span>
                                  {item.stats.disponivel > 0 && (
                                    <Badge className="bg-success/10 text-success border-success/20 text-[9px] font-sans">
                                      {item.stats.disponivel} Disp.
                                    </Badge>
                                  )}
                                  {item.stats.emUso > 0 && (
                                    <Badge className="bg-warning/10 text-warning border-warning/20 text-[9px] font-sans">
                                      {item.stats.emUso} Em uso
                                    </Badge>
                                  )}
                                  {item.stats.manutencao > 0 && (
                                    <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] font-sans">
                                      {item.stats.manutencao} Manut.
                                    </Badge>
                                  )}
                                  {item.stats.extraviada > 0 && (
                                    <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[9px] font-sans">
                                      {item.stats.extraviada} Extrav.
                                    </Badge>
                                  )}
                                  {item.stats.baixa > 0 && (
                                    <Badge className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20 text-[9px] font-sans">
                                      {item.stats.baixa} Baixa
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="text-primary text-[10px] uppercase font-bold shrink-0 flex items-center gap-1">
                                Ver itens ➔
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      return (
                        <Card key={item.id} className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.995]" onClick={() => setSelectedTool(item)}>
                          <CardContent className="p-4 flex items-center gap-4">
                            <ImageThumbnail src={item.foto_url} alt={item.nome} type="ferramenta" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{item.nome}</p>
                              <div className="flex items-center gap-2">
                                {item.codigo && <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Cód: {item.codigo}</p>}
                                {item.localizacao && <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight bg-muted px-1.5 py-0.5 rounded">Loc: {item.localizacao}</p>}
                                {item.pessoas?.nome && <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">• Com: {item.pessoas.nome}</p>}
                              </div>
                            </div>
                            {estadoBadge(item.estado)}
                          </CardContent>
                        </Card>
                      );
                    });
                  })()}
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
                    {selectedTool.localizacao && <p className="text-sm font-medium mt-1">Loc: {selectedTool.localizacao}</p>}
                    {selectedTool.pessoas?.nome && <p className="text-sm text-muted-foreground mt-1">Com: {selectedTool.pessoas.nome}</p>}
                    {selectedTool.data_retirada && <p className="text-xs text-muted-foreground">Retirada: {new Date(selectedTool.data_retirada).toLocaleDateString('pt-BR')}</p>}
                  </div>
                </div>
                 {selectedTool.estado === 'comprado' && (
                  <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-xs text-blue-500 font-medium dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400">
                    Esta ferramenta foi comprada, mas ainda não foi entregue (Aguardando Entrada Real na aba Entradas).
                  </div>
                )}
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
                {selectedTool.estado === 'baixa' && (
                  <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-center text-xs text-zinc-500 font-medium">
                    Esta ferramenta foi dada como baixa (descarte).
                  </div>
                )}
                <Button variant="outline" className="w-full h-12 bg-[#0e1629] text-white hover:bg-white/10" onClick={() => setQrCodeOpen(true)}>
                  <QrCode className="h-4 w-4 mr-1.5 text-primary" /> Gerar QR Code
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { startEdit(selectedTool); setSelectedTool(null); }}><Pencil className="h-4 w-4 mr-1.5" /> Editar</Button>
                  {isAdmin && (
                    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(selectedTool.id); setSelectedTool(null); }}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>

      {/* Retirar Dialog */}
      <Dialog open={retirarOpen} onOpenChange={(open) => { setRetirarOpen(open); if (!open) { setRetirarTipo('uso'); setRetirarPessoaId(''); setRetirarObservacao(''); }}}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retirar / Dar Baixa em Ferramenta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); selectedTool && retirar.mutate({ id: selectedTool.id, pessoaId: retirarPessoaId, observacao: retirarObservacao, tipo: retirarTipo }); }} className="space-y-3">
            <Select value={retirarTipo} onValueChange={(v: 'uso' | 'manutencao' | 'baixa') => { setRetirarTipo(v); setRetirarPessoaId(''); }}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Finalidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="uso">Retirar para Uso</SelectItem>
                <SelectItem value="manutencao">Enviar para Manutenção</SelectItem>
                <SelectItem value="baixa">Dar Baixa (Descarte / Lixo)</SelectItem>
              </SelectContent>
            </Select>

            {retirarTipo !== 'baixa' && (
              <Select value={retirarPessoaId} onValueChange={setRetirarPessoaId}>
                <SelectTrigger className="h-12"><SelectValue placeholder={retirarTipo === 'uso' ? "Responsável *" : "Responsável (opcional)"} /></SelectTrigger>
                <SelectContent>{pessoas.filter((p: any) => p.status !== 'DEMITIDO').map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            )}

            {retirarTipo === 'baixa' && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive font-medium">
                ⚠️ Esta ação marcará a ferramenta como <strong>BAIXA</strong>. Ela não aparecerá mais como disponível. Esta ação pode ser revertida manualmente editando a ferramenta.
              </div>
            )}

            <input
              className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={retirarTipo === 'baixa' ? 'Motivo da baixa (ex: quebrada, sem conserto...)' : 'Observação (opcional)'}
              value={retirarObservacao}
              onChange={e => setRetirarObservacao(e.target.value)}
            />

            {retirarTipo === 'baixa' ? (
              <Button type="submit" className="w-full h-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={retirar.isPending}>
                {retirar.isPending ? 'Registrando...' : '🗑️ Confirmar Baixa da Ferramenta'}
              </Button>
            ) : (
              <Button type="submit" className="w-full h-12 bg-warning hover:bg-warning/90 text-warning-foreground" disabled={retirar.isPending || (retirarTipo === 'uso' && !retirarPessoaId)}>
                {retirar.isPending ? 'Registrando...' : 'Confirmar Retirada'}
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit */}
      <Dialog open={dialogOpen && !!editingId} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Ferramenta' : 'Nova Ferramenta'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
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
            <Input placeholder="Localização (Ex: Armário 1)" value={form.localizacao} onChange={e => setForm(f => ({ ...f, localizacao: e.target.value }))} className="h-12" />
            <Input placeholder="Código QR Code (Ex: F01 - opcional)" value={form.qr_code} onChange={e => setForm(f => ({ ...f, qr_code: e.target.value }))} className="h-12" />
            <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className="h-12" />
            <Button type="submit" className="w-full h-12" disabled={save.isPending || !form.nome || !form.categoria}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Confirmation Dialog */}
      <Dialog open={renameConfirmOpen} onOpenChange={setRenameConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                <HelpCircle className="h-6 w-6" />
              </div>
              <DialogTitle className="font-display font-bold text-xl text-foreground">
                Alteração de Nome de Ferramenta
              </DialogTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Você alterou o nome da ferramenta de <strong className="text-foreground">"{renameOldName}"</strong> para <strong className="text-foreground">"{renameNewName}"</strong>.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              Como deseja aplicar esta alteração?
            </p>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setRenameConfirmOpen(false);
                save.mutate('type');
              }}
              className="w-full text-left p-3.5 rounded-xl border border-border bg-card hover:bg-accent/40 transition-all group flex flex-col gap-1.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                Renomear todo o tipo de ferramenta
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Recomendado</span>
              </span>
              <span className="text-xs text-muted-foreground leading-normal">
                Altera o nome de todas as unidades deste modelo e atualiza os custos/estoque de forma unificada na aba Financeiro.
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRenameConfirmOpen(false);
                save.mutate('unit');
              }}
              className="w-full text-left p-3.5 rounded-xl border border-border bg-card hover:bg-accent/40 transition-all group flex flex-col gap-1.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground group-hover:scale-110 transition-transform" />
                Renomear apenas esta unidade
              </span>
              <span className="text-xs text-muted-foreground leading-normal">
                Altera o nome apenas para esta ferramenta física. Cria um novo registro financeiro zerado na aba Financeiro para este novo nome.
              </span>
            </button>
          </div>

          <div className="flex gap-3 justify-end mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameConfirmOpen(false)}
              className="h-11 px-6 rounded-lg text-sm font-medium"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Ferramenta" description="Tem certeza? Isso removerá permanentemente a ferramenta." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />

      {/* Group Details Dialog */}
      <Dialog open={!!groupDetails} onOpenChange={(open) => !open && setGroupDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="flex flex-row items-center gap-4 text-left">
            {groupTools[0] && (
              <ImageThumbnail src={groupTools[0].foto_url} alt={groupDetails?.name} type="ferramenta" size="sm" />
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-display font-bold text-lg">
                {groupDetails?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {groupTools.length} {groupTools.length === 1 ? 'unidade' : 'unidades'} neste grupo
              </p>
            </div>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 border-white/10 hover:bg-white/5"
                onClick={() => setAddUnitsDialog({
                  open: true,
                  nome: groupDetails?.name || '',
                  quantidade: String(groupTools.length),
                  categoria: groupDetails?.categoria || ''
                })}
              >
                <Pencil className="h-3.5 w-3.5" />
                Ajustar Total
              </Button>
            )}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 mt-4">
            {groupTools.map((tool: any) => (
              <Card 
                key={tool.id} 
                className="border border-muted bg-white dark:bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.995]" 
                onClick={() => {
                  setSelectedTool(tool);
                }}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate mb-1">{tool.nome}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight bg-muted px-1.5 py-0.5 rounded">
                        QR: {tool.qr_code || `F-${tool.id.substring(0, 6).toUpperCase()}`}
                      </span>
                      {tool.codigo && (
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight bg-muted px-1.5 py-0.5 rounded">
                          Cód: {tool.codigo}
                        </span>
                      )}
                      {tool.localizacao && (
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight bg-muted px-1.5 py-0.5 rounded">
                          Loc: {tool.localizacao}
                        </span>
                      )}
                      {tool.pessoas?.nome && (
                        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                          • Com: {tool.pessoas.nome}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {estadoBadge(tool.estado)}
                    <span className="text-primary text-xs font-bold">➔</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Finalidade *</label>
                    <Select value={scanRetirarTipo} onValueChange={(v: 'uso' | 'manutencao') => setScanRetirarTipo(v)}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Selecione a finalidade..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uso">Retirar para Uso</SelectItem>
                        <SelectItem value="manutencao">Enviar para Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quem está retirando? {scanRetirarTipo === 'uso' && '*'}</label>
                    <Select value={scanPessoaId} onValueChange={setScanPessoaId}>
                      <SelectTrigger className="h-11"><SelectValue placeholder={scanRetirarTipo === 'uso' ? "Selecione o responsável..." : "Responsável (opcional)"} /></SelectTrigger>
                      <SelectContent>
                        {pessoas.filter((p: any) => p.status !== 'DEMITIDO').map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Observação (opcional)</label>
                    <Input placeholder="Ex: Retirando para obra de reforço" value={scanObservacao} onChange={e => setScanObservacao(e.target.value)} className="h-11" />
                  </div>
                  <Button className="w-full h-12 bg-warning text-warning-foreground hover:bg-warning/90 font-bold" onClick={() => retirar.mutate({ id: scannedTool.id, pessoaId: scanPessoaId, observacao: scanObservacao, tipo: scanRetirarTipo })} disabled={retirar.isPending || (scanRetirarTipo === 'uso' && !scanPessoaId)}>
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

      {/* Dialog for adjusting total units of a tool group */}
      <Dialog open={!!addUnitsDialog?.open} onOpenChange={(open) => !open && setAddUnitsDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Quantidade Total de Ferramentas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Ajuste a quantidade total desejada para a ferramenta <strong>{addUnitsDialog?.nome}</strong>.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold">Quantidade Total Desejada:</label>
              <Input
                type="number"
                min="0"
                value={addUnitsDialog?.quantidade || ''}
                onChange={(e) => setAddUnitsDialog(prev => prev ? { ...prev, quantidade: e.target.value } : null)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setAddUnitsDialog(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={setExactToolCount.isPending}
              onClick={() => {
                if (!addUnitsDialog) return;
                const target = parseInt(addUnitsDialog.quantidade, 10);
                if (isNaN(target) || target < 0) {
                  toast.error('Informe uma quantidade válida');
                  return;
                }
                setExactToolCount.mutate({
                  nome: addUnitsDialog.nome,
                  targetTotal: target,
                  categoria: addUnitsDialog.categoria
                });
              }}
            >
              {setExactToolCount.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar Ajuste
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
