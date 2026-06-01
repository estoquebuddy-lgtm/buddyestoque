import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Search, Wrench, User, Calendar, Hash, ChevronRight, Package } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import SkeletonList from '@/components/SkeletonList';
import ImageThumbnail from '@/components/ImageThumbnail';

interface Props {
  obraId: string;
}

export default function FerramentasFuncionarioTab({ obraId }: Props) {
  const [search, setSearch] = useState('');
  const [selectedPessoa, setSelectedPessoa] = useState<any | null>(null);

  // Busca ferramentas em uso e resolve nomes dentro do mesmo queryFn
  // (mesmo padrão do RelatorioFerramentasTab — evita race condition de joins em memória)
  const { data: ferramentas = [], isLoading } = useQuery({
    queryKey: ['ferramentas-funcionario', obraId],
    queryFn: async () => {
      const { data: ferramentasData, error } = await supabase
        .from('ferramentas')
        .select('*')
        .eq('obra_id', obraId)
        .eq('estado', 'em_uso')
        .not('responsavel_id', 'is', null)
        .order('nome');
      if (error) throw error;
      if (!ferramentasData || ferramentasData.length === 0) return [];

      // Resolve nomes de pessoas na mesma chamada
      const { data: pessoasData } = await supabase
        .from('pessoas')
        .select('id, nome, funcao, foto_url')
        .eq('obra_id', obraId);
      const pessoasMap = new Map((pessoasData || []).map((p: any) => [p.id, p]));

      return ferramentasData.map((f: any) => {
        const catMatch = f.observacoes?.match(/\[CAT:(.*?)\]/);
        const categoria = catMatch ? catMatch[1] : null;
        const cleanObs = f.observacoes?.replace(/\[CAT:.*?\]/, '').trim() || null;
        const pessoa = pessoasMap.get(f.responsavel_id) || { id: f.responsavel_id, nome: 'Desconhecido', funcao: null, foto_url: null };
        return { ...f, categoria, observacoes: cleanObs, pessoa };
      });
    },
  });


  // Agrupa ferramentas por responsavel_id usando os dados já resolvidos em f.pessoa
  const pessoasComFerramentas = useMemo(() => {
    const grupos: Record<string, { pessoa: any; ferramentas: any[] }> = {};

    ferramentas.forEach((f: any) => {
      if (!f.responsavel_id) return;
      if (!grupos[f.responsavel_id]) {
        grupos[f.responsavel_id] = {
          pessoa: f.pessoa,
          ferramentas: [],
        };
      }
      grupos[f.responsavel_id].ferramentas.push(f);
    });

    return Object.values(grupos).sort((a, b) =>
      a.pessoa.nome.localeCompare(b.pessoa.nome)
    );
  }, [ferramentas]);

  // Filtra por busca
  const filtered = useMemo(() =>
    pessoasComFerramentas.filter((g) =>
      g.pessoa.nome.toLowerCase().includes(search.toLowerCase()) ||
      g.ferramentas.some((f: any) =>
        f.nome?.toLowerCase().includes(search.toLowerCase()) ||
        f.codigo?.toLowerCase().includes(search.toLowerCase())
      )
    ),
    [pessoasComFerramentas, search]
  );


  const totalFerramentasEmUso = ferramentas.length;
  const totalFuncionariosComFerramentas = pessoasComFerramentas.length;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <h1 className="text-xl lg:text-2xl font-display font-bold">Ferramentas por Funcionário</h1>
        </div>
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="lg:hidden -ml-1" />
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold">Ferramentas por Funcionário</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ferramentas atualmente emprestadas agrupadas por responsável
          </p>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-primary/10 border shadow-sm bg-gradient-to-br from-[#0e1629] to-[#1a253e] text-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-bold">Em Posse</p>
              <p className="text-3xl font-display font-bold mt-1">{totalFerramentasEmUso}</p>
              <p className="text-xs text-white/50 mt-0.5">ferramentas emprestadas</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/20 shrink-0">
              <Wrench className="h-6 w-6 text-primary-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 border shadow-sm bg-[#161f30] text-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-bold">Funcionários</p>
              <p className="text-3xl font-display font-bold text-[#f59e0b] mt-1">{totalFuncionariosComFerramentas}</p>
              <p className="text-xs text-white/50 mt-0.5">com ferramentas em uso</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-[#f59e0b]/15 flex items-center justify-center border border-[#f59e0b]/20 shrink-0">
              <User className="h-6 w-6 text-[#f59e0b]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por funcionário ou ferramenta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11 bg-background"
        />
      </div>

      {/* Lista de funcionários */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Wrench className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground font-medium">
            {search
              ? 'Nenhum funcionário ou ferramenta encontrada'
              : 'Nenhuma ferramenta emprestada no momento'}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {!search && 'Ferramentas em uso aparecem aqui automaticamente'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ pessoa, ferramentas: ferrsPessoa }) => (
            <Card
              key={pessoa.id}
              className="border-border/50 border shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => setSelectedPessoa({ pessoa, ferramentas: ferrsPessoa })}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <User className="h-6 w-6 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm">{pessoa.nome}</p>
                      {pessoa.funcao && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {pessoa.funcao}
                        </span>
                      )}
                    </div>
                    {/* Lista resumida de ferramentas */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ferrsPessoa.slice(0, 3).map((f: any) => (
                        <span
                          key={f.id}
                          className="inline-flex items-center gap-1 text-[11px] bg-muted/70 text-muted-foreground px-2 py-0.5 rounded-md"
                        >
                          <Wrench className="h-2.5 w-2.5 shrink-0" />
                          {f.nome}
                          {f.codigo && <span className="opacity-60">#{f.codigo}</span>}
                        </span>
                      ))}
                      {ferrsPessoa.length > 3 && (
                        <span className="text-[11px] text-muted-foreground/60 self-center">
                          +{ferrsPessoa.length - 3} mais
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contador + seta */}
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge className="bg-primary/10 text-primary border-primary/20 font-bold text-xs">
                      {ferrsPessoa.length} {ferrsPessoa.length === 1 ? 'ferramenta' : 'ferramentas'}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Painel lateral de detalhes */}
      <Sheet open={!!selectedPessoa} onOpenChange={(open) => !open && setSelectedPessoa(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedPessoa && (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-base leading-tight">{selectedPessoa.pessoa.nome}</p>
                    {selectedPessoa.pessoa.funcao && (
                      <p className="text-xs text-muted-foreground font-normal">{selectedPessoa.pessoa.funcao}</p>
                    )}
                  </div>
                </SheetTitle>
              </SheetHeader>

              {/* Resumo */}
              <div className="mt-5 mb-4 p-4 rounded-xl bg-muted/40 border border-border/50 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                  <Wrench className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total em posse</p>
                  <p className="text-2xl font-display font-bold text-warning leading-none mt-0.5">
                    {selectedPessoa.ferramentas.length}
                    <span className="text-sm font-normal text-muted-foreground ml-1.5">
                      {selectedPessoa.ferramentas.length === 1 ? 'ferramenta' : 'ferramentas'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Lista detalhada */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
                  Ferramentas sob responsabilidade
                </p>
                {selectedPessoa.ferramentas.map((f: any) => (
                  <div
                    key={f.id}
                    className="p-4 rounded-xl border border-border/60 bg-card hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <ImageThumbnail src={f.foto_url} alt={f.nome} type="ferramenta" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm text-foreground">{f.nome}</p>
                          {f.categoria && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              {f.categoria}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          {f.codigo && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Hash className="h-3 w-3 shrink-0" />
                              <span>Código: <span className="font-mono font-medium text-foreground">{f.codigo}</span></span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>Retirado em: <span className="font-medium text-foreground">{formatDate(f.data_retirada)}</span></span>
                          </div>
                          {f.observacoes && (
                            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <Package className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="text-foreground/70">{f.observacoes}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <Badge className="shrink-0 bg-warning/10 text-warning border-warning/20 text-[10px]">
                        Em uso
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
