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

export default function ProdutosTab({ obraId }: { obraId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: '', categoria: '', unidade: 'un', estoque_minimo: '0', custo_unitario: '0', fornecedor: '', localizacao: '', foto_url: '', observacoes: '' });

  const { data: produtos = [] } = useQuery({
    queryKey: ['produtos', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from('produtos').select('*').eq('obra_id', obraId).order('nome');
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('produtos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `obra_id=eq.${obraId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [obraId, queryClient]);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('produtos').insert({
        obra_id: obraId,
        nome: form.nome,
        categoria: form.categoria || null,
        unidade: form.unidade,
        estoque_minimo: Number(form.estoque_minimo),
        custo_unitario: Number(form.custo_unitario),
        fornecedor: form.fornecedor || null,
        localizacao: form.localizacao || null,
        foto_url: form.foto_url || null,
        observacoes: form.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      setOpen(false);
      setForm({ nome: '', categoria: '', unidade: 'un', estoque_minimo: '0', custo_unitario: '0', fornecedor: '', localizacao: '', foto_url: '', observacoes: '' });
      toast.success('Produto adicionado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getStockColor = (atual: number, minimo: number) => {
    if (atual <= 0) return 'bg-destructive/10 text-destructive';
    if (atual <= minimo) return 'bg-warning/10 text-warning';
    return 'bg-success/10 text-success';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Produtos ({produtos.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Produto</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <ImageUpload bucket="produtos" currentUrl={form.foto_url} onUpload={url => setForm(f => ({ ...f, foto_url: url }))} />
              <Input placeholder="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
              <Input placeholder="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Unidade" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} />
                <Input placeholder="Estoque mínimo" type="number" value={form.estoque_minimo} onChange={e => setForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
              </div>
              <Input placeholder="Custo unitário" type="number" step="0.01" value={form.custo_unitario} onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))} />
              <Input placeholder="Fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} />
              <Input placeholder="Localização" value={form.localizacao} onChange={e => setForm(f => ({ ...f, localizacao: e.target.value }))} />
              <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {produtos.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">Nenhum produto cadastrado</p>
      ) : (
        <div className="space-y-2">
          {produtos.map((p: any) => (
            <Card key={p.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <ImageThumbnail src={p.foto_url} alt={p.nome} type="produto" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.nome}</p>
                  {p.categoria && <p className="text-xs text-muted-foreground">{p.categoria}</p>}
                </div>
                <div className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${getStockColor(Number(p.estoque_atual), Number(p.estoque_minimo))}`}>
                  {Number(p.estoque_atual)} {p.unidade}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
