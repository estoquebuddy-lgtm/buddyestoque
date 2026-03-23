import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Package, Plus, LogOut, Building2, MapPin, User } from 'lucide-react';
import { toast } from 'sonner';

export default function Obras() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [responsavel, setResponsavel] = useState('');

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ['obras'],
    queryFn: async () => {
      const { data, error } = await supabase.from('obras').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createObra = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('obras').insert({ nome, endereco, responsavel, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      setOpen(false);
      setNome('');
      setEndereco('');
      setResponsavel('');
      toast.success('Obra criada!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-display font-bold">ESTOQUE BUDDY</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1" /> Sair
        </Button>
      </header>

      <main className="container max-w-2xl py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Minhas Obras</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Obra</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Obra</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); createObra.mutate(); }} className="space-y-4">
                <Input placeholder="Nome da obra" value={nome} onChange={e => setNome(e.target.value)} required />
                <Input placeholder="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} />
                <Input placeholder="Responsável" value={responsavel} onChange={e => setResponsavel(e.target.value)} />
                <Button type="submit" className="w-full" disabled={createObra.isPending}>
                  {createObra.isPending ? 'Criando...' : 'Criar Obra'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : obras.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhuma obra cadastrada</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {obras.map((obra: any) => (
              <Card
                key={obra.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/obra/${obra.id}`)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{obra.nome}</p>
                    {obra.endereco && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" /> {obra.endereco}
                      </p>
                    )}
                    {obra.responsavel && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" /> {obra.responsavel}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${obra.status === 'ativa' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {obra.status}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
