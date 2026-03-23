import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowUpFromLine, Wrench } from 'lucide-react';

export default function DashboardTab({ obraId }: { obraId: string }) {
  const { data: lowStock = [] } = useQuery({
    queryKey: ['low-stock', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('produtos')
        .select('*')
        .eq('obra_id', obraId)
        .filter('estoque_atual', 'lte', 'estoque_minimo' as any);
      // Manual filter since we can't do column comparison easily
      return (data || []).filter((p: any) => Number(p.estoque_atual) <= Number(p.estoque_minimo));
    },
  });

  const { data: todaySaidas = [] } = useQuery({
    queryKey: ['today-saidas', obraId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('saidas')
        .select('*, produtos(nome)')
        .eq('obra_id', obraId)
        .gte('data', today);
      return data || [];
    },
  });

  const { data: ferramentasEmUso = [] } = useQuery({
    queryKey: ['ferramentas-uso', obraId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ferramentas')
        .select('*, pessoas:responsavel_id(nome)')
        .eq('obra_id', obraId)
        .eq('estado', 'em_uso');
      return data || [];
    },
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" /> Estoque Baixo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos os produtos estão com estoque adequado ✓</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.map((p: any) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span>{p.nome}</span>
                  <span className="text-destructive font-medium">{Number(p.estoque_atual)} {p.unidade}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4 text-primary" /> Saídas de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaySaidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma saída registrada hoje</p>
          ) : (
            <ul className="space-y-2">
              {todaySaidas.map((s: any) => (
                <li key={s.id} className="flex justify-between text-sm">
                  <span>{s.produtos?.nome}</span>
                  <span className="font-medium">{Number(s.quantidade)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4 text-accent" /> Ferramentas em Uso
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ferramentasEmUso.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ferramenta em uso</p>
          ) : (
            <ul className="space-y-2">
              {ferramentasEmUso.map((f: any) => (
                <li key={f.id} className="flex justify-between text-sm">
                  <span>{f.nome}</span>
                  <span className="text-muted-foreground">{f.pessoas?.nome || '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
