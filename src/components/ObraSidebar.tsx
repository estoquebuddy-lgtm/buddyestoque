import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wrench,
  Users,
  Users2,
  FileBarChart,
  ArrowLeft,
  ChevronLeft,
  ListTodo,
  MessageSquarePlus,
  DollarSign
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const menuItems = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'produtos', label: 'Estoque', icon: Package },
  { value: 'entradas', label: 'Entradas', icon: ArrowDownToLine },
  { value: 'saidas', label: 'Saídas', icon: ArrowUpFromLine },
  { value: 'ferramentas', label: 'Ferramentas', icon: Wrench },
  { value: 'ferramentas-funcionario', label: 'Ferr. por Funcionário', icon: Users2 },
  { value: 'solicitacoes', label: 'Solicitações', icon: MessageSquarePlus },
  { value: 'relatorios', label: 'Relatórios', icon: FileBarChart },
  { value: 'atividades', label: 'Atividades', icon: ListTodo },
  { value: 'pessoas', label: 'Equipe', icon: Users },
  { value: 'financeiro', label: 'Financeiro', icon: DollarSign },
];

interface ObraSidebarProps {
  obraNome: string;
  obraEndereco?: string | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';

export default function ObraSidebar({ obraNome, obraEndereco, activeTab, onTabChange }: ObraSidebarProps) {
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const { isAdmin } = useProfile();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="space-y-1 relative">
            <button
              onClick={() => navigate('/obras')}
              className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors mb-2"
            >
              <ChevronLeft className="h-3 w-3" />
              Voltar para obras
            </button>
            <button 
              onClick={toggleSidebar}
              className="absolute right-0 top-0 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors p-1 rounded-md"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <h2 className="font-display font-bold text-sm text-sidebar-foreground truncate pr-6">{obraNome}</h2>
            {obraEndereco && (
              <p className="text-xs text-sidebar-foreground/50 truncate">{obraEndereco}</p>
            )}
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col gap-4 items-center justify-center">
            <button
              onClick={() => navigate('/obras')}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={toggleSidebar}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarHeader>

      <Separator className="bg-sidebar-border" />

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                if (item.value === 'atividades' && !isAdmin) return null;
                const isActive = activeTab === item.value;
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      onClick={() => onTabChange(item.value)}
                      isActive={isActive}
                      tooltip={item.label}
                      className="h-10"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/30 text-center">ESTOQUE BUDDY</p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
