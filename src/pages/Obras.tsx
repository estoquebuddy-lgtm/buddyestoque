import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Package, Plus, LogOut, Building2, MapPin, User, ChevronRight, Shield } from 'lucide-react';
import AlterarSenhaDialog from '@/components/AlterarSenhaDialog';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import SkeletonList from '@/components/SkeletonList';

export default function Obras() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [responsavel, setResponsavel] = useState('');

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ['obras'],
    queryFn: async () => { const { data, error } = await supabase.from('obras').select('*').order('created_at', { ascending: false }); if (error) throw error; return data; },
  });

  const createObra = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('obras').insert({ nome, endereco, responsavel, user_id: user!.id }); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['obras'] }); setOpen(false); setNome(''); setEndereco(''); setResponsavel(''); toast.success('Obra criada!'); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-display font-bold tracking-tight">ESTOQUE BUDDY</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/usuarios')} className="text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10">
                <Shield className="h-4 w-4 mr-1" /> Usuários
              </Button>
            )}
            <AlterarSenhaDialog />
            <Button variant="ghost" size="sm" onClick={signOut} className="text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10">
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Minhas Obras</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1.5" /> Nova Obra</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Obra</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); createObra.mutate(); }} className="space-y-4">
                <Input placeholder="Nome da obra *" value={nome} onChange={e => setNome(e.target.value)} required className="h-12" />
                <Input placeholder="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} className="h-12" />
                <Input placeholder="Responsável" value={responsavel} onChange={e => setResponsavel(e.target.value)} className="h-12" />
                <Button type="submit" className="w-full h-12 text-base" disabled={createObra.isPending}>{createObra.isPending ? 'Criando...' : 'Criar Obra'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? <SkeletonList count={3} /> : obras.length === 0 ? (
          <Card className="text-center py-20 border-none shadow-sm">
            <CardContent>
              <Building2 className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-lg text-muted-foreground">Nenhuma obra cadastrada</p>
              <p className="text-sm text-muted-foreground mt-1">Crie sua primeira obra para começar</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {obras.map((obra: any, i: number) => (
              <motion.div key={obra.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="cursor-pointer border-none shadow-sm hover:shadow-md transition-all active:scale-[0.995]" onClick={() => navigate(`/obra/${obra.id}`)}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base truncate">{obra.nome}</p>
                      {obra.endereco && <p className="text-sm text-muted-foreground flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" /> {obra.endereco}</p>}
                      {obra.responsavel && <p className="text-sm text-muted-foreground flex items-center gap-1"><User className="h-3 w-3 shrink-0" /> {obra.responsavel}</p>}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
