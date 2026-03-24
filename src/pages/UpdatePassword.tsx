import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setSuccess(true);
      toast.success('Senha atualizada com sucesso!');
      setTimeout(() => {
        navigate('/obras');
      }, 2000);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <Card className="shadow-xl border-none">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">Senha Atualizada!</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sua senha foi alterada com sucesso. Você será redirecionado para o sistema em instantes...
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="shadow-xl border-none">
          <CardHeader className="text-center space-y-4 pb-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
              <Lock className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">Criar Nova Senha</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Digite sua nova senha abaixo
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Nova Senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-12"
              />
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Atualizar Senha'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
