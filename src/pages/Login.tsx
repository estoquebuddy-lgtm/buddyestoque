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
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="shadow-2xl border border-slate-100 rounded-3xl overflow-hidden bg-white">
          <CardHeader className="text-center space-y-4 pb-2 pt-8">
            <div className="mx-auto flex justify-center mb-2">
              <img 
                src="https://cmiqyagqhklazbouwudl.supabase.co/storage/v1/object/public/public-assets/PNG%20sem%20fundo%20-%20LOGO%20Buddy.png" 
                alt="Buddy Boutique Construtora" 
                className="h-28 w-auto object-contain hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div>
              <div className="h-[1px] w-20 bg-slate-200 mx-auto my-3"></div>
              <h1 className="text-xl font-display font-black tracking-[0.2em] text-slate-800 uppercase">Suprimentos</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                {isResetPassword ? 'Recuperação de Senha' : isSignUp ? 'Criar Nova Conta' : 'Controle de Suprimentos Inteligente'}
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
