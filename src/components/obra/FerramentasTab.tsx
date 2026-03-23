import { useState, useEffect } from 'react';
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

export default function FerramentasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '' });

  const { data: ferramentas = [] } = useQuery({
    queryKey: ['ferramentas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ferramentas').select('*, pessoas:responsavel_id(nome)').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      return data;
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

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ferramentas').insert({
        obra_id: obraId,
        nome: form.nome,
        codigo: form.codigo || null,
        estado: form.estado,
        foto_url: form.foto_url || null,
        observacoes: form.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ferramentas', obraId] });
      setOpen(false);
      setForm({ nome: '', codigo: '', estado: 'disponivel', foto_url: '', observacoes: '' });
      toast.success('Ferramenta adicionada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

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
        <h3 className="font-display font-semibold">Ferramentas ({ferramentas.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Ferramenta</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <ImageUpload bucket="ferramentas" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
              <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
              <Input placeholder="Código" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
              <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {ferramentas.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma ferramenta cadastrada</p>
      ) : (
        <div className="space-y-2">
          {ferramentas.map((f: any) => (
            <Card key={f.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{f.nome}</p>
                  {f.codigo && <p className="text-xs text-muted-foreground">Cód: {f.codigo}</p>}
                  {f.pessoas?.nome && <p className="text-xs text-muted-foreground">Com: {f.pessoas.nome}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${estadoStyle(f.estado)}`}>
                  {estadoLabel(f.estado)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
