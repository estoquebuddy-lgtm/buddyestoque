import { useState } from 'react';
import { Plus, Package, ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FABProps {
  onAction: (action: 'produto' | 'entrada' | 'saida') => void;
}

const actions = [
  { key: 'saida' as const, label: 'Nova Saída', icon: ArrowUpFromLine, color: 'bg-destructive text-destructive-foreground' },
  { key: 'entrada' as const, label: 'Nova Entrada', icon: ArrowDownToLine, color: 'bg-success text-success-foreground' },
  { key: 'produto' as const, label: 'Novo Produto', icon: Package, color: 'bg-primary text-primary-foreground' },
];

export default function FAB({ onAction }: FABProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 z-40"
              onClick={() => setOpen(false)}
            />
            {actions.map((action, i) => (
              <motion.button
                key={action.key}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                transition={{ delay: i * 0.05 }}
                className={`z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg ${action.color} text-sm font-medium`}
                onClick={() => { onAction(action.key); setOpen(false); }}
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </motion.button>
            ))}
          </>
        )}
      </AnimatePresence>
      <motion.button
        className="z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        onClick={() => setOpen(!open)}
        animate={{ rotate: open ? 45 : 0 }}
        whileTap={{ scale: 0.9 }}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </motion.button>
    </div>
  );
}
