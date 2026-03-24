import { supabase } from './src/integrations/supabase/client';

async function check() {
  const { data, error } = await supabase.from('importacoes_xml').select('*').limit(1);
  console.log("importacoes_xml:", data);
}

check();
