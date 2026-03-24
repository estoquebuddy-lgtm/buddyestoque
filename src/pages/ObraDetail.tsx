import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SidebarProvider } from '@/components/ui/sidebar';
import ObraSidebar from '@/components/ObraSidebar';
import DashboardTab from '@/components/obra/DashboardTab';
import ProdutosTab from '@/components/obra/ProdutosTab';
import FerramentasTab from '@/components/obra/FerramentasTab';
import RelatorioFerramentasTab from '@/components/obra/RelatorioFerramentasTab';
import EntradasTab from '@/components/obra/EntradasTab';
import SaidasTab from '@/components/obra/SaidasTab';
import PessoasTab from '@/components/obra/PessoasTab';
import SkeletonList from '@/components/SkeletonList';

export default function ObraDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data: obra, isLoading } = useQuery({
    queryKey: ['obra', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('obras').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-2xl px-4"><SkeletonList /></div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Obra não encontrada
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ObraSidebar
          obraNome={obra.nome}
          obraEndereco={obra.endereco}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <main className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-4 lg:p-8">
            {activeTab === 'dashboard' && <DashboardTab obraId={id!} />}
            {activeTab === 'produtos' && <ProdutosTab obraId={id!} />}
            {activeTab === 'ferramentas' && <FerramentasTab obraId={id!} />}
            {activeTab === 'relatorio-ferramentas' && <RelatorioFerramentasTab obraId={id!} />}
            {activeTab === 'entradas' && <EntradasTab obraId={id!} />}
            {activeTab === 'saidas' && <SaidasTab obraId={id!} />}
            {activeTab === 'pessoas' && <PessoasTab obraId={id!} />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
