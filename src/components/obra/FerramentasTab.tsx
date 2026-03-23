import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Hand, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import SearchBar from '@/components/SearchBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';

export default function FerramentasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '' });
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [retirarOpen, setRetirarOpen] = useState(false);
  const [retirarPessoaId, setRetirarPessoaId] = useState('');

  const { data: ferramentas = [], isLoading } = useQuery({
    queryKey: ['ferramentas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ferramentas').select('*, pessoas:responsavel_id(nome)').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      return data;
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome');
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('ferramentas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ferramentas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        obra_id: obraId,
        nome: form.nome,
        codigo: form.codigo || null,
        estado: form.estado,
        foto_url: form.foto_url || null,
        observacoes: form.observacoes || null,
      };
      if (editingId) {
        const { error } = await supabase.from('ferramentas').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ferramentas').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '' });
      toast.success(editingId ? 'Ferramenta atualizada!' : 'Ferramenta adicionada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ferramentas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      setDeleteId(null);
      toast.success('Ferramenta excluída!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const retirar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ferramentas').update({
        estado: 'em_uso',
        responsavel_id: retirarPessoaId || null,
        data_retirada: new Date().toISOString(),
        data_devolucao: null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      setRetirarOpen(false);
      setSelectedTool(null);
      setRetirarPessoaId('');
      toast.success('Ferramenta retirada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const devolver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ferramentas').update({
        estado: 'disponivel',
        responsavel_id: null,
        data_devolucao: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      setSelectedTool(null);
      toast.success('Ferramenta devolvida!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (f: any) => {
    setEditingId(f.id);
    setForm({ nome: f.nome, codigo: f.codigo || '', estado: f.estado, foto_url: f.foto_url || '', observacoes: f.observacoes || '' });
    setDialogOpen(true);
  };

  const filtered = ferramentas.filter((f: any) =>
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.codigo && f.codigo.toLowerCase().includes(search.toLowerCase()))
  );

  const estadoStyle = (estado: string) => {
    switch (estado) {
      case 'disponivel': return 'bg-success/10 text-success';
      case 'em_uso': return 'bg-warning/10 text-warning';
      case 'manutencao': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const estadoLabel = (estado: string) => {
    switch (estado) {
      case 'disponivel': return 'Disponível';
      case 'em_uso': return 'Em uso';
      case 'manutencao': return 'Manutenção';
      default: return estado;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg">Ferramentas ({ferramentas.length})</h3>
        <Button size="sm" onClick={() => { setEditingId(null); setForm({ nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '' }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Buscar ferramenta..." />

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">
          {search ? 'Nenhuma ferramenta encontrada' : 'Nenhuma ferramenta cadastrada'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((f: any) => (
            <Card key={f.id} className="shadow-sm border-none hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]" onClick={() => setSelectedTool(f)}>
              <CardContent className="p-3 flex items-center gap-3">
                <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{f.nome}</p>
                  {f.codigo && <p className="text-xs text-muted-foreground">Cód: {f.codigo}</p>}
                  {f.pessoas?.nome && <p className="text-xs text-muted-foreground">Com: {f.pessoas.nome}</p>}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${estadoStyle(f.estado)}`}>
                  {estadoLabel(f.estado)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tool Detail Sheet */}
      <Sheet open={!!selectedTool} onOpenChange={(open) => !open && setSelectedTool(null)}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
          {selectedTool && (
            <SheetHeader>
              <SheetTitle className="text-left">{selectedTool.nome}</SheetTitle>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <ImageThumbnail src={selectedTool.foto_url} alt={selectedTool.nome} type="ferramenta" size="md" />
                  <div>
                    <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full ${estadoStyle(selectedTool.estado)}`}>
                      {estadoLabel(selectedTool.estado)}
                    </span>
                    {selectedTool.pessoas?.nome && <p className="text-sm text-muted-foreground mt-1">Com: {selectedTool.pessoas.nome}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {selectedTool.estado === 'disponivel' ? (
                    <Button className="col-span-2 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => setRetirarOpen(true)}>
                      <Hand className="h-4 w-4 mr-1" /> Retirar
                    </Button>
                  ) : selectedTool.estado === 'em_uso' ? (
                    <Button className="col-span-2 bg-success hover:bg-success/90 text-success-foreground" onClick={() => devolver.mutate(selectedTool.id)} disabled={devolver.isPending}>
                      <RotateCcw className="h-4 w-4 mr-1" /> {devolver.isPending ? 'Devolvendo...' : 'Devolver'}
                    </Button>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { startEdit(selectedTool); setSelectedTool(null); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => { setDeleteId(selectedTool.id); setSelectedTool(null); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
          <form onSubmit={e => { e.preventDefault(); selectedTool && retirar.mutate(selectedTool.id); }} className="space-y-3">
            <Select value={retirarPessoaId} onValueChange={setRetirarPessoaId}>
              <SelectTrigger><SelectValue placeholder="Responsável (opcional)" /></SelectTrigger>
              <SelectContent>
                {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" className="w-full bg-warning hover:bg-warning/90 text-warning-foreground h-12" disabled={retirar.isPending}>
              {retirar.isPending ? 'Registrando...' : 'Confirmar Retirada'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Ferramenta' : 'Nova Ferramenta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <ImageUpload bucket="ferramentas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            <Input placeholder="Código" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
            <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            <Button type="submit" className="w-full h-12" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Ferramenta"
        description="Tem certeza? Isso removerá permanentemente a ferramenta."
        onConfirm={() => deleteId && remove.mutate(deleteId)}
        loading={remove.isPending}
      />
    </div>
  );
}
