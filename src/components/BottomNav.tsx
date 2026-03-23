import { LayoutDashboard, Package, ArrowDownToLine, ArrowUpFromLine, Wrench, Users } from 'lucide-react';
import { motion } from 'framer-motion';

const tabs = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'produtos', label: 'Produtos', icon: Package },
  { value: 'entradas', label: 'Entradas', icon: ArrowDownToLine },
  { value: 'saidas', label: 'Saídas', icon: ArrowUpFromLine },
  { value: 'ferramentas', label: 'Ferramentas', icon: Wrench },
  { value: 'pessoas', label: 'Pessoas', icon: Users },
];

interface BottomNavProps {
  active: string;
  onChange: (tab: string) => void;
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="grid grid-cols-6 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => onChange(tab.value)}
              className="relative flex flex-col items-center py-2 px-1 transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] mt-0.5 transition-colors ${isActive ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
