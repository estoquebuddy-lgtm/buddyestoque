import { useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Wrench, MessageSquarePlus, DollarSign, Store } from 'lucide-react';
import RelatorioFerramentasTab from './RelatorioFerramentasTab';
import RelatorioSolicitacoesTab from './RelatorioSolicitacoesTab';
import FinanceiroTab from './FinanceiroTab';
import RelatorioEntradasTab from './RelatorioEntradasTab';
import RelatorioSaidasTab from './RelatorioSaidasTab';
import RelatorioFornecedorTab from './RelatorioFornecedorTab';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

export default function RelatoriosTab({ obraId }: { obraId: string }) {
  const [activeTab, setActiveTab] = useState<'ferramentas' | 'solicitacoes' | 'financeiro' | 'entradas' | 'saidas' | 'fornecedor'>('financeiro');

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
            onClick={() => setActiveTab('financeiro')}
            className={`rounded-lg h-10 font-semibold text-xs px-5 flex-1 sm:flex-none transition-all ${activeTab === 'financeiro' ? 'bg-white text-primary shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Financeiro Geral
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('entradas')}
            className={`rounded-lg h-10 font-semibold text-xs px-5 flex-1 sm:flex-none transition-all ${activeTab === 'entradas' ? 'bg-white text-primary shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Entradas (Mensal)
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('saidas')}
            className={`rounded-lg h-10 font-semibold text-xs px-5 flex-1 sm:flex-none transition-all ${activeTab === 'saidas' ? 'bg-white text-primary shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ArrowUpFromLine className="h-4 w-4 mr-2" />
            Saídas (Mensal)
          </Button>
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
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('fornecedor')}
            className={`rounded-lg h-10 font-semibold text-xs px-5 flex-1 sm:flex-none transition-all ${activeTab === 'fornecedor' ? 'bg-white text-primary shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Store className="h-4 w-4 mr-2" />
            Por Fornecedor
          </Button>
        </div>
      </div>

      {/* Render Active Tab Component */}
      {activeTab === 'financeiro' && <FinanceiroTab obraId={obraId} />}
      {activeTab === 'entradas' && <RelatorioEntradasTab obraId={obraId} />}
      {activeTab === 'saidas' && <RelatorioSaidasTab obraId={obraId} />}
      {activeTab === 'ferramentas' && <RelatorioFerramentasTab obraId={obraId} />}
      {activeTab === 'solicitacoes' && <RelatorioSolicitacoesTab obraId={obraId} />}
      {activeTab === 'fornecedor' && <RelatorioFornecedorTab obraId={obraId} />}
    </div>
  );
}
