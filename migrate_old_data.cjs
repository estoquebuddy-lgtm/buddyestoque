const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Erro: Credenciais do Supabase não encontradas no arquivo .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseRateio(obs) {
  if (!obs || typeof obs !== 'string') return [];
  const match = obs.match(/\[RATEIO:\s*(\{[\s\S]*?\})\]/);
  if (!match) return [];
  try {
    const map = JSON.parse(match[1]);
    return Object.entries(map).map(([k, v]) => ({
      ccId: parseInt(k),
      pct: parseFloat(v)
    }));
  } catch (e) {
    return [];
  }
}

function cleanObs(obs) {
  if (!obs || typeof obs !== 'string') return '';
  return obs.replace(/\[RATEIO:\s*\{[\s\S]*?\}\]/g, '').trim();
}

function encodeRateio(obs, splits) {
  const cleaned = cleanObs(obs);
  if (!splits || splits.length === 0) return cleaned;
  const map = {};
  splits.forEach(s => {
    map[s.ccId] = s.pct;
  });
  const tag = `[RATEIO: ${JSON.stringify(map)}]`;
  return cleaned ? `${cleaned} ${tag}` : tag;
}

async function migrateCompras() {
  console.log("\n====== 1. Migração de Pagamentos Antigos (Compras) ======");
  
  // Buscar todas as compras
  const { data: compras, error: fetchError } = await supabase
    .from('compras')
    .select('id, centro_custo');
    
  if (fetchError) {
    console.error("❌ Falha ao buscar lançamentos de compras:", fetchError);
    return;
  }
  
  console.log(`Foram encontradas ${compras.length} compras no banco.`);
  let updatedCount = 0;
  
  for (const c of compras) {
    if (!c.centro_custo || c.centro_custo === 0) {
      console.log(`- Compra #${c.id}: centro_custo nulo ou 0. Definindo para 31 (Não previsto)...`);
      const { error: updateError } = await supabase
        .from('compras')
        .update({ centro_custo: 31 })
        .eq('id', c.id);
        
      if (updateError) {
        console.error(`  ❌ Erro ao atualizar Compra #${c.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }
  }
  
  console.log(`🎉 Sucesso: ${updatedCount} compras antigas atualizadas com Centro de Custo padrão.`);
}

async function migrateEntradas() {
  console.log("\n====== 2. Migração de Entradas de Estoque Antigas ======");
  
  // Buscar todas as compras para criar um mapa rápido ID -> centro_custo / rateio
  const { data: compras, error: comprasErr } = await supabase
    .from('compras')
    .select('id, centro_custo, obs');
    
  if (comprasErr) {
    console.error("❌ Falha ao buscar compras para mapeamento:", comprasErr);
    return;
  }
  
  const comprasMap = new Map();
  compras.forEach(c => {
    comprasMap.set(c.id, c);
  });
  
  // Buscar todas as entradas
  const { data: entries, error: entriesError } = await supabase
    .from('entradas')
    .select('*');
    
  if (entriesError) {
    console.error("❌ Falha ao buscar entradas:", entriesError);
    return;
  }
  
  console.log(`Foram encontradas ${entries.length} entradas no banco.`);
  let migratedCount = 0;
  
  for (const entry of entries) {
    const existingSplits = parseRateio(entry.observacao);
    
    // Se a entrada já possui tag de rateio/centro de custo, pula ela
    if (existingSplits.length > 0) {
      console.log(`- Entrada #${entry.id}: Já possui centro de custo associado. Pulando.`);
      continue;
    }
    
    let targetSplits = [];
    
    // Caso A: A entrada é vinculada a um lançamento de compra
    if (entry.compra_id) {
      const compra = comprasMap.get(entry.compra_id);
      if (compra) {
        const compraSplits = parseRateio(compra.obs);
        if (compraSplits.length > 0) {
          // Copia o rateio detalhado da compra
          targetSplits = compraSplits;
          console.log(`- Entrada #${entry.id}: Copiando rateio detalhado da compra #${entry.compra_id}.`);
        } else {
          // Copia o centro de custo único da compra
          const cc = (compra.centro_custo && compra.centro_custo !== 0) ? compra.centro_custo : 31;
          targetSplits = [{ ccId: cc, pct: 100 }];
          console.log(`- Entrada #${entry.id}: Copiando centro de custo único (${cc}) da compra #${entry.compra_id}.`);
        }
      }
    }
    
    // Caso B: Entrada avulsa (sem compra) ou compra não encontrada
    if (targetSplits.length === 0) {
      // Associa ao centro padrão (31. NÃO PREVISTO EM ORÇAMENTO)
      targetSplits = [{ ccId: 31, pct: 100 }];
      console.log(`- Entrada #${entry.id}: Entrada avulsa ou compra não encontrada. Associando ao centro 31.`);
    }
    
    // Atualiza a observação no banco
    const newObs = encodeRateio(entry.observacao || '', targetSplits);
    
    const { error: updateError } = await supabase
      .from('entradas')
      .update({ observacao: newObs })
      .eq('id', entry.id);
      
    if (updateError) {
      console.error(`❌ Erro ao atualizar entrada #${entry.id}:`, updateError);
    } else {
      migratedCount++;
    }
  }
  
  console.log(`🎉 Sucesso: ${migratedCount} entradas antigas migradas e atualizadas.`);
}

async function run() {
  console.log("🚀 Iniciando Migração Geral do Banco de Dados para Centro de Custo...");
  await migrateCompras();
  await migrateEntradas();
  console.log("\n🌟 Concluído!");
}

run();
