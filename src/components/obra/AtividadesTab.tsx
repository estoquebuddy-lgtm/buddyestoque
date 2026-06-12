import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { History, User, Trash2 } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import SkeletonList from '@/components/SkeletonList';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useState } from 'react';
import { toast } from 'sonner';

export default function AtividadesTab({ obraId }: { obraId: string }) {
  const { isAdmin } = useProfile();
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const clearLogs = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('logs_atividades' as any).delete().eq('obra_id', obraId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      toast.success('Todas as atividades foram apagadas.');
      setDeleteConfirmOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [limit, setLimit] = useState(20);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['logs-atividades', obraId, limit],
    queryFn: async () => {
      const { data } = await supabase
        .from('logs_atividades' as any)
        .select('*')
        .eq('obra_id', obraId)
        .order('data', { ascending: false })
        .range(0, limit - 1);
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Atividades</h1>
        </div>
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Atividades Recentes</h1>
        </div>
        {isAdmin && logs.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Apagar Todas
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-primary" />
              Histórico no Sistema
            </h3>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma atividade registrada</p>
            ) : (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {logs.map((log: any) => (
                    <div key={log.id} className="flex gap-3 items-center p-3 bg-muted/30 rounded-xl border border-border/50 group hover:bg-muted/50 transition-colors">
                      <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                        <User className="h-5 w-5 text-primary/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-primary tracking-widest uppercase">{log.user_email?.split('@')[0] || 'Usuário'}</p>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(log.data).toLocaleDateString('pt-BR')} {new Date(log.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground font-medium mt-0.5 whitespace-pre-wrap break-words">{log.detalhes}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {logs.length === limit && (
                  <div className="flex justify-center mt-6">
                    <Button variant="outline" onClick={() => setLimit(prev => prev + 20)}>
                      Carregar Mais
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog 
        open={deleteConfirmOpen} 
        onOpenChange={setDeleteConfirmOpen} 
        title="Apagar Histórico" 
        description="Tem certeza de que deseja apagar permanentemente todas as atividades? Esta ação não pode ser desfeita." 
        onConfirm={() => clearLogs.mutate()} 
        loading={clearLogs.isPending} 
      />
    </div>
  );
}
