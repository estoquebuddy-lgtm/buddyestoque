import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function AlterarSenhaDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (novaSenha.length < 6) {
      toast.error('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast.error('A nova senha e a confirmação não coincidem');
      return;
    }

    setLoading(true);
    try {
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: senhaAtual,
      });

      if (signInError) {
        toast.error('Senha atual incorreta');
        setLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (updateError) {
        toast.error(updateError.message);
      } else {
        toast.success('Senha alterada com sucesso');
        resetForm();
        setOpen(false);
      }
    } catch {
      toast.error('Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10">
          <KeyRound className="h-4 w-4 mr-1" /> Senha
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar Senha</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input id="senha-atual" type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} required className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input id="nova-senha" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required minLength={6} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
            <Input id="confirmar-senha" type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} required minLength={6} className="h-12" />
          </div>
          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Alterando...</> : 'Alterar Senha'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
