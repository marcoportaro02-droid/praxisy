// Praxisy AI Upgrades — Incolla questo dentro il tag <script> del tuo index.html
// SOSTITUISCE la funzione callClaude esistente con una versione più intelligente

/* ═══════════════════════════════════════
   AI UPGRADE 1 — Cache risposte AI
   Evita chiamate duplicate per le stesse domande
═══════════════════════════════════════ */
const aiCache = new Map();

async function callClaude(messages, system = '', maxTokens = 1000) {
  // Crea chiave cache dalla ultima domanda
  const lastMsg = messages[messages.length - 1]?.content || '';
  const cacheKey = system.slice(0, 50) + '|' + lastMsg.slice(0, 100);

  // Controlla cache (valida 5 minuti)
  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    if (Date.now() - cached.ts < 300000) {
      return cached.text;
    }
  }

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const text = data.content?.map(b => b.text || '').join('') || '';

  // Salva in cache
  aiCache.set(cacheKey, { text, ts: Date.now() });
  return text;
}

/* ═══════════════════════════════════════
   AI UPGRADE 2 — Analisi sentiment proposte
   Analizza automaticamente il tono dei commenti
═══════════════════════════════════════ */
async function analizzaSentiment(testo) {
  const prompt = `Analizza il sentiment di questo commento su una proposta civica italiana. Rispondi SOLO con un JSON: {"sentiment":"positivo|negativo|neutro","score":0.0-1.0,"emoji":"😊|😐|😠"}. Testo: "${testo}"`;
  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], '', 100);
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return { sentiment: 'neutro', score: 0.5, emoji: '😐' };
  }
}

/* ═══════════════════════════════════════
   AI UPGRADE 3 — Riassunto automatico proposte
   Genera riassunto AI quando ci sono troppi commenti
═══════════════════════════════════════ */
async function riassuntiCommenti(proposta, commenti) {
  if (commenti.length < 5) return null;
  const testi = commenti.map(c => `- ${c.autore_nome}: ${c.testo}`).join('\n');
  const prompt = `Riassumi in 2 frasi i commenti su questa proposta civica: "${proposta}"\n\nCommenti:\n${testi}\n\nRispondi in italiano, max 40 parole.`;
  return await callClaude([{ role: 'user', content: prompt }], '', 150);
}

/* ═══════════════════════════════════════
   AI UPGRADE 4 — Suggerimenti smart per nuove proposte
   Mentre l'utente scrive, suggerisce miglioramenti
═══════════════════════════════════════ */
let suggestTimeout = null;
async function suggerisciProposta(titolo, comune) {
  if (!titolo || titolo.length < 15) return;
  clearTimeout(suggestTimeout);
  suggestTimeout = setTimeout(async () => {
    const prompt = `Un cittadino di ${comune} sta scrivendo questa proposta civica: "${titolo}". Suggerisci in 1 frase come migliorarla o renderla più concreta. Max 25 parole. Inizia con "💡 Suggerimento: "`;
    try {
      const sugg = await callClaude([{ role: 'user', content: prompt }], '', 100);
      const el = document.getElementById('prop-ai-suggestion');
      if (el) { el.textContent = sugg; el.style.display = 'block'; }
    } catch (e) {}
  }, 1500);
}

/* ═══════════════════════════════════════
   AI UPGRADE 5 — Prioritizzazione intelligente
   Ricalcola priorità usando AI ogni volta che cambiano i voti
═══════════════════════════════════════ */
async function ricalcolaPriorita(comune, proposte) {
  if (!proposte || proposte.length === 0) return;
  const lista = proposte.slice(0, 10).map(p => `- "${p.titolo}" (${p.voti_su} voti, cat: ${p.categoria})`).join('\n');
  const prompt = `Sei un esperto di governance locale. Queste sono le proposte attive per ${comune}:\n${lista}\n\nAssegna a ciascuna un punteggio di priorità da 1-10 considerando: urgenza, impatto sulla comunità, fattibilità. Rispondi SOLO con JSON array: [{"titolo":"...","score":X.X,"motivo":"max 8 parole"}]. Ordina dal più al meno prioritario.`;
  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], '', 600);
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

/* ═══════════════════════════════════════
   AI UPGRADE 6 — Chat con memoria migliorata
   Mantiene contesto della città e aggiorna dinamicamente
═══════════════════════════════════════ */
function buildSmartSystem(comune, proposteCount, segnalazioniCount) {
  const c = window.selectedComune || {};
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `Sei Claude, assistente AI di Praxisy per la governance civica italiana.
Data oggi: ${oggi}
Comune attivo: ${comune}, ${c.p?.toLocaleString('it') || '—'} abitanti, ${c.reg || '—'}
Bilancio stimato: €${c.budget ? Math.round(c.budget/1e6) : '—'}M
Proposte attive: ${proposteCount} | Segnalazioni aperte: ${segnalazioniCount}
Priorità civiche: ${(c.priorita || []).slice(0,3).map(p => p.name).join(', ') || 'strade, verde, digitale'}
Fonti dati: ISTAT 2024, MEF-DPF, OpenCoesione, Corte dei Conti

ISTRUZIONI:
- Rispondi SEMPRE in italiano
- Sii conciso e pratico (max 150 parole per risposta generale)
- Per delibere: includi riferimenti normativi reali (D.Lgs. 267/2000)
- Per bandi: cita fonti reali (PNRR, Regione, UE)
- Usa <strong> per evidenziare max 3 dati chiave per risposta
- Se non conosci un dato specifico, dillo chiaramente`;
}

/* ═══════════════════════════════════════
   AI UPGRADE 7 — Generatore bandi PNRR
   Trova bandi compatibili con il profilo del comune
═══════════════════════════════════════ */
async function trovaBandiPNRR(comune, budget, caratteristiche) {
  const prompt = `Trova i 3 bandi PNRR o regionali più adatti per ${comune} (budget €${Math.round(budget/1e6)}M, caratteristiche: ${caratteristiche}). Per ciascuno: nome bando, importo massimo, scadenza stimata, requisiti principali. SOLO JSON array: [{"nome":"...","importo":"€XM","scadenza":"...","requisiti":"...","url_info":"..."}]`;
  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], '', 800);
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

// Esporta per uso globale
window.callClaude = callClaude;
window.analizzaSentiment = analizzaSentiment;
window.riassuntiCommenti = riassuntiCommenti;
window.suggerisciProposta = suggerisciProposta;
window.ricalcolaPriorita = ricalcolaPriorita;
window.buildSmartSystem = buildSmartSystem;
window.trovaBandiPNRR = trovaBandiPNRR;
