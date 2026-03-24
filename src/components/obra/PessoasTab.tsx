import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Trash2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';
import PageHeader from '@/components/PageHeader';
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
    queryFn: async () => { const { data, error } = await supabase.from('pessoas').select('*').eq('obra_id', obraId).order('nome'); if (error) throw error; return data; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { obra_id: obraId, nome: form.nome, funcao: form.funcao || null, telefone: form.telefone || null, foto_url: form.foto_url || null };
      
      let res;
      if (editingId) { res = await supabase.from('pessoas').update(payload).eq('id', editingId); }
      else { res = await supabase.from('pessoas').insert(payload); }
      
      if (res.error) throw res.error;

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: editingId ? 'EDITAR' : 'CADASTRAR',
        entidade: 'EQUIPE',
        detalhes: `${editingId ? 'Editou' : 'Cadastrou'} o colaborador: ${form.nome}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pessoas', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDialogOpen(false); setEditingId(null); setForm(emptyForm); toast.success(editingId ? 'Pessoa atualizada!' : 'Pessoa adicionada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { 
      const { data: { user } } = await supabase.auth.getUser();
      const person = pessoas.find((p: any) => p.id === id);
      const { error } = await supabase.from('pessoas').delete().eq('id', id); if (error) throw error; 

      await supabase.from('logs_atividades' as any).insert({
        obra_id: obraId,
        user_id: user?.id,
        user_email: user?.email,
        acao: 'EXCLUIR',
        entidade: 'EQUIPE',
        detalhes: `Excluiu o colaborador: ${person?.nome || id}`
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pessoas', obraId] }); queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] }); setDeleteId(null); toast.success('Pessoa excluída!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (p: any) => { setEditingId(p.id); setForm({ nome: p.nome, funcao: p.funcao || '', telefone: p.telefone || '', foto_url: p.foto_url || '' }); setDialogOpen(true); };
  const filtered = pessoas.filter((p: any) => p.nome.toLowerCase().includes(search.toLowerCase()) || (p.funcao && p.funcao.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-[#0e1629] -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-[2.5rem] shadow-2xl border-b border-white/5">
        <div className="text-white">
          <PageHeader 
            title="Equipe" 
            search={search} 
            onSearchChange={setSearch} 
            searchPlaceholder="Buscar pessoa..." 
            actionLabel="Pessoa" 
            onAction={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }} 
          />
        </div>
        <div className="mt-4 flex gap-4">
           <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 backdrop-blur-sm">
              <p className="text-white/40 text-[10px] mb-1 uppercase tracking-[0.2em] font-bold">Total Equipe</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-display font-bold text-white leading-none">{pessoas.length}</span>
                <span className="text-xs text-white/30 mb-1">colaboradores</span>
              </div>
           </div>
        </div>
      </div>

      {isLoading ? <SkeletonList /> : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{search ? 'Nenhuma pessoa encontrada' : 'Nenhuma pessoa cadastrada'}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p: any) => (
            <Card key={p.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <ImageThumbnail src={p.foto_url} alt={p.nome} type="pessoa" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nome}</p>
                  {p.funcao && <p className="text-xs text-muted-foreground">{p.funcao}</p>}
                </div>
                {p.telefone && (
                  <a href={`tel:${p.telefone}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                    <Phone className="h-3 w-3" /> {p.telefone}
                  </a>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Pessoa' : 'Nova Pessoa'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <ImageUpload bucket="pessoas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
            <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required className="h-12" />
            <Input placeholder="Função" value={form.funcao} onChange={e => setForm(f => ({ ...f, funcao: e.target.value }))} className="h-12" />
            <Input placeholder="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="h-12" />
            <Button type="submit" className="w-full h-12" disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)} title="Excluir Pessoa" description="Tem certeza? Isso removerá permanentemente a pessoa." onConfirm={() => deleteId && remove.mutate(deleteId)} loading={remove.isPending} />
    </div>
  );
}
