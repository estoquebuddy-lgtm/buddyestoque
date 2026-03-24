import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wrench,
  Users,
  FileBarChart,
  ArrowLeft,
  ChevronLeft,
  FileCode2,
  ListTodo
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
  { value: 'relatorio-ferramentas', label: 'Relatórios', icon: FileBarChart },
  { value: 'xml', label: 'Compras XML', icon: FileCode2 },
  { value: 'atividades', label: 'Atividades', icon: ListTodo },
  { value: 'pessoas', label: 'Equipe', icon: Users },
];

interface ObraSidebarProps {
  obraNome: string;
  obraEndereco?: string | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function ObraSidebar({ obraNome, obraEndereco, activeTab, onTabChange }: ObraSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="space-y-1">
            <button
              onClick={() => navigate('/obras')}
              className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors mb-2"
            >
              <ChevronLeft className="h-3 w-3" />
              Voltar para obras
            </button>
            <h2 className="font-display font-bold text-sm text-sidebar-foreground truncate">{obraNome}</h2>
            {obraEndereco && (
              <p className="text-xs text-sidebar-foreground/50 truncate">{obraEndereco}</p>
            )}
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => navigate('/obras')}
            className="flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
      </SidebarHeader>

      <Separator className="bg-sidebar-border" />

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
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
