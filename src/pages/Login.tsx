import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Package, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isResetPassword) {
      const { error } = await resetPassword(email);
      setLoading(false);
      if (error) {
        toast.error(error.message);
      } else {
        setResetSent(true);
      }
      return;
    }

    const { error } = isSignUp ? await signUp(email, password) : await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else if (isSignUp) {
      setConfirmationSent(true);
    }
  };

  if (confirmationSent || resetSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <Card className="shadow-xl border-none">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MailCheck className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">
                {resetSent ? 'Link de recuperação enviado' : 'Verifique seu e-mail'}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {resetSent 
                  ? <>Enviamos um link para redefinir sua senha para <strong className="text-foreground">{email}</strong>.</>
                  : <>Enviamos um link de confirmação para <strong className="text-foreground">{email}</strong>. Clique no link para ativar sua conta.</>
                }
              </p>
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setConfirmationSent(false);
                    setResetSent(false);
                    setIsSignUp(false);
                    setIsResetPassword(false);
                  }}
                >
                  <LogIn className="mr-2 h-4 w-4" /> Voltar para login
                </Button>
              </div>
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
              <Package className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">ESTOQUE BUDDY</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isResetPassword ? 'Recupere sua senha de acesso' : isSignUp ? 'Crie sua conta para começar' : 'Controle de estoque inteligente'}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="h-12"
              />
              {!isResetPassword && (
                <Input
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={!isResetPassword}
                  minLength={6}
                  className="h-12"
                />
              )}
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isResetPassword ? (
                  <><MailCheck className="mr-2 h-5 w-5" /> Enviar link de recuperação</>
                ) : isSignUp ? (
                  <><UserPlus className="mr-2 h-5 w-5" /> Criar Conta</>
                ) : (
                  <><LogIn className="mr-2 h-5 w-5" /> Entrar</>
                )}
              </Button>
            </form>

            {!isResetPassword && (
              <div className="mt-4 flex flex-col space-y-3">
                <button
                  type="button"
                  onClick={() => setIsResetPassword(true)}
                  className="w-full text-center text-sm font-medium text-primary hover:underline"
                >
                  Esqueceu sua senha?
                </button>
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isSignUp ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
                </button>
              </div>
            )}
            {isResetPassword && (
              <button
                type="button"
                onClick={() => setIsResetPassword(false)}
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar para login
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
