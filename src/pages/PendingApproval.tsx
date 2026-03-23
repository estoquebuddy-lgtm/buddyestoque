import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';

export default function PendingApproval() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="shadow-xl border-none">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Aguardando Aprovação</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sua conta <strong className="text-foreground">{user?.email}</strong> foi criada com sucesso, mas precisa ser aprovada por um administrador antes de poder acessar o sistema.
            </p>
            <p className="text-xs text-muted-foreground">
              Você será notificado quando sua conta for liberada.
            </p>
            <div className="pt-2">
              <Button variant="outline" className="w-full" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
