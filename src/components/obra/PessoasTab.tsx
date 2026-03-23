import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import SearchBar from '@/components/SearchBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import SkeletonList from '@/components/SkeletonList';

const emptyForm = { nome: '', funcao: '', telefone: '', foto_url: '' };

export default function PessoasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: pessoas = [], isLoading } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from('pessoas').select('*').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        obra_id: obraId,
        nome: form.nome,
        funcao: form.funcao || null,
        telefone: form.telefone || null,
        foto_url: form.foto_url || null,
      };
      if (editingId) {
        const { error } = await supabase.from('pessoas').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pessoas').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pessoas', obraId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? 'Pessoa atualizada!' : 'Pessoa adicionada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pessoas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pessoas', obraId] });
      setDeleteId(null);
      toast.success('Pessoa excluída!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ nome: p.nome, funcao: p.funcao || '', telefone: p.telefone || '', foto_url: p.foto_url || '' });
    setDialogOpen(true);
  };

  const filtered = pessoas.filter((p: any) =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    (p.funcao && p.funcao.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg">Pessoas ({pessoas.length})</h3>
        <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Buscar pessoa..." />

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">
          {search ? 'Nenhuma pessoa encontrada' : 'Nenhuma pessoa cadastrada'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p: any) => (
            <Card key={p.id} className="shadow-sm border-none">
              <CardContent className="p-3 flex items-center gap-3">
                <ImageThumbnail src={p.foto_url} alt={p.nome} type="pessoa" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nome}</p>
                  {p.funcao && <p className="text-xs text-muted-foreground">{p.funcao}</p>}
                </div>
                {p.telefone && (
                  <a href={`tel:${p.telefone}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary" onClick={e => e.stopPropagation()}>
                    <Phone className="h-3 w-3" /> {p.telefone}
                  </a>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Pessoa' : 'Nova Pessoa'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <ImageUpload bucket="pessoas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            <Input placeholder="Função" value={form.funcao} onChange={e => setForm(f => ({ ...f, funcao: e.target.value }))} />
            <Input placeholder="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            <Button type="submit" className="w-full h-12" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Pessoa"
        description="Tem certeza? Isso removerá permanentemente a pessoa."
        onConfirm={() => deleteId && remove.mutate(deleteId)}
        loading={remove.isPending}
      />
    </div>
  );
}
