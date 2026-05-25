import { useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Wrench, MessageSquarePlus } from 'lucide-react';
import RelatorioFerramentasTab from './RelatorioFerramentasTab';
import RelatorioSolicitacoesTab from './RelatorioSolicitacoesTab';

export default function RelatoriosTab({ obraId }: { obraId: string }) {
  const [activeTab, setActiveTab] = useState<'ferramentas' | 'solicitacoes'>('ferramentas');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Central de Relatórios */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="lg:hidden -ml-1" />
          <div>
            <h1 className="text-xl lg:text-2xl font-display font-bold text-slate-800">Central de Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-1">Consulte histórico e baixe relatórios em PDF/Excel</p>
          </div>
        </div>
        
        {/* Navigation Tabs (Top Level) */}
        <div className="bg-muted/50 p-1 rounded-xl flex gap-1 self-stretch sm:self-auto w-full sm:w-auto border border-border/50">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('ferramentas')}
            className={`rounded-lg h-10 font-semibold text-xs px-5 flex-1 sm:flex-none transition-all ${activeTab === 'ferramentas' ? 'bg-white text-primary shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Wrench className="h-4 w-4 mr-2" />
            Ferramentas
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('solicitacoes')}
            className={`rounded-lg h-10 font-semibold text-xs px-5 flex-1 sm:flex-none transition-all ${activeTab === 'solicitacoes' ? 'bg-white text-primary shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Solicitações
          </Button>
        </div>
      </div>

      {/* Render Active Tab Component */}
      {activeTab === 'ferramentas' ? (
        <RelatorioFerramentasTab obraId={obraId} />
      ) : (
        <RelatorioSolicitacoesTab obraId={obraId} />
      )}
    </div>
  );
}
