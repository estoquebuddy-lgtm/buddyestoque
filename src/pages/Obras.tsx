import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="bg-white/95 backdrop-blur-md px-6 py-4 sticky top-0 z-50 shadow-sm border-b border-slate-200/50">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <img 
              src="https://cmiqyagqhklazbouwudl.supabase.co/storage/v1/object/public/public-assets/PNG%20sem%20fundo%20-%20LOGO%20Buddy.png" 
              alt="Buddy Boutique Construtora" 
              className="h-10 w-auto object-contain hover:scale-105 transition-transform duration-300"
            />
            <div className="h-5 w-[1px] bg-slate-200 hidden sm:block"></div>
            <h1 className="text-sm font-display font-black tracking-[0.2em] text-slate-800 uppercase hidden sm:block">Suprimentos</h1>
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/usuarios')} className="text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-all duration-200">
                <Shield className="h-4 w-4 mr-1.5 text-slate-500" /> Usuários
              </Button>
            )}
            <AlterarSenhaDialog className="text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-all duration-200" />
            <Button variant="ghost" size="sm" onClick={signOut} className="text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-xl font-semibold text-xs transition-all duration-200">
              <LogOut className="h-4 w-4 mr-1.5 text-slate-500" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-10 px-6 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-black text-slate-800 tracking-tight">Minhas Obras</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#0e1629] text-white hover:bg-slate-800 rounded-2xl h-11 px-5 shadow-md hover:shadow-lg transition-all duration-200 font-semibold text-sm">
                <Plus className="h-4 w-4 mr-1.5" /> Nova Obra
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border border-slate-100">
              <DialogHeader>
                <DialogTitle className="font-display font-bold text-slate-800 text-lg">Nova Obra</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createObra.mutate(); }} className="space-y-4 pt-2">
                <Input placeholder="Nome da obra *" value={nome} onChange={(e) => setNome(e.target.value)} required className="h-12 rounded-xl" />
                <Input placeholder="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="h-12 rounded-xl" />
                <Input placeholder="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="h-12 rounded-xl" />
                <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl" disabled={createObra.isPending}>
                  {createObra.isPending ? 'Criando...' : 'Criar Obra'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? <SkeletonList count={3} /> : obras.length === 0 ? (
          <Card className="text-center py-20 border border-slate-100 shadow-sm rounded-3xl bg-white">
            <CardContent>
              <Building2 className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-lg text-muted-foreground">Nenhuma obra cadastrada</p>
              <p className="text-sm text-muted-foreground mt-1">Crie sua primeira obra para começar</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {obras.map((obra: any, i: number) => (
              <motion.div key={obra.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card 
                  className="group cursor-pointer border border-slate-200/50 shadow-md shadow-slate-100/50 hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300/60 rounded-3xl transition-all duration-300 active:scale-[0.995] bg-white overflow-hidden" 
                  onClick={() => navigate(`/obra/${obra.id}`)}
                >
                  <CardContent className="p-6 flex items-center gap-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0e1629] to-slate-800 text-white shadow-inner shrink-0 group-hover:scale-105 transition-transform duration-300">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-lg text-slate-850 group-hover:text-primary transition-colors duration-200 truncate">{obra.nome}</p>
                      {obra.endereco && (
                        <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 truncate mt-1.5">
                          <MapPin className="h-3.5 w-3.5 text-blue-500/80 shrink-0" /> {obra.endereco}
                        </p>
                      )}
                      {obra.responsavel && (
                        <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-1">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {obra.responsavel}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-1 transition-all duration-300 shrink-0" />
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
