import { useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Clock, ShieldAlert, Building2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface Solicitacao {
  id: string;
  descricao_materiais: string;
  urgencia: string;
  data_solicitacao: string;
  obra_id: string;
  solicitante?: { nome: string } | null;
  obra?: { nome: string } | null;
}

interface NotificationPanelProps {
  solicitacoes: Solicitacao[];
}

export default function NotificationPanel({ solicitacoes }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const total = solicitacoes.length;

  if (total === 0) return null;

  const urgenciaColor = (u: string) => {
    switch (u) {
      case 'Urgente': return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'Alta': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'Normal': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      default: return 'bg-muted/30 text-muted-foreground border-muted/30';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-0">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 bg-warning/10 border border-warning/25 rounded-2xl px-5 py-3.5 hover:bg-warning/15 transition-all duration-200 group"
      >
        <span className="relative">
          <Bell className="h-5 w-5 text-warning" />
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center leading-none">
            {total}
          </span>
        </span>
        <span className="flex-1 text-left">
          <span className="text-sm font-bold text-warning">
            {total === 1
              ? '1 solicitação pendente para você'
              : `${total} solicitações pendentes para você`}
          </span>
          <span className="block text-xs text-warning/60 font-normal">
            Clique para ver os detalhes
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-warning/70 group-hover:text-warning transition-colors" />
        ) : (
          <ChevronDown className="h-4 w-4 text-warning/70 group-hover:text-warning transition-colors" />
        )}
      </button>

      {/* Expandable list */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 pb-2">
              {solicitacoes.map((s) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Urgência indicator */}
                  <div className="mt-0.5 shrink-0">
                    <ShieldAlert
                      className={`h-4 w-4 ${
                        s.urgencia === 'Urgente'
                          ? 'text-red-400'
                          : s.urgencia === 'Alta'
                          ? 'text-orange-400'
                          : 'text-blue-400'
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold text-foreground">
                        {s.solicitante?.nome || 'Alguém'}
                      </span>
                      <span className="text-xs text-muted-foreground">solicitou:</span>
                      <Badge className={`text-[10px] font-bold border ${urgenciaColor(s.urgencia)}`}>
                        {s.urgencia}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {s.descricao_materiais}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[140px]">{s.obra?.nome || 'Obra'}</span>
                        <span className="mx-1">•</span>
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>
                          {new Date(s.data_solicitacao).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-primary hover:text-primary font-bold px-2 gap-1"
                        onClick={() => navigate(`/obra/${s.obra_id}?tab=solicitacoes`)}
                      >
                        Ver <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
