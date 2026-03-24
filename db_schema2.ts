import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_schema' as any).catch(() => ({}));
  
  // if rpc fails, try selecting 1 row
  const res = await supabase.from('importacoes_xml').select('*').limit(1);
  console.log("Cols:", res.data ? Object.keys(res.data[0] || {}) : res.error);
}
check();
