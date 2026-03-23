import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';

export default function SaidasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ produto_id: '', quantidade: '', pessoa_id: '', observacao: '' });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('produtos').select('id, nome, estoque_atual, unidade').eq('obra_id', obraId).order('nome');
      return data || [];
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('pessoas').select('id, nome').eq('obra_id', obraId).order('nome');
      return data || [];
    },
  });

  const { data: saidas = [] } = useQuery({
    queryKey: ['saidas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('saidas').select('*, produtos(nome), pessoas(nome)').eq('obra_id', obraId).order('data', { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('saidas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['saidas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('saidas').insert({
        obra_id: obraId,
        produto_id: form.produto_id,
        quantidade: Number(form.quantidade),
        pessoa_id: form.pessoa_id || null,
        observacao: form.observacao || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saidas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      setOpen(false);
      setForm({ produto_id: '', quantidade: '', pessoa_id: '', observacao: '' });
      toast.success('Saída registrada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedProduct = produtos.find((p: any) => p.id === form.produto_id);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Saídas</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Saída</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Saída</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <Select value={form.produto_id} onValueChange={v => setForm(f => ({ ...f, produto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {produtos.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} (disp: {Number(p.estoque_atual)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground">Disponível: {Number(selectedProduct.estoque_atual)} {selectedProduct.unidade}</p>
              )}
              <Input placeholder="Quantidade *" type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} required />
              <Select value={form.pessoa_id} onValueChange={v => setForm(f => ({ ...f, pessoa_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Pessoa (opcional)" /></SelectTrigger>
                <SelectContent>
                  {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Observação" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
              <Button type="submit" className="w-full" disabled={create.isPending || !form.produto_id}>
                {create.isPending ? 'Registrando...' : 'Registrar Saída'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {saidas.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma saída registrada</p>
      ) : (
        <div className="space-y-2">
          {saidas.map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <ArrowUpFromLine className="h-5 w-5 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{s.produtos?.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.pessoas?.nome && `${s.pessoas.nome} • `}
                    {new Date(s.data).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span className="text-sm font-semibold text-destructive">-{Number(s.quantidade)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
