import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function check() {
  const envStr = fs.readFileSync('.env', 'utf8');
  let url = '', key = '';
  envStr.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
    if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
  });
  
  const supabase = createClient(url, key);
  
  const { data: prods } = await supabase.from('produtos').select('id, nome, estoque_atual, obra_id').ilike('nome', '%BICO%');
  console.log('Produtos:', prods);
  
  if (prods && prods.length > 0) {
    for (const prod of prods) {
      const { data: entradas } = await supabase.from('entradas').select('quantidade').eq('produto_id', prod.id).or('status_entrega.is.null,status_entrega.eq.REALIZADO');
      
      const realStock = (entradas || []).reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
      console.log('Real stock should be:', realStock, 'for', prod.id);
      
      await supabase.from('produtos').update({ estoque_atual: realStock }).eq('id', prod.id);
      console.log('Updated to', realStock);
    }
  }
}
check();
