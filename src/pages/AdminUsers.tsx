import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, XCircle, Shield, UserCheck, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import SkeletonList from '@/components/SkeletonList';

export default function AdminUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ['admin-all-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*');
      if (error) throw error;
      return data;
    },
  });

  const updateApproval = useMutation({
    mutationFn: async ({ userId, approved }: { userId: string; approved: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ approved })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success(approved ? 'Usuário aprovado!' : 'Acesso revogado.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pendingUsers = users.filter((u: any) => !u.approved);
  const approvedUsers = users.filter((u: any) => u.approved);

  const getUserRoles = (userId: string) => {
    return allRoles
      .filter((r: any) => r.user_id === userId)
      .map((r: any) => r.role as string);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/obras')}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Shield className="h-5 w-5" />
            <h1 className="text-lg font-display font-bold tracking-tight">Gerenciar Usuários</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        {isLoading ? (
          <SkeletonList count={3} />
        ) : (
          <>
            {pendingUsers.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <h2 className="text-lg font-bold">Pendentes ({pendingUsers.length})</h2>
                </div>
                <div className="grid gap-3">
                  {pendingUsers.map((user: any, i: number) => (
                    <motion.div key={user.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{user.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Cadastrado em {new Date(user.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => updateApproval.mutate({ userId: user.id, approved: true })}
                              disabled={updateApproval.isPending}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-500" />
                <h2 className="text-lg font-bold">Aprovados ({approvedUsers.length})</h2>
              </div>
              {approvedUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum usuário aprovado ainda.</p>
              ) : (
                <div className="grid gap-3">
                  {approvedUsers.map((user: any, i: number) => {
                    const roles = getUserRoles(user.id);
                    const isAdmin = roles.includes('admin');
                    return (
                      <motion.div key={user.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <Card className="border-none shadow-sm">
                          <CardContent className="p-4 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1 flex items-center gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{user.email}</p>
                                  {isAdmin && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Shield className="h-3 w-3 mr-1" /> Admin
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Desde {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                            </div>
                            {!isAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateApproval.mutate({ userId: user.id, approved: false })}
                                disabled={updateApproval.isPending}
                                className="text-destructive hover:bg-destructive/10 shrink-0"
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Revogar
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
