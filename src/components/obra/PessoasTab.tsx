import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import ImageThumbnail from '@/components/ImageThumbnail';
import ImageUpload from '@/components/ImageUpload';

export default function PessoasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: '', funcao: '', telefone: '', foto_url: '' });

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from('pessoas').select('*').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('pessoas').insert({
        obra_id: obraId,
        nome: form.nome,
        funcao: form.funcao || null,
        telefone: form.telefone || null,
        foto_url: form.foto_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pessoas', obraId] });
      setOpen(false);
      setForm({ nome: '', funcao: '', telefone: '', foto_url: '' });
      toast.success('Pessoa adicionada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Pessoas ({pessoas.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Pessoa</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <ImageUpload bucket="pessoas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
              <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
              <Input placeholder="Função" value={form.funcao} onChange={e => setForm(f => ({ ...f, funcao: e.target.value }))} />
              <Input placeholder="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {pessoas.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma pessoa cadastrada</p>
      ) : (
        <div className="space-y-2">
          {pessoas.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <ImageThumbnail src={p.foto_url} alt={p.nome} type="pessoa" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nome}</p>
                  {p.funcao && <p className="text-xs text-muted-foreground">{p.funcao}</p>}
                </div>
                {p.telefone && <span className="text-xs text-muted-foreground">{p.telefone}</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
