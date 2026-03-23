import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';

export default function EntradasTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ produto_id: '', quantidade: '', valor_unitario: '', fornecedor: '', observacao: '' });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('produtos').select('id, nome').eq('obra_id', obraId).order('nome');
      return data || [];
    },
  });

  const { data: entradas = [] } = useQuery({
    queryKey: ['entradas', obraId],
    queryFn: async () => {
      const { data } = await supabase.from('entradas').select('*, produtos(nome)').eq('obra_id', obraId).order('data', { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('entradas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('entradas').insert({
        obra_id: obraId,
        produto_id: form.produto_id,
        quantidade: Number(form.quantidade),
        valor_unitario: Number(form.valor_unitario) || 0,
        fornecedor: form.fornecedor || null,
        observacao: form.observacao || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      setOpen(false);
      setForm({ produto_id: '', quantidade: '', valor_unitario: '', fornecedor: '', observacao: '' });
      toast.success('Entrada registrada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Entradas</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Entrada</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Entrada</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <Select value={form.produto_id} onValueChange={v => setForm(f => ({ ...f, produto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {produtos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Quantidade *" type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} required />
              <Input placeholder="Valor unitário" type="number" step="0.01" value={form.valor_unitario} onChange={e => setForm(f => ({ ...f, valor_unitario: e.target.value }))} />
              <Input placeholder="Fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} />
              <Input placeholder="Observação" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
              <Button type="submit" className="w-full" disabled={create.isPending || !form.produto_id}>
                {create.isPending ? 'Registrando...' : 'Registrar Entrada'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {entradas.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma entrada registrada</p>
      ) : (
        <div className="space-y-2">
          {entradas.map((e: any) => (
            <Card key={e.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <ArrowDownToLine className="h-5 w-5 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{e.produtos?.nome}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.data).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className="text-sm font-semibold text-success">+{Number(e.quantidade)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
